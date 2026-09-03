import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 1 })),
  searchMerchants: vi.fn(),
  resolveGoogleMapsUrl: vi.fn(),
  searchSerpApi: vi.fn(),
  resolveAnalyticsSession: vi.fn(() => ({ id: "11111111-1111-4111-8111-111111111111", created: false })),
  setAnalyticsSessionCookie: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  rateLimitedResponse: vi.fn((retryAfterSeconds: number) => new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfterSeconds) },
  })),
}));
vi.mock("@/lib/scanner/merchant-search/service", () => ({ searchMerchants: mocks.searchMerchants }));
vi.mock("@/lib/scanner/merchant-search/maps-url", () => ({ resolveGoogleMapsUrl: mocks.resolveGoogleMapsUrl }));
vi.mock("@/lib/scanner/merchant-search/serpapi", () => ({ searchSerpApi: mocks.searchSerpApi }));
vi.mock("@/lib/analytics/record-event", () => ({
  resolveAnalyticsSession: mocks.resolveAnalyticsSession,
  setAnalyticsSessionCookie: mocks.setAnalyticsSessionCookie,
}));

import * as route from "./route";

function request(body: unknown): Request {
  return new Request("https://scanner.test/api/business/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.42" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/business/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
    mocks.searchMerchants.mockResolvedValue({ outcome: "NO_RESULTS", candidates: [], correlationId: "corr" });
    mocks.resolveGoogleMapsUrl.mockResolvedValue({ ok: true, value: { name: "Kam Man Kitchen" } });
    mocks.resolveAnalyticsSession.mockReturnValue({ id: "11111111-1111-4111-8111-111111111111", created: false });
  });

  it("does not expose the legacy GET handler", () => {
    expect("GET" in route).toBe(false);
    expect(route.POST).toBeTypeOf("function");
  });

  it.each([
    ["market", { query: "Cafe", market: "US", sessionId: SESSION_ID }],
    ["session", { query: "Cafe", market: "HK", sessionId: "bad" }],
    ["short query", { query: "C", market: "HK", sessionId: SESSION_ID }],
    ["long query", { query: "C".repeat(121), market: "HK", sessionId: SESSION_ID }],
    ["long Maps URL", { query: "Cafe", market: "HK", sessionId: SESSION_ID, mapsUrl: `https://maps.app.goo.gl/${"a".repeat(2050)}` }],
  ])("rejects invalid %s before limiter or service work", async (_case, body) => {
    const response = await route.POST(request(body));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).correlationId).toMatch(/[0-9a-f-]{36}/i);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.searchMerchants).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON safely", async () => {
    const response = await route.POST(new Request("https://scanner.test/api/business/search", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({ error: "INVALID_REQUEST" }));
  });

  it("delegates exactly once with validated session rate limiting", async () => {
    const req = request({ query: "Kam Man Kitchen", market: "HK", sessionId: SESSION_ID });
    const response = await route.POST(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith({
      req,
      scope: "business_search",
      identifiers: [SESSION_ID],
      failClosed: false,
    });
    expect(mocks.searchMerchants).toHaveBeenCalledTimes(1);
    expect(mocks.searchMerchants).toHaveBeenCalledWith(
      expect.objectContaining({ query: "Kam Man Kitchen", market: "HK", correlationId: expect.any(String) }),
      expect.objectContaining({ provider: expect.any(Function) }),
    );
  });

  it("returns honest no-results as HTTP 200", async () => {
    const response = await route.POST(request({ query: "No Such Merchant", market: "HK", sessionId: SESSION_ID }));
    expect(await response.json()).toEqual(expect.objectContaining({ outcome: "NO_RESULTS", candidates: [] }));
    expect(response.status).toBe(200);
  });

  it("uses the merchant name resolved from a Maps URL as the effective query", async () => {
    const mapsUrl = "https://maps.app.goo.gl/abc";
    await route.POST(request({ query: "Google Maps merchant", market: "HK", sessionId: SESSION_ID, mapsUrl }));
    expect(mocks.resolveGoogleMapsUrl).toHaveBeenCalledWith(mapsUrl);
    expect(mocks.searchMerchants).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Kam Man Kitchen",
        maps: expect.objectContaining({ name: "Kam Man Kitchen" }),
      }),
      expect.anything(),
    );
  });

  it.each([
    ["INVALID_MAPS_URL", 400],
    ["PROVIDER_AUTH_ERROR", 503],
    ["PROVIDER_PERMISSION_ERROR", 503],
    ["PROVIDER_QUOTA_ERROR", 503],
    ["PROVIDER_ERROR", 502],
    ["TIMEOUT", 504],
    ["NETWORK_ERROR", 502],
  ] as const)("maps %s to safe HTTP %s", async (outcome, status) => {
    if (outcome === "INVALID_MAPS_URL") mocks.resolveGoogleMapsUrl.mockResolvedValueOnce({ ok: false, error: outcome });
    else mocks.searchMerchants.mockResolvedValueOnce({ outcome, candidates: [], correlationId: "ignored", raw: "secret provider error" });
    const body = outcome === "INVALID_MAPS_URL"
      ? { query: "Cafe", market: "HK", sessionId: SESSION_ID, mapsUrl: "https://maps.app.goo.gl/bad" }
      : { query: "Cafe", market: "HK", sessionId: SESSION_ID };
    const response = await route.POST(request(body));
    const serialized = JSON.stringify(await response.json());
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(serialized).toContain(outcome);
    expect(serialized).not.toContain("secret provider error");
  });

  it("returns private rate-limit JSON and preserves retry metadata", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 37 });
    const response = await route.POST(request({ query: "Cafe", market: "HK", sessionId: SESSION_ID }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("37");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(expect.objectContaining({ error: "RATE_LIMITED", correlationId: expect.any(String) }));
    expect(mocks.searchMerchants).not.toHaveBeenCalled();
  });

  it("sets the analytics session cookie only through the existing convention", async () => {
    mocks.resolveAnalyticsSession.mockReturnValueOnce({ id: "22222222-2222-4222-8222-222222222222", created: true });
    const response = await route.POST(request({ query: "Cafe", market: "HK", sessionId: SESSION_ID }));
    expect(mocks.setAnalyticsSessionCookie).toHaveBeenCalledWith(response, expect.objectContaining({ created: true }));
  });
});
