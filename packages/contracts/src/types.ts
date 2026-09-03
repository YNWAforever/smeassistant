import type { MerchantPerformanceEvidence } from "@sme-scanner/scoring";
import type { AuditJobStatus } from "./job-state";

export type ModuleResultStatus =
  | "measured"
  | "unavailable"
  | "unsupported"
  | "failed";

export type ModuleResultConfidence = "high" | "medium" | "low" | "none";

export interface ModuleResultRow {
  status: ModuleResultStatus;
  score: number | null;
  confidence: ModuleResultConfidence;
  evidenceCollectedAt: string | null;
  limitationCode: string | null;
}

export interface AuditJobRow {
  id: string;
  workspace_id: string | null;
  business_name: string;
  ig_handle: string | null;
  website_url: string | null;
  industry: string | null;
  district: string | null;
  user_role: string | null;
  status: AuditJobStatus;
  processing_stage: string | null;
  raw_payload: unknown;
  overall_score: number | null;
  /** Legacy display field; never use for authorization. */
  module_scores: Record<string, { score: number }> | null;
  module_results: Record<string, ModuleResultRow> | null;
  score_coverage: number | null;
  scoring_version: string | null;
  input_snapshot: Record<string, unknown> | null;
  failure_category: string | null;
  failure_correlation_id: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  business_objective: string | null;
  place_id: string | null;
  place_match_confidence: string | null;
  parent_job_id: string | null;
  raw_data: RawData | null;
  share_slug: string | null;
  /** Legacy display field; never use for authorization. */
  unlocked: boolean;
  created_at: string;
  completed_at: string | null;
  summary_zh: string | null;
  summary_en: string | null;
  summary_tw: string | null;
  region: string | null;
}

export interface RawData {
  ig?: {
    profile: {
      username: string;
      full_name: string;
      bio: string;
      followers: number;
      following: number;
      posts_count: number;
      profile_pic_url: string;
      is_verified: boolean;
      external_url: string | null;
    };
    posts: Array<{
      id: string;
      caption: string;
      media_type: string;
      like_count: number;
      comment_count: number;
      posted_at: string;
      thumbnail_url?: string;
      permalink?: string | null;
    }>;
    reels: Array<{
      id: string;
      caption: string;
      play_count: number;
      like_count: number;
      comment_count: number;
      posted_at: string;
      thumbnail_url?: string;
      permalink?: string | null;
    }>;
    highlights: Array<{
      id: string;
      title: string;
      cover_url?: string;
      items_count?: number;
    }>;
    stories?: Array<{
      id: string;
      media_type: string;
      thumbnail_url: string | null;
      posted_at: string;
      permalink: string | null;
    }>;
    stories_count: number;
  };
  gbp?: {
    source: "google_places_new" | "serpapi";
    name: string;
    place_id: string;
    address: string;
    maps_url: string | null;
    data_id: string | null;
    data_cid: string | null;
    rating: number;
    reviews_count: number;
    categories: string[];
    photo_names?: string[];
    photos?: Array<{
      id: string;
      image_url: string;
      source_url: string | null;
      attribution: "Google Maps";
    }>;
    posts?: Array<{
      id: string;
      text: string;
      published_at: string;
      image_url: string | null;
      link: string | null;
      action_link: string | null;
    }>;
    evidence_failures?: Array<
      "SERPAPI_GOOGLE_PHOTOS_FAILED" | "SERPAPI_GOOGLE_POSTS_FAILED"
    >;
    reviews: Array<{
      id?: string;
      link?: string | null;
      rating: number;
      text: string;
      time: string;
      images?: string[];
      owner_response?: string;
    }>;
  };
  aeo?: {
    serpapi_runs: Array<{
      query: string;
      engine: "google" | "google_ai_mode";
      ai_overview: {
        text: string;
        brand_mentioned: boolean;
        sources: string[];
      } | null;
      ai_mode: {
        text: string;
        brand_mentioned: boolean;
      } | null;
      organic_results: Array<{
        title: string;
        url: string;
        snippet: string;
        position: number;
      }>;
      brand_organic_rank: number | null;
      competitors_mentioned: string[];
      available?: boolean;
    }>;
    merchant_performance?: MerchantPerformanceEvidence;
    website: {
      url: string;
      has_faq_schema: boolean;
      meta_description_len: number;
      h1_count: number;
    } | null;
  };
}

export interface AuditFindingRow {
  id: string;
  job_id: string;
  finding_key: string;
  module: string;
  severity: string;
  score_impact: number | null;
  owner_message_zh: string | null;
  owner_message_en: string | null;
  owner_message_tw: string | null;
  owner_action_zh: string | null;
  owner_action_en: string | null;
  evidence: Record<string, unknown> | null;
  v02_agent_hint: string | null;
  created_at: string;
}

export interface LeadRow {
  id: string;
  job_id: string | null;
  whatsapp: string | null;
  email: string | null;
  consent_bd_contact: boolean | null;
  lead_score: number | null;
  routed_to: string | null;
  routed_at: string | null;
  created_at: string;
  preferred_contact_channel: string | null;
  contact_identifier: string | null;
  business_objective: string | null;
}

export interface ReportAccessGrantRow {
  id: string;
  job_id: string;
  lead_id: string | null;
  token_hash: string;
  idempotency_key: string;
  purpose: string;
  email_normalized: string | null;
  expires_at: string;
  redeemed_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface ConsentRecordRow {
  id: string;
  job_id: string;
  lead_id: string | null;
  consent_type: string;
  granted: boolean;
  policy_version: string;
  locale: string;
  recorded_at: string;
}

export interface StaffReportEventRow {
  id: string;
  staff_user_id: string;
  staff_email_normalized: string;
  job_id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ScanEventRow {
  id: number;
  job_id: string | null;
  anonymous_session_id: string | null;
  event_name: string;
  properties: Record<string, unknown> | null;
  created_at: string;
}
