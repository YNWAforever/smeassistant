export type ModuleKey = "ig" | "gbp" | "aeo" | "trust";

export type Severity = "critical" | "warning" | "info";

/**
 * Every finding the scorer can emit.
 *
 * A runtime array rather than a bare union so consumers can enumerate it. Each
 * key needs owner-facing copy in all three locales, and a type alone cannot
 * check that a message file kept up — apps/web asserts it against this array.
 * Adding a key here without copy fails that test rather than printing a raw
 * message path onto a report.
 */
export const FINDING_KEYS = [
  // IG
  "ig.profile_clarity",
  "ig.bio_cta",
  "ig.follower_count_low",
  "ig.content_consistency",
  "ig.content_mix",
  "ig.engagement_low",
  "ig.story_highlights_missing",
  "ig.reels_missing",
  // GBP
  "gbp.reviews_volume_low",
  "gbp.rating_low",
  "gbp.review_freshness",
  "gbp.owner_response_low",
  "gbp.photos_freshness",
  "gbp.photos_volume",
  "gbp.hours_incomplete",
  "gbp.categories_missing",
  "gbp.posts_inactive",
  // AEO
  "aeo.ai_overview_missing",
  "aeo.ai_mode_missing",
  "aeo.ai_citation_missing",
  "aeo.search_visibility_poor",
  "aeo.maps_visibility_poor",
  "aeo.competitor_gap",
  "aeo.organic_rank_poor",
  // Declared, translated in all three locales, and emitted by NO code path. Two
  // tests assert its absence (index.test.ts, aeo-performance.test.ts) even when
  // has_faq_schema is a measured false. That is deliberate: the rule was removed
  // in dc40874, a PR whose theme was removing unfounded AI-visibility scoring.
  // Re-wiring it means re-adding a penalty, which is a product decision, not a
  // bug fix — tracked as an open question in docs/v0.2-plan.md section 19.
  "aeo.website_no_faq_schema",
  "aeo.website_content_weak",
  "aeo.website_meta_weak",
  "aeo.website_h1_weak",
  // Trust
  "trust.review_volume",
  "trust.review_rating",
  "trust.review_recency",
  "trust.owner_engagement",
  "trust.social_proof",
  "trust.cross_signal",
  // Data unavailable
  "ig.data_unavailable",
  "gbp.data_unavailable",
  "aeo.data_unavailable",
  "trust.data_unavailable",
] as const;

export type FindingKey = typeof FINDING_KEYS[number];

/**
 * The v0.2 Fix-It agent that should handle a finding. Closed on purpose: it was a
 * bare `string`, and trust.ts silently routed all six of its findings to
 * review_reply_agent — so "your Instagram follower count is low" dispatched an
 * agent that writes review replies. A union turns that class of mistake into a
 * compile error.
 *
 * These are the keys the scorer actually emits. docs/v0.2-plan.md section 7.1
 * records that two agents named in the original plan (KOC Campaign Brief, Lead
 * Magnet) have no triggering finding and are therefore absent here.
 */
export type AgentKey =
  | "review_reply_agent"
  | "gbp_optimization_agent"
  | "gbp_post_agent"
  | "gbp_photo_pack_agent"
  | "ig_bio_rewrite_agent"
  | "ig_growth_agent"
  | "reels_hook_agent"
  | "content_calendar_agent"
  | "aeo_faq_schema_agent"
  | "aeo_content_agent"
  | "seo_content_agent"
  | "llms_txt_agent"
  | "competitive_gap_agent";

export interface Finding {
  finding_key: FindingKey;
  module: ModuleKey;
  severity: Severity;
  score_impact: number;
  owner_message_zh: string;
  /** English copy emitted by scoring so the EN report needs no runtime translation. */
  owner_message_en?: string;
  /** A concrete, specific next step the owner can act on — not a restatement of owner_message. */
  owner_action_zh?: string;
  owner_action_en?: string;
  evidence: Record<string, unknown>;
  v02_agent_hint?: AgentKey;
}

export interface IGPayload {
  available: boolean;
  username?: string;
  bio?: string;
  followers?: number;
  following?: number;
  posts_count?: number;
  profile_pic_url?: string;
  is_verified?: boolean;
  external_url?: string;
  posts_last_12?: Array<{
    id: string;
    caption?: string;
    media_type?: string;
    like_count?: number;
    comment_count?: number;
    posted_at?: string;
  }>;
  reels_count?: number;
  reels_last_12?: Array<{
    id: string;
    caption?: string;
    play_count?: number;
    like_count?: number;
    comment_count?: number;
    posted_at?: string;
  }>;
  highlights_count?: number;
  highlight_titles?: string[];
  stories_count?: number;
}

export interface GBPPayload {
  available: boolean;
  place_id?: string;
  name?: string;
  rating?: number;
  reviews_count?: number;
  reviews?: Array<{
    rating: number;
    text?: string;
    time?: string;
    owner_response?: string;
  }>;
  photos_count?: number;
  latest_photo_at?: string;
  hours_complete?: boolean;
  categories?: string[];
  recent_posts_count?: number;
}

export type AEOConfidence = "high" | "medium" | "low" | "none";
export type AEOMatchSignal = "place_id" | "domain" | "url" | "gbp_name" | "brand_alias" | "fuzzy_name";
export type AEOQueryType = "discovery" | "need" | "brand" | "maps";
export type AEOEvidenceEngine = "google" | "google_ai_mode" | "google_ai_overview" | "google_maps";
export type AEOConfidenceReasonCode = "place_id" | "domain_and_alias" | "alias" | "domain" | "fuzzy" | "none";

