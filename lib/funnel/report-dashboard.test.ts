import { describe, expect, it } from "vitest";

import { copy } from "@/lib/copy";
import { sanitizeReportProof } from "@/lib/report/sanitize-proof";
import { buildReportDashboard } from "./report-dashboard";
import type { ReportProofData, ReportProps } from "./report-props";

const emptyProof: ReportProofData = { ig: null, gbp: null, aeo: null, merchant: null, trust: null };

function report(overrides: Partial<ReportProps> = {}): ReportProps {
  return {
    locale: "en", access: "viewer", sample: false, slug: "shop", market: "hk", businessName: "Current Cafe",
    district: null, industry: null, status: "done", subtitle: null, scannedAt: null, score: 70, coverage: 75,
    comparison: { kind: "first_scan" }, modules: [
      { key: "ig", score: 70, label: "Instagram", state: "measured", value: "70 / 100", detail: "", observedAt: null, limitationCode: null },
      { key: "gbp", score: 70, label: "Google", state: "measured", value: "70 / 100", detail: "", observedAt: null, limitationCode: null },
      { key: "aeo", score: 70, label: "AEO", state: "measured", value: "70 / 100", detail: "", observedAt: null, limitationCode: null },
    ], priorities: [], locked: null, summary: null,
    findingGroups: [], proof: emptyProof, evidence: [], ctas: [], ...overrides,
  };
}

function proof(overrides: Partial<ReportProofData> = {}): ReportProofData {
  return {
    ...emptyProof,
    ig: { username: "current", fullName: "Current Cafe", bio: "", followers: 0, following: 2, postsCount: 3,
      verified: false, websiteUrl: null, recentPosts: [], reelsCount: 0, highlights: [], storiesCount: 0 },
    gbp: { name: "Current Cafe", address: "1 Main St", mapsUrl: null, rating: 4.2, reviewsCount: 0, categories: [], recentReviews: [] },
    ...overrides,
  };
}

