import { describe, expect, it, vi } from "vitest";

// `entries` is module-level ON PURPOSE. Production's unstable_cache is one
// shared store keyed by (keyParts, args) -- every caller writes into the same
// space. A per-closure Map would give each executor a private cache, which is
// exactly the collision this file's namespacing test exists to catch, and would
// make that test pass whether or not the namespace is wired up at all.
vi.mock("next/cache", () => {
  const entries = new Map<string, unknown>();
  return {
    unstable_cache: (fn: (...args: string[]) => Promise<unknown>, keyParts: string[] = []) => {
      return async (...args: string[]) => {
        const key = JSON.stringify([keyParts, args]);
        if (entries.has(key)) return entries.get(key);
        const value = await fn(...args);
        entries.set(key, value);
        return value;
      };
    },
  };
});

import {
  MERCHANT_SEARCH_CACHE_TTL_SECONDS,
  buildMerchantSearchCacheKey,
  createCachedProviderExecutor,
  isCacheableMerchantSearchOutcome,
} from "./cache";

describe("merchant search cache", () => {
  it("uses a versioned privacy-safe key with all result-shaping dimensions", () => {
    expect(buildMerchantSearchCacheKey({
      market: "HK",
      language: "en",
      normalizedQuery: "kam man kitchen",
      latitude: 22.2690553,
      longitude: 114.1843662,
      zoom: 17,
      placeId: "ChIJ1",
      dataId: "0x1:0x2",
      dataCid: "123",
    })).toBe("merchant-search:v1:HK:en:kam man kitchen:22.2691:114.1844:17:ChIJ1:0x1%3A0x2:123");
  });

  it("reports truthful miss and hit status from the production cache wrapper", async () => {
    const provider = vi.fn(async () => ({
      outcome: "NO_RESULTS" as const,
      candidates: [],
      metadata: { localResultsState: "empty" as const, durationMs: 5 },
    }));
    const execute = createCachedProviderExecutor(provider, "merchant-search-provider");
    const first = await execute("{\"q\":\"Cafe\"}");
    const second = await execute("{\"q\":\"Cafe\"}");
    expect(first.metadata.cacheStatus).toBe("miss");
    expect(second.metadata.cacheStatus).toBe("hit");
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("does not serve one namespace's cached result to another", async () => {
    const calls: string[] = [];
    const make = (label: string, namespace: string) =>
      createCachedProviderExecutor(async (serializedAttempt: string) => {
        calls.push(`${label}:${serializedAttempt}`);
        return {
          outcome: "SUCCESS" as const,
          candidates: [],
          metadata: { localResultsState: "present" as const, durationMs: 1, label },
        };
      }, namespace);

    const first = make("alpha", "alpha-provider");
    const second = make("beta", "beta-provider");
    const attempt = "{\"q\":\"same\"}";

    const alpha = await first(attempt);
    const beta = await second(attempt);

    expect(alpha.metadata.label).toBe("alpha");
    expect(beta.metadata.label).toBe("beta");
    expect(calls).toEqual([`alpha:${attempt}`, `beta:${attempt}`]);
  });

  it("caches only success and honest no-results for fifteen minutes", () => {
    expect(MERCHANT_SEARCH_CACHE_TTL_SECONDS).toBe(900);
    expect(isCacheableMerchantSearchOutcome("SUCCESS")).toBe(true);
    expect(isCacheableMerchantSearchOutcome("NO_RESULTS")).toBe(true);
    for (const outcome of ["PROVIDER_AUTH_ERROR", "PROVIDER_QUOTA_ERROR", "PROVIDER_ERROR", "TIMEOUT", "NETWORK_ERROR"] as const) {
      expect(isCacheableMerchantSearchOutcome(outcome)).toBe(false);
    }
  });
});
