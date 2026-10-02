import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withTransaction } from "../../lib/db/transaction";
import { actionRunRepository, artifactRepository } from "../../lib/repositories/artifacts";
import { createAssistantVersion, createVersion } from "../../lib/workspace/versions";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

// P4.1 (docs/superpowers/specs/2026-10-01-offers-promotion-copy-design.md 1.3, 1.4): approve and
// export refuse a version of an offer action whose recorded offer revision is no longer the
// confirmed, unexpired one. Everything else about approve/export (counting, usage, idempotency,
// return shapes) is unchanged from 0004.
describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon offer freshness on approve and export", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  let actor: string;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
    await applyMigrations(owner);
    await owner.query("CREATE ROLE freshness_login LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    const url = new URL(fixture.databaseUrl);
    url.username = "freshness_login";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, max: 5 });
    actor = (await runtime.query("INSERT INTO app_users(email) VALUES('freshness@example.test') RETURNING id")).rows[0].id;
  });

  afterAll(async () => {
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  async function workspace(timezone = "Asia/Hong_Kong"): Promise<string> {
    return (
      await runtime.query("INSERT INTO workspaces(slug,market,timezone) VALUES($1,'hk',$2) RETURNING id", [
        `ws-${randomUUID().slice(0, 8)}`,
        timezone,
      ])
    ).rows[0].id as string;
  }

  // A confirmed offer at revision 1, valid for the next 30 days.
  async function confirmedOffer(ws: string): Promise<string> {
    const id = (
      await runtime.query(
        "INSERT INTO offers(workspace_id,title,details,valid_from,valid_until) VALUES($1,'Lunch set','Soup and a main course',CURRENT_DATE - 1,CURRENT_DATE + 30) RETURNING id",
        [ws],
      )
    ).rows[0].id as string;
    await runtime.query("SELECT public.confirm_offer($1,$2,1)", [id, actor]);
    return id;
  }

  async function action(ws: string, offerId: string | null): Promise<string> {
    return (
      await runtime.query(
        `INSERT INTO actions(workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,offer_id)
         VALUES($1,'offer-instagram-post','{}','{}','{}','low',0,'[]',5,'Beta',$2,$3) RETURNING id`,
        [ws, `dk-${randomUUID()}`, offerId],
      )
    ).rows[0].id as string;
  }

  // Inserted directly: meta is exactly what the caller passes, including malformed revisions.
  async function version(ws: string, actionId: string, meta: Record<string, unknown>, versionNo = 1): Promise<string> {
    return (
      await runtime.query(
        "INSERT INTO output_versions(workspace_id,action_id,version_no,body,meta,author_type) VALUES($1,$2,$3,$4,$5,'agent') RETURNING id",
        [ws, actionId, versionNo, `Body ${versionNo}`, JSON.stringify(meta)],
      )
    ).rows[0].id as string;
  }

  // One offer action with one version that records offer revision 1.
  async function offerVersion(timezone?: string) {
    const ws = await workspace(timezone);
    const offer = await confirmedOffer(ws);
    const act = await action(ws, offer);
    const ver = await version(ws, act, { offer_id: offer, offer_revision: 1 });
    return { ws, offer, act, ver };
  }

  const approve = async (versionId: string) =>
    (await runtime.query("SELECT public.approve_output_version($1,$2,$3) AS r", [versionId, actor, null])).rows[0].r;
  const exportVersion = async (versionId: string, key = randomUUID()) =>
    (await runtime.query("SELECT public.export_output_version($1,$2,'export',$3) AS r", [versionId, actor, key])).rows[0].r;

  // An edit returns the offer to draft at the next revision; re-confirming makes it current again.
  async function editAndReconfirm(offerId: string, db: Pick<Pool, "query"> = runtime) {
    await db.query(
      "UPDATE offers SET revision = 2, title = 'Lunch set (new)', status = 'draft', confirmed_at = NULL, confirmed_by = NULL WHERE id=$1",
      [offerId],
    );
    await db.query("SELECT public.confirm_offer($1,$2,2)", [offerId, actor]);
  }

  // valid_until = yesterday in the workspace's own time zone.
  async function expire(offerId: string, timezone: string) {
    await runtime.query(
      "UPDATE offers SET valid_from = (now() AT TIME ZONE $2)::date - 10, valid_until = (now() AT TIME ZONE $2)::date - 1 WHERE id=$1",
      [offerId, timezone],
    );
  }

  const versionRow = async (id: string) =>
    (await runtime.query("SELECT approval_state,delivery_state,first_exported_at FROM output_versions WHERE id=$1", [id])).rows[0];
  const deliveries = async (id: string) =>
    (await runtime.query("SELECT * FROM deliveries WHERE version_id=$1 ORDER BY created_at,id", [id])).rows;
  const usage = async (ws: string) =>
    (await runtime.query("SELECT COALESCE(SUM(approved_deliveries),0)::int AS n FROM workspace_usage WHERE workspace_id=$1", [ws]))
      .rows[0].n as number;

  it("approves a version that records the current confirmed revision", async () => {
    const { ver } = await offerVersion();
    expect((await approve(ver)).kind).toBe("approved");
  });

  it("approve refuses offer_changed after an edit", async () => {
    const { offer, ver } = await offerVersion();
    await editAndReconfirm(offer);
    await expect(approve(ver)).rejects.toMatchObject({ code: "P0001", message: "offer_changed" });
    expect((await versionRow(ver)).approval_state).toBe("draft");
    expect((await runtime.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1", [ver])).rows[0].n).toBe(0);
  });

  it("approve refuses a version with no offer_revision on an offer action", async () => {
    const ws = await workspace();
    const offer = await confirmedOffer(ws);
    const act = await action(ws, offer);
    const cases: Array<Record<string, unknown>> = [
      { offer_id: offer },
      {},
      { offer_id: offer, offer_revision: "1" },
      { offer_id: offer, offer_revision: 1.5 },
      { offer_id: offer, offer_revision: null },
      { offer_id: offer, offer_revision: [1] },
    ];
    let no = 1;
    for (const meta of cases) {
      const ver = await version(ws, act, meta, no++);
      await expect(approve(ver), JSON.stringify(meta)).rejects.toMatchObject({ code: "P0001", message: "offer_changed" });
    }
  });

  it("approve refuses offer_inactive for a draft offer and after archive_offer", async () => {
    const draft = await offerVersion();
    await runtime.query("UPDATE offers SET revision = 2, status = 'draft', confirmed_at = NULL WHERE id=$1", [draft.offer]);
    await expect(approve(draft.ver)).rejects.toMatchObject({ code: "P0001", message: "offer_inactive" });

    const archived = await offerVersion();
    await runtime.query("SELECT public.archive_offer($1,$2)", [archived.offer, actor]);
    await expect(approve(archived.ver)).rejects.toMatchObject({ code: "P0001", message: "offer_inactive" });
  });

  it("approve refuses offer_expired once valid_until is yesterday in the workspace's timezone", async () => {
    // UTC+14: the workspace's yesterday is often the UTC today, so a UTC comparison would miss it.
    const tz = "Pacific/Kiritimati";
    const { offer, ver } = await offerVersion(tz);
    await expire(offer, tz);
    await expect(approve(ver)).rejects.toMatchObject({ code: "P0001", message: "offer_expired" });
    // The whole of the workspace's valid_until day is still usable.
    await runtime.query("UPDATE offers SET valid_until = (now() AT TIME ZONE $2)::date WHERE id=$1", [offer, tz]);
    expect((await approve(ver)).kind).toBe("approved");
  });

  it("export refuses the same three ways and leaves usage and deliveries untouched", async () => {
    const changed = await offerVersion();
    await approve(changed.ver);
    await editAndReconfirm(changed.offer);
    await expect(exportVersion(changed.ver)).rejects.toMatchObject({ code: "P0001", message: "offer_changed" });

    const archived = await offerVersion();
    await approve(archived.ver);
    await runtime.query("SELECT public.archive_offer($1,$2)", [archived.offer, actor]);
    await expect(exportVersion(archived.ver)).rejects.toMatchObject({ code: "P0001", message: "offer_inactive" });

    const tz = "Pacific/Kiritimati";
    const expired = await offerVersion(tz);
    await approve(expired.ver);
    await expire(expired.offer, tz);
    await expect(exportVersion(expired.ver)).rejects.toMatchObject({ code: "P0001", message: "offer_expired" });

    for (const c of [changed, archived, expired]) {
      expect(await deliveries(c.ver)).toEqual([]);
      expect(await usage(c.ws)).toBe(0);
      expect(await versionRow(c.ver)).toMatchObject({ delivery_state: "export_ready", first_exported_at: null });
    }
  });

  it("a retried export with an already-used idempotency key returns existing even after the offer changed", async () => {
    const { ws, offer, ver } = await offerVersion();
    await approve(ver);
    const key = randomUUID();
    const first = await exportVersion(ver, key);
    expect(first).toMatchObject({ kind: "exported", counted: true });
    await editAndReconfirm(offer);
    expect(await exportVersion(ver, key)).toEqual({
      kind: "existing",
      delivery_id: first.delivery_id,
      version_id: ver,
      counted: false,
      state: "exported",
    });
    // A fresh key is a new export, which the stale version may no longer make.
    await expect(exportVersion(ver)).rejects.toMatchObject({ message: "offer_changed" });
    expect(await usage(ws)).toBe(1);
    expect(await deliveries(ver)).toHaveLength(1);
  });

  it("two channel versions approved and exported count 2; exporting one version twice counts once", async () => {
    const ws = await workspace();
    const offer = await confirmedOffer(ws);
    const instagram = await version(ws, await action(ws, offer), { offer_id: offer, offer_revision: 1 });
    const google = await version(ws, await action(ws, offer), { offer_id: offer, offer_revision: 1 });
    await approve(instagram);
    await approve(google);
    expect((await exportVersion(instagram)).counted).toBe(true);
    expect((await exportVersion(google)).counted).toBe(true);
    expect(await usage(ws)).toBe(2);
    expect((await exportVersion(instagram)).counted).toBe(false);
    expect(await usage(ws)).toBe(2);
    expect(await deliveries(instagram)).toHaveLength(2);
  });

  it("an exported version's body, meta and deliveries are unchanged after the offer is edited", async () => {
    const { offer, ver } = await offerVersion();
    await approve(ver);
    await exportVersion(ver);
    const snapshot = async () => ({
      version: (await runtime.query("SELECT * FROM output_versions WHERE id=$1", [ver])).rows[0],
      deliveries: await deliveries(ver),
    });
    const before = await snapshot();
    await editAndReconfirm(offer);
    await runtime.query("UPDATE offers SET details = 'Changed details' WHERE id=$1", [offer]);
    await runtime.query("SELECT public.archive_offer($1,$2)", [offer, actor]);
    expect(await snapshot()).toEqual(before);
    expect(before.version.meta).toEqual({ offer_id: offer, offer_revision: 1 });
  });

  it("a non-offer action approves and exports exactly as before", async () => {
    const ws = await workspace();
    const act = await action(ws, null);
    // Offer-shaped meta on an unbound action is ignored: only actions.offer_id binds a version.
    const ver = await version(ws, act, { offer_revision: "stale", offer_id: randomUUID() });
    expect(await approve(ver)).toEqual({ kind: "approved", version_id: ver, version_no: 1 });
    expect(await approve(ver)).toEqual({ kind: "already-approved", version_id: ver, version_no: 1 });
    const key = randomUUID();
    const exported = await exportVersion(ver, key);
    expect(exported).toEqual({
      kind: "exported",
      delivery_id: expect.any(String),
      version_id: ver,
      counted: true,
      state: "exported",
    });
    expect(await exportVersion(ver, key)).toEqual({
      kind: "existing",
      delivery_id: exported.delivery_id,
      version_id: ver,
      counted: false,
      state: "exported",
    });
    expect(await exportVersion(ver)).toEqual({
      kind: "exported",
      delivery_id: expect.any(String),
      version_id: ver,
      counted: false,
      state: "exported",
    });
    expect(await usage(ws)).toBe(1);
  });

  it("the guard and both re-created functions are invoker-rights, search_path-pinned and not executable by PUBLIC", async () => {
    const names = ["approve_output_version", "export_output_version", "offer_current_for_version"];
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
  });

  it("edit and export serialize", async () => {
    const { ws, offer, ver } = await offerVersion();
    await approve(ver);
    const editor = await runtime.connect();
    try {
      await editor.query("BEGIN");
      await editor.query("SELECT id FROM offers WHERE id=$1 FOR UPDATE", [offer]);
      await editAndReconfirm(offer, editor);

      const exporting = exportVersion(ver);
      const settled = await Promise.race([
        exporting.then(
          () => "resolved",
          () => "rejected",
        ),
        new Promise((resolve) => setTimeout(() => resolve("pending"), 300)),
      ]);
      expect(settled).toBe("pending");

      await editor.query("COMMIT");
      await expect(exporting).rejects.toMatchObject({ code: "P0001", message: "offer_changed" });
    } finally {
      await editor.query("ROLLBACK").catch(() => undefined);
      editor.release();
    }
    expect(await deliveries(ver)).toEqual([]);
    expect(await usage(ws)).toBe(0);
  });

  // P4.1 Task 6: artifactRepository.createOutputVersion is the one gateway every version passes
  // through (an owner edit, the assistant, and a run's finish), and it binds the offer revision.
  describe("the version gateway binds the offer revision (spec 1.3)", () => {
    const storedMeta = async (versionId: string) =>
      (await runtime.query("SELECT meta FROM output_versions WHERE id=$1", [versionId])).rows[0].meta as Record<string, unknown>;

    it("an owner edit inherits the base's revision, never a forged one, and approves", async () => {
      const { offer, act, ver } = await offerVersion();
      const repo = artifactRepository(runtime);
      const edit = await createVersion(repo, {
        actionId: act,
        actorId: actor,
        authorType: "user",
        body: "Owner edit",
        meta: { offer_revision: 99, offer_id: randomUUID() },
        baseVersionId: ver,
      });
      expect(await storedMeta(edit.versionId)).toEqual({ offer_id: offer, offer_revision: 1 });
      expect((await repo.approveOutputVersion(edit.versionId, actor, null)).kind).toBe("approved");
    });

    it("a hand edit cannot make a stale draft current, and the refusal surfaces as offer_changed", async () => {
      const { offer, act, ver } = await offerVersion();
      await editAndReconfirm(offer);
      const repo = artifactRepository(runtime);
      const edit = await createVersion(repo, { actionId: act, actorId: actor, authorType: "user", body: "Edit", meta: { offer_revision: 2 }, baseVersionId: ver });
      expect(await storedMeta(edit.versionId)).toEqual({ offer_id: offer, offer_revision: 1 });
      await expect(repo.approveOutputVersion(edit.versionId, actor, null)).rejects.toThrow("offer_changed");
    });

    it("a version with no base on an offer action records no revision", async () => {
      const ws = await workspace();
      const offer = await confirmedOffer(ws);
      const act = await action(ws, offer);
      const repo = artifactRepository(runtime);
      const first = await createVersion(repo, { actionId: act, actorId: actor, authorType: "user", body: "First", meta: { offer_id: offer, offer_revision: 1 } });
      expect(await storedMeta(first.versionId)).toEqual({});
      await expect(repo.approveOutputVersion(first.versionId, actor, null)).rejects.toThrow("offer_changed");
    });

    it("strips a forged revision on a non-offer action", async () => {
      const ws = await workspace();
      const act = await action(ws, null);
      const v = await createVersion(artifactRepository(runtime), {
        actionId: act,
        actorId: actor,
        authorType: "user",
        body: "Plain",
        meta: { note: "kept", offer_revision: 9, offer_id: randomUUID() },
      });
      expect(await storedMeta(v.versionId)).toEqual({ note: "kept" });
    });

    it("a run's finish stores the revision the run read", async () => {
      const ws = await workspace();
      const offer = await confirmedOffer(ws);
      const act = await action(ws, offer);
      const runs = actionRunRepository((run) => withTransaction(run, runtime));
      const runId = await runs.queue({ actionId: act, actorId: actor, agentKey: "promotion_copy", input: {}, promptVersion: "fixture", model: null, now: new Date() });
      await runs.start({ runId, actorId: actor, locale: "en" });
      const done = await runs.finish({
        runId,
        actorId: actor,
        locale: "en",
        usage: { inputTokens: 1, outputTokens: 1 },
        costUsd: 0,
        output: { title: "Promo", body: "Set dinner HK$1,280", warnings: [], facts_used: [], facts_needed: [], acceptance_criteria: [] },
        offerRevision: 4,
        finishedAt: new Date(),
      });
      expect(done).toMatchObject({ state: "succeeded", versionNo: 1 });
      if (done.state !== "succeeded" || !done.versionId) throw new Error("expected a version");
      expect(await storedMeta(done.versionId)).toMatchObject({ title: "Promo", agent_key: "promotion_copy", offer_id: offer, offer_revision: 4 });
    });

    it("an assistant-redeemed version inherits its base's revision", async () => {
      const { ws, offer, act, ver } = await offerVersion();
      const repo = artifactRepository(runtime);
      const runId = await repo.recordAssistantDraft({
        actionId: act,
        workspaceId: ws,
        actorId: actor,
        agentKey: "promotion_copy",
        promptVersion: "fixture",
        intentId: "rewrite",
        surface: "action",
        locale: "en",
        model: null,
        output: { title: "Rewrite", body: "Rewritten promo", alt_text: null, acceptance_criteria: [], warnings: [], facts_used: [] },
        usage: { inputTokens: 1, outputTokens: 1 },
        costUsd: 0,
        finishedAt: new Date().toISOString(),
      });
      const redeemed = await createAssistantVersion(repo, { actionId: act, workspaceId: ws, actorId: actor, runId, baseVersionId: ver });
      expect(await storedMeta(redeemed.versionId)).toMatchObject({ origin: "assistant", offer_id: offer, offer_revision: 1 });
    });
  });
});
