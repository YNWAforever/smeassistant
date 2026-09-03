import type { AEOPerformanceRun, MerchantPerformanceEvidenceRun } from "@sme-scanner/scoring";
import { domainFromUrl, matchMerchantCandidate, type MerchantEntity } from "./entity-matcher";
import type { MerchantQueryPlanItem } from "./query-plan";
import { isUnsupportedSerpApiError } from "./unsupported";

type NormalizeInput = {
  plan: MerchantQueryPlanItem;
  entity: MerchantEntity;
  requestedAt: string;
  data: any;
};

type NormalizedOrganicResult = {
  title: string;
  link: string;
  snippet: string;
  position: number;
};

type NormalizedLocalResult = {
  title: string;
  place_id?: string;
  rating?: number;
  reviews?: number;
  position: number;
};

type CompetitorEntry = MerchantPerformanceEvidenceRun["competitors"][number];

function asArray(value: any): any[] {
  return Array.isArray(value) ? value.filter((item) => item != null) : [];
}

// SerpAPI positions are normally integers, but a non-numeric value would make `Number(...)` yield
// NaN — which passes a `typeof === "number"` guard yet makes rank comparisons silently false. Fall
// back to the 1-based list index so a rank is always a finite number.
function safePosition(value: any, index: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : index + 1;
}

// `typeof x === "number"` alone lets NaN/Infinity through (both are typeof "number"), which would
// silently reach the report as an unrenderable rating. SerpAPI's JSON can't itself carry a literal
// NaN, but this guards the same untyped boundary safePosition above guards, on the same principle.
function safeRatingOrReviews(value: any): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metadata(data: any) {
  // A null/empty/non-object body is a failed fetch, not a successful empty result. Treat it as an
  // error so the run is excluded from scoring denominators rather than counted as "merchant absent".
  if (!data || typeof data !== "object") {
    return { status: "Error", search_id: null, total_time_taken: null, error: "Empty SerpAPI response" };
  }
  return {
    status: String(data.search_metadata?.status ?? (data.error ? "Error" : "Success")),
    search_id: typeof data.search_metadata?.id === "string" ? data.search_metadata.id : null,
    total_time_taken: typeof data.search_metadata?.total_time_taken === "number" ? data.search_metadata.total_time_taken : null,
    error: typeof data.error === "string" ? data.error : null,
  };
}

function textFromAiOverview(aiOverview: any): string {
  const parts: string[] = [];
  for (const block of asArray(aiOverview?.text_blocks)) {
    if (block?.text) parts.push(String(block.text));
    if (block?.title) parts.push(String(block.title));
    if (block?.snippet) parts.push(String(block.snippet));
    for (const item of asArray(block?.list)) {
      if (item?.title) parts.push(String(item.title));
      if (item?.snippet) parts.push(String(item.snippet));
      if (item?.text) parts.push(String(item.text));
    }
  }
  if (aiOverview?.answer) parts.push(String(aiOverview.answer));
  return parts.join(" ").trim();
}

function refsFrom(value: any): Array<{ title?: string; link?: string; source?: string }> {
  const list = asArray(value?.references).length > 0 ? asArray(value?.references) : asArray(value?.sources);
  return list
    .map((ref: any) => ({
      title: ref?.title ?? ref?.source,
      link: ref?.link ?? ref?.url,
      source: ref?.source,
    }))
    .filter((ref: { link?: string }) => Boolean(ref.link));
}

function baseRun(
  input: NormalizeInput
): Omit<MerchantPerformanceEvidenceRun, "merchant_presence" | "competitors" | "evidence_snippets" | "raw_refs"> {
  return {
    id: input.plan.id,
    query: input.plan.query,
    query_type: input.plan.query_type,
    engine: input.plan.engine,
    requested_at: input.requestedAt,
    settings: { gl: input.plan.gl, hl: input.plan.hl, location: input.plan.location, ll: input.plan.ll ?? null, device: input.plan.device },
    serpapi: metadata(input.data),
  };
}

