import {
  actionRunRepository,
  type ArtifactRepository,
  type ActionRunRepository,
} from "@/lib/repositories/artifacts";
import { assetRepository } from "@/lib/repositories/assets";
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
  type SampledReview,
} from "@/lib/agents";
import { localized } from "@/lib/domain";
import { llmComplete, type LLMUsage } from "@/lib/llm";
import { sanitizeReportProof } from "@/lib/report/sanitize-proof";
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

/** Shared excerpt transformation; no persistence or provider transport. */
export function sampledReviewsFromRawData(rawData: unknown): SampledReview[] {
  const proof = sanitizeReportProof(rawData, []);
  return (proof.gbp?.recentReviews ?? [])
    .filter((review) => !review.ownerResponse && review.text)
    .sort((a, b) => (b.time || "").localeCompare(a.time || ""))
    .map((review) => ({
      rating: review.rating || null,
      text: review.text.slice(0, 500),
      time: review.time || null,
    }));
}

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
            failed: snapshot.websiteChecks.results
              .filter((r) => !r.pass)
              .map((r) => r.key),
          }
        : null,
    },
  };
}

/** `social_post` needs an approved asset or an explicit text-only decision (Phase 4 item 4). */
async function socialAssetSatisfied(
  assets: Pick<ReturnType<typeof assetRepository>, "get">,
  workspaceId: string,
  provided: Record<string, unknown>,
): Promise<boolean> {
  if (provided.text_only === true) return true;
  const assetId =
    typeof provided.asset_id === "string" ? provided.asset_id : null;
  if (!assetId) return false;
  return (await assets.get(workspaceId, assetId))?.rights_status === "approved";
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
  const sampledReviews =
    agentKey === "review_reply" && snapshot
      ? sampledReviewsFromRawData(
          await db.assistantReviewData(row.workspace_id, snapshot.jobId),
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
    for (let attempt = 0; attempt < 2 && !output; attempt += 1) {
      const result = await llm(prompt, AGENT_LLM_OPTIONS);
      usage = addUsage(usage, result?.usage);
      output = parseAgentOutput(result?.text, agent.outputSchema);
    }
    if (output)
      output = {
        ...output,
        warnings: [...output.warnings, ...agent.acceptance(ctx, output)],
      };
    else reason = "invalid_output";
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
