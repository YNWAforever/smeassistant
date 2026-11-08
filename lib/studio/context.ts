import { inLocationScope, type Membership } from "@/lib/auth";
import type { PrototypeLocale } from "@/lib/copy";
import { localized, type FactType, type LocalizedText, type Priority } from "@/lib/domain";
import type { EvidenceReference } from "@/lib/pocket-assistant/contracts";
import type { SignalRows } from "@/lib/assistant/signals";
import type { StudioContextSummary, StudioPromptChip } from "./types";
import { studioText } from "./copy";
import { buildEvidenceRefs, formatCoverage } from "@/lib/assistant/evidence";
import type { ActionOverview } from "@/lib/workspace/overview";
import type { ScanDiffRow, SnapshotRecord } from "@/lib/workspace/snapshots";
import { formatDay, priorityLabel, stateLabel } from "@/lib/workspace/format";
import type { HomeBrief } from "@/lib/workspace/queries-pages";
import type { WorkspaceContext } from "@/lib/workspace/queries";
import { AssistantAccessError } from "@/lib/assistant/errors";

/**
 * The Studio briefing (design §6.1).
 *
 * Built on every turn from the same authorised read models the owner pages use,
 * never cached across turns: continuity must not mean replaying stale state.
 * Nothing here writes and nothing is aggregated across locations — a score is
 * copied from the snapshot that owns it and a change is only read when
 * `scan_diffs` says the pair is comparable.
 *
 * The data reads are injected so unit tests exercise every branch without a
 * database; production defaults are resolved lazily so importing this module
 * for its types does not open a pool.
 */

export interface StudioBrandSnapshot {
  current_revision_id?: string | null;
  voice?: string | null;
  approved_claims?: unknown;
  prohibited_terms?: unknown;
  languages?: unknown;
  facts?: unknown;
}

export interface StudioBriefingLocation {
  id: string;
  slug: string;
  name: string;
}

export interface StudioBriefingAction {
  id: string;
  title: string;
  state: string;
  priority: Priority;
  missingInputs: string[];
}

export interface StudioBriefingVersion {
  id: string;
  actionId: string;
  versionNo: number;
  approvalState: string;
  createdAt: string;
}

/** One citable row, keyed for the classifier (`ev:1` … `ev:12`). */
export interface StudioEvidenceEntry {
  id: string;
  ref: EvidenceReference;
}

export interface StudioBriefing {
  workspace: {
    id: string;
    name: string;
    slug: string;
    market: "hk" | "tw";
    timezone: string;
    tier: "lite" | "paid";
    role: Membership["role"];
    locationScope: string[] | null;
  };
  location: StudioBriefingLocation | null;
  latestScan: {
    id: string;
    jobId: string;
    /** Copied from `scan_snapshots.overall_score`; null when withheld by the scorer. */
    score: number | null;
    /** Copied from `scan_snapshots.coverage`; never recomputed here. */
    coverage: number;
    observedAt: string;
    scoringVersion: string | null;
    factType: Extract<FactType, "Observed" | "Unknown">;
  } | null;
  change: { comparable: boolean; factType: FactType; delta: number | null; reason: string | null } | null;
  /** Bounded to the first 8; `openActionCount` is the full authorised scope. */
  openActions: StudioBriefingAction[];
  openActionCount: number;
  waitingVersions: StudioBriefingVersion[];
  google: SignalRows["google"];
  brand: {
    revisionId: string | null;
    voice: string | null;
    approvedClaims: string[];
    prohibitedTerms: string[];
    languages: string[];
    facts: Array<{ key: string; value: string }>;
  };
  usage: { period: string; approvedDeliveries: number; allowance: number | null };
  evidenceCatalogue: StudioEvidenceEntry[];
}

export interface StudioBriefingResult {
  briefing: StudioBriefing;
  /** The bounded English block the model reads as data (fenced by prompt.ts). */
  systemBriefing: string;
  contextSummary: StudioContextSummary;
  promptChips: StudioPromptChip[];
  evidenceCatalogue: StudioEvidenceEntry[];
  /** Alias the Studio page reads; identical to `promptChips`. */
  chips: StudioPromptChip[];
}

/**
 * Every dependency is explicit. Each defaults to the production read model, so
 * a caller passes none and a test passes fakes; nothing reads `process.env`.
 */
