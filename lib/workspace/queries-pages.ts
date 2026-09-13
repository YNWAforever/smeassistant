import { buildAeoTrendModel, type AeoTrendModel } from "@/lib/trends/aeo-trend-model";
import { buildTrendModel, type StoredDiff, type TrendModel } from "@/lib/trends/history-model";
import { CLOSED_ACTION_STATES, localized, type ActionState, type FactType, type LocalizedText } from "@/lib/domain";
import { loadAuthorizedEvidence } from "@/lib/evidence/load-authorized";
import type { EvidenceGalleryItem } from "@/lib/report/view-model";
import { inLocationScope, type Membership } from "@/lib/auth";
import { artifactRepository } from "@/lib/repositories/artifacts";
import { assetRepository } from "@/lib/repositories/assets";
import { getBrand, type BrandProfile } from "@/lib/workspace/brand";
import { deriveFaqQuestions } from "@/lib/workspace/faq-questions";
import { workspaceReadRepository } from "@/lib/repositories/workspace-read";
import type { GuardrailFlag, VersionOrigin } from "@/lib/workspace/version-meta";
import { filterSelectedReviews, scannedReviewKey, selectScannedReviews } from "@/lib/workspace/evidence-inputs";
import { buildActionOverview, type ActionOverview, type ActionRow } from "@/lib/workspace/overview";
import { currentPeriod, type LocationSummary, type WorkspaceContext } from "@/lib/workspace/queries";
import { reapStrandedRuns } from "@/lib/workspace/run-reaper";
import { rowToSnapshot, type ScanDiffRow, type SnapshotRecord } from "@/lib/workspace/snapshots";
import { TEMPLATES, type TemplateKey } from "@/lib/workspace/templates";
import type { MetricKey } from "@/lib/workspace/metrics";

/**
 * Page read models for the workspace (CLAUDE.md Phase 3 item 3, §3.5.5).
 * Same rules as lib/workspace/queries.ts: the caller has already been
 * authorised; every number is copied from the table that owns it; nothing is
 * aggregated across locations (guardrail 2: "never a fabricated aggregate").
 */
export type LocationScope = string | "all";

export interface HomeChanged {
  factType: FactType;
  delta: number | null;
  base: number | null;
  head: number | null;
  reason: string | null;
  comparable: boolean;
}

export interface HomeProof {
  factType: FactType;
  metricKey: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  windowDays: number | null;
  observedAt: string;
}

export interface HomeBrief {
  locationSlug: LocationScope;
  location: LocationSummary | null;
  snapshot: SnapshotRecord | null;
  changed: HomeChanged;
  priority: ActionOverview | null;
  openActions: ActionOverview[];
  proof: HomeProof | null;
  month: { resolved: number; regressed: number; awaitingApproval: number; completed: number; measured: number };
  /**
   * Day of the month the location's monthly rescan cadence falls on, or null
   * when no cadence is recorded. Deliberately not a date: nothing dispatches a
   * due `scan_schedules` row and `next_run_at` is never advanced, so a date
   * would name a run that is not coming.
   */
  rescanCadenceDay: number | null;
  drafts: number;
  agentStrip: { scout: boolean; priority: boolean; drafts: number; awaiting: number };
  ledger: { resolved: string[]; regressed: string[]; decayed: string[] };
  integrations: IntegrationsModel;
  /** Signed evidence (300 s URLs) for the snapshot's job, newest first, at most HOME_EVIDENCE_LIMIT; empty when none or unavailable. */
  evidence: EvidenceGalleryItem[];
}

export const HOME_EVIDENCE_LIMIT = 6;

/** Best-effort: the Home brief must render even when the evidence bucket is unreachable. */
export async function loadHomeEvidence(jobId: string | null): Promise<EvidenceGalleryItem[]> {
  if (!jobId) return [];
  try {
    const gallery = await loadAuthorizedEvidence(jobId);
    return gallery.items.slice(0, HOME_EVIDENCE_LIMIT);
  } catch (cause) {
    console.error("[workspace/home] evidence unavailable", { category: "home_evidence_failed", message: cause instanceof Error ? cause.message : "unknown" });
    return [];
  }
}

export interface ActionFilters {
  location?: LocationScope;
  view?: "all" | "needs_input" | "drafts" | "awaiting_approval" | "completed";
  channel?: "google" | "instagram" | "website" | "search_ai";
  status?: ActionState;
}

export interface ActionListResult {
  actions: ActionOverview[];
  counts: Record<NonNullable<ActionFilters["view"]>, number>;
}

export interface VersionRow {
  id: string;
  action_id: string;
  version_no: number;
  body: string;
  alt_text: string | null;
  author_type: "user" | "agent";
  author_user_id: string | null;
  approval_state: ActionOverview["approvalState"];
  delivery_state: ActionOverview["deliveryState"];
  approved_at: string | null;
  reviewer_comment: string | null;
  created_at: string;
  /**
   * Parsed from `output_versions.meta` by the repository (see
   * lib/workspace/version-meta.ts). The raw blob deliberately does not travel:
   * it is unconstrained jsonb, and the approver only needs the classification.
   */
  origin: VersionOrigin;
  agentKey: string | null;
  checked: boolean;
  guardrails: GuardrailFlag[];
  agentNotes: string[];
  acceptanceCriteria: string[];
}

