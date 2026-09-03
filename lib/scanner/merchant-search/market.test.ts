import { describe, expect, it } from "vitest";
import {
  defaultMerchantSearchMarket,
  merchantSearchMarket,
  resolveMerchantSearchOrigin,
} from "./market";

describe("merchant search market configuration", () => {
  it.each(["en", "zh-HK", "zh-TW"] as const)(
    "defaults a clean %s interface session to Hong Kong",
    (locale) => {
      expect(defaultMerchantSearchMarket(locale)).toBe("HK");
    },
  );

  it("exposes the approved Hong Kong search settings", () => {
    expect(merchantSearchMarket("HK")).toEqual(expect.objectContaining({
      code: "HK",
      labelZh: "香港",
      labelEn: "Hong Kong",
      countryName: "Hong Kong",
      gl: "hk",
      defaultLanguage: "zh-hk",
      alternateLanguage: "en",
      ll: "@22.3193,114.1694,12z",
      fallbackTerms: ["Hong Kong", "香港"],
      currency: "HKD",
    }));
  });

  it("exposes the approved Taiwan search settings", () => {
    expect(merchantSearchMarket("TW")).toEqual(expect.objectContaining({
      code: "TW",
      labelZh: "台灣",
      labelEn: "Taiwan",
      countryName: "Taiwan",
      gl: "tw",
      defaultLanguage: "zh-tw",
      alternateLanguage: "en",
      ll: "@23.6978,120.9605,7z",
      fallbackTerms: ["Taiwan", "台灣"],
      currency: "TWD",
    }));
  });

  it.each([
    ["Central", "@22.2819,114.1582,15z"],
    ["Causeway Bay", "@22.2802,114.1849,15z"],
    ["Wan Chai", "@22.2770,114.1723,15z"],
    ["Tsim Sha Tsui", "@22.2988,114.1722,15z"],
    ["Mong Kok", "@22.3193,114.1694,15z"],
    ["Happy Valley", "@22.2691,114.1844,15z"],
  ])("uses the focused Hong Kong origin for %s", (queryTerms, expected) => {
    expect(resolveMerchantSearchOrigin({ market: "HK", queryTerms })).toBe(expected);
  });

  it.each([
    ["Taipei", "@25.0330,121.5654,12z"],
    ["New Taipei", "@25.0169,121.4628,11z"],
    ["Taichung", "@24.1477,120.6736,11z"],
    ["Tainan", "@22.9999,120.2269,11z"],
    ["Kaohsiung", "@22.6273,120.3014,11z"],
  ])("uses the focused Taiwan origin for %s", (queryTerms, expected) => {
    expect(resolveMerchantSearchOrigin({ market: "TW", queryTerms })).toBe(expected);
  });

  it("falls back to the selected market origin", () => {
    expect(resolveMerchantSearchOrigin({ market: "HK", queryTerms: "Unknown place" }))
      .toBe("@22.3193,114.1694,12z");
    expect(resolveMerchantSearchOrigin({ market: "TW", queryTerms: "Unknown place" }))
      .toBe("@23.6978,120.9605,7z");
  });

  it("prefers explicit coordinates over market and district origins", () => {
    expect(resolveMerchantSearchOrigin({
      market: "HK",
      queryTerms: "Happy Valley",
      explicitCoordinates: { latitude: 22.2690553, longitude: 114.1843662, zoom: 17 },
    })).toBe("@22.2690553,114.1843662,17z");
  });
});
