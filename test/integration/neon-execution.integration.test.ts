import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import {
  startNeonDatabaseFixture,
  type NeonDatabaseFixture,
} from "./neon-database";
import {
  createScanExecution,
  persistScanDiff,
  persistAeoSnapshots,
  type ScanPersistence,
} from "@sme-scanner/scan-engine";
import { createFixtureCollector } from "../../lib/scan/fixtures";
import {
  createScanExecutionStore,
  buildTrendDiffDeps,
  buildAeoSnapshotDeps,
} from "../../lib/scan/execution-store";
describe.runIf(process.env.NEON_INTEGRATION === "1")(
  "Neon scan execution",
  () => {
    let fixture: NeonDatabaseFixture, owner: Pool, runtime: Pool;
    beforeAll(async () => {
      fixture = await startNeonDatabaseFixture("test");
      owner = new Pool({ connectionString: fixture.databaseUrl });
      await owner.query(
        "CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime",
      );
      await applyMigrations(owner);
      const url = new URL(fixture.databaseUrl);
      url.username = "fixture_runtime";
      url.password = "fixture-only";
      runtime = new Pool({ connectionString: url.href });
    });
    beforeEach(async () => {
      vi.stubEnv("POSTHOG_KEY", "");
      await runtime.query("DELETE FROM audit_jobs");
    });
    afterAll(async () => {
      vi.unstubAllEnvs();
      await Promise.all([runtime?.end(), owner?.end()]);
      fixture?.stop();
    });
    const store = () =>
      createScanExecutionStore(randomUUID(), {
        pool: runtime,
        analytics: {
          insert: async () => {},
          capturePostHog: async () => {},
          reportError: () => {},
        },
      });
    const job = async (status = "queued", attempts = 0, age = "0 minutes") =>
      (
        await runtime.query(
          "INSERT INTO audit_jobs(business_name,status,attempt_count,last_attempt_at,place_id) VALUES('Fixture',$1,$2,now()-$3::interval,'place-fixture') RETURNING id",
          [status, attempts, age],
        )
      ).rows[0].id as string;
    it("claims one winner atomically across parallel runners", async () => {
      const id = await job();
      const results = await Promise.all(
        Array.from({ length: 8 }, () => store().claimJob(id)),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(
        (
          await runtime.query(
            "SELECT attempt_count,status FROM audit_jobs WHERE id=$1",
            [id],
          )
        ).rows[0],
      ).toEqual({ attempt_count: 1, status: "collecting" });
    });
    it("preserves the thirty-minute lease and three-attempt bound", async () => {
      for (const stage of ["collecting", "scoring", "persisting"]) {
        expect(
          await store().claimJob(await job(stage, 1, "29 minutes")),
        ).toBeNull();
        const id = await job(stage, 1, "31 minutes");
        expect(await store().claimJob(id)).not.toBeNull();
        await runtime.query(
          "UPDATE audit_jobs SET last_attempt_at=now()-interval '31 minutes' WHERE id=$1",
          [id],
        );
        expect(await store().claimJob(id)).not.toBeNull();
        await runtime.query(
          "UPDATE audit_jobs SET last_attempt_at=now()-interval '31 minutes' WHERE id=$1",
          [id],
        );
        expect(await store().claimJob(id)).toBeNull();
      }
      for (const terminal of ["done", "partial", "failed"])
        expect(
          await store().claimJob(await job(terminal, 1, "60 minutes")),
        ).toBeNull();
      const id = await job("collecting", 1);
      await runtime.query(
        "UPDATE audit_jobs SET last_attempt_at=NULL WHERE id=$1",
        [id],
      );
      expect(await store().claimJob(id)).toBeNull();
    });
    it("does not reclaim a lease exactly thirty minutes old", async () => {
      const id = await job("collecting", 1);
      const client = await runtime.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "UPDATE audit_jobs SET last_attempt_at=now()-interval '30 minutes' WHERE id=$1",
          [id],
        );
        const storage = createScanExecutionStore(randomUUID(), {
          pool: {
            query: client.query.bind(client),
            connect: runtime.connect.bind(runtime),
          },
        });
        expect(await storage.claimJob(id)).toBeNull();
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });
    const persisted = (jobId: string, status: ScanPersistence["status"]): ScanPersistence => ({
      jobId,
      status,
      overall: status === "failed" ? null : 70,
      coverage: 0.5,
      scoringVersion: "2026-08-16",
      moduleResults: {} as ScanPersistence["moduleResults"],
      findings: [],
    });
    const completedRows = async (id: string) =>
      (await runtime.query("SELECT anonymous_session_id,event_name,properties,dedupe_key FROM scan_events WHERE job_id=$1", [id])).rows;

    // persist() carries failed too: a scan that measured nothing is scored
    // "failed" and persisted normally (processor.ts). fail() is only for scans
    // that threw.
    it.each(["done", "partial", "failed"] as const)("persist writes exactly one scan_completed for %s inside its transaction", async (status) => {
      const id = await job("persisting");
      const session = randomUUID();
      const storage = createScanExecutionStore(session, { pool: runtime });
      await storage.persist(persisted(id, status));
      expect(await completedRows(id)).toEqual([
        { anonymous_session_id: session, event_name: "scan_completed", properties: { outcome: status, coverage: 0.5 }, dedupe_key: "terminal" },
      ]);
    });

    // Production does not run this sequence: a committed terminal status ends
    // the job's claimability, so no second process reaches persist() for it,
    // and a different process would carry a different session anyway. It
    // still earns its place because it catches a NULL-key regression: with a
    // NULL dedupe key the second insert would never conflict and this would
    // read two rows.
    it("a retried persist leaves one scan_completed, because the dedupe key now conflicts", async () => {
      const id = await job("persisting");
      const storage = createScanExecutionStore(randomUUID(), { pool: runtime });
      await storage.persist(persisted(id, "done"));
      await storage.persist(persisted(id, "done"));
      expect(await completedRows(id)).toHaveLength(1);
    });

    // The trap: with the row already written in-transaction, routing
    // recordTerminal through recordEvent would insert again -- its default
    // NULL dedupe key never conflicts -- writing a duplicate row.
    // recordTerminal must forward only.
    it("recordTerminal still reaches PostHog and never writes a second row", async () => {
      const id = await job("persisting");
      const capture = vi.fn(async () => {});
      const insert = vi.fn(async () => { throw new Error("recordTerminal must not insert"); });
      const storage = createScanExecutionStore(randomUUID(), {
        pool: runtime,
        analytics: {
          insert,
          capturePostHog: capture,
          reportError: () => {},
        },
      });
      await storage.persist(persisted(id, "done"));
      await storage.recordTerminal({ jobId: id, status: "done", coverage: 0.5 });
      // Asserted first: a throwing insert is swallowed inside recordEvent, so
      // the row count below cannot catch an insert on its own.
      expect(insert).not.toHaveBeenCalled();
      expect(capture).toHaveBeenCalledTimes(1);
      expect(await completedRows(id)).toHaveLength(1);
    });

    // The scan always completes: the event write is in a SAVEPOINT, so a
    // failed insert rolls back only itself and the scored scan still commits.
    // Without the savepoint PostgreSQL would abort the transaction and turn
    // COMMIT into a rollback, stranding the job in persisting.
    it("persist still commits the scan when its event cannot be written", async () => {
      const id = await job("persisting");
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      await owner.query('REVOKE INSERT ON TABLE public."scan_events" FROM sme_app_runtime');
      try {
        await expect(createScanExecutionStore(randomUUID(), { pool: runtime }).persist(persisted(id, "done"))).resolves.toBeUndefined();
      } finally {
        await owner.query('GRANT INSERT ON TABLE public."scan_events" TO sme_app_runtime');
        log.mockRestore();
      }
      expect((await runtime.query("SELECT status FROM audit_jobs WHERE id=$1", [id])).rows[0].status).toBe("done");
      expect((await runtime.query("SELECT count(*)::int AS n FROM scan_events WHERE job_id=$1 AND event_name='scan_completed'", [id])).rows[0].n).toBe(0);
    });

    it("fail() writes one failed scan_completed only when its status guard matched", async () => {
      const session = randomUUID();
      const storage = createScanExecutionStore(session, { pool: runtime });
      const running = await job("collecting");
      expect(await storage.fail({ jobId: running, category: "PROCESSOR_FAILED", correlationId: randomUUID() })).toBe(true);
      expect(await completedRows(running)).toEqual([
        { anonymous_session_id: session, event_name: "scan_completed", properties: { outcome: "failed", coverage: 0 }, dedupe_key: "terminal" },
      ]);
      const finished = await job("done");
      expect(await storage.fail({ jobId: finished, category: "PROCESSOR_FAILED", correlationId: randomUUID() })).toBe(false);
      expect(await completedRows(finished)).toEqual([]);
    });

    it("fail() still marks the job failed when its event cannot be written", async () => {
      const id = await job("collecting");
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      await owner.query('REVOKE INSERT ON TABLE public."scan_events" FROM sme_app_runtime');
      try {
        await expect(createScanExecutionStore(randomUUID(), { pool: runtime }).fail({ jobId: id, category: "PROCESSOR_FAILED", correlationId: randomUUID() })).resolves.toBe(true);
      } finally {
        await owner.query('GRANT INSERT ON TABLE public."scan_events" TO sme_app_runtime');
        log.mockRestore();
      }
      expect((await runtime.query("SELECT status FROM audit_jobs WHERE id=$1", [id])).rows[0].status).toBe("failed");
      expect((await runtime.query("SELECT count(*)::int AS n FROM scan_events WHERE job_id=$1", [id])).rows[0].n).toBe(0);
    });
    it("runs real fixture collection/scoring and idempotently persists findings without holding collection transactions", async () => {
      const id = await job();
      const storage = store();
      const collector = createFixtureCollector("tw-cafe");
      let result: ScanPersistence | undefined;
      const persist = storage.persist;
      storage.persist = async (value) => {
        result = value;
        await persist(value);
      };
      const collect: typeof collector = async (...args) => {
        expect(
          (
            await owner.query(
              "SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename='fixture_runtime' AND state='idle in transaction'",
            )
          ).rows[0].n,
        ).toBe(0);
        return collector(...args);
      };
      expect(
        await createScanExecution({
          store: storage,
          collect,
          persistEvidence: async () => {},
        })(id),
      ).toMatchObject({ status: "done" });
      expect(result).toBeDefined();
      await persist(result!);
      const rows = (
        await runtime.query(
          "SELECT finding_key FROM audit_findings WHERE job_id=$1",
          [id],
        )
      ).rows;
      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((r) => r.finding_key)).size).toBe(rows.length);
      expect(
        (
          await runtime.query(
            "SELECT module_results,completed_at FROM audit_jobs WHERE id=$1",
            [id],
          )
        ).rows[0].completed_at,
      ).not.toBeNull();
    });
    it("rolls back findings when result persistence fails and preserves failure transitions", async () => {
      const id = await job();
      const storage = store();
      await storage.claimJob(id);
      await owner.query(
        "ALTER TABLE audit_jobs ADD CONSTRAINT fixture_execution_score CHECK(overall_score<1000)",
      );
      await expect(
        storage.persist({
          jobId: id,
          status: "done",
          overall: 99999,
          coverage: 1,
          scoringVersion: "v1",
          moduleResults: {} as never,
          findings: [
            {
              finding_key: "fixture",
              module: "ig",
              severity: "medium",
              score_impact: -1,
              owner_message_zh: "fixture",
              evidence: {},
            },
          ] as never,
        }),
      ).rejects.toThrow();
      await owner.query(
        "ALTER TABLE audit_jobs DROP CONSTRAINT fixture_execution_score",
      );
      expect(
        (
          await runtime.query("SELECT id FROM audit_findings WHERE job_id=$1", [
            id,
          ])
        ).rows,
      ).toHaveLength(0);
      expect(
        await storage.fail({
          jobId: id,
          category: "PERSIST_FAILED",
          correlationId: randomUUID(),
        }),
      ).toBe(true);
      expect(
        await storage.fail({
          jobId: id,
          category: "PERSIST_FAILED",
          correlationId: randomUUID(),
        }),
      ).toBe(false);
      expect(
        await storage.fail({
          jobId: await job(),
          category: "PERSIST_FAILED",
          correlationId: randomUUID(),
        }),
      ).toBe(false);
    });
    it("persists actual trend diff and AEO snapshots idempotently", async () => {
      const base = await job("done"),
        head = await job("done");
      await runtime.query(
        "UPDATE audit_jobs SET created_at=now()-interval '1 day',scoring_version='v1',module_results=$2::jsonb WHERE id=$1",
        [base, JSON.stringify({ ig: { status: "measured", score: 50 } })],
      );
      await runtime.query(
        "UPDATE audit_jobs SET scoring_version='v1',module_results=$2::jsonb,raw_data=$3::jsonb,input_snapshot=$4::jsonb WHERE id=$1",
        [
          head,
          JSON.stringify({ ig: { status: "measured", score: 80 } }),
          JSON.stringify({
            aeo: {
              serpapi_runs: [
                {
                  engine: "google",
                  query: "coffee",
                  available: true,
                  competitors_mentioned: [],
                  brand_organic_rank: 1,
                  ai_overview: null,
                },
              ],
            },
          }),
          JSON.stringify({ locale: "en", market: "HK" }),
        ],
      );
      for (let i = 0; i < 2; i++) {
        expect(
          await persistScanDiff(head, buildTrendDiffDeps(runtime, head)),
        ).toEqual({ stored: true });
        expect(
          await persistAeoSnapshots(head, buildAeoSnapshotDeps(runtime)),
        ).toEqual({ stored: 2 });
      }
      expect(
        (
          await runtime.query("SELECT * FROM scan_diffs WHERE head_job_id=$1", [
            head,
          ])
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await runtime.query(
            "SELECT * FROM aeo_surface_snapshots WHERE job_id=$1",
            [head],
          )
        ).rows,
      ).toHaveLength(2);
    });
  },
);
