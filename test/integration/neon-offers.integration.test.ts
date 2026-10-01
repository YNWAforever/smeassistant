import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { offerRepository } from "../../lib/repositories/offers";
import type { OfferInput } from "../../lib/offers/types";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon offers repository (P4.1)", () => {
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
    runtime = new Pool({ connectionString: url.href, max: 10 });
  });
  afterAll(async () => { await Promise.all([runtime?.end(), owner?.end()]); fixture?.stop(); });

  async function workspace() {
    const ws = (await runtime.query("INSERT INTO workspaces(slug) VALUES($1) RETURNING id", [`ws-${randomUUID().slice(0, 8)}`])).rows[0].id as string;
    const l1 = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'l1','L1') RETURNING id", [ws])).rows[0].id as string;
    const l2 = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'l2','L2') RETURNING id", [ws])).rows[0].id as string;
    const user = (await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`${randomUUID()}@example.test`])).rows[0].id as string;
    return { ws, l1, l2, user };
  }
  const input = (patch: Partial<OfferInput> = {}): OfferInput => ({
    location_id: null, title: "Lunch set", details: "Soup and main", terms: null, price_amount: "88.00", currency: "HKD",
    starts_on: "2026-10-05", ends_on: "2026-10-31", open_ended: false, approved_claims: ["Home-made"], prohibited_wording: [], asset_ids: [], ...patch,
  });

  it("creates, edits by revision and refuses a stale revision without changing the row", async () => {
    const { ws, user } = await workspace();
    const repo = offerRepository(runtime);
    const created = (await repo.create({ ...input(), workspaceId: ws, createdBy: user }))!;
    expect(created).toMatchObject({ status: "draft", revision: 1, price_amount: "88.00", starts_on: "2026-10-05", approved_claims: ["Home-made"], asset_ids: [] });
    const edited = await repo.update(ws, created.id, 1, input({ price_amount: "98.00" }));
    expect(edited).toMatchObject({ revision: 2, status: "draft", price_amount: "98.00" });
    expect(await repo.update(ws, created.id, 1, input({ price_amount: "1.00" }))).toBe("conflict");
    expect((await repo.get(ws, created.id))?.price_amount).toBe("98.00");
  });

  it("confirms, then an edit returns it to draft and clears the confirmation", async () => {
    const { ws, user } = await workspace();
    const repo = offerRepository(runtime);
    const created = (await repo.create({ ...input(), workspaceId: ws, createdBy: user }))!;
    const confirmed = await repo.confirm(ws, created.id, 1, user);
    expect(confirmed).toMatchObject({ status: "confirmed", confirmed_by: user });
    expect(typeof (confirmed as { confirmed_at: string }).confirmed_at).toBe("string");
    expect(await repo.confirm(ws, created.id, 1, user)).toBe("conflict");
    const edited = await repo.update(ws, created.id, 1, input({ title: "Dinner set" }));
    expect(edited).toMatchObject({ status: "draft", revision: 2, confirmed_at: null, confirmed_by: null });
    const archived = await repo.archive(ws, created.id);
    expect(archived).toMatchObject({ status: "archived" });
    expect(await repo.update(ws, created.id, 2, input())).toBe("archived");
  });

  it("enforces the confirmation and price checks in SQL", async () => {
    const { ws } = await workspace();
    await expect(runtime.query("INSERT INTO offers(workspace_id,title,details,starts_on,status,confirmed_at) VALUES($1,'t','d','2026-10-01','confirmed',now())", [ws])).rejects.toMatchObject({ constraint: "offers_confirmed_check" });
    await expect(runtime.query("INSERT INTO offers(workspace_id,title,details,starts_on,currency) VALUES($1,'t','d','2026-10-01','HKD')", [ws])).rejects.toMatchObject({ constraint: "offers_price_currency_check" });
    await expect(runtime.query("INSERT INTO offers(workspace_id,title,details,starts_on,price_amount,currency) VALUES($1,'t','d','2026-10-01',1,'USD')", [ws])).rejects.toMatchObject({ constraint: "offers_currency_check" });
  });

  it("refuses a location from another workspace", async () => {
    const a = await workspace();
    const b = await workspace();
    expect(await offerRepository(runtime).create({ ...input({ location_id: b.l1 }), workspaceId: a.ws, createdBy: a.user })).toBeNull();
  });

  it("deletes a location's offers and keeps actions with a null offer_id", async () => {
    const { ws, l1, user } = await workspace();
    const repo = offerRepository(runtime);
    const offer = (await repo.create({ ...input({ location_id: l1 }), workspaceId: ws, createdBy: user }))!;
    const action = (await runtime.query(
      `INSERT INTO actions(workspace_id,template_key,source,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,offer_id)
       VALUES($1,'offer-gbp-post','owner_objective','{}','{}','{}','low',0,'[]',8,'Beta',$2,$3) RETURNING id`,
      [ws, `${ws}:offer:${offer.id}`, offer.id],
    )).rows[0].id as string;
    await runtime.query("DELETE FROM locations WHERE id=$1", [l1]);
    expect(await repo.get(ws, offer.id)).toBeNull();
    expect((await runtime.query("SELECT offer_id FROM actions WHERE id=$1", [action])).rows[0].offer_id).toBeNull();
  });

  it("lists in-scope and workspace-wide offers for a scoped reader", async () => {
    const { ws, l1, l2, user } = await workspace();
    const repo = offerRepository(runtime);
    const wide = (await repo.create({ ...input(), workspaceId: ws, createdBy: user }))!;
    const atL1 = (await repo.create({ ...input({ location_id: l1 }), workspaceId: ws, createdBy: user }))!;
    await repo.create({ ...input({ location_id: l2 }), workspaceId: ws, createdBy: user });
    const ids = (await repo.list(ws, { locationIds: [l1] })).map((o) => o.id).sort();
    expect(ids).toEqual([wide.id, atL1.id].sort());
    expect(await repo.list(ws)).toHaveLength(3);
  });
});
