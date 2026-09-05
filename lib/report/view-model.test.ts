import { buildReportProps } from "@/lib/funnel/report-props";
import { describe, expect, it } from "vitest";
import { buildReportViewModel, resolveFixPackDraftText, type ReportViewSource } from "./view-model";

const fixture: ReportViewSource = {
  job: {
    id: "job-1", slug: "shop", locale: "en", region: "hk", businessName: "Example Shop", status: "partial",
    overallScore: 64, scoreCoverage: 0.75,
    moduleResults: {
      ig: { status: "measured", score: 70, confidence: "high", limitationCode: null },
      gbp: { status: "measured", score: 58, confidence: "medium", limitationCode: null },
      aeo: { status: "unsupported", score: null, confidence: "none", limitationCode: "provider_not_configured" },
    },
  },
  findingCount: 4,
  findings: [
    { id: "f1", findingKey: "ig.profile_clarity", module: "ig", severity: "critical", scoreImpact: -20,
      ownerMessage: "OWNER_SECRET", detailedFix: "FIX_SECRET", evidence: { raw_data: "RAW_SECRET" }, internalHint: "INTERNAL_SECRET",
      fixPackDraftOutput: null },
    { id: "f2", findingKey: "gbp.rating_low", module: "gbp", severity: "warning", scoreImpact: -15,
      ownerMessage: "second", detailedFix: "second fix", evidence: { rating: 3.2 }, internalHint: null,
      fixPackDraftOutput: null },
    { id: "f3", findingKey: "aeo.website_content_weak", module: "aeo", severity: "warning", scoreImpact: -10,
      ownerMessage: "third", detailedFix: "third fix", evidence: { words: 120 }, internalHint: null,
      fixPackDraftOutput: null },
    { id: "f4", findingKey: "trust.cross_signal", module: "trust", severity: "info", scoreImpact: -5,
      ownerMessage: "fourth", detailedFix: "fourth fix", evidence: { sources: 1 }, internalHint: null,
      fixPackDraftOutput: null },
  ],
  authorized: {
    summary: "CACHED_SUMMARY_SECRET",
    proof: {
      ig: { username: "proof_ig", fullName: "Proof IG", bio: "bio", followers: 120, following: 30, postsCount: 9,
        verified: true, websiteUrl: "https://example.com", recentPosts: [], reelsCount: 2, highlights: ["Menu"], storiesCount: 1 },
      gbp: { name: "PROOF_GBP", address: "1 Proof Street", mapsUrl: "https://maps.google.com/?cid=proof", rating: 4.2, reviewsCount: 31, categories: ["Cafe"], recentReviews: [] },
      aeo: { runs: [{ query: "PROOF_AEO_QUERY", available: true, aiOverviewMentioned: true, aiModeMentioned: false, organicRank: 3 }], website: null },
      merchant: { generatedAt: "2026-07-15T00:00:00Z", runs: [{ query: "PROOF_MERCHANT_QUERY", engine: "google", found: true,
        confidence: "high", aiMentioned: true, aiCited: false, organicRank: 2, localPackRank: null, mapsRank: 1, mapsRating: null, mapsReviews: null, competitors: [], snippets: [] }] },
      trust: { reviews: 31, rating: 4.2, responseRate: 50, followers: 120, daysSinceLastReview: 4 },
    },
    evidence: { items: [{
      id: "e1", provider: "instagram", evidenceType: "post",
      sourceUrl: "https://www.instagram.com/p/code/",
      mediaUrl: "https://project.supabase.co/storage/v1/object/sign/report-evidence/job-1/post.jpg?token=PRIVATE_EVIDENCE_TOKEN",
      capturedAt: "2026-07-21T00:00:00.000Z", publishedAt: null, text: "Post",
      metadata: { likes: 5 }, status: "stored", limitationCode: null,
    }] },
  },
};

