import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { applyMigrations } from "../../scripts/neon/migrations";
import { conversationSearchRepository } from "../../lib/repositories/conversation-search";
import { buildSearchBriefs } from "../../lib/workspace/search-gap";
import { gapFixture, gscFixture } from "../fixtures/conversation-search";

describe("Stage 3 confirmed search briefs on owned PostgreSQL", () => {
  let fixture: NeonDatabaseFixture, owner: Pool, runtime: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test"); owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS"); await applyMigrations(owner);
    await owner.query("CREATE ROLE search_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    const url = new URL(fixture.databaseUrl); url.username = "search_runtime"; url.password = "fixture-only"; runtime = new Pool({ connectionString: url.href });
  });
  afterAll(async () => { await Promise.allSettled([owner?.end(), runtime?.end()]); fixture?.stop(); });
  async function setup() {
    const workspaceId = (await runtime.query("INSERT INTO workspaces DEFAULT VALUES RETURNING id")).rows[0].id as string;
    const actorId = (await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`${crypto.randomUUID()}@example.test`])).rows[0].id as string;
    await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,'owner@example.test','owner',now())", [workspaceId, actorId]);
    const locationId = (await runtime.query("INSERT INTO locations(workspace_id,slug,name,website_url) VALUES($1,'branch','Synthetic branch','https://shop.example.test/') RETURNING id", [workspaceId])).rows[0].id as string;
    return { workspaceId, locationId, actorId };
  }
  it("drafts create no task; concurrent explicit confirmations create one todo and one audit with no version, usage or delivery", async () => {
    const scope = await setup(), repo = conversationSearchRepository(runtime), gap = gapFixture();
    const draft = await repo.append(scope, gap, buildSearchBriefs(gap));
    expect(draft).toMatchObject({ approvedAt: null, actionId: null });
    expect((await runtime.query("SELECT id FROM actions WHERE workspace_id=$1", [scope.workspaceId])).rows).toEqual([]);
    const [a, b] = await Promise.all([repo.approve(scope, draft.id, scope.actorId), repo.approve(scope, draft.id, scope.actorId)]);
    expect(a!.actionId).toBe(b!.actionId); expect(a!.approvedAt).toBe(b!.approvedAt);
    expect((await runtime.query("SELECT summary,source,action_state FROM actions WHERE workspace_id=$1", [scope.workspaceId])).rows).toMatchObject([{ source: "owner_objective", action_state: "needs_input", summary: { en: expect.stringContaining("Google Search Console") } }]);
    expect((await runtime.query("SELECT payload FROM audit_events WHERE workspace_id=$1", [scope.workspaceId])).rows).toMatchObject([{ payload: { search_brief_id: draft.id, confirmation: "explicit_owner" } }]);
    for (const table of ["output_versions", "action_runs", "deliveries", "workspace_usage"]) expect((await runtime.query(`SELECT count(*)::int AS n FROM ${table} WHERE workspace_id=$1`, [scope.workspaceId])).rows[0].n).toBe(0);
    await runtime.query("UPDATE actions SET action_state='completed' WHERE id=$1", [a!.actionId]);
    expect((await repo.approve(scope, draft.id, scope.actorId))!.actionId).toBe(a!.actionId);
    expect((await runtime.query("SELECT id FROM actions WHERE workspace_id=$1", [scope.workspaceId])).rows).toHaveLength(1);
  });
  it("re-reading identical final evidence reuses its snapshot; changed evidence appends without rewriting the confirmed draft", async () => {
    const scope = await setup(), repo = conversationSearchRepository(runtime), gap = gapFixture();
    const first = await repo.append(scope, gap, buildSearchBriefs(gap)); await repo.approve(scope, first.id, scope.actorId);
    const refreshed = { ...gap, requestedAt: "2026-10-28T12:00:00Z", source: { ...gap.source, observedAt: "2026-10-28T12:00:00Z" } };
    const same = await repo.append(scope, refreshed, buildSearchBriefs(refreshed)); expect(same.id).toBe(first.id); expect(same.gap.source.observedAt).toBe(first.gap.source.observedAt); expect(same.brief).toEqual(first.brief);
    const changed = gapFixture(gscFixture({ items: [{ title: "午餐餐牌", metrics: { impressions: 81, clicks: 0 } }] }));
    expect((await repo.append(scope, changed, buildSearchBriefs(changed))).id).not.toBe(first.id);
    await expect(runtime.query("UPDATE conversation_search_briefs SET brief='{}' WHERE id=$1", [first.id])).rejects.toMatchObject({ code: "42501" });
    await expect(owner.query("UPDATE conversation_search_briefs SET brief='{}' WHERE id=$1", [first.id])).rejects.toThrow("search_brief_immutable");
    await expect(owner.query("UPDATE conversation_search_briefs SET approved_at=now() WHERE id=$1", [first.id])).rejects.toThrow("search_brief_immutable");
    await expect(owner.query("DELETE FROM conversation_search_briefs WHERE id=$1", [first.id])).rejects.toThrow("search_brief_immutable");
    expect((await repo.find(scope, first.id))!.brief).toEqual(first.brief);
  });
  it("never substitutes another workspace/location or owner and refuses unavailable briefs", async () => {
    const a = await setup(), b = await setup(), repo = conversationSearchRepository(runtime), gap = gapFixture();
    const record = await repo.append(a, gap, buildSearchBriefs(gap));
    expect(await repo.find(b, record.id)).toBeNull(); expect(await repo.approve(b, record.id, b.actorId)).toBeNull();
    expect(await repo.find({ ...a, locationId: b.locationId }, record.id)).toBeNull();
    await expect(repo.approve(a, record.id, b.actorId)).rejects.toThrow("owner_required");
    const empty = gapFixture(gscFixture({ items: [] })), unavailable = await repo.append(a, empty, null);
    await expect(repo.approve(a, unavailable.id, a.actorId)).rejects.toThrow("brief_unavailable");
    expect((await runtime.query("SELECT id FROM actions WHERE workspace_id=$1", [a.workspaceId])).rows).toEqual([]);
  });
  it("rolls back todo and confirmation if accountability cannot be saved", async () => {
    const scope = await setup(), repo = conversationSearchRepository(runtime), gap = gapFixture();
    const record = await repo.append(scope, gap, buildSearchBriefs(gap));
    await owner.query("REVOKE INSERT ON audit_events FROM sme_app_runtime");
    try { await expect(repo.approve(scope, record.id, scope.actorId)).rejects.toThrow(); }
    finally { await owner.query("GRANT INSERT ON audit_events TO sme_app_runtime"); }
    expect((await repo.find(scope, record.id))!.approvedAt).toBeNull();
    expect((await runtime.query("SELECT id FROM actions WHERE workspace_id=$1", [scope.workspaceId])).rows).toEqual([]);
    expect((await repo.approve(scope, record.id, scope.actorId))!.actionId).toBeTruthy();
  });
  it("retains a deleted actor and location as historical provenance without moving records into another scope", async () => {
    const scope = await setup(), repo = conversationSearchRepository(runtime), gap = gapFixture();
    const first = await repo.append(scope, gap, buildSearchBriefs(gap)); await repo.approve(scope, first.id, scope.actorId);
    const successor = (await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`${crypto.randomUUID()}@example.test`])).rows[0].id;
    await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,'successor@example.test','owner',now())", [scope.workspaceId, successor]);
    await runtime.query("DELETE FROM app_users WHERE id=$1", [scope.actorId]);
    expect((await runtime.query("SELECT approved_by,approved_at FROM conversation_search_briefs WHERE id=$1", [first.id])).rows[0]).toMatchObject({ approved_by: null, approved_at: expect.any(Date) });
    await runtime.query("DELETE FROM locations WHERE id=$1", [scope.locationId]);
    expect(await repo.list(scope)).toEqual([]); expect(await repo.find(scope, first.id)).toBeNull();
    expect((await runtime.query("SELECT location_id FROM conversation_search_briefs WHERE id=$1", [first.id])).rows[0].location_id).toBe(scope.locationId);
    await runtime.query("DELETE FROM workspaces WHERE id=$1", [scope.workspaceId]);
    expect((await runtime.query("SELECT id FROM conversation_search_briefs WHERE id=$1", [first.id])).rows).toEqual([]);
  });
});
