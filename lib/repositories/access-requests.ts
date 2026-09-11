import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";

/**
 * Assisted ownership assignment reads and writes (Phase 2 items 20-23).
 *
 * NO schema change: workspace_access_requests keeps its six columns and answers
 * "is this still open"; audit_events answers "what happened and why". See
 * docs/superpowers/specs/2026-09-12-assisted-ownership-assignment-design.md.
 */
export interface PendingAccessRequest {
  id: string;
  job_id: string;
  user_id: string;
  requested_at: string;
  requester_email: string | null;
  business_name: string | null;
  /** Carried so an assigned workspace matches what the OAuth claim path creates. */
  industry: string | null;
  district: string | null;
  region: string;
  /** Null is the manual-entry case this whole path exists for. */
  place_id: string | null;
  share_slug: string;
  /** Non-null means the job was claimed while this sat in the queue. */
  job_workspace_id: string | null;
}

export interface AccessRequestRow extends PendingAccessRequest {
  resolved_at: string | null;
  resolved_by_staff_user_id: string | null;
}

export interface AccessRequestEvent {
  event: string;
  payload: Record<string, unknown> | null;
  actor_id: string | null;
  created_at: string;
}

const SELECT_COLUMNS = `r.id, r.job_id, r.user_id, r.requested_at::text AS requested_at,
    r.resolved_at::text AS resolved_at, r.resolved_by_staff_user_id,
    u.email AS requester_email,
    j.business_name, j.industry, j.district, j.region, j.place_id, j.share_slug, j.workspace_id AS job_workspace_id`;

const EVENTS_SQL = `SELECT event, payload, actor_id, created_at::text AS created_at
       FROM audit_events
      WHERE entity_type='workspace_access_request' AND entity_id = $1
      ORDER BY created_at ASC, id ASC`;

export function accessRequestRepository(db: Pick<Pool, "query"> = getPool()) {
  async function eventsFor(requestId: string): Promise<AccessRequestEvent[]> {
    return (await db.query<AccessRequestEvent>(EVENTS_SQL, [requestId])).rows;
  }

  return {
    /** Uses workspace_access_requests_pending_idx ON (requested_at DESC) WHERE resolved_at IS NULL. */
    async listPending(limit: number): Promise<PendingAccessRequest[]> {
      return (
        await db.query<PendingAccessRequest>(
          `SELECT ${SELECT_COLUMNS}
       FROM workspace_access_requests r
       JOIN audit_jobs j ON j.id = r.job_id
       LEFT JOIN app_users u ON u.id = r.user_id
      WHERE r.resolved_at IS NULL
      ORDER BY r.requested_at DESC
      LIMIT $1`,
          [limit],
        )
      ).rows;
    },

    async get(requestId: string): Promise<{ request: AccessRequestRow; events: AccessRequestEvent[] } | null> {
      const request = (
        await db.query<AccessRequestRow>(
          `SELECT ${SELECT_COLUMNS}
       FROM workspace_access_requests r
       JOIN audit_jobs j ON j.id = r.job_id
       LEFT JOIN app_users u ON u.id = r.user_id
      WHERE r.id = $1`,
          [requestId],
        )
      ).rows[0];
      if (!request) return null;
      return { request, events: await eventsFor(request.id) };
    },

    /**
     * The open request for this job and user, if any.
     * `workspace_access_requests_open_idx` is UNIQUE (job_id,user_id) WHERE
     * resolved_at IS NULL, so there is at most one and the database -- not this
     * code -- is what guarantees it.
     */
    async openRequestFor(jobId: string, userId: string): Promise<{ id: string } | null> {
      return (
        await db.query<{ id: string }>(
          "SELECT id FROM workspace_access_requests WHERE job_id=$1 AND user_id=$2 AND resolved_at IS NULL",
          [jobId, userId],
        )
      ).rows[0] ?? null;
    },

    /**
     * The caller's own most recent request. Scoped by user_id, so another
     * person's request is never visible (item 22).
     */
    async latestForUser(userId: string): Promise<{ request: AccessRequestRow; events: AccessRequestEvent[] } | null> {
      const request = (
        await db.query<AccessRequestRow>(
          `SELECT ${SELECT_COLUMNS}
       FROM workspace_access_requests r
       JOIN audit_jobs j ON j.id = r.job_id
       LEFT JOIN app_users u ON u.id = r.user_id
      WHERE r.user_id = $1
      ORDER BY r.requested_at DESC
      LIMIT 1`,
          [userId],
        )
      ).rows[0];
      if (!request) return null;
      return { request, events: await eventsFor(request.id) };
    },
  };
}