export interface StudioBriefingDeps {
  loadWorkspaceContext?: (membership: Membership) => Promise<WorkspaceContext>;
  getHomeBrief?: (ctx: WorkspaceContext, scope: string) => Promise<HomeBrief>;
  loadSignalRows?: (workspaceId: string, locationId: string | null) => Promise<SignalRows>;
  assistantBrand?: (workspaceId: string) => Promise<StudioBrandSnapshot | null>;
  loadSnapshots?: (workspaceId: string, locationId: string, limit: number) => Promise<SnapshotRecord[]>;
  loadDiff?: (diffId: string | null, workspaceId: string, headJobId: string | null) => Promise<ScanDiffRow | null>;
  buildEvidenceRefs?: typeof buildEvidenceRefs;
  now?: () => Date;
}

export interface StudioBriefingInput {
  membership: Membership;
  locale: PrototypeLocale;
  locationId?: string | null;
  /** The owner pages scope by slug (`?location=`); accepted so the page can pass it directly. */
  locationSlug?: string | null;
  deps?: StudioBriefingDeps;
}

const OPEN_ACTION_LIMIT = 8;
const EVIDENCE_LIMIT = 12;

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asFactEntries(value: unknown): Array<{ key: string; value: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => Boolean(key))
    .slice(0, 20)
    .map(([key, raw]) => ({ key, value: typeof raw === "string" ? raw : raw === null || raw === undefined ? "" : JSON.stringify(raw) }));
}

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

type ResolvedDeps = Required<StudioBriefingDeps>;

async function resolveDeps(deps: StudioBriefingDeps = {}): Promise<ResolvedDeps> {
  const queries = deps.loadWorkspaceContext && deps.getHomeBrief && deps.loadSnapshots && deps.loadDiff
    ? null
    : await import("@/lib/workspace/queries-pages");
  const contextQueries = deps.loadWorkspaceContext ? null : await import("@/lib/workspace/queries");
  const signals = deps.loadSignalRows ? null : await import("@/lib/assistant/suggestions");
  const artifacts = deps.assistantBrand ? null : await import("@/lib/repositories/artifacts");
  const evidence = deps.buildEvidenceRefs ? null : await import("@/lib/assistant/evidence");
  return {
    loadWorkspaceContext: deps.loadWorkspaceContext ?? contextQueries!.loadWorkspaceContext,
    getHomeBrief: deps.getHomeBrief ?? queries!.getHomeBrief,
    loadSnapshots: deps.loadSnapshots ?? queries!.loadSnapshotsForLocation,
    loadDiff: deps.loadDiff ?? queries!.loadDiffById,
    loadSignalRows: deps.loadSignalRows ?? ((workspaceId, locationId) => signals!.loadSignalRows(artifacts!.artifactRepository(), workspaceId, locationId)),
    assistantBrand: deps.assistantBrand ?? ((workspaceId) => artifacts!.artifactRepository().assistantBrand(workspaceId)),
    buildEvidenceRefs: deps.buildEvidenceRefs ?? evidence!.buildEvidenceRefs,
    now: deps.now ?? (() => new Date()),
  };
}

function resolveLocation(ctx: WorkspaceContext, input: StudioBriefingInput): StudioBriefingLocation | null {
  const explicitId = input.locationId ?? null;
  const explicitSlug = input.locationSlug && input.locationSlug !== "all" ? input.locationSlug : null;
  if (explicitId) {
    const location = ctx.locations.find((entry) => entry.id === explicitId);
    if (!location) throw new AssistantAccessError("not_found");
    if (!inLocationScope(ctx.membership, location.id)) throw new AssistantAccessError("forbidden");
    return { id: location.id, slug: location.slug, name: location.name };
  }
  if (explicitSlug) {
    const location = ctx.locations.find((entry) => entry.slug === explicitSlug);
    if (!location) throw new AssistantAccessError("not_found");
    if (!inLocationScope(ctx.membership, location.id)) throw new AssistantAccessError("forbidden");
    return { id: location.id, slug: location.slug, name: location.name };
  }
  const primary = ctx.locations.find((entry) => entry.isPrimary) ?? ctx.locations[0] ?? null;
  if (!primary) return null;
  if (!inLocationScope(ctx.membership, primary.id)) throw new AssistantAccessError("forbidden");
  return { id: primary.id, slug: primary.slug, name: primary.name };
}

