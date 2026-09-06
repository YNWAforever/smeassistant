import { Pool, type PoolClient } from "pg";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import {
  startNeonDatabaseFixture,
  type NeonDatabaseFixture,
} from "./neon-database";
import {
  completeWorkspaceScan,
  reconcileWorkspaceScans,
} from "../../lib/workspace/completion";
import { completionTransaction } from "../../lib/workspace/completion-transaction";
import { postProcessWorkspaceScan } from "../../lib/workspace/post-process";
const forbidden = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("recovery must not collect");
  }),
);
vi.mock("../../lib/website/checks", () => ({ runWebsiteChecks: forbidden }));
vi.mock("@sme-scanner/scan-engine", () => ({
  collectScanProviders: forbidden,
  processScan: forbidden,
}));
describe.runIf(process.env.NEON_INTEGRATION === "1")(
  "Neon fenced completion",
  () => {
    let fixture: NeonDatabaseFixture,
      owner: Pool,
      runtime: Pool,
      ws: string,
      job: string;
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
      runtime = new Pool({ connectionString: url.href, max: 3 });
    });
    beforeEach(async () => {
      forbidden.mockClear();
      vi.stubGlobal("fetch", forbidden);
      await runtime.query(
        "DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM app_users",
      );
      ws = (
        await runtime.query(
          "INSERT INTO workspaces(slug,market) VALUES('fixture','hk') RETURNING id",
        )
      ).rows[0].id;
      const user = (
        await runtime.query(
          "INSERT INTO app_users(email) VALUES('fixture@example.test') RETURNING id",
        )
      ).rows[0].id;
      await runtime.query(
        "INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,'fixture@example.test','owner',now())",
        [ws, user],
      );
      job = (
        await runtime.query(
          "INSERT INTO audit_jobs(business_name,workspace_id,status,website_url,raw_data) VALUES('Fixture',$1,'done','https://example.test','{\"ig\":{\"followers\":42}}') RETURNING id",
          [ws],
        )
      ).rows[0].id;
    });
    afterAll(async () => {
      vi.unstubAllGlobals();
      await Promise.all([runtime?.end(), owner?.end()]);
      fixture?.stop();
    });
    async function claim(db: Pool | PoolClient) {
      return (
        await db.query("SELECT claim_workspace_completion($1) AS c", [job])
      ).rows[0].c;
    }
    const state = async () =>
      (
        await runtime.query(
          "SELECT state,attempts,last_error FROM workspace_scan_completions WHERE job_id=$1",
          [job],
        )
      ).rows[0];
    const effects = async () =>
      (
        await runtime.query(
          `SELECT (SELECT count(*)::int FROM scan_snapshots) AS snapshots,(SELECT count(*)::int FROM actions) AS actions,(SELECT count(*)::int FROM action_measurements) AS measurements,(SELECT count(*)::int FROM workspace_notifications) AS notifications,(SELECT count(*)::int FROM audit_events) AS audits`,
        )
      ).rows[0];
    it("recovers persisted terminal evidence without collectors or website fetch and completes once", async () => {
      expect(await reconcileWorkspaceScans(runtime)).toEqual([
        { status: "completed" },
      ]);
      const first = await effects();
      expect(first.snapshots).toBe(1);
      expect(first.notifications).toBe(1);
      expect(first.audits).toBeGreaterThan(0);
      expect(
        (
          await runtime.query(
            "SELECT website_checks FROM scan_snapshots WHERE job_id=$1",
            [job],
          )
        ).rows[0].website_checks,
      ).toBeNull();
      expect(
        (
          await runtime.query(
            "SELECT module_states->'website' AS website FROM scan_snapshots WHERE job_id=$1",
            [job],
          )
        ).rows[0].website,
      ).toMatchObject({
        status: "unavailable",
        limitationCode: "WEBSITE_CHECKS_NOT_RECORDED",
      });
      expect(await completeWorkspaceScan(runtime, job)).toEqual({
        status: "completed",
      });
      expect(await effects()).toEqual(first);
      expect((await state()).attempts).toBe(1);
      expect(forbidden).not.toHaveBeenCalled();
    });
    it("rolls back partial effects, persists retry and repairs from evidence", async () => {
      expect(
        await completeWorkspaceScan(runtime, job, async (db, id) => {
          const result = await postProcessWorkspaceScan(db, id);
          expect(result.error).toBeNull();
          throw new Error("private provider payload");
        }),
      ).toEqual({ status: "retry" });
      expect(await effects()).toEqual({
        snapshots: 0,
        actions: 0,
        measurements: 0,
        notifications: 0,
        audits: 0,
      });
      expect(await state()).toMatchObject({
        state: "retry",
        last_error: "workspace_post_process_failed",
      });
      await runtime.query(
        "UPDATE workspace_scan_completions SET next_attempt_at=now()-interval '1 second' WHERE job_id=$1",
        [job],
      );
      expect(await reconcileWorkspaceScans(runtime)).toEqual([
        { status: "completed" },
      ]);
      expect((await effects()).snapshots).toBe(1);
      expect(forbidden).not.toHaveBeenCalled();
    });
    it("SQL notification failure rolls back snapshot/action/audit writes and does not finalize", async () => {
      await owner.query(
        "ALTER TABLE workspace_notifications ADD CONSTRAINT fixture_notification_failure CHECK(kind <> 'scan.completed') NOT VALID",
      );
      try {
        expect(await completeWorkspaceScan(runtime, job)).toEqual({
          status: "retry",
        });
        expect(await effects()).toEqual({
          snapshots: 0,
          actions: 0,
          measurements: 0,
          notifications: 0,
          audits: 0,
        });
        expect((await state()).state).toBe("retry");
      } finally {
        await owner.query(
          "ALTER TABLE workspace_notifications DROP CONSTRAINT fixture_notification_failure",
        );
      }
      await runtime.query(
        "UPDATE workspace_scan_completions SET next_attempt_at=now()-interval '1 second' WHERE job_id=$1",
        [job],
      );
      expect(await completeWorkspaceScan(runtime, job)).toEqual({
        status: "completed",
      });
      expect(forbidden).not.toHaveBeenCalled();
    });
    it("requires a live complete context before even a no-op callback and clears pool context", async () => {
      const c = await claim(runtime),
        run = vi.fn(async () => {});
      await expect(
        completionTransaction(runtime, "", c.token, run),
      ).rejects.toThrow("completion_context_missing");
      await expect(
        completionTransaction(runtime, job, "", run),
      ).rejects.toThrow("completion_context_missing");
      expect(run).not.toHaveBeenCalled();
      await completionTransaction(runtime, job, c.token, async (db) => {
        expect(
          (
            await db.query(
              "SELECT current_setting('app.completion_job',true) AS job",
            )
          ).rows[0].job,
        ).toBe(job);
      });
      const next = await runtime.connect();
      try {
        expect(
          (
            await next.query(
              "SELECT nullif(current_setting('app.completion_job',true),'') AS job,nullif(current_setting('app.completion_token',true),'') AS token",
            )
          ).rows[0],
        ).toEqual({ job: null, token: null });
      } finally {
        next.release();
      }
    });
    it("two actual clients deny stale A on all five protected tables and finish after B reclaims", async () => {
      const a = await runtime.connect(),
        b = await runtime.connect();
      try {
        expect(
          (await a.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
        ).not.toBe(
          (await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
        );
        const ca = await claim(a);
        await completionTransaction(runtime, job, ca.token, async (db) => {
          const out = await postProcessWorkspaceScan(db, job);
          expect(out.error).toBeNull();
        });
        const snapshot = (
          await b.query("SELECT id FROM scan_snapshots WHERE job_id=$1", [job])
        ).rows[0].id;
        const action = (
          await b.query(
            "SELECT id FROM actions WHERE workspace_id=$1 LIMIT 1",
            [ws],
          )
        ).rows[0].id;
        await b.query(
          "INSERT INTO action_measurements(workspace_id,action_id,after_snapshot_id,metric_key,fact_type) VALUES($1,$2,$3,'fixture','Observed')",
          [ws, action, snapshot],
        );
        await b.query(
          "UPDATE workspace_scan_completions SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",
          [job],
        );
        const cb = await claim(b);
        expect(cb.status).toBe("claimed");
        expect(cb.token).not.toBe(ca.token);
        const before = await effects();
        for (const [table, column] of [
          ["scan_snapshots", "coverage"],
          ["actions", "priority_score"],
          ["action_measurements", "delta"],
          ["workspace_notifications", "kind"],
          ["audit_events", "event"],
        ]) {
          const original = (
            await b.query(
              `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`,
            )
          ).rows;
          await a.query("BEGIN");
          await a.query(
            "SELECT set_config('app.completion_job',$1,true),set_config('app.completion_token',$2,true)",
            [job, ca.token],
          );
          await expect(
            a.query(
              `UPDATE ${table} SET ${column}=${column} WHERE workspace_id=$1`,
              [ws],
            ),
          ).rejects.toThrow("completion_lease_lost");
          await a.query("ROLLBACK");
          expect(
            (
              await b.query(
                `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`,
              )
            ).rows,
          ).toEqual(original);
        }
        for (const table of [
          "scan_snapshots",
          "actions",
          "action_measurements",
          "workspace_notifications",
          "audit_events",
        ]) {
          await a.query("BEGIN");
          await a.query(
            "SELECT set_config('app.completion_job',$1,true),set_config('app.completion_token',$2,true)",
            [job, ca.token],
          );
          await expect(
            a.query(
              `INSERT INTO ${table} SELECT * FROM ${table} WHERE workspace_id=$1 LIMIT 1`,
              [ws],
            ),
          ).rejects.toThrow("completion_lease_lost");
          await a.query("ROLLBACK");
        }
        expect(
          (
            await a.query(
              "SELECT finish_workspace_completion($1,$2,true,NULL) AS done",
              [job, ca.token],
            )
          ).rows[0].done,
        ).toBe(false);
        expect(
          (
            await b.query(
              "SELECT lease_token,state FROM workspace_scan_completions WHERE job_id=$1",
              [job],
            )
          ).rows[0],
        ).toEqual({ lease_token: cb.token, state: "running" });
        expect(await effects()).toEqual(before);
        await completionTransaction(runtime, job, cb.token, async (db) => {
          expect((await postProcessWorkspaceScan(db, job)).error).toBeNull();
          expect(
            (
              await db.query(
                "SELECT finish_workspace_completion($1,$2,true,NULL) AS done",
                [job, cb.token],
              )
            ).rows[0].done,
          ).toBe(true);
        });
        expect(
          (
            await b.query(
              "SELECT finish_workspace_completion($1,$2,true,NULL) AS done",
              [job, cb.token],
            )
          ).rows[0].done,
        ).toBe(false);
        expect(await effects()).toEqual(before);
        expect((await state()).state).toBe("completed");
      } finally {
        await a.query("ROLLBACK");
        a.release();
        b.release();
      }
    });
  },
);
