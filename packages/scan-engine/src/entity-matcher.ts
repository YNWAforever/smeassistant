import type { AEOConfidence, AEOConfidenceReasonCode, AEOMatchSignal } from "@sme-scanner/scoring";

export type MerchantEntity = {
  businessName: string;
  aliases: string[];
  domain: string | null;
  websiteUrl: string | null;
  placeId: string | null;
  gbpName: string | null;
  district: string | null;
  categories: string[];
};

export type MerchantCandidate = {
  title?: string | null;
  link?: string | null;
  displayedLink?: string | null;
  snippet?: string | null;
  source?: string | null;
  placeId?: string | null;
  district?: string | null;
  categories?: string[];
};

export type MerchantMatch = {
  found: boolean;
  confidence: AEOConfidence;
  confidenceReason: string;
  confidenceReasonCode: AEOConfidenceReasonCode;
  matchedBy: AEOMatchSignal[];
  matchedText: string | null;
};

// Shared platforms, social pages, and directory/aggregator hosts. A merchant frequently enters one
// of these as their "website", but the host belongs to many businesses — so it must NOT be treated
// as an identifying domain, otherwise any other business's link on the same platform would match.
const SHARED_HOSTS = [
  "facebook.com", "fb.com", "fb.me", "instagram.com", "linktr.ee", "linktree.com",
  "business.site", "google.com", "goo.gl", "page.link", "wixsite.com", "weebly.com",
  "blogspot.com", "wordpress.com", "shopline.hk", "shoplineapp.com", "boutir.com",
  "wa.me", "t.me", "youtube.com", "youtu.be", "twitter.com", "x.com", "threads.net",
  "xiaohongshu.com", "line.me", "yelp.com", "tripadvisor.com", "tripadvisor.com.hk",
  "openrice.com",
];

function isSharedHost(host: string): boolean {
  const lower = host.toLowerCase();
  return SHARED_HOSTS.some((root) => lower === root || lower.endsWith(`.${root}`));
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    // Insert a separator at Latin/digit <-> CJK script boundaries so brand names glued directly to
    // Chinese text (e.g. "Happy Cafe銅鑼灣總店", "ABC咖啡店") become whitespace-delimited tokens.
    .replace(/([A-Za-z0-9])(\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul})/gu, "$1 $2")
    .replace(/(\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul})([A-Za-z0-9])/gu, "$1 $2")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function domainFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    // Only prepend a scheme when the value has none. A non-http(s) scheme (ftp://, mailto:) must not
    // be coerced into "https://ftp://…" which would parse to a bogus single-label hostname.
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
    if (hasScheme && !/^https?:\/\//i.test(value)) return null;
    const url = hasScheme ? value : `https://${value}`;
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function uniqueSignals(signals: AEOMatchSignal[]): AEOMatchSignal[] {
  return [...new Set(signals)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasMatchesCandidateText(alias: string, candidateText: string): boolean {
  if (!alias) return false;

  // Require token boundaries for every alias, including CJK. Because `normalizeText` collapses
  // punctuation to whitespace and inserts a separator at Latin/CJK transitions, a real SERP brand
  // token is whitespace-delimited, while a different merchant whose name merely *contains* the alias
  // as an interior substring (e.g. "華記" inside "中華記帳公司", "開心冰室" inside "新開心冰室分店")
  // is not — preventing the substring false positives that bare `includes()` produced.
  const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(alias)}(?:\\s|$)`, "u");
  return pattern.test(candidateText);
}

export function matchMerchantCandidate(entity: MerchantEntity, candidate: MerchantCandidate): MerchantMatch {
  const matchedBy: AEOMatchSignal[] = [];
  const candidateText = normalizeText(
    [candidate.title, candidate.displayedLink, candidate.snippet, candidate.source].filter(Boolean).join(" ")
  );
  const candidateDomain = domainFromUrl(candidate.link ?? candidate.displayedLink ?? null);
  const rawEntityDomain = entity.domain ?? domainFromUrl(entity.websiteUrl);
  // A shared/social/aggregator host (e.g. a Facebook or OpenRice page used as the "website") belongs
  // to many businesses, so it cannot identify this merchant. Drop it as a domain signal.
  const entityDomain = rawEntityDomain && !isSharedHost(rawEntityDomain) ? rawEntityDomain : null;

  if (entity.placeId && candidate.placeId && entity.placeId === candidate.placeId) {
    return {
      found: true,
      confidence: "high",
      confidenceReason: "Matched exact Google place ID.",
      confidenceReasonCode: "place_id",
      matchedBy: ["place_id"],
      matchedText: candidate.placeId,
    };
  }

  if (entityDomain && candidateDomain && (candidateDomain === entityDomain || candidateDomain.endsWith(`.${entityDomain}`))) {
    matchedBy.push("domain");
  }

  const aliases = [entity.businessName, entity.gbpName, ...entity.aliases].filter((value): value is string => Boolean(value?.trim()));
  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias);
    if (normalizedAlias && aliasMatchesCandidateText(normalizedAlias, candidateText)) {
      matchedBy.push(alias === entity.gbpName ? "gbp_name" : "brand_alias");
      const hasDomainMatch = matchedBy.includes("domain");
      return {
        found: true,
        confidence: hasDomainMatch ? "high" : "medium",
        confidenceReason: hasDomainMatch ? "Matched official domain and brand alias." : "Matched exact brand alias in visible result text.",
        confidenceReasonCode: hasDomainMatch ? "domain_and_alias" : "alias",
        matchedBy: uniqueSignals(matchedBy),
        matchedText: alias,
      };
    }
  }

  if (matchedBy.includes("domain")) {
    return {
      found: true,
      confidence: "high",
      confidenceReason: "Matched official domain.",
      confidenceReasonCode: "domain",
      matchedBy: uniqueSignals(matchedBy),
      matchedText: candidateDomain,
    };
  }

  const fuzzyMatch = fuzzyMatchAlias(aliases, candidateText);
  if (fuzzyMatch) {
    return {
      found: true,
      confidence: "low",
      confidenceReason: "Possible name match below the exact-alias threshold — not confident enough to count as a full match.",
      confidenceReasonCode: "fuzzy",
      matchedBy: ["fuzzy_name"],
      matchedText: fuzzyMatch,
    };
  }

  return {
    found: false,
    confidence: "none",
    confidenceReason: "No reliable merchant identity signal matched.",
    confidenceReasonCode: "none",
    matchedBy: [],
    matchedText: null,
  };
}

const FUZZY_MATCH_THRESHOLD = 0.6;

function tokenSet(value: string): Set<string> {
  return new Set(value.split(" ").filter(Boolean));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Fallback for names that don't hit an exact alias/domain/place_id match. Compares normalized
// token sets rather than raw substrings so word order and minor spacing differences don't block a
// match (e.g. a business name missing a leading "The"). A hit is `confidence: "low"` — distinct
// from "none" (no signal at all) — so scoring can hedge instead of asserting a confirmed absence.
// FUZZY_MATCH_THRESHOLD (0.6) is a starting default; adjust it if real scans show too many/few
// fuzzy hits once this ships.
function fuzzyMatchAlias(aliases: string[], candidateText: string): string | null {
  const candidateTokens = tokenSet(candidateText);
  if (candidateTokens.size === 0) return null;

  for (const alias of aliases) {
    const aliasTokens = tokenSet(normalizeText(alias));
    if (aliasTokens.size === 0) continue;
    if (jaccardSimilarity(aliasTokens, candidateTokens) >= FUZZY_MATCH_THRESHOLD) {
      return alias;
    }
  }
  return null;
}
