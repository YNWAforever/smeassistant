import { completionId } from "@/lib/workspace/completion-id";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricKey } from "@/lib/workspace/metrics";
import { loadSnapshotById, type ScanDiffRow, type SnapshotRecord } from "@/lib/workspace/snapshots";
import type { TemplateKey } from "@/lib/workspace/templates";

/**
 * Action outcome measurements (CLAUDE.md Phase 6 item 2, §3.5.4). After a scan
 * whose `scan_diffs` row is comparable, every open or completed action for the
 * same location gets one `action_measurements` row: the template's metric
 * read from the base snapshot (before) and the head snapshot (after).
 *
 * The fact type is the whole point (guardrail 2 — never a fabricated
 * aggregate, never an implied causation):
 * - `Attributed` only when the action had an output exported *before* the
 *   head scan started (`output_versions.first_exported_at < head job
 *   created_at`), so the change could plausibly follow the merchant's work;
 * - `Observed` when both values exist but nothing was exported — the metric
 *   moved, and we say so, without claiming credit;
 * - `Unknown` when either snapshot lacks the metric (delta null, and the
 *   action is marked `insufficient_coverage`).
 *
 * Idempotent per (action, head snapshot): a rebuilt snapshot never doubles a
 * row. Values are copied from `scan_snapshots.metrics`, never recomputed.
 */
export const TEMPLATE_METRIC: Partial<Record<TemplateKey, MetricKey>> = {
  "review-response": "gbp.response_rate_pct",
  "review-request": "gbp.reviews_count",
  "gbp-profile-fix": "gbp.hours_complete",
  "gbp-photo-pack": "gbp.photos_count",
  "gbp-post": "gbp.days_since_last_review",
  "social-post": "ig.days_since_last_post",
  "ig-bio": "ig.followers",
  "ig-highlights": "ig.highlights_count",
  "visibility-content": "aeo.ai_citation_count",
  "website-basics": "website.checks_passed",
  "local-seo-brief": "aeo.best_organic_rank",
  "menu-translation": "website.checks_passed",
};

export type MeasurementFactType = "Observed" | "Attributed" | "Unknown";

export interface MeasurementInsert {
  workspace_id: string;
  action_id: string;
  before_snapshot_id: string;
  after_snapshot_id: string;
  metric_key: MetricKey;
  before_value: number | null;
  after_value: number | null;
  delta: number | null;
  fact_type: MeasurementFactType;
  window_days: number;
}

export interface RecordMeasurementsInput {
  headSnapshot: SnapshotRecord;
  diff: ScanDiffRow | null;
  now?: Date;
}

export interface RecordMeasurementsOutcome {
  /** false when the pair is not comparable or the base snapshot is missing. */
  comparable: boolean;
  recorded: number;
  skipped: number;
}

/** Actions that can still be measured: open ones and completed ones (dismissed/expired never). */
const MEASURABLE_STATES = ["recommended", "needs_input", "ready", "in_progress", "completed"] as const;

interface MeasurableActionRow {
  id: string;
  template_key: string;
  location_id: string | null;
}

