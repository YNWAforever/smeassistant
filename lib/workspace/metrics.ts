// Deep import on purpose: the vendored package (verbatim, D1) does not re-export
// this helper from its index, and it has no `exports` map to forbid the path.
import { computeOwnerResponseRate } from "@sme-scanner/scoring/src/response-rate";
import type { WebsiteChecks } from "@/lib/website/checks";

/**
 * Derived workspace metrics (CLAUDE.md §3.5.4), stored in
 * `scan_snapshots.metrics`. Numbers only; a key is absent when the underlying
 * evidence is not measurable. Never a stand-in zero, and never a second score
 * (guardrail 3): these describe the evidence, they do not re-weigh it.
 */
export const METRIC_KEYS = [
  "gbp.rating",
  "gbp.reviews_count",
  "gbp.reviews_sampled",
  "gbp.unanswered_sampled",
  "gbp.response_rate_pct",
  "gbp.days_since_last_review",
  "gbp.photos_count",
  "gbp.hours_complete",
  "ig.followers",
  "ig.posts_sampled",
  "ig.days_since_last_post",
  "ig.reels_count",
  "ig.highlights_count",
  "ig.avg_engagement",
  "aeo.runs_total",
  "aeo.runs_usable",
  "aeo.ai_citation_count",
  "aeo.best_organic_rank",
  "aeo.best_maps_rank",
  "aeo.competitors_above",
  "aeo.ai_overview_presence_rate",
  "aeo.ai_mode_presence_rate",
  "aeo.organic_presence_rate",
  "website.checks_passed",
  "website.checks_evaluated",
  "website.has_faq_schema",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];
export type SnapshotMetrics = Partial<Record<MetricKey, number>>;

export interface MetricFinding {
  finding_key: string;
  evidence: Record<string, unknown> | null;
}

export interface MetricAeoRow {
  surface: string;
  cited: boolean;
  rank: number | null;
}

export interface DeriveMetricsInput {
  rawData: unknown;
  findings: MetricFinding[];
  aeoRows: MetricAeoRow[];
  websiteChecks: WebsiteChecks | null;
  now: Date;
}

type Dict = Record<string, unknown>;

function dict(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Dict) : null;
}

function list(value: unknown): Dict[] {
  return Array.isArray(value) ? value.filter((item): item is Dict => Boolean(dict(item))) : [];
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function daysSince(iso: unknown, now: Date): number | null {
  if (typeof iso !== "string") return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

function newest(values: unknown[]): string | null {
  let best: string | null = null;
  for (const value of values) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) continue;
    if (!best || Date.parse(value) > Date.parse(best)) best = value;
  }
  return best;
}

/** Findings expose some metrics in their evidence; prefer those where present (§3.5.4). */
function evidenceNumber(findings: MetricFinding[], keyPrefix: string, field: string): number | null {
  for (const finding of findings) {
    if (!finding.finding_key.startsWith(keyPrefix)) continue;
    const value = num(finding.evidence?.[field]);
    if (value !== null) return value;
  }
  return null;
}

