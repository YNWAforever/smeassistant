import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getPool } from "../db/client";
import { withTransaction } from "../db/transaction";
import { DEAD_LETTERED_JOB_CONDITION_SQL } from "../scan/claimable";
import { SCAN_TERMINAL_DEDUPE_KEY, scanCompletedEvent, writeScanEventSafely } from "../analytics/scan-events";
import { SCAN_AUTO_CLOSED_EVENT, SCAN_RELEASED_EVENT } from "../workspace/audit";

type Db = Pick<Pool, "query" | "connect">;

export const ATTEMPTS_EXHAUSTED = "ATTEMPTS_EXHAUSTED";
/** Spec §2: the window an operator has to release a dead-lettered scan before it is closed. */
export const AUTO_CLOSE_GRACE_SQL = "last_attempt_at < now() - interval '24 hours'";

export type ReleaseResult = { released: false } | { released: true; previousAttempts: number };

/**
 * One transaction per job. The guarded UPDATE re-checks the dead-letter and
 * grace conditions under the row lock, so a job claimed or released since the
 * candidate SELECT is skipped. Like jobsRepository.failQueued it records the
 * job's scan_completed (failed, coverage 0) as its last statement, in a
 * SAVEPOINT, so P3.4's reconciliation gains no gap.
 */
async function closeOne(client: PoolClient, jobId: string): Promise<boolean> {
  const { rows } = await client.query<{ attempt_count: number; workspace_id: string | null; location_id: string | null }>(
    `UPDATE audit_jobs
        SET status='failed', processing_stage='failed', failure_category=$2,
            failure_correlation_id=gen_random_uuid(), completed_at=now()
      WHERE id=$1 AND ${DEAD_LETTERED_JOB_CONDITION_SQL} AND ${AUTO_CLOSE_GRACE_SQL}
      RETURNING attempt_count, workspace_id, location_id`,
    [jobId, ATTEMPTS_EXHAUSTED],
  );
  const row = rows[0];
  if (!row) return false;
  await client.query(
    `INSERT INTO audit_events(workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload)
     VALUES($1,$2,'system',NULL,'${SCAN_AUTO_CLOSED_EVENT}','audit_job',$3,$4)`,
    [row.workspace_id, row.location_id, jobId, JSON.stringify({ locale: null, attempts: row.attempt_count })],
  );
  // The scan's own session, so the event dedupes against a terminal write
  // from that session. A scan with no recorded start gets a fresh one, as a
  // cookie-less process call would.
  const session =
    (
      await client.query<{ id: string }>(
        "SELECT anonymous_session_id AS id FROM scan_events WHERE job_id=$1 AND event_name='scan_started' AND anonymous_session_id IS NOT NULL ORDER BY created_at LIMIT 1",
        [jobId],
      )
    ).rows[0]?.id ?? randomUUID();
  await writeScanEventSafely(client, { jobId, anonymousSessionId: session, event: scanCompletedEvent("failed", 0), dedupeKey: SCAN_TERMINAL_DEDUPE_KEY });
  return true;
}

/** P3.5b dead-letter handling (spec §2). */
export function deadLetterRepository(pool: Db = getPool()) {
  return {
    /** Closes up to `limit` scans dead-lettered past the grace period; returns the ids it closed. */
    async closeExhausted(limit: number): Promise<string[]> {
      const candidates = (
        await pool.query<{ id: string }>(
          `SELECT id FROM audit_jobs WHERE ${DEAD_LETTERED_JOB_CONDITION_SQL} AND ${AUTO_CLOSE_GRACE_SQL} ORDER BY last_attempt_at, id LIMIT $1`,
          [limit],
        )
      ).rows;
      const closed: string[] = [];
      for (const { id } of candidates) {
        try {
          if (await withTransaction((client) => closeOne(client, id), pool)) closed.push(id);
        } catch {
          console.error("[ops] auto_close_failed", { category: "scan_auto_close_failed", jobId: id });
        }
      }
      return closed;
    },

    /**
     * Grants one more attempt: attempt_count=2 is one below the lease's limit
     * of 3. The CTE's FOR UPDATE re-evaluates the condition after waiting on a
     * concurrent release, so exactly one of two wins. The true attempt history
     * stays in scan_attempts; the audit row keeps the previous counter.
     */
    async release(jobId: string, operatorUserId: string): Promise<ReleaseResult> {
      return withTransaction(async (client) => {
        const { rows } = await client.query<{ previous: number; workspace_id: string | null; location_id: string | null }>(
          `WITH target AS (
             SELECT id, attempt_count AS previous FROM audit_jobs WHERE id=$1 AND ${DEAD_LETTERED_JOB_CONDITION_SQL} FOR UPDATE
           )
           UPDATE audit_jobs j SET attempt_count=2 FROM target t WHERE j.id=t.id
           RETURNING t.previous, j.workspace_id, j.location_id`,
          [jobId],
        );
        const row = rows[0];
        if (!row) return { released: false } as const;
        await client.query(
          `INSERT INTO audit_events(workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload)
           VALUES($1,$2,'user',$3,'${SCAN_RELEASED_EVENT}','audit_job',$4,$5)`,
          [row.workspace_id, row.location_id, operatorUserId, jobId, JSON.stringify({ locale: null, previous_attempts: row.previous })],
        );
        return { released: true, previousAttempts: row.previous } as const;
      }, pool);
    },
  };
}
