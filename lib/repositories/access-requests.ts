import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
import { withTransaction } from "../db/transaction";
import { claimsRepository } from "./claims";
import {
  decisionEvent,
  decisionIdempotencyKey,
  decisionIsTerminal,
  type AssistedDecision,
  type Verification,
} from "../workspace/assisted-assignment";

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

export interface ResolveAccessRequestInput {
  request: {
    id: string;
    job_id: string;
    user_id: string;
    requester_email: string | null;
    business_name: string | null;
    region: string;
    industry: string | null;
    district: string | null;
  };
  decision: AssistedDecision;
  reason: string;
  verification: Verification | null;
  operator: { userId: string; email: string };
}

export interface ResolveAccessRequestResult {
  ok: true;
  workspaceId: string | null;
  slug: string | null;
}

/**
 * The whole decision, in one transaction.
 *
 * THE AUDIT WRITE HERE IS NOT BEST-EFFORT, and that inverts this repository's
 * usual rule (see lib/workspace/audit.ts: "a failed audit insert is logged,
 * never thrown"). The decision event IS the decision: it carries the
 * idempotency key whose table-wide unique index makes a terminal decision
 * exactly-once. If it cannot be written, the assignment must not happen, so it
 * is inside the transaction rather than after it.
 *
 * It is also written FIRST. A concurrent second approver then loses on the
 * unique index before any workspace has been created, rather than after.
 */
export async function resolveAccessRequest(input: ResolveAccessRequestInput): Promise<ResolveAccessRequestResult> {
  const { request, decision, reason, verification, operator } = input;
  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO audit_events(workspace_id,actor_type,actor_id,event,entity_type,entity_id,payload,idempotency_key)
       VALUES(NULL,'user',$1,$2,'workspace_access_request',$3,$4,$5)`,
      [
        operator.userId,
        decisionEvent(decision),
        request.id,
        { reason, verification, operator_email: operator.email },
        decisionIdempotencyKey(request.id, decision),
      ],
    );

    if (!decisionIsTerminal(decision)) return { ok: true as const, workspaceId: null, slug: null };

    let workspaceId: string | null = null;
    let slug: string | null = null;

    if (decision === "approved") {
      // The SAME checked services verified ownership uses -- not a second path.
      const workspace = await claimsRepository.createWorkspaceWithOwner(
        {
          ownerUserId: request.user_id,
          ownerEmail: request.requester_email ?? "",
          businessName: request.business_name,
          industry: request.industry,
          district: request.district,
          market: request.region,
        },
        client,
      );
      // False means the owner completed Google verification while this sat in
      // the queue. Throwing rolls the whole transaction back, so no orphan
      // workspace survives and the operator is told why.
      if (!(await claimsRepository.attachJob(request.job_id, workspace.id, client))) {
        throw new Error("already_claimed");
      }
      workspaceId = workspace.id;
      slug = workspace.slug;

      await client.query(
        `INSERT INTO audit_events(workspace_id,actor_type,actor_id,event,entity_type,entity_id,payload)
         VALUES($1,'user',$2,$3,'workspace_access_request',$4,$5)`,
        [workspaceId, operator.userId, "workspace.assigned", request.id, { job_id: request.job_id, slug }],
      );
    }

    await client.query(
      "UPDATE workspace_access_requests SET resolved_at=now(), resolved_by_staff_user_id=$2 WHERE id=$1 AND resolved_at IS NULL",
      [request.id, operator.userId],
    );

    return { ok: true as const, workspaceId, slug };
  });
}
