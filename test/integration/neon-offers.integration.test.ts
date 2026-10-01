import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations, loadMigrations } from "../../scripts/neon/migrations";
import { actionMutationRepository } from "../../lib/repositories/action-mutations";
import { offerRepository } from "../../lib/repositories/offers";
import type { OfferInput } from "../../lib/workspace/offers";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

// P4.1 migration 0011 (docs/superpowers/specs/2026-10-01-offers-promotion-copy-design.md 1.1, 1.2, 1.4):
// the offers table, actions.offer_id, offer_is_expired, confirm_offer and archive_offer.
describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon offers schema and functions", () => {
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
    if ((await owner.query("SELECT to_regclass('public.offers') AS r")).rows[0].r) {
      await runtime.query("DELETE FROM workspaces; DELETE FROM app_users");
    }
  });

  afterAll(async () => {
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  it("migration applies after 0010 and a second applyMigrations returns []", async () => {
    const migrations = await loadMigrations();
    const before = migrations.filter((m) => m.name < "0011_offers.sql");
    expect(before.at(-1)?.name).toBe("0010_mail_outbox.sql");
    expect(await applyMigrations(owner, before)).toHaveLength(10);
    expect(await applyMigrations(owner)).toEqual(["0011_offers.sql"]);
    expect(await applyMigrations(owner)).toEqual([]);
  });

  async function workspace(market: "hk" | "tw" | null = "hk", timezone = "Asia/Hong_Kong"): Promise<string> {
    return (
      await runtime.query("INSERT INTO workspaces(slug,market,timezone) VALUES($1,$2,$3) RETURNING id", [
        `ws-${randomUUID().slice(0, 8)}`,
        market,
        timezone,
      ])
    ).rows[0].id as string;
  }

  async function user(): Promise<string> {
    return (
      await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`u-${randomUUID().slice(0, 8)}@example.test`])
    ).rows[0].id as string;
  }

  interface OfferOverrides {
    title?: string;
    details?: string;
    price?: number | null;
    currency?: string | null;
    validFrom?: string;
    validUntil?: string;
    status?: string;
    confirmedAt?: string | null;
  }

  // Dates are DB-side offsets from CURRENT_DATE; +/-30 days keeps every case far from the
  // session/workspace time zone boundary.
  async function insertOffer(workspaceId: string, o: OfferOverrides = {}): Promise<string> {
    return (
      await runtime.query(
        `INSERT INTO offers(workspace_id,title,details,price_amount,currency,valid_from,valid_until,status,confirmed_at)
         VALUES($1,$2,$3,$4,$5,${o.validFrom ?? "CURRENT_DATE"},${o.validUntil ?? "CURRENT_DATE + 30"},$6,$7) RETURNING id`,
        [
          workspaceId,
          o.title ?? "Lunch set",
          o.details ?? "Soup and a main course",
          o.price === undefined ? null : o.price,
          o.currency === undefined ? null : o.currency,
          o.status ?? "draft",
          o.confirmedAt ?? null,
        ],
      )
    ).rows[0].id as string;
  }

  async function insertAction(workspaceId: string, offerId: string | null, state: string): Promise<string> {
    return (
      await runtime.query(
        `INSERT INTO actions(workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,action_state,offer_id)
         VALUES($1,'offer-instagram-post','{}','{}','{}','low',0,'[]',5,'Beta',$2,$3,$4) RETURNING id`,
        [workspaceId, `dk-${randomUUID()}`, state, offerId],
      )
    ).rows[0].id as string;
  }

  const confirm = (offerId: string, actor: string, revision = 1) =>
    runtime.query("SELECT public.confirm_offer($1,$2,$3) AS r", [offerId, actor, revision]);

  const auditRows = async (offerId: string, event: string) =>
    (await runtime.query("SELECT payload FROM audit_events WHERE entity_id=$1 AND event=$2", [offerId, event])).rows;

  it("offers rejects a price without a currency, an unknown currency, valid_until before valid_from, and confirmed without confirmed_at", async () => {
    const ws = await workspace();
    await expect(insertOffer(ws, { price: 12, currency: null })).rejects.toMatchObject({ code: "23514" });
    await expect(insertOffer(ws, { price: null, currency: "HKD" })).rejects.toMatchObject({ code: "23514" });
    await expect(insertOffer(ws, { price: 12, currency: "USD" })).rejects.toMatchObject({ code: "23514" });
    await expect(insertOffer(ws, { validFrom: "CURRENT_DATE + 5", validUntil: "CURRENT_DATE + 4" })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(insertOffer(ws, { status: "confirmed", confirmedAt: null })).rejects.toMatchObject({ code: "23514" });
    await expect(insertOffer(ws, { title: "" })).rejects.toMatchObject({ code: "23514" });
    await expect(insertOffer(ws, { price: -1, currency: "HKD" })).rejects.toMatchObject({ code: "23514" });
    // A valid row still inserts, so the failures above are the constraints and not the helper.
    await expect(insertOffer(ws, { price: 12, currency: "HKD" })).resolves.toBeTruthy();
  });

  it("confirm_offer confirms the expected revision and writes offer.confirmed", async () => {
    const ws = await workspace();
    const actor = await user();
    const offer = await insertOffer(ws);
    const result = (await confirm(offer, actor)).rows[0].r;
    expect(result).toEqual({ kind: "confirmed", offer_id: offer, revision: 1 });
    const row = (await runtime.query("SELECT status,confirmed_at,confirmed_by FROM offers WHERE id=$1", [offer])).rows[0];
    expect(row.status).toBe("confirmed");
    expect(row.confirmed_at).not.toBeNull();
    expect(row.confirmed_by).toBe(actor);
    const audit = await auditRows(offer, "offer.confirmed");
    expect(audit).toHaveLength(1);
    expect(audit[0].payload).toEqual({ revision: 1 });
    expect(
      (await runtime.query("SELECT entity_type,actor_id,workspace_id FROM audit_events WHERE entity_id=$1", [offer])).rows[0],
    ).toEqual({ entity_type: "offer", actor_id: actor, workspace_id: ws });
  });

  it("confirm_offer refuses a stale revision", async () => {
    const ws = await workspace();
    const offer = await insertOffer(ws);
    await runtime.query("UPDATE offers SET revision = 2 WHERE id=$1", [offer]);
    await expect(confirm(offer, await user(), 1)).rejects.toMatchObject({ code: "P0001", message: "offer_revision_changed" });
    expect((await runtime.query("SELECT status FROM offers WHERE id=$1", [offer])).rows[0].status).toBe("draft");
    expect(await auditRows(offer, "offer.confirmed")).toHaveLength(0);
  });

  it("confirm_offer refuses an unknown offer and a blank title or details", async () => {
    const actor = await user();
    await expect(confirm(randomUUID(), actor)).rejects.toMatchObject({ code: "P0001", message: "offer_not_found" });
    const ws = await workspace();
    // The table CHECK only requires one character, so whitespace is the function's job.
    const blankTitle = await insertOffer(ws, { title: "   " });
    await expect(confirm(blankTitle, actor)).rejects.toMatchObject({ code: "P0001", message: "offer_incomplete" });
    const blankDetails = await insertOffer(ws, { details: " \t " });
    await expect(confirm(blankDetails, actor)).rejects.toMatchObject({ code: "P0001", message: "offer_incomplete" });
  });

  it("confirm_offer refuses a TWD offer in an hk workspace, an HKD offer in a tw workspace, and accepts a price-less offer in either", async () => {
    const actor = await user();
    const hk = await workspace("hk");
    const tw = await workspace("tw", "Asia/Taipei");
    const twdInHk = await insertOffer(hk, { price: 100, currency: "TWD" });
    await expect(confirm(twdInHk, actor)).rejects.toMatchObject({ code: "P0001", message: "offer_currency_market" });
    const hkdInTw = await insertOffer(tw, { price: 100, currency: "HKD" });
    await expect(confirm(hkdInTw, actor)).rejects.toMatchObject({ code: "P0001", message: "offer_currency_market" });
    // A matching currency is accepted.
    const hkdInHk = await insertOffer(hk, { price: 100, currency: "HKD" });
    expect((await confirm(hkdInHk, actor)).rows[0].r.kind).toBe("confirmed");
    const twdInTw = await insertOffer(tw, { price: 100, currency: "TWD" });
    expect((await confirm(twdInTw, actor)).rows[0].r.kind).toBe("confirmed");
    // A price-less offer has no currency to disagree with, in either market.
    expect((await confirm(await insertOffer(hk), actor)).rows[0].r.kind).toBe("confirmed");
    expect((await confirm(await insertOffer(tw), actor)).rows[0].r.kind).toBe("confirmed");
    // A workspace with no market cannot match any currency.
    const noMarket = await workspace(null);
    await expect(confirm(await insertOffer(noMarket, { price: 1, currency: "HKD" }), actor)).rejects.toMatchObject({
      message: "offer_currency_market",
    });
  });

  it("confirm_offer refuses an archived offer and an expired offer", async () => {
    const ws = await workspace();
    const actor = await user();
    const archived = await insertOffer(ws, { status: "archived" });
    await expect(confirm(archived, actor)).rejects.toMatchObject({ code: "P0001", message: "offer_archived" });
    const expired = await insertOffer(ws, { validFrom: "CURRENT_DATE - 60", validUntil: "CURRENT_DATE - 30" });
    await expect(confirm(expired, actor)).rejects.toMatchObject({ code: "P0001", message: "offer_expired" });
    // An offer that has not started yet is usable: promoting ahead is the point.
    const future = await insertOffer(ws, { validFrom: "CURRENT_DATE + 10", validUntil: "CURRENT_DATE + 20" });
    expect((await confirm(future, actor)).rows[0].r.kind).toBe("confirmed");
  });

  it("confirm_offer on an already-confirmed revision returns already-confirmed and writes no second audit row", async () => {
    const ws = await workspace();
    const actor = await user();
    const offer = await insertOffer(ws);
    expect((await confirm(offer, actor)).rows[0].r.kind).toBe("confirmed");
    const confirmedAt = (await runtime.query("SELECT confirmed_at FROM offers WHERE id=$1", [offer])).rows[0].confirmed_at;
    expect((await confirm(offer, await user())).rows[0].r).toEqual({ kind: "already-confirmed", offer_id: offer, revision: 1 });
    expect(await auditRows(offer, "offer.confirmed")).toHaveLength(1);
    const after = (await runtime.query("SELECT confirmed_at,confirmed_by FROM offers WHERE id=$1", [offer])).rows[0];
    expect(after.confirmed_at).toEqual(confirmedAt);
    expect(after.confirmed_by).toBe(actor);
  });

  it("offer_is_expired reads the workspace timezone", async () => {
    const east = await workspace("hk", "Pacific/Kiritimati");
    const west = await workspace("hk", "Pacific/Pago_Pago");
    const expired = async (date: string, ws: string) =>
      (await runtime.query("SELECT public.offer_is_expired($1::date,$2) AS e", [date, ws])).rows[0].e as boolean;
    const t = (await runtime.query("SELECT ((now() AT TIME ZONE 'Pacific/Kiritimati')::date - 1)::text AS t")).rows[0].t as string;
    expect(await expired(t, east)).toBe(true);
    expect(await expired(t, west)).toBe(false);
    for (const [tz, ws] of [["Pacific/Kiritimati", east], ["Pacific/Pago_Pago", west]] as const) {
      const today = (await runtime.query("SELECT (now() AT TIME ZONE $1)::date::text AS d", [tz])).rows[0].d as string;
      expect(await expired(today, ws)).toBe(false);
    }
    // An unknown workspace fails closed.
    expect(await expired(t, randomUUID())).toBe(true);
  });

  it("archive_offer cancels only open actions of that offer", async () => {
    const ws = await workspace();
    const actor = await user();
    const offer = await insertOffer(ws);
    const recommended = await insertAction(ws, offer, "recommended");
    const inProgress = await insertAction(ws, offer, "in_progress");
    const completed = await insertAction(ws, offer, "completed");
    const unrelated = await insertAction(ws, null, "recommended");
    const state = async (id: string) => (await runtime.query("SELECT action_state FROM actions WHERE id=$1", [id])).rows[0].action_state;

    const result = (await runtime.query("SELECT public.archive_offer($1,$2) AS r", [offer, actor])).rows[0].r;
    expect(result).toEqual({ kind: "archived", offer_id: offer, cancelled_actions: 2 });
    expect((await runtime.query("SELECT status FROM offers WHERE id=$1", [offer])).rows[0].status).toBe("archived");
    expect(await state(recommended)).toBe("cancelled");
    expect(await state(inProgress)).toBe("cancelled");
    expect(await state(completed)).toBe("completed");
    expect(await state(unrelated)).toBe("recommended");
    const audit = await auditRows(offer, "offer.archived");
    expect(audit).toHaveLength(1);
    expect(audit[0].payload).toEqual({ cancelled_actions: 2 });

    const again = (await runtime.query("SELECT public.archive_offer($1,$2) AS r", [offer, actor])).rows[0].r;
    expect(again.kind).toBe("already-archived");
    expect(await auditRows(offer, "offer.archived")).toHaveLength(1);
    await expect(runtime.query("SELECT public.archive_offer($1,$2)", [randomUUID(), actor])).rejects.toMatchObject({
      code: "P0001",
      message: "offer_not_found",
    });
  });

  it("archive_offer archives a confirmed offer and clears its confirmation", async () => {
    const ws = await workspace();
    const actor = await user();
    const offer = await insertOffer(ws);
    expect((await confirm(offer, actor)).rows[0].r.kind).toBe("confirmed");
    const result = (await runtime.query("SELECT public.archive_offer($1,$2) AS r", [offer, actor])).rows[0].r;
    expect(result).toEqual({ kind: "archived", offer_id: offer, cancelled_actions: 0 });
    // confirmed_at is non-null exactly when status = 'confirmed'; the offer.confirmed audit row keeps the actor.
    expect((await runtime.query("SELECT status,confirmed_at,confirmed_by FROM offers WHERE id=$1", [offer])).rows[0]).toEqual({
      status: "archived",
      confirmed_at: null,
      confirmed_by: null,
    });
    expect(await auditRows(offer, "offer.confirmed")).toHaveLength(1);
  });

  it("deleting an offer referenced by an action fails, deleting the workspace cascades through both", async () => {
    const ws = await workspace();
    const offer = await insertOffer(ws);
    await insertAction(ws, offer, "recommended");
    await expect(runtime.query("DELETE FROM offers WHERE id=$1", [offer])).rejects.toMatchObject({ code: "23503" });
    await runtime.query("DELETE FROM workspaces WHERE id=$1", [ws]);
    expect((await runtime.query("SELECT count(*)::int AS n FROM offers WHERE id=$1", [offer])).rows[0].n).toBe(0);
    expect((await runtime.query("SELECT count(*)::int AS n FROM actions WHERE workspace_id=$1", [ws])).rows[0].n).toBe(0);
  });

  it("runtime-only privileges: the functions are not executable by PUBLIC and the policy matches the other tables", async () => {
    const names = ["offer_is_expired", "confirm_offer", "archive_offer"];
    const rows = (
      await owner.query(
        `SELECT p.proname, p.prosecdef, p.proconfig, has_function_privilege('sme_app_runtime', p.oid, 'EXECUTE') AS runtime_exec,
                (SELECT count(*)::int FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0) AS public_grants
           FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname = ANY($1) ORDER BY p.proname`,
        [names],
      )
    ).rows;
    expect(rows.map((r) => r.proname)).toEqual([...names].sort());
    for (const r of rows) {
      expect(r).toMatchObject({ prosecdef: false, proconfig: ['search_path=""'], runtime_exec: true, public_grants: 0 });
    }
    const policy = (await owner.query("SELECT roles::text[] AS roles, cmd, qual, with_check FROM pg_policies WHERE tablename='offers'")).rows;
    expect(policy).toEqual([{ roles: ["sme_app_runtime"], cmd: "ALL", qual: "true", with_check: "true" }]);
  });

  describe("offerRepository", () => {
    const input = (over: Partial<OfferInput> = {}): OfferInput => ({
      location_id: null,
      title: "Lunch set",
      details: "Soup and a main course",
      terms: "",
      price_amount: 88,
      currency: "HKD",
      valid_from: "2026-10-01",
      valid_until: "2099-12-31",
      claims: ["Halal"],
      prohibited_terms: [],
      asset_id: null,
      ...over,
    });

    it("create reads back through get, converting numeric to number and dates to YYYY-MM-DD", async () => {
      const ws = await workspace();
      const actor = await user();
      const repo = offerRepository(runtime);
      const created = await repo.create(ws, actor, input({ price_amount: 1280.5 }));
      expect(created).toMatchObject({
        workspaceId: ws,
        locationId: null,
        title: "Lunch set",
        priceAmount: 1280.5,
        currency: "HKD",
        validFrom: "2026-10-01",
        validUntil: "2099-12-31",
        claims: ["Halal"],
        status: "draft",
        revision: 1,
        confirmedAt: null,
        expired: false,
      });
      expect(await repo.get(ws, created.id)).toEqual(created);
      expect(await repo.get(await workspace(), created.id)).toBeNull();
    });

    it("update bumps revision, resets to draft, clears confirmation, and reports changed fields", async () => {
      const ws = await workspace();
      const actor = await user();
      const repo = offerRepository(runtime);
      const created = await repo.create(ws, actor, input());
      await repo.confirm(created.id, actor, 1);
      expect((await repo.get(ws, created.id))?.status).toBe("confirmed");

      const result = await repo.update(ws, created.id, 1, input({ title: "Dinner set", price_amount: 88.0, claims: ["Halal", "Fresh"] }));
      expect(result.kind).toBe("updated");
      if (result.kind !== "updated") return;
      expect(result.offer).toMatchObject({ title: "Dinner set", revision: 2, status: "draft", confirmedAt: null, claims: ["Halal", "Fresh"] });
      expect(result.changed).toEqual(["title", "claims"]);
      const row = (await runtime.query("SELECT confirmed_by FROM offers WHERE id=$1", [created.id])).rows[0];
      expect(row.confirmed_by).toBeNull();

      const unchanged = await repo.update(ws, created.id, 2, input({ title: "Dinner set", claims: ["Halal", "Fresh"] }));
      expect(unchanged).toMatchObject({ kind: "updated", changed: [] });
      if (unchanged.kind === "updated") expect(unchanged.offer.revision).toBe(3);
    });

    it("update with a stale revision returns revision_changed and changes nothing", async () => {
      const ws = await workspace();
      const repo = offerRepository(runtime);
      const created = await repo.create(ws, await user(), input());
      expect(await repo.update(ws, created.id, 7, input({ title: "Changed" }))).toEqual({ kind: "revision_changed" });
      expect(await repo.get(ws, created.id)).toEqual(created);
      expect(await repo.update(ws, randomUUID(), 1, input())).toEqual({ kind: "not_found" });
      expect(await repo.update(await workspace(), created.id, 1, input({ title: "Other workspace" }))).toEqual({ kind: "not_found" });
      expect(await repo.get(ws, created.id)).toEqual(created);
    });

    it("update of an archived offer returns archived", async () => {
      const ws = await workspace();
      const actor = await user();
      const repo = offerRepository(runtime);
      const created = await repo.create(ws, actor, input());
      expect(await repo.archive(created.id, actor)).toEqual({ kind: "archived", cancelledActions: 0 });
      expect(await repo.archive(created.id, actor)).toEqual({ kind: "already-archived", cancelledActions: 0 });
      expect(await repo.update(ws, created.id, 1, input({ title: "Changed" }))).toEqual({ kind: "archived" });
      expect((await repo.get(ws, created.id))?.title).toBe("Lunch set");
    });

    it("get returns expired from the database clock", async () => {
      const ws = await workspace();
      const repo = offerRepository(runtime);
      const past = await insertOffer(ws, { validFrom: "CURRENT_DATE - 30", validUntil: "CURRENT_DATE - 2" });
      const future = await insertOffer(ws, { validFrom: "CURRENT_DATE", validUntil: "CURRENT_DATE + 30" });
      expect((await repo.get(ws, past))?.expired).toBe(true);
      expect((await repo.get(ws, future))?.expired).toBe(false);
      expect((await repo.list(ws)).map((o) => [o.id, o.expired]).sort()).toEqual([[future, false], [past, true]].sort());
    });

    it("confirm maps the SQL messages to OfferError and keeps the confirmed shape", async () => {
      const ws = await workspace("hk");
      const actor = await user();
      const repo = offerRepository(runtime);
      const created = await repo.create(ws, actor, input());
      await expect(repo.confirm(created.id, actor, 9)).rejects.toMatchObject({ name: "OfferError", code: "offer_revision_changed" });
      await expect(repo.confirm(randomUUID(), actor, 1)).rejects.toMatchObject({ code: "offer_not_found" });
      expect(await repo.confirm(created.id, actor, 1)).toEqual({ kind: "confirmed", revision: 1 });
      expect(await repo.confirm(created.id, actor, 1)).toEqual({ kind: "already-confirmed", revision: 1 });
      const twd = await repo.create(ws, actor, input({ currency: "TWD" }));
      await expect(repo.confirm(twd.id, actor, 1)).rejects.toMatchObject({ code: "offer_currency_market" });
      const expired = await insertOffer(ws, { validFrom: "CURRENT_DATE - 30", validUntil: "CURRENT_DATE - 2" });
      await expect(repo.confirm(expired, actor, 1)).rejects.toMatchObject({ code: "offer_expired" });
      await repo.archive(created.id, actor);
      await expect(repo.confirm(created.id, actor, 1)).rejects.toMatchObject({ code: "offer_archived" });
    });

    it("archive reports the actions it cancelled", async () => {
      const ws = await workspace();
      const actor = await user();
      const repo = offerRepository(runtime);
      const created = await repo.create(ws, actor, input());
      await insertAction(ws, created.id, "recommended");
      await insertAction(ws, created.id, "completed");
      expect(await repo.archive(created.id, actor)).toEqual({ kind: "archived", cancelledActions: 1 });
    });

    it("scope returns the stored workspace and location by offer id alone, and null for an unknown id", async () => {
      const ws = await workspace();
      const actor = await user();
      const repo = offerRepository(runtime);
      const location = (
        await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'main','Main') RETURNING id", [ws])
      ).rows[0].id as string;
      const wide = await repo.create(ws, actor, input());
      const local = await repo.create(ws, actor, input({ location_id: location }));
      expect(await repo.scope(wide.id)).toEqual({ offerId: wide.id, workspaceId: ws, locationId: null });
      expect(await repo.scope(local.id)).toEqual({ offerId: local.id, workspaceId: ws, locationId: location });
      expect(await repo.scope(randomUUID())).toBeNull();
    });

    it("list returns newest first and only the workspace's rows", async () => {
      const ws = await workspace();
      const other = await workspace();
      const actor = await user();
      const repo = offerRepository(runtime);
      const first = await repo.create(ws, actor, input({ title: "First" }));
      const second = await repo.create(ws, actor, input({ title: "Second" }));
      const third = await repo.create(ws, actor, input({ title: "Third" }));
      await repo.create(other, actor, input({ title: "Elsewhere" }));
      expect((await repo.list(ws)).map((o) => o.id)).toEqual([third.id, second.id, first.id]);
      expect(await repo.list(randomUUID())).toEqual([]);
    });
  });

  describe("createObjective for an offer (P4.1 task 8)", () => {
    const promotionRow = (workspaceId: string, offerId: string) => ({
      workspace_id: workspaceId,
      location_id: null,
      template_key: "offer-instagram-post",
      source: "owner_objective",
      source_finding_keys: [],
      title: { en: "Promote your offer on Instagram", "zh-HK": "在 Instagram 宣傳你的優惠", "zh-TW": "在 Instagram 宣傳你的優惠" },
      summary: { en: "A caption", "zh-HK": "文案", "zh-TW": "文案" },
      evidence: { factType: "Recommended", source: "Owner offer", value: "", detail: { en: "Lunch set", "zh-HK": "Lunch set", "zh-TW": "Lunch set" }, observedAt: "2026-10-01T00:00:00.000Z" },
      priority: "medium",
      priority_score: 50,
      priority_factors: [],
      effort_minutes: 8,
      required_inputs: ["brand_voice"],
      provided_inputs: {},
      action_state: "recommended",
      measurement_state: "not_eligible",
      capability: "Beta",
      dedupe_key: `offer:${offerId}:offer-instagram-post`,
      offer_id: offerId,
    });

    it("concurrent calls with the same offer dedupe key create one row and both return its id", async () => {
      const ws = await workspace();
      const offer = await insertOffer(ws);
      const repo = actionMutationRepository(runtime);
      const results = await Promise.all(Array.from({ length: 6 }, () => repo.createObjective(promotionRow(ws, offer))));
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(results.filter((r) => r.created)).toHaveLength(1);
      const rows = (await runtime.query("SELECT id, offer_id FROM actions WHERE workspace_id=$1", [ws])).rows;
      expect(rows).toEqual([{ id: results[0].id, offer_id: offer }]);
    });

    it("after archive_offer cancels the action, a new call creates a fresh one", async () => {
      const ws = await workspace();
      const actor = await user();
      const offer = await insertOffer(ws);
      const repo = actionMutationRepository(runtime);
      const first = await repo.createObjective(promotionRow(ws, offer));
      expect(first.created).toBe(true);
      await offerRepository(runtime).archive(offer, actor);
      expect((await runtime.query("SELECT action_state FROM actions WHERE id=$1", [first.id])).rows[0].action_state).toBe("cancelled");
      const second = await repo.createObjective(promotionRow(ws, offer));
      expect(second.created).toBe(true);
      expect(second.id).not.toBe(first.id);
    });
  });
});
