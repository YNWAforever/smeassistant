import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { createBudgetPool } from "../../lib/db/budget-pool";
import { createExecutionBudget, settleWithinReserve, withExecutionBudget } from "../../lib/jobs/execution-budget";
import { withTransaction } from "../../lib/db/transaction";

describe.runIf(process.env.NEON_INTEGRATION === "1")("real PostgreSQL shared execution deadline (T-11)", () => {
  let fixture: NeonDatabaseFixture, owner: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl, connectionTimeoutMillis: 10_000 });
    await owner.query("CREATE TABLE budget_probe(id int primary key, value int); INSERT INTO budget_probe VALUES(1,0)");
  });
  afterAll(async () => { await owner?.end(); fixture?.stop(); });

  it("actually terminates slow SQL and rolls back its transaction instead of merely racing a promise", async () => {
    const budget = createExecutionBudget({ durationMs: 1200 });
    const pool = createBudgetPool({ connectionString: fixture.databaseUrl, application_name: "budget-slow" }, budget);
    const started = performance.now();
    try {
      await expect(withExecutionBudget(budget, () => withTransaction(async client => {
        await client.query("UPDATE budget_probe SET value=1 WHERE id=1");
        await client.query("SELECT pg_sleep(10)");
      }, pool))).rejects.toThrow();
      expect(performance.now() - started).toBeLessThan(2500);
      expect((await owner.query("SELECT value FROM budget_probe WHERE id=1")).rows[0].value).toBe(0);
      expect((await owner.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='budget-slow' AND state='active'")).rows[0].count).toBe(0);
    } finally { budget.dispose(); await pool.end(); }
  });

  it("caps pool queue waiting by remaining time", async () => {
    const budget = createExecutionBudget({ durationMs: 1200 });
    const pool = createBudgetPool({ connectionString: fixture.databaseUrl, max: 1 }, budget);
    try {
      const held = await pool.connect();
      const started = performance.now();
      await expect(pool.connect()).rejects.toThrow();
      expect(performance.now() - started).toBeLessThan(2500);
      held.release();
    } finally { budget.dispose(); await pool.end(); }
  });

  it("caps real row-lock waiting and allows only settlement within the reserved time", async () => {
    const held = await owner.connect(); await held.query("BEGIN; UPDATE budget_probe SET value=0 WHERE id=1");
    const budget = createExecutionBudget({ durationMs: 1200, reserveMs: 1000 });
    const pool = createBudgetPool({ connectionString: fixture.databaseUrl, lock_timeout: 20_000 }, budget);
    try {
      await expect(withExecutionBudget(budget, async () => {
        await expect(pool.query("UPDATE budget_probe SET value=2 WHERE id=1")).rejects.toThrow();
        await settleWithinReserve(budget, async () => expect((await pool.query("SELECT 1 AS settled")).rows[0].settled).toBe(1));
      })).resolves.toBeUndefined();
      expect(budget.remainingMs()).toBeLessThan(100);
    } finally { await held.query("ROLLBACK"); held.release(); budget.dispose(); await pool.end(); }
  });
});
