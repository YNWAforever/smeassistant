import { randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations, loadMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

// The repository must use the executor it is given; the default database is never reached.
vi.mock("../../lib/db/client", () => ({
  getPool: () => {
    throw new Error("default_database_forbidden");
  },
}));

import { previewRepository } from "../../lib/repositories/previews";

// P4.5 migration 0013 (docs/superpowers/specs/2026-10-04-preview-draft-design.md §1):
// preview_events, claim_preview_slot and finish_preview_slot.
describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon preview events", () => {
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
    if ((await owner.query("SELECT to_regclass('public.preview_events') AS r")).rows[0].r) {
      // Grants and preview events cascade from their job.
      await runtime.query("DELETE FROM audit_jobs");
    }
  });

  afterAll(async () => {
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  it("0013 applies after 0012 and a second applyMigrations returns []", async () => {
    const migrations = await loadMigrations();
    const before = migrations.filter((m) => m.name < "0013_preview_events.sql");
    expect(before.at(-1)?.name).toBe("0012_work_packs.sql");
    expect(await applyMigrations(owner, before)).toHaveLength(12);
    expect(await applyMigrations(owner)).toEqual(["0013_preview_events.sql"]);
    expect(await applyMigrations(owner)).toEqual([]);
  });

  it("preview_events and both functions follow the 0012 access rules", async () => {
    const table = (
      await owner.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.preview_events'::regclass")
    ).rows[0];
    expect(table.relrowsecurity).toBe(true);
    const policy = (
      await owner.query("SELECT roles::text[] AS roles, cmd, qual, with_check FROM pg_policies WHERE tablename='preview_events'")
    ).rows;
    expect(policy).toEqual([{ roles: ["sme_app_runtime"], cmd: "ALL", qual: "true", with_check: "true" }]);
    const names = ["claim_preview_slot", "finish_preview_slot"];
    const rows = (
      await owner.query(
        `SELECT p.proname, p.prosecdef, p.proconfig, has_function_privilege('sme_app_runtime', p.oid, 'EXECUTE') AS runtime_exec,
                (SELECT count(*)::int FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0) AS public_grants
           FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname = ANY($1) ORDER BY p.proname`,
        [names],
      )
    ).rows;
    expect(rows.map((r) => r.proname)).toEqual(names);
    for (const r of rows) {
      expect(r).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'], runtime_exec: true, public_grants: 0 });
    }
  });

  async function job(fields: { slug?: string; status?: string; region?: string } = {}): Promise<string> {
    return (
      await runtime.query(
        "INSERT INTO audit_jobs(business_name,status,share_slug,region,raw_data) VALUES('Preview Fixture',$1,$2,$3,'{\"secret\":true}') RETURNING id",
        [fields.status ?? "done", fields.slug ?? null, fields.region ?? "hk"],
      )
    ).rows[0].id as string;
  }

  async function grant(jobId: string): Promise<string> {
    return (
      await runtime.query(
        "INSERT INTO report_access_grants(job_id,token_hash,idempotency_key,purpose,expires_at) VALUES($1,$2,$3,'report_view',now()+interval '30 days') RETURNING id",
        [jobId, randomBytes(32).toString("hex"), randomUUID()],
      )
    ).rows[0].id as string;
  }

  const claim = (
    jobId: string,
    grantId: string,
    limits: { globalDaily?: number; usdDaily?: number; ipHash?: string | null } = {},
    db: Pool | PoolClient = runtime,
  ) =>
    previewRepository(db).claimSlot({
      jobId,
      grantId,
      ipHash: limits.ipHash === undefined ? null : limits.ipHash,
      globalDaily: limits.globalDaily ?? 50,
      usdDaily: limits.usdDaily ?? 2,
    });

  const finish = (eventId: string, outcome: "generated" | "failed", costUsd = 0, reason: string | null = null) =>
    previewRepository(runtime).finishSlot({ eventId, outcome, reason, costUsd });

  async function claimedId(jobId: string, grantId: string, limits: Parameters<typeof claim>[2] = {}): Promise<string> {
    const result = await claim(jobId, grantId, limits);
    if (!result.allowed) throw new Error(`expected an allowed claim, got ${result.reason}`);
    return result.eventId;
  }

  const events = async (where = "true", params: unknown[] = []) =>
    (
      await runtime.query(
        `SELECT id, job_id, grant_id, outcome, reason, cost_usd::text AS cost_usd, ip_hash, finished_at FROM preview_events WHERE ${where} ORDER BY created_at, id`,
        params,
      )
    ).rows;

  it("the first claim for a grant is allowed; a second returns already_used and inserts a refused row", async () => {
    const j = await job();
    const g = await grant(j);
    const first = await claim(j, g, { ipHash: "fingerprint-a" });
    expect(first).toEqual({ allowed: true, eventId: expect.any(String) });
    expect(await claim(j, g, { ipHash: "fingerprint-b" })).toEqual({ allowed: false, reason: "already_used" });
    const rows = await events("job_id=$1", [j]);
    expect(rows).toEqual([
      expect.objectContaining({ id: first.allowed ? first.eventId : "", grant_id: g, outcome: "claimed", reason: null, ip_hash: "fingerprint-a", finished_at: null }),
      expect.objectContaining({ grant_id: g, outcome: "refused", reason: "already_used", ip_hash: "fingerprint-b" }),
    ]);
    // A finished (generated) slot is still used.
    await finish(rows[0].id, "generated", 0.01);
    expect(await claim(j, g)).toEqual({ allowed: false, reason: "already_used" });
  });

  it("two parallel claims for one grant: exactly one allowed", async () => {
    for (let round = 0; round < 5; round += 1) {
      const j = await job();
      const g = await grant(j);
      const [a, b] = await Promise.all([runtime.connect(), runtime.connect()]);
      try {
        const results = await Promise.all([claim(j, g, {}, a), claim(j, g, {}, b)]);
        expect(results.filter((r) => r.allowed)).toHaveLength(1);
        expect(results.filter((r) => !r.allowed)).toEqual([{ allowed: false, reason: "already_used" }]);
      } finally {
        a.release();
        b.release();
      }
      expect((await events("job_id=$1 AND outcome='claimed'", [j])).length).toBe(1);
    }
  });

  it("job_limit after 3 claimed|generated across three grants", async () => {
    const j = await job();
    const grants = [await grant(j), await grant(j), await grant(j), await grant(j)];
    await finish(await claimedId(j, grants[0]), "generated", 0.01);
    await finish(await claimedId(j, grants[1]), "generated", 0.01);
    await claimedId(j, grants[2]); // still claimed: counts too
    expect(await claim(j, grants[3])).toEqual({ allowed: false, reason: "job_limit" });
    // Refused rows never count, and a used grant is reported before the job limit.
    expect(await claim(j, grants[0])).toEqual({ allowed: false, reason: "already_used" });
    expect(await claim(j, grants[3])).toEqual({ allowed: false, reason: "job_limit" });
    expect((await events("job_id=$1 AND outcome='refused'", [j])).map((r) => r.reason)).toEqual(["job_limit", "already_used", "job_limit"]);
    // Another job is independent.
    const other = await job();
    expect((await claim(other, await grant(other))).allowed).toBe(true);
  });

  it("daily_limit at p_global_daily and budget when the 24h cost sum reaches p_usd_daily", async () => {
    const [j1, j2, j3] = [await job(), await job(), await job()];
    const first = await claimedId(j1, await grant(j1), { globalDaily: 2 });
    await finish(first, "generated", 0.3);
    await claimedId(j2, await grant(j2), { globalDaily: 2 });
    const g3 = await grant(j3);
    expect(await claim(j3, g3, { globalDaily: 2 })).toEqual({ allowed: false, reason: "daily_limit" });
    expect(await claim(j3, g3, { globalDaily: 3 })).toEqual(expect.objectContaining({ allowed: true }));

    // Rows older than 24 hours no longer count toward the daily limit.
    await runtime.query("UPDATE preview_events SET created_at = now() - interval '25 hours' WHERE id=$1", [first]);
    const j4 = await job();
    expect(await claim(j4, await grant(j4), { globalDaily: 3 })).toEqual(expect.objectContaining({ allowed: true }));
    expect(await claim(j4, await grant(j4), { globalDaily: 3 })).toEqual({ allowed: false, reason: "daily_limit" });

    // Budget: the 24h cost sum (any outcome) reaching p_usd_daily refuses.
    await runtime.query("DELETE FROM preview_events");
    const [b1, b2, b3] = [await job(), await job(), await job()];
    await finish(await claimedId(b1, await grant(b1), { usdDaily: 0.5 }), "generated", 0.3);
    await finish(await claimedId(b2, await grant(b2), { usdDaily: 0.5 }), "failed", 0.2, "invalid_output");
    const gb3 = await grant(b3);
    expect(await claim(b3, gb3, { usdDaily: 0.5 })).toEqual({ allowed: false, reason: "budget" });
    // The daily limit is checked before the budget.
    expect(await claim(b3, gb3, { globalDaily: 1, usdDaily: 0.5 })).toEqual({ allowed: false, reason: "daily_limit" });
    expect(await claim(b3, gb3, { usdDaily: 0.51 })).toEqual(expect.objectContaining({ allowed: true }));
    // Costs older than 24 hours no longer count.
    await runtime.query("UPDATE preview_events SET created_at = now() - interval '25 hours' WHERE outcome <> 'claimed'");
    const b4 = await job();
    expect(await claim(b4, await grant(b4), { usdDaily: 0.01 })).toEqual(expect.objectContaining({ allowed: true }));
  });

  it("failed releases the slot: finish(failed) then claim again is allowed", async () => {
    const j = await job();
    const g = await grant(j);
    const first = await claimedId(j, g);
    await finish(first, "failed", 0, "no_model_output");
    const second = await claim(j, g);
    expect(second).toEqual({ allowed: true, eventId: expect.any(String) });
    expect((await events("job_id=$1", [j])).map((r) => [r.outcome, r.reason])).toEqual([
      ["failed", "no_model_output"],
      ["claimed", null],
    ]);
  });

  it("a claimed row older than 5 minutes is treated as failed (stale)", async () => {
    const j = await job();
    const g = await grant(j);
    const first = await claimedId(j, g);
    // Four minutes old: still holds the slot.
    await runtime.query("UPDATE preview_events SET created_at = now() - interval '4 minutes' WHERE id=$1", [first]);
    expect(await claim(j, g)).toEqual({ allowed: false, reason: "already_used" });
    // Six minutes old: released as stale, so the grant may claim again.
    await runtime.query("UPDATE preview_events SET created_at = now() - interval '6 minutes' WHERE id=$1", [first]);
    expect(await claim(j, g)).toEqual({ allowed: true, eventId: expect.any(String) });
    const stale = (await events("id=$1", [first]))[0];
    expect(stale).toMatchObject({ outcome: "failed", reason: "stale" });
    expect(stale.finished_at).toBeInstanceOf(Date);
    // A late finish for the stale row changes nothing.
    await finish(first, "generated", 0.05);
    expect((await events("id=$1", [first]))[0]).toMatchObject({ outcome: "failed", reason: "stale", cost_usd: "0" });
  });

  it("finish_preview_slot changes only claimed rows; an unknown outcome raises", async () => {
    const j = await job();
    const g = await grant(j);
    const id = await claimedId(j, g);
    await finish(id, "generated", 0.0123);
    const done = (await events("id=$1", [id]))[0];
    expect(done).toMatchObject({ outcome: "generated", reason: null, cost_usd: "0.0123" });
    expect(done.finished_at).toBeInstanceOf(Date);
    // generated → failed is a no-op.
    await finish(id, "failed", 1, "late");
    expect((await events("id=$1", [id]))[0]).toMatchObject({ outcome: "generated", reason: null, cost_usd: "0.0123" });
    // A refused row never changes.
    await claim(j, g);
    const refused = (await events("job_id=$1 AND outcome='refused'", [j]))[0];
    await finish(refused.id, "generated", 1);
    expect((await events("id=$1", [refused.id]))[0]).toMatchObject({ outcome: "refused", reason: "already_used", cost_usd: "0" });
    // An unknown event is a no-op.
    await expect(finish(randomUUID(), "generated", 1)).resolves.toBeUndefined();

    const other = await job();
    const open = await claimedId(other, await grant(other));
    for (const outcome of ["refused", "claimed", "bogus"]) {
      await expect(
        runtime.query("SELECT public.finish_preview_slot($1::uuid,$2::text,NULL,0)", [open, outcome]),
      ).rejects.toMatchObject({ code: "22023" });
    }
    expect((await events("id=$1", [open]))[0]).toMatchObject({ outcome: "claimed", finished_at: null });
  });

  it("deleting the job cascades; deleting the grant sets grant_id null and keeps the row", async () => {
    const j = await job();
    const g = await grant(j);
    const id = await claimedId(j, g);
    await finish(id, "generated", 0.02);
    await runtime.query("DELETE FROM report_access_grants WHERE id=$1", [g]);
    expect(await events("id=$1", [id])).toEqual([
      expect.objectContaining({ id, job_id: j, grant_id: null, outcome: "generated", cost_usd: "0.02" }),
    ]);
    await runtime.query("DELETE FROM audit_jobs WHERE id=$1", [j]);
    expect(await events("job_id=$1", [j])).toEqual([]);
  });

  it("previewJob returns only the four fields; an unknown slug gives null", async () => {
    const slug = `slug-${randomUUID()}`;
    const id = await job({ slug, status: "partial", region: "tw" });
    const statements: string[] = [];
    const spy = {
      query: (text: string, params?: unknown[]) => {
        statements.push(text);
        return runtime.query(text, params);
      },
    } as unknown as Pool;
    const found = await previewRepository(spy).previewJob(slug);
    expect(found).toEqual({ id, status: "partial", region: "tw", businessName: "Preview Fixture" });
    expect(Object.keys(found ?? {}).sort()).toEqual(["businessName", "id", "region", "status"]);
    expect(statements).toHaveLength(1);
    expect(statements[0].replace(/\s+/g, " ").trim()).toBe(
      "SELECT id, status, region, business_name FROM audit_jobs WHERE share_slug = $1",
    );
    expect(await previewRepository(runtime).previewJob(`missing-${randomUUID()}`)).toBeNull();
  });
});
