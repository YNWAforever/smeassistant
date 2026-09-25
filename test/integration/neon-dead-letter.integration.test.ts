import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { deadLetterRepository } from "../../lib/repositories/dead-letter";
import { createScanExecutionStore } from "../../lib/scan/execution-store";

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon dead-letter handling", () => {
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
    runtime = new Pool({ connectionString: url.href, max: 6 });
  });
  beforeEach(async () => {
    vi.stubEnv("POSTHOG_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await runtime.query("DELETE FROM audit_events; DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM app_users");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  const repo = () => deadLetterRepository(runtime);
  const workspace = async () => (await runtime.query("INSERT INTO workspaces(slug) VALUES($1) RETURNING id", [`dl-${randomUUID().slice(0, 8)}`])).rows[0].id as string;
  const stuck = async (lastAttempt: string, opts: { attempts?: number; ws?: string | null; session?: string } = {}) => {
    const id = (await runtime.query(
      "INSERT INTO audit_jobs(business_name,status,processing_stage,attempt_count,last_attempt_at,workspace_id) VALUES('Stuck','collecting','collecting_aeo',$1,now()-$2::interval,$3) RETURNING id",
      [opts.attempts ?? 3, lastAttempt, opts.ws ?? null],
    )).rows[0].id as string;
    if (opts.session)
      await runtime.query("INSERT INTO scan_events(job_id,anonymous_session_id,event_name,properties,dedupe_key) VALUES($1,$2,'scan_started','{}','started')", [id, opts.session]);
    return id;
  };
  const jobRow = async (id: string) => (await runtime.query("SELECT status,processing_stage,failure_category,failure_correlation_id,completed_at,attempt_count FROM audit_jobs WHERE id=$1", [id])).rows[0];
  const events = async (id: string) => (await runtime.query("SELECT event,actor_type,actor_id,workspace_id,payload FROM audit_events WHERE entity_id=$1 ORDER BY id", [id])).rows;
  const completed = async (id: string) => (await runtime.query("SELECT anonymous_session_id,properties FROM scan_events WHERE job_id=$1 AND event_name='scan_completed'", [id])).rows;
  const operator = async () => (await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`${randomUUID()}@fimmick.test`])).rows[0].id as string;

  describe("closeExhausted", () => {
    it("closes a scan stuck for over 24 hours as ATTEMPTS_EXHAUSTED, but not one at 23 hours", async () => {
      const ws = await workspace();
      const old = await stuck("25 hours", { ws, session: "session-1" });
      const recent = await stuck("23 hours");
      expect(await repo().closeExhausted(20)).toEqual([old]);
      expect(await jobRow(old)).toMatchObject({ status: "failed", processing_stage: "failed", failure_category: "ATTEMPTS_EXHAUSTED" });
      expect((await jobRow(old)).failure_correlation_id).toMatch(/^[0-9a-f-]{36}$/);
      expect((await jobRow(old)).completed_at).not.toBeNull();
      expect((await jobRow(recent)).status).toBe("collecting");
    });

    it("writes exactly one scan_completed under the scan's own session and one scan.auto_closed", async () => {
      const ws = await workspace();
      const old = await stuck("25 hours", { ws, session: "session-1" });
      await repo().closeExhausted(20);
      await repo().closeExhausted(20);
      expect(await completed(old)).toEqual([{ anonymous_session_id: "session-1", properties: { outcome: "failed", coverage: 0 } }]);
      expect(await events(old)).toEqual([{ event: "scan.auto_closed", actor_type: "system", actor_id: null, workspace_id: ws, payload: { locale: null, attempts: 3 } }]);
    });

    it("still records scan_completed when the scan has no scan_started session", async () => {
      const old = await stuck("25 hours");
      await repo().closeExhausted(20);
      expect(await completed(old)).toHaveLength(1);
    });

    it("never closes a claimable job, and respects the batch limit", async () => {
      const claimable = await stuck("25 hours", { attempts: 2 });
      await stuck("26 hours");
      await stuck("27 hours");
      expect(await repo().closeExhausted(1)).toHaveLength(1);
      expect((await jobRow(claimable)).status).toBe("collecting");
    });
  });

  describe("release", () => {
    it("grants exactly one more attempt on the same job and records who released it", async () => {
      const ws = await workspace();
      const id = await stuck("2 hours", { ws, attempts: 4 });
      const op = await operator();
      expect(await repo().release(id, op)).toEqual({ released: true, previousAttempts: 4 });
      expect((await jobRow(id)).attempt_count).toBe(2);
      expect(await events(id)).toEqual([{ event: "ops.scan.released", actor_type: "user", actor_id: op, workspace_id: ws, payload: { locale: null, previous_attempts: 4 } }]);
      expect(await repo().release(id, op)).toEqual({ released: false });
    });

    it("refuses a job that is not dead-lettered", async () => {
      const op = await operator();
      const claimable = await stuck("2 hours", { attempts: 2 });
      const fresh = await stuck("5 minutes");
      const done = (await runtime.query("INSERT INTO audit_jobs(business_name,status,attempt_count) VALUES('Done','done',3) RETURNING id")).rows[0].id;
      for (const id of [claimable, fresh, done, randomUUID()]) expect(await repo().release(id, op)).toEqual({ released: false });
      expect(await events(claimable)).toEqual([]);
    });

    it("lets exactly one of two concurrent releases win", async () => {
      const id = await stuck("2 hours");
      const op = await operator();
      const results = await Promise.all([repo().release(id, op), repo().release(id, op)]);
      expect(results.filter((r) => r.released)).toHaveLength(1);
      expect(await events(id)).toHaveLength(1);
    });

    it("makes the job claimable once, through the budgeted claim, which logs one attempt", async () => {
      vi.stubEnv("BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "off");
      const id = await stuck("2 hours");
      await repo().release(id, await operator());
      const store = createScanExecutionStore(randomUUID(), {
        pool: runtime,
        env: { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "off" },
        onBudgetRefused: vi.fn(),
        analytics: { insert: async () => {}, capturePostHog: async () => {}, reportError: () => {} },
      });
      expect(await store.claimJob(id)).not.toBeNull();
      expect((await jobRow(id)).attempt_count).toBe(3);
      expect((await runtime.query("SELECT count(*)::int AS n FROM scan_attempts WHERE job_id=$1", [id])).rows[0].n).toBe(1);
    });

    it("stops the auto-close from closing a job released inside the grace window", async () => {
      const id = await stuck("25 hours");
      await repo().release(id, await operator());
      expect(await repo().closeExhausted(20)).toEqual([]);
      expect((await jobRow(id)).status).toBe("collecting");
    });
  });
});