describe("buildReportViewModel", () => {
  it("builds a preview-safe public model without authorized summary or proof", () => {
    const model = buildReportViewModel(fixture, { kind: "public" });
    const serialized = JSON.stringify(model);
    expect(model.access).toBe("public");
    expect(model.preview.priorities).toHaveLength(3);
    expect(model.preview.coverage.percent).toBe(75);
    expect(serialized).not.toMatch(/OWNER_SECRET|FIX_SECRET|RAW_SECRET|INTERNAL_SECRET|CACHED_SUMMARY_SECRET|proof_ig|PROOF_GBP|PROOF_AEO_QUERY|PROOF_MERCHANT_QUERY|PRIVATE_EVIDENCE_TOKEN/);
    expect(serialized).not.toContain("raw_data");
    if (model.access !== "public") throw new Error("expected public model");
    // Locale-prefixed: this app prefixes every locale (CLAUDE.md 3.1), unlike
    // upstream's as-needed routing where the page prepended the locale itself.
    expect(model.unlock.href).toBe("/en/unlock/shop?market=HK");
  });

  it("preserves the Taiwan report market in the unlock link independently of locale", () => {
    const model = buildReportViewModel({
      ...fixture,
      job: { ...fixture.job, locale: "en", region: "tw" },
    }, { kind: "public" });

    if (model.access !== "public") throw new Error("expected public model");
    expect(model.unlock.href).toBe("/en/unlock/shop?market=TW");
  });

  it("prefixes the unlock link with the report locale", () => {
    const model = buildReportViewModel({
      ...fixture,
      job: { ...fixture.job, locale: "zh-HK", region: "hk" },
    }, { kind: "public" });

    if (model.access !== "public") throw new Error("expected public model");
    expect(model.unlock.href).toBe("/zh-HK/unlock/shop?market=HK");
  });

  it("builds a member model with the viewer's authorized shape plus the granting membership", () => {
    const model = buildReportViewModel(fixture, { kind: "member", workspaceId: "ws-1", role: "manager" });
    if (model.access !== "member") throw new Error("expected member");
    expect(model.workspaceId).toBe("ws-1");
    expect(model.role).toBe("manager");
    expect(model.fullFindings[0]).toMatchObject({ message: "OWNER_SECRET", action: "FIX_SECRET" });
    expect(model.summary).toBe("CACHED_SUMMARY_SECRET");
    expect(model.proof.ig?.username).toBe("proof_ig");
    expect(model.evidence.items[0]?.mediaUrl).toContain("PRIVATE_EVIDENCE_TOKEN");
    expect(model).not.toHaveProperty("staffActions");
    expect(model).not.toHaveProperty("unlock");
  });

  it("builds a viewer model with cached summary, full findings, and bounded typed proof", () => {
    const model = buildReportViewModel(fixture, { kind: "viewer", grantId: "g1" });
    if (model.access !== "viewer") throw new Error("expected viewer");
    expect(model.fullFindings[0]).toMatchObject({ message: "OWNER_SECRET", action: "FIX_SECRET" });
    expect(model.summary).toBe("CACHED_SUMMARY_SECRET");
    expect(model.proof.ig?.username).toBe("proof_ig");
    expect(model.proof.gbp?.name).toBe("PROOF_GBP");
    expect(model.proof.aeo?.runs[0].query).toBe("PROOF_AEO_QUERY");
    expect(model.proof.merchant?.runs[0].query).toBe("PROOF_MERCHANT_QUERY");
    expect(model.proof.trust?.reviews).toBe(31);
    expect(model.evidence.items[0]?.mediaUrl).toContain("PRIVATE_EVIDENCE_TOKEN");
    expect(model).not.toHaveProperty("staffActions");
  });

  it("resolves a review-reply draft the same regardless of report locale", () => {
    const withDraft: ReportViewSource = {
      ...fixture,
      findings: [{ ...fixture.findings[0]!, fixPackDraftOutput: { agentKey: "review_reply_agent", draftReply: "Sorry to hear that." } }],
    };
    const enModel = buildReportViewModel({ ...withDraft, job: { ...withDraft.job, locale: "en" } }, { kind: "viewer", grantId: "g1" });
    const zhModel = buildReportViewModel({ ...withDraft, job: { ...withDraft.job, locale: "zh-HK" } }, { kind: "viewer", grantId: "g1" });
    if (enModel.access !== "viewer" || zhModel.access !== "viewer") throw new Error("expected viewer");
    expect(enModel.fullFindings[0]?.fixPackDraft).toBe("Sorry to hear that.");
    expect(zhModel.fullFindings[0]?.fixPackDraft).toBe("Sorry to hear that.");
  });

  it("resolves a gbp-post draft by report locale, defaulting non-en to the zh copy", () => {
    const withDraft: ReportViewSource = {
      ...fixture,
      findings: [{ ...fixture.findings[0]!, fixPackDraftOutput: { agentKey: "gbp_post_agent", draftPostZh: "中文帖文", draftPostEn: "English post" } }],
    };
    const enModel = buildReportViewModel({ ...withDraft, job: { ...withDraft.job, locale: "en" } }, { kind: "viewer", grantId: "g1" });
    const zhModel = buildReportViewModel({ ...withDraft, job: { ...withDraft.job, locale: "zh-TW" } }, { kind: "viewer", grantId: "g1" });
    if (enModel.access !== "viewer" || zhModel.access !== "viewer") throw new Error("expected viewer");
    expect(enModel.fullFindings[0]?.fixPackDraft).toBe("English post");
    expect(zhModel.fullFindings[0]?.fixPackDraft).toBe("中文帖文");
  });

  it("leaves fixPackDraft null when there is no approved draft", () => {
    const model = buildReportViewModel(fixture, { kind: "viewer", grantId: "g1" });
    if (model.access !== "viewer") throw new Error("expected viewer");
    expect(model.fullFindings[0]?.fixPackDraft).toBeNull();
  });

  it("builds a staff model with the same authorized value and staff-only actions", () => {
    const model = buildReportViewModel(fixture, { kind: "staff", userId: "u1", email: "staff@example.com" });
    if (model.access !== "staff") throw new Error("expected staff");
    expect(model.summary).toBe("CACHED_SUMMARY_SECRET");
    expect(model.proof.ig?.followers).toBe(120);
    expect(model.staffActions).toEqual({ userId: "u1", email: "staff@example.com", jobId: "job-1" });
  });

  it("adds localized human-readable confidence explanations to the preview", () => {
    const model = buildReportViewModel(fixture, { kind: "public" });
    expect(model.preview.coverage.confidenceLegend.high).toMatch(/direct evidence/i);
    expect(model.preview.coverage.confidenceLegend.medium).toMatch(/multiple|partial/i);
    expect(model.preview.coverage.modules[0].confidenceExplanation).toBe(model.preview.coverage.confidenceLegend.high);
  });

  it("suppresses stale score, coverage, module scores, and priorities for failed jobs", () => {
    const source: ReportViewSource = { ...fixture, job: { ...fixture.job, status: "failed", overallScore: 88, scoreCoverage: 1 } };
    const model = buildReportViewModel(source, { kind: "public" });
    expect(model.preview.overallScore).toBeNull();
    expect(model.preview.coverage.percent).toBeNull();
    expect(model.preview.coverage.modules.every((module) => module.score === null)).toBe(true);
    expect(model.preview.priorities).toEqual([]);
  });
});

