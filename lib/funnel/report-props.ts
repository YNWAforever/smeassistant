import { getMarketCtas, type Market } from "@sme-scanner/region";

import { copy, type PrototypeLocale } from "@/lib/copy";
import type { ProviderState } from "@/lib/demo-data";
import { interpolate } from "@/lib/share";

import {
  REPORT_MODULE_ORDER,
  findingLabel,
  humaniseLimitationCode,
  moduleLabel,
  overallImpactLabel,
  severityLabel,
} from "./report-labels";

/* ------------------------------------------------------------------------- */
/* Structural mirror of the server-side ReportViewModel                       */
/* (lib/report/view-model.ts, ported from upstream; see CLAUDE.md §3.1).      */
/* Only the fields the page reads are declared, so the real model — which     */
/* carries more — stays assignable and this mapper stays unit-testable.       */
/* ------------------------------------------------------------------------- */

export type ReportModuleStatus = "measured" | "unavailable" | "unsupported" | "failed";
export type ReportModuleConfidence = "high" | "medium" | "low" | "none";

export interface ReportPreviewLike {
  slug: string;
  locale: string;
  region: string;
  businessName: string;
  district: string | null;
  industry: string | null;
  status: string;
  overallScore: number | null;
  coverage: {
    percent: number | null;
    modules: Array<{
      module: string;
      status: ReportModuleStatus;
      score: number | null;
      confidence: ReportModuleConfidence;
      confidenceExplanation: string;
      limitation: string | null;
    }>;
  };
  priorities: Array<{ findingKey: string; module: string; severity: string; scoreImpact: number }>;
}

export interface ViewerFindingLike {
  id: string;
  findingKey: string;
  module: string;
  severity: string;
  scoreImpact: number | null;
  message: string | null;
  action: string | null;
  evidence: Record<string, unknown> | null;
  fixPackDraft: string | null;
}

export interface ReportProofData {
  ig: {
    username: string;
    fullName: string;
    bio: string;
    followers: number;
    following: number;
    postsCount: number;
    verified: boolean;
    websiteUrl: string | null;
    recentPosts: Array<{ caption: string; mediaType: string; likes: number; comments: number; postedAt: string }>;
    reelsCount: number;
    highlights: string[];
    storiesCount: number;
  } | null;
  gbp: {
    name: string;
    address: string;
    mapsUrl: string | null;
    rating: number;
    reviewsCount: number;
    categories: string[];
    recentReviews: Array<{ rating: number; text: string; time: string; ownerResponse: string | null }>;
  } | null;
  aeo: {
    runs: Array<{ query: string; available: boolean; aiOverviewMentioned: boolean | null; aiModeMentioned: boolean | null; organicRank: number | null }>;
    website: { url: string; hasFaqSchema: boolean; metaDescriptionLength: number; h1Count: number } | null;
  } | null;
  merchant: {
    generatedAt: string;
    runs: Array<{
      query: string;
      engine: string;
      found: boolean;
      confidence: string;
      aiMentioned: boolean;
      aiCited: boolean;
      organicRank: number | null;
      localPackRank: number | null;
      mapsRank: number | null;
      mapsRating: number | null;
      mapsReviews: number | null;
      competitors: Array<{ name: string; source: string; rank: number | null; rating: number | null; reviews: number | null }>;
      snippets: Array<{ label: string; text: string; url: string | null }>;
    }>;
  } | null;
  trust: {
    reviews: number | null;
    rating: number | null;
    responseRate: number | null;
    followers: number | null;
    daysSinceLastReview: number | null;
  } | null;
}

export interface EvidenceItemLike {
  id: string;
  provider: string;
  evidenceType: string;
  sourceUrl: string | null;
  mediaUrl: string | null;
  capturedAt: string;
  publishedAt: string | null;
  text: string | null;
  status: "stored" | "metadata_only" | "failed";
  limitationCode: string | null;
}

