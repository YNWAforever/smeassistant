import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { buildScanStartPayload, emptyScanDraft } from "../../lib/funnel/scan-start";
import { LEGAL_POLICY_VERSION } from "../../lib/legal/policy";
import { insertScanJob, parseScanStartBody } from "../../lib/scan/start-job";
import { ScanBudgetRefusal } from "../../lib/budgets/scan";
import { createScanExecutionStore } from "../../lib/scan/execution-store";

const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool, getDatabase: () => drizzle(ports.pool!) }));

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon scan pause (P3.5d)", () => {
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
  /** Every row an admitted scan writes: the job, its consent, its scan_started event. A refusal must leave all three unchanged. */
  const written = async () => (await runtime.query(`SELECT
      (SELECT count(*)::int FROM audit_jobs WHERE status='queued') AS jobs,
      (SELECT count(*)::int FROM consent_records) AS consents,
      (SELECT count(*)::int FROM scan_events WHERE event_name='scan_started') AS started`)).rows[0] as { jobs: number; consents: number; started: number };

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
  const job = async (opts: { status?: string; attempts?: number; age?: string; createdAge?: string; workspaceId?: string | null } = {}) =>
    (await runtime.query(
      "INSERT INTO audit_jobs(business_name,status,attempt_count,last_attempt_at,workspace_id,created_at) VALUES('Fixture',$1,$2,now()-$3::interval,$4,now()-$5::interval) RETURNING id",
      [opts.status ?? "queued", opts.attempts ?? 0, opts.age ?? "0 minutes", opts.workspaceId ?? null, opts.createdAge ?? "0 minutes"],
    )).rows[0].id as string;

  it("a paused start writes nothing", async () => {
    vi.stubEnv("SCANS_PAUSED", "true");
    const result = await start();
    expect(!result.ok && result.error instanceof ScanBudgetRefusal && result.error.scope).toBe("scan_paused");
    expect(await written()).toEqual({ jobs: 0, consents: 0, started: 0 });
  });

  it("a paused claim leaves the job untouched, and it claims normally once un-paused", async () => {
    const id = await job({ status: "queued" });
    // job() always writes a concrete last_attempt_at (now() - the given age,
    // "0 minutes" by default), never NULL, so "untouched" is verified against
    // this row's own before-claim values rather than a hard-coded NULL.
    const before = (await runtime.query("SELECT status, attempt_count, last_attempt_at FROM audit_jobs WHERE id=$1", [id])).rows[0];
    const paused = store({ SCANS_PAUSED: "true" });
    expect(await paused.store.claimJob(id)).toBeNull();
    expect(paused.onBudgetRefused).toHaveBeenCalledWith("scan_paused");
    const row = (await runtime.query("SELECT status, attempt_count, last_attempt_at FROM audit_jobs WHERE id=$1", [id])).rows[0];
    expect(row).toEqual(before);
    expect(row).toMatchObject({ status: "queued", attempt_count: 0 });
    expect((await runtime.query("SELECT count(*)::int AS n FROM scan_attempts WHERE job_id=$1", [id])).rows[0].n).toBe(0);
    expect(await store({}).store.claimJob(id)).not.toBeNull();
  });
});
