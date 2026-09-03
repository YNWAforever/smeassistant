import { describe, expect, it, vi } from "vitest";
import { searchMerchants, type MerchantSearchCache } from "./service";
import type { MerchantSearchAttempt, MerchantSearchProviderResult, MerchantSearchResponse } from "./types";

function providerResult(outcome: MerchantSearchProviderResult["outcome"], name?: string): MerchantSearchProviderResult {
  return {
    outcome,
    candidates: name ? [{ id: name, provider: "serpapi", name, alternateNames: [], permanentlyClosed: false, address: "Hong Kong" }] : [],
    metadata: { localResultsState: name ? "present" : "empty", durationMs: 5, searchId: "s-1", status: "Success" },
  };
}

function cache(hit?: Awaited<ReturnType<typeof searchMerchants>>): MerchantSearchCache {
  return { get: vi.fn(async () => hit ?? null), set: vi.fn(async () => undefined) };
}

describe("merchant search service", () => {
  it("returns a cache hit without a provider call", async () => {
    const hit: MerchantSearchResponse = { outcome: "NO_RESULTS", candidates: [], correlationId: "old", cached: true };
    const store = cache(hit);
    const provider = vi.fn();
    const result = await searchMerchants({ query: "Kam Man Kitchen", market: "HK", correlationId: "corr" }, { cache: store, provider });
    expect(result).toEqual(expect.objectContaining({ outcome: "NO_RESULTS", cached: true, correlationId: "corr" }));
    expect(provider).not.toHaveBeenCalled();
  });

  it("stops after the exact attempt returns useful candidates", async () => {
    const provider = vi.fn(async (_attempt: MerchantSearchAttempt) => providerResult("SUCCESS", "Kam Man Kitchen"));
    const result = await searchMerchants({ query: "Kam Man Kitchen", market: "HK", correlationId: "corr" }, { cache: cache(), provider });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ q: "Kam Man Kitchen" }));
    expect(result.outcome).toBe("SUCCESS");
  });

  it("advances sequentially through no-results and stops on attempt two success", async () => {
    const provider = vi.fn()
      .mockResolvedValueOnce(providerResult("NO_RESULTS"))
      .mockResolvedValueOnce(providerResult("SUCCESS", "Kam Man Kitchen HK"));
    const result = await searchMerchants({ query: "Kam Man Kitchen", market: "HK", correlationId: "corr" }, { cache: cache(), provider });
    expect(provider).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe("SUCCESS");
  });

  it("continues past low-confidence cross-market matches", async () => {
    const provider = vi.fn()
      .mockResolvedValueOnce({
        ...providerResult("SUCCESS"),
        candidates: [{
          id: "wrong-market",
          provider: "serpapi",
          name: "Unrelated Merchant",
          alternateNames: [],
          permanentlyClosed: false,
          address: "Taipei, Taiwan",
          latitude: 25.033,
          longitude: 121.5654,
        }],
      })
      .mockResolvedValueOnce(providerResult("SUCCESS", "Kam Man Kitchen"));
    const result = await searchMerchants(
      { query: "Kam Man Kitchen", market: "HK", correlationId: "corr" },
      { cache: cache(), provider },
    );
    expect(provider).toHaveBeenCalledTimes(2);
    expect(result.candidates[0]).toEqual(expect.objectContaining({ name: "Kam Man Kitchen" }));
  });

  it("runs at most three sequential no-result calls", async () => {
    let active = 0;
    let maximumActive = 0;
    const provider = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return providerResult("NO_RESULTS");
    });
    const result = await searchMerchants({ query: "Kam Man Kitchen", market: "HK", correlationId: "corr" }, { cache: cache(), provider });
    expect(provider).toHaveBeenCalledTimes(3);
    expect(maximumActive).toBe(1);
    expect(result.outcome).toBe("NO_RESULTS");
  });

  it("stops issuing attempts once the caller's signal is aborted between attempts", async () => {
    const controller = new AbortController();
    const provider = vi.fn(async () => {
      controller.abort();
      return providerResult("NO_RESULTS");
    });
    const result = await searchMerchants(
      { query: "Kam Man Kitchen", market: "HK", correlationId: "corr" },
      { cache: cache(), provider, signal: controller.signal },
    );
    expect(provider).toHaveBeenCalledTimes(1);
    expect(result.correlationId).toBe("corr");
  });

  it("does not cache a result produced by an abort-shortened attempt sequence", async () => {
    const controller = new AbortController();
    const store = cache();
    const provider = vi.fn(async () => {
      controller.abort();
      return providerResult("NO_RESULTS");
    });
    await searchMerchants(
      { query: "Kam Man Kitchen", market: "HK", correlationId: "corr" },
      { cache: store, provider, signal: controller.signal },
    );
    expect(store.set).not.toHaveBeenCalled();
  });

  it.each(["PROVIDER_AUTH_ERROR", "PROVIDER_QUOTA_ERROR", "PROVIDER_ERROR", "TIMEOUT", "NETWORK_ERROR"] as const)(
    "does not blindly fall back after %s",
    async (outcome) => {
      const provider = vi.fn(async () => providerResult(outcome));
      const result = await searchMerchants({ query: "Kam Man Kitchen", market: "HK", correlationId: "corr" }, { cache: cache(), provider });
      expect(provider).toHaveBeenCalledTimes(1);
      expect(result.outcome).toBe(outcome);
    },
  );

  it("ranks and caps combined candidates at eight", async () => {
    const provider = vi.fn(async () => ({
      ...providerResult("SUCCESS"),
      candidates: Array.from({ length: 12 }, (_, index) => ({ id: `c-${index}`, provider: "serpapi" as const, name: "Cafe", alternateNames: [], permanentlyClosed: false })),
    }));
    const result = await searchMerchants({ query: "Cafe", market: "HK", correlationId: "corr" }, { cache: cache(), provider });
    expect(result.candidates).toHaveLength(8);
  });

  it("propagates production provider cache hits to telemetry and responses", async () => {
    const logger = vi.fn();
    const hit = providerResult("SUCCESS", "Kam Man Kitchen");
    hit.metadata.cacheStatus = "hit";
    const result = await searchMerchants(
      { query: "Kam Man Kitchen", market: "HK", correlationId: "corr" },
      { provider: vi.fn(async () => hit), logger },
    );
    expect(result.cached).toBe(true);
    expect(logger).toHaveBeenCalledWith(expect.objectContaining({ cacheStatus: "hit" }));
  });

  it("emits sanitized attempt telemetry and caches only successful outcomes", async () => {
    const logger = vi.fn();
    const store = cache();
    await searchMerchants({ query: "Kam Man Kitchen", market: "HK", correlationId: "corr" }, {
      cache: store,
      provider: vi.fn(async () => providerResult("SUCCESS", "Kam Man Kitchen")),
      logger,
    });
    expect(store.set).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(logger.mock.calls);
    expect(serialized).not.toContain("Kam Man Kitchen");
    expect(serialized).not.toContain("serpapi.com");
  });
});