/** Waiting versions the member may see: a scoped manager only sees their locations (or workspace-wide rows). */
function visibleVersions(membership: Membership, rows: SignalRows["waitingVersions"]): StudioBriefingVersion[] {
  return rows
    .filter((row) => row.locationId === null || inLocationScope(membership, row.locationId))
    .map((row) => ({ id: row.id, actionId: row.actionId, versionNo: row.versionNo, approvalState: row.approvalState, createdAt: row.createdAt }));
}

function catalogueOf(refs: EvidenceReference[]): StudioEvidenceEntry[] {
  return refs.slice(0, EVIDENCE_LIMIT).map((ref, index) => ({ id: `ev:${index + 1}`, ref }));
}

/**
 * Assemble the authorised briefing. Throws only for an unknown or out-of-scope
 * location (mapped to 404/403 by the caller); missing rows are represented as
 * unavailable, never inferred.
 */
export async function buildStudioBriefing(input: StudioBriefingInput): Promise<StudioBriefingResult> {
  const deps = await resolveDeps(input.deps);
  const ctx = await deps.loadWorkspaceContext(input.membership);
  const location = resolveLocation(ctx, input);
  const scope = location?.slug ?? "all";

  const [brief, signals] = await Promise.all([
    deps.getHomeBrief(ctx, scope),
    deps.loadSignalRows(ctx.workspace.id, location?.id ?? null),
  ]);
  const brandRow = await deps.assistantBrand(ctx.workspace.id);

  const snapshot = brief.snapshot;
  let diff: ScanDiffRow | null = null;
  let base: SnapshotRecord | null = null;
  if (snapshot && location) {
    const [snapshots, storedDiff] = await Promise.all([
      deps.loadSnapshots(ctx.workspace.id, location.id, 2),
      deps.loadDiff(snapshot.diffId, ctx.workspace.id, snapshot.jobId),
    ]);
    const storedBase = snapshot.comparableTo ? snapshots.find((row) => row.id === snapshot.comparableTo) ?? null : null;
    // Same pair-consistency rule as the live assistant: mixed evidence is
    // withheld together rather than relabelled Observed.
    if (snapshot.comparableTo && (!storedBase || !storedDiff || storedBase.jobId !== storedDiff.base_job_id)) {
      diff = null;
      base = null;
    } else {
      diff = storedDiff;
      base = storedBase;
    }
  }

  const evidenceRefs = snapshot
    ? deps.buildEvidenceRefs({
        snapshot,
        diff,
        base,
        action: brief.priority,
        locationName: location?.name ?? ctx.workspace.name,
        locale: input.locale,
      })
    : [];
  const evidenceCatalogue = catalogueOf(evidenceRefs);

  const openActions: StudioBriefingAction[] = brief.openActions.slice(0, OPEN_ACTION_LIMIT).map((action: ActionOverview) => ({
    id: action.id,
    title: action.title[input.locale],
    state: action.actionState,
    priority: action.priority,
    missingInputs: [...action.missingInputs],
  }));

  const facts = asFactEntries(brandRow?.facts);
  const briefing: StudioBriefing = {
    workspace: {
      id: ctx.workspace.id,
      name: ctx.workspace.name,
      slug: ctx.workspace.slug,
      market: ctx.workspace.market,
      timezone: ctx.workspace.timezone,
      tier: ctx.workspace.tier,
      role: ctx.membership.role,
      locationScope: ctx.membership.locationScope,
    },
    location,
    latestScan: snapshot
      ? {
          id: snapshot.id,
          jobId: snapshot.jobId,
          score: snapshot.overallScore,
          coverage: snapshot.coverage,
          observedAt: snapshot.observedAt,
          scoringVersion: snapshot.scoringVersion,
          factType: snapshot.overallScore === null ? "Unknown" : "Observed",
        }
      : null,
    change: diff
      ? {
          comparable: diff.comparable,
          factType: diff.comparable && !diff.composite_withheld_reason ? "Observed" : "Unknown",
          delta: num(diff.composite_delta),
          reason: !diff.comparable ? diff.incomparable_reason : diff.composite_withheld_reason,
        }
      : snapshot
        ? { comparable: false, factType: "Unknown", delta: null, reason: "NO_DIFF" }
        : null,
    openActions,
    openActionCount: brief.openActionCount ?? brief.openActions.length,
    waitingVersions: visibleVersions(ctx.membership, signals.waitingVersions),
    google: signals.google,
    brand: {
      revisionId: brandRow?.current_revision_id ?? null,
      voice: brandRow?.voice ?? null,
      approvedClaims: asStrings(brandRow?.approved_claims),
      prohibitedTerms: asStrings(brandRow?.prohibited_terms),
      languages: asStrings(brandRow?.languages),
      facts,
    },
    usage: {
      period: ctx.usage.period,
      approvedDeliveries: ctx.usage.approvedDeliveries,
      allowance: ctx.usage.allowance,
    },
    evidenceCatalogue,
  };

  const contextSummary = buildContextSummary(briefing, input.locale);
  const promptChips = studioPromptChips(briefing, input.locale);
  return {
    briefing,
    systemBriefing: renderSystemBriefing(briefing, input.locale),
    contextSummary,
    promptChips,
    evidenceCatalogue,
    chips: promptChips,
  };
}

