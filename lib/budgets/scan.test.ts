import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADMISSION_USAGE_SQL,
  BUDGETED_CLAIM_SQL,
  PENDING_JOB_CONDITION_SQL,
  SCAN_BUDGET_LOCK_KEY,
  SCAN_BUDGET_LOCK_SQL,
  ScanBudgetRefusal,
  admitScanJob,
  claimScanJob,
} from "./scan";

afterEach(() => vi.restoreAllMocks());

/** Answers the lock with nothing and every other statement with `rows`, or throws `rows`. */
function client(rows: Array<Record<string, unknown>> | Error) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    void values;
    if (sql === SCAN_BUDGET_LOCK_SQL) return { rows: [] };
    if (rows instanceof Error) throw rows;
    return { rows };
  });
  return {
    query,
    db: { query } as unknown as Parameters<typeof admitScanJob>[0],
    statements: () => query.mock.calls.map(([sql, values]) => ({ sql, values })),
  };
}

describe("admitScanJob", () => {
  it("takes the budget lock, then counts with one statement", async () => {
    const fake = client([{ global_used: 0, workspace_used: 0 }]);
    await admitScanJob(fake.db, { workspaceId: "ws-1", entry: "rescan" }, {});
    expect(fake.statements()).toEqual([
      { sql: SCAN_BUDGET_LOCK_SQL, values: [SCAN_BUDGET_LOCK_KEY] },
      { sql: ADMISSION_USAGE_SQL, values: ["ws-1"] },
    ]);
  });

  it("admits below the default global limit of 200", async () => {
    await expect(admitScanJob(client([{ global_used: 199, workspace_used: 0 }]).db, { workspaceId: null, entry: "scan_start" }, {})).resolves.toBeUndefined();
  });

  it("refuses at the global limit with the fixed log line", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const refusal = await admitScanJob(client([{ global_used: 200, workspace_used: 0 }]).db, { workspaceId: null, entry: "scan_start" }, {}).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(ScanBudgetRefusal);
    expect(refusal).toMatchObject({ scope: "scan_global", message: "at_capacity" });
    expect(warn).toHaveBeenCalledWith("[budget] refused", { scope: "scan_global", entry: "scan_start", used: 200, limit: 200 });
  });

  it("checks the workspace limit only for a job that has a workspace", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = { BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H: "3" };
    const rows = [{ global_used: 5, workspace_used: 3 }];
    await expect(admitScanJob(client(rows).db, { workspaceId: "ws-1", entry: "rescan" }, env)).rejects.toMatchObject({ scope: "scan_workspace", message: "workspace_scan_budget_reached" });
    await expect(admitScanJob(client(rows).db, { workspaceId: null, entry: "scan_start" }, env)).resolves.toBeUndefined();
    await expect(admitScanJob(client([{ global_used: 5, workspace_used: 2 }]).db, { workspaceId: "ws-1", entry: "rescan" }, env)).resolves.toBeUndefined();
  });

  it("reports the global limit first when both are reached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "5", BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H: "3" };
    await expect(admitScanJob(client([{ global_used: 5, workspace_used: 3 }]).db, { workspaceId: "ws-1", entry: "rescan" }, env)).rejects.toMatchObject({ scope: "scan_global" });
  });

  it("neither locks nor counts when every applicable limit is off", async () => {
    const fake = client([{ global_used: 1000, workspace_used: 1000 }]);
    await admitScanJob(fake.db, { workspaceId: null, entry: "scan_start" }, { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "off" });
    await admitScanJob(fake.db, { workspaceId: "ws-1", entry: "rescan" }, { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "off" });
    expect(fake.query).not.toHaveBeenCalled();
  });

  it.each([
    ["the query fails", new Error("db down")],
    ["no row comes back", []],
    ["the count is not a number", [{ global_used: "many", workspace_used: 0 }]],
  ] as const)("refuses, with the check_failed line, when %s", async (_label, rows) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = client(rows instanceof Error ? rows : [...rows]);
    await expect(admitScanJob(fake.db, { workspaceId: null, entry: "scan_start" }, {})).rejects.toMatchObject({ scope: "scan_global", message: "at_capacity" });
    expect(error).toHaveBeenCalledWith("[budget] check_failed", { entry: "scan_start", reason: "query" });
  });

  it("refuses an invalid configuration before touching the database", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = client([{ global_used: 0, workspace_used: 0 }]);
    await expect(admitScanJob(fake.db, { workspaceId: "ws-1", entry: "rescan" }, { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "0" })).rejects.toMatchObject({ scope: "scan_global" });
    expect(fake.query).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("[budget] check_failed", { entry: "rescan", reason: "configuration" });
  });
});

