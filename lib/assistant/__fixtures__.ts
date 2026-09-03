import { buildActionOverview, type ActionOverview, type ActionRow } from "@/lib/workspace/overview";
import type { ScanDiffRow, SnapshotRecord } from "@/lib/workspace/snapshots";

/** Shared test fixtures for lib/assistant (not a test file). */
export const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
export const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
export const ACTION_ID = "33333333-3333-4333-8333-333333333333";
export const SNAPSHOT_ID = "55555555-5555-4555-8555-555555555555";
export const BASE_SNAPSHOT_ID = "66666666-6666-4666-8666-666666666666";
export const DIFF_ID = "77777777-7777-4777-8777-777777777777";

const measured = { status: "measured", confidence: "high", limitationCode: null, score: 60 } as const;
const unsupported = { status: "unsupported", confidence: "none", limitationCode: null, score: null } as const;

export const snapshot: SnapshotRecord = {
  id: SNAPSHOT_ID,
  jobId: "job-head",
  workspaceId: WORKSPACE_ID,
  locationId: LOCATION_ID,
  market: "hk",
  observedAt: "2026-08-25T01:42:00Z",
  scoringVersion: "2026.08",
  overallScore: 62,
  coverage: 0.78,
  moduleStates: { google_business: measured, instagram: measured, search_ai: measured, website: unsupported },
  metrics: { "gbp.rating": 4.3, "gbp.reviews_count": 128, "gbp.unanswered_sampled": 7, "gbp.response_rate_pct": 18, "ig.days_since_last_post": 16, "aeo.ai_citation_count": 2, "gbp.hours_complete": 1 },
  websiteChecks: null,
  comparableTo: BASE_SNAPSHOT_ID,
  diffId: DIFF_ID,
  createdAt: "2026-08-25T01:45:00Z",
};

export const base: SnapshotRecord = {
  ...snapshot,
  id: BASE_SNAPSHOT_ID,
  jobId: "job-base",
  observedAt: "2026-08-20T01:42:00Z",
  overallScore: 66,
  metrics: { "gbp.rating": 4.3, "gbp.reviews_count": 121, "gbp.unanswered_sampled": 3, "gbp.response_rate_pct": 31, "ig.days_since_last_post": 4, "aeo.ai_citation_count": 2 },
  comparableTo: null,
  diffId: null,
};

export const diff: ScanDiffRow = {
  id: DIFF_ID,
  base_job_id: "job-base",
  head_job_id: "job-head",
  comparable: true,
  incomparable_reason: null,
  composite_withheld_reason: null,
  intersection_modules: ["gbp", "ig", "aeo"],
  composite_base: 66,
  composite_head: 62,
  composite_delta: -4,
  resolved_findings: ["ig.bio_missing_cta"],
  regressed_findings: ["gbp.owner_response_low"],
  decayed_findings: [],
  lost_coverage: [],
  gained_coverage: [],
  created_at: "2026-08-25T01:45:00Z",
};

export const incomparableDiff: ScanDiffRow = { ...diff, comparable: false, incomparable_reason: "SCORING_VERSION_MISMATCH", composite_delta: null };

export const actionRow: ActionRow & { source_snapshot_id: string | null } = {
  id: ACTION_ID,
  workspace_id: WORKSPACE_ID,
  location_id: LOCATION_ID,
  template_key: "review-response",
  source: "finding",
  source_finding_keys: ["gbp.owner_response_low"],
  source_snapshot_id: SNAPSHOT_ID,
  title: { en: "Reply to unanswered Google reviews", "zh-HK": "回覆未回覆的 Google 評論", "zh-TW": "回覆未回覆的 Google 評論" },
  summary: { en: "Seven reviews await a reply.", "zh-HK": "7 則評論等待回覆。", "zh-TW": "7 則評論等待回覆。" },
  evidence: { factType: "Observed", source: "Google Business · Yik Yam", value: "18% · 7 unanswered", detail: { en: "", "zh-HK": "", "zh-TW": "" }, observedAt: "2026-08-25T01:42:00Z", freshness: { en: "", "zh-HK": "", "zh-TW": "" } },
  priority: "high",
  priority_score: 72,
  priority_factors: [
    { key: "severity", points: 30 },
    { key: "readiness", points: 20 },
    { key: "urgency", points: 12 },
  ],
  effort_minutes: 15,
  required_inputs: ["brand_voice"],
  provided_inputs: { brand_voice: "warm", language: "zh-HK" },
  assignee_user_id: null,
  due_at: null,
  action_state: "recommended",
  measurement_state: "not_eligible",
  capability: "Live",
  created_at: "2026-08-25T02:00:00Z",
  updated_at: "2026-08-25T02:00:00Z",
};

export const socialRow: typeof actionRow = {
  ...actionRow,
  id: "44444444-4444-4444-8444-444444444444",
  template_key: "social-post",
  source_finding_keys: ["ig.posting_gap"],
  title: { en: "Fill the Instagram gap", "zh-HK": "處理 Instagram 內容空檔", "zh-TW": "處理 Instagram 內容空檔" },
  evidence: { ...(actionRow.evidence as Record<string, unknown>), source: "Instagram · Yik Yam", value: "16 days since last post" },
  priority: "medium",
  priority_score: 40,
  priority_factors: [{ key: "impact", points: 25 }],
  required_inputs: ["asset_or_text_only"],
  provided_inputs: {},
};

export function overview(row: ActionRow = actionRow): ActionOverview {
  return buildActionOverview(row, { location: { id: LOCATION_ID, slug: "yik-yam", name: { en: "Yik Yam", "zh-HK": "奕蔭街", "zh-TW": "奕蔭街" } }, latestRun: null, latestVersion: null });
}
