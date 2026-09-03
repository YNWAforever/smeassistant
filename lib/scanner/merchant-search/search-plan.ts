import { merchantSearchMarket, resolveMerchantSearchOrigin, type MerchantSearchMarket } from "./market";
import {
  countMeaningfulCharacters,
  detectMerchantQueryLanguage,
  hasMerchantMarketTerm,
  merchantQueryComparisonKey,
  normalizeMerchantQuery,
  withoutRecognizedLegalSuffix,
} from "./query";
import type { MerchantSearchAttempt, ParsedGoogleMapsMerchant } from "./types";

export interface MerchantSearchPlanContext {
  query: string;
  market: MerchantSearchMarket;
  maps?: ParsedGoogleMapsMerchant;
}

function attemptFor(
  query: string,
  market: MerchantSearchMarket,
  language = detectMerchantQueryLanguage(query, market),
  maps?: ParsedGoogleMapsMerchant,
): MerchantSearchAttempt {
  const config = merchantSearchMarket(market);
  return {
    type: maps?.placeId || maps?.dataId || maps?.dataCid ? "place" : "search",
    q: query,
    ll: resolveMerchantSearchOrigin({
      market,
      queryTerms: query,
      explicitCoordinates: maps?.latitude !== undefined && maps.longitude !== undefined
        ? { latitude: maps.latitude, longitude: maps.longitude, zoom: maps.zoom ?? 15 }
        : undefined,
    }),
    hl: language,
    gl: config.gl,
    ...(maps?.placeId ? { placeId: maps.placeId } : {}),
    ...(maps?.dataId ? { dataId: maps.dataId } : {}),
    ...(maps?.dataCid ? { dataCid: maps.dataCid } : {}),
  };
}

export function buildMerchantSearchPlan(context: MerchantSearchPlanContext): MerchantSearchAttempt[] {
  const query = normalizeMerchantQuery(context.query || context.maps?.name || "");
  if (countMeaningfulCharacters(query) < 2) return [];

  const stripped = withoutRecognizedLegalSuffix(query, context.market);
  if (!stripped && stripped !== query) return [];

  const config = merchantSearchMarket(context.market);
  const primaryLanguage = detectMerchantQueryLanguage(query, context.market);
  const candidates: Array<{ q: string; hl?: MerchantSearchAttempt["hl"] }> = [{ q: query }];

  if (stripped !== query && countMeaningfulCharacters(stripped) >= 2) {
    candidates.push({ q: stripped });
  }

  const fallbackBase = stripped || query;
  const fallbackTerms = primaryLanguage === "en" ? config.fallbackTerms : [...config.fallbackTerms].reverse();
  for (const [index, term] of fallbackTerms.entries()) {
    if (candidates.length >= 3) break;
    const fallbackQuery = hasMerchantMarketTerm(fallbackBase, context.market)
      ? fallbackBase
      : `${fallbackBase} ${term}`;
    const hl = index === 0
      ? primaryLanguage
      : (primaryLanguage === "en" ? config.defaultLanguage : "en");
    candidates.push({ q: fallbackQuery, hl });
  }

  const seen = new Set<string>();
  const attempts: MerchantSearchAttempt[] = [];
  for (const candidate of candidates) {
    const attempt = attemptFor(candidate.q, context.market, candidate.hl, context.maps);
    const key = [attempt.type, merchantQueryComparisonKey(attempt.q), attempt.ll, attempt.hl, attempt.gl].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    attempts.push(attempt);
    if (attempts.length === 3) break;
  }
  return attempts;
}

export function nextMerchantSearchAttempt(
  plan: readonly MerchantSearchAttempt[],
  completedAttempts: number,
  usefulResultsFound: boolean,
): MerchantSearchAttempt | undefined {
  return usefulResultsFound ? undefined : plan[completedAttempts];
}
