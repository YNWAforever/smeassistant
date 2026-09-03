import { describe, expect, it } from "vitest";
import {
  getModeKeyForIndustry,
  getScanMode,
  getScanningMessages,
  isScanModeKey,
  selectPreviewFindings,
} from "./scan-modes";

describe("scan modes", () => {
  it("looks up known modes and falls back to generic", () => {
    expect(getScanMode("fnb").defaultIndustry).toBe("餐飲");
    expect(getScanMode("retail").defaultIndustry).toBe("零售");
    expect(getScanMode("local-service").defaultIndustry).toBe("本地服務");
    expect(getScanMode("unknown").key).toBe("generic");
  });

  it("validates mode keys", () => {
    expect(isScanModeKey("fnb")).toBe(true);
    expect(isScanModeKey("restaurant")).toBe(false);
    expect(isScanModeKey(null)).toBe(false);
  });

  it("maps persisted industry values to mode keys", () => {
    expect(getModeKeyForIndustry("餐飲")).toBe("fnb");
    expect(getModeKeyForIndustry("零售")).toBe("retail");
    expect(getModeKeyForIndustry("本地服務")).toBe("local-service");
    expect(getModeKeyForIndustry("美容")).toBe("generic");
    expect(getModeKeyForIndustry(null)).toBe("generic");
  });

  it("returns localized scanning messages with generic fallback", () => {
    expect(getScanningMessages("fnb", "zh-HK")[0]).toContain("餐廳");
    expect(getScanningMessages("retail", "en")[0]).toContain("store");
    expect(getScanningMessages("bad-key", "zh-HK")[0]).toBe("緊急 scan 緊你嘅 IG...");
  });

  it("prioritizes preview findings by industry mode, severity, and score impact", () => {
    const findings = [
      { id: "ig-critical", module: "ig", severity: "critical", score_impact: -40 },
      { id: "aeo-warning", module: "aeo", severity: "warning", score_impact: -10 },
      { id: "gbp-warning-big", module: "gbp", severity: "warning", score_impact: -30 },
      { id: "trust-critical", module: "trust", severity: "critical", score_impact: -50 },
    ];

    expect(selectPreviewFindings(findings, "餐飲", 3).map((f) => f.id)).toEqual([
      "gbp-warning-big",
      "aeo-warning",
      "ig-critical",
    ]);

    expect(selectPreviewFindings(findings, "美容", 3).map((f) => f.id)).toEqual([
      "trust-critical",
      "ig-critical",
      "gbp-warning-big",
    ]);
  });

  it("ranks negative score_impact before positive when severity and module are tied", () => {
    const findings = [
      { id: "gbp-positive", module: "gbp", severity: "warning", score_impact: 10 },
      { id: "gbp-negative", module: "gbp", severity: "warning", score_impact: -5 },
      { id: "aeo-negative", module: "aeo", severity: "warning", score_impact: -50 },
    ];

    expect(selectPreviewFindings(findings, "餐飲", 2).map((f) => f.id)).toEqual([
      "gbp-negative",
      "gbp-positive",
    ]);
  });
});
