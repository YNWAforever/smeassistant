import { isSensitiveQueryName } from "@sme-scanner/scan-engine";
import type { ReportProofModel, TrustProofModel } from "./view-model";

type UnknownRecord = Record<string, unknown>;
const asRecord = (value: unknown): UnknownRecord | null => value != null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, max = 500): string => typeof value === "string" ? value.slice(0, max) : "";
const nullableText = (value: unknown, max = 500): string | null => typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
const number = (value: unknown, fallback = 0): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const nullableNumber = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const bool = (value: unknown): boolean => value === true;
const nullableBool = (value: unknown): boolean | null => typeof value === "boolean" ? value : null;
const safeUrl = (value: unknown): string | null => {
  const candidate = nullableText(value, 300);
  return candidate && /^https?:\/\//i.test(candidate) ? candidate : null;
};

const safeGoogleMapsUrl = (value: unknown): string | null => {
  const candidate = nullableText(value, 300);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    const googleMapsHost = host === "maps.app.goo.gl"
      || /^(?:(?:maps|www)\.)?google\.(?:com|com\.hk|com\.tw)$/.test(host);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || !googleMapsHost
      || [...url.searchParams.keys()].some(isSensitiveQueryName)
    ) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

function trustProof(findings: Array<{ evidence?: Record<string, unknown> | null }>): TrustProofModel | null {
  const evidence = findings.map((finding) => finding.evidence).find((item) => item && ["reviews_count", "rating", "response_rate", "ig_followers", "days_since_last_review"].some((key) => key in item));
  return evidence ? {
    reviews: nullableNumber(evidence.reviews_count), rating: nullableNumber(evidence.rating), responseRate: nullableNumber(evidence.response_rate),
    followers: nullableNumber(evidence.ig_followers), daysSinceLastReview: nullableNumber(evidence.days_since_last_review),
  } : null;
}

/** Convert provider payloads into deliberately bounded, presentation-only proof. */
export function sanitizeReportProof(rawData: unknown, findings: Array<{ evidence?: Record<string, unknown> | null }>): ReportProofModel {
  const raw = asRecord(rawData);
  const ig = asRecord(raw?.ig);
  const profile = asRecord(ig?.profile);
  const gbp = asRecord(raw?.gbp);
  const aeo = asRecord(raw?.aeo);
  const merchant = asRecord(aeo?.merchant_performance);

  return {
    ig: profile ? {
      username: text(profile.username, 100), fullName: text(profile.full_name, 160), bio: text(profile.bio, 500),
      followers: number(profile.followers), following: number(profile.following), postsCount: number(profile.posts_count),
      verified: bool(profile.is_verified), websiteUrl: safeUrl(profile.external_url),
      recentPosts: asArray(ig?.posts).slice(0, 6).flatMap((value) => {
        const post = asRecord(value); return post ? [{ caption: text(post.caption, 500), mediaType: text(post.media_type, 40), likes: number(post.like_count),
          comments: number(post.comment_count), postedAt: text(post.posted_at, 40) }] : [];
      }),
      reelsCount: Math.min(20, asArray(ig?.reels).length),
      highlights: asArray(ig?.highlights).slice(0, 8).flatMap((value) => { const item = asRecord(value); return item ? [text(item.title, 100)] : []; }).filter(Boolean),
      storiesCount: number(ig?.stories_count),
    } : null,
    gbp: gbp ? {
      name: text(gbp.name, 200), address: text(gbp.address, 300), mapsUrl: safeGoogleMapsUrl(gbp.maps_url),
      rating: number(gbp.rating), reviewsCount: number(gbp.reviews_count),
      categories: asArray(gbp.categories).slice(0, 8).map((value) => text(value, 100)).filter(Boolean),
      recentReviews: asArray(gbp.reviews).slice(0, 3).flatMap((value) => {
        const review = asRecord(value); return review ? [{ rating: number(review.rating), text: text(review.text, 500), time: text(review.time, 40),
          ownerResponse: nullableText(review.owner_response, 500) }] : [];
      }),
    } : null,
    aeo: aeo ? {
      runs: asArray(aeo.serpapi_runs).slice(0, 6).flatMap((value) => {
        const run = asRecord(value); if (!run) return [];
        const overview = asRecord(run.ai_overview); const mode = asRecord(run.ai_mode);
        return [{ query: text(run.query, 300), available: run.available !== false, aiOverviewMentioned: overview ? nullableBool(overview.brand_mentioned) : null,
          aiModeMentioned: mode ? nullableBool(mode.brand_mentioned) : null, organicRank: nullableNumber(run.brand_organic_rank) }];
      }),
      website: (() => { const website = asRecord(aeo.website); return website ? { url: safeUrl(website.url) ?? "", hasFaqSchema: bool(website.has_faq_schema),
        metaDescriptionLength: number(website.meta_description_len), h1Count: number(website.h1_count) } : null; })(),
    } : null,
    merchant: merchant ? {
      generatedAt: text(merchant.generated_at, 40),
      runs: asArray(merchant.runs).slice(0, 8).flatMap((value) => {
        const run = asRecord(value); const presence = asRecord(run?.merchant_presence); if (!run || !presence) return [];
        return [{ query: text(run.query, 300), engine: text(run.engine, 40), found: bool(presence.found), confidence: text(presence.confidence, 20),
          aiMentioned: bool(presence.ai_mentioned), aiCited: bool(presence.ai_cited), organicRank: nullableNumber(presence.organic_rank),
          localPackRank: nullableNumber(presence.local_pack_rank), mapsRank: nullableNumber(presence.maps_rank),
          mapsRating: nullableNumber(presence.maps_rating), mapsReviews: nullableNumber(presence.maps_reviews),
          // rating survives the normalizer -> type -> sanitizer -> view-model chain intact but
          // is not yet rendered (report-proof.tsx's gap line uses only reviews) — kept as a
          // plausible near-term extension (a rating gap), not dead code.
          competitors: asArray(run.competitors).slice(0, 3).flatMap((item) => { const competitor = asRecord(item); return competitor ? [{ name: text(competitor.name, 160), source: text(competitor.source, 30), rank: nullableNumber(competitor.rank), rating: nullableNumber(competitor.rating), reviews: nullableNumber(competitor.reviews) }] : []; }),
          snippets: asArray(run.evidence_snippets).slice(0, 3).flatMap((item) => { const snippet = asRecord(item); return snippet ? [{ label: text(snippet.label, 100), text: text(snippet.text, 500), url: safeUrl(snippet.url) }] : []; }),
        }];
      }),
    } : null,
    trust: trustProof(findings),
  };
}
