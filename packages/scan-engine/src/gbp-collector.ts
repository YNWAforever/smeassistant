import type { GBPPayload } from "@sme-scanner/scoring";
import type { Market } from "@sme-scanner/region";
import type { RawData } from "@sme-scanner/contracts";
import { fetchSerpApiGoogleEvidence } from "./serpapi-google-evidence";
import { fetchPlacesNewDetails, type PlacesNewOutcome } from "./google-places-new";
import type { ProviderResult } from "./provider-result";
import { fetchSerpApiGbp, type SerpApiGbpOutcome } from "./serpapi-gbp";
import { resolveSerpApiKey } from "./serpapi-keys";

export interface GBPMerchantEvidence {
  placeId: string | null;
  dataId: string | null;
  dataCid: string | null;
  mapsUrl: string | null;
  address: string | null;
  alternateNames: string[];
}

export interface GBPCollectionResult {
  provider: ProviderResult<GBPPayload>;
  raw: RawData["gbp"] | null;
}

type SerpApiValue = Extract<SerpApiGbpOutcome, { ok: true }>["value"];
type NormalizedGbpFacts = {
  name: string;
  address: string;
  mapsUrl?: string | null;
  rating: number;
  reviewsCount: number;
  categories: string[];
  hoursComplete?: boolean;
  photoNames?: string[];
  reviews: Array<{
    id?: string;
    link?: string | null;
    rating: number;
    text: string;
    time: string;
    images?: string[];
    ownerResponse?: string;
  }>;
};
type ChosenGbp = { source: "google_places_new" | "serpapi"; value: NormalizedGbpFacts };
type TerminalFailure = { code: string; retryable: boolean };

export interface GBPCollectorDependencies {
  googleKey?: string | null;
  serpApiKey?: string | null;
  fetchPlaces?: (options: { placeId: string; apiKey: string; languageCode: string }) => Promise<PlacesNewOutcome>;
  fetchSerp?: (options: { dataId: string | null; placeId: string | null; apiKey: string; language: string }) => Promise<SerpApiGbpOutcome>;
  fetchEvidence?: typeof fetchSerpApiGoogleEvidence;
}

function scoreable(value: NormalizedGbpFacts): boolean {
  return value.name.trim().length > 0
    && Number.isFinite(value.rating) && value.rating >= 0
    && Number.isFinite(value.reviewsCount) && value.reviewsCount >= 0;
}

function toPayload(facts: NormalizedGbpFacts, placeId: string | null): GBPPayload {
  return {
    available: true,
    place_id: placeId ?? undefined,
    name: facts.name,
    rating: facts.rating,
    reviews_count: facts.reviewsCount,
    reviews: facts.reviews.map((review) => ({
      rating: review.rating,
      text: review.text,
      time: review.time,
      owner_response: review.ownerResponse,
    })),
    // Left undefined, never coerced. Only the Places New path reports these two;
    // the SerpApi fallback cannot observe either. Coercing absence to 0/false made
    // an identical merchant score up to 25 lower purely because of which provider
    // answered — gbp.photos_volume (-10) and gbp.hours_incomplete (-15) both fired
    // on evidence that was never collected. The scorer now skips an unmeasured
    // signal, matching how gbp.posts_inactive has always handled the same problem.
    photos_count: facts.photoNames?.length,
    hours_complete: facts.hoursComplete,
    categories: facts.categories,
  };
}

function toRaw(chosen: ChosenGbp, merchant: GBPMerchantEvidence): NonNullable<RawData["gbp"]> {
  return {
    source: chosen.source,
    name: chosen.value.name,
    place_id: merchant.placeId ?? "",
    address: chosen.value.address,
    maps_url: chosen.value.mapsUrl ?? merchant.mapsUrl,
    data_id: merchant.dataId,
    data_cid: merchant.dataCid,
    rating: chosen.value.rating,
    reviews_count: chosen.value.reviewsCount,
    categories: chosen.value.categories,
    photo_names: chosen.value.photoNames ?? [],
    photos: [],
    posts: [],
    evidence_failures: [],
    reviews: chosen.value.reviews.slice(0, 5).map((review) => ({
      id: review.id,
      link: review.link,
      rating: review.rating,
      text: review.text,
      time: review.time,
      images: review.images,
      owner_response: review.ownerResponse,
    })),
  };
}

