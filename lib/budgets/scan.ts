import type { PoolClient } from "pg";

import { CLAIMABLE_JOB_CONDITION_SQL } from "../scan/claimable";
import { readBudgetConfig, type BudgetConfig } from "./config";
import { logBudgetCheckFailed, logBudgetRefusal, type BudgetEntry, type BudgetScope } from "./log";

/**
 * Scan spend budgets (P3.5a, docs/superpowers/specs/2026-09-25-spend-budgets-design.md).
 *
 * The unit is a scan attempt, retries included. "Used" is the same number at
 * every entry point: attempts logged in scan_attempts in the last 24 hours,
 * plus pending jobs (created in the last 24 hours and never claimed). Each
 * pending job holds one reserved attempt, so a burst of starts cannot queue
 * past the limit before any of them has been claimed.
 *
 * Every budget decision first takes one transaction-scoped advisory lock, as
 * a statement of its own. It cannot live inside the counting statement: under
 * READ COMMITTED a statement's snapshot is taken when the statement starts, so
 * a lock acquired mid-statement would count from a snapshot older than the
 * lock, and two requests could both see the last slot free.
 */
type Queryable = Pick<PoolClient, "query">;
type Env = Record<string, string | undefined>;

/** The single lock key for every scan-budget decision, hashed like the repo's other advisory keys. */
export const SCAN_BUDGET_LOCK_KEY = "budget:scan-attempts";
export const SCAN_BUDGET_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtextextended($1,0))";

const WINDOW_SQL = "now() - interval '24 hours'";

/** Admitted but never claimed: one reserved attempt each. */
export const PENDING_JOB_CONDITION_SQL = `status IN ('queued','collecting','scoring','persisting') AND attempt_count = 0 AND created_at > ${WINDOW_SQL}`;

/** Attempts in the window plus pending jobs, optionally for one workspace (given as a SQL expression). */
function usedSql(workspace: string | null): string {
  const scope = workspace ? `workspace_id = ${workspace} AND ` : "";
  return `((SELECT count(*) FROM scan_attempts WHERE ${scope}attempted_at > ${WINDOW_SQL}) + (SELECT count(*) FROM audit_jobs WHERE ${scope}${PENDING_JOB_CONDITION_SQL}))::int`;
}

/** $1 = the workspace id, or NULL (its count is then 0). */
export const ADMISSION_USAGE_SQL = `SELECT ${usedSql(null)} AS global_used, ${usedSql("$1::uuid")} AS workspace_used`;

/**
 * The production claim: one data-modifying statement. $1 = job id, $2 = the
 * global limit or NULL (off), $3 = the workspace limit or NULL (off).
 *
 * A first attempt (attempt_count = 0) was admitted at start or rescan and is
 * never checked again, so admitted work finishes. A retry is claimed only
 * while used < limit, with used counted exactly as at admission. `claimed`
 * re-applies the claimable condition, so a concurrent claim still loses.
 * `attempt` writes the job's scan_attempts row from the same statement, so a
 * claim and its row cannot exist without each other.
 *
 * Zero rows: the job is not claimable. One row with budget_allowed false: a
 * retry refused on budget. One row with an id: claimed.
 */
export const BUDGETED_CLAIM_SQL = `WITH target AS (
  SELECT id AS target_id, workspace_id AS target_workspace_id, attempt_count AS target_attempts
  FROM audit_jobs WHERE id = $1 AND ${CLAIMABLE_JOB_CONDITION_SQL}
), counts AS (
  SELECT ${usedSql(null)} AS global_used, ${usedSql("(SELECT target_workspace_id FROM target)")} AS workspace_used
), decision AS (
  SELECT target_id, target_workspace_id, target_attempts, global_used, workspace_used,
    (target_attempts = 0
      OR (($2::int IS NULL OR global_used < $2::int)
        AND ($3::int IS NULL OR target_workspace_id IS NULL OR workspace_used < $3::int))) AS allowed
  FROM target CROSS JOIN counts
), claimed AS (
  UPDATE audit_jobs SET status='collecting',processing_stage='collecting',attempt_count=attempt_count+1,last_attempt_at=now()
  WHERE id = $1 AND ${CLAIMABLE_JOB_CONDITION_SQL} AND EXISTS (SELECT 1 FROM decision WHERE allowed)
  RETURNING *
), attempt AS (
  INSERT INTO scan_attempts (job_id, workspace_id) SELECT id, workspace_id FROM claimed RETURNING job_id
)
SELECT decision.allowed AS budget_allowed, decision.global_used AS budget_global_used,
  decision.workspace_used AS budget_workspace_used, claimed.*
FROM decision LEFT JOIN claimed ON true`;

export type ScanBudgetScope = Extract<BudgetScope, "scan_global" | "scan_workspace">;

