import { describe, expect, it } from "vitest";
import { buildScheduleInsert, type SchedulableJob } from "./create-schedule";

const SNAPSHOT = {
  version: 2,
  locale: "zh-HK",
  market: "HK",
  businessName: "Test Cafe",
  placeId: "place-1",
  placeMatchConfidence: "high",
  industry: "fnb",
  district: "central",
  objective: "more_leads",
  instagramHandle: "testcafe",
  websiteUrl: "",
};

function job(overrides: Partial<SchedulableJob> = {}): SchedulableJob {
  return {
    id: "job-1",
    status: "done",
    place_id: "place-1",
    created_at: "2026-08-15T10:00:00.000Z",
    input_snapshot: SNAPSHOT,
    ...overrides,
  };
}

describe("buildScheduleInsert", () => {
  it("derives the anniversary day from the first scan", () => {
    const result = buildScheduleInsert({
      job: job(),
      staffUserId: "staff-1",
      workspaceId: "workspace-1",
      nowIso: "2026-08-16T09:00:00.000Z",
    });

    expect(result).toEqual({
      ok: true,
      insert: {
        place_id: "place-1",
        input_snapshot: SNAPSHOT,
        cadence: "monthly",
        anniversary_day: 15,
        last_job_id: "job-1",
        next_run_at: "2026-09-15T00:00:00.000Z",
        created_by: "staff-1",
        workspace_id: "workspace-1",
      },
    });
  });

  it("clamps a day past 28 so no month can skip the merchant", () => {
    const result = buildScheduleInsert({
      job: job({ created_at: "2026-01-31T10:00:00.000Z" }),
      staffUserId: "staff-1",
      workspaceId: "workspace-1",
      nowIso: "2026-08-16T09:00:00.000Z",
    });
    expect(result.ok && result.insert.anniversary_day).toBe(28);
  });

  it("refuses a scan that has not finished", () => {
    // Scheduling off an unfinished scan would carry a snapshot that may still
    // be wrong, and last_job_id would point at a job with no result.
    for (const status of ["queued", "collecting", "scoring", "persisting"]) {
      const result = buildScheduleInsert({
        job: job({ status }),
        staffUserId: "staff-1",
      workspaceId: "workspace-1",
        nowIso: "2026-08-16T09:00:00.000Z",
      });
      expect(result, status).toEqual({ ok: false, reason: "job_not_finished" });
    }
  });

  it("refuses a manual-entry scan, which has no place_id to key on", () => {
    // place_id is the schedule's identity and the only stable key across
    // months. Without it there is nothing to re-scan against.
    const result = buildScheduleInsert({
      job: job({ place_id: null, input_snapshot: { ...SNAPSHOT, placeId: null } }),
      staffUserId: "staff-1",
      workspaceId: "workspace-1",
      nowIso: "2026-08-16T09:00:00.000Z",
    });
    expect(result).toEqual({ ok: false, reason: "no_place_id" });
  });

  it("keys on the snapshot's placeId, which is what future scans will carry", () => {
    // enqueue.ts builds each scheduled job's place_id from the snapshot alone,
    // so a schedule keyed on anything else would drift from its own re-scans.
    const result = buildScheduleInsert({
      job: job({ place_id: "stale-column-value" }),
      staffUserId: "staff-1",
      workspaceId: "workspace-1",
      nowIso: "2026-08-16T09:00:00.000Z",
    });
    expect(result.ok && result.insert.place_id).toBe("place-1");
  });

  it("refuses a job with no snapshot at all", () => {
    const result = buildScheduleInsert({
      job: job({ input_snapshot: null }),
      staffUserId: "staff-1",
      workspaceId: "workspace-1",
      nowIso: "2026-08-16T09:00:00.000Z",
    });
    expect(result).toEqual({ ok: false, reason: "snapshot_not_v2" });
  });

  it("refuses a snapshot that is not the v2 envelope", () => {
    const result = buildScheduleInsert({
      job: job({ input_snapshot: { version: 1, placeId: "place-1" } }),
      staffUserId: "staff-1",
      workspaceId: "workspace-1",
      nowIso: "2026-08-16T09:00:00.000Z",
    });
    expect(result).toEqual({ ok: false, reason: "snapshot_not_v2" });
  });

  it("schedules a partial scan — a merchant with thin coverage still improves", () => {
    const result = buildScheduleInsert({
      job: job({ status: "partial" }),
      staffUserId: "staff-1",
      workspaceId: "workspace-1",
      nowIso: "2026-08-16T09:00:00.000Z",
    });
    expect(result.ok).toBe(true);
  });

  it("refuses a failed scan, whose snapshot was never validated by a result", () => {
    const result = buildScheduleInsert({
      job: job({ status: "failed" }),
      staffUserId: "staff-1",
      workspaceId: "workspace-1",
      nowIso: "2026-08-16T09:00:00.000Z",
    });
    expect(result).toEqual({ ok: false, reason: "job_not_finished" });
  });

  it("never schedules the first run in the past", () => {
    const result = buildScheduleInsert({
      job: job({ created_at: "2026-08-15T10:00:00.000Z" }),
      staffUserId: "staff-1",
      workspaceId: "workspace-1",
      nowIso: "2026-08-20T09:00:00.000Z",
    });
    expect(result.ok && result.insert.next_run_at).toBe("2026-09-15T00:00:00.000Z");
  });
});