export type ReportViewModelLike =
  | { access: "public"; preview: ReportPreviewLike; unlock: { hiddenFindingCount: number; href: string } }
  | {
      access: "viewer" | "member" | "staff";
      preview: ReportPreviewLike;
      fullFindings: ViewerFindingLike[];
      summary: string | null;
      proof: ReportProofData;
      evidence: { items: EvidenceItemLike[] };
    };

/* ------------------------------------------------------------------------- */
/* Props contract of components/report-view.tsx (ReportPage)                  */
/* ------------------------------------------------------------------------- */

export type ReportAccessKind = "public" | "viewer" | "member" | "staff" | "sample";
export type PriorityTone = "urgent" | "high" | "medium" | "low";

export interface ReportPriorityRow {
  key: string;
  rank: number;
  label: string;
  module: string;
  moduleLabel: string;
  severity: string;
  severityLabel: string;
  tone: PriorityTone;
  scoreImpact: number | null;
  /** "−3.8 overall" — weighted effect on the headline score; null when unknown. */
  overallImpact: string | null;
  summary: string | null;
  action: string | null;
  evidence: { source: string; excerpt: string; observedAt: string | null } | null;
  effort: string | null;
}

export interface ReportModuleRow {
  key: string;
  label: string;
  state: ProviderState;
  value: string;
  detail: string;
  observedAt: string | null;
  limitationCode: string | null;
}

export interface ReportFindingRow {
  id: string;
  key: string;
  label: string;
  module: string;
  severity: string;
  severityLabel: string;
  tone: PriorityTone;
  scoreImpact: number | null;
  overallImpact: string | null;
  message: string | null;
  action: string | null;
  fixPackDraft: string | null;
  evidence: Array<[string, string]>;
}

export interface ReportFindingGroup {
  module: string;
  label: string;
  findings: ReportFindingRow[];
}

export type ReportEvidenceItem = EvidenceItemLike;

export type ReportComparison =
  | { kind: "first_scan" }
  | { kind: "comparable"; delta: number; title: string; body: string }
  | { kind: "incomparable"; reason: string };

export interface ReportCta {
  id: string;
  channel: string;
  href: string;
}

export interface ReportProps {
  locale: PrototypeLocale;
  access: ReportAccessKind;
  sample: boolean;
  slug: string;
  market: Market;
  businessName: string;
  district: string | null;
  industry: string | null;
  status: string;
  /** Pre-formatted subtitle override (demo pages); null builds market · district · industry · first scan. */
  subtitle: string | null;
  score: number | null;
  coverage: number | null;
  comparison: ReportComparison;
  modules: ReportModuleRow[];
  priorities: ReportPriorityRow[];
  locked: { hiddenFindingCount: number; unlockHref: string } | null;
  summary: string | null;
  findingGroups: ReportFindingGroup[];
  proof: ReportProofData | null;
  evidence: ReportEvidenceItem[];
  ctas: ReportCta[];
}

/* ------------------------------------------------------------------------- */

const SEVERITY_TONE: Record<string, PriorityTone> = { critical: "urgent", warning: "high", info: "medium" };

export function severityTone(severity: string): PriorityTone {
  return SEVERITY_TONE[severity] ?? "medium";
}

/** Primitive evidence entries only ("reviews_count" → "reviews count"), the same rule as upstream's FullFindings. */
export function evidenceEntries(evidence: Record<string, unknown> | null | undefined): Array<[string, string]> {
  if (!evidence) return [];
  return Object.entries(evidence).flatMap(([key, value]) =>
    value == null || typeof value === "object" ? [] : [[key.replaceAll("_", " "), String(value)] as [string, string]],
  );
}

function moduleOrder(module: string): number {
  const index = (REPORT_MODULE_ORDER as readonly string[]).indexOf(module);
  return index < 0 ? REPORT_MODULE_ORDER.length : index;
}

