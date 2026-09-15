import 'server-only';
import type { Pool } from 'pg';
import { getPool } from '../db/client';
import { withTransaction } from '../db/transaction';
import type { ApplicationRecord, ApplicationSource } from '../workspace/applications';

export interface ApplicationInsert {
  workspace_id: string;
  action_id: string;
  output_version_id: string | null;
  source: ApplicationSource;
  asserted_by: string | null;
  note: string | null;
  evidence: Record<string, unknown> | null;
}

export interface ApplicationRepository {
  /** Non-retracted rows for these actions, newest first. */
  forActions(workspaceId: string, actionIds: string[]): Promise<ApplicationRecord[]>;
  /** The newest non-retracted owner assertion for one action, or null. */
  latestOwnerAssertion(workspaceId: string, actionId: string): Promise<(ApplicationRecord & { output_version_id: string | null }) | null>;
  /** True when the version exists, belongs to this action, and is approved. */
  approvedVersion(workspaceId: string, actionId: string, versionId: string): Promise<boolean>;
  insert(row: ApplicationInsert): Promise<{ id: string } | null>;
  /** Insert + complete the action in one transaction. Returns null if the action is closed. */
  assertApplied(row: ApplicationInsert, nowIso: string): Promise<{ id: string } | null>;
  /** Stamp the newest non-retracted assertion and reopen the action. Returns null if there is none. */
  retract(workspaceId: string, actionId: string, actorId: string, nowIso: string): Promise<{ id: string } | null>;
}

const CLOSED_STATES = ['dismissed', 'cancelled', 'expired'];

export function applicationRepository(client?: Pick<Pool, 'query'>): ApplicationRepository {
  const db = () => client ?? getPool();
  return {
    async forActions(workspaceId, actionIds) {
      if (!actionIds.length) return [];
      return (await db().query<ApplicationRecord>(
        `SELECT p.id, p.action_id, p.source, p.asserted_at::text, p.retracted_at::text
         FROM action_applications p JOIN actions a ON a.id = p.action_id AND a.workspace_id = p.workspace_id
         WHERE p.workspace_id = $1 AND p.action_id = ANY($2::uuid[]) AND p.retracted_at IS NULL
         ORDER BY p.asserted_at DESC`,
        [workspaceId, actionIds],
      )).rows;
    },
    async latestOwnerAssertion(workspaceId, actionId) {
      return (await db().query<ApplicationRecord & { output_version_id: string | null }>(
        `SELECT id, action_id, source, asserted_at::text, retracted_at::text, output_version_id
         FROM action_applications
         WHERE workspace_id = $1 AND action_id = $2 AND source = 'owner_asserted' AND retracted_at IS NULL
         ORDER BY asserted_at DESC, id DESC LIMIT 1`,
        [workspaceId, actionId],
      )).rows[0] ?? null;
    },
    async approvedVersion(workspaceId, actionId, versionId) {
      return (await db().query(
        `SELECT 1 FROM output_versions
         WHERE id = $1 AND workspace_id = $2 AND action_id = $3 AND approval_state = 'approved'`,
        [versionId, workspaceId, actionId],
      )).rows.length > 0;
    },
    async insert(row) {
      return (await db().query<{ id: string }>(
        `INSERT INTO action_applications(workspace_id, action_id, output_version_id, source, asserted_by, note, evidence)
         SELECT $1, $2, $3, $4, $5, $6, $7
         WHERE EXISTS(SELECT 1 FROM actions WHERE id = $2 AND workspace_id = $1)
         RETURNING id`,
        [row.workspace_id, row.action_id, row.output_version_id, row.source, row.asserted_by, row.note, row.evidence],
      )).rows[0] ?? null;
    },
    async assertApplied(row, nowIso) {
      // withTransaction runs everything on one checked-out client (BEGIN/COMMIT/ROLLBACK
      // on the same connection), unlike issuing BEGIN on the pool directly.
      return withTransaction(async (conn) => {
        const inserted = await conn.query<{ id: string }>(
          `INSERT INTO action_applications(workspace_id, action_id, output_version_id, source, asserted_by, note, evidence)
           SELECT $1, $2, $3, $4, $5, $6, $7
           WHERE EXISTS(SELECT 1 FROM actions WHERE id = $2 AND workspace_id = $1 AND action_state <> ALL($8::text[]))
           RETURNING id`,
          [row.workspace_id, row.action_id, row.output_version_id, row.source, row.asserted_by, row.note, row.evidence, CLOSED_STATES],
        );
        if (!inserted.rows[0]) return null;
        await conn.query(
          `UPDATE actions SET action_state = 'completed', completed_at = $3, updated_at = $3
           WHERE id = $2 AND workspace_id = $1`,
          [row.workspace_id, row.action_id, nowIso],
        );
        return inserted.rows[0];
      });
    },
    async retract(workspaceId, actionId, actorId, nowIso) {
      return withTransaction(async (conn) => {
        const stamped = await conn.query<{ id: string }>(
          `UPDATE action_applications SET retracted_at = $4, retracted_by = $3
           WHERE id = (SELECT id FROM action_applications
             WHERE workspace_id = $1 AND action_id = $2 AND source = 'owner_asserted' AND retracted_at IS NULL
             ORDER BY asserted_at DESC, id DESC LIMIT 1)
           RETURNING id`,
          [workspaceId, actionId, actorId, nowIso],
        );
        if (!stamped.rows[0]) return null;
        // in_progress, not the action's prior state: it is valid in the CHECK,
        // it is honest (engaged, not done), and re-deriving the original state
        // would reimplement the derivation rules in a second place.
        await conn.query(
          `UPDATE actions SET action_state = 'in_progress', completed_at = NULL, updated_at = $3
           WHERE id = $2 AND workspace_id = $1`,
          [workspaceId, actionId, nowIso],
        );
        return stamped.rows[0];
      });
    },
  };
}
