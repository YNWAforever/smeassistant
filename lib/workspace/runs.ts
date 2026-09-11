import {
  actionRunRepository,
  type ArtifactRepository,
  type ActionRunRepository,
} from "@/lib/repositories/artifacts";
import { assetRepository } from "@/lib/repositories/assets";
import { assetLocationScope, assetUsableByAction } from "@/lib/workspace/assets";
import { inLocationScope, roleAtLeast, type Membership } from "@/lib/auth";
import {
  AGENTS,
  AGENT_LLM_OPTIONS,
  computeCostUsd,
  isAgentKey,
  parseAgentOutput,
  type AgentContext,
  type AgentKey,
  type AgentOutput,
} from "@/lib/agents";
import { localized } from "@/lib/domain";
import { llmComplete, type LLMUsage } from "@/lib/llm";
import { filterSelectedReviews, sampledReviewsFromRawData } from "./evidence-inputs";
import { buildActionOverview, localeOf } from "./overview";
import { type SnapshotRecord } from "./snapshots";
import { templateByKey, type TemplateKey } from "./templates";

/**
 * One agent run for one action (CLAUDE.md §3.7 runtime, §3.2.3 POST
 * /api/actions/[id]/run). Routes supply verified membership; this module
 * resolves and checks persisted action/evidence scope before effects, runs
 * the agent with one retry, and persists the
 * `action_runs` transitions and token usage, and applies the needs_input /
 * version rules. Generation never touches `workspace_usage`, and a failed run
 * never overwrites an existing draft (a version is only created on success).
 */
export type RunErrorCode =
  "action_not_found" | "agent_unavailable" | "forbidden";

export class RunError extends Error {
  constructor(public readonly code: RunErrorCode) {
    super(code);
    this.name = "RunError";
  }
}

export interface RunAgentInput {
  actionId: string;
  actorId: string;
  membership: Membership;
  persistence?: ActionRunRepository;
  assets?: Pick<ReturnType<typeof assetRepository>, "get">;
  agentKey?: string | null;
  inputs?: Record<string, unknown> | null;
  locale: string;
  llm?: typeof llmComplete;
  now?: Date;
  ipHash?: string | null;
}

export interface RunAgentResult {
  runId: string;
  state: "succeeded" | "failed";
  versionId?: string;
  versionNo?: number;
  factsNeeded?: string[];
  error?: string;
}

/**
 * Inline agent-run budget, reconciled with the calling route's
 * `export const maxDuration` (60 s for /api/actions/[actionId]/run and
 * /api/actions). ROUTE_MAX_DURATION_MS is the platform's hard ceiling; the
 * agent may use everything except a reserve for persisting the terminal state,
 * because a run that gets killed before persistence.finish() is stranded at
 * 'running' with no reaper to clear it. MIN_ATTEMPT_MS stops us starting an
 * attempt so short it could only ever time out.
 */
export const ROUTE_MAX_DURATION_MS = 60_000;
export const FINALIZE_RESERVE_MS = 5_000;
export const MIN_ATTEMPT_MS = 8_000;
export const MAX_AGENT_ATTEMPTS = 2;
export const AGENT_RUN_BUDGET_MS = ROUTE_MAX_DURATION_MS - FINALIZE_RESERVE_MS;

const FRIENDLY_ERROR = localized(
  "The draft could not be generated this time. Your existing draft is unchanged — please try again in a moment.",
  "今次未能產生草稿，現有草稿沒有改動，請稍後再試。",
  "這次無法產生草稿，現有草稿未變動，請稍後再試。",
);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * The action's own template decides which agent may run on it. A requested
 * agentKey is only ever accepted as confirmation of that template's agent --
 * previously any *registered* key was accepted, so a client could ask for,
 * say, menu_translation on a review-response action and the server would run
 * it, because isAgentKey() only checks membership of the global registry
 * (lib/agents/index.ts) and never compares against the template.
 */
function resolveAgentKey(
  requested: string | null | undefined,
  templateAgent: string | null,
): AgentKey {
  if (!templateAgent || !isAgentKey(templateAgent))
    throw new RunError("agent_unavailable");
  if (requested !== undefined && requested !== null && requested !== "" && requested !== templateAgent) {
    throw new RunError("agent_unavailable");
  }
  return templateAgent;
}

function addUsage(total: LLMUsage, next: LLMUsage | undefined): LLMUsage {
  if (!next) return total;
  const add = (a: number | null, b: number | null) =>
    a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  return {
    inputTokens: add(total.inputTokens, next.inputTokens),
    outputTokens: add(total.outputTokens, next.outputTokens),
  };
}

/**
 * Moved to lib/workspace/evidence-inputs.ts so the detail page, the action
 * derivation and the agent all read the same bytes. Re-exported here because
 * this is the name existing callers import.
 */
export { sampledReviewsFromRawData };

