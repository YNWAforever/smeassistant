import { describe, expect, it } from "vitest";
import {
  countMeaningfulCharacters,
  detectMerchantLocation,
  detectMerchantQueryLanguage,
  merchantQueryComparisonKey,
  normalizeMerchantQuery,
  withoutRecognizedLegalSuffix,
} from "./query";

describe("merchant query normalization", () => {
  it("normalizes full-width Latin, zero-width characters, and whitespace", () => {
    expect(normalizeMerchantQuery("  Ｋａｍ\u200b   Ｍａｎ\n Kitchen  ")).toBe("Kam Man Kitchen");
  });

  it("preserves Traditional Chinese and meaningful brand punctuation", () => {
    expect(normalizeMerchantQuery("金萬餐廳（Kam Man Kitchen） & Bar")).toBe("金萬餐廳(Kam Man Kitchen) & Bar");
  });

  it("provides a case-insensitive comparison key without rewriting display text", () => {
    const display = normalizeMerchantQuery("Kam Man KITCHEN");
    expect(display).toBe("Kam Man KITCHEN");
    expect(merchantQueryComparisonKey(display)).toBe("kam man kitchen");
  });

  it("counts only meaningful letters and numbers", () => {
    expect(countMeaningfulCharacters("金萬")).toBe(2);
    expect(countMeaningfulCharacters(" A-1 ")).toBe(2);
    expect(countMeaningfulCharacters("－－ & …")).toBe(0);
  });

  it("detects English and Chinese using the selected market language", () => {
    expect(detectMerchantQueryLanguage("Kam Man Kitchen", "HK")).toBe("en");
    expect(detectMerchantQueryLanguage("金萬餐廳", "HK")).toBe("zh-hk");
    expect(detectMerchantQueryLanguage("金萬餐廳", "TW")).toBe("zh-tw");
  });

  it("detects approved Hong Kong districts and Taiwan cities", () => {
    expect(detectMerchantLocation("Kam Man Kitchen Happy Valley", "HK")?.ll).toBe("@22.2691,114.1844,15z");
    expect(detectMerchantLocation("金萬餐廳 跑馬地", "HK")?.ll).toBe("@22.2691,114.1844,15z");
    expect(detectMerchantLocation("Cafe New Taipei", "TW")?.ll).toBe("@25.0169,121.4628,11z");
    expect(detectMerchantLocation("台北咖啡", "TW")?.ll).toBe("@25.0330,121.5654,12z");
    expect(detectMerchantLocation("Unknown Place", "HK")).toBeNull();
  });

  it("removes recognized legal suffixes without inventing a merchant name", () => {
    expect(withoutRecognizedLegalSuffix("Kam Man Kitchen Limited", "HK")).toBe("Kam Man Kitchen");
    expect(withoutRecognizedLegalSuffix("金萬餐廳有限公司", "HK")).toBe("金萬餐廳");
    expect(withoutRecognizedLegalSuffix("好味股份有限公司", "TW")).toBe("好味");
    expect(withoutRecognizedLegalSuffix("有限公司", "HK")).toBe("");
  });
});
