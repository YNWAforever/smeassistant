import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { reportsRepository } from "../../lib/repositories/reports";
import { assertOwnedPostgresContainer, startNeonDatabaseFixture } from "./neon-database";

// Existing behavior rehearsal only: no managed Auth, deployment or traffic control.
it("preserves a new application user and related report across drained access and an owned database restart", async () => {
  const fixture = await startNeonDatabaseFixture("test");
  let owner: Pool | undefined;
  let runtime: Pool | undefined;
  try {
    const docker = (args: string[]) => execFileSync("docker", args, { encoding: "utf8", windowsHide: true }).trim();
    const inspect = () => JSON.parse(docker(["inspect", fixture.containerName]))[0] as {
      Id: string; Config: { Labels: Record<string, string> };
      HostConfig: { NetworkMode: string; PortBindings: Record<string, unknown> };
      State: { Running: boolean; StartedAt: string };
    };
    const original = inspect();
    const identity = { databaseUrl: fixture.databaseUrl, databaseName: fixture.databaseName, containerLabels: original.Config.Labels, nodeEnv: "test" };
    const assertOwned = () => {
      const current = inspect();
      assertOwnedPostgresContainer(original.Id, { id: current.Id, labels: current.Config.Labels }, identity);
      expect(current.HostConfig.NetworkMode).toBe("none");
      expect(current.HostConfig.PortBindings).toEqual({});
      return current;
    };
    owner = new Pool({ connectionString: fixture.databaseUrl });
    assertOwned();
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    await owner.end(); owner = undefined;
    const url = new URL(fixture.databaseUrl); url.username = "fixture_runtime"; url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, max: 1, connectionTimeoutMillis: 5000 });
    const user = randomUUID(), workspace = randomUUID(), job = randomUUID(), slug = `recovery-${randomUUID()}`;
    const summary = "New report retained through local recovery";
    const raw = { fixture: "recovery", evidence: ["retained website observation"] };
    const client = await runtime.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO app_users(id,email) VALUES($1,'recovery-owner@example.test')", [user]);
      await client.query("INSERT INTO workspaces(id,business_name,market,slug) VALUES($1,'Recovery business','hk',$2)", [workspace, slug]);
      await client.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,'recovery-owner@example.test','owner',now())", [workspace, user]);
      await client.query("INSERT INTO audit_jobs(id,workspace_id,business_name,share_slug,status,overall_score,summary_en,raw_data) VALUES($1,$2,'Recovery business',$3,'done',72,$4,$5)", [job, workspace, slug, summary, raw]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    const before = await reportsRepository(runtime).readPublicJobBySlug(slug);
    expect(before).toMatchObject({ id: job, workspace_id: workspace, business_name: "Recovery business", status: "done", overall_score: 72 });

    // Application-side maintenance boundary: no request producer remains; drain and
    // dispose the original pool before touching only this verified owned container.
    const disposed = runtime;
    await disposed.end(); runtime = undefined;
    await expect(reportsRepository(disposed).readPublicJobBySlug(slug)).rejects.toThrow("report_persistence_unavailable");
    assertOwned(); docker(["stop", "--time", "5", original.Id]);
    expect(assertOwned().State.Running).toBe(false);
    assertOwned(); docker(["start", original.Id]);
    await expect.poll(() => {
      try { docker(["exec", original.Id, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", fixture.databaseName]); return true; }
      catch { return false; }
    }, { timeout: 10000 }).toBe(true);
    expect(assertOwned().State.StartedAt).not.toBe(original.State.StartedAt);
    runtime = new Pool({ connectionString: url.href, max: 1, connectionTimeoutMillis: 5000 });
    expect((await runtime.query("SELECT current_database() AS database, current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0]).toEqual({ database: fixture.databaseName, role: "fixture_runtime", rolsuper: false, rolbypassrls: false });
    const repo = reportsRepository(runtime);
    expect(await repo.readPublicJobBySlug(slug)).toEqual(before);
    expect(await repo.readAuthorizedJobData(job)).toEqual({ raw_data: raw, summary_en: summary, summary_zh: null, summary_tw: null });
    expect((await runtime.query("SELECT u.id,u.email,m.role,m.accepted_at IS NOT NULL AS accepted,j.id AS job_id,j.workspace_id FROM app_users u JOIN workspace_members m ON m.user_id=u.id JOIN audit_jobs j ON j.workspace_id=m.workspace_id WHERE u.id=$1 AND j.id=$2", [user, job])).rows).toEqual([{ id: user, email: "recovery-owner@example.test", role: "owner", accepted: true, job_id: job, workspace_id: workspace }]);
    await repo.cacheSummary(job, "summary_tw", "Recovered runtime can still persist report content");
    expect(await repo.readAuthorizedJobData(job)).toEqual({ raw_data: raw, summary_en: summary, summary_zh: null, summary_tw: "Recovered runtime can still persist report content" });
    console.info(JSON.stringify({ rehearsal: "owned_postgres_restart_and_application_reconnect", database: fixture.databaseName, container: fixture.containerName, network: "none", userReportSurvived: true, runtimeRole: "fixture_runtime" }));
  } finally {
    try { await Promise.all([owner?.end(), runtime?.end()]); }
    finally { fixture.stop(); }
  }
});
