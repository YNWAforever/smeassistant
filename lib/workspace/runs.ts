import type { SupabaseClient } from "@supabase/supabase-js";
import { AGENTS, AGENT_LLM_OPTIONS, computeCostUsd, isAgentKey, parseAgentOutput, type AgentContext, type AgentKey, type AgentOutput, type SampledReview } from "@/lib/agents";
import { localized } from "@/lib/domain";
import { llmComplete, type LLMUsage } from "@/lib/llm";
import { sanitizeReportProof } from "@/lib/report/sanitize-proof";
import { recordEvent } from "./audit";
import { buildActionOverview, localeOf, type ActionRow } from "./overview";
import { loadSnapshotById, rowToSnapshot, type ScanSnapshotRow, type SnapshotRecord } from "./snapshots";
import { templateByKey, type TemplateKey } from "./templates";
import { createVersion } from "./versions";

/**
 * One agent run for one action (CLAUDE.md §3.7 runtime, §3.2.3 POST
 * /api/actions/[id]/run). Authorization is the route's job; this module
 * loads the evidence, runs the agent with one retry, persists the
 * `action_runs` transitions and token usage, and applies the needs_input /
 * version rules. Generation never touches `workspace_usage`, and a failed run
 * never overwrites an existing draft (a version is only created on success).
 */
export type RunErrorCode = "action_not_found" | "agent_unavailable";

export class RunError extends Error {
  constructor(public readonly code: RunErrorCode) {
    super(code);
    this.name = "RunError";
  }
}