const districtIndustrySource: ReportViewSource = {
  job: {
    id: "job-1", slug: "shop", locale: "en", region: "hk", businessName: "Example Shop",
    district: "Causeway Bay", industry: "Food & Beverage",
    status: "done", overallScore: 48, scoreCoverage: 0.65, moduleResults: {},
  },
  findingCount: 0,
  findings: [],
};

describe("buildReportViewModel district and industry", () => {
  it("carries both onto the preview", () => {
    const model = buildReportViewModel(districtIndustrySource, { kind: "public" });
    expect(model.preview.district).toBe("Causeway Bay");
    expect(model.preview.industry).toBe("Food & Beverage");
  });

  it("defaults both to null when the job predates their capture", () => {
    const bare = { ...districtIndustrySource, job: { ...districtIndustrySource.job, district: undefined, industry: undefined } };
    const model = buildReportViewModel(bare as ReportViewSource, { kind: "public" });
    expect(model.preview.district).toBeNull();
    expect(model.preview.industry).toBeNull();
  });
});

describe("resolveFixPackDraftText", () => {
  it("renders a review reply verbatim regardless of locale", () => {
    const output = { agentKey: "review_reply_agent", draftReply: "多謝支持！", reviewExcerpt: "x", reviewRating: 5, reviewLanguage: "zh" };
    expect(resolveFixPackDraftText(output, "en")).toBe("多謝支持！");
    expect(resolveFixPackDraftText(output, "zh-HK")).toBe("多謝支持！");
  });

  it("picks the gbp post variant by locale, zh for both Chinese locales", () => {
    const output = { agentKey: "gbp_post_agent", draftPostZh: "中文帖", draftPostEn: "English post", seedEvidence: [] };
    expect(resolveFixPackDraftText(output, "en")).toBe("English post");
    expect(resolveFixPackDraftText(output, "zh-HK")).toBe("中文帖");
    expect(resolveFixPackDraftText(output, "zh-TW")).toBe("中文帖");
    expect(resolveFixPackDraftText(null, "en")).toBeNull();
  });
});

it.each(["en", "zh-HK", "zh-TW"] as const)("keeps exactly one locale in the rendered %s Taiwan unlock link", (locale) => {
  const model = buildReportViewModel({ ...fixture, job: { ...fixture.job, locale, region: "tw" } }, { kind: "public" });
  expect(buildReportProps(model, locale).locked?.unlockHref).toBe(`/${locale}/unlock/shop?market=TW`);
});