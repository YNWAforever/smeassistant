import "server-only";
import type { Pool, PoolClient } from "pg";
import { getPool } from "../db/client";
import { RUN_TIMED_OUT_EVENT } from "../workspace/audit";

/** Same shape as lib/repositories/artifacts.ts:15 so a PoolClient from `atomic()` also fits. */
type Executor = Pick<Pool | PoolClient, "query">;

/**
 * Reap `action_runs` rows stranded by a killed request handler.
 *
 * A generation run is written by three separate statements — queue(), start(),
 * finish() — inside one HTTP request. When the platform kills that request
 * between start() and finish() the row stays `running` forever: nothing else
 * ever writes it, `canGenerate` in components/workspace/action-detail-client.tsx
 * stays false, and the owner's Generate button is dead permanently.
 *
 * There is no migration here on purpose. scripts/neon/catalog.ts::verifyCatalog
 * deep-equals `columns`, `constraints` and `indexes` against the frozen
 * test/integration/fixtures/legacy-final-catalog.json, with allowlists for
 * functions and triggers ONLY, so a lease/expiry column on `action_runs` is not
 * reachable without rewriting the frozen oracle. Everything needed is already on
 * the table: `created_at NOT NULL DEFAULT now()`, `started_at`, `finished_at`,
 * and `timed_out` is already a legal value in `action_runs_state_check`.
 *
 * Design notes:
 *  1. `now()` is the database clock, never a JS Date, matching claim_audit_job
 *     and consume_rate_limit. A skewed app instance cannot reap a live run.
 *  2. `FOR UPDATE OF r SKIP LOCKED` (the idiom neon/migrations/0004_atomic_operations.sql
 *     already uses) means two concurrent reapers take disjoint rows; the loser
 *     writes zero rows and zero audit events rather than double-auditing.
 *  3. The CTE is `AS MATERIALIZED` deliberately. It is non-DML and referenced
 *     once, so PostgreSQL 12+ would otherwise be free to inline it and dissolve
 *     the locking step the whole concurrency argument rests on.
 *  4. The repeated `state IN ('queued','running')` on the UPDATE is
 *     defence-in-depth, not the guarantee. All parts of one statement share a
 *     snapshot, so the UPDATE's qual sees the same tuple version the CTE saw;
 *     the actual protection is the EvalPlanQual recheck that `FOR UPDATE`
 *     performs inside `stale`, re-evaluating the state qual against the latest
 *     committed tuple version before locking it.
 *  5. `r.workspace_id = $1` plus the `a.workspace_id = r.workspace_id` join means
 *     a guessed action id from another workspace reaps nothing.
 *  6. The locations check mirrors ACTION_SCOPE_PREDICATE (artifacts.ts:20). Without
 *     it an action whose `location_id` points into another workspace — exactly the
 *     condition that predicate exists to catch — would stamp the audit row with a
 *     foreign location. It also keeps the reaper off out-of-scope actions entirely.
 *  7. It deliberately does NOT touch `actions`. queue() and start() never write
 *     `action_state` (only finish() does), so a strand leaves `actions` untouched
 *     and there is nothing to reconcile — which also keeps the reaper clear of
 *     completion_fence_actions.
 *  8. `actor_type='system'`, `actor_id=NULL`: this is reconciliation, not a member
 *     action. The member whose page render triggered it did nothing.
 *  9. `payload.locale = NULL::text` mirrors recordNeonEvent's CLAUDE.md §3.11
 *     payload contract. The cast is explicit because a bare NULL literal in a
 *     VARIADIC "any" position is untyped.
 * 10. Callers must have authorized membership first — same contract as
 *     workspaceReadRepository.
 *
 * There is no fencing token, and none is needed: `loadRun(client, input, 'running')`
 * in artifacts.ts rejects any row whose state is not the expected one, so a
 * late-arriving worker's finish() throws `invalid_run_transition` and writes no
 * version, no `actions` update and no audit row.
 */
export const REAP_STALE_ACTION_RUNS_SQL = `WITH stale AS MATERIALIZED (
  SELECT r.id, r.action_id, r.workspace_id, a.location_id, r.agent_key, r.state AS previous_state,
         COALESCE(r.started_at, r.created_at) AS stale_since
  FROM action_runs r
  JOIN actions a ON a.id = r.action_id AND a.workspace_id = r.workspace_id
  WHERE r.workspace_id = $1
    AND r.action_id = ANY($2::uuid[])
    AND r.state IN ('queued','running')
    AND COALESCE(r.started_at, r.created_at) < now() - ($3::double precision * interval '1 millisecond')
    AND (a.location_id IS NULL OR EXISTS (SELECT 1 FROM locations l WHERE l.id = a.location_id AND l.workspace_id = a.workspace_id))
  ORDER BY r.id
  FOR UPDATE OF r SKIP LOCKED
), reaped AS (
  UPDATE action_runs r
  SET state = 'timed_out', finished_at = now()
  FROM stale s
  WHERE r.id = s.id AND r.state IN ('queued','running')
  RETURNING r.id, s.action_id, s.location_id, s.workspace_id, s.agent_key, s.previous_state, s.stale_since
)
INSERT INTO audit_events (workspace_id, location_id, actor_type, actor_id, event, entity_type, entity_id, payload)
SELECT workspace_id, location_id, 'system', NULL::uuid, '${RUN_TIMED_OUT_EVENT}', 'action_run', id,
       jsonb_build_object('locale', NULL::text, 'action_id', action_id, 'agent_key', agent_key,
                          'previous_state', previous_state, 'stale_since', stale_since,
                          'stale_after_ms', $3::double precision, 'reason', 'action_run_reaped')
FROM reaped
RETURNING entity_id AS run_id`;

export function actionRunReaperRepository(client?: Executor) {
  const db = () => client ?? getPool();
  return {
    /** Returns the ids of the runs this call transitioned; `[]` when there was nothing stale. */
    async reapStale(workspaceId: string, actionIds: string[], staleAfterMs: number): Promise<string[]> {
      if (!actionIds.length) return [];
      const result = await db().query<{ run_id: string }>(REAP_STALE_ACTION_RUNS_SQL, [workspaceId, actionIds, staleAfterMs]);
      return result.rows.map((row) => row.run_id);
    },
  };
}
