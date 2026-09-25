import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { buildScanStartPayload, emptyScanDraft } from "../../lib/funnel/scan-start";
import { LEGAL_POLICY_VERSION } from "../../lib/legal/policy";
import { insertScanJob, parseScanStartBody } from "../../lib/scan/start-job";
import { admitScanJob, ScanBudgetRefusal } from "../../lib/budgets/scan";

const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool, getDatabase: () => drizzle(ports.pool!) }));

/** Polls until another session waits on an advisory lock; 0 after two seconds. */
async function advisoryWaiters(owner: Pool): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const n = (await owner.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted")).rows[0].n as number;
    if (n > 0) return n;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return 0;
}

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon scan admission budget", () => {
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
    runtime = new Pool({ connectionString: url.href, max: 12 });
    ports.pool = runtime;
  });
  beforeEach(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runtime.query("DELETE FROM audit_jobs; DELETE FROM workspaces");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  const start = (attribution: { workspaceId?: string } = {}) => {
    const parsed = parseScanStartBody(buildScanStartPayload({ ...emptyScanDraft("hk", "Budget shop"), manualEntry: true, industry: "fnb", district: "東區" }, "zh-HK", { granted: true, policyVersion: LEGAL_POLICY_VERSION }));
    if (!parsed.ok) throw new Error("invalid fixture");
    return insertScanJob(parsed.input, parsed.consent, { anonymousSessionId: randomUUID() }, attribution);
  };
  const refusedScope = (result: Awaited<ReturnType<typeof start>>) =>
    !result.ok && result.error instanceof ScanBudgetRefusal ? result.error.scope : null;
  const workspace = async () =>
    (await runtime.query("INSERT INTO workspaces(slug) VALUES($1) RETURNING id", [`budget-${randomUUID().slice(0, 8)}`])).rows[0].id as string;
  /** A finished job with one logged attempt, `age` ago. */
  const pastAttempt = async (workspaceId: string | null, age = "1 hour") => {
    const job = (await runtime.query("INSERT INTO audit_jobs(business_name,status,attempt_count,workspace_id) VALUES('Earlier','done',1,$1) RETURNING id", [workspaceId])).rows[0].id;
    await runtime.query("INSERT INTO scan_attempts(job_id,workspace_id,attempted_at) VALUES($1,$2,now()-$3::interval)", [job, workspaceId, age]);
  };
  const queued = async () => (await runtime.query("SELECT count(*)::int AS n FROM audit_jobs WHERE status='queued'")).rows[0].n as number;

  it("admits under the limit and refuses at it, counting attempts in the last 24 hours only", async () => {
    vi.stubEnv("BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "2");
    await pastAttempt(null, "25 hours");
    await pastAttempt(null);
    expect((await start()).ok).toBe(true);
    expect(refusedScope(await start())).toBe("scan_global");
    expect(await queued()).toBe(1);
    expect(console.warn).toHaveBeenCalledWith("[budget] refused", { scope: "scan_global", entry: "scan_start", used: 2, limit: 2 });
  });

  it("counts pending jobs as reserved attempts, but not pending jobs older than the window", async () => {
    vi.stubEnv("BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "2");
    await runtime.query("INSERT INTO audit_jobs(business_name,status,created_at) VALUES('Stale','queued',now()-interval '25 hours')");
    expect((await start()).ok).toBe(true);
    expect((await start()).ok).toBe(true);
    expect(refusedScope(await start())).toBe("scan_global");
  });

  it("refuses a rescan on its workspace limit, not another workspace's or a public scan", async () => {
    vi.stubEnv("BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "off");
    vi.stubEnv("BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H", "1");
    const busy = await workspace();
    const quiet = await workspace();
    await pastAttempt(busy);
    expect(refusedScope(await start({ workspaceId: busy }))).toBe("scan_workspace");
    expect(console.warn).toHaveBeenCalledWith("[budget] refused", { scope: "scan_workspace", entry: "rescan", used: 1, limit: 1 });
    expect((await start({ workspaceId: quiet })).ok).toBe(true);
    expect((await start()).ok).toBe(true);
  });

  it("admits exactly one of two requests racing for the last slot", async () => {
    vi.stubEnv("BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "2");
    await pastAttempt(null);
    const first = await runtime.connect();
    try {
      await first.query("BEGIN");
      await admitScanJob(first, { workspaceId: null, entry: "scan_start" });
      await first.query("INSERT INTO audit_jobs(business_name,status) VALUES('First','queued')");
      // With the lock, the second request now waits behind the first. Without
      // it, the second would count 1 (the first is uncommitted) and be admitted.
      const second = start();
      const waiters = await advisoryWaiters(owner);
      await first.query("COMMIT");
      expect(refusedScope(await second)).toBe("scan_global");
      expect(waiters).toBe(1);
    } finally {
      first.release();
    }
    expect(await queued()).toBe(1);
  });

  it("lets a burst of eight admit exactly the three free slots", async () => {
    vi.stubEnv("BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "3");
    const results = await Promise.all(Array.from({ length: 8 }, () => start()));
    expect(results.filter((result) => result.ok)).toHaveLength(3);
    expect(results.map(refusedScope).filter((scope) => scope === "scan_global")).toHaveLength(5);
    expect(await queued()).toBe(3);
  });

  it("refuses, and writes nothing, when the budget count cannot be read", async () => {
    await owner.query("REVOKE SELECT ON public.scan_attempts FROM sme_app_runtime");
    try {
      expect(refusedScope(await start())).toBe("scan_global");
      expect(console.error).toHaveBeenCalledWith("[budget] check_failed", { entry: "scan_start", reason: "query" });
      expect(await queued()).toBe(0);
    } finally {
      await owner.query("GRANT SELECT ON public.scan_attempts TO sme_app_runtime");
    }
  });
});
