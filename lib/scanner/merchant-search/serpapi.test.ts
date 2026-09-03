import { describe, expect, it, vi } from "vitest";
import { buildSerpApiRequest, classifySerpApiResponse, resolveSerpApiKey, searchSerpApi } from "./serpapi";
import type { MerchantSearchAttempt } from "./types";

const attempt: MerchantSearchAttempt = {
  type: "search",
  q: "Kam Man Kitchen",
  ll: "@22.3193,114.1694,12z",
  hl: "en",
  gl: "hk",
};

describe("SerpApi request construction", () => {
  it("constructs the exact server-only Google Maps search request", () => {
    const request = buildSerpApiRequest(attempt, "sentinel-server-key");
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe("https://serpapi.com/search.json");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      engine: "google_maps",
      type: "search",
      q: "Kam Man Kitchen",
      ll: "@22.3193,114.1694,12z",
      hl: "en",
      gl: "hk",
      output: "json",
      api_key: "sentinel-server-key",
    });
    expect(url.searchParams.has("no_cache")).toBe(false);
    expect(url.search).toContain("q=Kam+Man+Kitchen");
    expect(url.search).toContain("ll=%4022.3193%2C114.1694%2C12z");
  });

  it("supports Taiwan origins and exact-place identities", () => {
    const request = buildSerpApiRequest({
      ...attempt,
      type: "place",
      q: "台北咖啡",
      ll: "@25.0330,121.5654,12z",
      hl: "zh-tw",
      gl: "tw",
      dataId: "0x123:0x456",
    }, "key");
    const params = new URL(request.url).searchParams;
    expect(params.get("type")).toBe("place");
    expect(params.get("data_id")).toBe("0x123:0x456");
    expect(params.get("gl")).toBe("tw");
    expect(params.get("ll")).toBe("@25.0330,121.5654,12z");
  });

  it("prefers SERPAPI_API_KEY and retains the legacy fallback", () => {
    expect(resolveSerpApiKey({ SERPAPI_API_KEY: " preferred ", SERPAPI_KEY: "legacy" })).toBe("preferred");
    expect(resolveSerpApiKey({ SERPAPI_KEY: " legacy " })).toBe("legacy");
  });

  it("returns a safe auth outcome without fetching when no key exists", async () => {
    const fetcher = vi.fn();
    await expect(searchSerpApi(attempt, { env: {}, fetcher })).resolves.toEqual(
      expect.objectContaining({ outcome: "PROVIDER_AUTH_ERROR", candidates: [] }),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("emits sanitized events without the key or provider URL", async () => {
    const event = vi.fn();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ search_metadata: { id: "s-1", status: "Success" }, local_results: [] }), { status: 200 }));
    await searchSerpApi(attempt, { env: { SERPAPI_API_KEY: "secret-value" }, fetcher, onEvent: event });
    const serialized = JSON.stringify(event.mock.calls);
    expect(serialized).not.toContain("secret-value");
    expect(serialized).not.toContain("serpapi.com/search");
    expect(serialized).not.toContain("api_key");
  });
});

describe("SerpApi outcome classification", () => {
  it.each([
    [401, "PROVIDER_AUTH_ERROR"],
    [403, "PROVIDER_PERMISSION_ERROR"],
    [429, "PROVIDER_QUOTA_ERROR"],
    [500, "PROVIDER_ERROR"],
    [503, "PROVIDER_ERROR"],
  ])("classifies HTTP %s", (status, outcome) => {
    expect(classifySerpApiResponse({ status, body: {}, durationMs: 4 }).outcome).toBe(outcome);
  });

  it("classifies successful candidates and explicit empty results", () => {
    expect(classifySerpApiResponse({ status: 200, body: { search_metadata: { status: "Success" }, local_results: [{ title: "Cafe" }] }, durationMs: 4 }).outcome).toBe("SUCCESS");
    expect(classifySerpApiResponse({ status: 200, body: { search_metadata: { status: "Success" }, local_results: [] }, durationMs: 4 }).outcome).toBe("NO_RESULTS");
  });

  it("treats absent local_results plus success or fully empty as no results", () => {
    for (const status of ["Success", "Fully empty"]) {
      expect(classifySerpApiResponse({ status: 200, body: { search_metadata: { status } }, durationMs: 4 }))
        .toEqual(expect.objectContaining({ outcome: "NO_RESULTS" }));
    }
  });

  it("recognizes the documented top-level Google no-results error", () => {
    expect(classifySerpApiResponse({ status: 200, body: { error: "Google hasn't returned any results for this query." }, durationMs: 4 }).outcome)
      .toBe("NO_RESULTS");
  });

  it("classifies metadata errors and invalid payloads safely", () => {
    expect(classifySerpApiResponse({ status: 200, body: { search_metadata: { status: "Error" } }, durationMs: 4 }).outcome).toBe("PROVIDER_ERROR");
    expect(classifySerpApiResponse({ status: 200, body: "invalid", durationMs: 4 }).outcome).toBe("PROVIDER_ERROR");
  });

  it("classifies timeout, network rejection, and invalid JSON", async () => {
    const timeout = vi.fn(async () => { throw new DOMException("timeout", "TimeoutError"); });
    const network = vi.fn(async () => { throw new TypeError("network"); });
    const invalidJson = vi.fn(async () => new Response("{", { status: 200 }));
    await expect(searchSerpApi(attempt, { env: { SERPAPI_API_KEY: "x" }, fetcher: timeout })).resolves.toEqual(expect.objectContaining({ outcome: "TIMEOUT" }));
    await expect(searchSerpApi(attempt, { env: { SERPAPI_API_KEY: "x" }, fetcher: network })).resolves.toEqual(expect.objectContaining({ outcome: "NETWORK_ERROR" }));
    await expect(searchSerpApi(attempt, { env: { SERPAPI_API_KEY: "x" }, fetcher: invalidJson })).resolves.toEqual(expect.objectContaining({ outcome: "PROVIDER_ERROR" }));
  });
});
