import type { ReportAccess, ReportMemberRole } from "@/lib/report-access/authorize-report";
import type { EvidenceProvider, EvidenceType } from "@sme-scanner/contracts";
import { selectTopPriorities } from "./top-priorities";

export type ReportModuleStatus = "measured" | "unavailable" | "unsupported" | "failed";
export type ReportModuleConfidence = "high" | "medium" | "low" | "none";

export interface InstagramProofModel {
  username: string; fullName: string; bio: string; followers: number; following: number; postsCount: number;
  verified: boolean; websiteUrl: string | null;
  recentPosts: Array<{ caption: string; mediaType: string; likes: number; comments: number; postedAt: string }>;
  reelsCount: number; highlights: string[]; storiesCount: number;
}
export interface GoogleBusinessProofModel {
  name: string; address: string; mapsUrl: string | null;
  rating: number; reviewsCount: number; categories: string[];
  recentReviews: Array<{ rating: number; text: string; time: string; ownerResponse: string | null }>;
}
export interface AeoProofModel {
  runs: Array<{ query: string; available: boolean; aiOverviewMentioned: boolean | null; aiModeMentioned: boolean | null; organicRank: number | null }>;
  website: { url: string; hasFaqSchema: boolean; metaDescriptionLength: number; h1Count: number } | null;
}
export interface MerchantProofModel {
  generatedAt: string;
  runs: Array<{
    query: string; engine: string; found: boolean; confidence: string; aiMentioned: boolean; aiCited: boolean;
    organicRank: number | null; localPackRank: number | null; mapsRank: number | null;
    mapsRating: number | null; mapsReviews: number | null;
    competitors: Array<{ name: string; source: string; rank: number | null; rating: number | null; reviews: number | null }>;
    snippets: Array<{ label: string; text: string; url: string | null }>;
  }>;
}
export interface TrustProofModel {
  reviews: number | null; rating: number | null; responseRate: number | null; followers: number | null; daysSinceLastReview: number | null;
}
export interface ReportProofModel {
  ig: InstagramProofModel | null; gbp: GoogleBusinessProofModel | null; aeo: AeoProofModel | null;
  merchant: MerchantProofModel | null; trust: TrustProofModel | null;
}
export interface EvidenceGalleryItem {
  id: string; provider: EvidenceProvider; evidenceType: EvidenceType; sourceUrl: string | null;
  mediaUrl: string | null; capturedAt: string; publishedAt: string | null; text: string | null;
  metadata: Record<string, string | number | boolean | null | string[]>;
  status: "stored" | "metadata_only" | "failed"; limitationCode: string | null;
}
export interface EvidenceGalleryModel { items: EvidenceGalleryItem[] }
export interface AuthorizedReportSource {
  summary: string | null; proof: ReportProofModel; evidence: EvidenceGalleryModel;
}

export interface ReportViewSource {
  job: {
    id: string; slug?: string; locale?: string; region?: string; businessName: string;
    district?: string | null; industry?: string | null; status: string;
    overallScore: number | null; scoreCoverage: number | null;
    moduleResults: Record<string, { status: ReportModuleStatus; score: number | null; confidence: ReportModuleConfidence; limitationCode: string | null }>;
  };
  findingCount: number;
  findings: Array<{
    id: string; findingKey: string; module: string; severity: string; scoreImpact: number | null;
    ownerMessage: string | null; detailedFix: string | null; evidence: Record<string, unknown> | null; internalHint: string | null;
    fixPackDraftOutput: Record<string, unknown> | null;
  }>;
  authorized?: AuthorizedReportSource;
}

export interface PreviewPriority { findingKey: string; module: string; severity: string; scoreImpact: number }
export interface ReportPreview {
  slug: string; locale: string; region: string; businessName: string;
  district: string | null; industry: string | null;
  status: string; overallScore: number | null;
  coverage: {
    percent: number | null; method: "weighted_measured_modules";
    confidenceLegend: Record<ReportModuleConfidence, string>;
    modules: Array<{
      module: string; status: ReportModuleStatus; score: number | null; confidence: ReportModuleConfidence;
      confidenceExplanation: string; limitation: string | null;
    }>;
  };
  priorities: PreviewPriority[];
}
export interface UnlockPrompt { hiddenFindingCount: number; href: string }
export interface ViewerFinding {
  id: string; findingKey: string; module: string; severity: string; scoreImpact: number | null;
  message: string | null; action: string | null; evidence: Record<string, unknown> | null;
  internalHint: string | null; fixPackDraft: string | null;
}
export interface StaffActionsModel { userId: string; email: string; jobId: string }
export interface PublicReportModel { access: "public"; preview: ReportPreview; unlock: UnlockPrompt }
export interface ViewerReportModel {
  access: "viewer"; preview: ReportPreview; fullFindings: ViewerFinding[];
  summary: string | null; proof: ReportProofModel; evidence: EvidenceGalleryModel;
}
/**
 * A signed-in workspace member reading a report attached to their workspace
 * (CLAUDE.md 3.2.2). Same authorized shape as a viewer, plus the membership
 * that granted it so the page can scope owner-only affordances by role.
 */
export interface MemberReportModel {
  access: "member"; workspaceId: string; role: ReportMemberRole;
  preview: ReportPreview; fullFindings: ViewerFinding[];
  summary: string | null; proof: ReportProofModel; evidence: EvidenceGalleryModel;
}
export interface StaffReportModel {
  access: "staff"; preview: ReportPreview; fullFindings: ViewerFinding[];
  summary: string | null; proof: ReportProofModel; evidence: EvidenceGalleryModel;
  staffActions: StaffActionsModel;
}
export type ReportViewModel = PublicReportModel | ViewerReportModel | MemberReportModel | StaffReportModel;