export interface AEOPerformanceRun {
  query: string;
  query_type: AEOQueryType;
  engine: AEOEvidenceEngine;
  available: boolean;
  unsupported: boolean;
  ai_overview_triggered: boolean | null;
  /**
   * Whether the AI engine actually produced an answer for this run. `null` for legacy runs
   * persisted before this field existed (treated as "answered" so old data scores unchanged).
   * Lets scoring exclude AI runs that returned no answer from the citation denominator, mirroring
   * the `ai_overview_triggered` guard for the google engine.
   */
  ai_answered?: boolean | null;
  ai_mentioned: boolean;
  ai_cited: boolean;
  organic_rank: number | null;
  local_pack_rank: number | null;
  maps_rank: number | null;
  confidence: AEOConfidence;
  matched_by: AEOMatchSignal[];
  competitors_above: string[];
}

export interface MerchantPerformanceEvidence {
  version: "2026-06-18";
  generated_at: string;
  entity: {
    business_name: string;
    aliases: string[];
    domain: string | null;
    website_url: string | null;
    place_id: string | null;
    gbp_name: string | null;
    district: string | null;
    vertical: string | null;
  };
  runs: MerchantPerformanceEvidenceRun[];
}

export interface MerchantPerformanceEvidenceRun {
  id: string;
  query: string;
  query_type: AEOQueryType;
  engine: AEOEvidenceEngine;
  requested_at: string;
  settings: {
    gl: "hk" | "tw";
    hl: string;
    location: string | null;
    /** google_maps search-origin anchor (@lat,lng,zoom). Optional for legacy runs. */
    ll?: string | null;
    device: "desktop" | "mobile";
  };
  serpapi: {
    status: string;
    search_id: string | null;
    total_time_taken: number | null;
    error: string | null;
  };
  merchant_presence: {
    found: boolean;
    confidence: AEOConfidence;
    confidence_reason: string;
    /** Stable code for the confidence reason so the UI can localize it. Optional for legacy runs. */
    confidence_reason_code?: AEOConfidenceReasonCode;
    matched_by: AEOMatchSignal[];
    ai_mentioned: boolean;
    ai_cited: boolean;
    ai_citation_urls: string[];
    organic_rank: number | null;
    local_pack_rank: number | null;
    maps_rank: number | null;
    /** The matched result's own rating in this maps run. Null unless confidently matched. */
    maps_rating?: number | null;
    /** The matched result's own review count in this maps run. Null unless confidently matched. */
    maps_reviews?: number | null;
  };
  competitors: Array<{
    name: string;
    domain: string | null;
    url: string | null;
    place_id: string | null;
    source: "ai" | "organic" | "local_pack" | "maps";
    rank: number | null;
    /** Populated for maps-sourced competitors. Not yet wired for other sources — local_pack
     *  results carry the same rating/reviews fields upstream but this field is null for them
     *  until a later task plumbs it through. */
    rating?: number | null;
    /** Populated for maps-sourced competitors. Not yet wired for other sources — see `rating`. */
    reviews?: number | null;
    cited: boolean;
  }>;
  evidence_snippets: Array<{
    source: "ai_overview" | "ai_mode" | "organic" | "local_pack" | "maps";
    label: string;
    text: string;
    url: string | null;
    matched_text: string | null;
  }>;
  raw_refs: {
    ai_overview_triggered?: boolean;
    ai_overview_text?: string;
    ai_mode_markdown?: string;
    ai_references?: Array<{ title?: string; link?: string; source?: string }>;
    organic_results?: Array<{ title: string; link: string; snippet: string; position: number }>;
    local_results?: Array<{ title: string; place_id?: string; rating?: number; reviews?: number; position?: number }>;
    maps_results?: Array<{ title: string; place_id?: string; rating?: number; reviews?: number; position?: number }>;
  };
}

export interface AEOPayload {
  available: boolean;
  serpapi_runs: Array<{
    query: string;
    ai_overview_mentioned: boolean;
    ai_mode_mentioned: boolean;
    brand_organic_rank: number | null;
    competitors_mentioned: string[];
  }>;
  performance_runs?: AEOPerformanceRun[];
  website?: {
    available: boolean;
    has_faq_schema?: boolean;
    meta_description_len?: number;
    h1_count?: number;
  };
}

export interface AuditPayload {
  business_name: string;
  industry: string;
  district: string;
  ig: IGPayload;
  gbp: GBPPayload;
  aeo: AEOPayload;
}

export type ModuleStatus = "measured" | "unavailable" | "unsupported" | "failed";
export type Confidence = "high" | "medium" | "low" | "none";

export interface ModuleScore {
  status: ModuleStatus;
  score: number | null;
  confidence: Confidence;
  evidenceCollectedAt: string | null;
  limitationCode: string | null;
  findings: Finding[];
}

export interface ScoreResult {
  overall: number | null;
  coverage: number;
  scoringVersion: "2026-08-16";
  modules: Record<ModuleKey, ModuleScore>;
  findings: Finding[];
}

export interface BenchmarkContext {
  current: number;
  benchmark_min?: number;
  benchmark_avg?: number;
  tier: string;
  industry: string;
}
