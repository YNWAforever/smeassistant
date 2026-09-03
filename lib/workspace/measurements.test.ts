import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  updates: [] as { patch: Row; ids: unknown }[],
}));

function client(): SupabaseClient {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let inserted: Row[] | null = null;
    let patch: Row | null = null;
    const terminal = () => {
      if (table === "scan_snapshots") return { data: state.snapshots[String(filters.id)] ?? null, error: null };
      if (table === "audit_jobs") return { data: state.headJob, error: null };
      if (table === "actions") {
        if (patch) {
          state.updates.push({ patch, ids: filters.id });
          return { data: null, error: null };
        }
        return { data: state.actions, error: null };
      }
      if (table === "action_measurements") {
        if (inserted) {
          state.inserted.push(...inserted);
          state.measurements.push(...inserted);
          return { data: null, error: null };
        }
        return { data: state.measurements.filter((m) => m.after_snapshot_id === filters.after_snapshot_id), error: null };
      }
      if (table === "output_versions") return { data: state.versions.filter((v) => v.first_exported_at), error: null };
      return { data: null, error: null };
    };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      or: self,
      is: self,
      not: self,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return chain;
      },
      in: (column: string, value: unknown) => {
        filters[column] = value;
        return chain;
      },
      insert: (rows: Row[]) => {
        inserted = rows;
        return Promise.resolve(terminal());
      },
      update: (row: Row) => {
        patch = row;
        return chain;
      },
      returns: () => Promise.resolve(terminal()),
      maybeSingle: () => Promise.resolve(terminal()),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(terminal()).then(resolve, reject),
    });
    return chain;
  };
  return { from } as unknown as SupabaseClient;
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
