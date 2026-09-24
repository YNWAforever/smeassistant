import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { collectValueReport } from "../../scripts/report/value-queries";
import { parseIsoWeek } from "../../scripts/report/week";

// W38 = [2026-09-13T16:00Z, 2026-09-20T16:00Z). A past week, so no row any
// other test writes with now() can fall inside it.
const IN = "2026-09-16T04:00:00Z";
const BEFORE = "2026-09-09T04:00:00Z"; // W37
const WEEK = parseIsoWeek("2026-W38");

describe.runIf(process.env.NEON_INTEGRATION === "1")("value report", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  // Hoisted so the cross-tenant case can reuse the seeded tenants.
  let e1: string;
  let e2: string;
  let l3: string;

  const one = async <T = Record<string, unknown>>(sql: string, values: unknown[] = []) =>
    (await runtime.query(sql, values)).rows[0] as T;
  const workspace = async (flags: { demo?: boolean; internal?: boolean } = {}) =>
    (await one<{ id: string }>("INSERT INTO workspaces(slug,market,is_demo,is_internal) VALUES($1,'hk',$2,$3) RETURNING id", [`ws-${randomUUID()}`, flags.demo ?? false, flags.internal ?? false])).id;
  const location = async (ws: string) =>
    (await one<{ id: string }>("INSERT INTO locations(workspace_id,slug,name) VALUES($1,$2,'L') RETURNING id", [ws, `l-${randomUUID()}`])).id;
  const action = async (ws: string, loc: string | null, state = "in_progress") =>
    (await one<{ id: string }>(
      `INSERT INTO actions(workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,action_state)
       VALUES($1,$2,'review-response','{}','{}','{}','low',1,'[]',5,'Live',gen_random_uuid()::text,$3) RETURNING id`, [ws, loc, state])).id;
  const version = async (ws: string, act: string, no: number, at: string) =>
    (await one<{ id: string }>("INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type,approval_state,created_at) VALUES($1,$2,$3,'Fixture','user','approved',$4) RETURNING id", [ws, act, no, at])).id;
  const delivery = async (ws: string, ver: string, counted: boolean, at: string) =>
    runtime.query("INSERT INTO deliveries(workspace_id,version_id,mode,state,counted,idempotency_key,created_at) VALUES($1,$2,'export','exported',$3,gen_random_uuid()::text,$4)", [ws, ver, counted, at]);
  const exported = async (ws: string, loc: string | null, at: string, counted = true) => {
    const act = await action(ws, loc);
    await delivery(ws, await version(ws, act, 1, at), counted, at);
  };
  const scan = async (status: string, at: string, ws: string | null = null) =>
    (await one<{ id: string }>("INSERT INTO audit_jobs(business_name,status,created_at,workspace_id) VALUES('Fixture',$1,$2,$3) RETURNING id", [status, at, ws])).id;
  const event = async (job: string, name: "scan_started" | "scan_completed") =>
    runtime.query("INSERT INTO scan_events(job_id,anonymous_session_id,event_name,properties,dedupe_key) VALUES($1,$2,$3,'{}',$4)", [job, randomUUID(), name, name === "scan_started" ? "started" : "terminal"]);

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href });

    // Two external workspaces, one demo, one internal.
    e1 = await workspace();
    e2 = await workspace();
    const demo = await workspace({ demo: true });
    const internal = await workspace({ internal: true });
    const l1 = await location(e1);
    const l2 = await location(e1);
    l3 = await location(e2);

    await exported(e1, l1, IN);                 // first-ever export in W38
    await exported(e1, l2, BEFORE);             // L2 exported in W37 ...
    await exported(e1, l2, IN);                 // ... and again in W38: a repeat
    await exported(e2, l3, IN, false);          // uncounted: not a delivery
    await exported(e2, null, IN);               // workspace-wide action: no location
    await exported(demo, await location(demo), IN);
    await exported(internal, await location(internal), IN);

    await action(e1, l1, "needs_input");

    const run = await action(e2, l3);
    await runtime.query("INSERT INTO action_runs(workspace_id,action_id,agent_key,state,created_at) VALUES($1,$2,'review_reply','failed',$3),($1,$2,'review_reply','succeeded',$3)", [e2, run, IN]);

    // Scans started in W38: done+both events, partial+started only,
    // failed+none, queued+started. Plus one attached to the internal workspace
    // and one outside the week.
    const done = await scan("done", IN);
    await event(done, "scan_started");
    await event(done, "scan_completed");
    await event(await scan("partial", IN), "scan_started");
    await scan("failed", IN);
    await event(await scan("queued", IN), "scan_started");
    await scan("done", IN, internal);
    await scan("done", BEFORE);

    const user = (await one<{ id: string }>("INSERT INTO app_users(email,created_at) VALUES('a@example.test',$1) RETURNING id", [IN])).id;
    await runtime.query("INSERT INTO app_users(email,created_at) VALUES('b@example.test',$1),('c@example.test',$2)", [IN, BEFORE]);
    await runtime.query("INSERT INTO workspace_claim_events(workspace_id,matched_location_id,claimed_by_user_id,created_at) VALUES($1,'locations/1',$2,$3)", [e1, user, IN]);
    await runtime.query("INSERT INTO audit_events(workspace_id,actor_type,event,created_at) VALUES($1,'user','workspace.assigned',$2),($3,'user','workspace.assigned',$2)", [e2, IN, internal]);
  });

  afterAll(async () => {
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  const report = async () => {
    const client: PoolClient = await runtime.connect();
    try {
      await client.query("BEGIN TRANSACTION READ ONLY");
      return await collectValueReport(client, WEEK);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  };

  it("counts distinct locations with a counted delivery, excluding demo and internal", async () => {
    expect((await report()).primary).toEqual({
      locations: 2,              // L1, L2 -- not uncounted L3, demo or internal
      eligibleLocations: 3,      // L1, L2, L3
      workspaces: 2,             // E1, and E2 through its location-less delivery
      eligibleWorkspaces: 2,
      deliveriesWithoutLocation: 1,
    });
  });

  it("states how many workspaces were excluded", async () => {
    expect((await report()).exclusions).toEqual({ demoWorkspaces: 1, internalWorkspaces: 1 });
  });

  it("separates first, repeat and draft steps per location", async () => {
    expect((await report()).deliveryFunnel).toEqual({
      firstDraft: 2,             // L1, L3 -- L2's first version was in W37
      firstApprovedExport: 1,    // L1
      repeatWeeklyExport: 1,     // L2
    });
  });

  it("reads scans from audit_jobs, excluding scans claimed by an internal workspace", async () => {
    expect((await report()).scans).toEqual({ started: 4, completedFull: 1, completedPartial: 1, failed: 1, inProgress: 1 });
  });

  it("reconciles every job against scan_events, internal included", async () => {
    expect((await report()).reconciliation).toEqual({ jobsStarted: 5, startedEvents: 3, jobsTerminal: 4, completedEvents: 1 });
  });

  it("splits supported and assisted claims and excludes internal ones", async () => {
    expect((await report()).claims).toEqual({ supported: 1, assisted: 1 });
  });

  it("counts first sign-ins, task failures and current missing input", async () => {
    const result = await report();
    expect(result.signIns).toEqual({ first: 2 });
    expect(result.tasks).toEqual({ runs: 2, failed: 1, missingInputNow: 1 });
  });

  it("never reports paid conversion as a number", async () => {
    expect((await report()).paidConversion).toEqual({ measurable: false, reason: "billing unavailable (DEC-09)" });
  });

  // The foreign keys are single-column, so the schema lets a delivery point at
  // another tenant's version, and a version at another tenant's action. Neither
  // may count. Seeded inside a rolled-back transaction so the other cases keep
  // their hand-derived expectations.
  it("does not count a delivery whose version or action belongs to another workspace", async () => {
    const client = await runtime.connect();
    try {
      await client.query("BEGIN");
      const insertAction = async () => (await client.query<{ id: string }>(
        `INSERT INTO actions(workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key)
         VALUES($1,$2,'review-response','{}','{}','{}','low',1,'[]',5,'Live',gen_random_uuid()::text) RETURNING id`, [e2, l3])).rows[0]!.id;
      const insertVersion = async (ws: string, act: string) => (await client.query<{ id: string }>(
        "INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type,approval_state,created_at) VALUES($1,$2,1,'Fixture','user','approved',$3) RETURNING id", [ws, act, IN])).rows[0]!.id;
      const insertDelivery = (ver: string) => client.query(
        "INSERT INTO deliveries(workspace_id,version_id,mode,state,counted,idempotency_key,created_at) VALUES($1,$2,'export','exported',true,gen_random_uuid()::text,$3)", [e1, ver, IN]);

      // Hop 1: delivery on E1 -> version on E2 (-> action on E2, L3).
      await insertDelivery(await insertVersion(e2, await insertAction()));
      // Hop 2: delivery on E1 -> version on E1 -> action on E2, L3.
      await insertDelivery(await insertVersion(e1, await insertAction()));

      const result = await collectValueReport(client, WEEK);
      expect(result.primary).toMatchObject({ locations: 2, workspaces: 2, deliveriesWithoutLocation: 1 });
      expect(result.deliveryFunnel).toMatchObject({ firstApprovedExport: 1, repeatWeeklyExport: 1 });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("runs under a read-only transaction that Postgres enforces", async () => {
    const client = await runtime.connect();
    try {
      await client.query("BEGIN TRANSACTION READ ONLY");
      await expect(client.query("INSERT INTO app_users(email) VALUES('x@example.test')")).rejects.toMatchObject({ code: "25006" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
