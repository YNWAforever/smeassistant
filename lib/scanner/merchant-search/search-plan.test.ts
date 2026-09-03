import { describe, expect, it } from "vitest";
import { buildMerchantSearchPlan, nextMerchantSearchAttempt } from "./search-plan";

describe("merchant search plan", () => {
  it("starts Kam Man Kitchen with the exact query, English, and HK origin", () => {
    expect(buildMerchantSearchPlan({ query: "Kam Man Kitchen", market: "HK" })[0]).toEqual({
      type: "search",
      q: "Kam Man Kitchen",
      ll: "@22.3193,114.1694,12z",
      hl: "en",
      gl: "hk",
    });
  });

  it("uses a focused approved location when the query names one", () => {
    expect(buildMerchantSearchPlan({ query: "Kam Man Kitchen Happy Valley", market: "HK" })[0]?.ll)
      .toBe("@22.2691,114.1844,15z");
  });

  it("adds the selected market term at most once", () => {
    const plan = buildMerchantSearchPlan({ query: "Kam Man Kitchen Hong Kong", market: "HK" });
    expect(plan.map((attempt) => attempt.q)).not.toContain("Kam Man Kitchen Hong Kong Hong Kong");
    expect(plan.every((attempt) => (attempt.q.match(/Hong Kong/gi) ?? []).length <= 1)).toBe(true);
  });

  it("uses legal-suffix removal only after the exact attempt", () => {
    const plan = buildMerchantSearchPlan({ query: "Kam Man Kitchen Limited", market: "HK" });
    expect(plan[0]?.q).toBe("Kam Man Kitchen Limited");
    expect(plan.slice(1).some((attempt) => attempt.q === "Kam Man Kitchen")).toBe(true);
  });

  it("never turns suffix-only or punctuation-only input into a market-only query", () => {
    expect(buildMerchantSearchPlan({ query: "有限公司", market: "HK" })).toEqual([]);
    expect(buildMerchantSearchPlan({ query: "－－ & …", market: "HK" })).toEqual([]);
  });

  it("builds no more than three unique attempts", () => {
    const plan = buildMerchantSearchPlan({ query: "金萬餐廳有限公司", market: "HK" });
    expect(plan.length).toBeLessThanOrEqual(3);
    expect(new Set(plan.map((attempt) => JSON.stringify(attempt))).size).toBe(plan.length);
  });

  it("follows language and market fallback order", () => {
    expect(buildMerchantSearchPlan({ query: "Kam Man Kitchen", market: "HK" }).map((attempt) => [attempt.q, attempt.hl]))
      .toEqual([
        ["Kam Man Kitchen", "en"],
        ["Kam Man Kitchen Hong Kong", "en"],
        ["Kam Man Kitchen 香港", "zh-hk"],
      ]);
    expect(buildMerchantSearchPlan({ query: "金萬餐廳", market: "TW" }).map((attempt) => [attempt.q, attempt.hl]))
      .toEqual([
        ["金萬餐廳", "zh-tw"],
        ["金萬餐廳 台灣", "zh-tw"],
        ["金萬餐廳 Taiwan", "en"],
      ]);
  });

  it("does not offer another attempt after useful results exist", () => {
    const plan = buildMerchantSearchPlan({ query: "Kam Man Kitchen", market: "HK" });
    expect(nextMerchantSearchAttempt(plan, 1, true)).toBeUndefined();
    expect(nextMerchantSearchAttempt(plan, 1, false)).toEqual(plan[1]);
  });
});
