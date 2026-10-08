import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { applyMigrations, loadMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

// The repository must use the executor it is given; the default database is never reached.
vi.mock("../../lib/db/client", () => ({
  getPool: () => {
    throw new Error("default_database_forbidden");
  },
}));

import { PublishError, publishingRepository } from "../../lib/repositories/publishing";

// P4.6 migration 0014 (docs/superpowers/specs/2026-10-04-gbp-reply-publish-design.md §1):
// publish columns, begin/finish/cancel functions and once-per-version counting (DEC-14).
describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon GBP reply publishing", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  let actor: string;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
    await owner.query("CREATE ROLE publish_login LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    const url = new URL(fixture.databaseUrl);
    url.username = "publish_login";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, max: 5 });
  });

  afterAll(async () => {
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  async function workspace(tier: "lite" | "paid" = "lite"): Promise<string> {
    return (
      await runtime.query("INSERT INTO workspaces(slug,market,tier) VALUES($1,'hk',$2) RETURNING id", [
        `ws-${randomUUID().slice(0, 8)}`,
        tier,
      ])
    ).rows[0].id as string;
  }

  async function location(ws: string): Promise<string> {
    return (
      await runtime.query("INSERT INTO locations(workspace_id,slug,name,place_id) VALUES($1,$2,'Shop','place-1') RETURNING id", [
        ws,
        `loc-${randomUUID().slice(0, 8)}`,
      ])
    ).rows[0].id as string;
  }

  async function action(ws: string, loc: string | null, offerId: string | null = null): Promise<string> {
    return (
      await runtime.query(
        `INSERT INTO actions(workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,offer_id)
         VALUES($1,$2,'review-response','{}','{}','{}','low',0,'[]',10,'Live',$3,$4) RETURNING id`,
        [ws, loc, `dk-${randomUUID()}`, offerId],
      )
    ).rows[0].id as string;
  }

  async function version(ws: string, act: string, versionNo = 1, meta: Record<string, unknown> = {}): Promise<string> {
    return (
      await runtime.query(
        "INSERT INTO output_versions(workspace_id,action_id,version_no,body,meta,author_type) VALUES($1,$2,$3,$4,$5,'agent') RETURNING id",
        [ws, act, versionNo, `Thank you for visiting, reply ${versionNo}`, JSON.stringify(meta)],
      )
    ).rows[0].id as string;
  }

  const approve = async (versionId: string) =>
    (await runtime.query("SELECT public.approve_output_version($1,$2,$3) AS r", [versionId, actor, null])).rows[0].r;

  // A lite workspace (allowance 3) with a location, a review-response action and an approved v1.
  async function seed(tier: "lite" | "paid" = "lite") {
    const ws = await workspace(tier);
    const loc = await location(ws);
    const act = await action(ws, loc);
    const ver = await version(ws, act);
    await approve(ver);
    return { ws, loc, act, ver };
  }

  const target = () => `accounts/111/locations/222/reviews/${randomUUID()}`;
  const begin = async (versionId: string, targetRef = target(), key = randomUUID()) =>
    (await runtime.query("SELECT public.begin_publish_output_version($1,$2,$3,$4) AS r", [versionId, actor, targetRef, key])).rows[0].r;
  const finish = async (
    deliveryId: string,
    outcome: string,
    receipt: Record<string, unknown> | null = null,
    reason: string | null = null,
  ) =>
    (
      await runtime.query("SELECT public.finish_publish_output_version($1,$2,$3,$4,$5) AS r", [
        deliveryId,
        actor,
        outcome,
        receipt === null ? null : JSON.stringify(receipt),
        reason,
      ])
    ).rows[0].r;
  const cancel = async (deliveryId: string) =>
    (await runtime.query("SELECT public.cancel_published_reply($1,$2) AS r", [deliveryId, actor])).rows[0].r;
  const exportVersion = async (versionId: string, key = randomUUID()) =>
    (await runtime.query("SELECT public.export_output_version($1,$2,'export',$3) AS r", [versionId, actor, key])).rows[0].r;
  const receipt = (targetRef: string) => ({ review_name: targetRef, reply_update_time: "2026-10-04T08:00:00Z" });
  const publishOk = async (versionId: string, targetRef = target()) => {
    const started = await begin(versionId, targetRef);
    return { started, finished: await finish(started.delivery_id, "published", receipt(targetRef)) };
  };

  const usage = async (ws: string) =>
    (await runtime.query("SELECT COALESCE(SUM(approved_deliveries),0)::int AS n FROM workspace_usage WHERE workspace_id=$1", [ws]))
      .rows[0].n as number;
  const versionRow = async (id: string) =>
    (
      await runtime.query(
        "SELECT approval_state,delivery_state,first_exported_at,first_published_at FROM output_versions WHERE id=$1",
        [id],
      )
    ).rows[0];
  const delivery = async (id: string) => (await runtime.query("SELECT * FROM deliveries WHERE id=$1", [id])).rows[0];
  const period = "to_char(now() at time zone 'Asia/Hong_Kong', 'YYYY-MM')";

  it("before 0014, publishDeliveryIds and getDelivery read only pre-0014 columns", async () => {
    const migrations = await loadMigrations();
    const before = migrations.filter((m) => m.name < "0014_publish_reply.sql");
    expect(before.at(-1)?.name).toBe("0013_preview_events.sql");
    expect(await applyMigrations(owner, before)).toHaveLength(13);
    actor = (await runtime.query("INSERT INTO app_users(email) VALUES('publish@example.test') RETURNING id")).rows[0].id;

    const { ws, ver } = await seed();
    const exported = await exportVersion(ver);
    const repo = publishingRepository(runtime);
    expect(await repo.publishDeliveryIds(ws, [ver])).toEqual([]);
    expect(await repo.getDelivery(exported.delivery_id)).toBeNull();
    expect(await repo.getDelivery(randomUUID())).toBeNull();
  });

  it("0014 applies after 0013 and a second applyMigrations returns []", async () => {
    const through0014 = (await loadMigrations()).filter(m => m.name <= "0014_publish_reply.sql");
    expect(await applyMigrations(owner, through0014)).toEqual(["0014_publish_reply.sql"]);
    expect(await applyMigrations(owner)).toEqual(["0015_action_list_indexes.sql"]);
    expect(await applyMigrations(owner)).toEqual([]);
  });

  it("begin on an approved version returns begun, sets the version delivery_state publishing and does not touch workspace_usage", async () => {
    const { ws, ver } = await seed();
    const ref = target();
    const key = randomUUID();
    const started = await begin(ver, ref, key);
    expect(started).toEqual({ kind: "begun", delivery_id: expect.any(String), state: "publishing" });
    expect((await versionRow(ver)).delivery_state).toBe("publishing");
    expect(await usage(ws)).toBe(0);
    expect(await delivery(started.delivery_id)).toMatchObject({
      workspace_id: ws,
      version_id: ver,
      mode: "publish",
      channel: "google_business",
      state: "publishing",
      counted: false,
      idempotency_key: key,
      payload: { version_no: 1 },
      created_by: actor,
      target_ref: ref,
      provider_receipt: null,
      failure_reason: null,
      verified_at: null,
    });
    const events = (
      await runtime.query("SELECT event, actor_id, payload FROM audit_events WHERE entity_id=$1", [started.delivery_id])
    ).rows;
    expect(events).toEqual([
      {
        event: "delivery.publish_started",
        actor_id: actor,
        payload: { version_no: 1, version_id: ver, action_id: expect.any(String), idempotency_key: key },
      },
    ]);
  });

  it("begin with the same idempotency key returns existing with the same delivery id", async () => {
    const { ver } = await seed();
    const ref = target();
    const key = randomUUID();
    const first = await begin(ver, ref, key);
    expect(await begin(ver, ref, key)).toEqual({ kind: "existing", delivery_id: first.delivery_id, state: "publishing" });
    expect((await runtime.query("SELECT count(*)::int AS n FROM deliveries WHERE version_id=$1", [ver])).rows[0].n).toBe(1);
  });

  it("begin on a draft returns not_approved; a second begin for a version with an active publish returns already_publishing", async () => {
    const ws = await workspace();
    const act = await action(ws, await location(ws));
    const draft = await version(ws, act);
    await expect(begin(draft)).rejects.toMatchObject({ code: "P0001", message: "not_approved" });
    await expect(begin(randomUUID())).rejects.toMatchObject({ code: "P0001", message: "version_not_found" });

    const { ver } = await seed();
    const first = await begin(ver);
    await expect(begin(ver)).rejects.toMatchObject({ code: "P0001", message: "already_publishing", detail: first.delivery_id });
    await finish(first.delivery_id, "published", receipt("x"));
    await expect(begin(ver)).rejects.toMatchObject({ code: "P0001", message: "already_publishing", detail: first.delivery_id });
  });

  it("begin for a target already published by another version returns target_busy", async () => {
    const { ws, loc, ver } = await seed();
    const ref = target();
    await publishOk(ver, ref);
    const other = await version(ws, await action(ws, loc));
    await approve(other);
    await expect(begin(other, ref)).rejects.toMatchObject({ code: "P0001", message: "target_busy" });
  });

  it("begin applies the offer guard", async () => {
    const ws = await workspace();
    const offer = (
      await runtime.query(
        "INSERT INTO offers(workspace_id,title,details,valid_from,valid_until) VALUES($1,'Lunch set','Soup and a main',CURRENT_DATE - 1,CURRENT_DATE + 30) RETURNING id",
        [ws],
      )
    ).rows[0].id as string;
    await runtime.query("SELECT public.confirm_offer($1,$2,1)", [offer, actor]);
    const act = await action(ws, null, offer);
    const ver = await version(ws, act, 1, { offer_id: offer, offer_revision: 1 });
    await approve(ver);
    await runtime.query("UPDATE offers SET status='draft', confirmed_at=NULL, confirmed_by=NULL WHERE id=$1", [offer]);
    await expect(begin(ver)).rejects.toMatchObject({ code: "P0001", message: "offer_inactive" });
  });

  it("two parallel begins for one version: exactly one begun", async () => {
    const { ver } = await seed();
    const results = await Promise.allSettled([begin(ver), begin(ver)]);
    const begun = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r) => r.status === "rejected");
    expect(begun).toHaveLength(1);
    expect((begun[0] as PromiseFulfilledResult<{ kind: string }>).value.kind).toBe("begun");
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason).toMatchObject({ code: "P0001", message: "already_publishing" });
    expect((await runtime.query("SELECT count(*)::int AS n FROM deliveries WHERE version_id=$1", [ver])).rows[0].n).toBe(1);
  });

  it("begin raises allowance_exceeded when approved_deliveries = allowance and the version never counted; it does not raise when the version was already exported", async () => {
    const { ws, ver } = await seed();
    await runtime.query(`INSERT INTO workspace_usage(workspace_id,period,approved_deliveries,allowance) VALUES($1,${period},3,3)`, [ws]);
    await expect(begin(ver)).rejects.toMatchObject({ code: "P0001", message: "allowance_exceeded" });
    expect(await usage(ws)).toBe(3);
    expect((await runtime.query("SELECT count(*)::int AS n FROM deliveries WHERE version_id=$1", [ver])).rows[0].n).toBe(0);
    expect((await versionRow(ver)).delivery_state).toBe("export_ready");

    const second = await seed();
    await exportVersion(second.ver);
    await runtime.query(`UPDATE workspace_usage SET approved_deliveries=3 WHERE workspace_id=$1 AND period=${period}`, [second.ws]);
    expect((await begin(second.ver)).kind).toBe("begun");
    expect(await usage(second.ws)).toBe(3);
  });

  it("finish published counts once: counted true, approved_deliveries +1, verified_at set, first_published_at set, delivery_state published", async () => {
    const { ws, ver } = await seed();
    const ref = target();
    const started = await begin(ver, ref);
    expect(await finish(started.delivery_id, "published", receipt(ref))).toEqual({ kind: "finished", state: "published", counted: true });
    expect(await usage(ws)).toBe(1);
    expect(await delivery(started.delivery_id)).toMatchObject({
      state: "published",
      counted: true,
      verified_at: expect.any(Date),
      provider_receipt: receipt(ref),
      failure_reason: null,
    });
    expect(await versionRow(ver)).toMatchObject({ delivery_state: "published", first_published_at: expect.any(Date), first_exported_at: null });
    const events = (await runtime.query("SELECT event, payload FROM audit_events WHERE entity_id=$1 ORDER BY id", [started.delivery_id])).rows;
    expect(events.map((e) => e.event)).toEqual(["delivery.publish_started", "delivery.published"]);
    expect(events[1].payload).toMatchObject({ counted: true, version_id: ver });
  });

  it("finish failed stores failure_reason, counts nothing, and restores delivery_state to export_ready (or exported when first_exported_at is set)", async () => {
    const { ws, ver } = await seed();
    const started = await begin(ver);
    expect(await finish(started.delivery_id, "failed", null, "provider_forbidden")).toEqual({
      kind: "finished",
      state: "failed",
      counted: false,
    });
    expect(await delivery(started.delivery_id)).toMatchObject({ state: "failed", counted: false, failure_reason: "provider_forbidden", verified_at: null });
    expect(await versionRow(ver)).toMatchObject({ delivery_state: "export_ready", first_published_at: null });
    expect(await usage(ws)).toBe(0);
    expect(
      (await runtime.query("SELECT payload FROM audit_events WHERE entity_id=$1 AND event='delivery.publish_failed'", [started.delivery_id]))
        .rows[0].payload,
    ).toMatchObject({ reason: "provider_forbidden" });

    const exported = await seed();
    await exportVersion(exported.ver);
    const again = await begin(exported.ver);
    await finish(again.delivery_id, "failed", null, "timeout");
    expect((await versionRow(exported.ver)).delivery_state).toBe("exported");
    expect(await usage(exported.ws)).toBe(1);
  });

  it("finish refuses invalid outcomes and deliveries that are not publishing", async () => {
    const { ver } = await seed();
    const started = await begin(ver);
    await expect(finish(started.delivery_id, "maybe")).rejects.toMatchObject({ code: "P0001", message: "invalid_outcome" });
    await expect(finish(randomUUID(), "published")).rejects.toMatchObject({ code: "P0001", message: "delivery_not_publishing" });
    const exported = await exportVersion((await seed()).ver);
    await expect(finish(exported.delivery_id, "published")).rejects.toMatchObject({ code: "P0001", message: "delivery_not_publishing" });
  });

  it("a second finish on a finished delivery returns existing and changes nothing", async () => {
    const { ws, ver } = await seed();
    const ref = target();
    const started = await begin(ver, ref);
    await finish(started.delivery_id, "published", receipt(ref));
    const before = { delivery: await delivery(started.delivery_id), version: await versionRow(ver), usage: await usage(ws) };
    expect(await finish(started.delivery_id, "failed", null, "timeout")).toEqual({ kind: "existing", state: "published", counted: true });
    expect(await finish(started.delivery_id, "published", receipt(ref))).toEqual({ kind: "existing", state: "published", counted: true });
    expect({ delivery: await delivery(started.delivery_id), version: await versionRow(ver), usage: await usage(ws) }).toEqual(before);

    const failed = await begin((await seed()).ver);
    await finish(failed.delivery_id, "failed", null, "timeout");
    expect(await finish(failed.delivery_id, "published", receipt("x"))).toEqual({ kind: "existing", state: "failed", counted: false });
  });

  describe("DEC-14: a version counts exactly once", () => {
    it("export then publish", async () => {
      const { ws, ver } = await seed();
      expect((await exportVersion(ver)).counted).toBe(true);
      const { finished } = await publishOk(ver);
      expect(finished).toEqual({ kind: "finished", state: "published", counted: false });
      expect(await usage(ws)).toBe(1);
      expect((await versionRow(ver)).delivery_state).toBe("published");
    });

    it("publish then export", async () => {
      const { ws, ver } = await seed();
      expect((await publishOk(ver)).finished.counted).toBe(true);
      expect((await exportVersion(ver)).counted).toBe(false);
      expect(await usage(ws)).toBe(1);
    });

    it("failed publish then export", async () => {
      const { ws, ver } = await seed();
      const started = await begin(ver);
      await finish(started.delivery_id, "failed", null, "timeout");
      expect((await exportVersion(ver)).counted).toBe(true);
      expect(await usage(ws)).toBe(1);
    });

    it("publish, cancel, publish again", async () => {
      const { ws, ver } = await seed();
      const ref = target();
      const first = await publishOk(ver, ref);
      expect(first.finished.counted).toBe(true);
      await cancel(first.started.delivery_id);
      const second = await publishOk(ver, ref);
      expect(second.started.kind).toBe("begun");
      expect(second.finished).toEqual({ kind: "finished", state: "published", counted: false });
      expect(await usage(ws)).toBe(1);
    });
  });

  it("export of a published version keeps delivery_state published and returns counted false", async () => {
    const { ws, ver } = await seed();
    await publishOk(ver);
    const exported = await exportVersion(ver);
    expect(exported).toEqual({ kind: "exported", delivery_id: expect.any(String), version_id: ver, counted: false, state: "exported" });
    expect(await versionRow(ver)).toMatchObject({ delivery_state: "published", first_exported_at: expect.any(Date) });
    expect((await delivery(exported.delivery_id)).counted).toBe(false);
    expect(
      (await runtime.query("SELECT payload FROM audit_events WHERE entity_id=$1", [exported.delivery_id])).rows[0].payload,
    ).toMatchObject({ counted: false });
    expect(await usage(ws)).toBe(1);
  });

  it("cancel on published sets cancelled, keeps counted and first_published_at, refunds nothing; cancel on publishing raises delivery_not_published", async () => {
    const { ws, ver } = await seed();
    const { started } = await publishOk(ver);
    const publishedAt = (await versionRow(ver)).first_published_at;
    expect(await cancel(started.delivery_id)).toMatchObject({ state: "cancelled" });
    expect(await delivery(started.delivery_id)).toMatchObject({ state: "cancelled", counted: true });
    expect(await versionRow(ver)).toMatchObject({ delivery_state: "cancelled", first_published_at: publishedAt });
    expect(await usage(ws)).toBe(1);
    expect(
      (await runtime.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1 AND event='delivery.publish_cancelled'", [started.delivery_id]))
        .rows[0].n,
    ).toBe(1);
    await expect(cancel(started.delivery_id)).rejects.toMatchObject({ code: "P0001", message: "delivery_not_published" });

    const exported = await seed();
    await exportVersion(exported.ver);
    const published = await publishOk(exported.ver);
    await cancel(published.started.delivery_id);
    expect((await versionRow(exported.ver)).delivery_state).toBe("exported");

    const pending = await begin((await seed()).ver);
    await expect(cancel(pending.delivery_id)).rejects.toMatchObject({ code: "P0001", message: "delivery_not_published" });
  });

  it("the four functions are SECURITY INVOKER with search_path '' and EXECUTE for sme_app_runtime only", async () => {
    const names = ["begin_publish_output_version", "cancel_published_reply", "export_output_version", "finish_publish_output_version"];
    const rows = (
      await owner.query(
        `SELECT p.proname, p.prosecdef, p.proconfig, has_function_privilege('sme_app_runtime', p.oid, 'EXECUTE') AS runtime_exec,
                ARRAY(SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END
                        FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner) AS grantees
           FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname = ANY($1) ORDER BY p.proname`,
        [names],
      )
    ).rows;
    expect(rows.map((r) => r.proname)).toEqual(names);
    for (const r of rows) {
      expect(r).toMatchObject({ prosecdef: false, proconfig: ['search_path=""'], runtime_exec: true, grantees: ["sme_app_runtime"] });
    }
  });

  it("a publish delivery without target_ref violates deliveries_publish_target_check", async () => {
    const { ws, ver } = await seed();
    await expect(
      runtime.query(
        "INSERT INTO deliveries(workspace_id,version_id,mode,state,idempotency_key) VALUES($1,$2,'publish','publishing',$3)",
        [ws, ver, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: "23514", constraint: "deliveries_publish_target_check" });
  });

  describe("publishingRepository", () => {
    it("parallel begins of two versions on one target: one begun, the other target_busy (a raced 23505 maps too)", async () => {
      const { ws, loc } = await seed("paid");
      const approvedVersion = async () => {
        const id = await version(ws, await action(ws, loc));
        await approve(id);
        return id;
      };
      const repo = publishingRepository(runtime);
      // Several rounds so both paths are likely exercised: the function's own
      // check (P0001) and the index backstop when both pass it (23505).
      for (let round = 0; round < 5; round += 1) {
        const refTarget = target();
        const [a, b] = [await approvedVersion(), await approvedVersion()];
        const results = await Promise.allSettled([
          repo.begin({ versionId: a, actorId: actor, targetRef: refTarget, idempotencyKey: randomUUID() }),
          repo.begin({ versionId: b, actorId: actor, targetRef: refTarget, idempotencyKey: randomUUID() }),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
        expect(refused.reason).toBeInstanceOf(PublishError);
        expect(refused.reason).toMatchObject({ code: "target_busy" });
      }
    });

    it("begin, finish and cancel map the function results", async () => {
      const { ws, ver } = await seed();
      const repo = publishingRepository(runtime);
      const ref = target();
      const key = randomUUID();
      const started = await repo.begin({ versionId: ver, actorId: actor, targetRef: ref, idempotencyKey: key });
      expect(started).toEqual({ kind: "begun", deliveryId: expect.any(String), state: "publishing" });
      expect(await repo.begin({ versionId: ver, actorId: actor, targetRef: ref, idempotencyKey: key })).toEqual({
        kind: "existing",
        deliveryId: started.deliveryId,
        state: "publishing",
      });
      const done = { review_name: ref, reply_update_time: null };
      expect(await repo.finish({ deliveryId: started.deliveryId, actorId: actor, outcome: "published", receipt: done, reason: null })).toEqual({
        kind: "finished",
        state: "published",
        counted: true,
      });
      expect(await repo.finish({ deliveryId: started.deliveryId, actorId: actor, outcome: "failed", receipt: null, reason: "provider_unavailable" })).toEqual({
        kind: "existing",
        state: "published",
        counted: true,
      });
      expect((await delivery(started.deliveryId)).provider_receipt).toEqual(done);
      expect(await repo.cancel({ deliveryId: started.deliveryId, actorId: actor })).toEqual({ state: "cancelled" });
      expect(await usage(ws)).toBe(1);
    });

    it("maps P0001 messages to PublishError and rethrows other errors unchanged", async () => {
      const { ver } = await seed();
      const repo = publishingRepository(runtime);
      const ref = target();
      const first = await repo.begin({ versionId: ver, actorId: actor, targetRef: ref, idempotencyKey: randomUUID() });
      const refused = await repo
        .begin({ versionId: ver, actorId: actor, targetRef: target(), idempotencyKey: randomUUID() })
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(PublishError);
      expect(refused).toMatchObject({ code: "already_publishing", deliveryId: first.deliveryId });
      await expect(repo.cancel({ deliveryId: first.deliveryId, actorId: actor })).rejects.toMatchObject({
        code: "delivery_not_published",
      });
      await expect(
        repo.finish({ deliveryId: randomUUID(), actorId: actor, outcome: "published", receipt: null, reason: null }),
      ).rejects.toBeInstanceOf(PublishError);
      const raw = await repo
        .begin({ versionId: "not-a-uuid", actorId: actor, targetRef: target(), idempotencyKey: randomUUID() })
        .catch((error: unknown) => error);
      expect(raw).not.toBeInstanceOf(PublishError);
      expect(raw).toMatchObject({ code: "22P02" });
    });

    it("getDelivery returns the joined publish delivery, and null for an export delivery or an unknown id", async () => {
      const { ws, loc, act, ver } = await seed();
      const repo = publishingRepository(runtime);
      const ref = target();
      const started = await begin(ver, ref);
      const read = await repo.getDelivery(started.delivery_id);
      expect(read).toEqual({
        id: started.delivery_id,
        workspaceId: ws,
        versionId: ver,
        actionId: act,
        locationId: loc,
        templateKey: "review-response",
        versionNo: 1,
        body: "Thank you for visiting, reply 1",
        state: "publishing",
        targetRef: ref,
        counted: false,
        failureReason: null,
        verifiedAt: null,
        createdAt: expect.any(String),
      });
      expect(Number.isNaN(Date.parse(read!.createdAt))).toBe(false);
      await finish(started.delivery_id, "published", receipt(ref));
      expect(await repo.getDelivery(started.delivery_id)).toMatchObject({ state: "published", counted: true, verifiedAt: expect.any(String) });

      const exported = await exportVersion(ver);
      expect(await repo.getDelivery(exported.delivery_id)).toBeNull();
      expect(await repo.getDelivery(randomUUID())).toBeNull();
    });

    it("publishDeliveryIds lists only publish deliveries of the given versions in the workspace", async () => {
      const { ws, ver } = await seed();
      const other = await seed();
      const repo = publishingRepository(runtime);
      await exportVersion(ver);
      const failed = await begin(ver);
      await finish(failed.delivery_id, "failed", null, "timeout");
      const active = await begin(ver);
      await begin(other.ver);
      const rows = await repo.publishDeliveryIds(ws, [ver, other.ver]);
      expect(rows).toEqual([
        { id: failed.delivery_id, versionId: ver, state: "failed", createdAt: expect.any(String) },
        { id: active.delivery_id, versionId: ver, state: "publishing", createdAt: expect.any(String) },
      ]);
      expect(await repo.publishDeliveryIds(ws, [])).toEqual([]);
    });

    it("activeGbpConnection, storeRefreshedToken and markConnectionExpired touch only the active google_gbp row", async () => {
      const ws = await workspace();
      const repo = publishingRepository(runtime);
      expect(await repo.activeGbpConnection(ws)).toBeNull();

      const insert = async (status: string) =>
        (
          await runtime.query(
            `INSERT INTO oauth_connections(workspace_id,provider,access_token_encrypted,refresh_token_encrypted,scopes,expires_at,status)
             VALUES($1,'google_gbp',$2,$3,$4,$5,$6) RETURNING id`,
            [ws, `sealed-access-${status}`, `sealed-refresh-${status}`, ["scope-a", "scope-b"], "2026-10-04T08:00:00Z", status],
          )
        ).rows[0].id as string;
      const revoked = await insert("revoked");
      const active = await insert("active");

      expect(await repo.activeGbpConnection(ws)).toEqual({
        id: active,
        accessTokenEncrypted: "sealed-access-active",
        refreshTokenEncrypted: "sealed-refresh-active",
        scopes: ["scope-a", "scope-b"],
        expiresAt: "2026-10-04T08:00:00.000Z",
      });

      const row = async (id: string) =>
        (await runtime.query("SELECT access_token_encrypted,refresh_token_encrypted,expires_at,status FROM oauth_connections WHERE id=$1", [id])).rows[0];

      await repo.storeRefreshedToken({ connectionId: active, workspaceId: ws, accessTokenEncrypted: "sealed-new", expiresAt: "2026-10-04T09:00:00Z" });
      expect(await row(active)).toMatchObject({
        access_token_encrypted: "sealed-new",
        refresh_token_encrypted: "sealed-refresh-active",
        status: "active",
      });
      expect((await row(active)).expires_at.toISOString()).toBe("2026-10-04T09:00:00.000Z");

      // A non-active row is never refreshed or marked.
      await repo.storeRefreshedToken({ connectionId: revoked, workspaceId: ws, accessTokenEncrypted: "sealed-other", expiresAt: null });
      await repo.markConnectionExpired(revoked);
      expect(await row(revoked)).toMatchObject({ access_token_encrypted: "sealed-access-revoked", status: "revoked" });

      await repo.markConnectionExpired(active);
      expect((await row(active)).status).toBe("expired");
      expect(await repo.activeGbpConnection(ws)).toBeNull();
      // Once expired it stays expired: a late refresh cannot revive it.
      await repo.storeRefreshedToken({ connectionId: active, workspaceId: ws, accessTokenEncrypted: "sealed-late", expiresAt: null });
      expect(await row(active)).toMatchObject({ access_token_encrypted: "sealed-new", status: "expired" });
    });
  });
});
