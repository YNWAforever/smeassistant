import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations, loadMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

// Repositories must use the pool they are given; the default database is reached
// only where a test deliberately points it at the fixture (loadPackOverview).
const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({
  getPool: () => {
    if (!ports.pool) throw new Error("default_database_forbidden");
    return ports.pool;
  },
}));

import { deriveActionsForSnapshot } from "../../lib/repositories/action-derivation";
import { packRepository } from "../../lib/repositories/packs";
import { STARTER_PACK, loadPackOverview } from "../../lib/workspace/packs";
import type { WorkspaceContext } from "../../lib/workspace/queries";
import { TEMPLATES } from "../../lib/workspace/templates";

// P4.2 migration 0012 (docs/superpowers/specs/2026-10-02-work-packs-design.md 1.1, 1.2):
// work_packs (one open pack per workspace, location and kind) and work_pack_items.
describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon work packs schema", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query(
      "CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime",
    );
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, max: 5 });
  });

  beforeEach(async () => {
    // Nothing exists until the first test has applied the migrations.
    if ((await owner.query("SELECT to_regclass('public.work_packs') AS r")).rows[0].r) {
      await runtime.query("DELETE FROM workspaces; DELETE FROM app_users");
    }
  });

  afterAll(async () => {
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  it("migration applies after 0011 and a second applyMigrations returns []", async () => {
    const migrations = await loadMigrations();
    const before = migrations.filter((m) => m.name < "0012_work_packs.sql");
    expect(before.at(-1)?.name).toBe("0011_offers.sql");
    expect(await applyMigrations(owner, before)).toHaveLength(11);
    expect(await applyMigrations(owner)).toEqual(["0012_work_packs.sql"]);
    expect(await applyMigrations(owner)).toEqual([]);
  });

  async function workspace(): Promise<string> {
    return (
      await runtime.query("INSERT INTO workspaces(slug,market,timezone) VALUES($1,'hk','Asia/Hong_Kong') RETURNING id", [
        `ws-${randomUUID().slice(0, 8)}`,
      ])
    ).rows[0].id as string;
  }

  async function location(workspaceId: string): Promise<string> {
    const slug = `loc-${randomUUID().slice(0, 8)}`;
    return (
      await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,$2,$2) RETURNING id", [workspaceId, slug])
    ).rows[0].id as string;
  }

  async function insertAction(workspaceId: string, templateKey = "review-response"): Promise<string> {
    return (
      await runtime.query(
        `INSERT INTO actions(workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key)
         VALUES($1,$2,'{}','{}','{}','low',0,'[]',5,'Beta',$3) RETURNING id`,
        [workspaceId, templateKey, `dk-${randomUUID()}`],
      )
    ).rows[0].id as string;
  }

  const insertPack = async (workspaceId: string, locationId: string | null, closed = false): Promise<string> =>
    (
      await runtime.query(
        "INSERT INTO work_packs(workspace_id,location_id,kind,closed_at) VALUES($1,$2,'visibility_starter',$3) RETURNING id",
        [workspaceId, locationId, closed ? new Date().toISOString() : null],
      )
    ).rows[0].id as string;

  const insertItem = (packId: string, actionId: string, templateKey: string, position: number) =>
    runtime.query("INSERT INTO work_pack_items(pack_id,action_id,template_key,position) VALUES($1,$2,$3,$4)", [
      packId,
      actionId,
      templateKey,
      position,
    ]);

  it("a second open pack for the same workspace, location and kind is rejected (23505), and with location_id null too", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    await insertPack(ws, loc);
    await expect(insertPack(ws, loc)).rejects.toMatchObject({ code: "23505" });
    // A different location, and another workspace, are independent.
    await insertPack(ws, await location(ws));
    await insertPack(await workspace(), null);

    const ws2 = await workspace();
    await insertPack(ws2, null);
    await expect(insertPack(ws2, null)).rejects.toMatchObject({ code: "23505" });
    // A pack for a location does not collide with the workspace-wide (null) pack.
    await insertPack(ws2, await location(ws2));
  });

  it("a closed pack does not block a new open one", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    await insertPack(ws, loc, true);
    await insertPack(ws, loc, true);
    await insertPack(ws, loc);
    await insertPack(ws, null, true);
    await insertPack(ws, null);
    expect((await runtime.query("SELECT count(*)::int AS n FROM work_packs WHERE workspace_id=$1", [ws])).rows[0].n).toBe(5);
  });

  it("work_pack_items rejects an unknown template_key and position 4 (23514), and a duplicate (pack_id, template_key) (23505)", async () => {
    const ws = await workspace();
    const pack = await insertPack(ws, null);
    const action = await insertAction(ws);
    await expect(insertItem(pack, action, "social-post", 1)).rejects.toMatchObject({ code: "23514" });
    await expect(insertItem(pack, action, "review-response", 4)).rejects.toMatchObject({ code: "23514" });
    await expect(insertItem(pack, action, "review-response", 0)).rejects.toMatchObject({ code: "23514" });
    await insertItem(pack, action, "review-response", 1);
    await expect(insertItem(pack, await insertAction(ws), "review-response", 2)).rejects.toMatchObject({ code: "23505" });
    await insertItem(pack, await insertAction(ws, "visibility-content"), "visibility-content", 2);
    await insertItem(pack, await insertAction(ws, "website-basics"), "website-basics", 3);
    expect((await runtime.query("SELECT count(*)::int AS n FROM work_pack_items WHERE pack_id=$1", [pack])).rows[0].n).toBe(3);
  });

  it("an unknown pack kind is rejected (23514)", async () => {
    const ws = await workspace();
    await expect(runtime.query("INSERT INTO work_packs(workspace_id,kind) VALUES($1,'growth_pack')", [ws])).rejects.toMatchObject({
      code: "23514",
    });
  });

  it("deleting an action referenced by a pack item fails (23503); deleting the workspace cascades through packs, items and actions", async () => {
    const ws = await workspace();
    const pack = await insertPack(ws, null);
    const action = await insertAction(ws);
    await insertItem(pack, action, "review-response", 1);
    await expect(runtime.query("DELETE FROM actions WHERE id=$1", [action])).rejects.toMatchObject({ code: "23503" });
    await runtime.query("DELETE FROM workspaces WHERE id=$1", [ws]);
    for (const table of ["work_packs", "work_pack_items", "actions"]) {
      expect((await runtime.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n).toBe(0);
    }
  });

  it("deleting a location cascades its packs and items, and leaves the actions", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const pack = await insertPack(ws, loc);
    const action = await insertAction(ws);
    await insertItem(pack, action, "review-response", 1);
    await runtime.query("DELETE FROM locations WHERE id=$1", [loc]);
    expect((await runtime.query("SELECT count(*)::int AS n FROM work_packs WHERE id=$1", [pack])).rows[0].n).toBe(0);
    expect((await runtime.query("SELECT count(*)::int AS n FROM work_pack_items WHERE pack_id=$1", [pack])).rows[0].n).toBe(0);
    expect((await runtime.query("SELECT count(*)::int AS n FROM actions WHERE id=$1", [action])).rows[0].n).toBe(1);
  });

  // ---- Task 2: startPack (spec 2.2) -------------------------------------------------

  async function actor(): Promise<string> {
    return (await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`${randomUUID()}@example.test`])).rows[0]
      .id as string;
  }

  const start = (workspaceId: string, locationId: string | null, actorId: string) =>
    packRepository(runtime).startPack({ workspaceId, locationId, actorId, locale: "en", ipHash: "hash-1" });

  const count = async (sql: string, params: unknown[]): Promise<number> => (await runtime.query(sql, params)).rows[0].n as number;

  /** A finished scan for (ws, loc) whose findings make derivation emit review-response only. */
  async function scan(ws: string, loc: string) {
    const job = (
      await runtime.query(
        "INSERT INTO audit_jobs(workspace_id,location_id,business_name,status) VALUES($1,$2,'Fixture','done') RETURNING id",
        [ws, loc],
      )
    ).rows[0].id as string;
    const snapshot = (
      await runtime.query(
        "INSERT INTO scan_snapshots(workspace_id,location_id,job_id,market,observed_at,coverage,module_states,metrics) VALUES($1,$2,$3,'hk',now(),1,'{}','{}') RETURNING id",
        [ws, loc, job],
      )
    ).rows[0].id as string;
    await runtime.query(
      "INSERT INTO audit_findings(job_id,finding_key,module,severity,score_impact) VALUES($1,'gbp.owner_response_low','gbp','warning',-10)",
      [job],
    );
    // An active Google connection, so derivation does not also emit google-reconnect.
    await runtime.query(
      "INSERT INTO oauth_connections(workspace_id,provider,access_token_encrypted,status,connected_at) VALUES($1,'google_gbp','fixture','active',now())",
      [ws],
    );
    return { job, snapshot };
  }

  it("start creates one pack and three items", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const user = await actor();
    const result = await start(ws, loc, user);

    expect(result.created).toBe(true);
    expect(result.items.map((i) => i.templateKey)).toEqual([...STARTER_PACK.items]);
    expect(result.items.every((i) => !i.reused)).toBe(true);
    const pack = (await runtime.query("SELECT * FROM work_packs WHERE workspace_id=$1", [ws])).rows;
    expect(pack).toHaveLength(1);
    expect(pack[0]).toMatchObject({ id: result.packId, location_id: loc, kind: "visibility_starter", created_by: user, closed_at: null });
    const items = (
      await runtime.query("SELECT template_key,position,action_id FROM work_pack_items WHERE pack_id=$1 ORDER BY position", [result.packId])
    ).rows;
    expect(items).toEqual(result.items.map((i, n) => ({ template_key: i.templateKey, position: n + 1, action_id: i.actionId })));

    const actions = (await runtime.query("SELECT * FROM actions WHERE workspace_id=$1", [ws])).rows;
    expect(actions).toHaveLength(3);
    for (const item of result.items) {
      const row = actions.find((a) => a.id === item.actionId)!;
      const template = TEMPLATES.find((t) => t.key === item.templateKey)!;
      expect(row).toMatchObject({
        location_id: loc,
        template_key: item.templateKey,
        source: "owner_objective",
        source_finding_keys: [],
        title: template.title,
        summary: template.summary,
        priority: "medium",
        priority_factors: [],
        effort_minutes: template.effortMinutes,
        // No scan for this location: nothing is answered, so every template input is required.
        required_inputs: template.requiredInputs,
        provided_inputs: {},
        action_state: "needs_input",
        measurement_state: "not_eligible",
        capability: template.capability,
        dedupe_key: `${ws}:${loc}:${item.templateKey}`,
      });
      expect(Number(row.priority_score)).toBe(50);
      expect(row.evidence).toMatchObject({ factType: "Recommended", source: "Visibility starter pack", value: "" });
      expect(row.evidence.detail).toEqual({ en: "Visibility starter pack", "zh-HK": "能見度入門套裝", "zh-TW": "能見度入門套組" });
    }

    // The read side: open, by id and its scope.
    const repo = packRepository(runtime);
    const open = await repo.openPack(ws, loc);
    expect(open?.pack).toMatchObject({ id: result.packId, workspaceId: ws, locationId: loc, kind: "visibility_starter", closedAt: null });
    expect(open?.itemRows).toEqual(result.items.map((i, n) => ({ templateKey: i.templateKey, position: n + 1, actionId: i.actionId })));
    expect(await repo.getPack(result.packId)).toEqual(open);
    expect(await repo.packScope(result.packId)).toEqual({ workspaceId: ws, locationId: loc });
    expect(await repo.openPack(ws, null)).toBeNull();
    expect(await repo.getPack(randomUUID())).toBeNull();
    expect(await repo.packScope(randomUUID())).toBeNull();
  });

  it("drops reviews_without_response from required_inputs when the latest scan retains an unanswered review", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const job = (
      await runtime.query("INSERT INTO audit_jobs(workspace_id,location_id,business_name,status,raw_data) VALUES($1,$2,'Fixture','done',$3) RETURNING id", [
        ws,
        loc,
        JSON.stringify({ gbp: { reviews: [{ rating: 2, text: "Slow service", time: "2026-09-30T00:00:00Z" }] } }),
      ])
    ).rows[0].id;
    await runtime.query(
      "INSERT INTO scan_snapshots(workspace_id,location_id,job_id,market,observed_at,coverage,module_states,metrics) VALUES($1,$2,$3,'hk',now(),1,'{}','{}')",
      [ws, loc, job],
    );
    const result = await start(ws, loc, await actor());
    const review = (await runtime.query("SELECT required_inputs,action_state FROM actions WHERE id=$1", [result.items[0]!.actionId])).rows[0];
    expect(review).toEqual({ required_inputs: ["brand_voice", "language"], action_state: "needs_input" });
  });

  it("reuses an open scan-derived action unchanged (same id, same evidence, reused:true)", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const { snapshot } = await scan(ws, loc);
    expect((await deriveActionsForSnapshot(runtime, snapshot)).created).toBe(1);
    const before = (await runtime.query("SELECT * FROM actions WHERE workspace_id=$1 AND template_key='review-response'", [ws])).rows[0];
    expect(before.source).toBe("finding");

    const result = await start(ws, loc, await actor());
    expect(result.items[0]).toEqual({ templateKey: "review-response", actionId: before.id, reused: true });
    expect(result.items.slice(1).map((i) => i.reused)).toEqual([false, false]);
    const after = (await runtime.query("SELECT * FROM actions WHERE id=$1", [before.id])).rows[0];
    expect(after).toEqual(before);
    expect(await count("SELECT count(*)::int AS n FROM actions WHERE workspace_id=$1 AND template_key='review-response'", [ws])).toBe(1);
  });

  it("creates a missing action with the derivation key; a later derivation upsert updates it, without a duplicate, leaving source owner_objective", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const result = await start(ws, loc, await actor());
    const actionId = result.items[0]!.actionId;
    expect(result.items[0]!.reused).toBe(false);

    const { snapshot } = await scan(ws, loc);
    expect(await deriveActionsForSnapshot(runtime, snapshot)).toMatchObject({ created: 0, updated: 1 });
    const rows = (await runtime.query("SELECT * FROM actions WHERE workspace_id=$1 AND template_key='review-response'", [ws])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: actionId, source: "owner_objective", source_snapshot_id: snapshot, dedupe_key: `${ws}:${loc}:review-response` });
    // Derivation refreshed the evidence and finding keys from the scan.
    expect(rows[0].evidence.factType).not.toBe("Recommended");
    expect(rows[0].source_finding_keys).toEqual(["gbp.owner_response_low"]);
    // The pack still points at the same action.
    expect(await count("SELECT count(*)::int AS n FROM work_pack_items WHERE action_id=$1", [actionId])).toBe(1);
  });

  it("a completed action for a template does not block: a new open action is created and the completed one is untouched", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const { snapshot } = await scan(ws, loc);
    await deriveActionsForSnapshot(runtime, snapshot);
    await runtime.query("UPDATE actions SET action_state='completed',completed_at=now() WHERE workspace_id=$1 AND template_key='review-response'", [ws]);
    const done = (await runtime.query("SELECT * FROM actions WHERE workspace_id=$1 AND template_key='review-response'", [ws])).rows[0];

    const result = await start(ws, loc, await actor());
    expect(result.items[0]).toMatchObject({ templateKey: "review-response", reused: false });
    expect(result.items[0]!.actionId).not.toBe(done.id);
    expect((await runtime.query("SELECT * FROM actions WHERE id=$1", [done.id])).rows[0]).toEqual(done);
    const fresh = (await runtime.query("SELECT action_state,source,dedupe_key FROM actions WHERE id=$1", [result.items[0]!.actionId])).rows[0];
    expect(fresh).toEqual({ action_state: "needs_input", source: "owner_objective", dedupe_key: done.dedupe_key });
  });

  it("two concurrent startPack calls give one pack and one set of items, and both return the same packId", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const [u1, u2, u3, u4] = [await actor(), await actor(), await actor(), await actor()];
    const [a, b] = await Promise.all([start(ws, loc, u1), start(ws, loc, u2)]);
    expect(a.packId).toBe(b.packId);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(a.items.map((i) => i.actionId)).toEqual(b.items.map((i) => i.actionId));
    expect(await count("SELECT count(*)::int AS n FROM work_packs WHERE workspace_id=$1", [ws])).toBe(1);
    expect(await count("SELECT count(*)::int AS n FROM work_pack_items WHERE pack_id=$1", [a.packId])).toBe(3);
    expect(await count("SELECT count(*)::int AS n FROM actions WHERE workspace_id=$1", [ws])).toBe(3);
    expect(await count("SELECT count(*)::int AS n FROM audit_events WHERE workspace_id=$1 AND event='pack.started'", [ws])).toBe(1);

    // The workspace-wide (null location) key is serialised the same way.
    const [c, d] = await Promise.all([start(ws, null, u3), start(ws, null, u4)]);
    expect(c.packId).toBe(d.packId);
    expect(await count("SELECT count(*)::int AS n FROM work_packs WHERE workspace_id=$1 AND location_id IS NULL", [ws])).toBe(1);
  });

  it("start while unfinished returns created:false and writes no audit row", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const user = await actor();
    const first = await start(ws, loc, user);
    // One finished item still leaves the pack unfinished.
    await runtime.query("UPDATE actions SET action_state='dismissed' WHERE id=$1", [first.items[0]!.actionId]);
    const audits = await count("SELECT count(*)::int AS n FROM audit_events WHERE workspace_id=$1", [ws]);
    const second = await start(ws, loc, user);
    expect(second).toEqual({ packId: first.packId, created: false, items: first.items.map((i) => ({ ...i, reused: true })) });
    expect(await count("SELECT count(*)::int AS n FROM audit_events WHERE workspace_id=$1", [ws])).toBe(audits);
    expect(await count("SELECT count(*)::int AS n FROM work_packs WHERE workspace_id=$1", [ws])).toBe(1);
    expect(await count("SELECT count(*)::int AS n FROM actions WHERE workspace_id=$1", [ws])).toBe(3);
  });

  it("start after every item finished closes the old pack (closed_at set) and opens a new one", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const user = await actor();
    const first = await start(ws, loc, user);
    await runtime.query("UPDATE actions SET action_state='completed' WHERE id = ANY($1::uuid[])", [first.items.map((i) => i.actionId)]);

    const second = await start(ws, loc, user);
    expect(second.created).toBe(true);
    expect(second.packId).not.toBe(first.packId);
    expect((await runtime.query("SELECT closed_at FROM work_packs WHERE id=$1", [first.packId])).rows[0].closed_at).toBeInstanceOf(Date);
    expect((await packRepository(runtime).openPack(ws, loc))?.pack.id).toBe(second.packId);
    // The finished actions stay with the old pack; the new pack gets fresh open ones.
    for (const [n, item] of second.items.entries()) {
      expect(item.reused).toBe(false);
      expect(item.actionId).not.toBe(first.items[n]!.actionId);
    }
    expect(await count("SELECT count(*)::int AS n FROM work_pack_items WHERE pack_id=$1", [first.packId])).toBe(3);
  });

  it("pack.started audit payload lists template_key, action_id and reused", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const { snapshot } = await scan(ws, loc);
    await deriveActionsForSnapshot(runtime, snapshot);
    const user = await actor();
    const result = await start(ws, loc, user);
    const rows = (await runtime.query("SELECT * FROM audit_events WHERE workspace_id=$1 AND event='pack.started'", [ws])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ location_id: loc, actor_type: "user", actor_id: user, entity_type: "work_pack", entity_id: result.packId });
    expect(rows[0].payload).toEqual({
      locale: "en",
      ip_hash: "hash-1",
      pack_id: result.packId,
      location_id: loc,
      items: result.items.map((i) => ({ template_key: i.templateKey, action_id: i.actionId, reused: i.reused })),
    });
    expect(rows[0].payload.items.map((i: { reused: boolean }) => i.reused)).toEqual([true, false, false]);
  });

  it("loadPackOverview derives each item's overview from its action, in position order", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const result = await start(ws, loc, await actor());
    const open = (await packRepository(runtime).openPack(ws, loc))!;
    ports.pool = runtime;
    try {
      const ctx = {
        workspace: { id: ws },
        locations: [{ id: loc, slug: "loc", name: "Loc", address: null, district: null, isPrimary: true, placeId: null }],
      } as unknown as WorkspaceContext;
      const overview = await loadPackOverview(ctx, open.pack, open.itemRows);
      expect(overview.pack).toEqual(open.pack);
      expect(overview.items.map((i) => [i.templateKey, i.position, i.action.id])).toEqual(result.items.map((i, n) => [i.templateKey, n + 1, i.actionId]));
      expect(overview.counts).toEqual({ drafted: 0, needsInput: 3, approved: 0, exported: 0, failed: 0, finished: 0 });
      expect(overview.nextToReview).toBeNull();
      expect(overview.finished).toBe(false);
    } finally {
      ports.pool = undefined;
    }
  });
});