export function snapshotEvidence(
  snapshot: SnapshotRecord | null,
): Record<string, unknown> {
  if (!snapshot) return { snapshot: null };
  return {
    snapshot: {
      observed_at: snapshot.observedAt,
      overall_score: snapshot.overallScore,
      coverage: snapshot.coverage,
      module_states: snapshot.moduleStates,
      metrics: snapshot.metrics,
      website_checks: snapshot.websiteChecks
        ? {
            evaluated: snapshot.websiteChecks.evaluated,
            passed: snapshot.websiteChecks.passed,
            // P2.2 item 10: the failing KEYS alone cannot ground a draft. Each
            // result already carries what was observed -- "57 chars", "2 h1",
            // the host -- and that is what lets `website_basics` write
            // current -> suggested and give the next scan something to
            // re-check per item. Passing checks travel too: the agent rewrites
            // the title whether or not a title currently exists.
            results: snapshot.websiteChecks.results.map((r) =>
              r.detail === undefined
                ? { key: r.key, pass: r.pass }
                : { key: r.key, pass: r.pass, observed: r.detail },
            ),
          }
        : null,
    },
  };
}

/**
 * `social_post` needs an approved asset or an explicit text-only decision
 * (Phase 4 item 4). Exported because the live assistant drafts the same agent
 * down a different path and must apply the identical rule -- when it did not,
 * the prompt told the model "an approved photo is attached" with alt text
 * "(not provided)" and invited it to describe a photo that did not exist.
 */
export async function socialAssetSatisfied(
  assets: Pick<ReturnType<typeof assetRepository>, "get">,
  workspaceId: string,
  provided: Record<string, unknown>,
  scope: { actionLocationId: string | null; locationScope: readonly string[] | null },
): Promise<boolean> {
  if (provided.text_only === true) return true;
  const assetId =
    typeof provided.asset_id === "string" ? provided.asset_id : null;
  if (!assetId) return false;
  const asset = await assets.get(workspaceId, assetId);
  if (asset?.rights_status !== "approved") return false;
  // Approved is not the whole rule: an id posted straight to the run route
  // could name another location's photo, or one an out-of-scope manager
  // cannot see. The picker applies the same predicate, but the picker is not
  // the authority (guardrail 9).
  return assetUsableByAction(asset, scope.actionLocationId, scope.locationScope);
}

/** Resolve persisted scope and evidence before any input, run, or model effect. */
export async function resolveActionRunContext(
  db: ArtifactRepository,
  actionId: string,
  membership: Membership,
  actorId = membership?.userId,
) {
  if (
    !membership ||
    membership.userId !== actorId ||
    !roleAtLeast(membership.role, "manager")
  )
    throw new RunError("forbidden");
  const scope = await db.actionScope(actionId);
  if (!scope) throw new RunError("action_not_found");
  if (
    scope.workspaceId !== membership.workspaceId ||
    !inLocationScope(membership, scope.locationId)
  )
    throw new RunError("forbidden");
  const row = (
    await db.assistantActions(scope.workspaceId, { ids: [actionId] })
  )[0];
  if (
    !row ||
    row.id !== actionId ||
    row.workspace_id !== scope.workspaceId ||
    row.location_id !== scope.locationId
  )
    throw new RunError("action_not_found");
  const snapshot = row.source_snapshot_id
    ? await db.assistantSnapshot(scope.workspaceId, row.source_snapshot_id)
    : await db.assistantLatestSnapshot(scope.workspaceId, scope.locationId);
  if (
    row.source_snapshot_id &&
    (!snapshot || snapshot.id !== row.source_snapshot_id)
  )
    throw new RunError("action_not_found");
  if (
    snapshot &&
    (snapshot.workspaceId !== scope.workspaceId ||
      (scope.locationId && snapshot.locationId !== scope.locationId))
  )
    throw new RunError("action_not_found");
  if (snapshot && !inLocationScope(membership, snapshot.locationId))
    throw new RunError("forbidden");
  return { row, snapshot, scope };
}

