/**
 * Client-side half of the business / Instagram candidate search used by the
 * scan page (step 1 and step 3). The request and response shapes mirror the
 * upstream routes re-implemented in app/api/business/{search,ig-search}
 * (CLAUDE.md §3.2.2); the candidate types are the client-facing subset of
 * upstream's lib/scanner/{merchant-search,ig-search}/types.ts.
 */

export const BUSINESS_SEARCH_DEBOUNCE_MS = 450;
export const MAX_CANDIDATES_SHOWN = 3;
export const SEARCH_SESSION_KEY = "sme-scanner:business-search-session:v1";

export type SearchMarket = "HK" | "TW";
export type MatchConfidence = "high" | "medium" | "low";

export interface MerchantCandidate {
  id: string;
  provider: "serpapi";
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
  market?: SearchMarket;
  marketMismatch?: boolean;
  matchConfidence?: MatchConfidence;
  score?: number;
}

export type MerchantSearchOutcome =
  | "SUCCESS"
  | "NO_RESULTS"
  | "INVALID_MAPS_URL"
  | "PROVIDER_AUTH_ERROR"
  | "PROVIDER_PERMISSION_ERROR"
  | "PROVIDER_QUOTA_ERROR"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "NETWORK_ERROR";

export type CandidateSearchErrorCode =
  | Exclude<MerchantSearchOutcome, "SUCCESS" | "NO_RESULTS">
  | "RATE_LIMITED"
  | "INVALID_REQUEST";

/** Message key (lib/i18n `t`) for every failure the pickers can surface. */
export const CANDIDATE_ERROR_KEYS: Record<CandidateSearchErrorCode, string> = {
  INVALID_MAPS_URL: "scanner.candidateErrorInvalidMapsUrl",
  PROVIDER_AUTH_ERROR: "scanner.candidateErrorProvider",
  PROVIDER_PERMISSION_ERROR: "scanner.candidateErrorProvider",
  PROVIDER_QUOTA_ERROR: "scanner.candidateErrorQuota",
  PROVIDER_ERROR: "scanner.candidateErrorProvider",
  TIMEOUT: "scanner.candidateErrorTimeout",
  NETWORK_ERROR: "scanner.candidateErrorNetwork",
  RATE_LIMITED: "scanner.candidateErrorRateLimited",
  INVALID_REQUEST: "scanner.candidateErrorProvider",
};

export interface MerchantSearchResponse {
  outcome?: MerchantSearchOutcome;
  candidates?: MerchantCandidate[];
  correlationId?: string;
  cached?: boolean;
  error?: string;
}

export type IgMatchProvenance = "manual_typed" | "picker_confirmed" | "gbp_cross_referenced";

export interface InstagramCandidate {
  /** `ig:<handle>` */
  id: string;
  handle: string;
  profileUrl: string;
  provenance: Exclude<IgMatchProvenance, "manual_typed">;
  displayName?: string;
  bioSnippet?: string;
}

export interface InstagramSearchResponse {
  outcome?: MerchantSearchOutcome;
  candidates?: InstagramCandidate[];
  correlationId?: string;
  error?: string;
}

const ZERO_WIDTH = /[​-‍⁠﻿]/g;
const MEANINGFUL = /[\p{L}\p{N}]/gu;

export function normalizeMerchantQuery(input: string): string {
  return input.normalize("NFKC").replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
}

export function countMeaningfulCharacters(input: string): number {
  return normalizeMerchantQuery(input).match(MEANINGFUL)?.length ?? 0;
}

/** The server rejects queries with fewer than two meaningful characters; do not bill a search for them. */
export function shouldSearchMerchantQuery(query: string): boolean {
  return countMeaningfulCharacters(query) >= 2;
}

/** A pasted Google Maps link is sent as `mapsUrl` so the server resolves the place directly. */
export function googleMapsUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    const isMapsHost =
      url.hostname === "maps.app.goo.gl" ||
      url.hostname === "goo.gl" ||
      (url.hostname.includes("google.") && url.pathname.includes("/maps"));
    return url.protocol === "https:" && isMapsHost ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function buildCandidateSearchRequest(input: {
  market: SearchMarket;
  query: string;
  sessionId: string;
}): { url: string; init: RequestInit } {
  const query = normalizeMerchantQuery(input.query);
  const mapsUrl = googleMapsUrl(query);
  return {
    url: "/api/business/search",
    init: {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        query: mapsUrl ? "Google Maps merchant" : query,
        market: input.market,
        sessionId: input.sessionId,
        ...(mapsUrl ? { mapsUrl } : {}),
      }),
    },
  };
}

export function buildInstagramSearchRequest(input: {
  market: SearchMarket;
  businessName: string;
  sessionId: string;
  district?: string;
  websiteUrl?: string;
}): { url: string; init: RequestInit } {
  return {
    url: "/api/business/ig-search",
    init: {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        businessName: normalizeMerchantQuery(input.businessName),
        market: input.market,
        sessionId: input.sessionId,
        ...(input.district ? { district: input.district } : {}),
        ...(input.websiteUrl?.trim() ? { websiteUrl: input.websiteUrl.trim() } : {}),
      }),
    },
  };
}

/**
 * One UUID v4 per browser session, persisted in sessionStorage so the server's
 * per-session rate limit and cache key survive a step change or reload.
 */
export function businessSearchSessionId(): string {
  const generated = () => globalThis.crypto.randomUUID();
  try {
    const existing = window.sessionStorage.getItem(SEARCH_SESSION_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const id = generated();
    window.sessionStorage.setItem(SEARCH_SESSION_KEY, id);
    return id;
  } catch {
    return generated();
  }
}

/** Map an HTTP status + body to the copy key the picker shows. */
export function parseSearchError(status: number, data: { outcome?: string; error?: string }): CandidateSearchErrorCode {
  if (status === 429 || data.error === "RATE_LIMITED") return "RATE_LIMITED";
  if (data.error === "INVALID_REQUEST") return "INVALID_REQUEST";
  const outcome = data.outcome;
  if (outcome && outcome !== "SUCCESS" && outcome !== "NO_RESULTS" && outcome in CANDIDATE_ERROR_KEYS) {
    return outcome as CandidateSearchErrorCode;
  }
  return "PROVIDER_ERROR";
}

export function isSearchFailure(status: number, data: { outcome?: string; error?: string }): boolean {
  if (status >= 400) return true;
  return Boolean(data.outcome && data.outcome !== "SUCCESS" && data.outcome !== "NO_RESULTS");
}