function coveragePercent(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const percent = value <= 1 ? value * 100 : value;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

function confidenceLegend(locale: string): Record<ReportModuleConfidence, string> {
  if (locale === "zh-HK") return {
    high: "高可信度：已收集直接證據。", medium: "中可信度：多項部分訊號支持此結果。",
    low: "低可信度：只有有限證據支持此結果。", none: "沒有可信度：此項目未能量度。",
  };
  if (locale === "zh-TW") return {
    high: "高可信度：已收集直接證據。", medium: "中可信度：多項部分訊號支持此結果。",
    low: "低可信度：僅有有限證據支持此結果。", none: "無可信度：此模組無法衡量。",
  };
  return {
    high: "High confidence: direct evidence was collected.",
    medium: "Medium confidence: multiple partial signals support this result.",
    low: "Low confidence: limited evidence supports this result.",
    none: "No confidence: this module could not be measured.",
  };
}

function buildPreview(source: ReportViewSource): ReportPreview {
  const locale = source.job.locale ?? "en";
  const failed = source.job.status === "failed";
  const legend = confidenceLegend(locale);
  const priorities = failed ? [] : selectTopPriorities(source.findings.map((finding) => ({
    ...finding, finding_key: finding.findingKey, score_impact: finding.scoreImpact,
  }))).map((finding) => ({
    findingKey: finding.findingKey, module: finding.module, severity: finding.severity, scoreImpact: finding.scoreImpact as number,
  }));
  return {
    slug: source.job.slug ?? "", locale, region: source.job.region ?? "hk", businessName: source.job.businessName,
    district: source.job.district ?? null, industry: source.job.industry ?? null,
    status: source.job.status, overallScore: failed ? null : source.job.overallScore,
    coverage: {
      percent: failed ? null : coveragePercent(source.job.scoreCoverage), method: "weighted_measured_modules", confidenceLegend: legend,
      modules: Object.entries(source.job.moduleResults).map(([module, result]) => ({
        module, status: result.status, score: failed || result.status !== "measured" ? null : result.score,
        confidence: result.confidence, confidenceExplanation: legend[result.confidence], limitation: result.limitationCode,
      })),
    },
    priorities,
  };
}

/**
 * A review-reply draft is written in the reviewer's own detected language
 * (see packages/scoring/src/agents/contracts.ts), so it renders identically
 * regardless of report locale. A gbp-post draft is public content aimed at
 * the market's readers, so it follows the report locale like
 * owner_message_zh/en -- English for "en", the zh copy otherwise (zh-HK and
 * zh-TW share one draft, same as Finding's two-field pattern).
 *
 * Exported for the owner-dashboard fix-pack GET route, which resolves the
 * same draft text server-side -- a second resolver would drift from this one.
 */
export function resolveFixPackDraftText(output: Record<string, unknown> | null, locale: string): string | null {
  if (!output) return null;
  if (output.agentKey === "review_reply_agent" && typeof output.draftReply === "string") {
    return output.draftReply;
  }
  if (output.agentKey === "gbp_post_agent") {
    const zh = typeof output.draftPostZh === "string" ? output.draftPostZh : null;
    const en = typeof output.draftPostEn === "string" ? output.draftPostEn : null;
    return locale === "en" ? en ?? zh : zh ?? en;
  }
  return null;
}

function buildFullFindings(source: ReportViewSource): ViewerFinding[] {
  const locale = source.job.locale ?? "en";
  return source.findings.map((finding) => ({
    id: finding.id, findingKey: finding.findingKey, module: finding.module, severity: finding.severity,
    scoreImpact: finding.scoreImpact, message: finding.ownerMessage, action: finding.detailedFix, evidence: finding.evidence,
    internalHint: finding.internalHint,
    fixPackDraft: resolveFixPackDraftText(finding.fixPackDraftOutput, locale),
  }));
}

const EMPTY_PROOF: ReportProofModel = { ig: null, gbp: null, aeo: null, merchant: null, trust: null };

export function buildReportViewModel(source: ReportViewSource, access: ReportAccess): ReportViewModel {
  const preview = buildPreview(source);
  if (access.kind === "public") {
    // Every locale is prefixed in this app (CLAUDE.md 3.1), so the unlock link
    // carries the report locale itself instead of relying on the page to add it.
    return { access: "public", preview, unlock: {
      hiddenFindingCount: Math.max(0, source.findingCount - preview.priorities.length),
      href: `/${encodeURIComponent(preview.locale)}/unlock/${encodeURIComponent(preview.slug)}?market=${preview.region === "tw" ? "TW" : "HK"}`,
    } };
  }
  const fullFindings = buildFullFindings(source);
  const summary = source.authorized?.summary ?? null;
  const proof = source.authorized?.proof ?? EMPTY_PROOF;
  const evidence = source.authorized?.evidence ?? { items: [] };
  if (access.kind === "viewer") return { access: "viewer", preview, fullFindings, summary, proof, evidence };
  if (access.kind === "member") {
    return { access: "member", workspaceId: access.workspaceId, role: access.role, preview, fullFindings, summary, proof, evidence };
  }
  return {
    access: "staff", preview, fullFindings, summary, proof, evidence,
    staffActions: { userId: access.userId, email: access.email, jobId: source.job.id },
  };
}
