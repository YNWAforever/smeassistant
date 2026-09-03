import type { MerchantSearchLanguage } from "@sme-scanner/region";
import type { SerpApiHttpCategory, SerpApiOutcome } from "../serpapi-outcome";
import type { MerchantSearchMarket } from "./market";

/**
 * Every SerpApi outcome, plus the one failure only merchant search can have:
 * a Google Maps URL the caller pasted that could not be resolved. Expressing it
 * as a widening of SerpApiOutcome is what lets Instagram search reuse the
 * client's error-copy map for free.
 */
export type MerchantSearchOutcome = SerpApiOutcome | "INVALID_MAPS_URL";

export type MerchantSearchPublicErrorCode = Exclude<MerchantSearchOutcome, "SUCCESS" | "NO_RESULTS">;
export type MerchantSearchProvider = "serpapi";

export interface MerchantSearchRequest {
  query: string;
  market: MerchantSearchMarket;
  sessionId: string;
  mapsUrl?: string;
}

export interface ParsedGoogleMapsMerchant {
  name?: string;
  latitude?: number;
  longitude?: number;
  zoom?: number;
  placeId?: string;
  dataId?: string;
  dataCid?: string;
  resolvedUrl?: string;
}

export interface MerchantSearchAttempt {
  type: "search" | "place";
  q: string;
  ll: string;
  hl: MerchantSearchLanguage;
  gl: "hk" | "tw";
  placeId?: string;
  dataId?: string;
  dataCid?: string;
}

export interface MerchantCandidate {
  id: string;
  provider: MerchantSearchProvider;
  name: string;
  alternateNames: string[];
  address?: string;
  district?: string;
  category?: string;
  websiteUrl?: string;
  phone?: string;
  thumbnailUrl?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  reviews?: number;
  price?: string;
  openState?: string;
  permanentlyClosed: boolean;
  placeId?: string;
  dataId?: string;
  dataCid?: string;
  market?: MerchantSearchMarket;
  marketMismatch?: boolean;
  matchConfidence?: "high" | "medium" | "low";
  score?: number;
}

export interface MerchantSearchProviderMetadata {
  searchId?: string;
  status?: string;
  localResultsState: "present" | "empty" | "absent" | "invalid";
  durationMs: number;
  httpCategory?: SerpApiHttpCategory;
  cacheStatus?: "hit" | "miss" | "bypass";
}

export interface MerchantSearchProviderResult {
  outcome: MerchantSearchOutcome;
  candidates: MerchantCandidate[];
  metadata: MerchantSearchProviderMetadata;
}

export interface MerchantSearchResponse {
  outcome: MerchantSearchOutcome;
  candidates: MerchantCandidate[];
  correlationId: string;
  cached?: boolean;
}
