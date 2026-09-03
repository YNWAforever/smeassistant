import { AsyncLocalStorage } from "node:async_hooks";
import { unstable_cache } from "next/cache";
import type { MerchantSearchLanguage } from "@sme-scanner/region";
import type { MerchantSearchMarket } from "./market";
import type { MerchantSearchOutcome } from "./types";

export const MERCHANT_SEARCH_CACHE_VERSION = "v1";
export const MERCHANT_SEARCH_CACHE_TTL_SECONDS = 15 * 60;

export interface MerchantSearchCacheDimensions {
  market: MerchantSearchMarket;
  language: MerchantSearchLanguage;
  normalizedQuery: string;
  latitude?: number;
  longitude?: number;
  zoom?: number;
  placeId?: string;
  dataId?: string;
  dataCid?: string;
}

function rounded(value: number | undefined): string {
  return value === undefined ? "-" : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function identity(value: string | undefined): string {
  return value ? encodeURIComponent(value) : "-";
}

export function buildMerchantSearchCacheKey(input: MerchantSearchCacheDimensions): string {
  return [
    "merchant-search",
    MERCHANT_SEARCH_CACHE_VERSION,
    input.market,
    input.language,
    input.normalizedQuery,
    rounded(input.latitude),
    rounded(input.longitude),
    input.zoom ?? "-",
    identity(input.placeId),
    identity(input.dataId),
    identity(input.dataCid),
  ].join(":");
}

export function isCacheableMerchantSearchOutcome(outcome: MerchantSearchOutcome): boolean {
  return outcome === "SUCCESS" || outcome === "NO_RESULTS";
}

/**
 * The minimum a cached provider result must satisfy. Merchant search and
 * Instagram search results both do: the cacheability predicate reads only
 * `outcome`, and the executor only ever writes `metadata.cacheStatus`.
 */
export interface CacheableProviderResult {
  outcome: MerchantSearchOutcome;
  // Deliberately `object` rather than `{ cacheStatus?: ... }`. The latter is a
  // WEAK type (every property optional), so TypeScript rejects any metadata
  // that has no property in common with it -- which is every real provider's
  // metadata. The executor only ever spreads this and adds cacheStatus, so the
  // shape it needs is "some object", nothing more.
  metadata: object;
}

/**
 * What the executor hands back: the provider's own result, with the cacheStatus
 * it stamped on. Spelling this out in the return type is what lets a caller
 * read `result.metadata.cacheStatus` without the provider having had to declare
 * a field only this wrapper ever writes.
 */
export type WithCacheStatus<R extends CacheableProviderResult> =
  Omit<R, "metadata"> & { metadata: R["metadata"] & { cacheStatus?: "hit" | "miss" | "bypass" } };

class NonCacheableProviderOutcome<R> extends Error {
  constructor(readonly providerResult: R) {
    super("Non-cacheable provider outcome");
  }
}

export function createCachedProviderExecutor<R extends CacheableProviderResult>(
  provider: (serializedAttempt: string, signal?: AbortSignal) => Promise<R>,
  // Required, not defaulted: every executor this factory returns shares one
  // unstable_cache key space, discriminated ONLY by the serialized attempt.
  // A default would let a second provider silently inherit the first's
  // namespace and serve its cached rows.
  cacheNamespace: string,
): (serializedAttempt: string, signal?: AbortSignal) => Promise<WithCacheStatus<R>> {
  const execution = new AsyncLocalStorage<{ executed: boolean; signal?: AbortSignal }>();
  const cached = unstable_cache(async (serializedAttempt: string) => {
    const context = execution.getStore();
    if (context) context.executed = true;
    // The signal rides the same AsyncLocalStorage context used for cacheStatus
    // rather than becoming an argument to this function: unstable_cache derives
    // its cache key from these arguments, and an AbortSignal is neither a stable
    // nor a serializable cache key component.
    const providerResult = await provider(serializedAttempt, context?.signal);
    if (!isCacheableMerchantSearchOutcome(providerResult.outcome)) throw new NonCacheableProviderOutcome(providerResult);
    return providerResult;
  }, [cacheNamespace, MERCHANT_SEARCH_CACHE_VERSION], { revalidate: MERCHANT_SEARCH_CACHE_TTL_SECONDS });

  // Two narrow assertions, both confined to this module. A spread of a generic
  // is not assignable back to that generic (R could carry properties this
  // function cannot see), but the only change made here is the metadata field
  // WithCacheStatus declares -- so the shape is preserved by construction.
  return async (serializedAttempt, signal) => execution.run({ executed: false, signal }, async () => {
    try {
      const providerResult = await cached(serializedAttempt);
      const cacheStatus = execution.getStore()?.executed ? "miss" : "hit";
      return { ...providerResult, metadata: { ...providerResult.metadata, cacheStatus } } as WithCacheStatus<R>;
    } catch (error) {
      if (error instanceof NonCacheableProviderOutcome) {
        // `instanceof` on a generic class narrows to <unknown>, so the payload
        // needs re-asserting; nothing but the closure above ever throws this.
        const providerResult = error.providerResult as R;
        return {
          ...providerResult,
          metadata: { ...providerResult.metadata, cacheStatus: "bypass" },
        } as WithCacheStatus<R>;
      }
      throw error;
    }
  });
}
