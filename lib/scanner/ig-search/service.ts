import { getMarketConfig } from "@sme-scanner/region";
import type { MerchantSearchMarket } from "../merchant-search/market";
import { merchantSearchMarket } from "../merchant-search/market";
import { countMeaningfulCharacters, detectMerchantQueryLanguage } from "../merchant-search/query";
import { instagramCandidateFromWebsite } from "./handle";
import { buildInstagramSearchQuery } from "./query";
import type { IgSearchAttempt, IgSearchOutcome, IgSourceResult, InstagramCandidate } from "./types";

const MAX_CANDIDATES = 8;

export interface IgSearchRequest {
  businessName: string;
  market: MerchantSearchMarket;
  district?: string;
  /** The confirmed GBP candidate's website -- path A's only input. */
  websiteUrl?: string;
}

export interface IgSource {
  key: "rapidapi" | "serpapi";
  run: (request: IgSearchRequest, signal?: AbortSignal) => Promise<IgSourceResult>;
}

export interface IgSearchDependencies {
  /** Ranked cheapest-first. The first source with candidates ends the chain. */
  sources: readonly IgSource[];
  signal?: AbortSignal;
}

export function buildIgSearchAttempt(request: IgSearchRequest): IgSearchAttempt | null {
  const q = buildInstagramSearchQuery({
    businessName: request.businessName,
    market: request.market,
    ...(request.district ? { district: request.district } : {}),
  });
  if (!q) return null;
  return {
    q,
    hl: detectMerchantQueryLanguage(request.businessName, request.market),
    gl: merchantSearchMarket(request.market).gl,
    location: getMarketConfig(request.market.toLowerCase() as "hk" | "tw").serpLocation,
  };
}

function capped(candidates: readonly InstagramCandidate[]): InstagramCandidate[] {
  const byHandle = new Map<string, InstagramCandidate>();
  for (const candidate of candidates) {
    if (!byHandle.has(candidate.handle)) byHandle.set(candidate.handle, candidate);
    if (byHandle.size === MAX_CANDIDATES) break;
  }
  return [...byHandle.values()];
}

export async function searchInstagramCandidates(
  request: IgSearchRequest,
  dependencies: IgSearchDependencies,
): Promise<{ outcome: IgSearchOutcome; candidates: InstagramCandidate[] }> {
  const fromWebsite = instagramCandidateFromWebsite(request.websiteUrl);
  // Path A short-circuits everything. The merchant's own confirmed Google
  // listing links this profile, which is a stronger signal than any keyword
  // search, and acting on it spends nothing. Delete these two lines to trade
  // the saving for a richer picker that also offers search alternatives.
  if (fromWebsite) return { outcome: "SUCCESS", candidates: [fromWebsite] };

  // The PR #44 discipline: check the abort before every paid call, so an
  // abandoned request never bills a provider for a result nobody will read.
  if (dependencies.signal?.aborted) return { outcome: "TIMEOUT", candidates: [] };
  if (countMeaningfulCharacters(request.businessName) < 2) return { outcome: "NO_RESULTS", candidates: [] };

  let firstFailure: IgSearchOutcome | null = null;
  for (const source of dependencies.sources) {
    if (dependencies.signal?.aborted) return { outcome: "TIMEOUT", candidates: [] };

    const result = await source.run(request, dependencies.signal);
    if (result.candidates.length) return { outcome: "SUCCESS", candidates: capped(result.candidates) };

    // UNSUPPORTED means this source cannot answer here at all -- a missing key,
    // or an endpoint absent from the current plan. It is a routing fact, not a
    // failure, so it is never remembered and never reported.
    if (result.outcome === "UNSUPPORTED" || result.outcome === "NO_RESULTS" || result.outcome === "SUCCESS") continue;
    firstFailure ??= result.outcome;
  }

  return { outcome: firstFailure ?? "NO_RESULTS", candidates: [] };
}
