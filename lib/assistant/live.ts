import type { SupabaseClient } from "@supabase/supabase-js";
import { AGENTS, AGENT_LLM_OPTIONS, parseAgentOutput, type AgentContext, type AgentKey } from "@/lib/agents";
import { inLocationScope, roleAtLeast, type Membership } from "@/lib/auth";
import type { PrototypeLocale } from "@/lib/copy";
import { localized } from "@/lib/domain";
import { llmComplete, llmConfigured } from "@/lib/llm";
import type { AssistantArtifact, AssistantSurface, DemoAssistantRunResponse, DemoQuestionId, EvidenceReference } from "@/lib/pocket-assistant/contracts";
import { supabaseServer } from "@/lib/supabase/admin";
import { buildActionOverview, type ActionOverview, type ActionRow } from "@/lib/workspace/overview";
import { loadActionRows, loadDiffById } from "@/lib/workspace/queries-pages";
import { loadLatestSnapshot, loadSampledReviews, snapshotEvidence } from "@/lib/workspace/runs";
import { loadSnapshotById, type SnapshotRecord } from "@/lib/workspace/snapshots";
import { buildEvidenceRefs } from "./evidence";
import { fallbackIntentFor, isTemplateIntent, templateAnswer, type TemplateContext } from "./templates";

/**
 * Live assistant runs (CLAUDE.md §3.8 live mode). Authorization is the
 * route's job for membership; this module enforces draft scope on resolved
 * actions and evidence, answers template
 * intents deterministically and runs the matching agent once for the draft
 * intents. It never writes: no action_runs, no versions, no audit rows — a
 * draft only becomes a version when the owner clicks "Create a new version".
 */
export interface LiveRunContext {
  workspaceId: string;
  locationId?: string;
  snapshotId?: string;
  actionId?: string;
  versionId?: string;
}

export interface LiveRunInput {
  intentId: DemoQuestionId;
  surface: AssistantSurface;
  locale: PrototypeLocale;
  context: LiveRunContext;
  /** Accepted membership resolved by the server, never request JSON. */
  membership: Membership;
  /** Injected for tests; defaults to the service-role client. */
  db?: SupabaseClient;
  llm?: typeof llmComplete;
  llmReady?: () => boolean;
}

type DraftIntent = "draft_review_reply" | "friendlier_review_reply" | "generate_social" | "generate_faq" | "generate_menu";

const DRAFT_AGENTS: Record<DraftIntent, { agent: AgentKey; type: AssistantArtifact["type"]; templates: string[] }> = {
  draft_review_reply: { agent: "review_reply", type: "review_reply", templates: ["review-response"] },
  friendlier_review_reply: { agent: "review_reply", type: "review_reply", templates: ["review-response"] },
  generate_social: { agent: "social_post", type: "social_post", templates: ["social-post"] },
  generate_faq: { agent: "faq_jsonld", type: "faq", templates: ["visibility-content"] },
  generate_menu: { agent: "menu_translation", type: "menu_translation", templates: ["menu-translation"] },
};

const WARMER_INSTRUCTION = "Rewrite in a warmer, friendlier tone. Keep every fact; do not add promises, offers, compensation or dates.";

export const LIVE_BOUNDARY = localized(
  "Answers use only this workspace's evidence snapshots; nothing is published or approved here.",
  "回答只使用此工作區的證據快照；這裡不會發佈或核准任何內容。",
);
const AI_UNAVAILABLE = localized("AI drafting unavailable right now", "AI 草稿功能暫時無法使用");
const NO_ACTION_FOR_DRAFT = localized(
  "No open action matches this request, so there is nothing to draft from. Create the action first.",
  "沒有未完成的行動符合這項要求，因此沒有可用作草稿的基礎。請先建立行動。",
);
const DRAFT_ANSWER = localized(
  "A draft for “{title}” is ready for owner review. It uses only the brand facts and the evidence shown; nothing is saved until you create a new version.",
  "「{title}」的草稿已準備好供店主審閱。內容只使用品牌事實及所示證據；建立新版本前不會儲存任何內容。",
);
const DRAFT_NEXT = localized(
  "Check tone and facts, create a new version, then approve a specific version; nothing publishes automatically.",
  "檢查語氣及事實，建立新版本，再核准指定版本；不會自動發佈。",
);
const NEEDS_FACTS = localized("The agent still needs: {facts}.", "Agent 仍需要：{facts}。");

