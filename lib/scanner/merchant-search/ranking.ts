import { merchantQueryComparisonKey } from "./query";
import { mergeMerchantCandidates } from "./normalize-candidate";
import type { MerchantCandidate } from "./types";
import type { MerchantSearchMarket } from "./market";

export const RANKING_WEIGHTS = {
  suppliedIdentity: 100,
  exactName: 45,
  looseName: 30,
  selectedMarket: 12,
  marketMismatch: -20,
  nearby: 20,
  local: 12,
  regional: 4,
  distant: -20,
  district: 10,
  category: 5,
  website: 4,
  phone: 3,
  addressless: -5,
  permanentlyClosed: -35,
} as const;

export const CONFIDENCE_THRESHOLDS = {
  high: 55,
  medium: 30,
} as const;

export interface MerchantRankingContext {
  query: string;
  market: MerchantSearchMarket;
  placeId?: string;
  dataId?: string;
  dataCid?: string;
  latitude?: number;
  longitude?: number;
  district?: string;
  category?: string;
}

function levenshtein(left: string, right: string): number {
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));
  const union = new Set([...leftTokens, ...rightTokens]);
  if (!union.size) return 0;
  return [...leftTokens].filter((token) => rightTokens.has(token)).length / union.size;
}

function nameScore(query: string, candidate: MerchantCandidate): number {
  const target = merchantQueryComparisonKey(query);
  const names = [candidate.name, ...candidate.alternateNames].map(merchantQueryComparisonKey);
  return Math.max(...names.map((name) => {
    if (name === target) return RANKING_WEIGHTS.exactName;
    const maximum = Math.max(name.length, target.length, 1);
    const similarity = 1 - levenshtein(name, target) / maximum;
    return Math.max(0, similarity * RANKING_WEIGHTS.looseName)
      + tokenOverlap(name, target) * (RANKING_WEIGHTS.looseName * 0.4);
  }));
}

export function detectCandidateMarket(candidate: MerchantCandidate): MerchantSearchMarket | undefined {
  if (candidate.latitude !== undefined && candidate.longitude !== undefined) {
    const { latitude, longitude } = candidate;
    if (latitude >= 21.8 && latitude <= 22.7 && longitude >= 113.7 && longitude <= 114.7) return "HK";
    if (latitude >= 21.7 && latitude <= 25.6 && longitude >= 119 && longitude <= 122.3) return "TW";
  }
  const address = merchantQueryComparisonKey(candidate.address ?? "");
  if (/hong kong|香港/.test(address)) return "HK";
  if (/taiwan|台灣|臺灣|台北|臺北|新北|台中|臺中|台南|臺南|高雄/.test(address)) return "TW";
  return candidate.market;
}

export function distanceKilometres(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLatitude = radians(latitudeB - latitudeA);
  const deltaLongitude = radians(longitudeB - longitudeA);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceScore(candidate: MerchantCandidate, context: MerchantRankingContext): number {
  if (
    context.latitude === undefined || context.longitude === undefined
    || candidate.latitude === undefined || candidate.longitude === undefined
  ) return 0;
  const distance = distanceKilometres(context.latitude, context.longitude, candidate.latitude, candidate.longitude);
  if (distance <= 1) return RANKING_WEIGHTS.nearby;
  if (distance <= 5) return RANKING_WEIGHTS.local;
  if (distance <= 30) return RANKING_WEIGHTS.regional;
  if (distance >= 100) return RANKING_WEIGHTS.distant;
  return 0;
}

function identityMatches(candidate: MerchantCandidate, context: MerchantRankingContext): boolean {
  return Boolean(
    context.placeId && candidate.placeId === context.placeId
    || context.dataId && candidate.dataId === context.dataId
    || context.dataCid && candidate.dataCid === context.dataCid,
  );
}

function confidence(score: number): "high" | "medium" | "low" {
  if (score >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (score >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}

export function rankMerchantCandidates(
  input: readonly MerchantCandidate[],
  context: MerchantRankingContext,
): MerchantCandidate[] {
  return mergeMerchantCandidates(input)
    .map((candidate, index) => {
      const market = detectCandidateMarket(candidate);
      const marketMismatch = market !== undefined && market !== context.market;
      let score = nameScore(context.query, candidate);
      if (identityMatches(candidate, context)) score += RANKING_WEIGHTS.suppliedIdentity;
      if (market === context.market) score += RANKING_WEIGHTS.selectedMarket;
      else if (marketMismatch) score += RANKING_WEIGHTS.marketMismatch;
      score += distanceScore(candidate, context);
      if (context.district && merchantQueryComparisonKey(candidate.address ?? "").includes(merchantQueryComparisonKey(context.district))) {
        score += RANKING_WEIGHTS.district;
      }
      if (context.category && merchantQueryComparisonKey(candidate.category ?? "").includes(merchantQueryComparisonKey(context.category))) {
        score += RANKING_WEIGHTS.category;
      }
      if (candidate.websiteUrl) score += RANKING_WEIGHTS.website;
      if (candidate.phone) score += RANKING_WEIGHTS.phone;
      if (!candidate.address) score += RANKING_WEIGHTS.addressless;
      if (candidate.permanentlyClosed) score += RANKING_WEIGHTS.permanentlyClosed;
      return {
        candidate: {
          ...candidate,
          ...(market ? { market } : {}),
          marketMismatch,
          score: Math.round(score * 100) / 100,
          matchConfidence: confidence(score),
        },
        index,
      };
    })
    .sort((left, right) => (right.candidate.score ?? 0) - (left.candidate.score ?? 0) || left.index - right.index)
    .slice(0, 8)
    .map(({ candidate }) => candidate);
}
