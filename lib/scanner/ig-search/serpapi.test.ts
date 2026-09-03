import { describe, expect, it, vi } from "vitest";
import { buildIgSerpApiRequest, classifyIgSearchResponse, searchInstagramSerpApi } from "./serpapi";
import type { IgSearchAttempt } from "./types";

const attempt: IgSearchAttempt = {
  q: 'site:instagram.com "金萬餐廳" 跑馬地 Hong Kong',
  hl: "zh-hk",
  gl: "hk",
  location: "Hong Kong",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("buildIgSerpApiRequest", () => {
  it("targets the google engine with the attempt's locale parameters", () => {
    const { url } = buildIgSerpApiRequest(attempt, "test-key");
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://serpapi.com/search.json");
    expect(parsed.searchParams.get("engine")).toBe("google");
    expect(parsed.searchParams.get("q")).toBe(attempt.q);
    expect(parsed.searchParams.get("hl")).toBe("zh-hk");
    expect(parsed.searchParams.get("gl")).toBe("hk");
    expect(parsed.searchParams.get("location")).toBe("Hong Kong");
    expect(parsed.searchParams.get("num")).toBe("10");
    expect(parsed.searchParams.get("api_key")).toBe("test-key");
  });
});

describe("classifyIgSearchResponse", () => {
  it("returns SUCCESS with candidates from organic_results", () => {
    const result = classifyIgSearchResponse({
      status: 200,
      durationMs: 12,
      body: {
        search_metadata: { id: "abc", status: "Success" },
        organic_results: [
          { link: "https://www.instagram.com/kamman.hk/", title: "金萬餐廳 (@kamman.hk) • Instagram" },
          { link: "https://www.instagram.com/p/Cabc/", title: "A post" },
        ],
      },
    });
    expect(result.outcome).toBe("SUCCESS");
    expect(result.candidates.map((candidate) => candidate.handle)).toEqual(["kamman.hk"]);
    expect(result.metadata.organicResultsState).toBe("present");
    expect(result.metadata.searchId).toBe("abc");
  });

  it("returns NO_RESULTS when organic_results holds no profile links", () => {
    const result = classifyIgSearchResponse({
      status: 200,
      durationMs: 8,
      body: { organic_results: [{ link: "https://www.instagram.com/explore/tags/hk/" }] },
    });
    expect(result.outcome).toBe("NO_RESULTS");
    expect(result.candidates).toEqual([]);
  });

  it("returns NO_RESULTS for an empty organic_results array", () => {
    expect(classifyIgSearchResponse({ status: 200, durationMs: 5, body: { organic_results: [] } }).outcome)
      .toBe("NO_RESULTS");
  });

  it("maps SerpApi's no-results error text to NO_RESULTS", () => {
    expect(classifyIgSearchResponse({
      status: 200,
      durationMs: 5,
      body: { error: "Google hasn't returned any results for this query." },
    }).outcome).toBe("NO_RESULTS");
  });

  it("maps an api-key error to PROVIDER_AUTH_ERROR", () => {
    expect(classifyIgSearchResponse({ status: 200, durationMs: 5, body: { error: "Invalid API key" } }).outcome)
      .toBe("PROVIDER_AUTH_ERROR");
  });

  it("maps HTTP failures through the shared classifier", () => {
    expect(classifyIgSearchResponse({ status: 429, durationMs: 5, body: {} }).outcome).toBe("PROVIDER_QUOTA_ERROR");
    expect(classifyIgSearchResponse({ status: 503, durationMs: 5, body: {} }).outcome).toBe("PROVIDER_ERROR");
  });

  it("treats a non-object body as a provider error", () => {
    const result = classifyIgSearchResponse({ status: 200, durationMs: 5, body: "nope" });
    expect(result.outcome).toBe("PROVIDER_ERROR");
    expect(result.metadata.organicResultsState).toBe("invalid");
  });
});

describe("searchInstagramSerpApi", () => {
  it("returns PROVIDER_AUTH_ERROR without fetching when no key is configured", async () => {
    const fetcher = vi.fn();
    const result = await searchInstagramSerpApi(attempt, { env: {}, fetcher: fetcher as unknown as typeof fetch });
    expect(result.outcome).toBe("PROVIDER_AUTH_ERROR");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("resolves the key through the shared resolver, accepting the legacy name", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ organic_results: [] }));
    await searchInstagramSerpApi(attempt, {
      env: { SERPAPI_KEY: "legacy-key" },
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(new URL(fetcher.mock.calls[0]![0]).searchParams.get("api_key")).toBe("legacy-key");
  });

  it("maps an aborted fetch to TIMEOUT", async () => {
    const fetcher = vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    const result = await searchInstagramSerpApi(attempt, {
      env: { SERPAPI_API_KEY: "k" },
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(result.outcome).toBe("TIMEOUT");
  });

  it("emits exactly one event for one logical search", async () => {
    const onEvent = vi.fn();
    await searchInstagramSerpApi(attempt, {
      env: { SERPAPI_API_KEY: "k" },
      fetcher: (async () => jsonResponse({ organic_results: [] })) as unknown as typeof fetch,
      onEvent,
    });
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]![0]).toMatchObject({ provider: "serpapi", outcome: "NO_RESULTS", candidateCount: 0 });
  });
});
