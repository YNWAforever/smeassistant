import { buildMerchantSearchCacheKey, isCacheableMerchantSearchOutcome, MERCHANT_SEARCH_CACHE_TTL_SECONDS } from "./cache";
import { detectMerchantQueryLanguage, merchantQueryComparisonKey, normalizeMerchantQuery } from "./query";
import { rankMerchantCandidates } from "./ranking";
import { buildMerchantSearchPlan } from "./search-plan";
import { merchantSearchTelemetryEvent, type MerchantSearchTelemetryEvent } from "./telemetry";
import type { MerchantSearchMarket } from "./market";
import type {
  MerchantSearchAttempt,
  MerchantSearchProviderResult,
  MerchantSearchResponse,
  ParsedGoogleMapsMerchant,
} from "./types";

export interface MerchantSearchServiceInput {
  query: string;
  market: MerchantSearchMarket;
  correlationId: string;
  maps?: ParsedGoogleMapsMerchant;
  district?: string;
  category?: string;
}

export interface MerchantSearchCache {
  get(key: string): Promise<MerchantSearchResponse | null>;
  set(key: string, value: MerchantSearchResponse, ttlSeconds: number): Promise<void>;
}

export interface MerchantSearchServiceDependencies {
  cache?: MerchantSearchCache;
  provider: (attempt: MerchantSearchAttempt) => Promise<MerchantSearchProviderResult>;
  logger?: (event: MerchantSearchTelemetryEvent) => void;
  /**
   * The caller's own AbortSignal (e.g. `req.signal`), threaded through so an
   * abandoned request stops issuing SerpApi searches nobody is waiting for.
   * Checked only between attempts — the first attempt always runs, matching
   * how a client-disconnect is only ever observed once work is in flight.
   */
  signal?: AbortSignal;
}

const NO_CACHE: MerchantSearchCache = {
  get: async () => null,
  set: async () => undefined,
};

function confidenceCounts(candidates: MerchantSearchResponse["candidates"]): { high: number; medium: number; low: number } {
  return candidates.reduce((counts, candidate) => {
    counts[candidate.matchConfidence ?? "low"] += 1;
    return counts;
  }, { high: 0, medium: 0, low: 0 });
}

export async function searchMerchants(
  input: MerchantSearchServiceInput,
  dependencies: MerchantSearchServiceDependencies,
): Promise<MerchantSearchResponse> {
  const normalizedQuery = normalizeMerchantQuery(input.query || input.maps?.name || "");
  const language = detectMerchantQueryLanguage(normalizedQuery, input.market);
  const key = buildMerchantSearchCacheKey({
    market: input.market,
    language,
    normalizedQuery: merchantQueryComparisonKey(normalizedQuery),
    latitude: input.maps?.latitude,
    longitude: input.maps?.longitude,
    zoom: input.maps?.zoom,
    placeId: input.maps?.placeId,
    dataId: input.maps?.dataId,
    dataCid: input.maps?.dataCid,
  });
  const store = dependencies.cache ?? NO_CACHE;
  const cached = await store.get(key);
  if (cached) {
    const response = { ...cached, correlationId: input.correlationId, cached: true };
    dependencies.logger?.(merchantSearchTelemetryEvent({
      correlationId: input.correlationId,
      market: input.market,
      language,
      attempt: 0,
      outcome: response.outcome,
      latencyMs: 0,
      candidateCount: response.candidates.length,
      confidenceCounts: confidenceCounts(response.candidates),
      cacheStatus: "hit",
    }));
    return response;
  }

  const plan = buildMerchantSearchPlan({ query: normalizedQuery, market: input.market, maps: input.maps });
  if (!plan.length) return { outcome: "NO_RESULTS", candidates: [], correlationId: input.correlationId, cached: false };

  let finalProviderResult: MerchantSearchProviderResult | null = null;
  let fullyCached = true;
  const collectedCandidates: MerchantSearchProviderResult["candidates"] = [];
  for (let index = 0; index < Math.min(plan.length, 3); index += 1) {
    // Only checked between attempts, not before the first: the caller wasn't
    // waiting on nothing when this request started, so attempt 1 always
    // runs. This is the actual cost saving — a query nobody is waiting for
    // stops after one billable search instead of running all three. The
    // sequence is cut short, so its outcome must not be treated as a
    // complete answer: skip straight past the cache write below.
    if (index > 0 && dependencies.signal?.aborted) {
      return {
        outcome: finalProviderResult?.outcome ?? "NO_RESULTS",
        candidates: [],
        correlationId: input.correlationId,
        cached: false,
      };
    }
    const providerResult = await dependencies.provider(plan[index]);
    finalProviderResult = providerResult;
    fullyCached = fullyCached && providerResult.metadata.cacheStatus === "hit";
    if (providerResult.outcome === "SUCCESS") collectedCandidates.push(...providerResult.candidates);
    const ranked = collectedCandidates.length
      ? rankMerchantCandidates(collectedCandidates, {
        query: normalizedQuery,
        market: input.market,
        placeId: input.maps?.placeId,
        dataId: input.maps?.dataId,
        dataCid: input.maps?.dataCid,
        latitude: input.maps?.latitude,
        longitude: input.maps?.longitude,
        district: input.district,
        category: input.category,
      })
      : [];
    dependencies.logger?.(merchantSearchTelemetryEvent({
      correlationId: input.correlationId,
      ...(providerResult.metadata.searchId ? { searchId: providerResult.metadata.searchId } : {}),
      market: input.market,
      language: plan[index].hl,
      attempt: index + 1,
      outcome: providerResult.outcome,
      latencyMs: providerResult.metadata.durationMs,
      candidateCount: ranked.length,
      confidenceCounts: confidenceCounts(ranked),
      cacheStatus: providerResult.metadata.cacheStatus ?? "miss",
    }));

    const hasRelevantCandidate = ranked.some(
      (candidate) => candidate.matchConfidence !== "low" && !candidate.marketMismatch,
    );
    if (providerResult.outcome === "SUCCESS" && hasRelevantCandidate) {
      const response: MerchantSearchResponse = {
        outcome: "SUCCESS",
        candidates: ranked,
        correlationId: input.correlationId,
        cached: fullyCached,
      };
      await store.set(key, response, MERCHANT_SEARCH_CACHE_TTL_SECONDS);
      return response;
    }
    if (providerResult.outcome !== "NO_RESULTS" && providerResult.outcome !== "SUCCESS") {
      return { outcome: providerResult.outcome, candidates: [], correlationId: input.correlationId, cached: false };
    }
  }

  const finalCandidates = collectedCandidates.length
    ? rankMerchantCandidates(collectedCandidates, {
      query: normalizedQuery,
      market: input.market,
      placeId: input.maps?.placeId,
      dataId: input.maps?.dataId,
      dataCid: input.maps?.dataCid,
      latitude: input.maps?.latitude,
      longitude: input.maps?.longitude,
      district: input.district,
      category: input.category,
    })
    : [];
  const response: MerchantSearchResponse = {
    outcome: finalCandidates.length ? "SUCCESS" : finalProviderResult?.outcome ?? "NO_RESULTS",
    candidates: finalCandidates,
    correlationId: input.correlationId,
    cached: fullyCached,
  };
  if (isCacheableMerchantSearchOutcome(response.outcome)) {
    await store.set(key, response, MERCHANT_SEARCH_CACHE_TTL_SECONDS);
  }
  return response;
}
