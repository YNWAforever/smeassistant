import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
import { DEAD_LETTERED_JOB_CONDITION_SQL } from "../scan/claimable";
import { FAILURE_KINDS, type FailureItem, type FailureKind, type OperatorHealth } from "../ops/failure-types";
import { referenceFor } from "../ops/references";

type Db = Pick<Pool, "query">;

export interface FailureQuery {
  /** Null = every kind. */
  kinds: readonly FailureKind[] | null;
  hexPrefix: string | null;
  uuid: string | null;
  /** Null = every workspace (operators only). */
  workspaceId: string | null;
  limit: number;
}

/** Every source SELECT returns exactly these columns, and only these: the allowlist. */
interface FailureRow {
  id: string;
  correlation_id: string | null;
  occurred_at: Date;
  workspace_id: string | null;
  workspace_slug: string | null;
  workspace_name: string | null;
  location_id: string | null;
  action_id: string | null;
  business_name: string | null;
  reason: string | null;
  attempts: number | null;
}

/**
 * $1 workspace id, $2 hex prefix, $3 full id, $4 limit. `idColumn` is the
 * row's own id; `correlationColumn` is also matched by a full id (scans).
 */
function filters(workspaceColumn: string, idColumn: string, correlationColumn?: string): string {
  const uuidMatch = correlationColumn ? `(${idColumn} = $3::uuid OR ${correlationColumn} = $3::uuid)` : `${idColumn} = $3::uuid`;
  return `($1::uuid IS NULL OR ${workspaceColumn} = $1::uuid)
    AND ($2::text IS NULL OR replace(${idColumn}::text,'-','') LIKE $2::text || '%')
    AND ($3::uuid IS NULL OR ${uuidMatch})`;
}

const SOURCES: Record<FailureKind, string> = {
  scan_failed: `
    SELECT j.id, j.failure_correlation_id::text AS correlation_id, coalesce(j.completed_at, j.created_at) AS occurred_at,
           j.workspace_id, w.slug AS workspace_slug, w.business_name AS workspace_name, j.location_id, NULL::uuid AS action_id,
           j.business_name, j.failure_category AS reason, j.attempt_count AS attempts
    FROM audit_jobs j LEFT JOIN workspaces w ON w.id = j.workspace_id
    WHERE j.status = 'failed' AND coalesce(j.completed_at, j.created_at) > now() - interval '30 days'
      AND ${filters("j.workspace_id", "j.id", "j.failure_correlation_id")}
    ORDER BY occurred_at DESC LIMIT $4`,
  scan_dead_lettered: `
    SELECT j.id, NULL::text AS correlation_id, j.last_attempt_at AS occurred_at,
           j.workspace_id, w.slug AS workspace_slug, w.business_name AS workspace_name, j.location_id, NULL::uuid AS action_id,
           j.business_name, 'ATTEMPTS_EXHAUSTED' AS reason, j.attempt_count AS attempts
    FROM audit_jobs j LEFT JOIN workspaces w ON w.id = j.workspace_id
    WHERE ${DEAD_LETTERED_JOB_CONDITION_SQL}
      AND ${filters("j.workspace_id", "j.id")}
    ORDER BY occurred_at DESC LIMIT $4`,
  draft_failed: `
    SELECT * FROM (
      SELECT DISTINCT ON (r.action_id)
             r.id, NULL::text AS correlation_id, coalesce(r.finished_at, r.created_at) AS occurred_at,
             r.workspace_id, w.slug AS workspace_slug, w.business_name AS workspace_name, a.location_id, r.action_id,
             w.business_name,
             coalesce((SELECT e.payload->>'reason' FROM audit_events e
                       WHERE e.workspace_id = r.workspace_id AND e.entity_type = 'action_run' AND e.entity_id = r.id
                         AND e.event IN ('run.failed','run.timed_out')
                       ORDER BY e.created_at DESC LIMIT 1), 'action_run_failed') AS reason,
             NULL::int AS attempts
      FROM action_runs r
      JOIN actions a ON a.id = r.action_id AND a.workspace_id = r.workspace_id
      JOIN workspaces w ON w.id = r.workspace_id
      WHERE r.state IN ('failed','timed_out')
        AND coalesce(r.finished_at, r.created_at) > now() - interval '14 days'
        AND coalesce(r.input->>'source', '') <> 'assistant'
        AND NOT EXISTS (SELECT 1 FROM action_runs s WHERE s.action_id = r.action_id AND s.state = 'succeeded' AND s.created_at > r.created_at)
        AND ${filters("r.workspace_id", "r.id")}
      ORDER BY r.action_id, r.created_at DESC
    ) d ORDER BY occurred_at DESC LIMIT $4`,
  google_connection: `
    SELECT * FROM (
      SELECT DISTINCT ON (c.workspace_id)
             c.id, NULL::text AS correlation_id, c.updated_at AS occurred_at,
             c.workspace_id, w.slug AS workspace_slug, w.business_name AS workspace_name, NULL::uuid AS location_id, NULL::uuid AS action_id,
             w.business_name, c.status AS reason, NULL::int AS attempts
      FROM oauth_connections c JOIN workspaces w ON w.id = c.workspace_id
      WHERE c.provider = 'google_gbp' AND c.status IN ('expired','revoked','error')
        AND NOT EXISTS (SELECT 1 FROM oauth_connections a WHERE a.workspace_id = c.workspace_id AND a.provider = 'google_gbp' AND a.status = 'active')
        AND ${filters("c.workspace_id", "c.id")}
      ORDER BY c.workspace_id, c.updated_at DESC
    ) g WHERE g.reason IN ('expired','error') ORDER BY occurred_at DESC LIMIT $4`,
  workspace_processing: `
    SELECT c.job_id AS id, NULL::text AS correlation_id, c.updated_at AS occurred_at,
           c.workspace_id, w.slug AS workspace_slug, w.business_name AS workspace_name, j.location_id, NULL::uuid AS action_id,
           coalesce(j.business_name, w.business_name) AS business_name,
           coalesce(c.last_error, 'workspace_post_process_failed') AS reason, c.attempts
    FROM workspace_scan_completions c
    JOIN workspaces w ON w.id = c.workspace_id
    JOIN audit_jobs j ON j.id = c.job_id
    WHERE c.state = 'retry' AND c.attempts >= 3
      AND ${filters("c.workspace_id", "c.job_id")}
    ORDER BY occurred_at DESC LIMIT $4`,
};

