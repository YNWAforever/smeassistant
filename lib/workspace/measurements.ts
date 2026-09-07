import type { MeasurementRepository } from "@/lib/repositories/measurements";
import type { MetricKey } from "@/lib/workspace/metrics";
import type { ScanDiffRow, SnapshotRecord } from "@/lib/workspace/snapshots";
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

export interface MeasurableActionRow {
  id: string;
  template_key: string;
  location_id: string | null;
}

export interface ExportedVersionRow {
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

export async function recordMeasurements(repo: MeasurementRepository, input: RecordMeasurementsInput): Promise<RecordMeasurementsOutcome> {
  const head = input.headSnapshot;
  const now = input.now ?? new Date();
  if (!input.diff?.comparable || !head.comparableTo || !head.workspaceId) return { comparable: false, recorded: 0, skipped: 0 };
  const base = await repo.base(head, input.diff);
  if (!base || base.workspaceId !== head.workspaceId || base.locationId !== head.locationId || base.jobId !== input.diff.base_job_id || head.jobId !== input.diff.head_job_id) return { comparable: false, recorded: 0, skipped: 0 };
  const headJob = await repo.headJob(head);
  const headStartedAt = Date.parse(headJob?.created_at ?? head.observedAt);
  const actionRows = await repo.actions(head, [...MEASURABLE_STATES]);
  const actions = (actionRows ?? []).filter((row) => TEMPLATE_METRIC[row.template_key as TemplateKey]);
  if (!actions.length) return { comparable: true, recorded: 0, skipped: 0 };
  const ids = actions.map((row) => row.id);

  const existing = await repo.existing(head, ids);
  const exports = await repo.exports(head, ids);
  const alreadyMeasured = new Set(existing.map((row) => row.action_id));
  const exportedBeforeHead = new Set<string>();
  for (const row of exports) {
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
    recorded = await repo.insert(inserts, head);
  }

  // Repair the second half after an earlier process persisted measurements but
  // failed before updating action state. Preserve the saved fact classification.
  const allMeasurements = [...existing, ...inserts];

  // Historical measurements remain immutable evidence. Their replay must not
  // overwrite the mutable state derived from a newer same-location scan.
  const latest = await repo.latest(head);
  if (!latest) throw new Error("measurement latest snapshot lookup failed");
  if (latest.id !== head.id) return { comparable: true, recorded, skipped };

  const nowIso = now.toISOString();
  const measured = allMeasurements.filter((row) => row.fact_type !== "Unknown").map((row) => row.action_id);
  const insufficient = allMeasurements.filter((row) => row.fact_type === "Unknown").map((row) => row.action_id);
  if (measured.length) {
    await repo.updateState(head, measured, "measured", nowIso);
  }
  if (insufficient.length) {
    await repo.updateState(head, insufficient, "insufficient_coverage", nowIso);
  }
  return { comparable: true, recorded, skipped };
}
