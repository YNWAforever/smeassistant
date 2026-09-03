import { buildAeoTrendModel, type AeoSnapshotRow, type AeoTrendModel } from "@/lib/trends/aeo-trend-model";
import { buildTrendModel, type StoredDiff, type TrendModel } from "@/lib/trends/history-model";
import { CLOSED_ACTION_STATES, localized, type ActionState, type FactType, type LocalizedText } from "@/lib/domain";
import { loadAuthorizedEvidence } from "@/lib/evidence/load-authorized";
import type { EvidenceGalleryItem } from "@/lib/report/view-model";
import { supabaseServer } from "@/lib/supabase/admin";
import { buildActionOverview, type ActionOverview, type ActionRow } from "@/lib/workspace/overview";
import { currentPeriod, type LocationSummary, type WorkspaceContext } from "@/lib/workspace/queries";
import { rowToSnapshot, type ScanDiffRow, type ScanSnapshotRow, type SnapshotRecord } from "@/lib/workspace/snapshots";
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
  nextScanAt: string | null;
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
}

export interface ActionDetail {
  action: ActionOverview;
  versions: VersionRow[];
  runs: RunRow[];
  measurements: MeasurementRow[];
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
  nextScans: Array<{ locationId: string | null; locationName: string | null; placeId: string; nextRunAt: string | null; cadence: string }>;
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

const TEMPLATE_CHANNEL = new Map<string, ActionFilters["channel"]>(TEMPLATES.map((t) => [t.key, t.channel]));
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

export async function loadSnapshotsForLocation(workspaceId: string, locationId: string, limit = 12): Promise<SnapshotRecord[]> {
  const { data, error } = await supabaseServer()
    .from("scan_snapshots")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("location_id", locationId)
    .order("observed_at", { ascending: false })
    .limit(limit)
    .returns<ScanSnapshotRow[]>();
  if (error) throw new Error("snapshots lookup failed");
  return (data ?? []).map(rowToSnapshot);
}

export async function loadDiffById(diffId: string | null): Promise<ScanDiffRow | null> {
  if (!diffId) return null;
  const { data, error } = await supabaseServer().from("scan_diffs").select("*").eq("id", diffId).maybeSingle<ScanDiffRow>();
  if (error) throw new Error("diff lookup failed");
  return data ?? null;
}

interface LatestRunRow { action_id: string; state: RunRow["state"]; created_at: string }
interface LatestVersionRow { id: string; action_id: string; version_no: number; approval_state: VersionRow["approval_state"]; delivery_state: VersionRow["delivery_state"]; created_at: string }

export async function loadActionRows(workspaceId: string, opts: { locationId?: string | null; states?: ActionState[]; ids?: string[] } = {}): Promise<ActionRow[]> {
  let query = supabaseServer().from("actions").select("*").eq("workspace_id", workspaceId);
  if (opts.locationId) query = query.or(`location_id.eq.${opts.locationId},location_id.is.null`);
  if (opts.states) query = query.in("action_state", opts.states);
  if (opts.ids) query = query.in("id", opts.ids);
  const { data, error } = await query.order("priority_score", { ascending: false }).order("updated_at", { ascending: false }).returns<ActionRow[]>();
  if (error) throw new Error("actions lookup failed");
  return data ?? [];
}

async function overviewsFor(ctx: WorkspaceContext, rows: ActionRow[]): Promise<ActionOverview[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const db = supabaseServer();
  const [runsResult, versionsResult] = await Promise.all([
    db.from("action_runs").select("action_id, state, created_at").in("action_id", ids).order("created_at", { ascending: false }).returns<LatestRunRow[]>(),
    db
      .from("output_versions")
      .select("id, action_id, version_no, approval_state, delivery_state, created_at")
      .in("action_id", ids)
      .order("version_no", { ascending: false })
      .returns<LatestVersionRow[]>(),
  ]);
  if (runsResult.error) throw new Error("runs lookup failed");
  if (versionsResult.error) throw new Error("versions lookup failed");
  const latestRun = new Map<string, LatestRunRow>();
  for (const run of runsResult.data ?? []) if (!latestRun.has(run.action_id)) latestRun.set(run.action_id, run);
  const latestVersion = new Map<string, LatestVersionRow>();
  for (const version of versionsResult.data ?? []) if (!latestVersion.has(version.action_id)) latestVersion.set(version.action_id, version);
  const byLocation = new Map(ctx.locations.map((l) => [l.id, l]));
  return rows.map((row) =>
    buildActionOverview(row, {
      location: row.location_id ? locationText(byLocation.get(row.location_id) ?? null) : null,
      latestRun: latestRun.get(row.id) ? { state: latestRun.get(row.id)!.state } : null,
      latestVersion: latestVersion.get(row.id) ?? null,
    }),
  );
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
  const db = supabaseServer();
  const { data: google, error } = await db
    .from("oauth_connections")
    .select("status, expires_at, updated_at, created_at")
    .eq("workspace_id", ctx.workspace.id)
    .eq("provider", "google_gbp")
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<Array<{ status: IntegrationsModel["google"]["status"]; expires_at: string | null; updated_at: string | null; created_at: string }>>();
  if (error) throw new Error("connections lookup failed");
  let snapshot = latest ?? null;
  if (snapshot === undefined || snapshot === null) {
    const primary = ctx.locations.find((l) => l.isPrimary) ?? ctx.locations[0];
    snapshot = primary ? (await loadSnapshotsForLocation(ctx.workspace.id, primary.id, 1))[0] ?? null : null;
  }
  const row = google?.[0];
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
  const db = supabaseServer();
  const location = resolveLocation(ctx, scope);
  const workspaceId = ctx.workspace.id;

  // "all" never aggregates: no snapshot, no score, actions across locations.
  const snapshots = location ? await loadSnapshotsForLocation(workspaceId, location.id, 2) : [];
  const snapshot = snapshots[0] ?? null;
  const diff = await loadDiffById(snapshot?.diffId ?? null);
  const changed = changedFrom(snapshot, diff);

  const openRows = await loadActionRows(workspaceId, { locationId: location?.id ?? null, states: OPEN_STATES });
  const scopedRows = location ? openRows : openRows;
  const openActions = await overviewsFor(ctx, scopedRows);
  const priority = openActions[0] ?? null;

  const period = currentPeriod(ctx.workspace.timezone);
  const periodStart = `${period}-01T00:00:00Z`;
  const [proofResult, draftsResult, completedResult, scheduleResult] = await Promise.all([
    db
      .from("action_measurements")
      .select("metric_key, before_value, after_value, delta, fact_type, window_days, created_at, action_id")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<MeasurementRow[]>(),
    db.from("output_versions").select("id, actions!inner(workspace_id)").eq("actions.workspace_id", workspaceId).eq("approval_state", "draft").returns<Array<{ id: string }>>(),
    db
      .from("actions")
      .select("id, measurement_state, completed_at")
      .eq("workspace_id", workspaceId)
      .eq("action_state", "completed")
      .gte("completed_at", periodStart)
      .returns<Array<{ id: string; measurement_state: string; completed_at: string | null }>>(),
    location?.placeId
      ? db.from("scan_schedules").select("next_run_at").eq("place_id", location.placeId).maybeSingle<{ next_run_at: string | null }>()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const proofRow = proofResult.data?.[0] ?? null;
  const drafts = draftsResult.data?.length ?? 0;
  const completed = completedResult.data ?? [];
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
    nextScanAt: scheduleResult.data?.next_run_at ?? null,
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

export async function getAction(ctx: WorkspaceContext, actionId: string): Promise<ActionDetail | null> {
  const rows = await loadActionRows(ctx.workspace.id, { ids: [actionId] });
  const row = rows[0];
  if (!row || row.workspace_id !== ctx.workspace.id) return null;
  const [action] = await overviewsFor(ctx, [row]);
  const db = supabaseServer();
  const [versions, runs, measurements] = await Promise.all([
    db.from("output_versions").select("*").eq("action_id", actionId).order("version_no", { ascending: false }).returns<VersionRow[]>(),
    db.from("action_runs").select("*").eq("action_id", actionId).order("created_at", { ascending: false }).returns<RunRow[]>(),
    db.from("action_measurements").select("*").eq("action_id", actionId).order("created_at", { ascending: false }).returns<MeasurementRow[]>(),
  ]);
  if (versions.error || runs.error || measurements.error) throw new Error("action detail lookup failed");
  return { action, versions: versions.data ?? [], runs: runs.data ?? [], measurements: measurements.data ?? [] };
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
    const diff = await loadDiffById(latest?.diffId ?? null);
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
    };
  }

  const snapshots = await loadSnapshotsForLocation(ctx.workspace.id, location.id, 12);
  const diffs = new Map<string, ScanDiffRow | null>();
  for (const snapshot of snapshots) diffs.set(snapshot.id, await loadDiffById(snapshot.diffId));
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

  const db = supabaseServer();
  const jobIds = snapshots.map((s) => s.jobId);
  const aeoRows = jobIds.length
    ? await db.from("aeo_surface_snapshots").select("job_id, surface, cited, captured_at").in("job_id", jobIds).returns<AeoSnapshotRow[]>()
    : { data: [], error: null };
  if (aeoRows.error) throw new Error("aeo rows lookup failed");

  return {
    locationSlug: location.slug,
    location,
    series,
    trend: buildTrendModel(toStoredDiff(headDiff)),
    aeoTrend: buildAeoTrendModel(aeoRows.data ?? []),
    metricCards: metricCards(head, base, Boolean(headDiff?.comparable)),
    ledger: headDiff ? { resolved: headDiff.resolved_findings, regressed: headDiff.regressed_findings, decayed: headDiff.decayed_findings } : { resolved: [], regressed: [], decayed: [] },
    perLocation,
  };
}

// ---------------------------------------------------------------------------
// Activity, calendar, notifications
// ---------------------------------------------------------------------------

export async function getActivity(ctx: WorkspaceContext, opts: { limit?: number } = {}): Promise<AuditEventRow[]> {
  const { data, error } = await supabaseServer()
    .from("audit_events")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100)
    .returns<AuditEventRow[]>();
  if (error) throw new Error("activity lookup failed");
  return data ?? [];
}

export async function getCalendar(ctx: WorkspaceContext): Promise<CalendarModel> {
  const db = supabaseServer();
  const placeIds = ctx.locations.map((l) => l.placeId).filter((p): p is string => Boolean(p));
  const [schedules, rows] = await Promise.all([
    placeIds.length
      ? db.from("scan_schedules").select("place_id, cadence, next_run_at").in("place_id", placeIds).returns<Array<{ place_id: string; cadence: string; next_run_at: string | null }>>()
      : Promise.resolve({ data: [], error: null }),
    loadActionRows(ctx.workspace.id, { states: OPEN_STATES }),
  ]);
  if (schedules.error) throw new Error("schedules lookup failed");
  const byPlace = new Map(ctx.locations.filter((l) => l.placeId).map((l) => [l.placeId as string, l]));
  const dueRows = rows.filter((r) => r.due_at).sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));
  return {
    nextScans: (schedules.data ?? []).map((s) => ({
      locationId: byPlace.get(s.place_id)?.id ?? null,
      locationName: byPlace.get(s.place_id)?.name ?? null,
      placeId: s.place_id,
      nextRunAt: s.next_run_at,
      cadence: s.cadence,
    })),
    dueActions: await overviewsFor(ctx, dueRows),
  };
}

