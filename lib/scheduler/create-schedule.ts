import { anniversaryDayFrom, nextRunAfter } from "./next-run";

export interface SchedulableJob {
  id: string;
  status: string;
  place_id: string | null;
  created_at: string;
  input_snapshot: Record<string, unknown> | null;
}

export interface ScheduleInsert {
  place_id: string;
  input_snapshot: Record<string, unknown>;
  cadence: "monthly";
  anniversary_day: number;
  last_job_id: string;
  next_run_at: string;
  created_by: string;
  workspace_id: string;
}

export type ScheduleRefusal = "job_not_finished" | "no_place_id" | "snapshot_not_v2";

export type BuildScheduleResult =
  | { ok: true; insert: ScheduleInsert }
  | { ok: false; reason: ScheduleRefusal };

/** Statuses that produced a real, scored result. `partial` counts. */
const SCHEDULABLE_STATUSES = new Set(["done", "partial"]);

/**
 * Turn a finished scan into a monthly schedule.
 *
 * Pure, and returns a typed refusal rather than throwing: every "no" here is a
 * sentence the staff console has to show a human, not an exception.
 */
export function buildScheduleInsert({
  job,
  staffUserId,
  nowIso,
  workspaceId,
}: {
  job: SchedulableJob;
  staffUserId: string;
  nowIso: string;
  workspaceId: string;
}): BuildScheduleResult {
  if (!SCHEDULABLE_STATUSES.has(job.status)) return { ok: false, reason: "job_not_finished" };

  const snapshot = job.input_snapshot;
  if (!snapshot || snapshot.version !== 2) return { ok: false, reason: "snapshot_not_v2" };

  // The schedule keys on the snapshot's placeId, not the job column, because
  // enqueue.ts derives every future scheduled job's place_id from the snapshot
  // alone. Sourcing them differently would let scan_schedules.place_id drift
  // out of step with the identity its own re-scans carry.
  const placeId =
    typeof snapshot.placeId === "string" && snapshot.placeId.trim() ? snapshot.placeId : null;
  if (!placeId) return { ok: false, reason: "no_place_id" };

  // Anniversary comes from the first scan, so a merchant's monthly rhythm
  // matches when they actually joined. next_run_at is computed from now, so a
  // schedule created weeks later never has a due date already in the past.
  const anniversaryDay = anniversaryDayFrom(job.created_at);

  return {
    ok: true,
    insert: {
      place_id: placeId,
      input_snapshot: snapshot,
      cadence: "monthly",
      anniversary_day: anniversaryDay,
      last_job_id: job.id,
      next_run_at: nextRunAfter(nowIso, anniversaryDay),
      created_by: staffUserId,
      workspace_id: workspaceId,
    },
  };
}