function scoreText(score: number | null): string {
  return score === null ? "withheld" : `${Math.round(score)}/100`;
}

function coverageText(coverage: number): string {
  return `${Math.round(coverage <= 1 ? coverage * 100 : coverage)}%`;
}

/**
 * The bounded English briefing block (design §6.1). Labels are stable English
 * so the prompts are auditable; values are copied, never computed, and a missing
 * row is stated as unavailable rather than as zero.
 */
export function renderSystemBriefing(briefing: StudioBriefing, locale: PrototypeLocale): string {
  const lines: string[] = [];
  const ws = briefing.workspace;
  lines.push(`WORKSPACE: ${ws.name} (market ${ws.market.toUpperCase()}, timezone ${ws.timezone}, tier ${ws.tier})`);
  lines.push(`CALLER ROLE: ${ws.role}; location scope: ${ws.locationScope === null ? "all locations" : ws.locationScope.join(", ") || "none assigned"}`);
  lines.push(`LOCATION: ${briefing.location ? `${briefing.location.name} (${briefing.location.slug})` : "all locations (no aggregate score is available across locations)"}`);

  if (briefing.latestScan) {
    const scan = briefing.latestScan;
    lines.push(
      `LATEST SNAPSHOT: observed ${formatDay(scan.observedAt, locale, ws.timezone)} (${scan.observedAt}); score ${scoreText(scan.score)}; coverage ${coverageText(scan.coverage)}; scoring version ${scan.scoringVersion ?? "unknown"}; source scan_snapshots id ${scan.id} / scan id ${scan.jobId}; fact type ${scan.factType}`,
    );
  } else {
    lines.push("LATEST SNAPSHOT: unavailable — no finished scan for this location yet. Do not invent a score or coverage.");
  }

  if (briefing.change) {
    const change = briefing.change;
    if (!change.comparable) {
      lines.push(`COMPARABLE CHANGE: unavailable (${change.reason ?? "NO_DIFF"}) — do not draw a delta.`);
    } else if (change.factType !== "Observed") {
      lines.push(`COMPARABLE CHANGE: comparable, but the composite delta is withheld (${change.reason ?? "UNKNOWN"}).`);
    } else {
      lines.push(`COMPARABLE CHANGE: ${change.delta === null ? "observed but no delta recorded" : `${change.delta > 0 ? "+" : ""}${Math.round(change.delta)} points Observed`} (temporal association only, not causation).`);
    }
  } else {
    lines.push("COMPARABLE CHANGE: unavailable — there is no earlier finished scan to compare with.");
  }

  if (briefing.openActions.length) {
    lines.push(`OPEN ACTIONS (${briefing.openActions.length} shown of ${briefing.openActionCount}, highest priority first):`);
    for (const action of briefing.openActions) {
      lines.push(`- ${action.id} :: ${action.title} :: state ${action.state} :: priority ${action.priority}${action.missingInputs.length ? ` :: missing inputs ${action.missingInputs.join(", ")}` : ""}`);
    }
  } else {
    lines.push("OPEN ACTIONS: none in scope right now.");
  }

  if (briefing.waitingVersions.length) {
    lines.push(`WAITING VERSIONS (${briefing.waitingVersions.length}):`);
    for (const version of briefing.waitingVersions) {
      lines.push(`- ${version.id} :: action ${version.actionId} :: v${version.versionNo} :: ${version.approvalState}`);
    }
  } else {
    lines.push("WAITING VERSIONS: none.");
  }

  lines.push(`GOOGLE CONNECTION: ${briefing.google ?? "not connected"}.`);
  lines.push(
    briefing.brand.facts.length
      ? `CONFIRMED BRAND FACTS (${briefing.brand.facts.length}): ${briefing.brand.facts.map((fact) => `${fact.key}=${fact.value}`).join("; ")}. Voice: ${briefing.brand.voice ?? "not recorded"}.`
      : "CONFIRMED BRAND FACTS: none recorded; do not assume any.",
  );
  lines.push(
    briefing.brand.prohibitedTerms.length
      ? `PROHIBITED TERMS: ${briefing.brand.prohibitedTerms.join(", ")}.`
      : "PROHIBITED TERMS: none recorded.",
  );
  lines.push(`USAGE: period ${briefing.usage.period}; approved deliveries ${briefing.usage.approvedDeliveries}${briefing.usage.allowance === null ? "" : ` of ${briefing.usage.allowance}`}.`);

  if (briefing.evidenceCatalogue.length) {
    lines.push("EVIDENCE CATALOGUE (cite these ids when using a measured fact):");
    for (const entry of briefing.evidenceCatalogue) {
      const ref = entry.ref;
      lines.push(`- ${entry.id} :: ${ref.factType} :: ${ref.label} = ${ref.value} :: ${ref.source} :: observed ${ref.observedAt} :: scan ${ref.scanId}`);
    }
  } else {
    lines.push("EVIDENCE CATALOGUE: empty — there is no snapshot evidence to cite.");
  }

  lines.push("LIMITATION: revenue, bookings, rankings and customer intent are Unknown unless the row above measures them; an unavailable source is not a zero.");
  return lines.join("\n");
}