interface WorkspaceRow { business_name: string | null; market: string | null; timezone: string | null }
interface LocationRow { id: string; slug: string; name: string; address: string | null; district: string | null; is_primary: boolean | null }
interface BrandRow { voice: string | null; approved_claims: unknown; prohibited_terms: unknown; languages: unknown; facts: unknown }
type ActionSourceRow = ActionRow & { source_snapshot_id: string | null };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function isDraftIntent(intent: DemoQuestionId): intent is DraftIntent {
  return Object.prototype.hasOwnProperty.call(DRAFT_AGENTS, intent);
}

export class AssistantAccessError extends Error {
  readonly status: 403 | 404;
  constructor(readonly code: "forbidden" | "not_found") {
    super(code);
    this.status = code === "forbidden" ? 403 : 404;
  }
}

function requireDraftScope(input: LiveRunInput, locationId: string | null) {
  if (!inLocationScope(input.membership, locationId)) throw new AssistantAccessError("forbidden");
}

function overviewOf(row: ActionRow, location: LocationRow | null): ActionOverview {
  return buildActionOverview(row, {
    location: location ? { id: location.id, slug: location.slug, name: localized(location.name, location.name) } : null,
    latestRun: null,
    latestVersion: null,
  });
}

interface ResolvedContext {
  workspace: WorkspaceRow | null;
  location: LocationRow | null;
  snapshot: SnapshotRecord | null;
  base: SnapshotRecord | null;
  diff: Awaited<ReturnType<typeof loadDiffById>>;
  focused: { row: ActionSourceRow; overview: ActionOverview } | null;
  open: Array<{ row: ActionSourceRow; overview: ActionOverview }>;
  evidenceRefs: EvidenceReference[];
  locationName: string;
  timezone: string;
}

