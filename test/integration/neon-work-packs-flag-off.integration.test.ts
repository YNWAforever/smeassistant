import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { applyMigrations, loadMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

// Every statement that reaches the database is recorded, so "no SQL against work_packs
// or work_pack_items" is asserted on what was sent, not inferred from a swallowed error.
// The default pool is unavailable until the test points it at the fixture.
const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined, statements: [] as string[], failures: [] as Array<{ sql: string; code: string | undefined }> }));
vi.mock("../../lib/db/client", () => ({
  getPool: () => {
    if (!ports.pool) throw new Error("default_database_forbidden");
    return ports.pool;
  },
}));

import type { Membership } from "../../lib/auth";
import { packRepository } from "../../lib/repositories/packs";
import { loadHomeWorkPacks } from "../../lib/workspace/packs";
import { loadWorkspaceContext } from "../../lib/workspace/queries";
import { getHomeBrief, listActions } from "../../lib/workspace/queries-pages";

const textOf = (text: unknown): string =>
  typeof text === "string" ? text : typeof text === "object" && text !== null && "text" in text ? String((text as { text: unknown }).text) : JSON.stringify(text);

/** Records the statement, and the SQLSTATE of any failure (the pack repository hides it behind pack_read_failed). */
function forward(text: unknown, run: () => unknown): unknown {
  const sql = textOf(text);
  ports.statements.push(sql);
  const result = run();
  if (result instanceof Promise) {
    result.catch((error: { code?: string }) => {
      ports.failures.push({ sql, code: error?.code });
    });
  }
  return result;
}

/** A pool that forwards everything to `real` and records each query text. */
function recording(real: Pool): Pool {
  return new Proxy(real, {
    get(target, property) {
      if (property === "query") {
        return (text: unknown, ...rest: unknown[]) => forward(text, () => (target.query as (...args: unknown[]) => unknown)(text, ...rest));
      }
      if (property === "connect") {
        return async () => {
          const client = await target.connect();
          return new Proxy(client, {
            get(inner, key) {
              if (key === "query") {
                return (text: unknown, ...rest: unknown[]) => forward(text, () => (inner.query as (...args: unknown[]) => unknown)(text, ...rest));
              }
              const value = Reflect.get(inner, key, inner);
              return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(inner) : value;
            },
          }) as PoolClient;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

// P4.2: the code ships before migration 0012 is applied. With WORK_PACKS_ENABLED unset
// nothing may read work_packs / work_pack_items, so Home and the actions list keep working
// against a database that does not have them.
describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon work packs: deploying before 0012 is harmless while the flag is off", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  let workspaceId: string;
  let locationId: string;
  let membership: Membership;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query(
      "CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime",
    );
    // Only 0001-0011: this database has never seen 0012.
    const through0011 = (await loadMigrations()).filter((m) => m.name <= "0011_offers.sql");
    expect(through0011.at(-1)?.name).toBe("0011_offers.sql");
    expect(await applyMigrations(owner, through0011)).toHaveLength(11);
    expect((await owner.query("SELECT to_regclass('public.work_packs') AS packs, to_regclass('public.work_pack_items') AS items")).rows[0]).toEqual({
      packs: null,
      items: null,
    });

    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, max: 5 });

    const slug = `ws-${randomUUID().slice(0, 8)}`;
    workspaceId = (
      await runtime.query("INSERT INTO workspaces(slug,business_name,market,timezone) VALUES($1,'Flag Off Cafe','hk','Asia/Hong_Kong') RETURNING id", [slug])
    ).rows[0].id as string;
    locationId = (
      await runtime.query("INSERT INTO locations(workspace_id,slug,name,is_primary) VALUES($1,'main','Main',true) RETURNING id", [workspaceId])
    ).rows[0].id as string;
    await runtime.query(
      `INSERT INTO actions(workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key)
       VALUES($1,$2,'review-response','{"en":"Reply to reviews","zh-HK":"回覆評論","zh-TW":"回覆評論"}','{}','{}','urgent',50,'[]',10,'Live',$3)`,
      [workspaceId, locationId, `dk-${randomUUID()}`],
    );
    const userId = (await runtime.query("INSERT INTO app_users(email) VALUES('owner@example.test') RETURNING id")).rows[0].id as string;
    membership = { workspaceId, workspaceSlug: slug, userId, email: "owner@example.test", role: "owner", locationScope: null };

    ports.pool = recording(runtime);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    ports.pool = undefined;
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  it("Home data assembly and the actions list succeed, workPacks is undefined and no SQL names a pack table", async () => {
    vi.stubEnv("WORK_PACKS_ENABLED", "");
    ports.statements.length = 0;

    const ctx = await loadWorkspaceContext(membership);
    expect(ctx.locations).toHaveLength(1);

    // The same calls app/[locale]/owner/[workspaceSlug]/page.tsx makes, in the same shape.
    const [brief, workPacks] = await Promise.all([
      getHomeBrief(ctx, "main"),
      loadHomeWorkPacks(ctx, membership, { id: locationId, isAll: false }),
    ]);
    expect(workPacks).toBeUndefined();
    expect(brief.openActions.map((a) => a.templateKey)).toEqual(["review-response"]);

    const list = await listActions(ctx, { location: "main" });
    expect(list.actions.map((a) => a.templateKey)).toEqual(["review-response"]);
    expect(list.counts.all).toBe(1);

    // Multi-location shape (isAll) is gated the same way.
    expect(await loadHomeWorkPacks(ctx, membership, { id: null, isAll: true })).toBeUndefined();

    // The recorder saw real traffic (so a silent recorder cannot pass this), and none of it is a pack read.
    expect(ports.statements.length).toBeGreaterThan(5);
    expect(ports.statements.filter((sql) => /work_pack/i.test(sql))).toEqual([]);
  });

  it("with the flag exactly \"true\" the pack read hits the missing relation (42P01), so the test does reach the gated path", async () => {
    vi.stubEnv("WORK_PACKS_ENABLED", "true");
    ports.statements.length = 0;
    ports.failures.length = 0;

    const ctx = await loadWorkspaceContext(membership);
    // loadHomeWorkPacks treats a failed pack read as "no open pack" (Home is fail-soft),
    // and the repository reports only pack_read_failed, so the 42P01 is read from the failed statement.
    const workPacks = await loadHomeWorkPacks(ctx, membership, { id: locationId, isAll: false });
    expect(workPacks).toMatchObject({ enabled: true, card: { initialPack: null } });
    expect(ports.statements.some((sql) => /work_packs/i.test(sql))).toBe(true);
    expect(ports.failures.filter((f) => /work_packs/i.test(f.sql)).map((f) => f.code)).toEqual(["42P01"]);

    ports.failures.length = 0;
    await expect(packRepository().openPack(workspaceId, locationId)).rejects.toThrow("pack_read_failed");
    expect(ports.failures.map((f) => f.code)).toEqual(["42P01"]);
  });
});
