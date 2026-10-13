import { describe, expect, it } from "vitest";
import { phrases } from "./phrases";

describe("phrases", () => {
  it("keeps Chinese words whole and punctuation on the word before it", () => {
    const out = phrases("讓更多顧客找到你，清楚知道下一步要改善甚麼。", "zh-HK");
    expect(out.join("")).toBe("讓更多顧客找到你，清楚知道下一步要改善甚麼。");
    expect(out).toContain("找到");
    expect(out.some((p) => p.startsWith("，") || p.startsWith("。"))).toBe(false);
  });

  it("returns non-Chinese text whole", () => {
    expect(phrases("Get found by more customers.", "en")).toEqual(["Get found by more customers."]);
  });
});
