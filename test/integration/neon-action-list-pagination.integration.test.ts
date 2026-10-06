import { Pool } from "pg";
import { appendFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { actionListRepository, type ActionListScope } from "../../lib/repositories/action-list";
import { workspaceReadRepository } from "../../lib/repositories/workspace-read";
import { displayPhaseKey } from "../../lib/workspace/overview";
import { listActions } from "../../lib/workspace/queries-pages";
import type { WorkspaceContext } from "../../lib/workspace/queries";
import { actionListFilters } from "../../lib/workspace/action-list-filters";
const database = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => database.pool }));

describe.runIf(process.env.NEON_INTEGRATION === "1")("bounded action list SQL (T-12)", () => {
  let fixture: NeonDatabaseFixture, owner: Pool, runtime: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl, connectionTimeoutMillis: 10_000 });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl); url.username = "fixture_runtime"; url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, connectionTimeoutMillis: 10_000, statement_timeout: 25_000 });
    database.pool = runtime;
  });
  beforeEach(async () => { await runtime.query("DELETE FROM workspaces; DELETE FROM app_users"); });
  afterAll(async () => { await Promise.allSettled([owner?.end(), runtime?.end()]); fixture?.stop(); });

  async function seed(size: number) {
    const workspaceId = (await runtime.query("INSERT INTO workspaces(slug,market,timezone) VALUES('pagination','hk','Asia/Hong_Kong') RETURNING id")).rows[0].id as string;
    await runtime.query(`INSERT INTO actions(workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,updated_at)
      SELECT $1,'review-response',jsonb_build_object('en','Action '||n),'{}','{}','high',50,'[]',10,'Live',n::text,'2026-10-01T00:00:00.123456Z' FROM generate_series(1,$2::int) n`, [workspaceId, size]);
    await runtime.query(`INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type,meta)
      SELECT a.workspace_id,a.id,n,'HISTORY_BODY_SENTINEL'||repeat('x',2000),'agent',jsonb_build_object('private_note',repeat('x',1000)) FROM actions a CROSS JOIN generate_series(1,10) n WHERE a.workspace_id=$1`, [workspaceId]);
    await runtime.query(`INSERT INTO action_runs(workspace_id,action_id,agent_key,state,input,output,created_at)
      SELECT a.workspace_id,a.id,'review_reply','succeeded',jsonb_build_object('private_input','RUN_SENTINEL'),jsonb_build_object('body','RUN_SENTINEL'),'2026-10-01T00:00:00Z'::timestamptz+n*interval '1 second'
      FROM actions a CROSS JOIN generate_series(1,5) n WHERE a.workspace_id=$1`, [workspaceId]);
    const scope: ActionListScope = { workspaceId, locationId: null, allowedLocationIds: null, channelTemplates: null, status: null };
    const ctx: WorkspaceContext = { workspace: { id: workspaceId, slug: "pagination", name: "Pagination", market: "hk", tier: "paid", timezone: "Asia/Hong_Kong", isDemo: false, instagramHandle: null, industry: null, district: null }, locations: [], usage: { period: "2026-10", approvedDeliveries: 0, allowance: null }, unreadNotifications: 0, account: { name: "Fixture", email: "fixture@example.test" }, membership: { workspaceId, workspaceSlug: "pagination", userId: "00000000-0000-4000-8000-000000000001", email: "fixture@example.test", role: "owner", locationScope: null } };
    return { scope, ctx };
  }

  it.each([10, 100, 1000])("%s actions x 10 versions x 5 runs: constant queries and bounded bytes", async size => {
    const { scope } = await seed(size);
    type QueryRecord = { sql: string; values: unknown[]; rows: number };
    const records: QueryRecord[] = [];
    const client = { query: (async (sql: string, values: unknown[]) => {
      const result = await runtime.query(sql, values); records.push({ sql, values, rows: result.rows.length }); return result;
    }) as Pool["query"] };
    const beforeStart = performance.now();
    const legacy = workspaceReadRepository(client);
    const actions = await legacy.actions(scope.workspaceId);
    const ids = actions.map(a => a.id);
    const [versions, runs] = await Promise.all([legacy.versions(scope.workspaceId, ids), legacy.runs(scope.workspaceId, ids)]);
    const before = { queries: records.length, rows: records.reduce((n, r) => n + r.rows, 0), bytes: Buffer.byteLength(JSON.stringify({ actions, versions, runs })), latencyMs: performance.now() - beforeStart };
    const beforeRecords = records.splice(0);
    const repository = actionListRepository(client);
    const afterStart = performance.now();
    const [page, counts] = await Promise.all([repository.page(scope, "all", 25, null), repository.counts(scope)]);
    const after = { queries: records.length, rows: records.reduce((n, r) => n + r.rows, 0), bytes: Buffer.byteLength(JSON.stringify({ page, counts })), latencyMs: performance.now() - afterStart };
    const afterRecords = records.splice(0);
    expect(before.queries).toBe(3); expect(before.rows).toBe(size * 16);
    expect(after.queries).toBe(2); expect(after.rows).toBeLessThanOrEqual(27);
    expect(page.length).toBe(Math.min(size, 26)); expect(counts.all).toBe(size);
    expect(JSON.stringify(page)).not.toContain("HISTORY_BODY_SENTINEL"); expect(JSON.stringify(page)).not.toContain("RUN_SENTINEL");
    expect(JSON.stringify(page)).not.toContain("private_note");
    const warmMs: number[] = [];
    for (let i = 0; i < 5; i++) { const start = performance.now(); await Promise.all([repository.page(scope, "all", 25, null), repository.counts(scope)]); warmMs.push(performance.now() - start); }
    const plans = { before: [] as unknown[], after: [] as unknown[] };
    for (const [name, queries] of [["before", beforeRecords], ["after", afterRecords]] as const) {
      for (const query of queries) plans[name].push((await runtime.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query.sql}`, query.values)).rows[0]["QUERY PLAN"]);
    }
    const result = JSON.stringify({ size, environment: "owned postgres:16 / network-none Docker Desktop loopback relay", before, after, warmMs, plans });
    // Local opt-in evidence file; CI uses the reporter and never writes an artifact by default.
    if (process.env.T12_BENCHMARK_OUTPUT) appendFileSync(process.env.T12_BENCHMARK_OUTPUT, result + "\n");
    console.info("T12_BENCHMARK " + result);
  }, 90_000);

  it("pages a fixed tied tuple set without omissions/duplicates and retains counts, scope and history detail", async () => {
    const { ctx, scope } = await seed(100);
    const expected = (await runtime.query("SELECT id FROM actions WHERE workspace_id=$1 ORDER BY priority_score DESC,updated_at DESC,id DESC", [scope.workspaceId])).rows.map(r => r.id);
    const found: string[] = []; let cursor: string | undefined;
    do { const page = await listActions(ctx, { cursor }); expect(page.counts.all).toBe(100); expect(page.actions.length).toBeLessThanOrEqual(25); found.push(...page.actions.map(a => a.id)); cursor = page.nextCursor ?? undefined; } while (cursor);
    expect(found).toEqual(expected); expect(new Set(found).size).toBe(100);
    const first = await listActions(ctx, {});
    expect(first.actions[0].updatedAt).toBe("2026-10-01T00:00:00.123456Z");
    await expect(listActions(ctx, { channel: "instagram", cursor: first.nextCursor! })).rejects.toThrow("invalid_action_cursor");
    const viewer = { ...ctx, membership: { ...ctx.membership, role: "viewer" as const } };
    expect((await listActions(viewer, {})).counts.all).toBe(100);
    const manager = { ...ctx, membership: { ...ctx.membership, role: "manager" as const, locationScope: [] } };
    expect((await listActions(manager, {})).counts.all).toBe(100); // Existing workspace-wide action rule.
    expect(await workspaceReadRepository(runtime).versions(scope.workspaceId, [expected[0]])).toHaveLength(10);
    expect(await workspaceReadRepository(runtime).runs(scope.workspaceId, [expected[0]])).toHaveLength(5);
    expect((await listActions(ctx, { pageSize: 50 })).actions).toHaveLength(50);
    expect((await listActions(ctx, { channel: "instagram" }))).toMatchObject({ actions: [], hasMore: false, nextCursor: null });
  });

  it("SQL tab membership matches the imported canonical phase for lifecycle combinations", async () => {
    const { scope } = await seed(1);
    const id = (await runtime.query("SELECT id FROM actions WHERE workspace_id=$1", [scope.workspaceId])).rows[0].id;
    const repository = actionListRepository(runtime);
    const variants = [
      { capability: "Requires connection", actionState: "recommended", runState: "running", approvalState: "draft", deliveryState: "not_requested", measurementState: "not_eligible", applied: false, verified: false },
      { capability: "Live", actionState: "needs_input", runState: "running", approvalState: "draft", deliveryState: "not_requested", measurementState: "not_eligible", applied: false, verified: false },
      ...["queued", "running", "succeeded"].map(runState => ({ capability: "Live", actionState: "recommended", runState, approvalState: "draft", deliveryState: "not_requested", measurementState: "not_eligible", applied: false, verified: false })),
      ...["draft", "changes_requested", "approved"].flatMap(approvalState => ["export_ready", "exported", "publishing", "published", "cancelled"].map(deliveryState => ({ capability: "Live", actionState: "completed", runState: "succeeded", approvalState, deliveryState, measurementState: "measured", applied: false, verified: false }))),
      ...["not_eligible", "awaiting_comparable_scan", "measured"].flatMap(measurementState => [false, true].flatMap(applied => [false, true].map(verified => ({ capability: "Live", actionState: "recommended", runState: "succeeded", approvalState: "approved", deliveryState: "exported", measurementState, applied, verified })))),
    ];
    for (const raw of variants) {
      const input = raw as Parameters<typeof displayPhaseKey>[0];
      await runtime.query("UPDATE actions SET capability=$2,action_state=$3,measurement_state=$4 WHERE id=$1", [id, input.capability, input.actionState, input.measurementState]);
      await runtime.query("UPDATE action_runs SET state=$2 WHERE action_id=$1", [id, input.runState]);
      await runtime.query("UPDATE output_versions SET approval_state=$2,delivery_state=$3 WHERE action_id=$1", [id, input.approvalState, input.deliveryState]);
      await runtime.query("DELETE FROM action_applications WHERE action_id=$1", [id]);
      for (const source of [...(input.applied ? ["owner_asserted"] : []), ...(input.verified ? ["verified"] : [])]) {
        await runtime.query("INSERT INTO action_applications(workspace_id,action_id,source) VALUES($1,$2,$3)", [scope.workspaceId, id, source]);
      }
      const counts = await repository.counts({ ...scope, status: input.actionState });
      const phase = displayPhaseKey(input), open = input.actionState !== "completed";
      expect((await repository.page({ ...scope, status: input.actionState }, "all", 25, null))[0].phase, JSON.stringify(input)).toBe(phase);
      expect(counts.drafts, JSON.stringify(input)).toBe(open && ["draft_ready", "generating"].includes(phase) ? 1 : 0);
      expect(counts.awaiting_approval, JSON.stringify(input)).toBe(open && ["draft_ready", "changes_requested"].includes(phase) ? 1 : 0);
      expect((await repository.page({ ...scope, status: input.actionState }, "drafts", 25, null)).length).toBe(["draft_ready", "generating"].includes(phase) ? 1 : 0);
    }
  });

  it("applies tenant and manager location scope to both page and totals", async () => {
    const { ctx, scope } = await seed(3);
    const locations = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'allowed','Allowed'),($1,'hidden','Hidden') RETURNING id,slug", [scope.workspaceId])).rows;
    const allowed = locations.find(r => r.slug === "allowed")!.id, hidden = locations.find(r => r.slug === "hidden")!.id;
    const ids = (await runtime.query("SELECT id FROM actions WHERE workspace_id=$1 ORDER BY id", [scope.workspaceId])).rows.map(r => r.id);
    await runtime.query("UPDATE actions SET location_id=$2 WHERE id=$1", [ids[0], allowed]);
    await runtime.query("UPDATE actions SET location_id=$2 WHERE id=$1", [ids[1], hidden]);
    const foreign = (await runtime.query("INSERT INTO workspaces(slug,market,timezone) VALUES('foreign','hk','UTC') RETURNING id")).rows[0].id;
    await runtime.query("INSERT INTO actions(workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key) VALUES($1,'review-response','{}','{}','{}','high',99,'[]',10,'Live','foreign')", [foreign]);
    const manager = { ...ctx, membership: { ...ctx.membership, role: "manager" as const, locationScope: [allowed] } };
    const page = await listActions(manager, {});
    expect(page.counts.all).toBe(2); expect(page.actions.map(a => a.id).sort()).toEqual([ids[0], ids[2]].sort());
    expect((await listActions(ctx, {})).counts.all).toBe(3);
    const ownerCursor = (await listActions(ctx, { pageSize: 1 })).nextCursor!;
    await expect(listActions(manager, { cursor: ownerCursor })).rejects.toThrow("invalid_action_cursor");
  });

  it("searches visible fields literally, filters assignee and resolves due dates in IANA zones", async () => {
    const { scope } = await seed(4); const repository = actionListRepository(runtime);
    const ids = (await runtime.query("SELECT id FROM actions WHERE workspace_id=$1 ORDER BY id", [scope.workspaceId])).rows.map(r => r.id);
    const userId = (await runtime.query("INSERT INTO app_users(email) VALUES('assignee@example.test') RETURNING id")).rows[0].id;
    await runtime.query("UPDATE actions SET title=jsonb_build_object('en','100%_literal'),assignee_user_id=$2,due_at='2026-09-30T16:00:00Z' WHERE id=$1", [ids[0], userId]);
    await runtime.query("UPDATE actions SET summary=jsonb_build_object('zh-HK','Needle'),due_at='2026-09-30T15:59:59.999999Z' WHERE id=$1", [ids[1]]);
    await runtime.query("UPDATE actions SET due_at='2026-10-07T16:00:00Z' WHERE id=$1", [ids[2]]);
    await runtime.query("UPDATE output_versions SET body='Needle 100%_literal' WHERE action_id=$1", [ids[3]]);
    const query = async (input: Parameters<typeof actionListFilters>[0], timezone = "Asia/Hong_Kong", now = new Date("2026-09-30T16:15:00Z")) => {
      const filtered = { ...scope, ...actionListFilters(input, timezone, now) };
      const [page, counts] = await Promise.all([repository.page(filtered,"all",25,null),repository.counts(filtered)]);
      expect(counts.all).toBe(page.length); return page.map(r => r.id).sort();
    };
    expect(await query({ q: "100%_literal" })).toEqual([ids[0]]);
    expect(await query({ q: "needle" })).toEqual([ids[1]]);
    expect(await query({ q: "' OR 1=1 --" })).toEqual([]);
    expect(await query({ assignee: userId })).toEqual([ids[0]]);
    expect(await query({ assignee: "unassigned" })).toEqual(ids.slice(1).sort());
    expect(await query({ due: "none" })).toEqual([ids[3]]);
    expect(await query({ due: "today" })).toEqual([ids[0]]);
    expect(await query({ due: "next_7_days" })).toEqual([ids[0]]); // Exact next-week midnight is exclusive.
    expect(await query({ due: "today" },"Asia/Taipei")).toEqual([ids[0]]);
    expect(await query({ due: "today" },"UTC")).toEqual(ids.slice(0,2).sort());
    expect(await query({ due: "overdue" })).toEqual(ids.slice(0,2).sort());
    await runtime.query("UPDATE actions SET due_at='2026-11-02T04:59:59.999999Z' WHERE id=$1", [ids[0]]);
    await runtime.query("UPDATE actions SET due_at='2026-11-02T05:00:00Z' WHERE id=$1", [ids[1]]);
    expect(await query({ due: "today" },"America/New_York",new Date("2026-11-01T12:00:00Z"))).toEqual([ids[0]]); // 25-hour DST day.
  });
});
