import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { createScanExecutionStore } from "../../lib/scan/execution-store";
import { CLAIMABLE_JOB_CONDITION_SQL } from "../../lib/scan/claimable";
import { claimScanJob } from "../../lib/budgets/scan";

/** Polls until another session waits on an advisory lock; 0 after two seconds. */
async function advisoryWaiters(owner: Pool): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const n = (await owner.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted")).rows[0].n as number;
    if (n > 0) return n;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return 0;
}

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon budgeted scan claim", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href });
  });
  beforeEach(async () => {
    vi.stubEnv("POSTHOG_KEY", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runtime.query("DELETE FROM audit_jobs; DELETE FROM workspaces");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  const store = (env: Record<string, string | undefined>) => {
    const onBudgetRefused = vi.fn();
    return {
      onBudgetRefused,
      store: createScanExecutionStore(randomUUID(), {
        pool: runtime,
        env,
        onBudgetRefused,
        analytics: { insert: async () => {}, capturePostHog: async () => {}, reportError: () => {} },
      }),
    };
  };
  const job = async (opts: { status?: string; attempts?: number; age?: string; workspaceId?: string | null } = {}) =>
    (await runtime.query(
      "INSERT INTO audit_jobs(business_name,status,attempt_count,last_attempt_at,workspace_id) VALUES('Fixture',$1,$2,now()-$3::interval,$4) RETURNING id",
      [opts.status ?? "queued", opts.attempts ?? 0, opts.age ?? "0 minutes", opts.workspaceId ?? null],
    )).rows[0].id as string;
  /** A stalled first attempt, reclaimable now: its claim is a retry. */
  const retry = (workspaceId: string | null = null) => job({ status: "collecting", attempts: 1, age: "31 minutes", workspaceId });
  const workspace = async () =>
    (await runtime.query("INSERT INTO workspaces(slug) VALUES($1) RETURNING id", [`claim-${randomUUID().slice(0, 8)}`])).rows[0].id as string;
  const pastAttempt = async (workspaceId: string | null) => {
    const id = await job({ status: "done", attempts: 1, workspaceId });
    await runtime.query("INSERT INTO scan_attempts(job_id,workspace_id) VALUES($1,$2)", [id, workspaceId]);
  };
  const attemptRows = async (jobId: string) =>
    (await runtime.query("SELECT workspace_id FROM scan_attempts WHERE job_id=$1", [jobId])).rows;

  it("writes exactly one attempt row per claim, carrying the job's workspace", async () => {
    const ws = await workspace();
    const id = await job({ workspaceId: ws });
    const { store: s } = store({});
    expect(await s.claimJob(id)).not.toBeNull();
    expect(await attemptRows(id)).toEqual([{ workspace_id: ws }]);
    expect(await s.claimJob(id)).toBeNull();
    expect(await attemptRows(id)).toHaveLength(1);
    await runtime.query("UPDATE audit_jobs SET last_attempt_at=now()-interval '31 minutes' WHERE id=$1", [id]);
    expect(await s.claimJob(id)).not.toBeNull();
    expect(await attemptRows(id)).toHaveLength(2);
    expect((await runtime.query("SELECT attempt_count FROM audit_jobs WHERE id=$1", [id])).rows[0].attempt_count).toBe(2);
  });

  it("concurrent claims of one job write exactly one attempt row, with the lock and without it", async () => {
    for (const env of [{}, { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "off" }]) {
      const id = await job();
      const results = await Promise.all(Array.from({ length: 8 }, () => store(env).store.claimJob(id)));
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await attemptRows(id)).toHaveLength(1);
      expect((await runtime.query("SELECT attempt_count FROM audit_jobs WHERE id=$1", [id])).rows[0].attempt_count).toBe(1);
    }
  });

  it("writes no attempt row for a job it did not claim", async () => {
    const { store: s } = store({});
    const done = await job({ status: "done", attempts: 1, age: "60 minutes" });
    const leased = await job({ status: "collecting", attempts: 1, age: "29 minutes" });
    expect(await s.claimJob(done)).toBeNull();
    expect(await s.claimJob(leased)).toBeNull();
    expect(await attemptRows(done)).toEqual([]);
    expect(await attemptRows(leased)).toEqual([]);
  });

  it("still runs an admitted first attempt when the budget is already spent", async () => {
    await pastAttempt(null);
    await pastAttempt(null);
    const id = await job();
    const { store: s, onBudgetRefused } = store({ BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "1" });
    expect(await s.claimJob(id)).not.toBeNull();
    expect(onBudgetRefused).not.toHaveBeenCalled();
    expect(await attemptRows(id)).toHaveLength(1);
  });

  it("leaves an over-limit retry unclaimed and reports at_capacity", async () => {
    await pastAttempt(null);
    const id = await retry();
    const { store: s, onBudgetRefused } = store({ BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "1" });
    expect(await s.claimJob(id)).toBeNull();
    expect(onBudgetRefused).toHaveBeenCalledWith("scan_global");
    expect((await runtime.query("SELECT status,attempt_count FROM audit_jobs WHERE id=$1", [id])).rows[0]).toEqual({ status: "collecting", attempt_count: 1 });
    expect(await attemptRows(id)).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith("[budget] refused", { scope: "scan_global", entry: "retry_claim", used: 1, limit: 1 });
    // Still claimable, so the cron reclaim offers it again on a later tick.
    expect((await runtime.query(`SELECT id FROM audit_jobs WHERE ${CLAIMABLE_JOB_CONDITION_SQL}`)).rows.map((row) => row.id)).toContain(id);
  });

  it("counts pending first attempts against a retry", async () => {
    await pastAttempt(null);
    await job(); // admitted, never claimed: it holds a reserved attempt
    const id = await retry();
    expect(await store({ BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "2" }).store.claimJob(id)).toBeNull();
    expect(await store({ BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "3" }).store.claimJob(id)).not.toBeNull();
  });

  it("applies the workspace limit only to that workspace's retries", async () => {
    const env = { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "off", BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H: "1" };
    const busy = await workspace();
    const quiet = await workspace();
    await pastAttempt(busy);
    const refused = store(env);
    expect(await refused.store.claimJob(await retry(busy))).toBeNull();
    expect(refused.onBudgetRefused).toHaveBeenCalledWith("scan_workspace");
    expect(await store(env).store.claimJob(await retry(quiet))).not.toBeNull();
    expect(await store(env).store.claimJob(await retry(null))).not.toBeNull();
  });

  it("serializes retries racing for the last slot", async () => {
    const env = { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "2" };
    await pastAttempt(null);
    const first = await retry();
    const second = await retry();
    const held = await runtime.connect();
    try {
      await held.query("BEGIN");
      expect((await claimScanJob(held, first, env)).kind).toBe("claimed");
      const racing = store(env);
      const pending = racing.store.claimJob(second);
      const waiters = await advisoryWaiters(owner);
      await held.query("COMMIT");
      expect(await pending).toBeNull();
      expect(racing.onBudgetRefused).toHaveBeenCalledWith("scan_global");
      expect(waiters).toBe(1);
    } finally {
      held.release();
    }
    expect(await attemptRows(second)).toEqual([]);
  });

  it("claims first attempts but refuses retries when the configuration is invalid", async () => {
    const env = { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "0" };
    const refused = store(env);
    expect(await refused.store.claimJob(await retry())).toBeNull();
    expect(refused.onBudgetRefused).toHaveBeenCalledWith("scan_global");
    expect(console.error).toHaveBeenCalledWith("[budget] check_failed", { entry: "retry_claim", reason: "configuration" });
    expect(await store(env).store.claimJob(await job())).not.toBeNull();
  });
});