async function resolveContext(db: SupabaseClient, input: LiveRunInput): Promise<ResolvedContext> {
  const { workspaceId } = input.context;
  const [workspaceResult, locationsResult] = await Promise.all([
    db.from("workspaces").select("business_name, market, timezone").eq("id", workspaceId).maybeSingle<WorkspaceRow>(),
    db.from("locations").select("id, slug, name, address, district, is_primary").eq("workspace_id", workspaceId).order("is_primary", { ascending: false }).returns<LocationRow[]>(),
  ]);
  if (workspaceResult.error || locationsResult.error) throw new Error("assistant context lookup failed");
  const workspace = workspaceResult.data ?? null;
  const locations = locationsResult.data ?? [];

  // The focused action, only when it belongs to this workspace.
  let focusedRow: ActionSourceRow | null = null;
  if (input.context.actionId) {
    const { data, error } = await db.from("actions").select("*").eq("id", input.context.actionId).eq("workspace_id", workspaceId).maybeSingle<ActionSourceRow>();
    if (error) throw new Error("assistant action lookup failed");
    focusedRow = data ?? null;
  }

  const drafting = isDraftIntent(input.intentId);
  if (drafting) {
    if (!workspace || (input.context.actionId && !focusedRow)) throw new AssistantAccessError("not_found");
    // Select the implicit action before choosing its evidence, using the same
    // ordering as the existing draft runner. Never replace an explicit miss.
    if (!focusedRow) {
      const selectionLocation = input.context.locationId ?? locations.find((l) => l.is_primary)?.id ?? locations[0]?.id ?? null;
      const candidates = await loadActionRows(workspaceId, { locationId: selectionLocation, states: ["recommended", "needs_input", "ready", "in_progress"] }) as ActionSourceRow[];
      const spec = DRAFT_AGENTS[input.intentId as DraftIntent];
      focusedRow = candidates.find((a) => spec.templates.includes(a.template_key)) ?? candidates[0] ?? null;
    }
    if (focusedRow) {
      if (focusedRow.workspace_id !== workspaceId) throw new AssistantAccessError("not_found");
      requireDraftScope(input, focusedRow.location_id);
      if (focusedRow.location_id && !locations.some((l) => l.id === focusedRow!.location_id)) throw new AssistantAccessError("not_found");
      if (input.context.locationId && focusedRow.location_id && input.context.locationId !== focusedRow.location_id) throw new AssistantAccessError("not_found");
    }
    if (input.context.locationId && !locations.some((l) => l.id === input.context.locationId)) throw new AssistantAccessError("not_found");
  }

  let locationId: string | null = input.context.locationId ?? focusedRow?.location_id ?? locations.find((l) => l.is_primary)?.id ?? locations[0]?.id ?? null;
  let location = locations.find((l) => l.id === locationId) ?? null;

  // snapshotId → the action's source snapshot → the latest for the location.
  let snapshot: SnapshotRecord | null = null;
  if (input.context.snapshotId) snapshot = await loadSnapshotById(db, input.context.snapshotId);
  if (drafting && input.context.snapshotId && !snapshot) throw new AssistantAccessError("not_found");
  if (!snapshot && focusedRow?.source_snapshot_id) {
    snapshot = await loadSnapshotById(db, focusedRow.source_snapshot_id);
    if (drafting && !snapshot) throw new AssistantAccessError("not_found");
  }
  if (drafting && snapshot) {
    if (snapshot.workspaceId !== workspaceId) throw new AssistantAccessError("not_found");
    requireDraftScope(input, snapshot.locationId);
    if ((focusedRow?.location_id && focusedRow.location_id !== snapshot.locationId) ||
        (input.context.locationId && input.context.locationId !== snapshot.locationId)) throw new AssistantAccessError("not_found");
    // Workspace-wide actions can use location evidence, but that evidence's
    // persisted location remains part of the draft authority decision.
    locationId = snapshot.locationId;
    location = locations.find((l) => l.id === locationId) ?? null;
    if (locationId && !location) throw new AssistantAccessError("not_found");
  }
  if (snapshot && snapshot.workspaceId !== workspaceId) snapshot = null;
  if (drafting) requireDraftScope(input, locationId);
  if (!snapshot) snapshot = await loadLatestSnapshot(db, workspaceId, locationId);
  if (drafting && snapshot) {
    if (snapshot.workspaceId !== workspaceId || (locationId && snapshot.locationId !== locationId)) throw new AssistantAccessError("not_found");
    requireDraftScope(input, snapshot.locationId);
  }

  const [diff, base, openRows] = await Promise.all([
    loadDiffById(snapshot?.diffId ?? null),
    snapshot?.comparableTo ? loadSnapshotById(db, snapshot.comparableTo) : Promise.resolve(null),
    loadActionRows(workspaceId, { locationId, states: ["recommended", "needs_input", "ready", "in_progress"] }),
  ]);

  if (drafting && base && (base.workspaceId !== workspaceId || base.locationId !== snapshot?.locationId)) throw new AssistantAccessError("not_found");

  const open = (openRows as ActionSourceRow[]).map((row) => ({ row, overview: overviewOf(row, locations.find((l) => l.id === row.location_id) ?? null) }));
  const focused = focusedRow ? { row: focusedRow, overview: overviewOf(focusedRow, locations.find((l) => l.id === focusedRow.location_id) ?? null) } : null;
  const locationName = location?.name ?? workspace?.business_name ?? "Workspace";
  const evidenceRefs = snapshot ? buildEvidenceRefs({ snapshot, diff, base, action: focused?.overview ?? open[0]?.overview ?? null, locationName, locale: input.locale }) : [];
  return { workspace, location, snapshot, base, diff, focused, open, evidenceRefs, locationName, timezone: workspace?.timezone ?? "Asia/Hong_Kong" };
}

function templateContext(input: LiveRunInput, ctx: ResolvedContext): TemplateContext {
  return {
    locale: input.locale,
    timezone: ctx.timezone,
    locationName: ctx.locationName,
    snapshot: ctx.snapshot,
    base: ctx.base,
    diff: ctx.diff,
    actions: ctx.open.map((a) => a.overview),
    action: ctx.focused?.overview ?? null,
    evidenceRefs: ctx.evidenceRefs,
  };
}

function completed(intent: DemoQuestionId, input: LiveRunInput, ctx: ResolvedContext, extraWarnings: string[] = []): DemoAssistantRunResponse {
  const answer = templateAnswer(isTemplateIntent(intent) ? intent : "explain_limits", templateContext(input, ctx));
  return {
    runId: `live_run_${crypto.randomUUID()}`,
    state: "completed",
    answer: answer.answer,
    nextAction: answer.nextAction,
    evidenceRefs: answer.evidenceRefs,
    warnings: [...extraWarnings, ...answer.warnings],
    requiresApproval: false,
    demoBoundary: LIVE_BOUNDARY[input.locale],
  };
}

