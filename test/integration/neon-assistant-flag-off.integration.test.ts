import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

// Every statement that reaches the database is recorded, so "no SQL" is asserted on what
// was sent, not inferred from a swallowed error. The default pool is unavailable until
// the test points it at the fixture.
const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined, statements: [] as string[], membership: undefined as unknown }));
vi.mock("../../lib/db/client", () => ({
  getPool: () => {
    if (!ports.pool) throw new Error("default_database_forbidden");
    return ports.pool;
  },
}));
// Authorisation and the limiter are not under test here; they must simply not run with the flag off.
const auth = vi.hoisted(() => ({ authorize: vi.fn(), limit: vi.fn() }));
vi.mock("../../lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/auth")>()),
  authorizeWorkspaceRequest: (...args: unknown[]) => auth.authorize(...args),
}));
vi.mock("../../lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/security/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => auth.limit(...args),
}));

import { GET as getSuggestions } from "../../app/api/assistant/suggestions/route";
import { POST as postRun } from "../../app/api/assistant/run/route";

const textOf = (text: unknown): string =>
  typeof text === "string" ? text : typeof text === "object" && text !== null && "text" in text ? String((text as { text: unknown }).text) : JSON.stringify(text);

/** A pool that forwards everything to `real` and records each query text. */
function recording(real: Pool): Pool {
  return new Proxy(real, {
    get(target, property) {
      if (property === "query") {
        return (text: unknown, ...rest: unknown[]) => {
          ports.statements.push(textOf(text));
          return (target.query as (...args: unknown[]) => unknown)(text, ...rest);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

// P4.3: the code ships with CONTEXTUAL_ASSISTANT_ENABLED unset. Then the suggestions route
// reads nothing and the two new intents are refused before auth, so deploying changes no
// database traffic.
describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon contextual assistant: flag off sends no SQL", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  let workspaceId: string;

  const suggestionsUrl = () => `https://app.test/api/assistant/suggestions?workspaceId=${workspaceId}`;
  const runIntent = (intentId: string) =>
    postRun(
      new Request("https://app.test/api/assistant/run", {
        method: "POST",
        body: JSON.stringify({ mode: "live", surface: "action", intentId, locale: "en", context: { workspaceId } }),
      }),
    );

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
    await applyMigrations(owner);
    await owner.query("CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, max: 5 });

    const slug = `ws-${randomUUID().slice(0, 8)}`;
    workspaceId = (await runtime.query("INSERT INTO workspaces(slug,business_name,market,timezone) VALUES($1,'Flag Off Cafe','hk','Asia/Hong_Kong') RETURNING id", [slug])).rows[0].id as string;
    await runtime.query("INSERT INTO locations(workspace_id,slug,name,is_primary) VALUES($1,'main','Main',true)", [workspaceId]);
    const userId = (await runtime.query("INSERT INTO app_users(email) VALUES('owner@example.test') RETURNING id")).rows[0].id as string;
    ports.membership = { workspaceId, workspaceSlug: slug, userId, email: "owner@example.test", role: "owner", locationScope: null };
    ports.pool = recording(runtime);
  });

  beforeEach(() => {
    ports.statements.length = 0;
    auth.authorize.mockReset();
    auth.limit.mockReset();
    auth.authorize.mockImplementation(async () => ({ ok: true, user: { id: "user-1", email: "owner@example.test", verified: true }, membership: ports.membership }));
    auth.limit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    ports.pool = undefined;
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  it.each(["", "false", "TRUE", "1"])("GET suggestions with the flag %j answers [] and runs zero statements", async (value) => {
    vi.stubEnv("CONTEXTUAL_ASSISTANT_ENABLED", value);
    const res = await getSuggestions(new Request(suggestionsUrl()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [] });
    expect(ports.statements).toEqual([]);
    expect(auth.authorize).not.toHaveBeenCalled();
    expect(auth.limit).not.toHaveBeenCalled();
  });

  it.each(["explain_missing_inputs", "where_to_continue"])("POST run %s with the flag off is 404 not_enabled and runs zero statements", async (intentId) => {
    vi.stubEnv("CONTEXTUAL_ASSISTANT_ENABLED", "");
    const res = await runIntent(intentId);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_enabled" });
    expect(ports.statements).toEqual([]);
    expect(auth.authorize).not.toHaveBeenCalled();
  });

  it("with the flag exactly \"true\" the same GET reaches the database, so the recorder is not silent", async () => {
    vi.stubEnv("CONTEXTUAL_ASSISTANT_ENABLED", "true");
    const res = await getSuggestions(new Request(suggestionsUrl()));
    expect(res.status).toBe(200);
    // An owner with no Google connection is offered the connect step: real rows were read.
    expect((await res.json()).suggestions.map((s: { kind: string }) => s.kind)).toEqual(["google"]);
    expect(ports.statements.length).toBeGreaterThan(0);
    expect(auth.authorize).toHaveBeenCalledTimes(1);
    expect(auth.limit).toHaveBeenCalledWith(expect.objectContaining({ scope: "assistant_suggestions" }));
    // Read-only: a suggestions fetch never writes.
    expect(ports.statements.filter((sql) => /^\s*(insert|update|delete)\b/i.test(sql))).toEqual([]);
  });
});
