import { describe, expect, it } from "vitest";

import { buildReportProps, type ReportPreviewLike, type ReportViewModelLike } from "@/lib/funnel/report-props";
import { sampleReportProps } from "@/lib/funnel/sample-report";
import { getMessages } from "@/lib/i18n";

const preview: ReportPreviewLike = {
  slug: "share-slug",
  locale: "zh-HK",
  region: "hk",
  businessName: "錦汶館",
  district: "天后",
  industry: "餐飲",
  status: "partial",
  overallScore: 58,
  coverage: {
    percent: 70,
    modules: [
      { module: "trust", status: "unavailable", score: null, confidence: "none", confidenceExplanation: "none", limitation: "TRUST_NOT_MEASURED" },
      { module: "gbp", status: "measured", score: 61, confidence: "high", confidenceExplanation: "direct", limitation: null },
      { module: "ig", status: "unavailable", score: null, confidence: "none", confidenceExplanation: "none", limitation: "IG_HANDLE_NOT_PROVIDED" },
      { module: "aeo", status: "measured", score: 40, confidence: "medium", confidenceExplanation: "partial", limitation: null },
    ],
  },
  priorities: [
    { findingKey: "gbp.owner_response_low", module: "gbp", severity: "critical", scoreImpact: -10 },
    { findingKey: "aeo.ai_overview_missing", module: "aeo", severity: "warning", scoreImpact: -15 },
  ],
};

const publicModel: ReportViewModelLike = { access: "public", preview, unlock: { hiddenFindingCount: 7, href: "/unlock/share-slug?market=HK" } };

const viewerModel: ReportViewModelLike = {
  access: "viewer",
  preview,
  summary: "Summary text",
  proof: { ig: null, gbp: null, aeo: null, merchant: null, trust: { reviews: 12, rating: 4.2, responseRate: 18, followers: null, daysSinceLastReview: 3 } },
  evidence: {
    items: [
      { id: "e1", provider: "google_maps", evidenceType: "photo", sourceUrl: null, mediaUrl: "https://signed.example/1", capturedAt: "2026-08-25T01:42:00.000Z", publishedAt: null, text: null, status: "stored", limitationCode: null },
    ],
  },
  fullFindings: [
    { id: "f1", findingKey: "aeo.ai_overview_missing", module: "aeo", severity: "warning", scoreImpact: -15, message: "AI 未提及", action: "加入 FAQ", evidence: { queries: 4, nested: { a: 1 } }, fixPackDraft: null },
    { id: "f2", findingKey: "gbp.owner_response_low", module: "gbp", severity: "critical", scoreImpact: -10, message: "回覆率低", action: "回覆評論", evidence: { response_rate: 18 }, fixPackDraft: "Draft" },
    { id: "f3", findingKey: "gbp.photos_volume", module: "gbp", severity: "info", scoreImpact: 0, message: null, action: null, evidence: null, fixPackDraft: null },
  ],
};

describe("buildReportProps", () => {
  it("maps a public model to a locked preview", () => {
    const props = buildReportProps(publicModel, "zh-HK");
    expect(props.access).toBe("public");
    expect(props.score).toBe(58);
    expect(props.coverage).toBe(70);
    expect(props.market).toBe("hk");
    expect(props.comparison).toEqual({ kind: "first_scan" });
    expect(props.locked).toEqual({ hiddenFindingCount: 7, unlockHref: "/zh-HK/unlock/share-slug?market=HK" });
    expect(props.findingGroups).toEqual([]);
    expect(props.summary).toBeNull();
    expect(props.proof).toBeNull();
    expect(props.evidence).toEqual([]);
  });

  it("orders modules ig → gbp → aeo → trust with honest values", () => {
    const props = buildReportProps(publicModel, "en");
    expect(props.modules.map((module) => module.key)).toEqual(["ig", "gbp", "aeo", "trust"]);
    expect(props.modules[0]).toMatchObject({ state: "unavailable", value: "Not scored", limitationCode: "IG_HANDLE_NOT_PROVIDED" });
    expect(props.modules[0].detail).toContain("IG handle not provided");
    expect(props.modules[1]).toMatchObject({ state: "measured", value: "61 / 100", label: getMessages("en").report.moduleGbp });
  });

  it("labels priorities from the report messages with the weighted impact", () => {
    const props = buildReportProps(publicModel, "zh-HK");
    expect(props.priorities).toHaveLength(2);
    expect(props.priorities[0]).toMatchObject({
      rank: 1,
      key: "gbp.owner_response_low",
      label: getMessages("zh-HK").report.findingGbpOwnerResponseLow,
      tone: "urgent",
      severityLabel: getMessages("zh-HK").report.severityCritical,
      overallImpact: "整體 -3.5",
      summary: null,
      action: null,
    });
    expect(props.priorities[1].overallImpact).toBe("整體 -3.8");
  });

  it("maps a viewer model to the full report", () => {
    const props = buildReportProps(viewerModel, "en");
    expect(props.access).toBe("viewer");
    expect(props.locked).toBeNull();
    expect(props.summary).toBe("Summary text");
    expect(props.proof?.trust?.responseRate).toBe(18);
    expect(props.evidence).toHaveLength(1);
    expect(props.evidence[0]).toMatchObject({ id: "e1", mediaUrl: "https://signed.example/1", status: "stored" });
    expect(props.findingGroups.map((group) => group.module)).toEqual(["gbp", "aeo"]);
    expect(props.findingGroups[0].findings.map((finding) => finding.id)).toEqual(["f2", "f3"]);
    expect(props.findingGroups[0].findings[0]).toMatchObject({ fixPackDraft: "Draft", evidence: [["response rate", "18"]], overallImpact: "-3.5 overall" });
    expect(props.findingGroups[0].findings[1].overallImpact).toBeNull();
    expect(props.findingGroups[1].findings[0].evidence).toEqual([["queries", "4"]]);
    // priorities pick up message/action from the full findings
    expect(props.priorities[0]).toMatchObject({ summary: "回覆率低", action: "回覆評論", evidence: { excerpt: "response rate: 18" } });
  });

  it("keeps a withheld or failed score null", () => {
    const withheld = buildReportProps({ ...publicModel, preview: { ...preview, overallScore: null } }, "en");
    expect(withheld.score).toBeNull();
    const failed = buildReportProps({ ...publicModel, preview: { ...preview, status: "failed", overallScore: null, coverage: { ...preview.coverage, percent: null } } }, "en");
    expect(failed.status).toBe("failed");
    expect(failed.coverage).toBeNull();
  });
});

describe("sampleReportProps", () => {
  it("renders the fixed Kam Man House sample through the same contract", () => {
    for (const locale of ["en", "zh-HK", "zh-TW"] as const) {
      const props = sampleReportProps(locale);
      expect(props.sample).toBe(true);
      expect(props.access).toBe("sample");
      expect(props.score).toBe(62);
      expect(props.coverage).toBe(78);
      expect(props.comparison.kind).toBe("comparable");
      expect(props.priorities).toHaveLength(3);
      expect(props.modules).toHaveLength(4);
      expect(props.modules.filter((module) => module.state === "measured")).toHaveLength(3);
      expect(props.locked).toBeNull();
    }
    expect(sampleReportProps("zh-HK").priorities[0].label).toBe("回覆 7 則未回覆的 Google 評論");
    expect(sampleReportProps("en").priorities[0].label).toBe("Reply to 7 unanswered Google reviews");
  });
});
