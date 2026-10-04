import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations, loadMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

// Every statement that reaches the database is recorded, so "no SQL" and "no 0014 column"
// are asserted on what was sent, not inferred from a swallowed error. The default pool is
// unavailable until the test points it at the fixture.
const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined, statements: [] as string[] }));
vi.mock("../../lib/db/client", () => ({
  getPool: () => {
    if (!ports.pool) throw new Error("default_database_forbidden");
    return ports.pool;
  },
}));
// No session: a route that reached authorization would answer 401. With the flag off, and
// for an unknown delivery, none may get that far.
const spies = vi.hoisted(() => ({ authorize: vi.fn(), limit: vi.fn(), fetch: vi.fn() }));
vi.mock("../../lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/auth")>()),
  authorizeWorkspaceRequest: (...args: unknown[]) => spies.authorize(...args),
}));
vi.mock("../../lib/publishing/limits", () => ({
  consumePublishLimits: (...args: unknown[]) => spies.limit(...args),
}));

import { GET as targetsRoute } from "../../app/api/versions/[versionId]/publish/targets/route";
import { POST as publishRoute } from "../../app/api/versions/[versionId]/publish/route";
import { POST as reconcileRoute } from "../../app/api/deliveries/[deliveryId]/reconcile/route";
import { DELETE as deleteReplyRoute } from "../../app/api/deliveries/[deliveryId]/reply/route";
import { loadPublishPanel } from "../../lib/publishing/page-state";
import { publishingRepository } from "../../lib/repositories/publishing";
import { workflowRepository } from "../../lib/repositories/workflow";

/** The columns 0014 adds. No statement on a 0013 database may name one. */
const COLUMNS_0014 = ["target_ref", "provider_receipt", "failure_reason", "verified_at", "first_published_at"];

const textOf = (text: unknown): string =>
  typeof text === "string" ? text : typeof text === "object" && text !== null && "text" in text ? String((text as { text: unknown }).text) : JSON.stringify(text);