interface ExportedVersionRow {
  action_id: string;
  first_exported_at: string | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function metricValue(snapshot: SnapshotRecord, key: MetricKey): number | null {
  const value = snapshot.metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function windowDaysBetween(baseObservedAt: string, headObservedAt: string): number {
  const ms = Date.parse(headObservedAt) - Date.parse(baseObservedAt);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
}

/** Pure: the row for one action, or null when the template has no metric. */
export function buildMeasurement(input: {
  action: MeasurableActionRow;
  base: SnapshotRecord;
  head: SnapshotRecord;
  exportedBeforeHead: boolean;
}): MeasurementInsert | null {
  const metricKey = TEMPLATE_METRIC[input.action.template_key as TemplateKey];
  if (!metricKey) return null;
  const before = metricValue(input.base, metricKey);
  const after = metricValue(input.head, metricKey);
  const known = before !== null && after !== null;
  const factType: MeasurementFactType = !known ? "Unknown" : input.exportedBeforeHead ? "Attributed" : "Observed";
  return {
    workspace_id: input.head.workspaceId ?? input.base.workspaceId ?? "",
    action_id: input.action.id,
    before_snapshot_id: input.base.id,
    after_snapshot_id: input.head.id,
    metric_key: metricKey,
    before_value: before,
    after_value: after,
    delta: known ? round1(after - before) : null,
    fact_type: factType,
    window_days: windowDaysBetween(input.base.observedAt, input.head.observedAt),
  };
}

export async function recordMeasurements(db: SupabaseClient, input: RecordMeasurementsInput): Promise<RecordMeasurementsOutcome> {
  const head = input.headSnapshot;
  const now = input.now ?? new Date();
  if (!input.diff?.comparable || !head.comparableTo || !head.workspaceId) return { comparable: false, recorded: 0, skipped: 0 };
  const base = await loadSnapshotById(db, head.comparableTo);
  if (!base) return { comparable: false, recorded: 0, skipped: 0 };

  // Head job start: the cut-off for "exported before this scan".
  const { data: headJob, error: jobError } = await db.from("audit_jobs").select("created_at").eq("id", head.jobId).maybeSingle<{ created_at: string }>();
  if (jobError) throw new Error("measurement job lookup failed");
  const headStartedAt = Date.parse(headJob?.created_at ?? head.observedAt);

  let actionQuery = db.from("actions").select("id, template_key, location_id").eq("workspace_id", head.workspaceId).in("action_state", [...MEASURABLE_STATES]);
  actionQuery = head.locationId ? actionQuery.or(`location_id.eq.${head.locationId},location_id.is.null`) : actionQuery.is("location_id", null);
  const { data: actionRows, error: actionsError } = await actionQuery.returns<MeasurableActionRow[]>();
  if (actionsError) throw new Error("measurement actions lookup failed");
  const actions = (actionRows ?? []).filter((row) => TEMPLATE_METRIC[row.template_key as TemplateKey]);
  if (!actions.length) return { comparable: true, recorded: 0, skipped: 0 };
  const ids = actions.map((row) => row.id);

  const [existingResult, exportsResult] = await Promise.all([
    db.from("action_measurements").select("action_id, fact_type").eq("after_snapshot_id", head.id).in("action_id", ids).returns<Array<{ action_id: string; fact_type: MeasurementFactType }>>(),
    db.from("output_versions").select("action_id, first_exported_at").in("action_id", ids).not("first_exported_at", "is", null).returns<ExportedVersionRow[]>(),
  ]);
  if (existingResult.error) throw new Error("measurement lookup failed");
  if (exportsResult.error) throw new Error("measurement exports lookup failed");
  const alreadyMeasured = new Set((existingResult.data ?? []).map((row) => row.action_id));
  const exportedBeforeHead = new Set<string>();
  for (const row of exportsResult.data ?? []) {
    const exportedAt = row.first_exported_at ? Date.parse(row.first_exported_at) : Number.NaN;
    if (Number.isFinite(exportedAt) && exportedAt < headStartedAt) exportedBeforeHead.add(row.action_id);
  }

  const inserts: MeasurementInsert[] = [];
  let skipped = 0;
  for (const action of actions) {
    if (alreadyMeasured.has(action.id)) {
      skipped += 1;
      continue;
    }
    const row = buildMeasurement({ action, base, head, exportedBeforeHead: exportedBeforeHead.has(action.id) });
    if (row) inserts.push(row);
  }
  let recorded = 0;
  if (inserts.length) {
    const { data, error: insertError } = await db.from("action_measurements")
      .upsert(inserts.map((row) => ({ ...row, id: completionId("measurement", row.action_id, head.id) })), { onConflict: "id", ignoreDuplicates: true }).select("id");
    if (insertError) throw new Error("measurement insert failed");
    recorded = data?.length ?? 0;
  }

  // Repair the second half after an earlier process persisted measurements but
  // failed before updating action state. Preserve the saved fact classification.
  const allMeasurements = [...(existingResult.data ?? []), ...inserts];

  // Historical measurements remain immutable evidence. Their replay must not
  // overwrite the mutable state derived from a newer same-location scan.
  let latestQuery = db.from("scan_snapshots").select("id").eq("workspace_id", head.workspaceId);
  latestQuery = head.locationId ? latestQuery.eq("location_id", head.locationId) : latestQuery.is("location_id", null);
  const { data: latest, error: latestError } = await latestQuery.order("observed_at", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle<{ id: string }>();
  if (latestError || !latest) throw new Error("measurement latest snapshot lookup failed");
  if (latest.id !== head.id) return { comparable: true, recorded, skipped };

  const nowIso = now.toISOString();
  const measured = allMeasurements.filter((row) => row.fact_type !== "Unknown").map((row) => row.action_id);
  const insufficient = allMeasurements.filter((row) => row.fact_type === "Unknown").map((row) => row.action_id);
  if (measured.length) {
    const { error } = await db.from("actions").update({ measurement_state: "measured", updated_at: nowIso }).in("id", measured);
    if (error) throw new Error("measurement state update failed");
  }
  if (insufficient.length) {
    const { error } = await db.from("actions").update({ measurement_state: "insufficient_coverage", updated_at: nowIso }).in("id", insufficient);
    if (error) throw new Error("measurement state update failed");
  }
  return { comparable: true, recorded, skipped };
}