export interface RunRow {
  id: string;
  action_id: string;
  agent_key: string;
  state: ActionOverview["runState"];
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface MeasurementRow {
  id: string;
  action_id: string;
  metric_key: string;
  before_value: number | string | null;
  after_value: number | string | null;
  delta: number | string | null;
  fact_type: FactType;
  window_days: number | null;
  created_at: string;
  /** The after-snapshot's location; NULL for a workspace-wide action. */
  location_id: string | null;
}

/**
 * Evidence the scan already collected for an input the template asks for, so
 * the detail page can show it instead of a blank form. Always `Observed`: these
 * are the exact excerpts the agent will receive, read from the same
 * `audit_jobs.raw_data` through the same selector.
 */
export interface ScanInputEvidence {
  key: "reviews_without_response";
  source: "gbp_reviews";
  factType: FactType;
  snapshotId: string | null;
  jobId: string;
  observedAt: string;
  /** `key` is the stable handle the owner's selection is stored against (P2.2, "selected-review replies"). */
  reviews: Array<{ key: string; rating: number | null; excerpt: string; time: string | null }>;
  /**
   * The keys the next draft will actually use, resolved through the same
   * `filterSelectedReviews` the run path applies -- so the checkboxes cannot
   * disagree with what the agent receives, including the fallback where a
   * stored selection has gone stale against a newer scan.
   */
  selected: string[];
  /** Unanswered reviews the agent will draft from. */
  available: number;
  /** Reviews the scan RETAINED (capped at 3), not the 5 metrics inspects. */
  inspected: number;
  /** What Google reported in total, when the snapshot measured it. */
  populationCount: number | null;
}

/**
 * P2.3 item 17: a compact "business details used" summary shown before
 * generation, so an owner can see -- and, via a link to Brand settings, fix
 * -- exactly what the next draft will be grounded in, instead of finding out
 * only from the post-generation brand-check-panel badge.
 */
export interface BusinessContextRow {
  key:
    | "workspace"
    | "location"
    | "market"
    | "brand_voice"
    | "approved_claims"
    | "prohibited_terms"
    | "languages"
    | "asset_rights"
    | "snapshot_observed_at";
  label: LocalizedText;
  value: LocalizedText;
  /** Where this row's value comes from, so a stale or wrong value points the owner at the right place to fix it. */
  origin: LocalizedText;
}

export type BusinessContextSummary = BusinessContextRow[];

/**
 * P2.3 item 11: the FAQ + JSON-LD template's three owner_fact_* inputs used
 * to render as unlabelled blank boxes. Empty for every other template.
 */
export interface FaqQuestionField {
  key: "owner_fact_1" | "owner_fact_2" | "owner_fact_3";
  question: LocalizedText;
  /** From brand_profiles.facts, when the brand already has an answer -- so the owner is not asked to retype it. */
  prefill: string | null;
}

export interface ActionDetail {
  action: ActionOverview;
  versions: VersionRow[];
  runs: RunRow[];
  measurements: MeasurementRow[];
  scanInputs: ScanInputEvidence[];
  businessContext: BusinessContextSummary;
  faqQuestions: FaqQuestionField[];
}

export interface InsightsSeriesPoint {
  snapshotId: string;
  observedAt: string;
  score: number | null;
  coverage: number;
  comparable: boolean;
  incomparableReason: string | null;
}

export interface MetricCard {
  metricKey: MetricKey;
  before: number | null;
  after: number | null;
  delta: number | null;
  factType: FactType;
  observedAt: string;
}

/**
 * P2.1 item 7: the approved/exported work itself, not only the scores and
 * checks it produced. `counted` deliveries only -- exactly the ones guardrail
 * 7 ("approved deliveries, not tokens") treats as real, so a repeat copy of
 * an already-exported version never shows twice.
 */
export interface DeliveredWorkRow {
  action_id: string;
  template_key: TemplateKey;
  title: LocalizedText;
  version_no: number;
  mode: "export" | "copy" | "publish";
  channel: string | null;
  delivered_at: string;
}

export interface InsightsLocationSummary {
  location: LocationSummary;
  score: number | null;
  coverage: number | null;
  comparable: boolean | null;
  observedAt: string | null;
}

export interface InsightsModel {
  locationSlug: LocationScope;
  location: LocationSummary | null;
  series: InsightsSeriesPoint[];
  trend: TrendModel;
  aeoTrend: AeoTrendModel;
  metricCards: MetricCard[];
  ledger: { resolved: string[]; regressed: string[]; decayed: string[] };
  perLocation: InsightsLocationSummary[];
  deliveries: DeliveredWorkRow[];
}

export interface AuditEventRow {
  id: number;
  workspace_id: string | null;
  location_id: string | null;
  actor_type: "user" | "agent" | "system" | "scanner";
  actor_id: string | null;
  event: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface IntegrationsModel {
  google: { status: "active" | "expired" | "revoked" | "error" | "not_connected"; expiresAt: string | null; updatedAt: string | null };
  instagram: { handle: string | null; state: SnapshotRecord["moduleStates"]["instagram"]["status"] | "unknown"; limitationCode: string | null };
  website: { state: SnapshotRecord["moduleStates"]["website"]["status"] | "unknown"; checksPassed: number | null; checksEvaluated: number | null; observedAt: string | null };
}

export interface CalendarModel {
  nextScans: Array<{ locationId: string | null; locationName: string | null; placeId: string; anniversaryDay: number | null; cadence: string }>;
  dueActions: ActionOverview[];
}

export interface NotificationRow {
  id: string;
  kind: string;
  title: LocalizedText;
  body: LocalizedText | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationsModel {
  inApp: NotificationRow[];
  email: { rescanComplete: boolean; regressionAlert: boolean; monthlyDigest: boolean };
}

/**
 * The recurring day of the month a monthly cadence falls on. `anniversary_day`
 * is `smallint NOT NULL` constrained to 1..28, so it is authoritative; the
 * `next_run_at` fallback covers a row written by something other than this app.
 * A paused cadence has no day to show.
 */
function cadenceDay(schedule: { cadence: string; anniversary_day: number | null; next_run_at: string | null } | null): number | null {
  if (!schedule || schedule.cadence !== "monthly") return null;
  if (schedule.anniversary_day && schedule.anniversary_day >= 1 && schedule.anniversary_day <= 28) return schedule.anniversary_day;
  const parsed = schedule.next_run_at ? new Date(schedule.next_run_at) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.getUTCDate() : null;
}

const TEMPLATE_CHANNEL = new Map<string, ActionFilters["channel"]>(TEMPLATES.map((t) => [t.key, t.channel]));
const TEMPLATE_REQUIRES_ASSET = new Set<string>(TEMPLATES.filter((t) => t.requiredInputs.includes("asset_or_text_only")).map((t) => t.key));
const NONE_SAVED = localized("None saved", "尚未儲存", "尚未儲存");
const FROM_BRAND_SETTINGS = localized("From Brand settings", "來自品牌設定", "來自品牌設定");
const FROM_WORKSPACE_RECORD = localized("From the workspace record", "來自工作台記錄", "來自工作台紀錄");
const FROM_LATEST_SCAN = localized("From the latest scan", "來自最新掃描", "來自最新掃描");
const FROM_ASSETS = localized("From Assets", "來自素材", "來自素材");
const ASSET_RIGHTS_LABEL: Record<string, LocalizedText> = {
  approved: localized("Approved", "已核准", "已核准"),
  needs_review: localized("Needs review", "需要審閱", "需要審閱"),
  rejected: localized("Rejected", "已拒絕", "已拒絕"),
};

/** P2.3 item 17. Reads the same brand profile and asset the agent prompt itself will use, so this can never show a different value than what generation actually grounds on. */
async function buildBusinessContext(ctx: WorkspaceContext, row: ActionRow, action: ActionOverview, brand: BrandProfile): Promise<BusinessContextSummary> {
  const location = ctx.locations.find((l) => l.id === row.location_id) ?? null;
  const marketLabel = ctx.workspace.market === "tw" ? localized("Taiwan (TWD)", "台灣（新台幣）", "台灣（新台幣）") : localized("Hong Kong (HKD)", "香港（港元）", "香港（港元）");
  const rows: BusinessContextRow[] = [
    { key: "workspace", label: localized("Workspace", "工作台", "工作台"), value: localized(ctx.workspace.name, ctx.workspace.name), origin: FROM_WORKSPACE_RECORD },
    {
      key: "location",
      label: localized("Location", "地點", "據點"),
      value: location ? localized(location.name, location.name) : localized("All locations", "所有地點", "所有據點"),
      origin: FROM_WORKSPACE_RECORD,
    },
    { key: "market", label: localized("Market", "市場", "市場"), value: marketLabel, origin: FROM_WORKSPACE_RECORD },
    { key: "brand_voice", label: localized("Brand voice", "品牌語氣", "品牌語氣"), value: localized(brand.voice, brand.voice), origin: FROM_BRAND_SETTINGS },
    {
      key: "approved_claims",
      label: localized("Approved claims", "已核准聲稱", "已核准聲明"),
      value: brand.approvedClaims.length ? localized(brand.approvedClaims.join(" · "), brand.approvedClaims.join(" · ")) : NONE_SAVED,
      origin: FROM_BRAND_SETTINGS,
    },
    {
      key: "prohibited_terms",
      label: localized("Prohibited terms", "禁用字詞", "禁用字詞"),
      value: brand.prohibitedTerms.length ? localized(brand.prohibitedTerms.join(" · "), brand.prohibitedTerms.join(" · ")) : NONE_SAVED,
      origin: FROM_BRAND_SETTINGS,
    },
    {
      key: "languages",
      label: localized("Languages", "語言", "語言"),
      value: brand.languages.length ? localized(brand.languages.join(", "), brand.languages.join(", ")) : NONE_SAVED,
      origin: FROM_BRAND_SETTINGS,
    },
    {
      key: "snapshot_observed_at",
      label: localized("Evidence observed", "證據觀察時間", "證據觀察時間"),
      value: localized(action.evidence.observedAt, action.evidence.observedAt),
      origin: FROM_LATEST_SCAN,
    },
  ];
  if (TEMPLATE_REQUIRES_ASSET.has(row.template_key)) {
    const provided = row.provided_inputs && typeof row.provided_inputs === "object" ? (row.provided_inputs as Record<string, unknown>) : {};
    if (provided.text_only === true) {
      rows.push({
        key: "asset_rights",
        label: localized("Asset", "素材", "素材"),
        value: localized("Text-only post; no asset attached", "純文字貼文，未附素材", "純文字貼文，未附素材"),
        origin: FROM_ASSETS,
      });
    } else {
      const assetId = typeof provided.asset_id === "string" ? provided.asset_id : null;
      const asset = assetId ? await assetRepository().get(ctx.workspace.id, assetId) : null;
      rows.push({
        key: "asset_rights",
        label: localized("Asset rights", "素材版權", "素材版權"),
        value: asset
          ? { en: `${asset.filename} · ${ASSET_RIGHTS_LABEL[asset.rights_status]?.en ?? asset.rights_status}`, "zh-HK": `${asset.filename} · ${ASSET_RIGHTS_LABEL[asset.rights_status]?.["zh-HK"] ?? asset.rights_status}`, "zh-TW": `${asset.filename} · ${ASSET_RIGHTS_LABEL[asset.rights_status]?.["zh-TW"] ?? asset.rights_status}` }
          : localized("No asset selected yet", "尚未選擇素材", "尚未選擇素材"),
        origin: FROM_ASSETS,
      });
    }
  }
  return rows;
}

/**
 * P2.3 item 11. Derives the same three questions runAgentForAction derives
 * for the prompt (lib/workspace/runs.ts), reading the referenced snapshot's
 * website checks and un-cited AEO queries through the same artifactRepository
 * methods, so the detail page's labels and prefills can never disagree with
 * what generation actually grounds on.
 */
async function buildFaqQuestions(ctx: WorkspaceContext, row: ActionRow, brand: BrandProfile): Promise<FaqQuestionField[]> {
  if (row.template_key !== "visibility-content" || !row.source_snapshot_id) return [];
  const artifacts = artifactRepository();
  const snapshot = await artifacts.assistantSnapshot(ctx.workspace.id, row.source_snapshot_id);
  if (!snapshot) return [];
  const aeoQueries = await artifacts.assistantAeoQueries(ctx.workspace.id, snapshot.jobId);
  const questions = deriveFaqQuestions({
    failingWebsiteChecks: (snapshot.websiteChecks?.results ?? []).filter((r) => !r.pass).map((r) => r.key),
    aeoQueries,
  });
  return questions.map((q) => ({
    key: q.key,
    question: q.question,
    prefill: q.brandFactKey ? brand.facts[q.brandFactKey] ?? null : null,
  }));
}

const OPEN_STATES: ActionState[] = ["recommended", "needs_input", "ready", "in_progress"];
const METRIC_CARD_KEYS: MetricKey[] = ["gbp.response_rate_pct", "gbp.rating", "ig.days_since_last_post", "aeo.ai_citation_count", "website.checks_passed"];

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function resolveLocation(ctx: WorkspaceContext, scope: LocationScope): LocationSummary | null {
  if (scope === "all") return null;
  return ctx.locations.find((l) => l.slug === scope) ?? ctx.locations.find((l) => l.isPrimary) ?? ctx.locations[0] ?? null;
}

function locationText(location: LocationSummary | null): { id: string | null; slug: string; name: LocalizedText } {
  if (!location) return { id: null, slug: "all", name: localized("All locations", "所有地點") };
  return { id: location.id, slug: location.slug, name: localized(location.name, location.name) };
}

// ---------------------------------------------------------------------------
// Loaders (service role; rows only)
// ---------------------------------------------------------------------------

async function read<T>(label: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch {
    throw new Error(`${label} lookup failed`);
  }
}

export async function loadSnapshotsForLocation(workspaceId: string, locationId: string, limit = 12): Promise<SnapshotRecord[]> {
  const rows = await read("snapshots", () => workspaceReadRepository().snapshots(workspaceId, locationId, limit));
  return rows.map(rowToSnapshot);
}

export async function loadDiffById(diffId: string | null, workspaceId: string, headJobId: string | null): Promise<ScanDiffRow | null> {
  if (!diffId || !headJobId) return null;
  return read("diff", () => workspaceReadRepository().diff(diffId, workspaceId, headJobId));
}

export async function loadActionRows(workspaceId: string, opts: { locationId?: string | null; states?: ActionState[]; ids?: string[] } = {}): Promise<ActionRow[]> {
  return read("actions", () => workspaceReadRepository().actions(workspaceId, opts));
}

async function overviewsFor(ctx: WorkspaceContext, rows: ActionRow[], scanSatisfiedInputs?: readonly string[]): Promise<ActionOverview[]> {
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const repository = workspaceReadRepository();
  const [runs, versions] = await Promise.all([
    read("runs", () => repository.runs(ctx.workspace.id, ids)),
    read("versions", () => repository.versions(ctx.workspace.id, ids)),
  ]);
  const latestRun = new Map<string, RunRow>();
  for (const run of runs) if (!latestRun.has(run.action_id)) latestRun.set(run.action_id, run);
  const latestVersion = new Map<string, VersionRow>();
  for (const version of versions) if (!latestVersion.has(version.action_id)) latestVersion.set(version.action_id, version);
  const byLocation = new Map(ctx.locations.map(location => [location.id, location]));
  return rows.map(row => buildActionOverview(row, {
    location: row.location_id ? locationText(byLocation.get(row.location_id) ?? null) : null,
    latestRun: latestRun.get(row.id) ?? null,
    latestVersion: latestVersion.get(row.id) ?? null,
    scanSatisfiedInputs,
  }));
}

function changedFrom(snapshot: SnapshotRecord | null, diff: ScanDiffRow | null): HomeChanged {
  if (!snapshot || !diff) return { factType: "Unknown", delta: null, base: null, head: snapshot?.overallScore ?? null, reason: diff ? null : "NO_DIFF", comparable: false };
  if (!diff.comparable) return { factType: "Unknown", delta: null, base: num(diff.composite_base), head: num(diff.composite_head), reason: diff.incomparable_reason, comparable: false };
  if (diff.composite_withheld_reason) return { factType: "Unknown", delta: null, base: num(diff.composite_base), head: num(diff.composite_head), reason: diff.composite_withheld_reason, comparable: true };
  return { factType: "Observed", delta: num(diff.composite_delta), base: num(diff.composite_base), head: num(diff.composite_head), reason: null, comparable: true };
}

function toStoredDiff(diff: ScanDiffRow | null): StoredDiff | null {
  if (!diff) return null;
  return {
    comparable: diff.comparable,
    incomparable_reason: diff.incomparable_reason,
    composite_withheld_reason: diff.composite_withheld_reason,
    composite_base: num(diff.composite_base),
    composite_head: num(diff.composite_head),
    composite_delta: num(diff.composite_delta),
    resolved_findings: diff.resolved_findings,
    regressed_findings: diff.regressed_findings,
    decayed_findings: diff.decayed_findings,
    lost_coverage: diff.lost_coverage,
    gained_coverage: diff.gained_coverage,
    created_at: diff.created_at,
  };
}

// ---------------------------------------------------------------------------
// Integrations (also embedded in the home brief)
// ---------------------------------------------------------------------------

export async function getIntegrations(ctx: WorkspaceContext, latest?: SnapshotRecord | null): Promise<IntegrationsModel> {
  const row = await read("connections", () => workspaceReadRepository().latestConnection(ctx.workspace.id));
  let snapshot = latest ?? null;
  if (snapshot === undefined || snapshot === null) {
    const primary = ctx.locations.find((l) => l.isPrimary) ?? ctx.locations[0];
    snapshot = primary ? (await loadSnapshotsForLocation(ctx.workspace.id, primary.id, 1))[0] ?? null : null;
  }
  return {
    google: { status: row?.status ?? "not_connected", expiresAt: row?.expires_at ?? null, updatedAt: row?.updated_at ?? row?.created_at ?? null },
    instagram: {
      handle: ctx.workspace.instagramHandle,
      state: snapshot?.moduleStates.instagram.status ?? "unknown",
      limitationCode: snapshot?.moduleStates.instagram.limitationCode ?? null,
    },
    website: {
      state: snapshot?.moduleStates.website.status ?? "unknown",
      checksPassed: snapshot?.websiteChecks?.passed ?? null,
      checksEvaluated: snapshot?.websiteChecks?.evaluated ?? null,
      observedAt: snapshot?.observedAt ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Home brief (§3.5.5)
// ---------------------------------------------------------------------------

export async function getHomeBrief(ctx: WorkspaceContext, scope: LocationScope): Promise<HomeBrief> {
  const repository = workspaceReadRepository();
  const location = resolveLocation(ctx, scope);
  const workspaceId = ctx.workspace.id;

  // "all" never aggregates: no snapshot, no score, actions across locations.
  const snapshots = location ? await loadSnapshotsForLocation(workspaceId, location.id, 2) : [];
  const snapshot = snapshots[0] ?? null;
  const diff = await loadDiffById(snapshot?.diffId ?? null, workspaceId, snapshot?.jobId ?? null);
  const changed = changedFrom(snapshot, diff);

  const openRows = await loadActionRows(workspaceId, { locationId: location?.id ?? null, states: OPEN_STATES });
  const scopedRows = location ? openRows : openRows;
  const openActions = await overviewsFor(ctx, scopedRows);
  const priority = openActions[0] ?? null;

  const period = currentPeriod(ctx.workspace.timezone);
  const periodStart = `${period}-01T00:00:00Z`;
  const [measurements, draftVersions, completed, schedules] = await read("home", () => Promise.all([
    // Scoped to the same location as the rest of the brief. These three were
    // workspace-wide while the snapshot, diff, open actions and schedule beside
    // them were location-scoped, so under a location the proof card could show
    // another shop's outcome and the month counters counted every location.
    // Under ?location=all `location` is null and every predicate short-circuits,
    // preserving today's behaviour by construction.
    repository.measurements(workspaceId, undefined, 1, location?.id ?? null),
    repository.draftVersions(workspaceId, location?.id ?? null),
    repository.completedActions(workspaceId, periodStart, location?.id ?? null),
    location?.placeId ? repository.schedules(workspaceId, [location.placeId]) : Promise.resolve([]),
  ]));
  const proofRow = measurements[0] ?? null;
  const drafts = draftVersions.length;
  const [integrations, evidence] = await Promise.all([getIntegrations(ctx, snapshot), loadHomeEvidence(snapshot?.jobId ?? null)]);

  return {
    locationSlug: location ? location.slug : "all",
    location,
    snapshot,
    changed,
    priority,
    openActions,
    proof: proofRow
      ? {
          factType: proofRow.fact_type,
          metricKey: proofRow.metric_key,
          before: num(proofRow.before_value),
          after: num(proofRow.after_value),
          delta: num(proofRow.delta),
          windowDays: proofRow.window_days,
          observedAt: proofRow.created_at,
        }
      : null,
    month: {
      resolved: diff?.comparable ? diff.resolved_findings.length : 0,
      regressed: diff?.comparable ? diff.regressed_findings.length : 0,
      awaitingApproval: drafts,
      completed: completed.length,
      measured: completed.filter((row) => row.measurement_state === "measured").length,
    },
    rescanCadenceDay: cadenceDay(schedules[0] ?? null),
    drafts,
    agentStrip: { scout: Boolean(snapshot), priority: openActions.length > 0, drafts, awaiting: drafts },
    ledger: diff ? { resolved: diff.resolved_findings, regressed: diff.regressed_findings, decayed: diff.decayed_findings } : { resolved: [], regressed: [], decayed: [] },
    integrations,
    evidence,
  };
}

// ---------------------------------------------------------------------------
// Actions list + detail
// ---------------------------------------------------------------------------

function matchesView(action: ActionOverview, view: NonNullable<ActionFilters["view"]>): boolean {
  switch (view) {
    case "needs_input":
      return action.actionState === "needs_input";
    case "drafts":
      return action.displayPhaseKey === "draft_ready" || action.displayPhaseKey === "generating";
    case "awaiting_approval":
      return action.displayPhaseKey === "draft_ready" || action.displayPhaseKey === "changes_requested";
    case "completed":
      return action.actionState === "completed";
    default:
      return true;
  }
}

export async function listActions(ctx: WorkspaceContext, filters: ActionFilters): Promise<ActionListResult> {
  const location = resolveLocation(ctx, filters.location ?? "all");
  const states = filters.view === "completed" ? (["completed"] as ActionState[]) : filters.status ? [filters.status] : filters.view && filters.view !== "all" ? OPEN_STATES : undefined;
  const rows = await loadActionRows(ctx.workspace.id, { locationId: location?.id ?? null, states });
  const all = await overviewsFor(ctx, rows);
  const open = all.filter((a) => !CLOSED_ACTION_STATES.includes(a.actionState));
  const counts: ActionListResult["counts"] = {
    all: open.length,
    needs_input: open.filter((a) => matchesView(a, "needs_input")).length,
    drafts: open.filter((a) => matchesView(a, "drafts")).length,
    awaiting_approval: open.filter((a) => matchesView(a, "awaiting_approval")).length,
    completed: all.filter((a) => a.actionState === "completed").length,
  };
  let actions = filters.view === "completed" ? all.filter((a) => a.actionState === "completed") : filters.status ? all : open;
  if (filters.view && filters.view !== "all" && filters.view !== "completed") actions = actions.filter((a) => matchesView(a, filters.view!));
  if (filters.channel) actions = actions.filter((a) => TEMPLATE_CHANNEL.get(a.templateKey) === filters.channel);
  if (filters.status) actions = actions.filter((a) => a.actionState === filters.status);
  return { actions, counts };
}

/** Non-throwing template lookup: an unknown persisted key must not 500 the page. */
const TEMPLATE_AGENT = new Map<string, string | null>(TEMPLATES.map((t) => [t.key, t.agentKey ?? null]));

/**
 * The reviews the draft will actually use, resolved live from stored evidence.
 *
 * Mirrors resolveActionRunContext (lib/workspace/runs.ts) exactly, including its
 * scope refusals: the same snapshot, the same workspace/location checks and the
 * same membership check. Without them a workspace-wide action pinned to another
 * location's snapshot would render that location's raw review text to an
 * out-of-scope manager -- precisely what the run path refuses.
 */
export async function loadScanInputEvidence(
  membership: Membership,
  workspaceId: string,
  row: ActionRow,
): Promise<ScanInputEvidence[]> {
  if (TEMPLATE_AGENT.get(row.template_key) !== "review_reply") return [];
  const db = artifactRepository();
  const snapshot = row.source_snapshot_id
    ? await db.assistantSnapshot(workspaceId, row.source_snapshot_id)
    : await db.assistantLatestSnapshot(workspaceId, row.location_id);
  if (!snapshot) return [];
  if (snapshot.workspaceId !== workspaceId) return [];
  if (row.location_id && snapshot.locationId !== row.location_id) return [];
  if (!inLocationScope(membership, snapshot.locationId)) return [];
  const selection = selectScannedReviews(await db.assistantReviewData(workspaceId, snapshot.jobId));
  if (!selection.sampled.length) return [];
  return [{
    key: "reviews_without_response",
    source: "gbp_reviews",
    factType: "Observed",
    snapshotId: snapshot.id,
    jobId: snapshot.jobId,
    observedAt: snapshot.observedAt,
    reviews: selection.sampled.map((review) => ({ key: scannedReviewKey(review), rating: review.rating, excerpt: review.text, time: review.time })),
    selected: filterSelectedReviews(
      selection.sampled,
      (row.provided_inputs && typeof row.provided_inputs === "object" ? (row.provided_inputs as Record<string, unknown>) : {}).selected_reviews,
    ).map(scannedReviewKey),
    available: selection.sampled.length,
    inspected: selection.inspected,
    populationCount: snapshot.metrics["gbp.reviews_count"] ?? null,
  }];
}

export async function getAction(ctx: WorkspaceContext, actionId: string): Promise<ActionDetail | null> {
  const rows = await loadActionRows(ctx.workspace.id, { ids: [actionId] });
  const row = rows[0];
  if (!row || row.workspace_id !== ctx.workspace.id) return null;
  // Reconcile runs stranded by a killed handler before anything reads them, so
  // the detail page never renders a permanently 'running' run and the Generate
  // button is never disabled forever. Ordering is load-bearing: overviewsFor
  // derives runState/displayPhaseKey from repository.runs, and the explicit
  // repository.runs call below must see the post-reap row. Both callers of
  // getAction are already authorized (loadOwnerPage -> requireMembership, and
  // authorizeActionMutation), and no minRole gate is added here: a viewer must
  // still be able to trigger reconciliation, which grants nobody anything.
  // See lib/workspace/run-reaper.ts.
  await reapStrandedRuns(ctx.workspace.id, [actionId]);
  const repository = workspaceReadRepository();
  const [versions, runs, measurements, scanInputs] = await read("action detail", () => Promise.all([
    repository.versions(ctx.workspace.id, [actionId]),
    repository.runs(ctx.workspace.id, [actionId]),
    repository.measurements(ctx.workspace.id, actionId),
    loadScanInputEvidence(ctx.membership, ctx.workspace.id, row),
  ]));
  // Resolved live, so a row derived before the evidence-aware rule stops
  // reporting an input the workspace can already answer.
  const [action] = await overviewsFor(ctx, [row], scanInputs.map((entry) => entry.key));
  const brand = await getBrand(ctx.workspace.id);
  const [businessContext, faqQuestions] = await Promise.all([
    buildBusinessContext(ctx, row, action, brand),
    buildFaqQuestions(ctx, row, brand),
  ]);
  return { action, versions, runs, measurements, scanInputs, businessContext, faqQuestions };
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

function metricCards(head: SnapshotRecord | null, base: SnapshotRecord | null, comparable: boolean): MetricCard[] {
  if (!head) return [];
  return METRIC_CARD_KEYS.map((metricKey) => {
    const after = head.metrics[metricKey] ?? null;
    const before = comparable && base ? base.metrics[metricKey] ?? null : null;
    const known = comparable && before !== null && after !== null;
    return {
      metricKey,
      before,
      after,
      delta: known ? Math.round((after - before) * 10) / 10 : null,
      factType: known ? "Observed" : "Unknown",
      observedAt: head.observedAt,
    };
  });
}

async function locationSummaries(ctx: WorkspaceContext): Promise<InsightsLocationSummary[]> {
  const out: InsightsLocationSummary[] = [];
  for (const location of ctx.locations) {
    const [latest] = await loadSnapshotsForLocation(ctx.workspace.id, location.id, 1);
    const diff = await loadDiffById(latest?.diffId ?? null, ctx.workspace.id, latest?.jobId ?? null);
    out.push({
      location,
      score: latest?.overallScore ?? null,
      coverage: latest ? latest.coverage : null,
      comparable: diff ? diff.comparable : null,
      observedAt: latest?.observedAt ?? null,
    });
  }
  return out;
}

export async function getInsights(ctx: WorkspaceContext, scope: LocationScope): Promise<InsightsModel> {
  const location = resolveLocation(ctx, scope);
  const perLocation = await locationSummaries(ctx);
  if (!location) {
    return {
      locationSlug: "all",
      location: null,
      series: [],
      trend: buildTrendModel(null),
      aeoTrend: buildAeoTrendModel([]),
      metricCards: [],
      ledger: { resolved: [], regressed: [], decayed: [] },
      perLocation,
      deliveries: [],
    };
  }

  const snapshots = await loadSnapshotsForLocation(ctx.workspace.id, location.id, 12);
  const diffs = new Map<string, ScanDiffRow | null>();
  for (const snapshot of snapshots) diffs.set(snapshot.id, await loadDiffById(snapshot.diffId, ctx.workspace.id, snapshot.jobId));
  const series: InsightsSeriesPoint[] = [...snapshots].reverse().map((snapshot) => {
    const diff = diffs.get(snapshot.id) ?? null;
    return {
      snapshotId: snapshot.id,
      observedAt: snapshot.observedAt,
      score: snapshot.overallScore,
      coverage: snapshot.coverage,
      comparable: Boolean(diff?.comparable),
      incomparableReason: diff && !diff.comparable ? diff.incomparable_reason : null,
    };
  });
  const head = snapshots[0] ?? null;
  const headDiff = head ? diffs.get(head.id) ?? null : null;
  const base = head?.comparableTo ? snapshots.find((s) => s.id === head.comparableTo) ?? null : null;

  const repository = workspaceReadRepository();
  const jobIds = snapshots.map((s) => s.jobId);
  const [aeoRows, deliveries] = await Promise.all([
    read("aeo rows", () => repository.aeoSnapshots(ctx.workspace.id, jobIds)),
    read("deliveries", () => repository.deliveries(ctx.workspace.id, location.id, 20)),
  ]);

  return {
    locationSlug: location.slug,
    location,
    series,
    trend: buildTrendModel(toStoredDiff(headDiff)),
    aeoTrend: buildAeoTrendModel(aeoRows),
    metricCards: metricCards(head, base, Boolean(headDiff?.comparable)),
    ledger: headDiff ? { resolved: headDiff.resolved_findings, regressed: headDiff.regressed_findings, decayed: headDiff.decayed_findings } : { resolved: [], regressed: [], decayed: [] },
    perLocation,
    deliveries,
  };
}

// ---------------------------------------------------------------------------
// Activity, calendar, notifications
// ---------------------------------------------------------------------------

export async function getActivity(ctx: WorkspaceContext, opts: { limit?: number } = {}): Promise<AuditEventRow[]> {
  return read("activity", () => workspaceReadRepository().activity(ctx.workspace.id, opts.limit ?? 100));
}

export async function getCalendar(ctx: WorkspaceContext): Promise<CalendarModel> {
  const repository = workspaceReadRepository();
  const placeIds = ctx.locations.map((l) => l.placeId).filter((p): p is string => Boolean(p));
  const [schedules, rows] = await Promise.all([
    read("schedules", () => repository.schedules(ctx.workspace.id, placeIds)),
    loadActionRows(ctx.workspace.id, { states: OPEN_STATES }),
  ]);
  const byPlace = new Map(ctx.locations.filter((l) => l.placeId).map((l) => [l.placeId as string, l]));
  const dueRows = rows.filter((r) => r.due_at).sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));
  return {
    nextScans: schedules.map((s) => ({
      locationId: byPlace.get(s.place_id)?.id ?? null,
      locationName: byPlace.get(s.place_id)?.name ?? null,
      placeId: s.place_id,
      anniversaryDay: cadenceDay(s),
      cadence: s.cadence,
    })),
    dueActions: await overviewsFor(ctx, dueRows),
  };
}

export async function getNotifications(ctx: WorkspaceContext): Promise<NotificationsModel> {
  const repository = workspaceReadRepository();
  const [inApp, prefs] = await read("notifications", () => Promise.all([
    repository.notifications(ctx.workspace.id, ctx.membership.userId),
    repository.notificationPreferences(ctx.workspace.id),
  ]));
  return {
    inApp,
    email: {
      rescanComplete: prefs?.notify_rescan_complete ?? true,
      regressionAlert: prefs?.notify_regression_alert ?? true,
      monthlyDigest: prefs?.notify_monthly_digest ?? true,
    },
  };
}

/** Template channel lookup shared with the actions page filter. */
export function channelOf(templateKey: TemplateKey): ActionFilters["channel"] {
  return TEMPLATE_CHANNEL.get(templateKey);
}
