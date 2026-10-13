import { describe, expect, it } from "vitest";
import { sourceLabel } from "./source-label";

describe("sourceLabel", () => {
  it("translates the persisted English evidence sources", () => {
    expect(sourceLabel("Search and AI surfaces", "zh-HK")).toBe("搜尋及 AI 介面");
    expect(sourceLabel("Website checks", "zh-TW")).toBe("網站檢查");
    expect(sourceLabel("Google Business Profile", "zh-HK")).toBe("Google 商戶檔案");
    expect(sourceLabel("Google Business Profile", "zh-TW")).toBe("Google 商家檔案");
  });

  it("keeps English and unknown sources unchanged", () => {
    expect(sourceLabel("Search and AI surfaces", "en")).toBe("Search and AI surfaces");
    expect(sourceLabel("Some future source", "zh-HK")).toBe("Some future source");
    expect(sourceLabel("", "zh-HK")).toBe("");
  });
});