export async function runAgentForAction(
  db: ArtifactRepository,
  input: RunAgentInput,
): Promise<RunAgentResult> {
  const now = input.now ?? new Date(),
    llm = input.llm ?? llmComplete,
    locale = localeOf(input.locale);
  const { row, snapshot } = await resolveActionRunContext(
    db,
    input.actionId,
    input.membership,
    input.actorId,
  );
  let template;
  try {
    template = templateByKey(row.template_key as TemplateKey);
  } catch {
    throw new RunError("agent_unavailable");
  }
  const agentKey = resolveAgentKey(input.agentKey, template.agentKey),
    agent = AGENTS[agentKey];
  const provided = { ...asRecord(row.provided_inputs), ...input.inputs };
  const [workspace, brand, locations] = await Promise.all([
    db.assistantWorkspace(row.workspace_id),
    db.assistantBrand(row.workspace_id),
    db.assistantLocations(row.workspace_id),
  ]);
  const location = locations.find((l) => l.id === row.location_id) ?? null;
  // P2.2 requires "selected-review replies": the owner picks which unanswered
  // reviews to answer. `provided_inputs.selected_reviews` carries only KEYS --
  // the review text is still rebuilt from stored evidence here, so the choice
  // can narrow the sample but never widen or replace it.
  const sampledReviews =
    agentKey === "review_reply" && snapshot
      ? filterSelectedReviews(
          sampledReviewsFromRawData(
            await db.assistantReviewData(row.workspace_id, snapshot.jobId),
          ),
          provided.selected_reviews,
        )
      : undefined;
  const ctx: AgentContext = {
    locale,
    market: workspace?.market?.toLowerCase() === "tw" ? "tw" : "hk",
    brand: {
      voice: brand?.voice ?? "warm",
      approvedClaims: asStrings(brand?.approved_claims),
      prohibitedTerms: asStrings(brand?.prohibited_terms),
      languages: asStrings(brand?.languages),
      facts: asRecord(brand?.facts),
    },
    location: {
      name: location?.name ?? workspace?.business_name ?? "Workspace",
      address: location?.address ?? null,
      district: location?.district ?? null,
    },
    action: buildActionOverview(
      { ...row, provided_inputs: provided },
      {
        location: location
          ? {
              id: location.id,
              slug: location.slug,
              name: localized(location.name, location.name),
            }
          : null,
        latestRun: null,
        latestVersion: null,
      },
    ),
    evidence: snapshotEvidence(snapshot),
    providedInputs: provided,
    sampledReviews,
  };

  const persistence = input.persistence ?? actionRunRepository();
  const runId = await persistence.queue({
    actionId: row.id,
    actorId: input.actorId,
    agentKey,
    input: {
      agent_key: agentKey,
      provided_inputs: provided,
      snapshot_id: snapshot?.id ?? null,
      prompt_version: agent.promptVersion,
      locale,
    },
    promptVersion: agent.promptVersion,
    model: process.env.LLM_MODEL || null,
    now,
    ...(input.inputs && Object.keys(input.inputs).length
      ? { providedInputs: provided }
      : {}),
  });
  const attribution = {
    runId,
    actorId: input.actorId,
    locale,
    ipHash: input.ipHash,
  };
  await persistence.start(attribution);
  let usage: LLMUsage = { inputTokens: null, outputTokens: null };
  if (
    agentKey === "social_post" &&
    !(await socialAssetSatisfied(
      input.assets ?? assetRepository(),
      row.workspace_id,
      provided,
      { actionLocationId: row.location_id, locationScope: assetLocationScope(input.membership) },
    ))
  ) {
    return persistence.finish({
      ...attribution,
      usage,
      costUsd: computeCostUsd(usage),
      output: null,
      factsNeeded: ["asset_or_text_only"],
      finishedAt: new Date(),
    });
  }
  let output: AgentOutput | null = null,
    reason: string | undefined;
  try {
    const prompt = agent.buildPrompt(ctx);
    // The route runs this inline under maxDuration=60, so the old fixed
    // "two attempts, 45 s each" loop could ask for 90 s of model time inside a
    // 60 s function: the platform killed the handler mid-second-attempt and
    // persistence.finish() never ran, leaving the action_run stranded at
    // 'running' forever (nothing writes the 'timed_out' state). Attempts are
    // now bounded by what is actually left of the budget, and finalization
    // time is reserved so the terminal state is always recorded.
    // AGENT_RUN_BUDGET_MS already excludes the finalization reserve.
    const deadline = Date.now() + AGENT_RUN_BUDGET_MS;
    for (let attempt = 0; attempt < MAX_AGENT_ATTEMPTS && !output; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_ATTEMPT_MS) {
        // Out of budget: stop here so the run finishes as a real terminal
        // failure the owner can retry, rather than being cut off mid-flight.
        if (!reason) reason = "action_run_timeout";
        break;
      }
      const result = await llm(prompt, {
        ...AGENT_LLM_OPTIONS,
        timeoutMs: Math.min(AGENT_LLM_OPTIONS.timeoutMs, remaining),
      });
      usage = addUsage(usage, result?.usage);
      output = parseAgentOutput(result?.text, agent.outputSchema);
    }
    if (output)
      output = {
        ...output,
        warnings: [...output.warnings, ...agent.acceptance(ctx, output)],
      };
    // Keep a budget-exhaustion reason: it is a different, retryable story from
    // "the model answered but the answer did not validate".
    else if (!reason) reason = "invalid_output";
  } catch {
    reason = "action_run_failed";
    output = null;
  }
  // Persistence is outside the model catch: a rollback must surface as unavailable,
  // never a false succeeded/failed terminal result or a second finish attempt.
  return persistence.finish({
    ...attribution,
    usage,
    costUsd: computeCostUsd(usage),
    output,
    ...(reason ? { error: FRIENDLY_ERROR[locale], reason } : {}),
    finishedAt: new Date(),
  });
}