export async function scrapeGBP(
  _businessName: string,
  _district: string,
  _market: Market,
  evidence: GBPMerchantEvidence = {
    placeId: null, dataId: null, dataCid: null, mapsUrl: null, address: null, alternateNames: [],
  },
  dependencies: GBPCollectorDependencies = {},
): Promise<GBPCollectionResult> {
  const startedAt = Date.now();
  const collectedAt = new Date().toISOString();
  const googleKey = dependencies.googleKey === undefined ? process.env.GOOGLE_PLACES_KEY ?? null : dependencies.googleKey;
  // Via the shared resolver, so SERPAPI_API_KEY and the legacy SERPAPI_KEY both
  // work here exactly as they do for merchant search. This key gates three
  // separate things below — the SerpApi fallback, the `configured` flag, and
  // media enrichment — so reading one name lost all three at once.
  const serpApiKey = dependencies.serpApiKey === undefined ? resolveSerpApiKey() : dependencies.serpApiKey;
  const fetchPlaces = dependencies.fetchPlaces ?? fetchPlacesNewDetails;
  const fetchSerp = dependencies.fetchSerp ?? fetchSerpApiGbp;
  const fetchEvidence = dependencies.fetchEvidence ?? fetchSerpApiGoogleEvidence;
  const language = "zh-TW";
  let chosen: ChosenGbp | null = null;
  let terminal: TerminalFailure | null = null;

  if (googleKey) {
    if (evidence.placeId) {
      let outcome: PlacesNewOutcome;
      try {
        outcome = await fetchPlaces({ placeId: evidence.placeId, apiKey: googleKey, languageCode: language });
      } catch {
        outcome = { ok: false, code: "GOOGLE_PLACES_NETWORK_FAILED", retryable: true, httpStatus: null };
      }
      if (outcome.ok) {
        const facts: NormalizedGbpFacts = outcome.value;
        if (scoreable(facts)) chosen = { source: "google_places_new", value: facts };
        else terminal = { code: "GOOGLE_PLACES_INVALID_RESPONSE", retryable: false };
      } else terminal = { code: outcome.code, retryable: outcome.retryable };
    } else terminal = { code: "GOOGLE_PLACES_IDENTITY_MISSING", retryable: false };
  }

  if (!chosen && serpApiKey) {
    let outcome: SerpApiGbpOutcome;
    try {
      outcome = await fetchSerp({ dataId: evidence.dataId, placeId: evidence.placeId, apiKey: serpApiKey, language });
    } catch {
      outcome = { ok: false, code: "SERPAPI_GBP_FAILED", retryable: true };
    }
    if (outcome.ok) {
      const facts: NormalizedGbpFacts = outcome.value;
      if (scoreable(facts)) chosen = { source: "serpapi", value: facts };
      else terminal = { code: "SERPAPI_GBP_INVALID_RESPONSE", retryable: false };
    } else terminal = { code: outcome.code, retryable: outcome.retryable };
  }

  const configured = Boolean(googleKey || serpApiKey);
  const provider: ProviderResult<GBPPayload> = chosen
    ? {
        status: "measured",
        data: toPayload(chosen.value, evidence.placeId),
        confidence: chosen.source === "google_places_new" ? "high" : "medium",
        collectedAt,
      }
    : configured
      ? { status: "failed", limitationCode: terminal?.code ?? "GBP_PROVIDER_FAILED", retryable: terminal?.retryable ?? true }
      : { status: "unavailable", limitationCode: "GBP_PROVIDER_NOT_CONFIGURED" };

  const raw = chosen ? toRaw(chosen, evidence) : null;
  if (raw && serpApiKey && evidence.dataId) {
    try {
      const enrichment = await fetchEvidence({
        dataId: evidence.dataId,
        mapsUrl: evidence.mapsUrl,
        apiKey: serpApiKey,
        language,
      });
      raw.photos = enrichment.photos;
      raw.posts = enrichment.posts;
      raw.evidence_failures = enrichment.failures;
    } catch {
      raw.evidence_failures = ["SERPAPI_GOOGLE_PHOTOS_FAILED", "SERPAPI_GOOGLE_POSTS_FAILED"];
    }
  }

  console.info("[scan/provider] complete", {
    provider: "gbp",
    result: provider.status,
    source: chosen?.source ?? null,
    limitationCode: provider.status === "measured" ? null : provider.limitationCode,
    durationMs: Date.now() - startedAt,
    reviewCount: provider.status === "measured" ? provider.data.reviews?.length ?? 0 : 0,
  });
  return { provider, raw };
}