function set(metrics: SnapshotMetrics, key: MetricKey, value: number | null | undefined): void {
  if (value === null || value === undefined || !Number.isFinite(value)) return;
  metrics[key] = value;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function deriveMetrics(input: DeriveMetricsInput): SnapshotMetrics {
  const metrics: SnapshotMetrics = {};
  const raw = dict(input.rawData) ?? {};

  // Google Business Profile
  const gbp = dict(raw.gbp);
  if (gbp) {
    const reviews = list(gbp.reviews);
    const reviewsCount = evidenceNumber(input.findings, "gbp.", "reviews_count") ?? num(gbp.reviews_count);
    set(metrics, "gbp.rating", evidenceNumber(input.findings, "gbp.rating", "rating") ?? num(gbp.rating));
    set(metrics, "gbp.reviews_count", reviewsCount);
    if (reviews.length > 0) {
      const sampled = reviews.slice(0, 5);
      set(metrics, "gbp.reviews_sampled", sampled.length);
      set(
        metrics,
        "gbp.unanswered_sampled",
        sampled.filter((r) => !(typeof r.owner_response === "string" && r.owner_response.trim() !== "")).length,
      );
      const rate = computeOwnerResponseRate(
        sampled.map((r) => ({ owner_response: typeof r.owner_response === "string" ? r.owner_response : null })),
        reviewsCount,
      );
      if (rate.measurable && rate.rate !== null) set(metrics, "gbp.response_rate_pct", Math.round(rate.rate * 100));
      set(metrics, "gbp.days_since_last_review", daysSince(newest(reviews.map((r) => r.time ?? r.posted_at ?? r.date)), input.now));
    }
    const photos = Array.isArray(gbp.photos)
      ? gbp.photos.length
      : Array.isArray(gbp.photo_names)
        ? gbp.photo_names.length
        : num(gbp.photos_count);
    set(metrics, "gbp.photos_count", evidenceNumber(input.findings, "gbp.photos", "photos_count") ?? (typeof photos === "number" ? photos : null));
    const hoursComplete =
      typeof gbp.hours_complete === "boolean" ? gbp.hours_complete : Array.isArray(gbp.opening_hours) ? gbp.opening_hours.length >= 7 : null;
    if (hoursComplete !== null) set(metrics, "gbp.hours_complete", hoursComplete ? 1 : 0);
  }

  // Instagram
  const ig = dict(raw.ig);
  if (ig) {
    const profile = dict(ig.profile) ?? ig;
    set(metrics, "ig.followers", evidenceNumber(input.findings, "ig.follower", "followers") ?? num(profile.followers));
    const posts = list(ig.posts);
    if (posts.length > 0) {
      set(metrics, "ig.posts_sampled", posts.length);
      set(
        metrics,
        "ig.days_since_last_post",
        evidenceNumber(input.findings, "ig.content_consistency", "days_since_last_post") ??
          daysSince(newest(posts.map((p) => p.posted_at ?? p.timestamp)), input.now),
      );
      const engagements = posts.map((p) => (num(p.like_count) ?? 0) + (num(p.comment_count) ?? 0));
      set(metrics, "ig.avg_engagement", round1(engagements.reduce((a, b) => a + b, 0) / posts.length));
    }
    const reels = Array.isArray(ig.reels) ? ig.reels.length : num(profile.reels_count);
    set(metrics, "ig.reels_count", typeof reels === "number" ? reels : null);
    const highlights = Array.isArray(ig.highlights) ? ig.highlights.length : num(profile.highlights_count);
    set(metrics, "ig.highlights_count", typeof highlights === "number" ? highlights : null);
  }

  // Search & AI surfaces
  const aeo = dict(raw.aeo);
  const runs = aeo ? list(aeo.serpapi_runs) : [];
  if (runs.length > 0) {
    set(metrics, "aeo.runs_total", runs.length);
    const usable = runs.filter((r) => r.error === undefined || r.error === null);
    set(metrics, "aeo.runs_usable", usable.length);
    set(metrics, "aeo.ai_citation_count", usable.filter((r) => r.ai_overview_mentioned === true || r.ai_mode_mentioned === true).length);
    const organicRanks = usable.map((r) => num(r.brand_organic_rank)).filter((r): r is number => r !== null && r > 0);
    if (organicRanks.length) set(metrics, "aeo.best_organic_rank", Math.min(...organicRanks));
    const mapsRanks = usable.map((r) => num(r.brand_maps_rank ?? r.maps_rank)).filter((r): r is number => r !== null && r > 0);
    if (mapsRanks.length) set(metrics, "aeo.best_maps_rank", Math.min(...mapsRanks));
    const competitorsAbove = evidenceNumber(input.findings, "aeo.competitor_gap", "competitors_above");
    if (competitorsAbove !== null) set(metrics, "aeo.competitors_above", competitorsAbove);
    else {
      const counts = usable
        .map((r) => (Array.isArray(r.competitors_mentioned) ? r.competitors_mentioned.length : null))
        .filter((c): c is number => c !== null);
      if (counts.length) set(metrics, "aeo.competitors_above", Math.max(...counts));
    }
  }
  const presence = (surface: string): number | null => {
    const rows = input.aeoRows.filter((r) => r.surface === surface);
    if (!rows.length) return null;
    return Math.round((rows.filter((r) => r.cited).length / rows.length) * 100);
  };
  set(metrics, "aeo.ai_overview_presence_rate", presence("ai_overview"));
  set(metrics, "aeo.ai_mode_presence_rate", presence("ai_mode"));
  set(metrics, "aeo.organic_presence_rate", presence("organic"));

  // Website
  if (input.websiteChecks && input.websiteChecks.evaluated > 0) {
    set(metrics, "website.checks_passed", input.websiteChecks.passed);
    set(metrics, "website.checks_evaluated", input.websiteChecks.evaluated);
    const faq = input.websiteChecks.results.find((r) => r.key === "faq_schema");
    if (faq) set(metrics, "website.has_faq_schema", faq.pass ? 1 : 0);
  } else {
    const website = aeo ? dict(aeo.website) : null;
    if (website && typeof website.has_faq_schema === "boolean") set(metrics, "website.has_faq_schema", website.has_faq_schema ? 1 : 0);
  }

  return metrics;
}