/** Thrown by admission. The message is the route's error code. */
export class ScanBudgetRefusal extends Error {
  constructor(readonly scope: ScanBudgetScope) {
    super(scope === "scan_workspace" ? "workspace_scan_budget_reached" : "at_capacity");
    this.name = "ScanBudgetRefusal";
  }
}

function readScanConfig(env: Env, entry: BudgetEntry): BudgetConfig {
  try {
    return readBudgetConfig(env);
  } catch {
    logBudgetCheckFailed(entry, "configuration");
    throw new ScanBudgetRefusal("scan_global");
  }
}

/**
 * Admission for a new job, on the caller's transaction client, before the job
 * row is inserted (lib/repositories/jobs.ts). The lock is held until that
 * transaction ends, so the pending job it admits is visible to the next
 * decision. Throws ScanBudgetRefusal; any error in the check refuses too.
 */
export async function admitScanJob(
  client: Queryable,
  input: { workspaceId: string | null; entry: "scan_start" | "rescan" },
  env: Env = process.env,
): Promise<void> {
  const config = readScanConfig(env, input.entry);
  const workspaceLimit = input.workspaceId === null ? null : config.scanAttemptsWorkspace24h;
  if (config.scanAttemptsGlobal24h === null && workspaceLimit === null) return;
  let used: { global: number; workspace: number };
  try {
    await client.query(SCAN_BUDGET_LOCK_SQL, [SCAN_BUDGET_LOCK_KEY]);
    const row = (await client.query<{ global_used: number; workspace_used: number }>(ADMISSION_USAGE_SQL, [input.workspaceId])).rows[0];
    used = { global: Number(row.global_used), workspace: Number(row.workspace_used) };
    if (!Number.isFinite(used.global) || !Number.isFinite(used.workspace)) throw new Error("budget_usage_invalid");
  } catch {
    logBudgetCheckFailed(input.entry, "query");
    throw new ScanBudgetRefusal("scan_global");
  }
  if (config.scanAttemptsGlobal24h !== null && used.global >= config.scanAttemptsGlobal24h) {
    logBudgetRefusal("scan_global", input.entry, used.global, config.scanAttemptsGlobal24h);
    throw new ScanBudgetRefusal("scan_global");
  }
  if (workspaceLimit !== null && used.workspace >= workspaceLimit) {
    logBudgetRefusal("scan_workspace", input.entry, used.workspace, workspaceLimit);
    throw new ScanBudgetRefusal("scan_workspace");
  }
}

type ClaimRow = Record<string, unknown> & {
  budget_allowed?: boolean | null;
  budget_global_used?: number | null;
  budget_workspace_used?: number | null;
};

export type ClaimOutcome =
  | { kind: "claimed"; row: Record<string, unknown> }
  | { kind: "not_claimable" }
  | { kind: "at_capacity"; scope: ScanBudgetScope };

/**
 * The claim, on the caller's transaction client (lib/scan/execution-store.ts
 * gives it one). SQL errors propagate, so the store keeps reporting
 * claim_failed. An invalid budget configuration claims first attempts and
 * refuses every retry (a global limit of 0 for this statement), so a bad
 * variable never lets retries through unmetered.
 */
export async function claimScanJob(client: Queryable, jobId: string, env: Env = process.env): Promise<ClaimOutcome> {
  let limits: { global: number | null; workspace: number | null };
  let configurationFailed = false;
  try {
    const config = readBudgetConfig(env);
    limits = { global: config.scanAttemptsGlobal24h, workspace: config.scanAttemptsWorkspace24h };
  } catch {
    configurationFailed = true;
    limits = { global: 0, workspace: null };
  }
  if (limits.global !== null || limits.workspace !== null) {
    await client.query(SCAN_BUDGET_LOCK_SQL, [SCAN_BUDGET_LOCK_KEY]);
  }
  const row = (await client.query<ClaimRow>(BUDGETED_CLAIM_SQL, [jobId, limits.global, limits.workspace])).rows[0];
  if (!row) return { kind: "not_claimable" };
  if (row.budget_allowed === false) {
    if (configurationFailed) {
      logBudgetCheckFailed("retry_claim", "configuration");
      return { kind: "at_capacity", scope: "scan_global" };
    }
    const globalUsed = Number(row.budget_global_used);
    if (limits.global !== null && globalUsed >= limits.global) {
      logBudgetRefusal("scan_global", "retry_claim", globalUsed, limits.global);
      return { kind: "at_capacity", scope: "scan_global" };
    }
    logBudgetRefusal("scan_workspace", "retry_claim", Number(row.budget_workspace_used), limits.workspace ?? 0);
    return { kind: "at_capacity", scope: "scan_workspace" };
  }
  return typeof row.id === "string" ? { kind: "claimed", row } : { kind: "not_claimable" };
}