const GOOGLE_STATE_TEXT: Record<"active" | "expired" | "revoked" | "error", LocalizedText> = {
  active: localized("Connected", "\u5df2\u9023\u63a5", "\u5df2\u9023\u7dda"),
  expired: localized("Connection expired", "\u9023\u63a5\u5df2\u904e\u671f", "\u9023\u7dda\u5df2\u904e\u671f"),
  revoked: localized("Connection revoked", "\u9023\u63a5\u5df2\u88ab\u6492\u92b7", "\u9023\u7dda\u5df2\u88ab\u6492\u92b7"),
  error: localized("Connection error", "\u9023\u63a5\u51fa\u932f", "\u9023\u7dda\u51fa\u932f"),
};

/** The read-only facts the context rail renders, formatted for the request locale. */
export function buildContextSummary(briefing: StudioBriefing, locale: PrototypeLocale): StudioContextSummary {
  const pendingInputs = briefing.openActions.filter((action) => action.missingInputs.length > 0).length;
  return {
    locationName: briefing.location?.name ?? null,
    latestScan: briefing.latestScan
      ? {
          score: briefing.latestScan.score === null ? null : `${Math.round(briefing.latestScan.score)}/100`,
          coverage: formatCoverage(briefing.latestScan.coverage),
          observedAt: briefing.latestScan.observedAt,
          observedLabel: formatDay(briefing.latestScan.observedAt, locale, briefing.workspace.timezone),
        }
      : null,
    openActions: briefing.openActions.map((action: StudioBriefingAction) => ({
      id: action.id,
      title: action.title,
      priority: priorityLabel(action.priority, locale),
      state: stateLabel(action.state, locale),
    })),
    waitingVersions: briefing.waitingVersions.length,
    google: briefing.google === null ? null : GOOGLE_STATE_TEXT[briefing.google][locale],
    pendingInputs,
    brandFactCount: briefing.brand.facts.length,
  };
}

/**
 * State-aware starting points (design §6.1). The copy table owns every string;
 * this function only decides which of the fixed starters apply to the current
 * briefing. Order is stable: priority, change, missing details, draft.
 */
export function studioPromptChips(briefing: StudioBriefing, locale: PrototypeLocale): StudioPromptChip[] {
  const copy = studioText(locale);
  const start = (id: string) => copy.empty.starters.find((starter) => starter.id === id) ?? null;
  const chips: StudioPromptChip[] = [];
  const push = (id: string) => {
    const starter = start(id);
    if (starter) chips.push({ id: starter.id, label: starter.label, message: starter.message });
  };

  push("starter_priorities");
  if (briefing.latestScan && briefing.change?.comparable) push("starter_changed");
  const pendingInputs = briefing.openActions.some((action) => action.missingInputs.length > 0) || briefing.waitingVersions.length > 0;
  if (pendingInputs) push("starter_missing");
  if (briefing.workspace.role !== "viewer" && briefing.openActions.length > 0) push("starter_draft");
  // The empty-state starters are the fallback when state filters them all out.
  if (!chips.length) for (const starter of copy.empty.starters.slice(0, 2)) push(starter.id);
  return chips;
}