/** A pool that forwards everything to `real` and records each query text, including on checked-out clients. */
function recording(real: Pool): Pool {
  const record = (target: Pool | PoolClient) => (text: unknown, ...rest: unknown[]) => {
    ports.statements.push(textOf(text));
    return (target.query as (...args: unknown[]) => unknown)(text, ...rest);
  };
  return new Proxy(real, {
    get(target, property) {
      if (property === "query") return record(target);
      if (property === "connect") {
        return async () => {
          const client = await target.connect();
          return new Proxy(client, {
            get(inner, key) {
              if (key === "query") return record(inner);
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

const namesA0014Column = (statement: string) => COLUMNS_0014.some((column) => statement.includes(column));

// P4.6: the code ships before migration 0014 is applied and with GBP_REPLY_PUBLISH_ENABLED
// unset. Targets, publish and delete then answer 404 before any SQL; reconcile (ruling P4)
// stays on but finds no publish delivery through 0002 columns, so it never names a 0014
// column; and the export path keeps counting on the 0013 schema.
describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon GBP reply publishing: deploying before 0014 is harmless while the flag is off", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query(
      "CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime",
    );
    // Only 0001-0013: this database has never seen 0014.
    const through0013 = (await loadMigrations()).filter((m) => m.name !== "0014_publish_reply.sql");
    expect(through0013.at(-1)?.name).toBe("0013_preview_events.sql");
    expect(await applyMigrations(owner, through0013)).toHaveLength(13);
    const columns = (
      await owner.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = ANY($1::text[])",
        [COLUMNS_0014],
      )
    ).rows;
    expect(columns).toEqual([]);

    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, max: 5 });
    ports.pool = recording(runtime);
  });

  beforeEach(() => {
    ports.statements.length = 0;
    spies.authorize.mockReset();
    spies.authorize.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    spies.limit.mockReset();
    spies.fetch.mockReset();
    vi.stubGlobal("fetch", spies.fetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    ports.pool = undefined;
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  it.each([undefined, "", "false"])("with the flag off, targets, publish and delete answer 404 and send no SQL (flag %j)", async (value) => {
    vi.stubEnv("GBP_REPLY_PUBLISH_ENABLED", value);
    const versionId = randomUUID();
    const deliveryId = randomUUID();
    const responses = [
      await targetsRoute(new Request(`https://app.test/api/versions/${versionId}/publish/targets`), {
        params: Promise.resolve({ versionId }),
      }),
      await publishRoute(
        new Request(`https://app.test/api/versions/${versionId}/publish`, {
          method: "POST",
          body: JSON.stringify({ reviewName: "accounts/1/locations/2/reviews/r1", idempotencyKey: "abcdefghijklmnop_-01", confirmVersionNo: 1 }),
        }),
        { params: Promise.resolve({ versionId }) },
      ),
      await deleteReplyRoute(new Request(`https://app.test/api/deliveries/${deliveryId}/reply`, { method: "DELETE" }), {
        params: Promise.resolve({ deliveryId }),
      }),
    ];
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_enabled" });
    }
    expect(ports.statements).toEqual([]);
    expect(spies.authorize).not.toHaveBeenCalled();
    expect(spies.limit).not.toHaveBeenCalled();
    expect(spies.fetch).not.toHaveBeenCalled();
  });

  it("reconcile for an unknown delivery answers 404 without naming a 0014 column", async () => {
    // Seed an export delivery: it exists, but is not a publish, so reconcile must not see it either.
    const seeded = await seedApproved();
    const exported = await workflowRepository().exportOutputVersion(seeded.versionId, seeded.actor, "export", randomUUID());

    for (const flag of [undefined, "true"]) {
      vi.stubEnv("GBP_REPLY_PUBLISH_ENABLED", flag);
      for (const deliveryId of [randomUUID(), exported.delivery_id]) {
        ports.statements.length = 0;
        const res = await reconcileRoute(new Request(`https://app.test/api/deliveries/${deliveryId}/reconcile`, { method: "POST" }), {
          params: Promise.resolve({ deliveryId }),
        });
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "not_found" });
        // Only the pre-0014 existence check ran; it found nothing, so nothing else followed.
        expect(ports.statements).toEqual(["SELECT id FROM deliveries WHERE id = $1 AND mode = 'publish'"]);
        expect(ports.statements.filter(namesA0014Column)).toEqual([]);
      }
    }
    expect(spies.authorize).not.toHaveBeenCalled();
    expect(spies.limit).not.toHaveBeenCalled();
    expect(spies.fetch).not.toHaveBeenCalled();
  });

  it("publishDeliveryIds runs without error and names no 0014 column", async () => {
    const seeded = await seedApproved();
    await workflowRepository().exportOutputVersion(seeded.versionId, seeded.actor, "export", randomUUID());
    ports.statements.length = 0;
    const repo = publishingRepository();
    expect(await repo.publishDeliveryIds(seeded.workspaceId, [seeded.versionId, randomUUID()])).toEqual([]);
    expect(await repo.publishDeliveryIds(seeded.workspaceId, [])).toEqual([]);
    expect(ports.statements).toHaveLength(1);
    expect(ports.statements.filter(namesA0014Column)).toEqual([]);
  });

  it("loadPublishPanel with the flag off runs on the 0013 schema and names no 0014 column", async () => {
    const seeded = await seedApproved();
    // An export delivery exists for the version; it is not a publish, so the panel must not see it.
    await workflowRepository().exportOutputVersion(seeded.versionId, seeded.actor, "export", randomUUID());
    const versions = [{ id: seeded.versionId, approval_state: "approved", body: "Thank you for visiting" }];

    // Both spellings of "off": the env unset (the page's default) and an explicit false.
    for (const enabled of [undefined, false]) {
      vi.stubEnv("GBP_REPLY_PUBLISH_ENABLED", undefined);
      ports.statements.length = 0;
      const panel = await loadPublishPanel({
        workspaceId: seeded.workspaceId,
        templateKey: "review-response",
        locationPlaceId: "place-1",
        role: "owner",
        inScope: true,
        versions,
        ...(enabled === undefined ? {} : { enabled }),
      });
      expect(panel).toEqual({
        enabled: false,
        connectionActive: false,
        eligibility: { ok: false, reason: "flag_off" },
        mayAct: false,
        canPublish: false,
        canDelete: false,
        deliveries: [],
      });
      // Only publishDeliveryIds ran: no 0014 column, and the connection was never read.
      expect(ports.statements).toHaveLength(1);
      expect(ports.statements[0]).toContain("FROM deliveries");
      expect(ports.statements.filter(namesA0014Column)).toEqual([]);
      expect(ports.statements.some((statement) => statement.includes("oauth_connections"))).toBe(false);
    }
    expect(spies.fetch).not.toHaveBeenCalled();
  });

  it("export_output_version still exports and counts on the 0013 schema", async () => {
    const seeded = await seedApproved();
    const workflow = workflowRepository();
    const key = randomUUID();
    ports.statements.length = 0;
    const first = await workflow.exportOutputVersion(seeded.versionId, seeded.actor, "export", key);
    expect(first).toMatchObject({ kind: "exported", counted: true, version_id: seeded.versionId });
    // Same key, same delivery; another export of the same version does not count again.
    expect(await workflow.exportOutputVersion(seeded.versionId, seeded.actor, "export", key)).toMatchObject({
      delivery_id: first.delivery_id,
      counted: false,
    });
    expect(await workflow.exportOutputVersion(seeded.versionId, seeded.actor, "copy", randomUUID())).toMatchObject({ counted: false });
    expect(ports.statements.filter(namesA0014Column)).toEqual([]);

    const usage = (
      await owner.query("SELECT COALESCE(SUM(approved_deliveries), 0)::int AS n FROM workspace_usage WHERE workspace_id = $1", [
        seeded.workspaceId,
      ])
    ).rows[0].n;
    expect(usage).toBe(1);
    const version = (
      await owner.query("SELECT delivery_state, first_exported_at IS NOT NULL AS exported FROM output_versions WHERE id = $1", [
        seeded.versionId,
      ])
    ).rows[0];
    expect(version).toEqual({ delivery_state: "exported", exported: true });
  });

  /** A lite workspace with a location, a review-response action and an approved v1, written by the runtime role. */
  async function seedApproved() {
    const actor = (
      await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`flag-off-${randomUUID().slice(0, 8)}@example.test`])
    ).rows[0].id as string;
    const workspaceId = (
      await runtime.query("INSERT INTO workspaces(slug,market,tier) VALUES($1,'hk','lite') RETURNING id", [`ws-${randomUUID().slice(0, 8)}`])
    ).rows[0].id as string;
    const locationId = (
      await runtime.query("INSERT INTO locations(workspace_id,slug,name,place_id) VALUES($1,$2,'Shop','place-1') RETURNING id", [
        workspaceId,
        `loc-${randomUUID().slice(0, 8)}`,
      ])
    ).rows[0].id as string;
    const actionId = (
      await runtime.query(
        `INSERT INTO actions(workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key)
         VALUES($1,$2,'review-response','{}','{}','{}','low',0,'[]',10,'Live',$3) RETURNING id`,
        [workspaceId, locationId, `dk-${randomUUID()}`],
      )
    ).rows[0].id as string;
    const versionId = (
      await runtime.query(
        "INSERT INTO output_versions(workspace_id,action_id,version_no,body,meta,author_type) VALUES($1,$2,1,'Thank you for visiting','{}','agent') RETURNING id",
        [workspaceId, actionId],
      )
    ).rows[0].id as string;
    await workflowRepository().approveOutputVersion(versionId, actor, null);
    return { actor, workspaceId, versionId };
  }
});
