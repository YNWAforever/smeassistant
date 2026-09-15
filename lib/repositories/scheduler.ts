import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
import { CLAIMABLE_JOB_CONDITION_SQL } from "../scan/claimable";

export interface DueSchedule {
  id: string;
  workspaceId: string | null;
  anniversaryDay: number;
  tier: string | null;
  notifyMonthlyDigest: boolean | null;
}

export interface SchedulerRepository {
  dueSchedules(nowIso: string): Promise<DueSchedule[]>;
  advanceSchedule(scheduleId: string, nextRunAtIso: string): Promise<void>;
  claimableJobIds(limit: number): Promise<string[]>;
}

/**
 * Backs `app/api/cron/dispatch` (Phase 3 item P3.1). Schedules and jobs only;
 * writing the actual notification row is `lib/workspace/notify.ts`'s job, not
 * this repository's.
 */
export function schedulerRepository(client?: Pick<Pool, "query">): SchedulerRepository {
  const db = () => client ?? getPool();
  return {
    // FOR UPDATE OF s SKIP LOCKED only closes the concurrent-tick race
    // (two overlapping cron ticks double-notifying the same schedule) when
    // the caller runs this and the matching advanceSchedule() in one shared
    // transaction -- the lock is released the moment this call's own
    // transaction ends, not held across separate calls.
    async dueSchedules(nowIso) {
      try {
        return (
          await db().query<DueSchedule>(
            `SELECT s.id, s.workspace_id AS "workspaceId", s.anniversary_day AS "anniversaryDay",
                    w.tier, w.notify_monthly_digest AS "notifyMonthlyDigest"
             FROM scan_schedules s
             LEFT JOIN workspaces w ON w.id = s.workspace_id
             WHERE s.cadence = 'monthly' AND s.next_run_at <= $1
             FOR UPDATE OF s SKIP LOCKED`,
            [nowIso],
          )
        ).rows;
      } catch {
        throw new Error("due_schedules_lookup_failed");
      }
    },
    async advanceSchedule(scheduleId, nextRunAtIso) {
      try {
        await db().query("UPDATE scan_schedules SET next_run_at=$2 WHERE id=$1", [scheduleId, nextRunAtIso]);
      } catch {
        throw new Error("schedule_advance_failed");
      }
    },
    async claimableJobIds(limit) {
      try {
        return (
          await db().query<{ id: string }>(
            `SELECT id FROM audit_jobs WHERE ${CLAIMABLE_JOB_CONDITION_SQL} LIMIT $1`,
            [limit],
          )
        ).rows.map((row) => row.id);
      } catch {
        throw new Error("claimable_jobs_lookup_failed");
      }
    },
  };
}