async function agentContext(db: SupabaseClient, input: LiveRunInput, ctx: ResolvedContext, action: { row: ActionSourceRow; overview: ActionOverview }, agentKey: AgentKey, intent: DraftIntent): Promise<AgentContext> {
  const { data: brand, error } = await db
    .from("brand_profiles")
    .select("voice, approved_claims, prohibited_terms, languages, facts")
    .eq("workspace_id", input.context.workspaceId)
    .maybeSingle<BrandRow>();
  if (error) throw new Error("assistant brand lookup failed");
  const provided = { ...asRecord(action.row.provided_inputs), ...(intent === "friendlier_review_reply" ? { tone_instruction: WARMER_INSTRUCTION } : {}) };
  const sampledReviews = agentKey === "review_reply" && ctx.snapshot ? await loadSampledReviews(db, ctx.snapshot.jobId) : undefined;
  return {
    locale: input.locale,
    market: ctx.workspace?.market?.toLowerCase() === "tw" ? "tw" : "hk",
    brand: {
      voice: brand?.voice ?? "warm",
      approvedClaims: asStrings(brand?.approved_claims),
      prohibitedTerms: asStrings(brand?.prohibited_terms),
      languages: asStrings(brand?.languages),
      facts: asRecord(brand?.facts),
    },
    location: { name: ctx.locationName, address: ctx.location?.address ?? null, district: ctx.location?.district ?? null },
    action: buildActionOverview({ ...action.row, provided_inputs: provided }, { location: action.overview.location, latestRun: null, latestVersion: null }),
    evidence: snapshotEvidence(ctx.snapshot),
    providedInputs: provided,
    sampledReviews,
  };
}

async function draft(intent: DraftIntent, input: LiveRunInput, db: SupabaseClient, ctx: ResolvedContext): Promise<DemoAssistantRunResponse> {
  const spec = DRAFT_AGENTS[intent];
  const action = ctx.focused; // Already selected and authorized with its evidence.
  if (!action) return { ...completed("explain_limits", input, ctx, [NO_ACTION_FOR_DRAFT[input.locale]]) };

  const ready = (input.llmReady ?? llmConfigured)();
  const fallback = () => completed(fallbackIntentFor(intent), input, ctx, [AI_UNAVAILABLE[input.locale]]);
  if (!ready) return fallback();

  const agent = AGENTS[spec.agent];
  const agentCtx = await agentContext(db, input, ctx, action, spec.agent, intent);
  const result = await (input.llm ?? llmComplete)(agent.buildPrompt(agentCtx), AGENT_LLM_OPTIONS);
  const output = parseAgentOutput(result?.text, agent.outputSchema);
  if (!output) return fallback();

  const warnings = [...output.warnings, ...agent.acceptance(agentCtx, output)];
  const title = action.overview.title[input.locale];
  if (output.facts_needed.length > 0) {
    const base = completed(fallbackIntentFor(intent), input, ctx);
    return { ...base, answer: NEEDS_FACTS[input.locale].replace("{facts}", output.facts_needed.join(", ")), warnings: [...warnings, ...base.warnings] };
  }
  return {
    runId: `live_run_${crypto.randomUUID()}`,
    state: "needs_approval",
    answer: DRAFT_ANSWER[input.locale].replace("{title}", title),
    nextAction: DRAFT_NEXT[input.locale],
    evidenceRefs: ctx.evidenceRefs,
    output: {
      type: spec.type,
      artifactId: `art_${crypto.randomUUID()}`,
      version: 1,
      title: output.title || title,
      body: output.body,
      acceptanceCriteria: output.acceptance_criteria,
    },
    warnings,
    requiresApproval: true,
    demoBoundary: LIVE_BOUNDARY[input.locale],
  };
}

export async function runLiveAssistant(input: LiveRunInput): Promise<DemoAssistantRunResponse> {
  if (!input.membership || input.membership.workspaceId !== input.context.workspaceId ||
      (isDraftIntent(input.intentId) && !roleAtLeast(input.membership.role, "manager"))) throw new AssistantAccessError("forbidden");
  const db = input.db ?? supabaseServer();
  const ctx = await resolveContext(db, input);
  if (isDraftIntent(input.intentId)) return draft(input.intentId, input, db, ctx);
  return completed(input.intentId, input, ctx);
}
