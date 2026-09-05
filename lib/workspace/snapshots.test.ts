import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSnapshot, linkComparable, rowToSnapshot, websiteUrlOf, type ScanDiffRow } from "./snapshots";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  job: null as Row | null,
  findings: [] as Row[],
  aeo: [] as Row[],
  diffs: [] as ScanDiffRow[],
  snapshotsByJob: {} as Record<string, Row | undefined>,
  upserts: [] as Row[],
  audits: [] as Row[],
  auditError: false,
}));

/** Minimal chainable client: the terminal resolves from `state` per table. */
function client(): SupabaseClient {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let upserted: Row | null = null;
    let inserted: Row | null = null;
    const terminal = () => {
      if (table === "audit_jobs") return { data: state.job, error: null };
      if (table === "audit_findings") return { data: state.findings, error: null };
      if (table === "aeo_surface_snapshots") return { data: state.aeo, error: null };
      if (table === "scan_diffs") return { data: state.diffs.filter((d) => d.head_job_id === filters.head_job_id), error: null };
      if (table === "scan_snapshots") {
        if (upserted) {
          const saved = { id: `snap-${upserted.job_id}`, created_at: "2026-09-03T00:00:00Z", ...upserted };
          state.upserts.push(saved);
          state.snapshotsByJob[String(upserted.job_id)] = saved;
          return { data: saved, error: null };
        }
        return { data: state.snapshotsByJob[String(filters.job_id)] ?? null, error: null };
      }
      if (table === "audit_events") {
        if (state.auditError) return { data: null, error: { message: "audit unavailable" } };
        const row = inserted ?? upserted;
        if (row && !state.audits.some((audit) => audit.idempotency_key === row.idempotency_key)) state.audits.push(row);
        return { data: state.audits.filter((audit) => audit.entity_id === filters.entity_id), error: null };
      }
      return { data: null, error: null };
    };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return chain;
      },
      order: self,
      limit: self,
      upsert: (row: Row) => {
        upserted = row;
        return chain;
      },
      insert: (row: Row) => {
        inserted = row;
        return Promise.resolve(terminal());
      },
      returns: () => Promise.resolve(terminal()),
      maybeSingle: () => Promise.resolve(terminal()),
      single: () => Promise.resolve(terminal()),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(terminal()).then(resolve, reject),
    });
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

const job = {
  id: "job-head",
  workspace_id: "ws-1",
  location_id: "loc-1",
  region: "hk",
  status: "done",
  completed_at: "2026-09-01T10:00:00Z",
  created_at: "2026-09-01T09:00:00Z",
  scoring_version: "2026-08-16",
  overall_score: "62",
  score_coverage: "0.78",
  module_results: {
    gbp: { status: "measured", score: 71, confidence: "high", limitationCode: null },
    ig: { status: "unavailable", score: null, confidence: "none", limitationCode: "IG_HANDLE_NOT_PROVIDED" },
  },
  module_scores: null,
  raw_data: { gbp: { rating: 4.2, reviews_count: 3, reviews: [{ owner_response: null, time: "2026-08-30T00:00:00Z" }] } },
  input_snapshot: { websiteUrl: "https://example.test" },
  website_url: null,
};

const diffComparable: ScanDiffRow = {
  id: "diff-1",
  base_job_id: "job-base",
  head_job_id: "job-head",
  comparable: true,
  incomparable_reason: null,
  composite_withheld_reason: null,
  intersection_modules: ["gbp"],
  composite_base: 66,
  composite_head: 62,
  composite_delta: -4,
  resolved_findings: [],
  regressed_findings: ["gbp.owner_response_low"],
  decayed_findings: [],
  lost_coverage: [],
  gained_coverage: [],
  created_at: "2026-09-01T10:01:00Z",
};

const fetchWebsite = async () => ({ evaluated: 15, passed: 9, results: [{ key: "faq_schema" as const, pass: false }] });

beforeEach(() => {
  state.auditError = false;
  state.job = { ...job };
  state.findings = [];
  state.aeo = [];
  state.diffs = [];
  state.snapshotsByJob = {};
  state.upserts = [];
  state.audits = [];
});

describe("linkComparable", () => {
  it("copies diff_id always and comparable_to only when comparable", () => {
    expect(linkComparable(null, "snap-base")).toEqual({ comparableTo: null, diffId: null });
    expect(linkComparable({ ...diffComparable, comparable: false, incomparable_reason: "SCORING_VERSION_MISMATCH" }, "snap-base")).toEqual({
      comparableTo: null,
      diffId: "diff-1",
    });
    expect(linkComparable(diffComparable, "snap-base")).toEqual({ comparableTo: "snap-base", diffId: "diff-1" });
  });
});

