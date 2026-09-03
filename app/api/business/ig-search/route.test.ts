import { beforeEach, describe, expect, it, vi } from "vitest";

const candidate = {
  id: "ig:kamman.hk",
  handle: "kamman.hk",
  profileUrl: "https://www.instagram.com/kamman.hk/",
  provenance: "picker_confirmed",
};

// Next's real unstable_cache needs an incremental-cache request context that
// does not exist under vitest ("Invariant: incrementalCache missing"). A
// passthrough keeps the route's real wiring under test -- the chain still runs,
// the sources are still called -- without pretending to exercise Next's cache,
// which lib/scanner/merchant-search/cache.test.ts owns.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: string[]) => Promise<unknown>) => fn,
}));

// Default posture matches production-before-the-spike: RapidAPI reports it
// cannot answer, so the chain falls through to SerpApi.
vi.mock("@/lib/scanner/ig-search/rapidapi", () => ({
  searchInstagramRapidApi: vi.fn(async () => ({ outcome: "UNSUPPORTED", candidates: [] })),
}));

vi.mock("@/lib/scanner/ig-search/serpapi", () => ({
  searchInstagramSerpApi: vi.fn(async () => ({
    outcome: "SUCCESS",
    candidates: [candidate],
    metadata: { organicResultsState: "present", durationMs: 3 },
  })),
}));

import { POST } from "./route";
import { searchInstagramRapidApi } from "@/lib/scanner/ig-search/rapidapi";
import { searchInstagramSerpApi } from "@/lib/scanner/ig-search/serpapi";

const SESSION_ID = "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";

function post(body: unknown): Request {
  return new Request("https://scanner.test/api/business/ig-search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = { businessName: "金萬餐廳", market: "HK", sessionId: SESSION_ID, district: "跑馬地" };

describe("POST /api/business/ig-search", () => {
  // Several cases below assert which sources ran, so per-test call counts have
  // to start from zero.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns candidates for a valid request", async () => {
    const response = await POST(post(valid));
    expect(response.status).toBe(200);
    const body = await response.json() as { outcome: string; candidates: Array<{ handle: string }> };
    expect(body.outcome).toBe("SUCCESS");
    expect(body.candidates[0]?.handle).toBe("kamman.hk");
  });

  it("never caches the response at a shared layer", async () => {
    const response = await POST(post(valid));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("https://scanner.test/api/business/ig-search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect((await response.json() as { error: string }).error).toBe("INVALID_REQUEST");
  });

  it("rejects a bad market, a bad session id, and a too-short name", async () => {
    expect((await POST(post({ ...valid, market: "SG" }))).status).toBe(400);
    expect((await POST(post({ ...valid, sessionId: "nope" }))).status).toBe(400);
    expect((await POST(post({ ...valid, businessName: "金" }))).status).toBe(400);
  });

  it("rejects an oversized website url instead of passing it to path A", async () => {
    expect((await POST(post({ ...valid, websiteUrl: "https://x.example/" + "a".repeat(2_100) }))).status).toBe(400);
  });

  it("resolves the free path-A candidate without spending anything", async () => {
    const response = await POST(post({ ...valid, websiteUrl: "https://www.instagram.com/kamman.hk/" }));
    const body = await response.json() as { candidates: Array<{ provenance: string }> };
    expect(body.candidates[0]?.provenance).toBe("gbp_cross_referenced");
    expect(searchInstagramRapidApi).not.toHaveBeenCalled();
    expect(searchInstagramSerpApi).not.toHaveBeenCalled();
  });

  it("prefers RapidAPI and never reaches SerpApi when it answers", async () => {
    vi.mocked(searchInstagramRapidApi).mockResolvedValueOnce({ outcome: "SUCCESS", candidates: [candidate] } as never);
    await POST(post(valid));
    expect(searchInstagramRapidApi).toHaveBeenCalledTimes(1);
    expect(searchInstagramSerpApi).not.toHaveBeenCalled();
  });

  it("falls through to SerpApi when RapidAPI reports UNSUPPORTED", async () => {
    const response = await POST(post(valid));
    expect(response.status).toBe(200);
    expect(searchInstagramRapidApi).toHaveBeenCalledTimes(1);
    expect(searchInstagramSerpApi).toHaveBeenCalledTimes(1);
  });

  it("does not leak UNSUPPORTED to the client as an outcome", async () => {
    vi.mocked(searchInstagramSerpApi).mockResolvedValueOnce({
      outcome: "NO_RESULTS",
      candidates: [],
      metadata: { organicResultsState: "empty", durationMs: 1 },
    } as never);
    const body = await (await POST(post(valid))).json() as { outcome: string };
    expect(body.outcome).toBe("NO_RESULTS");
  });

  it("maps a provider quota failure to 503", async () => {
    vi.mocked(searchInstagramSerpApi).mockResolvedValueOnce({
      outcome: "PROVIDER_QUOTA_ERROR",
      candidates: [],
      metadata: { organicResultsState: "absent", durationMs: 1 },
    } as never);
    const response = await POST(post(valid));
    expect(response.status).toBe(503);
  });

  it("maps a timeout to 504", async () => {
    vi.mocked(searchInstagramSerpApi).mockResolvedValueOnce({
      outcome: "TIMEOUT",
      candidates: [],
      metadata: { organicResultsState: "absent", durationMs: 1 },
    } as never);
    expect((await POST(post(valid))).status).toBe(504);
  });
});