export function buildReportProps(model: ReportViewModelLike, locale: PrototypeLocale): ReportProps {
  const c = copy[locale].funnel.report;
  const { preview } = model;
  const market: Market = preview.region === "tw" ? "tw" : "hk";
  const full = model.access === "public" ? null : model;
  const findingsByKey = new Map((full?.fullFindings ?? []).map((finding) => [finding.findingKey, finding]));

  const modules: ReportModuleRow[] = [...preview.coverage.modules]
    .sort((a, b) => moduleOrder(a.module) - moduleOrder(b.module))
    .map((result) => ({
      key: result.module,
      label: moduleLabel(locale, result.module),
      state: result.status,
      value: result.score == null ? c.notScored : interpolate(c.scoreOutOf, { score: result.score }),
      detail: [result.confidenceExplanation, result.limitation ? humaniseLimitationCode(result.limitation) : null]
        .filter(Boolean)
        .join(" · "),
      observedAt: null,
      limitationCode: result.limitation,
    }));

  const priorities: ReportPriorityRow[] = preview.priorities.map((priority, index) => {
    const finding = findingsByKey.get(priority.findingKey);
    const entries = evidenceEntries(finding?.evidence);
    return {
      key: priority.findingKey,
      rank: index + 1,
      label: findingLabel(locale, priority.findingKey),
      module: priority.module,
      moduleLabel: moduleLabel(locale, priority.module),
      severity: priority.severity,
      severityLabel: severityLabel(locale, priority.severity),
      tone: severityTone(priority.severity),
      scoreImpact: priority.scoreImpact,
      overallImpact: overallImpactLabel(locale, priority.scoreImpact, priority.module),
      summary: finding?.message ?? null,
      action: finding?.action ?? null,
      evidence: entries.length
        ? { source: moduleLabel(locale, priority.module), excerpt: entries.map(([key, value]) => `${key}: ${value}`).join(" · "), observedAt: null }
        : null,
      effort: null,
    };
  });

  const findingGroups: ReportFindingGroup[] = [];
  if (full) {
    const grouped = new Map<string, ReportFindingRow[]>();
    for (const finding of full.fullFindings) {
      const rows = grouped.get(finding.module) ?? [];
      rows.push({
        id: finding.id,
        key: finding.findingKey,
        label: findingLabel(locale, finding.findingKey),
        module: finding.module,
        severity: finding.severity,
        severityLabel: severityLabel(locale, finding.severity),
        tone: severityTone(finding.severity),
        scoreImpact: finding.scoreImpact,
        overallImpact:
          finding.scoreImpact != null && finding.scoreImpact !== 0 ? overallImpactLabel(locale, finding.scoreImpact, finding.module) : null,
        message: finding.message,
        action: finding.action,
        fixPackDraft: finding.fixPackDraft,
        evidence: evidenceEntries(finding.evidence),
      });
      grouped.set(finding.module, rows);
    }
    for (const [module, findings] of [...grouped.entries()].sort(([a], [b]) => moduleOrder(a) - moduleOrder(b))) {
      findingGroups.push({ module, label: moduleLabel(locale, module), findings });
    }
  }

  return {
    locale,
    access: model.access,
    sample: false,
    slug: preview.slug,
    market,
    businessName: preview.businessName,
    district: preview.district,
    industry: preview.industry,
    status: preview.status,
    subtitle: null,
    score: preview.overallScore,
    coverage: preview.coverage.percent,
    // Phase 3 reads scan_diffs; until then every report is presented as a first scan.
    comparison: { kind: "first_scan" },
    modules,
    priorities,
    locked:
      model.access === "public"
        ? { hiddenFindingCount: model.unlock.hiddenFindingCount, unlockHref: `/${locale}${model.unlock.href}` }
        : null,
    summary: full?.summary ?? null,
    findingGroups,
    proof: full?.proof ?? null,
    evidence: (full?.evidence.items ?? []).map((item) => ({
      id: item.id,
      provider: item.provider,
      evidenceType: item.evidenceType,
      sourceUrl: item.sourceUrl,
      mediaUrl: item.mediaUrl,
      capturedAt: item.capturedAt,
      publishedAt: item.publishedAt,
      text: item.text,
      status: item.status,
      limitationCode: item.limitationCode,
    })),
    ctas: getMarketCtas(market).map((cta) => ({ id: cta.id, channel: cta.channel, href: cta.href })),
  };
}