export async function getNotifications(ctx: WorkspaceContext): Promise<NotificationsModel> {
  const db = supabaseServer();
  const [inApp, prefs] = await Promise.all([
    db
      .from("workspace_notifications")
      .select("id, kind, title, body, href, read_at, created_at")
      .eq("workspace_id", ctx.workspace.id)
      .eq("user_id", ctx.membership.userId)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<NotificationRow[]>(),
    db
      .from("workspaces")
      .select("notify_rescan_complete, notify_regression_alert, notify_monthly_digest")
      .eq("id", ctx.workspace.id)
      .maybeSingle<{ notify_rescan_complete: boolean | null; notify_regression_alert: boolean | null; notify_monthly_digest: boolean | null }>(),
  ]);
  if (inApp.error || prefs.error) throw new Error("notifications lookup failed");
  return {
    inApp: inApp.data ?? [],
    email: {
      rescanComplete: prefs.data?.notify_rescan_complete ?? true,
      regressionAlert: prefs.data?.notify_regression_alert ?? true,
      monthlyDigest: prefs.data?.notify_monthly_digest ?? true,
    },
  };
}

/** Template channel lookup shared with the actions page filter. */
export function channelOf(templateKey: TemplateKey): ActionFilters["channel"] {
  return TEMPLATE_CHANNEL.get(templateKey);
}