export function normalizeGoogleSearchRun(input: NormalizeInput): MerchantPerformanceEvidenceRun {
  const aiOverviewTriggered = Boolean(input.data?.ai_overview);
  const aiText = textFromAiOverview(input.data?.ai_overview);
  const aiRefs = refsFrom(input.data?.ai_overview);
  const organicResults: NormalizedOrganicResult[] = asArray(input.data?.organic_results).slice(0, 10).map((result: any, index: number) => ({
    title: String(result.title ?? ""),
    link: String(result.link ?? result.url ?? ""),
    snippet: String(result.snippet ?? ""),
    position: safePosition(result.position, index),
  }));
  const localResults: NormalizedLocalResult[] = asArray(input.data?.local_results).slice(0, 10).map((result: any, index: number) => ({
    title: String(result.title ?? ""),
    place_id: result.place_id,
    rating: result.rating,
    reviews: result.reviews,
    position: safePosition(result.position, index),
  }));
  const organicCandidates = organicResults
    .map((result) => ({ result, match: matchMerchantCandidate(input.entity, { title: result.title, link: result.link, snippet: result.snippet }) }));
  // Prefer a confident match anywhere in the list over an earlier fuzzy one, and let only confident
  // matches record ranks below: a low-confidence (fuzzy) hit is a presence hint, not proof that a
  // specific result IS the merchant, so asserting its position would fabricate rank data.
  const organicConfident = organicCandidates.find((item) => item.match.found && item.match.confidence !== "low");
  const organicMatch = organicConfident ?? organicCandidates.find((item) => item.match.found);
  const localPackCandidates = localResults
    .map((result) => ({ result, match: matchMerchantCandidate(input.entity, { title: result.title, placeId: result.place_id }) }));
  const localPackConfident = localPackCandidates.find((item) => item.match.found && item.match.confidence !== "low");
  const localPackMatch = localPackConfident ?? localPackCandidates.find((item) => item.match.found);
  const citationMatch = aiRefs
    .map((ref) => ({ ref, match: matchMerchantCandidate(input.entity, { title: ref.title, link: ref.link, source: ref.source }) }))
    .find((item) => item.match.found);
  const aiMention = aiText ? matchMerchantCandidate(input.entity, { title: aiText }) : null;
  const bestMatch =
    citationMatch?.match ??
    organicMatch?.match ??
    localPackMatch?.match ??
    aiMention ?? {
      found: false,
      confidence: "none" as const,
      confidenceReason: "No reliable merchant identity signal matched.",
      confidenceReasonCode: "none" as const,
      matchedBy: [],
      matchedText: null,
    };

  const organicCompetitors: CompetitorEntry[] = organicResults
    .filter((result) => {
      const match = matchMerchantCandidate(input.entity, { title: result.title, link: result.link, snippet: result.snippet });
      // Only a confident match removes a result from the competitor list — a fuzzy hit may well be
      // a different business, and hiding it would understate the competitor gap.
      return !match.found || match.confidence === "low";
    })
    .filter((result) => (organicConfident?.result.position ? result.position < organicConfident.result.position : result.position <= 3))
    .map((result) => ({
      name: result.title,
      domain: domainFromUrl(result.link),
      url: result.link,
      place_id: null,
      source: "organic" as const,
      rank: result.position,
      cited: false,
    }));
  const localPackCompetitors: CompetitorEntry[] = localResults
    .filter((result) => {
      const match = matchMerchantCandidate(input.entity, { title: result.title, placeId: result.place_id });
      return !match.found || match.confidence === "low";
    })
    .filter((result) => (localPackConfident?.result.position ? result.position < localPackConfident.result.position : result.position <= 3))
    .map((result) => ({
      name: result.title,
      domain: null,
      url: null,
      place_id: result.place_id ?? null,
      source: "local_pack" as const,
      rank: result.position,
      cited: false,
    }));
  const competitors: CompetitorEntry[] = [...organicCompetitors, ...localPackCompetitors];

  return {
    ...baseRun(input),
    merchant_presence: {
      found: bestMatch.found,
      confidence: bestMatch.confidence,
      confidence_reason: bestMatch.confidenceReason,
      confidence_reason_code: bestMatch.confidenceReasonCode,
      matched_by: bestMatch.matchedBy,
      ai_mentioned: Boolean(aiMention?.found),
      ai_cited: Boolean(citationMatch?.match.found),
      ai_citation_urls: citationMatch?.ref.link ? [citationMatch.ref.link] : [],
      organic_rank: organicConfident?.result.position ?? null,
      local_pack_rank: localPackConfident?.result.position ?? null,
      maps_rank: null,
    },
    competitors,
    evidence_snippets: aiText
      ? [{ source: "ai_overview", label: "Google AI Overview", text: aiText, url: citationMatch?.ref.link ?? null, matched_text: bestMatch.matchedText }]
      : [],
    raw_refs: {
      ai_overview_triggered: aiOverviewTriggered,
      ai_overview_text: aiText || undefined,
      ai_references: aiRefs,
      organic_results: organicResults,
      local_results: localResults,
    },
  };
}

export function normalizeGoogleAiModeRun(input: NormalizeInput): MerchantPerformanceEvidenceRun {
  const markdown = String(input.data?.reconstructed_markdown ?? input.data?.answer ?? "");
  const refs = refsFrom(input.data);
  const textMatch = markdown ? matchMerchantCandidate(input.entity, { title: markdown }) : null;
  const citationMatch = refs
    .map((ref) => ({ ref, match: matchMerchantCandidate(input.entity, { title: ref.title, link: ref.link, source: ref.source }) }))
    .find((item) => item.match.found);
  const bestMatch =
    citationMatch?.match ??
    textMatch ?? {
      found: false,
      confidence: "none" as const,
      confidenceReason: "No reliable merchant identity signal matched.",
      confidenceReasonCode: "none" as const,
      matchedBy: [],
      matchedText: null,
    };

  return {
    ...baseRun(input),
    merchant_presence: {
      found: bestMatch.found,
      confidence: bestMatch.confidence,
      confidence_reason: bestMatch.confidenceReason,
      confidence_reason_code: bestMatch.confidenceReasonCode,
      matched_by: bestMatch.matchedBy,
      ai_mentioned: Boolean(textMatch?.found),
      ai_cited: Boolean(citationMatch?.match.found),
      ai_citation_urls: citationMatch?.ref.link ? [citationMatch.ref.link] : [],
      organic_rank: null,
      local_pack_rank: null,
      maps_rank: null,
    },
    competitors: [],
    evidence_snippets: markdown
      ? [{ source: "ai_mode", label: "Google AI Mode", text: markdown, url: citationMatch?.ref.link ?? null, matched_text: bestMatch.matchedText }]
      : [],
    raw_refs: { ai_mode_markdown: markdown || undefined, ai_references: refs },
  };
}