function toFailureItem(kind: FailureKind, row: FailureRow): FailureItem {
  return {
    kind,
    id: row.id,
    reference: referenceFor(kind, row.id),
    correlationId: row.correlation_id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    workspace: row.workspace_id ? { id: row.workspace_id, slug: row.workspace_slug, name: row.workspace_name } : null,
    locationId: row.location_id,
    actionId: row.action_id,
    businessName: row.business_name?.trim() || "—",
    reason: row.reason ?? "generic",
    attempts: row.attempts,
    operatorAction: kind === "scan_dead_lettered" ? "release" : "none",
  };
}

/**
 * P3.5b read model (spec §1). Derived from the rows that are the actual state,
 * so it can never disagree with them. Every SELECT names its columns: no
 * emails, contact identifiers, review text, draft bodies, action_runs.error or
 * provider messages can reach a caller.
 */
export function failuresRepository(client?: Db) {
  const db = () => client ?? getPool();
  return {
    async list(query: FailureQuery): Promise<FailureItem[]> {
      const kinds = FAILURE_KINDS.filter((kind) => !query.kinds || query.kinds.includes(kind));
      const params = [query.workspaceId, query.hexPrefix, query.uuid, query.limit];
      const results = await Promise.all(
        kinds.map(async (kind) => (await db().query<FailureRow>(SOURCES[kind], params)).rows.map((row) => toFailureItem(kind, row))),
      );
      return results
        .flat()
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id))
        .slice(0, query.limit);
    },

    async health(): Promise<OperatorHealth> {
      const counts = (
        await db().query<{ scan_day: number; scan_week: number; draft_day: number; draft_week: number; dead: number; processing: number }>(
          `SELECT
             (SELECT count(*) FROM audit_jobs WHERE status='failed' AND coalesce(completed_at,created_at) > now()-interval '24 hours')::int AS scan_day,
             (SELECT count(*) FROM audit_jobs WHERE status='failed' AND coalesce(completed_at,created_at) > now()-interval '7 days')::int AS scan_week,
             (SELECT count(*) FROM action_runs WHERE state IN ('failed','timed_out') AND coalesce(input->>'source','') <> 'assistant' AND coalesce(finished_at,created_at) > now()-interval '24 hours')::int AS draft_day,
             (SELECT count(*) FROM action_runs WHERE state IN ('failed','timed_out') AND coalesce(input->>'source','') <> 'assistant' AND coalesce(finished_at,created_at) > now()-interval '7 days')::int AS draft_week,
             (SELECT count(*) FROM audit_jobs WHERE ${DEAD_LETTERED_JOB_CONDITION_SQL})::int AS dead,
             (SELECT count(*) FROM workspace_scan_completions WHERE state='retry' AND attempts >= 3)::int AS processing`,
        )
      ).rows[0];
      const categories = (
        await db().query<{ category: string; day: number; week: number }>(
          `SELECT coalesce(failure_category,'unknown') AS category,
                  count(*) FILTER (WHERE coalesce(completed_at,created_at) > now()-interval '24 hours')::int AS day,
                  count(*)::int AS week
           FROM audit_jobs WHERE status='failed' AND coalesce(completed_at,created_at) > now()-interval '7 days'
           GROUP BY 1 ORDER BY week DESC, category`,
        )
      ).rows;
      const google = await this.list({ kinds: ["google_connection"], hexPrefix: null, uuid: null, workspaceId: null, limit: 200 });
      return {
        recent: { scan_failed: { day: counts.scan_day, week: counts.scan_week }, draft_failed: { day: counts.draft_day, week: counts.draft_week } },
        open: { scan_dead_lettered: counts.dead, google_connection: google.length, workspace_processing: counts.processing },
        categories,
      };
    },
  };
}