describe("claimScanJob", () => {
  const claimedRow = { budget_allowed: true, budget_global_used: 3, budget_workspace_used: 0, id: "job-1", business_name: "Fixture" };

  it("claims with one statement after the lock, passing both limits", async () => {
    const fake = client([claimedRow]);
    expect(await claimScanJob(fake.db, "job-1", { BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H: "4" })).toEqual({ kind: "claimed", row: claimedRow });
    expect(fake.statements()).toEqual([
      { sql: SCAN_BUDGET_LOCK_SQL, values: [SCAN_BUDGET_LOCK_KEY] },
      { sql: BUDGETED_CLAIM_SQL, values: ["job-1", 200, 4] },
    ]);
  });

  it("reports not claimable when no row comes back, or when no job was updated", async () => {
    expect(await claimScanJob(client([]).db, "job-1", {})).toEqual({ kind: "not_claimable" });
    expect(await claimScanJob(client([{ budget_allowed: true, budget_global_used: 0, budget_workspace_used: 0, id: null }]).db, "job-1", {})).toEqual({ kind: "not_claimable" });
  });

  it("reports a retry refused on the global limit, with the fixed log line", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = client([{ budget_allowed: false, budget_global_used: 200, budget_workspace_used: 0, id: null }]);
    expect(await claimScanJob(fake.db, "job-1", {})).toEqual({ kind: "at_capacity", scope: "scan_global" });
    expect(warn).toHaveBeenCalledWith("[budget] refused", { scope: "scan_global", entry: "retry_claim", used: 200, limit: 200 });
  });

  it("reports a retry refused on the workspace limit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = client([{ budget_allowed: false, budget_global_used: 10, budget_workspace_used: 2, id: null }]);
    expect(await claimScanJob(fake.db, "job-1", { BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H: "2" })).toEqual({ kind: "at_capacity", scope: "scan_workspace" });
    expect(warn).toHaveBeenCalledWith("[budget] refused", { scope: "scan_workspace", entry: "retry_claim", used: 2, limit: 2 });
  });

  it("skips the lock, but still claims through the metered statement, when both limits are off", async () => {
    const fake = client([claimedRow]);
    expect((await claimScanJob(fake.db, "job-1", { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "off" })).kind).toBe("claimed");
    expect(fake.statements()).toEqual([{ sql: BUDGETED_CLAIM_SQL, values: ["job-1", null, null] }]);
  });

  it("refuses every retry, but not a first attempt, when the configuration is invalid", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const env = { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "zero" };
    const refused = client([{ budget_allowed: false, budget_global_used: 0, budget_workspace_used: 0, id: null }]);
    expect(await claimScanJob(refused.db, "job-1", env)).toEqual({ kind: "at_capacity", scope: "scan_global" });
    expect(refused.statements()[1]).toEqual({ sql: BUDGETED_CLAIM_SQL, values: ["job-1", 0, null] });
    expect(error).toHaveBeenCalledWith("[budget] check_failed", { entry: "retry_claim", reason: "configuration" });
    expect((await claimScanJob(client([claimedRow]).db, "job-1", env)).kind).toBe("claimed");
  });

  it("lets a SQL error propagate, so the store can report claim_failed", async () => {
    await expect(claimScanJob(client(new Error("db down")).db, "job-1", {})).rejects.toThrow("db down");
  });
});

describe("one definition of used", () => {
  it("counts the same attempts and pending jobs at admission and at the claim", () => {
    expect(PENDING_JOB_CONDITION_SQL).toBe("status IN ('queued','collecting','scoring','persisting') AND attempt_count = 0 AND created_at > now() - interval '24 hours'");
    for (const sql of [ADMISSION_USAGE_SQL, BUDGETED_CLAIM_SQL]) {
      expect(sql).toContain(PENDING_JOB_CONDITION_SQL);
      expect(sql).toContain("FROM scan_attempts WHERE attempted_at > now() - interval '24 hours'");
    }
    expect(BUDGETED_CLAIM_SQL).toContain("INSERT INTO scan_attempts (job_id, workspace_id) SELECT id, workspace_id FROM claimed");
  });
});
