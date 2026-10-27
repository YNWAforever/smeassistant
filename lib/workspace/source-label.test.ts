import { describe, expect, it } from "vitest";
import { evidenceValueLabel, sourceLabel } from "./source-label";

describe("evidenceValueLabel", () => {
  it("names known raw evidence keys and states", () => {
    expect(evidenceValueLabel("discovery_runs: 1", "zh-HK")).toBe("已檢查搜尋次數：1");
    expect(evidenceValueLabel("discovery_runs: 1", "en")).toBe("Searches checked: 1");
    expect(evidenceValueLabel("faq_schema: fail", "zh-TW")).toBe("FAQ 結構化資料：未通過");
    expect(evidenceValueLabel("not_connected", "zh-HK")).toBe("未連接");
  });

  it("humanises unknown snake_case keys and leaves plain values alone", () => {
    expect(evidenceValueLabel("some_metric: 3", "en")).toBe("some metric: 3");
    expect(evidenceValueLabel("31%", "zh-HK")).toBe("31%");
    expect(evidenceValueLabel("4.2", "en")).toBe("4.2");
    expect(evidenceValueLabel("", "en")).toBe("");
  });
});

describe("sourceLabel", () => {
  it("translates the persisted English evidence sources", () => {
    expect(sourceLabel("Search and AI surfaces", "zh-HK")).toBe("搜尋及 AI 介面");
    expect(sourceLabel("Website checks", "zh-TW")).toBe("網站檢查");
    expect(sourceLabel("Google Business Profile", "zh-HK")).toBe("Google 商家檔案");
    expect(sourceLabel("Google Business Profile", "zh-TW")).toBe("Google 商家檔案");
  });

  it("keeps English and unknown sources unchanged", () => {
    expect(sourceLabel("Search and AI surfaces", "en")).toBe("Search and AI surfaces");
    expect(sourceLabel("Some future source", "zh-HK")).toBe("Some future source");
    expect(sourceLabel("", "zh-HK")).toBe("");
  });
});