describe("buildReportDashboard", () => {
  it("returns no private dashboard data for public or locked reports", () => {
    const suppliedProof = proof();
    expect(buildReportDashboard(report({ access: "public", proof: suppliedProof }))).toEqual({ metrics: [], comparisons: [] });
    expect(buildReportDashboard(report({ locked: { hiddenFindingCount: 2, unlockHref: "/unlock" }, proof: suppliedProof }))).toEqual({ metrics: [], comparisons: [] });
  });

  it("returns localized unavailable cards when an authorized report has no proof", () => {
    const dashboard = buildReportDashboard(report({ locale: "zh-HK", proof: null }));
    expect(dashboard.metrics).toHaveLength(5);
    expect(dashboard.metrics.every((metric) => metric.state === "unavailable")).toBe(true);
    expect(dashboard.metrics[0]).toMatchObject({
      key: "instagram-followers",
      label: copy["zh-HK"].funnel.report.proof.followers,
      reason: copy["zh-HK"].funnel.report.dashboard.unavailable,
    });
    expect(dashboard.comparisons).toEqual([]);
  });

  it("keeps measured zero distinct from missing and rejects invalid values", () => {
    const dashboard = buildReportDashboard(report({ proof: proof() }));
    expect(dashboard.metrics.find((metric) => metric.key === "instagram-followers")).toMatchObject({ state: "measured", value: 0, unit: "count", sampleSize: null });
    expect(dashboard.metrics.find((metric) => metric.key === "google-reviews")).toMatchObject({ state: "measured", value: 0, unit: "count" });
    const invalid = buildReportDashboard(report({ proof: proof({
      ig: { ...proof().ig!, followers: -1 }, gbp: { ...proof().gbp!, rating: Number.POSITIVE_INFINITY, reviewsCount: -4 },
    }) }));
    expect(invalid.metrics.filter((metric) => ["instagram-followers", "google-rating", "google-reviews"].includes(metric.key)).every((metric) => metric.state === "unavailable")).toBe(true);

    const outOfRangeRating = buildReportDashboard(report({ proof: proof({ gbp: { ...proof().gbp!, rating: 5.1 } }) }));
    expect(outOfRangeRating.metrics.find((metric) => metric.key === "google-rating")?.state).toBe("unavailable");
  });

  it("preserves missing versus zero from raw provider data through the dashboard", () => {
    const missing = buildReportDashboard(report({ proof: sanitizeReportProof({ ig: { profile: {} }, gbp: {} }, []) }));
    const zero = buildReportDashboard(report({ proof: sanitizeReportProof({ ig: { profile: { followers: 0 } }, gbp: { rating: 0, reviews_count: 0 } }, []) }));
    expect(missing.metrics.filter((metric) => ["instagram-followers", "google-rating", "google-reviews"].includes(metric.key)).every((metric) => metric.state === "unavailable")).toBe(true);
    expect(zero.metrics.filter((metric) => ["instagram-followers", "google-rating", "google-reviews"].includes(metric.key)).every((metric) => metric.state === "measured")).toBe(true);
  });

  it("does not expose stale provider proof when its report module is unavailable", () => {
    const dashboard = buildReportDashboard(report({
      modules: [{ key: "ig", score: null, label: "Instagram", state: "unavailable", value: "Not scored", detail: "", observedAt: null, limitationCode: "IG_NOT_MEASURED" }],
      proof: proof(),
    }));
    expect(dashboard.metrics.find((metric) => metric.key === "instagram-followers")?.state).toBe("unavailable");
    expect(dashboard.metrics.find((metric) => metric.key === "google-rating")?.state).toBe("unavailable");
  });

  it.each(["unavailable", "failed"] as const)("does not expose merchant comparisons when the AEO module is %s", (state) => {
    const merchant: NonNullable<ReportProofData["merchant"]> = {
      generatedAt: "2026-09-06T01:00:00.000Z",
      runs: [{ query: "cafe", engine: "google_maps", found: true, confidence: "high", aiMentioned: false, aiCited: false,
        organicRank: null, localPackRank: null, mapsRank: 2, mapsRating: 4.1, mapsReviews: 8,
        competitors: [{ name: "Rival", source: "maps", rank: 1, rating: 4.6, reviews: 20 }], snippets: [] }],
    };
    const dashboard = buildReportDashboard(report({
      modules: [{ key: "aeo", score: null, label: "AEO", state, value: "Not scored", detail: "", observedAt: null, limitationCode: "AEO_NOT_MEASURED" }],
      proof: proof({ merchant }),
    }));
    expect(dashboard.comparisons).toEqual([]);
  });
  it("distinguishes an absent Google review count from measured zero", () => {
    const missing = buildReportDashboard(report({ proof: proof({ gbp: { ...proof().gbp!, reviewsCount: null } }) }));
    const zero = buildReportDashboard(report({ proof: proof() }));
    expect(missing.metrics.find((metric) => metric.key === "google-reviews")?.state).toBe("unavailable");
    expect(zero.metrics.find((metric) => metric.key === "google-reviews")).toMatchObject({ state: "measured", value: 0 });
  });

  it("leaves engagement and search visibility unavailable without canonical projected measures", () => {
    const dashboard = buildReportDashboard(report({ proof: proof({
      aeo: { runs: [{ query: "cafe", available: true, aiOverviewMentioned: true, aiModeMentioned: false, organicRank: 2 }], website: null },
    }) }));
    expect(dashboard.metrics.find((metric) => metric.key === "instagram-engagement")?.state).toBe("unavailable");
    expect(dashboard.metrics.find((metric) => metric.key === "search-visibility")?.state).toBe("unavailable");
  });

  it("creates separate matching Maps comparison groups and deduplicates observations", () => {
    const merchant: NonNullable<ReportProofData["merchant"]> = {
      generatedAt: "2026-09-06T01:00:00.000Z",
      runs: [{ query: "cafe central", engine: "google_maps", found: true, confidence: "high", aiMentioned: false, aiCited: false,
        organicRank: null, localPackRank: null, mapsRank: 2, mapsRating: 4.1, mapsReviews: 8,
        competitors: [
          { name: "Rival", source: "maps", rank: 1, rating: 4.6, reviews: 87 },
          { name: "Rival", source: "maps", rank: 1, rating: 4.6, reviews: 87 },
          { name: "Organic Rival", source: "organic", rank: 1, rating: 5, reviews: 200 },
        ], snippets: [] },
      { query: "coffee central", engine: "google_maps", found: true, confidence: "high", aiMentioned: false, aiCited: false,
        organicRank: null, localPackRank: null, mapsRank: 3, mapsRating: 4.0, mapsReviews: null,
        competitors: [{ name: "Other", source: "maps", rank: 2, rating: 4.3, reviews: 20 }], snippets: [] }],
    };
    const comparisons = buildReportDashboard(report({ proof: proof({ merchant }) })).comparisons;
    expect(comparisons).toHaveLength(3);
    expect(comparisons[0]).toMatchObject({ query: "cafe central", engine: "google_maps", metric: "rating", sampleSize: 2 });
    expect(comparisons[0].rows).toEqual([
      { name: "Current Cafe", value: 4.1, currentBusiness: true }, { name: "Rival", value: 4.6, currentBusiness: false },
    ]);
    expect(comparisons[1]).toMatchObject({ query: "cafe central", metric: "reviews", sampleSize: 2 });
    expect(comparisons[2]).toMatchObject({ query: "coffee central", metric: "rating", sampleSize: 2 });
  });

  it("keeps a valid metric from a complementary duplicate competitor observation", () => {
    const merchant: NonNullable<ReportProofData["merchant"]> = {
      generatedAt: "2026-09-06T01:00:00.000Z",
      runs: [{ query: "cafe", engine: "google_maps", found: true, confidence: "high", aiMentioned: false, aiCited: false,
        organicRank: null, localPackRank: null, mapsRank: 2, mapsRating: 4.1, mapsReviews: 8,
        competitors: [
          { name: "Rival", source: "maps", rank: 1, rating: 4.6, reviews: null },
          { name: "Rival", source: "maps", rank: 1, rating: null, reviews: 20 },
        ], snippets: [] }],
    };
    const comparisons = buildReportDashboard(report({ proof: proof({ merchant }) })).comparisons;
    expect(comparisons.find((comparison) => comparison.metric === "rating")?.rows).toEqual([
      { name: "Current Cafe", value: 4.1, currentBusiness: true },
      { name: "Rival", value: 4.6, currentBusiness: false },
    ]);
    expect(comparisons.find((comparison) => comparison.metric === "reviews")?.rows).toEqual([
      { name: "Current Cafe", value: 8, currentBusiness: true },
      { name: "Rival", value: 20, currentBusiness: false },
    ]);
  });
  it("omits comparisons with invalid current values or no compatible competitor", () => {
    const merchant: NonNullable<ReportProofData["merchant"]> = {
      generatedAt: "2026-09-06T01:00:00.000Z",
      runs: [{ query: "cafe", engine: "google", found: true, confidence: "high", aiMentioned: false, aiCited: false,
        organicRank: null, localPackRank: null, mapsRank: null, mapsRating: 6, mapsReviews: 3,
        competitors: [{ name: "Organic", source: "organic", rank: 1, rating: 4.5, reviews: 10 }], snippets: [] }],
    };
    expect(buildReportDashboard(report({ proof: proof({ merchant }) })).comparisons).toEqual([]);
  });
});
it.each(["unavailable", "failed", "unsupported"] as const)("ignores stale scan metrics in direct props when modules are %s", (state) => {
  const dashboard = buildReportDashboard(report({
    modules: ["ig", "aeo"].map((key) => ({
      key, state, score: null, label: key, value: "Not scored", detail: "", observedAt: null, limitationCode: null,
    })),
    proof: proof(),
    scanMetrics: {
      instagram: {
        distinctPosts: 987654, datedPosts: 0, earliest: null, latest: null, engagement: "unavailable_historical_counts",
        coverage: { inspected: 1, duplicates: 0, truncated: false, evidenceTruncated: false,
          excluded: { unknown: 0, failed: 0, unsupported: 0, no_answer: 0, conflict: 0, unidentified: 0 } },
        observations: [{ identity: "PRIVATE_METRICS_SENTINEL", postedAt: null, likes: 987653, comments: null, ambiguousZero: false }],
      },
      search: [], omittedSearchGroups: 987652,
    },
  }));
  expect(dashboard.metrics.every((metric) => metric.state === "unavailable")).toBe(true);
  expect(JSON.stringify(dashboard)).not.toMatch(/PRIVATE_METRICS_SENTINEL|987654|987653|987652/);
});
