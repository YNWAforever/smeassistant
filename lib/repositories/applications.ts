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

/**
 * Result of an owner-assertion insert attempt. `assertApplied`'s guard runs
 * inside the same transaction as the insert, so by the time it returns, the
 * write already did or didn't happen -- this only explains why not, it never
 * decides whether to write. Distinguishing the two zero-row causes matters
 * because they call for different responses: 'duplicate' is a double-clicked
 * button and should look exactly like the up-front idempotency path (200,
 * pointing at the row that exists); 'closed' is the only case that is
 * actually false to report as anything but a refusal.
 */
export type AssertOutcome =
  | { ok: true; id: string }
  | { ok: false; reason: 'closed' | 'duplicate'; existingId?: string };

export interface ApplicationRepository {
  /** Non-retracted rows for these actions, newest first. */
  forActions(workspaceId: string, actionIds: string[]): Promise<ApplicationRecord[]>;
  /** The newest non-retracted owner assertion for one action, or null. */
  latestOwnerAssertion(workspaceId: string, actionId: string): Promise<(ApplicationRecord & { output_version_id: string | null }) | null>;
  /** True when the version exists, belongs to this action, and is approved. */
  approvedVersion(workspaceId: string, actionId: string, versionId: string): Promise<boolean>;
  /**
   * The verifier path: records an observation about the world. Deliberately
   * has no closed-action guard (unlike assertApplied) — an owner dismissing
   * an action does not make what a verifier observed untrue, so a closed
   * action can still receive a 'verified' row. Only 'owner_asserted' rows
   * are a workflow act gated on the action being open; see assertApplied.
   */
  insert(row: ApplicationInsert): Promise<{ id: string } | null>;
  /**
   * Insert + complete the action in one transaction. A zero-row insert is
   * diagnosed, still inside the transaction, to tell a duplicate submit
   * (a live owner_asserted row already exists for the same
   * output_version_id, including the null/checklist case) from a genuinely
   * closed action — see AssertOutcome.
   */
  assertApplied(row: ApplicationInsert, nowIso: string): Promise<AssertOutcome>;
  /**
   * Stamps EVERY live (non-retracted) owner_asserted row for this action —
   * not just the newest — and reopens the action. "I did not apply this"
   * must leave no standing owner claim; leaving an older live row would let
   * strongestBasis keep returning 'owner_asserted' after the owner withdrew
   * it, which is the exact overclaiming this table exists to prevent.
   * 'verified' rows are untouched: an owner withdrawing their own claim does
   * not invalidate an independent check. Returns the count of rows stamped
   * (0 when there was nothing live to retract).
   */
  retract(workspaceId: string, actionId: string, actorId: string, nowIso: string): Promise<{ retracted: number }>;
}

const CLOSED_STATES = ['dismissed', 'cancelled', 'expired'];

/**
 * Resolves the connection the transactional methods should use. Throws
 * rather than silently falling back to the ambient pool when a query-only
 * client was injected: a silent fallback would mean an injected test/scoped
 * client is ignored and a real write lands on the ambient database, which is
 * far worse than a loud, immediate failure.
 */
function transactor(client?: Pick<Pool, 'query'> & Partial<Pick<Pool, 'connect'>>): Pick<Pool, 'connect'> {
  if (!client) return getPool();
  if (typeof client.connect !== 'function') {
    throw new Error('applicationRepository: a query-only client cannot run assertApplied/retract; inject a Pool');
  }
  return client as Pick<Pool, 'connect'>;
}

export function applicationRepository(client?: Pick<Pool, 'query'> & Partial<Pick<Pool, 'connect'>>): ApplicationRepository {
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
           AND NOT EXISTS (
             SELECT 1 FROM action_applications
             WHERE workspace_id = $1 AND action_id = $2 AND source = 'owner_asserted'
               AND retracted_at IS NULL
               AND output_version_id IS NOT DISTINCT FROM $3
           )
           RETURNING id`,
          [row.workspace_id, row.action_id, row.output_version_id, row.source, row.asserted_by, row.note, row.evidence, CLOSED_STATES],
        );
        if (inserted.rows[0]) {
          await conn.query(
            `UPDATE actions SET action_state = 'completed', completed_at = $3, updated_at = $3
             WHERE id = $2 AND workspace_id = $1`,
            [row.workspace_id, row.action_id, nowIso],
          );
          return { ok: true, id: inserted.rows[0].id };
        }
        // Zero rows: the insert's WHERE refused for one of two reasons that
        // look identical from the caller's side of that query. Diagnose which,
        // still inside this transaction -- there is no window to lose here,
        // the write already didn't happen; this only explains why.
        const diagnosis = await conn.query<{ duplicate_id: string | null; action_open: boolean }>(
          `SELECT
             (SELECT id FROM action_applications
               WHERE workspace_id = $1 AND action_id = $2 AND source = 'owner_asserted'
                 AND retracted_at IS NULL AND output_version_id IS NOT DISTINCT FROM $3
               ORDER BY asserted_at DESC, id DESC LIMIT 1) AS duplicate_id,
             EXISTS(SELECT 1 FROM actions
               WHERE id = $2 AND workspace_id = $1 AND action_state <> ALL($4::text[])) AS action_open`,
          [row.workspace_id, row.action_id, row.output_version_id, CLOSED_STATES],
        );
        const { duplicate_id, action_open } = diagnosis.rows[0] ?? { duplicate_id: null, action_open: false };
        if (duplicate_id) return { ok: false, reason: 'duplicate', existingId: duplicate_id };
        // action_open === true here would mean neither guard clause explains
        // the empty insert, which the SQL above says cannot happen; treated
        // as closed defensively rather than left unhandled.
        void action_open;
        return { ok: false, reason: 'closed' };
      }, transactor(client));
    },
    async retract(workspaceId, actionId, actorId, nowIso) {
      return withTransaction(async (conn) => {
        const stamped = await conn.query(
          `UPDATE action_applications SET retracted_at = $4, retracted_by = $3
           WHERE workspace_id = $1 AND action_id = $2 AND source = 'owner_asserted' AND retracted_at IS NULL
           RETURNING id`,
          [workspaceId, actionId, actorId, nowIso],
        );
        if (!stamped.rows.length) return { retracted: 0 };
        // in_progress, not the action's prior state: it is valid in the CHECK,
        // it is honest (engaged, not done), and re-deriving the original state
        // would reimplement the derivation rules in a second place.
        await conn.query(
          `UPDATE actions SET action_state = 'in_progress', completed_at = NULL, updated_at = $3
           WHERE id = $2 AND workspace_id = $1`,
          [workspaceId, actionId, nowIso],
        );
        return { retracted: stamped.rows.length };
      }, transactor(client));
    },
  };
}