describe("buildSnapshot", () => {
  it("refuses a job that is not attached to a workspace", async () => {
    state.job = { ...job, workspace_id: null };
    await expect(buildSnapshot(client(), "job-head", { fetchWebsite })).rejects.toThrow("snapshot_requires_workspace");
    expect(state.upserts).toHaveLength(0);
  });

  it("stores states, metrics, website checks and links a comparable diff", async () => {
    state.diffs = [diffComparable];
    state.snapshotsByJob["job-base"] = { id: "snap-base", job_id: "job-base" };
    const snapshot = await buildSnapshot(client(), "job-head", { fetchWebsite, now: new Date("2026-09-03T00:00:00Z") });
    expect(snapshot.overallScore).toBe(62);
    expect(snapshot.coverage).toBe(0.78);
    expect(snapshot.moduleStates.instagram.status).toBe("unavailable");
    expect(snapshot.moduleStates.website.status).toBe("measured");
    expect(snapshot.metrics["gbp.rating"]).toBe(4.2);
    expect(snapshot.metrics["website.checks_passed"]).toBe(9);
    expect(snapshot.comparableTo).toBe("snap-base");
    expect(snapshot.diffId).toBe("diff-1");
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({ event: "snapshot.created", actor_type: "scanner", workspace_id: "ws-1" });
  });

  it("keeps diff_id but no comparable_to on a SCORING_VERSION_MISMATCH diff", async () => {
    state.diffs = [{ ...diffComparable, comparable: false, incomparable_reason: "SCORING_VERSION_MISMATCH" }];
    state.snapshotsByJob["job-base"] = { id: "snap-base", job_id: "job-base" };
    const snapshot = await buildSnapshot(client(), "job-head", { fetchWebsite });
    expect(snapshot.comparableTo).toBeNull();
    expect(snapshot.diffId).toBe("diff-1");
  });

  it("reuses persisted evidence on retry and records the audit event once", async () => {
    await buildSnapshot(client(), "job-head", { fetchWebsite });
    await buildSnapshot(client(), "job-head", { fetchWebsite });
    expect(state.upserts).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
  });

  it("reports the website as unsupported when no url is known", async () => {
    state.job = { ...job, input_snapshot: {}, raw_data: {} };
    const snapshot = await buildSnapshot(client(), "job-head", { fetchWebsite });
    expect(snapshot.moduleStates.website.status).toBe("unsupported");
    expect(snapshot.websiteChecks).toBeNull();
  });
});

describe("rowToSnapshot / websiteUrlOf", () => {
  it("parses numeric strings and tolerates missing json columns", () => {
    const record = rowToSnapshot({
      id: "s",
      job_id: "j",
      workspace_id: "w",
      location_id: null,
      market: "tw",
      observed_at: "2026-09-01T00:00:00Z",
      scoring_version: null,
      overall_score: null,
      coverage: "0.5",
      module_states: null,
      metrics: null,
      website_checks: null,
      comparable_to: null,
      diff_id: null,
      created_at: "2026-09-01T00:00:00Z",
    });
    expect(record.market).toBe("tw");
    expect(record.overallScore).toBeNull();
    expect(record.coverage).toBe(0.5);
    expect(record.moduleStates.google_business.status).toBe("unavailable");
    expect(record.metrics).toEqual({});
  });

  it("finds the website url in the column, the snapshot or the raw data", () => {
    expect(websiteUrlOf({ website_url: " https://a.test ", input_snapshot: null, raw_data: null })).toBe("https://a.test");
    expect(websiteUrlOf({ website_url: null, input_snapshot: { website_url: "https://b.test" }, raw_data: null })).toBe("https://b.test");
    expect(websiteUrlOf({ website_url: null, input_snapshot: null, raw_data: { aeo: { website: { url: "https://c.test" } } } })).toBe("https://c.test");
    expect(websiteUrlOf({ website_url: null, input_snapshot: null, raw_data: null })).toBeNull();
  });
});


it("repairs a missing snapshot audit after snapshot persistence without refetching evidence", async () => {
  const fetch = vi.fn(fetchWebsite);
  state.auditError = true;
  await expect(buildSnapshot(client(), "job-head", { fetchWebsite: fetch })).rejects.toThrow("snapshot audit lookup failed");
  expect(state.upserts).toHaveLength(1);
  state.auditError = false;
  await buildSnapshot(client(), "job-head", { fetchWebsite: fetch });
  await buildSnapshot(client(), "job-head", { fetchWebsite: fetch });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(state.audits).toHaveLength(1);
});
