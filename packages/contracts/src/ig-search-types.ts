import type { MerchantSearchLanguage } from "@sme-scanner/region";
import type { SerpApiHttpCategory, SerpApiOutcome } from "./serpapi-outcome";

/**
 * How we came to believe this handle belongs to the scanned merchant, ordered
 * weakest to strongest. It is recorded in `audit_jobs.input_snapshot` and caps
 * the IG module's displayed confidence (see lib/scan/ig-confidence.ts).
 *
 * `oauth_verified` is deliberately absent: there is no Instagram OAuth in this
 * repo, and a value nothing can emit is a value that will rot.
 */
export type IgMatchProvenance = "manual_typed" | "picker_confirmed" | "gbp_cross_referenced";

export type IgSearchOutcome = SerpApiOutcome;

/**
 * One ranked source's own outcome. `UNSUPPORTED` means "this source cannot
 * answer here at all" -- no key configured, or the endpoint is absent from the
 * current plan. The chain moves on silently rather than surfacing an error the
 * merchant could not act on; every other outcome is a real failure worth
 * reporting if no later source succeeds.
 */
export type IgSourceOutcome = IgSearchOutcome | "UNSUPPORTED";

export interface IgSourceResult {
  outcome: IgSourceOutcome;
  candidates: InstagramCandidate[];
}

export interface InstagramCandidate {
  /** `ig:<handle>` -- the shared candidate reducer dedupes on this. */
  id: string;
  handle: string;
  profileUrl: string;
  provenance: Exclude<IgMatchProvenance, "manual_typed">;
  displayName?: string;
  bioSnippet?: string;
}

export interface IgSearchAttempt {
  q: string;
  hl: MerchantSearchLanguage;
  gl: "hk" | "tw";
  location: string;
}

export interface IgSearchProviderMetadata {
  searchId?: string;
  status?: string;
  organicResultsState: "present" | "empty" | "absent" | "invalid";
  durationMs: number;
  httpCategory?: SerpApiHttpCategory;
  cacheStatus?: "hit" | "miss" | "bypass";
}

export interface IgSearchProviderResult {
  outcome: IgSearchOutcome;
  candidates: InstagramCandidate[];
  metadata: IgSearchProviderMetadata;
}

export interface IgSearchResponse {
  outcome: IgSearchOutcome;
  candidates: InstagramCandidate[];
  correlationId: string;
  cached?: boolean;
}