export interface RunAgentInput {
  actionId: string;
  actorId: string;
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

type ActionRunRow = ActionRow & { source_snapshot_id: string | null };

const FRIENDLY_ERROR = localized(
  "The draft could not be generated this time. Your existing draft is unchanged — please try again in a moment.",
  "今次未能產生草稿，現有草稿沒有改動，請稍後再試。",
  "這次無法產生草稿，現有草稿未變動，請稍後再試。",
);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function resolveAgentKey(requested: string | null | undefined, templateAgent: string | null): AgentKey {
  if (requested !== undefined && requested !== null && requested !== "") {
    if (!isAgentKey(requested)) throw new RunError("agent_unavailable");
    return requested;
  }
  if (!templateAgent || !isAgentKey(templateAgent)) throw new RunError("agent_unavailable");
  return templateAgent;
}

function addUsage(total: LLMUsage, next: LLMUsage | undefined): LLMUsage {
  if (!next) return total;
  const add = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
  return { inputTokens: add(total.inputTokens, next.inputTokens), outputTokens: add(total.outputTokens, next.outputTokens) };
}

export async function loadLatestSnapshot(db: SupabaseClient, workspaceId: string, locationId: string | null): Promise<SnapshotRecord | null> {
  let query = db.from("scan_snapshots").select("*").eq("workspace_id", workspaceId);
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query.order("observed_at", { ascending: false }).limit(1).returns<ScanSnapshotRow[]>();
  if (error) throw new Error("snapshot lookup failed");
  return data?.[0] ? rowToSnapshot(data[0]) : null;
}

/** Reviews without an owner response, newest first, excerpts only (via sanitizeReportProof). */
export async function loadSampledReviews(db: SupabaseClient, jobId: string): Promise<SampledReview[]> {
  const { data, error } = await db.from("audit_jobs").select("raw_data").eq("id", jobId).maybeSingle<{ raw_data: unknown }>();
  if (error) throw new Error("job lookup failed");
  const proof = sanitizeReportProof(data?.raw_data ?? null, []);
  return (proof.gbp?.recentReviews ?? [])
    .filter((review) => !review.ownerResponse && review.text)
    .sort((a, b) => (b.time || "").localeCompare(a.time || ""))
    .map((review) => ({ rating: review.rating || null, text: review.text.slice(0, 500), time: review.time || null }));
}

export function snapshotEvidence(snapshot: SnapshotRecord | null): Record<string, unknown> {
  if (!snapshot) return { snapshot: null };
  return {
    snapshot: {
      observed_at: snapshot.observedAt,
      overall_score: snapshot.overallScore,
      coverage: snapshot.coverage,
      module_states: snapshot.moduleStates,
      metrics: snapshot.metrics,
      website_checks: snapshot.websiteChecks
        ? { evaluated: snapshot.websiteChecks.evaluated, passed: snapshot.websiteChecks.passed, failed: snapshot.websiteChecks.results.filter((r) => !r.pass).map((r) => r.key) }
        : null,
    },
  };
}

/** `social_post` needs an approved asset or an explicit text-only decision (Phase 4 item 4). */
async function socialAssetSatisfied(db: SupabaseClient, workspaceId: string, provided: Record<string, unknown>): Promise<boolean> {
  if (provided.text_only === true) return true;
  const assetId = typeof provided.asset_id === "string" ? provided.asset_id : null;
  if (!assetId) return false;
  const { data, error } = await db.from("assets").select("id, rights_status").eq("id", assetId).eq("workspace_id", workspaceId).maybeSingle<{ id: string; rights_status: string }>();
  if (error) throw new Error("asset lookup failed");
  return data?.rights_status === "approved";
}

export async function runAgentForAction(db: SupabaseClient, input: RunAgentInput): Promise<RunAgentResult> {
  const now = input.now ?? new Date();
  const llm = input.llm ?? llmComplete;
  const locale = localeOf(input.locale);

  const { data: row, error: actionError } = await db.from("actions").select("*").eq("id", input.actionId).maybeSingle<ActionRunRow>();
  if (actionError) throw new Error("action lookup failed");
  if (!row) throw new RunError("action_not_found");

  let template;
  try {
    template = templateByKey(row.template_key as TemplateKey);
  } catch {
    throw new RunError("agent_unavailable");
  }
  const agentKey = resolveAgentKey(input.agentKey, template.agentKey);
  const agent = AGENTS[agentKey];

  let provided = asRecord(row.provided_inputs);
  if (input.inputs && Object.keys(input.inputs).length) {
    provided = { ...provided, ...input.inputs };
    const { error } = await db.from("actions").update({ provided_inputs: provided, updated_at: now.toISOString() }).eq("id", row.id);
    if (error) throw new Error("action inputs update failed");
  }

  const [workspaceResult, brandResult, locationResult, snapshot] = await Promise.all([
    db.from("workspaces").select("business_name, market, timezone").eq("id", row.workspace_id).maybeSingle<{ business_name: string | null; market: string | null; timezone: string | null }>(),
    db.from("brand_profiles").select("voice, approved_claims, prohibited_terms, languages, facts").eq("workspace_id", row.workspace_id).maybeSingle<{ voice: string | null; approved_claims: unknown; prohibited_terms: unknown; languages: unknown; facts: unknown }>(),
    row.location_id
      ? db.from("locations").select("id, slug, name, address, district").eq("id", row.location_id).maybeSingle<{ id: string; slug: string; name: string; address: string | null; district: string | null }>()
      : Promise.resolve({ data: null, error: null }),
    row.source_snapshot_id ? loadSnapshotById(db, row.source_snapshot_id) : loadLatestSnapshot(db, row.workspace_id, row.location_id),
  ]);
  if (workspaceResult.error || brandResult.error || locationResult.error) throw new Error("run context lookup failed");
  const workspace = workspaceResult.data;
  const brand = brandResult.data;
  const location = locationResult.data;
  const sampledReviews = agentKey === "review_reply" && snapshot ? await loadSampledReviews(db, snapshot.jobId) : undefined;

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
    location: { name: location?.name ?? workspace?.business_name ?? "Workspace", address: location?.address ?? null, district: location?.district ?? null },
    action: buildActionOverview({ ...row, provided_inputs: provided }, {
      location: location ? { id: location.id, slug: location.slug, name: localized(location.name, location.name) } : null,
      latestRun: null,
      latestVersion: null,
    }),
    evidence: snapshotEvidence(snapshot),
    providedInputs: provided,
    sampledReviews,
  };