export function normalizeGoogleMapsRun(input: NormalizeInput): MerchantPerformanceEvidenceRun {
  const mapsResults: NormalizedLocalResult[] = asArray(input.data?.local_results).slice(0, 10).map((result: any, index: number) => ({
    title: String(result.title ?? ""),
    place_id: result.place_id,
    rating: result.rating,
    reviews: result.reviews,
    position: safePosition(result.position, index),
  }));
  const mapsCandidates = mapsResults
    .map((result) => ({ result, match: matchMerchantCandidate(input.entity, { title: result.title, placeId: result.place_id }) }));
  // Same confident-first policy as the search normalizer: only a confident match records maps_rank
  // or removes a result from the competitor list; a fuzzy hit is a presence hint only.
  const mapsConfident = mapsCandidates.find((item) => item.match.found && item.match.confidence !== "low");
  const mapsMatch = mapsConfident ?? mapsCandidates.find((item) => item.match.found);
  const bestMatch =
    mapsMatch?.match ?? {
      found: false,
      confidence: "none" as const,
      confidenceReason: "No reliable merchant identity signal matched.",
      confidenceReasonCode: "none" as const,
      matchedBy: [],
      matchedText: null,
    };
  const competitors = mapsResults
    .filter((result) => {
      const match = matchMerchantCandidate(input.entity, { title: result.title, placeId: result.place_id });
      return !match.found || match.confidence === "low";
    })
    .filter((result) => (mapsConfident?.result.position ? result.position < mapsConfident.result.position : result.position <= 3))
    .map((result) => ({
      name: result.title,
      domain: null,
      url: null,
      place_id: result.place_id ?? null,
      source: "maps" as const,
      rank: result.position,
      rating: safeRatingOrReviews(result.rating),
      reviews: safeRatingOrReviews(result.reviews),
      cited: false,
    }));

  return {
    ...baseRun(input),
    merchant_presence: {
      found: bestMatch.found,
      confidence: bestMatch.confidence,
      confidence_reason: bestMatch.confidenceReason,
      confidence_reason_code: bestMatch.confidenceReasonCode,
      matched_by: bestMatch.matchedBy,
      ai_mentioned: false,
      ai_cited: false,
      ai_citation_urls: [],
      organic_rank: null,
      local_pack_rank: null,
      maps_rank: mapsConfident?.result.position ?? null,
      // Same confident-only policy as maps_rank: a fuzzy hit is a presence hint, not a
      // measurement, so it must not become the merchant's own side of a published gap.
      maps_rating: safeRatingOrReviews(mapsConfident?.result.rating),
      maps_reviews: safeRatingOrReviews(mapsConfident?.result.reviews),
    },
    competitors,
    evidence_snippets: mapsMatch ? [{ source: "maps", label: "Google Maps", text: mapsMatch.result.title, url: null, matched_text: bestMatch.matchedText }] : [],
    raw_refs: { maps_results: mapsResults },
  };
}

export function toAeoPerformanceRun(run: MerchantPerformanceEvidenceRun): AEOPerformanceRun {
  return {
    query: run.query,
    query_type: run.query_type,
    engine: run.engine,
    available: run.serpapi.status === "Success" && !run.serpapi.error,
    unsupported: isUnsupportedSerpApiError(run.serpapi.error),
    ai_overview_triggered: run.engine === "google" ? Boolean(run.raw_refs.ai_overview_triggered) : null,
    ai_answered:
      run.engine === "google"
        ? Boolean(run.raw_refs.ai_overview_triggered)
        : run.engine === "google_ai_mode" || run.engine === "google_ai_overview"
          ? Boolean(run.raw_refs.ai_mode_markdown) || (run.raw_refs.ai_references?.length ?? 0) > 0
          : false,
    ai_mentioned: run.merchant_presence.ai_mentioned,
    ai_cited: run.merchant_presence.ai_cited,
    organic_rank: run.merchant_presence.organic_rank,
    local_pack_rank: run.merchant_presence.local_pack_rank,
    maps_rank: run.merchant_presence.maps_rank,
    confidence: run.merchant_presence.confidence,
    matched_by: run.merchant_presence.matched_by,
    competitors_above: run.competitors.map((competitor) => competitor.name),
  };
}
