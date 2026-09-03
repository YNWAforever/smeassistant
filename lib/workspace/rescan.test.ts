import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueRescan, ensureMonthlySchedule, scanInputFromSnapshot } from "./rescan";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  jobs: [] as Row[],
  jobInsertError: null as { message: string } | null,
  schedules: [] as Row[],
  scheduleInsertError: null as { code?: string } | null,
  inserted: { audit_jobs: [] as Row[], scan_schedules: [] as Row[], audit_events: [] as Row[] } as Record<string, Row[]>,
}));

/** Minimal chainable client: the terminal resolves from `state` per table. */
function client(): SupabaseClient {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let inserted: Row | null = null;
    const terminal = () => {
      if (table === "audit_jobs") {
        if (inserted) {
          if (state.jobInsertError) return { data: null, error: state.jobInsertError };
          const saved = { id: `job-${state.inserted.audit_jobs.length + 1}`, ...inserted };
          state.inserted.audit_jobs.push(saved);
          return { data: { id: saved.id }, error: null };
        }
        const rows = state.jobs.filter((j) => j.workspace_id === filters.workspace_id && j.location_id === filters.location_id);
        return { data: rows, error: null };
      }
      if (table === "scan_schedules") {
        if (inserted) {
          if (state.scheduleInsertError) return { data: null, error: state.scheduleInsertError };
          state.inserted.scan_schedules.push(inserted);
          state.schedules.push(inserted);
          return { data: null, error: null };
        }
        return { data: state.schedules.filter((s) => s.place_id === filters.place_id), error: null };
      }
      if (table === "audit_events") {
        if (inserted) state.inserted.audit_events.push(inserted);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      in: self,
      order: self,
      limit: self,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return chain;
      },
      insert: (row: Row) => {
        inserted = row;
        return chain;
      },
      returns: () => Promise.resolve(terminal()),
      single: () => Promise.resolve(terminal()),
      maybeSingle: () => Promise.resolve(terminal()),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(terminal()).then(resolve, reject),
    });
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

const SNAPSHOT = {
  version: 2,
  locale: "zh-HK",
  market: "HK",
  businessName: "Kam Man House",
  provider: "serpapi",
  manualEntry: false,
  placeId: "place-1",
  dataId: null,
  dataCid: null,
  placeMatchConfidence: "high",
  continueWithoutPlace: false,
  alternateNames: ["錦汶館"],
  address: "1 Yik Yam Street",
  mapsUrl: "",
  facebookUrl: "",
  websiteUrl: "https://kamman.example",
  instagramHandle: "kammanhouse",
  instagramMatchProvenance: "picker_confirmed",
  industry: "fnb",
  district: "happy-valley",
  objective: "more_leads",
};

const sourceJob = {
  id: "job-src",
  status: "done",
  place_id: "place-1",
  created_at: "2026-08-15T10:00:00.000Z",
  input_snapshot: SNAPSHOT,
  workspace_id: "ws-1",
  location_id: "loc-1",
};

beforeEach(() => {
  state.jobs = [{ ...sourceJob }];
  state.jobInsertError = null;
  state.schedules = [];
  state.scheduleInsertError = null;
  state.inserted = { audit_jobs: [], scan_schedules: [], audit_events: [] };
});

describe("scanInputFromSnapshot", () => {
  it("rebuilds the funnel input from a v2 snapshot with the parent job attached", () => {
    const input = scanInputFromSnapshot(SNAPSHOT, "job-src");
    expect(input).toMatchObject({
      businessName: "Kam Man House",
      instagramHandle: "kammanhouse",
      instagramMatchProvenance: "picker_confirmed",
      websiteUrl: "https://kamman.example",
      market: "HK",
      locale: "zh-HK",
      objective: "more_leads",
      placeId: "place-1",
      placeMatchConfidence: "high",
      provider: "serpapi",
      manualEntry: false,
      alternateNames: ["錦汶館"],
      parentJobId: "job-src",
      userRole: null,
    });
  });

  it("treats a snapshot without a provider identity as manual entry", () => {
    const input = scanInputFromSnapshot({ ...SNAPSHOT, placeId: null, placeMatchConfidence: null, provider: null, manualEntry: true, continueWithoutPlace: true }, "job-src");
    expect(input).toMatchObject({ placeId: null, provider: null, manualEntry: true, placeMatchConfidence: null });
  });

  it("refuses a v1 envelope, which carries no confirmed identity", () => {
    expect(() => scanInputFromSnapshot({ version: 1, businessName: "x" }, "job-src")).toThrow(/v2/);
    expect(() => scanInputFromSnapshot(null, "job-src")).toThrow(/v2/);
  });
});