  // queued → running. The queued state is recorded so a crash between the two
  // updates leaves an honest row rather than none.
  const { data: created, error: runInsertError } = await db
    .from("action_runs")
    .insert({
      workspace_id: row.workspace_id,
      action_id: row.id,
      agent_key: agentKey,
      state: "queued",
      input: { agent_key: agentKey, provided_inputs: provided, snapshot_id: snapshot?.id ?? null, prompt_version: agent.promptVersion, locale },
      prompt_version: agent.promptVersion,
      model: process.env.LLM_MODEL || null,
      requested_by: input.actorId,
      created_at: now.toISOString(),
    })
    .select("id")
    .single<{ id: string }>();
  if (runInsertError || !created) throw new Error("run insert failed");
  const runId = created.id;
  await db.from("action_runs").update({ state: "running", started_at: now.toISOString() }).eq("id", runId);
  const audit = (event: "run.started" | "run.succeeded" | "run.failed", payload: Record<string, unknown>) =>
    recordEvent(db, { workspaceId: row.workspace_id, locationId: row.location_id, actorType: "user", actorId: input.actorId, event, entityType: "action_run", entityId: runId, locale, ipHash: input.ipHash, payload: { agent_key: agentKey, action_id: row.id, ...payload } });
  await audit("run.started", {});

  const finishedAt = () => new Date().toISOString();

  const needsInput = async (factsNeeded: string[], output: AgentOutput | null, usage: LLMUsage): Promise<RunAgentResult> => {
    await db.from("action_runs").update({ state: "succeeded", output: output ?? { facts_needed: factsNeeded }, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cost_usd: computeCostUsd(usage), finished_at: finishedAt() }).eq("id", runId);
    await db.from("actions").update({ action_state: "needs_input", updated_at: finishedAt() }).eq("id", row.id);
    await audit("run.succeeded", { facts_needed: factsNeeded });
    return { runId, state: "succeeded", factsNeeded };
  };

  const fail = async (usage: LLMUsage, reason: string): Promise<RunAgentResult> => {
    const message = FRIENDLY_ERROR[locale];
    await db.from("action_runs").update({ state: "failed", error: message, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cost_usd: computeCostUsd(usage), finished_at: finishedAt() }).eq("id", runId);
    await audit("run.failed", { reason });
    return { runId, state: "failed", error: message };
  };

  if (agentKey === "social_post" && !(await socialAssetSatisfied(db, row.workspace_id, provided))) {
    return needsInput(["asset_or_text_only"], null, { inputTokens: null, outputTokens: null });
  }

  let usage: LLMUsage = { inputTokens: null, outputTokens: null };
  try {
    const prompt = agent.buildPrompt(ctx);
    let output: AgentOutput | null = null;
    for (let attempt = 0; attempt < 2 && !output; attempt += 1) {
      const result = await llm(prompt, AGENT_LLM_OPTIONS);
      usage = addUsage(usage, result?.usage);
      output = parseAgentOutput(result?.text, agent.outputSchema);
    }
    if (!output) return fail(usage, "invalid_output");

    output = { ...output, warnings: [...output.warnings, ...agent.acceptance(ctx, output)] };
    if (output.facts_needed.length) return needsInput(output.facts_needed, output, usage);

    const version = await createVersion(db, {
      actionId: row.id,
      actorId: input.actorId,
      authorType: "agent",
      runId,
      body: output.body,
      altText: output.alt_text ?? null,
      meta: { title: output.title, acceptance_criteria: output.acceptance_criteria, warnings: output.warnings, facts_used: output.facts_used, agent_key: agentKey, prompt_version: agent.promptVersion },
    });
    await db.from("action_runs").update({ state: "succeeded", output, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cost_usd: computeCostUsd(usage), finished_at: finishedAt() }).eq("id", runId);
    await db.from("actions").update({ action_state: "in_progress", updated_at: finishedAt() }).eq("id", row.id);
    await audit("run.succeeded", { version_id: version.versionId, version_no: version.versionNo, warnings: output.warnings });
    return { runId, state: "succeeded", versionId: version.versionId, versionNo: version.versionNo };
  } catch (error) {
    console.error("[workspace/runs] run failed", { category: "action_run_failed", agentKey });
    return fail(usage, error instanceof Error ? error.message.slice(0, 120) : "unknown");
  }
}
