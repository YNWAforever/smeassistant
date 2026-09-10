import { Pool } from "pg";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { workspaceReadRepository } from "../../lib/repositories/workspace-read";

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon workspace read models", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  let repository: ReturnType<typeof workspaceReadRepository>;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href });
    repository = workspaceReadRepository(runtime);
  });
  beforeEach(async () => {
    await runtime.query("DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM app_users");
  });
  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });
  async function workspace(slug = "shop", market = "hk") {
    return (await runtime.query("INSERT INTO workspaces(slug,market) VALUES($1,$2) RETURNING id", [slug, market])).rows[0].id as string;
  }
  it("retains an empty TW workspace, missing optional locations and reports", async () => {
    const id = await workspace("taipei", "tw");
    expect(await repository.workspaces([id])).toMatchObject([{ id, market: "tw" }]);
    expect(await repository.workspaces([])).toEqual([]);
    expect(await repository.locations([id])).toEqual([]);
    expect(await repository.latestReport(id)).toBeNull();
  });
  it("creates usage concurrently once and preserves existing counts and unlimited allowance", async () => {
    const id = await workspace();
    const rows = await Promise.all(Array.from({ length: 4 }, () => repository.usage(id, "2026-09", null)));
    expect(rows).toEqual(Array.from({ length: 4 }, () => ({ period: "2026-09", approved_deliveries: 0, allowance: null })));
    await runtime.query("UPDATE workspace_usage SET approved_deliveries=7 WHERE workspace_id=$1", [id]);
    expect(await repository.usage(id, "2026-09", 3)).toEqual({ period: "2026-09", approved_deliveries: 7, allowance: null });
  });
  it("orders locations primary then name and binds snapshot reads to their workspace", async () => {
    const id = await workspace();
    const other = await workspace("other");
    const rows = (await runtime.query("INSERT INTO locations(workspace_id,slug,name,is_primary) VALUES($1,'b','B',false),($1,'a','A',false),($1,'p','Primary',true) RETURNING id", [id])).rows;
    expect((await repository.locations([id])).map(row => row.name)).toEqual(["Primary", "A", "B"]);
    expect(await repository.locations([other])).toEqual([]);
    expect(await repository.latestSnapshot(other, rows[0].id)).toBeNull();
  });
  it("does not turn SQL failure into an empty workspace", async () => {
    const unavailable = new Pool({ connectionString: fixture.databaseUrl });
    await unavailable.end();
    await expect(workspaceReadRepository(unavailable).workspaces(["00000000-0000-4000-8000-000000000001"])).rejects.toThrow("workspace_read_unavailable");
  });
  async function action(workspaceId: string, locationId: string | null, score: number, updatedAt = "2026-09-01") {
    return (await runtime.query(`INSERT INTO actions(workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,updated_at)
      VALUES($1,$2,'review-response','{"en":"Review","zh-HK":"評論","zh-TW":"評論"}','{}','{}','urgent',$3,'[]',10,'Live',gen_random_uuid()::text,$4) RETURNING id`, [workspaceId, locationId, score, updatedAt])).rows[0].id as string;
  }
  it("keeps workspace-wide actions, empty filters and exact priority/date ordering", async () => {
    const id = await workspace();
    const other = await workspace("other");
    const location = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'main','Main') RETURNING id", [id])).rows[0].id;
    const older = await action(id, location, 10);
    const newer = await action(id, null, 10, "2026-09-02");
    const first = await action(id, location, 20);
    await action(other, null, 99);
    expect((await repository.actions(id, { locationId: location })).map(row => row.id)).toEqual([first, newer, older]);
    expect(await repository.actions(id, { states: [] })).toEqual([]);
    expect(await repository.actions(id, { ids: [] })).toEqual([]);
    expect((await repository.actions(id, { ids: [newer], states: ["recommended"] })).map(row => row.id)).toEqual([newer]);
    expect(await repository.urgentActions(id, location)).toBe(2);
    expect(await repository.urgentActions(id)).toBe(3);
  });
  it("retains actions with no optional run/version/evidence and excludes mismatched child tenants", async () => {
    const id = await workspace();
    const other = await workspace("other");
    const actionId = await action(id, null, 10);
    expect(await repository.actions(id)).toHaveLength(1);
    expect(await repository.runs(id, [actionId])).toEqual([]);
    expect(await repository.versions(id, [actionId])).toEqual([]);
    expect(await repository.measurements(id, actionId)).toEqual([]);
    await runtime.query("INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type) VALUES($1,$2,1,'private','agent')", [other, actionId]);
    await runtime.query("INSERT INTO action_runs(workspace_id,action_id,agent_key) VALUES($1,$2,'review_reply_agent')", [other, actionId]);
    expect(await repository.versions(id, [actionId])).toEqual([]);
    expect(await repository.runs(id, [actionId])).toEqual([]);
    expect(await repository.draftVersions(id)).toEqual([]);
    expect(await repository.versions(other, [actionId])).toEqual([]);
  });
  it("reads newest connection by actual connected_at regardless of status without credentials", async () => {
    const id = await workspace();
    await runtime.query(`INSERT INTO oauth_connections(workspace_id,provider,access_token_encrypted,status,connected_at)
      VALUES($1,'google_gbp','secret-sentinel','active','2026-08-01'),($1,'google_gbp','secret-sentinel','revoked','2026-09-01')`, [id]);
    const connection = await repository.latestConnection(id);
    expect(connection?.status).toBe("revoked");
    expect(Object.keys(connection ?? {}).sort()).toEqual(["created_at", "expires_at", "status", "updated_at"]);
    expect(JSON.stringify(connection)).not.toContain("secret-sentinel");
  });
  it("pages activity at zero, one and beyond row count with strict workspace scope", async () => {
    const id = await workspace();
    const other = await workspace("other");
    await runtime.query(`INSERT INTO audit_events(workspace_id,actor_type,event,created_at) VALUES
      ($1,'system','brand.updated','2026-09-01'),($1,'system','workspace.claimed','2026-09-02'),($2,'system','brand.updated','2026-09-03')`, [id, other]);
    expect(await repository.activity(id, 0)).toEqual([]);
    expect((await repository.activity(id, 1)).map(row => row.event)).toEqual(["workspace.claimed"]);
    expect(await repository.activity(id, 100)).toHaveLength(2);
    await expect(repository.activity(id, -1)).rejects.toThrow("invalid_page_limit");
    await expect(repository.activity(id, 1.5)).rejects.toThrow("invalid_page_limit");
  });
  it("preserves TW snapshot metrics, missing diffs and location/workspace pagination", async () => {
    const id = await workspace("taipei", "tw");
    const other = await workspace("other");
    const location = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'main','台北') RETURNING id", [id])).rows[0].id;
    const jobs = (await runtime.query("INSERT INTO audit_jobs(workspace_id,business_name,region) VALUES($1,'台北','tw'),($1,'台北','tw') RETURNING id", [id])).rows;
    for (const [index, job] of jobs.entries()) {
      await runtime.query(`INSERT INTO scan_snapshots(job_id,workspace_id,location_id,market,observed_at,overall_score,coverage,module_states,metrics)
        VALUES($1,$2,$3,'tw',$4,42,0.78,'{}','{"gbp.rating":4.2}')`, [job.id,id,location,`2026-09-0${index + 1}`]);
    }
    expect(await repository.snapshots(id, location, 0)).toEqual([]);
    expect(await repository.snapshots(other, location, 12)).toEqual([]);
    const [newest] = await repository.snapshots(id, location, 1);
    expect(newest).toMatchObject({ job_id: jobs[1].id, market: "tw", metrics: { "gbp.rating": 4.2 }, diff_id: null });
    expect(typeof newest.observed_at).toBe("string");
    expect(await repository.snapshots(id, location, 12)).toHaveLength(2);
    expect(await repository.diff("00000000-0000-4000-8000-000000000001", id, jobs[1].id)).toBeNull();
    expect(await repository.aeoSnapshots(other, jobs.map(row => row.id))).toEqual([]);
  });
  it.each(["foreign-diff", "foreign-base", "foreign-head", "wrong-head", "valid"])("scopes snapshot diff %s using independent job foreign keys", async (kind) => {
    const id = await workspace();
    const other = await workspace("other");
    const location = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'main','Main') RETURNING id", [id])).rows[0].id;
    const jobs = (await runtime.query("INSERT INTO audit_jobs(workspace_id,business_name,region) VALUES($1,'Base','hk'),($1,'Head','hk'),($1,'Different head','hk'),($2,'Foreign base','hk'),($2,'Foreign head','hk') RETURNING id", [id, other])).rows;
    const baseId = jobs[kind === "foreign-diff" || kind === "foreign-base" ? 3 : 0].id;
    const headId = jobs[kind === "foreign-diff" || kind === "foreign-head" ? 4 : kind === "wrong-head" ? 2 : 1].id;
    const diff = (await runtime.query(`INSERT INTO scan_diffs(base_job_id,head_job_id,comparable,composite_base,composite_head,composite_delta,resolved_findings,regressed_findings)
      VALUES($1,$2,true,60,65,5,ARRAY['gbp.rating_low'],ARRAY['gbp.owner_response_low']) RETURNING id`, [baseId, headId])).rows[0];
    // A matching head alone is insufficient: snapshot workspace and job FKs
    // are independent. These fixtures retain valid foreign key references.
    const snapshotJobId = kind === "foreign-head" ? headId : jobs[1].id;
    await runtime.query(`INSERT INTO scan_snapshots(job_id,workspace_id,location_id,market,observed_at,coverage,module_states,metrics,diff_id)
      VALUES($1,$2,$3,'hk','2026-09-01',0.8,'{}','{}',$4)`, [snapshotJobId, id, location, diff.id]);
    const [snapshot] = await repository.snapshots(id, location, 1);
    expect(snapshot).toMatchObject({ workspace_id: id, job_id: snapshotJobId, diff_id: diff.id });
    const result = await repository.diff(snapshot.diff_id!, id, snapshot.job_id);
    if (kind === "valid") {
      expect(result).toMatchObject({ id: diff.id, base_job_id: baseId, head_job_id: headId, comparable: true, composite_delta: "5", resolved_findings: ["gbp.rating_low"], regressed_findings: ["gbp.owner_response_low"] });
    } else {
      expect(result).toBeNull();
    }
  });
  it("surfaces diff SQL failure instead of returning a missing relation", async () => {
    const unavailable = new Pool({ connectionString: fixture.databaseUrl });
    await unavailable.end();
    const id = "00000000-0000-4000-8000-000000000001";
    await expect(workspaceReadRepository(unavailable).diff(id, id, id)).rejects.toThrow("workspace_read_unavailable");
  });
  it("scopes Home's counters to a location while keeping workspace-wide actions counted", async () => {
    // The trap in this fix: a bare `location_id=$n` looks tighter and passes
    // any fixture without workspace-wide rows, but actions.location_id IS NULL
    // means "all locations" (CLAUDE.md 3.3). Drop the IS NULL arm and Home's
    // counters become SMALLER than the same location's Actions tab.
    const id = await workspace();
    const loc = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'main','Main') RETURNING id", [id])).rows[0].id;
    const other = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'other','Other') RETURNING id", [id])).rows[0].id;
    const action = async (locationId: string | null, state: string) =>
      (await runtime.query(
        `INSERT INTO actions(workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,action_state,completed_at)
         VALUES($1,$2,'ig-bio','{}','{}','{}','urgent',1,'[]',10,'Live',gen_random_uuid()::text,$3,'2026-09-05') RETURNING id`,
        [id, locationId, state],
      )).rows[0].id;

    await action(loc, "completed");
    await action(null, "completed");
    await action(other, "completed");

    // This location plus the workspace-wide one -- never the other location's.
    expect((await repository.completedActions(id, "2026-09-01", loc)).length).toBe(2);
    // Unscoped (?location=all) still sees everything, exactly as before.
    expect((await repository.completedActions(id, "2026-09-01")).length).toBe(3);

    const scoped = await action(loc, "in_progress");
    const workspaceWide = await action(null, "in_progress");
    for (const target of [scoped, workspaceWide, await action(other, "in_progress")]) {
      await runtime.query("INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type) VALUES($1,$2,1,'draft','user')", [id, target]);
    }
    expect((await repository.draftVersions(id, loc)).length).toBe(2);
    expect((await repository.draftVersions(id)).length).toBe(3);
  });

  it("executes remaining empty optional reads without hiding query failures", async () => {
    const id = await workspace();
    expect(await repository.schedules(id, ["missing-place"])).toEqual([]);
    expect(await repository.completedActions(id, "2026-09-01")).toEqual([]);
    expect(await repository.notifications(id, "00000000-0000-4000-8000-000000000001")).toEqual([]);
    expect(await repository.unreadNotifications(id, "00000000-0000-4000-8000-000000000001")).toBe(0);
    expect(await repository.notificationPreferences(id)).toMatchObject({ notify_rescan_complete: true, notify_regression_alert: true, notify_monthly_digest: true });
  });

});