describe("enqueueRescan", () => {
  it("inserts a queued job attributed to the workspace and location with parent_job_id = the last finished job", async () => {
    const result = await enqueueRescan(client(), { workspaceId: "ws-1", locationId: "loc-1", actorId: "user-1", locale: "en" });
    expect(result).toMatchObject({ ok: true, jobId: "job-1" });
    const inserted = state.inserted.audit_jobs[0]!;
    expect(inserted).toMatchObject({
      status: "queued",
      parent_job_id: "job-src",
      workspace_id: "ws-1",
      location_id: "loc-1",
      place_id: "place-1",
      business_name: "Kam Man House",
      ig_handle: "kammanhouse",
      region: "hk",
      business_objective: "more_leads",
    });
    expect(typeof inserted.share_slug).toBe("string");
    expect((inserted.input_snapshot as Row).version).toBe(2);
    expect(state.inserted.audit_events[0]).toMatchObject({
      workspace_id: "ws-1",
      location_id: "loc-1",
      actor_type: "user",
      actor_id: "user-1",
      event: "scan.queued",
      entity_id: "job-1",
      payload: { locale: "en", parent_job_id: "job-src", trigger: "rescan" },
    });
  });

  it("404s (no_finished_job) when the location has never finished a scan", async () => {
    state.jobs = [];
    expect(await enqueueRescan(client(), { workspaceId: "ws-1", locationId: "loc-1", actorId: "user-1" })).toEqual({ ok: false, reason: "no_finished_job" });
    expect(state.inserted.audit_jobs).toEqual([]);
  });

  it("never reads across workspaces: a job on another workspace's location is invisible", async () => {
    state.jobs = [{ ...sourceJob, workspace_id: "ws-2" }];
    expect(await enqueueRescan(client(), { workspaceId: "ws-1", locationId: "loc-1", actorId: "user-1" })).toEqual({ ok: false, reason: "no_finished_job" });
  });

  it("refuses a v1 snapshot rather than re-scanning an unconfirmed identity", async () => {
    state.jobs = [{ ...sourceJob, input_snapshot: { version: 1 } }];
    expect(await enqueueRescan(client(), { workspaceId: "ws-1", locationId: "loc-1", actorId: "user-1" })).toEqual({ ok: false, reason: "snapshot_not_v2" });
  });

  it("reports an insert failure without an audit event", async () => {
    state.jobInsertError = { message: "boom" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await enqueueRescan(client(), { workspaceId: "ws-1", locationId: "loc-1", actorId: "user-1" })).toEqual({ ok: false, reason: "insert_failed" });
    expect(state.inserted.audit_events).toEqual([]);
    spy.mockRestore();
  });
});

describe("ensureMonthlySchedule", () => {
  const input = { job: sourceJob, workspaceId: "ws-1", actorId: "user-1", nowIso: "2026-09-04T09:00:00.000Z" };

  it("inserts the schedule once, keyed on the snapshot placeId, created by the acting owner", async () => {
    const db = client();
    expect(await ensureMonthlySchedule(db, input)).toEqual({ created: true });
    expect(state.inserted.scan_schedules).toHaveLength(1);
    expect(state.inserted.scan_schedules[0]).toMatchObject({
      place_id: "place-1",
      cadence: "monthly",
      anniversary_day: 15,
      last_job_id: "job-src",
      next_run_at: "2026-09-15T00:00:00.000Z",
      created_by: "user-1",
      workspace_id: "ws-1",
    });
    expect(await ensureMonthlySchedule(db, input)).toEqual({ created: false, reason: "exists" });
    expect(state.inserted.scan_schedules).toHaveLength(1);
  });

  it("treats a unique-violation race as already existing", async () => {
    state.scheduleInsertError = { code: "23505" };
    expect(await ensureMonthlySchedule(client(), input)).toEqual({ created: false, reason: "exists" });
  });

  it("returns the builder's refusal for a manual-entry job", async () => {
    const job = { ...sourceJob, place_id: null, input_snapshot: { ...SNAPSHOT, placeId: null } };
    expect(await ensureMonthlySchedule(client(), { ...input, job })).toEqual({ created: false, reason: "no_place_id" });
    expect(state.inserted.scan_schedules).toEqual([]);
  });
});
