import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations, loadMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

// Every statement that reaches the database is recorded, so "no SQL" is asserted on what
// was sent, not inferred from a swallowed error. The default pool is unavailable until
// the test points it at the fixture.
const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined, statements: [] as string[] }));
vi.mock("../../lib/db/client", () => ({
  getPool: () => {
    if (!ports.pool) throw new Error("default_database_forbidden");
    return ports.pool;
  },
}));
// The limiter and the model are not under test; they must simply not run with the flag off.
const spies = vi.hoisted(() => ({ limit: vi.fn(), llm: vi.fn() }));
vi.mock("../../lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/security/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => spies.limit(...args),
}));
vi.mock("../../lib/llm", () => ({ llmComplete: (...args: unknown[]) => spies.llm(...args), llmConfigured: () => true }));

import { POST } from "../../app/api/start/[slug]/preview/route";
import { buildReportProps, type ReportViewModelLike } from "../../lib/funnel/report-props";
import { previewDraftEnabled, previewDraftHrefFor } from "../../lib/preview/flag";

// An unlocked viewer's report model, as loadReport hands it to the page.
const viewerModel = {
  access: "viewer",
  preview: {
    slug: "flag-off-slug",
    locale: "en",
    region: "hk",
    businessName: "Flag Off Cafe",
    district: null,
    industry: null,
    status: "done",
    overallScore: 52,
    coverage: { percent: 65, modules: [] },
    priorities: [],
  },
  fullFindings: [],
  summary: null,
  proof: { ig: null, gbp: null, aeo: null, merchant: null, trust: null },
  evidence: { items: [] },
} satisfies ReportViewModelLike;

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

const preview = (slug = "unknown-slug") =>
  POST(
    new Request(`https://app.test/api/start/${slug}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ review: "The roast goose was cold and the wait was long.", rating: 2, locale: "en" }),
    }),
    { params: Promise.resolve({ slug }) },
  );

// P4.5: the code ships before migration 0013 is applied and with PREVIEW_DRAFT_ENABLED unset.
// Then the preview route answers 404 before any SQL, so deploying changes no database traffic
// against a schema that has no preview_events.
describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon preview draft: deploying before 0013 is harmless while the flag is off", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query(
      "CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime",
    );
    // Only 0001-0012: this database has never seen 0013.
    const through0012 = (await loadMigrations()).filter((m) => m.name <= "0012_work_packs.sql");
    expect(through0012.at(-1)?.name).toBe("0012_work_packs.sql");
    expect(await applyMigrations(owner, through0012)).toHaveLength(12);
    expect((await owner.query("SELECT to_regclass('public.preview_events') AS events")).rows[0]).toEqual({ events: null });

    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, max: 5 });
    ports.pool = recording(runtime);
  });

  beforeEach(() => {
    ports.statements.length = 0;
    spies.limit.mockReset();
    spies.llm.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    ports.pool = undefined;
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  it.each([undefined, "", "false"])("POST with the flag %j is 404 not_enabled and runs zero statements", async (value) => {
    vi.stubEnv("PREVIEW_DRAFT_ENABLED", value);
    const res = await preview();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_enabled" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(ports.statements).toEqual([]);
    expect(spies.limit).not.toHaveBeenCalled();
    expect(spies.llm).not.toHaveBeenCalled();
  });

  it("with the flag exactly \"true\" the same POST reaches the database, so the recorder is not silent", async () => {
    vi.stubEnv("PREVIEW_DRAFT_ENABLED", "true");
    const res = await preview();
    // An unknown slug is not found; only the job lookup ran, and nothing was written.
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(ports.statements).toEqual(["SELECT id, status, region, business_name FROM audit_jobs WHERE share_slug = $1"]);
    expect(spies.limit).not.toHaveBeenCalled();
    expect(spies.llm).not.toHaveBeenCalled();
  });

  // The report page adds the card from previewDraftHrefFor and the props builder, after the
  // report itself loaded. Neither may add database traffic, flag on or off, so the card costs
  // nothing on a schema without preview_events.
  it.each([undefined, "", "false"])("building the report page props for a viewer with the flag %j runs zero statements and sets no card", (value) => {
    vi.stubEnv("PREVIEW_DRAFT_ENABLED", value);
    const href = previewDraftHrefFor({ enabled: previewDraftEnabled(), access: viewerModel.access, status: viewerModel.preview.status, locale: "en", slug: viewerModel.preview.slug });
    const props = { ...buildReportProps(viewerModel, "en"), ...(href ? { previewDraftHref: href } : {}) };
    expect(href).toBeUndefined();
    expect(props.access).toBe("viewer");
    expect("previewDraftHref" in props).toBe(false);
    expect(ports.statements).toEqual([]);
  });

  it("with the flag exactly \"true\" the viewer gets the card, still without a statement", () => {
    vi.stubEnv("PREVIEW_DRAFT_ENABLED", "true");
    const href = previewDraftHrefFor({ enabled: previewDraftEnabled(), access: viewerModel.access, status: viewerModel.preview.status, locale: "en", slug: viewerModel.preview.slug });
    expect(href).toBe("/en/start/flag-off-slug");
    expect(ports.statements).toEqual([]);
  });
});
