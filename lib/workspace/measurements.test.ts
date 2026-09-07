import type { MeasurementRepository } from "@/lib/repositories/measurements";
import { completionId } from "./completion-id";
import { rowToSnapshot, type ScanSnapshotRow } from "./snapshots";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScanDiffRow, SnapshotRecord } from "./snapshots";
import { buildMeasurement, recordMeasurements, TEMPLATE_METRIC, windowDaysBetween } from "./measurements";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  snapshots: {} as Record<string, Row>,
  headJob: { created_at: "2026-09-01T09:00:00Z" } as Row | null,
  actions: [] as Row[],
  measurements: [] as Row[],
  versions: [] as Row[],
  inserted: [] as Row[],
  updateError: false,
  latestSnapshotId: "snap-head",
  updates: [] as { patch: Row; ids: unknown }[],
}));

function client(): MeasurementRepository {
 return {
  async base(head){const row=state.snapshots[head.comparableTo!];return row?rowToSnapshot(row as unknown as ScanSnapshotRow):null;},
  async headJob(){return state.headJob as {created_at:string}|null;},
  async actions(){return state.actions as unknown as Awaited<ReturnType<MeasurementRepository['actions']>>;},
  async existing(head){return state.measurements.filter(m=>m.after_snapshot_id===head.id) as unknown as Awaited<ReturnType<MeasurementRepository['existing']>>;},
  async exports(){return state.versions.filter(v=>v.first_exported_at) as unknown as Awaited<ReturnType<MeasurementRepository['exports']>>;},
  async insert(rows,head){const fresh=rows.map(row=>({...row,id:completionId('measurement',row.action_id,head.id)})).filter(row=>!state.measurements.some(existing=>existing.id===row.id));state.inserted.push(...fresh);state.measurements.push(...fresh);return fresh.length;},
  async latest(){return {id:state.latestSnapshotId};},
  async updateState(_head,ids,value,now){if(state.updateError)throw new Error('measurement state update failed');state.updates.push({patch:{measurement_state:value,updated_at:now},ids});},
 };
}

const snapshotRow = (over: Row): Row => ({
  id: "snap-head",
  job_id: "job-head",
  workspace_id: "ws-1",
  location_id: "loc-1",
  market: "hk",
  observed_at: "2026-09-01T10:00:00Z",
  scoring_version: "2026-08-16",
  overall_score: 62,
  coverage: 0.78,
  module_states: null,
  metrics: {},
  website_checks: null,
  comparable_to: null,
  diff_id: null,
  created_at: "2026-09-01T10:00:00Z",
  ...over,
});

function snapshot(over: Partial<SnapshotRecord>): SnapshotRecord {
  return {
    id: "snap-head",
    jobId: "job-head",
    workspaceId: "ws-1",
    locationId: "loc-1",
    market: "hk",
    observedAt: "2026-09-01T10:00:00Z",
    scoringVersion: "2026-08-16",
    overallScore: 62,
    coverage: 0.78,
    moduleStates: {} as SnapshotRecord["moduleStates"],
    metrics: { "gbp.response_rate_pct": 60, "ig.days_since_last_post": 3 },
    websiteChecks: null,
    comparableTo: "snap-base",
    diffId: "diff-1",
    createdAt: "2026-09-01T10:00:00Z",
    ...over,
  };
}

const diff: ScanDiffRow = {
  id: "diff-1",
  base_job_id: "job-base",
  head_job_id: "job-head",
  comparable: true,
  incomparable_reason: null,
  composite_withheld_reason: null,
  intersection_modules: ["gbp", "ig"],
  composite_base: 55,
  composite_head: 62,
  composite_delta: 7,
  resolved_findings: [],
  regressed_findings: [],
  decayed_findings: [],
  lost_coverage: [],
  gained_coverage: [],
  created_at: "2026-09-01T10:01:00Z",
};

beforeEach(() => {
  state.updateError = false;
  state.latestSnapshotId = "snap-head";
  state.snapshots = {
    "snap-base": snapshotRow({ id: "snap-base", job_id: "job-base", observed_at: "2026-08-02T10:00:00Z", metrics: { "gbp.response_rate_pct": 20, "ig.days_since_last_post": 14 } }),
  };
  state.headJob = { created_at: "2026-09-01T09:00:00Z" };
  state.actions = [
    { id: "a-review", template_key: "review-response", location_id: "loc-1" },
    { id: "a-social", template_key: "social-post", location_id: null },
  ];
  state.measurements = [];
  state.versions = [];
  state.inserted = [];
  state.updates = [];
});

describe("TEMPLATE_METRIC", () => {
  it("maps every measurable template to a snapshot metric, and leaves the reconnect template out", () => {
    expect(TEMPLATE_METRIC["review-response"]).toBe("gbp.response_rate_pct");
    expect(TEMPLATE_METRIC["social-post"]).toBe("ig.days_since_last_post");
    expect(TEMPLATE_METRIC["visibility-content"]).toBe("aeo.ai_citation_count");
    expect(TEMPLATE_METRIC["website-basics"]).toBe("website.checks_passed");
    expect(TEMPLATE_METRIC["google-reconnect"]).toBeUndefined();
  });
});

