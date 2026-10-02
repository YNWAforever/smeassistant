import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations, loadMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

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
});
