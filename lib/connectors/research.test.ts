import { afterEach, describe, expect, it, vi } from "vitest";
import { researchStatus, runResearch } from "./research";
import type { ResearchBudgetRepository } from "@/lib/repositories/research-budget";

const now = () => new Date("2026-10-28T12:00:00.000Z");
const input = { workspaceId: "workspace-a", locationId: "location-a", provider: "firecrawl" as const, url: "https://shop.example.com/", market: "hk" };
const env = {
  NODE_ENV: "test",
  CONVERSATION_HOME_ENABLED: "true", CONVERSATION_FIRECRAWL_ENABLED: "true", CONVERSATION_DATAFORSEO_ENABLED: "true",
  FIRECRAWL_API_KEY: "test-key", DATAFORSEO_LOGIN: "test-login", DATAFORSEO_PASSWORD: "test-password",
  CONVERSATION_RESEARCH_WORKSPACE_MONTHLY_USD: "1", CONVERSATION_RESEARCH_ACCOUNT_MONTHLY_USD: "2",
  CONVERSATION_RESEARCH_ACCOUNT_ID: "fixture-account", CONVERSATION_RESEARCH_PRICING_VERIFIED: "true",
  FIRECRAWL_MAX_CALL_USD: "0.02", DATAFORSEO_MAX_CALL_USD: "0.03", DATAFORSEO_MARKETS: "tw",
};
const balance = { workspaceRemainingUsd: 0.98, accountRemainingUsd: 1.98, reservedUsd: 0.02 };
function budget(): ResearchBudgetRepository {
  return {
    status: vi.fn().mockResolvedValue({ allowed: true, budget: { ...balance, workspaceRemainingUsd: 1, accountRemainingUsd: 2, reservedUsd: 0 } }),
    reserve: vi.fn().mockResolvedValue({ allowed: true, reservationId: "reservation-1", budget: balance }),
    settle: vi.fn().mockResolvedValue({ allowed: true, budget: balance }),
  };
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const firecrawl = (data: unknown = { markdown: "# Opening hours\nOpen daily", metadata: { title: "Shop hours", sourceURL: input.url, statusCode: 200, creditsUsed: 1, proxyUsed: "basic" } }) => ({ success: true, data });
const serp = (items: unknown[] = [{ type: "organic", title: "Coffee", url: "https://coffee.example.com/", description: "Daily coffee", rank_group: 1, rank_absolute: 2 }], cost = 0.01) => ({
  version: "0.1", status_code: 20000, cost, tasks_count: 1, tasks_error: 0,
  tasks: [{ id: "task-1", status_code: 20000, cost, result_count: 1, result: [{ keyword: "coffee", location_code: 2158, language_code: "en", pages_count: 1, items_count: items.length, items }] }],
});
afterEach(() => { vi.useRealTimers(); });

describe("paid research gates", () => {
  it.each([
    { CONVERSATION_HOME_ENABLED: "false" }, { VERCEL_ENV: "production" }, { VERCEL_ENV: "unknown" }, { VERCEL: "1" }, { NODE_ENV: "production" }, { CONVERSATION_FIRECRAWL_ENABLED: "1" },
    { FIRECRAWL_API_KEY: "" }, { CONVERSATION_RESEARCH_WORKSPACE_MONTHLY_USD: "NaN" },
    { CONVERSATION_RESEARCH_ACCOUNT_MONTHLY_USD: "0" }, { FIRECRAWL_MAX_CALL_USD: "" },
    { CONVERSATION_RESEARCH_ACCOUNT_ID: "" }, { CONVERSATION_RESEARCH_PRICING_VERIFIED: "false" },
  ])("stays disabled without verified positive configuration %j", async overrides => {
    const ledger = budget(), fetcher = vi.fn();
    const deps = { env: { ...env, ...overrides }, budget: ledger, fetch: fetcher };
    expect((await researchStatus(input, deps)).status).toBe("disabled");
    expect((await runResearch(input, deps)).status).toBe("disabled");
    expect(ledger.status).not.toHaveBeenCalled(); expect(ledger.reserve).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires credentials for DataForSEO and explicit actual market coverage", async () => {
    const ledger = budget(), fetcher = vi.fn(), deps = { env, budget: ledger, fetch: fetcher };
    for (const market of ["hk", "zh-TW", "en", "us"]) {
      expect(await runResearch({ ...input, provider: "dataforseo", market }, deps)).toMatchObject({ status: "unsupported", reason: "market_unsupported", items: [] });
    }
    expect((await runResearch({ ...input, provider: "dataforseo", market: "tw" }, { ...deps, env: { ...env, DATAFORSEO_PASSWORD: "" } })).status).toBe("disabled");
    expect(ledger.reserve).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["http://localhost/", "https://127.1/", "https://2130706433/", "https://10.0.0.1/", "http://169.254.169.254/", "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://[fc00::1]/", "https://shop.local/", "file:///etc/passwd", "https://u:p@shop.example.com/", "https://shop.example.com:8443/", "https://metadata.google.internal/"])("rejects unsafe saved URL %s before reservation", async url => {
    const ledger = budget(), fetcher = vi.fn();
    expect((await runResearch({ ...input, url }, { env, budget: ledger, fetch: fetcher })).status).toBe("unsupported");
    expect(ledger.reserve).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("reads remaining balances without starting paid work and blocks before network when exhausted", async () => {
    const ledger = budget(), fetcher = vi.fn();
    expect(await researchStatus(input, { env, budget: ledger, fetch: fetcher })).toMatchObject({ source: "firecrawl", status: "empty", reason: "research_available", observedAt: null, items: [], budget: { reservedUsd: 0 } });
    expect(ledger.reserve).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
    vi.mocked(ledger.reserve).mockResolvedValue({ allowed: false, reason: "account_budget_exhausted", budget: { ...balance, accountRemainingUsd: 0 } });
    expect(await runResearch(input, { env, budget: ledger, fetch: fetcher })).toMatchObject({ status: "blocked", reason: "account_budget_exhausted" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails closed when reservation persistence fails", async () => {
    const ledger = budget(), fetcher = vi.fn();
    vi.mocked(ledger.reserve).mockRejectedValue(new Error("database fixture secret"));
    expect(await runResearch(input, { env, budget: ledger, fetch: fetcher })).toMatchObject({ status: "failed", reason: "budget_unavailable", items: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("treats an absent saved website as unavailable before touching the budget", async () => {
    const ledger = budget(), fetcher = vi.fn();
    expect(await researchStatus({ ...input, url: null }, { env, budget: ledger, fetch: fetcher })).toMatchObject({ status: "unsupported", scope: "", items: [] });
    expect(await runResearch({ ...input, url: null }, { env, budget: ledger, fetch: fetcher })).toMatchObject({ status: "unsupported", scope: "", items: [] });
    expect(ledger.status).not.toHaveBeenCalled(); expect(ledger.reserve).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("bounded paid adapters", () => {
  it("reserves before one basic Firecrawl scrape with no parsers or auto proxy", async () => {
    const ledger = budget();
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(ledger.reserve).toHaveBeenCalledTimes(1);
      expect(url).toBe("https://api.firecrawl.dev/v2/scrape");
      expect(init).toMatchObject({ method: "POST", cache: "no-store", redirect: "error" });
      expect(JSON.parse(String(init?.body))).toEqual({ url: input.url, formats: ["markdown"], parsers: [], proxy: "basic", onlyMainContent: true, timeout: 10000, maxAge: 0 });
      return reply(firecrawl());
    });
    expect(await runResearch(input, { env, budget: ledger, fetch: fetcher, now })).toMatchObject({ source: "firecrawl", status: "ready", observedAt: now().toISOString(), scope: input.url, items: [{ title: "Shop hours", text: "# Opening hours\nOpen daily", url: input.url }], budget: balance });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(ledger.reserve).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-a", locationId: "location-a", provider: "firecrawl", accountId: "fixture-account", ceilingUsd: 0.02 }));
    expect(ledger.settle).toHaveBeenCalledWith(expect.objectContaining({ reservationId: "reservation-1", outcome: "ready" }));
  });
  it("uses a single 10-result one-page organic SERP task with market independent of locale", async () => {
    const ledger = budget();
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(_url).toBe("https://api.dataforseo.com/v3/serp/google/organic/live/regular");
      expect(JSON.parse(String(init?.body))).toEqual([{ keyword: "coffee", location_code: 2158, language_code: "en", depth: 10, max_crawl_pages: 1, device: "desktop", os: "windows" }]);
      return reply(serp());
    });
    expect(await runResearch({ ...input, provider: "dataforseo", market: "tw", keyword: "coffee" }, { env, budget: ledger, fetch: fetcher, now })).toMatchObject({ source: "dataforseo", status: "ready", scope: "tw: coffee", items: [{ title: "Coffee", url: "https://coffee.example.com/", text: "Daily coffee", metrics: { position: 1 } }] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(ledger.settle).toHaveBeenCalledWith(expect.objectContaining({ reportedUsd: 0.01 }));
  });
  it("supports HK only after an explicit market opt-in and rejects absent/long keywords", async () => {
    const ledger = budget(), fetcher = vi.fn().mockResolvedValue(reply(serp()));
    for (const keyword of [undefined, " ", "x".repeat(701)]) {
      expect((await runResearch({ ...input, provider: "dataforseo", market: "tw", keyword }, { env, budget: ledger, fetch: fetcher })).status).toBe("unsupported");
    }
    expect(ledger.reserve).not.toHaveBeenCalled();
    await runResearch({ ...input, provider: "dataforseo", keyword: "coffee" }, { env: { ...env, DATAFORSEO_MARKETS: "hk,tw" }, budget: ledger, fetch: fetcher });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)[0].location_code).toBe(2344);
  });
  it("retains only valid safe organic items and marks malformed rows and overflow partial", async () => {
    const items = [
      { type: "organic", title: "Good", url: "https://result.example.com/", rank_group: 1 },
      { type: "organic", title: "Bad URL", url: "javascript:alert(1)", rank_group: 2 },
      { type: "organic", title: "Bad rank", url: "https://result.example.com/", rank_group: -1 },
      { type: "paid", title: "Ad", url: "https://ad.example.com/", rank_group: 1 },
    ];
    const deps = { env, budget: budget(), fetch: vi.fn().mockResolvedValue(reply(serp(items))) };
    expect(await runResearch({ ...input, provider: "dataforseo", market: "tw", keyword: "coffee" }, deps)).toMatchObject({ status: "partial", items: [{ title: "Good" }], reason: "bounded_results" });
    const many = Array.from({ length: 12 }, (_, i) => ({ type: "organic", title: `Result ${i}`, url: "https://result.example.com/", rank_group: i + 1 }));
    deps.fetch.mockResolvedValue(reply(serp(many)));
    const result = await runResearch({ ...input, provider: "dataforseo", market: "tw", keyword: "coffee" }, deps);
    expect(result.status).toBe("partial"); expect(result.items).toHaveLength(10);
  });
  it.each([
    [firecrawl({ markdown: "text", metadata: { title: 5, statusCode: 200 } }), "partial"],
    [firecrawl({ markdown: "x".repeat(20001), metadata: { statusCode: 200 } }), "partial"],
    [firecrawl({ markdown: "", metadata: { statusCode: 200 } }), "empty"],
    [firecrawl({ markdown: 5, metadata: { statusCode: 200 } }), "failed"],
    [firecrawl({ markdown: "error text", metadata: { statusCode: 404 } }), "failed"],
    [{ success: false, error: "provider secret" }, "failed"],
  ])("handles honest Firecrawl bounded/malformed/failed results", async (payload, status) => {
    const result = await runResearch(input, { env, budget: budget(), fetch: vi.fn().mockResolvedValue(reply(payload)) });
    expect(result.status).toBe(status); expect(JSON.stringify(result)).not.toContain("provider secret");
    expect(result.items.every(item => typeof item.title === "string" && (!item.text || item.text.length <= 20000))).toBe(true);
  });
  it("rejects malformed provider envelopes and distinguishes honest empty results", async () => {
    for (const [payload, status] of [
      [serp([]), "empty"], [{ status_code: 20000, tasks: [] }, "failed"],
      [serp([{ type: "organic", title: "bad" }]), "failed"],
      [{ ...serp(), status_code: 40000 }, "failed"],
      [{ ...serp(), tasks: [{ status_code: 40000, cost: 0.01 }] }, "failed"],
    ] as const) {
      const result = await runResearch({ ...input, provider: "dataforseo", market: "tw", keyword: "coffee" }, { env, budget: budget(), fetch: vi.fn().mockResolvedValue(reply(payload)) });
      expect(result.status).toBe(status);
    }
  });
  it("keeps full reservations on HTTP rejection, invalid JSON, excessive bytes and fetch failure without retry", async () => {
    for (const response of [reply({ secret: "do not expose" }, 429), new Response("not JSON"), new Response("x", { headers: { "content-length": "1048577" } }), new Response("x".repeat(1048577))]) {
      const ledger = budget(), fetcher = vi.fn().mockResolvedValue(response);
      expect(await runResearch(input, { env, budget: ledger, fetch: fetcher })).toMatchObject({ status: "failed", items: [], budget: balance });
      expect(fetcher).toHaveBeenCalledTimes(1); expect(ledger.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed" }));
    }
    const ledger = budget(), fetcher = vi.fn().mockRejectedValue(new Error("private provider exception"));
    expect(await runResearch(input, { env, budget: ledger, fetch: fetcher })).toMatchObject({ status: "failed", reason: "provider_failed", budget: balance });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("enforces a deadline including a response body that never closes", async () => {
    vi.useFakeTimers();
    const ledger = budget();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"success":')); } });
    const pending = runResearch(input, { env, budget: ledger, fetch: vi.fn().mockResolvedValue(new Response(body)) });
    await vi.advanceTimersByTimeAsync(15000);
    expect(await pending).toMatchObject({ status: "failed", reason: "timeout", budget: balance });
    expect(ledger.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed" }));
  });
  it("reconciles reported provider overages upward and exposes a blocked account", async () => {
    const ledger = budget();
    vi.mocked(ledger.settle).mockResolvedValue({ allowed: false, reason: "pricing_ceiling_exceeded", budget: { workspaceRemainingUsd: 0.95, accountRemainingUsd: 1.95, reservedUsd: 0.05 } });
    const result = await runResearch({ ...input, provider: "dataforseo", market: "tw", keyword: "coffee" }, { env, budget: ledger, fetch: vi.fn().mockResolvedValue(reply(serp(undefined, 0.05))) });
    expect(ledger.settle).toHaveBeenCalledWith(expect.objectContaining({ reportedUsd: 0.05 }));
    expect(result).toMatchObject({ status: "blocked", reason: "pricing_ceiling_exceeded", budget: { reservedUsd: 0.05 } });
  });
  it("accounts for Firecrawl credits beyond the one-basic-credit reservation", async () => {
    const ledger = budget();
    await runResearch(input, { env, budget: ledger, fetch: vi.fn().mockResolvedValue(reply(firecrawl({ markdown: "text", metadata: { statusCode: 200, creditsUsed: 3 } }))) });
    expect(ledger.settle).toHaveBeenCalledWith(expect.objectContaining({ reportedUsd: 0.06 }));
  });
  it("reports failed reconciliation without pretending costs or data were fully verified", async () => {
    const ledger = budget();
    vi.mocked(ledger.settle).mockRejectedValue(new Error("fixture database secret"));
    const result = await runResearch(input, { env, budget: ledger, fetch: vi.fn().mockResolvedValue(reply(firecrawl())) });
    expect(result).toMatchObject({ status: "failed", reason: "budget_unavailable", budget: balance });
    expect(JSON.stringify(result)).not.toContain("fixture database secret");
  });
});

it.each([0,-1,199,300,399,NaN])("does not claim a successful scraped page for invalid HTTP status %s",async statusCode=>{
  const result=await runResearch(input,{env,budget:budget(),fetch:vi.fn().mockResolvedValue(reply(firecrawl({markdown:"not verified",metadata:{statusCode}})))});
  expect(result.status).not.toBe("ready");
});