describe("buildMeasurement / windowDaysBetween", () => {
  it("rounds the window to whole days and the delta to one decimal", () => {
    expect(windowDaysBetween("2026-08-02T10:00:00Z", "2026-09-01T10:00:00Z")).toBe(30);
    const row = buildMeasurement({
      action: { id: "a", template_key: "review-response", location_id: "loc-1" },
      base: snapshot({ id: "snap-base", metrics: { "gbp.response_rate_pct": 20.04 } }),
      head: snapshot({ metrics: { "gbp.response_rate_pct": 60.55 } }),
      exportedBeforeHead: false,
    });
    expect(row).toMatchObject({ before_value: 20.04, after_value: 60.55, delta: 40.5, fact_type: "Observed" });
  });
});

describe("recordMeasurements", () => {
  it("is Attributed when the action was exported before the head scan started, Observed otherwise", async () => {
    state.versions = [{ action_id: "a-review", first_exported_at: "2026-08-20T00:00:00Z" }];

    const outcome = await recordMeasurements(client(), { headSnapshot: snapshot({}), diff });

    expect(outcome).toEqual({ comparable: true, recorded: 2, skipped: 0 });
    const byAction = Object.fromEntries(state.inserted.map((row) => [row.action_id, row]));
    expect(byAction["a-review"]).toMatchObject({
      workspace_id: "ws-1",
      before_snapshot_id: "snap-base",
      after_snapshot_id: "snap-head",
      metric_key: "gbp.response_rate_pct",
      before_value: 20,
      after_value: 60,
      delta: 40,
      fact_type: "Attributed",
      window_days: 30,
    });
    expect(byAction["a-social"]).toMatchObject({ metric_key: "ig.days_since_last_post", before_value: 14, after_value: 3, delta: -11, fact_type: "Observed" });
    expect(state.updates).toEqual([{ patch: expect.objectContaining({ measurement_state: "measured" }), ids: ["a-review", "a-social"] }]);
  });

  it("an export after the head scan started does not attribute the change", async () => {
    state.versions = [{ action_id: "a-review", first_exported_at: "2026-09-01T09:30:00Z" }];
    await recordMeasurements(client(), { headSnapshot: snapshot({}), diff });
    expect(state.inserted.find((row) => row.action_id === "a-review")?.fact_type).toBe("Observed");
  });

  it("is Unknown with a null delta when either value is missing, and marks the action insufficient_coverage", async () => {
    state.actions = [{ id: "a-review", template_key: "review-response", location_id: "loc-1" }];
    state.versions = [{ action_id: "a-review", first_exported_at: "2026-08-20T00:00:00Z" }];

    await recordMeasurements(client(), { headSnapshot: snapshot({ metrics: {} }), diff });

    expect(state.inserted[0]).toMatchObject({ before_value: 20, after_value: null, delta: null, fact_type: "Unknown" });
    expect(state.updates).toEqual([{ patch: expect.objectContaining({ measurement_state: "insufficient_coverage" }), ids: ["a-review"] }]);
  });

  it("is idempotent per (action, head snapshot)", async () => {
    const db = client();
    expect(await recordMeasurements(db, { headSnapshot: snapshot({}), diff })).toEqual({ comparable: true, recorded: 2, skipped: 0 });
    expect(await recordMeasurements(db, { headSnapshot: snapshot({}), diff })).toEqual({ comparable: true, recorded: 0, skipped: 2 });
    expect(state.inserted).toHaveLength(2);
  });

  it("does nothing when the pair is not comparable or the base snapshot is gone", async () => {
    expect(await recordMeasurements(client(), { headSnapshot: snapshot({}), diff: { ...diff, comparable: false } })).toEqual({ comparable: false, recorded: 0, skipped: 0 });
    expect(await recordMeasurements(client(), { headSnapshot: snapshot({ comparableTo: null }), diff })).toEqual({ comparable: false, recorded: 0, skipped: 0 });
    state.snapshots = {};
    expect(await recordMeasurements(client(), { headSnapshot: snapshot({}), diff })).toEqual({ comparable: false, recorded: 0, skipped: 0 });
    expect(state.inserted).toEqual([]);
  });

  it("skips templates without a metric", async () => {
    state.actions = [{ id: "a-reconnect", template_key: "google-reconnect", location_id: "loc-1" }];
    expect(await recordMeasurements(client(), { headSnapshot: snapshot({}), diff })).toEqual({ comparable: true, recorded: 0, skipped: 0 });
  });
});


it("repairs action state after measurements persisted but state update failed", async () => {
  state.updateError = true;
  await expect(recordMeasurements(client(), { headSnapshot: snapshot({}), diff })).rejects.toThrow("measurement state update failed");
  expect(state.measurements).toHaveLength(2);
  state.updateError = false;
  expect(await recordMeasurements(client(), { headSnapshot: snapshot({}), diff })).toEqual({ comparable: true, recorded: 0, skipped: 2 });
  expect(state.measurements).toHaveLength(2);
  expect(state.updates).toEqual([{ patch: expect.objectContaining({ measurement_state: "measured" }), ids: ["a-review", "a-social"] }]);
});


it("records historical measurements without overwriting newer action measurement state", async () => {
  state.latestSnapshotId = "snap-newer";
  await recordMeasurements(client(), { headSnapshot: snapshot({}), diff });
  expect(state.measurements).toHaveLength(2);
  expect(state.updates).toEqual([]);
  await recordMeasurements(client(), { headSnapshot: snapshot({}), diff });
  expect(state.measurements).toHaveLength(2);
  expect(state.updates).toEqual([]);
});
