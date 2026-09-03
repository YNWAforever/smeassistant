import { describe, expect, it } from "vitest";
import { buildMerchantQueryPlan } from "./query-plan";

describe("buildMerchantQueryPlan (hk market)", () => {
  it("builds a 4-query zh+en discovery plan (no brand query)", () => {
    const plan = buildMerchantQueryPlan(
      { term: "咖啡店", termEn: "cafe", district: "銅鑼灣", districtEn: "Causeway Bay" },
      "hk",
    );

    expect(plan.map((p) => p.id)).toEqual([
      "search-discovery-zh",
      "search-discovery-en",
      "ai-mode-need-zh",
      "maps-discovery-zh",
    ]);
    expect(plan.map((p) => p.engine)).toEqual(["google", "google", "google_ai_mode", "google_maps"]);
    expect(plan.map((p) => p.hl)).toEqual(["zh-TW", "en", "zh-TW", "zh-TW"]);
    expect(plan[0].query).toBe("咖啡店 香港銅鑼灣 推薦");
    expect(plan[1].query).toBe("best cafe in Causeway Bay, Hong Kong");
    expect(plan[2].query).toBe("銅鑼灣邊間咖啡店好");
    expect(plan[3].query).toBe("咖啡店 銅鑼灣");
    for (const p of plan) expect(p.gl).toBe("hk");
    // The low-value brand query (echoing the merchant's own name) is gone.
    expect(plan.some((p) => p.query_type === "brand")).toBe(false);
  });

  it("falls back to 香港 / Hong Kong when district is empty", () => {
    const plan = buildMerchantQueryPlan(
      { term: "本地服務", termEn: "local services", district: "", districtEn: "" },
      "hk",
    );
    expect(plan[0].query).toBe("本地服務 香港 推薦");
    expect(plan[1].query).toBe("best local services in Hong Kong");
    for (const p of plan) expect(p.location).toBe("Hong Kong");
  });

  it("qualifies the zh discovery query with 香港 to beat Tainan keyword dominance", () => {
    const plan = buildMerchantQueryPlan(
      { term: "餐廳", termEn: "restaurant", district: "中西區", districtEn: "Central & Western" },
      "hk",
    );
    // "餐廳 中西區 推薦" lexically matches Taiwan food-blog titles (台南中西區美食推薦…)
    // and returns 8/9 Tainan organic results even with the district location anchor
    // applied (live-verified 2026-07-05). "香港中西區" flips it to 9/9 Hong Kong.
    expect(plan[0].query).toBe("餐廳 香港中西區 推薦");
    // The need and maps queries stay unqualified — they were already correct (Cantonese
    // phrasing / ll anchor), and 香港 would make the conversational query unnatural.
    expect(plan.find((p) => p.id === "ai-mode-need-zh")?.query).toBe("中西區邊間餐廳好");
    expect(plan.find((p) => p.engine === "google_maps")?.query).toBe("餐廳 中西區");
  });

  it("anchors a scanned district at district level, not market level", () => {
    const plan = buildMerchantQueryPlan(
      { term: "餐廳", termEn: "restaurant", district: "中西區", districtEn: "Central & Western" },
      "hk",
    );
    // 中西區 also exists in Tainan — the district-level SerpAPI location keeps organic
    // and AI-overview results anchored to a searcher inside the HK district.
    for (const p of plan)
      expect(p.location).toBe("Central And Western District,Hong Kong Island,Hong Kong");
    // google_maps ignores gl for searches; the district ll is the geo anchor.
    const maps = plan.find((p) => p.engine === "google_maps");
    expect(maps?.ll).toBe("@22.2730219,114.1498806,14z");
    for (const p of plan.filter((x) => x.engine !== "google_maps")) expect(p.ll).toBeNull();
  });

  it("falls back to the market anchor for a district without a SerpAPI mapping", () => {
    // 銅鑼灣 is a neighbourhood, not one of the 18 DISTRICTS_HK entries.
    const plan = buildMerchantQueryPlan(
      { term: "咖啡店", termEn: "cafe", district: "銅鑼灣", districtEn: "Causeway Bay" },
      "hk",
    );
    for (const p of plan) expect(p.location).toBe("Hong Kong");
    expect(plan.find((p) => p.engine === "google_maps")?.ll).toBe("@22.3193039,114.1693611,11z");
  });

  it("uses the closest verified anchors for districts SerpAPI does not model", () => {
    // No "Kowloon City District" in SerpAPI's DB — the Kowloon region GPS sits inside it.
    const kc = buildMerchantQueryPlan(
      { term: "餐廳", termEn: "restaurant", district: "九龍城區", districtEn: "Kowloon City" },
      "hk",
    );
    expect(kc[0].location).toBe("Kowloon,Hong Kong");
    // No "Islands District" either — Tung Chung is the district's main town.
    const islands = buildMerchantQueryPlan(
      { term: "餐廳", termEn: "restaurant", district: "離島區", districtEn: "Islands" },
      "hk",
    );
    expect(islands[0].location).toBe("Tung Chung,New Territories,Hong Kong");
  });
});

describe("buildMerchantQueryPlan (tw market)", () => {
  it("uses tw gl and the city-level SerpAPI location", () => {
    const plan = buildMerchantQueryPlan(
      { term: "美容", termEn: "beauty salon", district: "臺北市", districtEn: "Taipei" },
      "tw",
    );
    for (const item of plan) {
      expect(item.gl).toBe("tw");
      expect(item.location).toBe("Taipei City,Taiwan");
    }
    expect(plan.find((p) => p.engine === "google_maps")?.ll).toBe("@25.0329694,121.5654177,11z");
  });

  it("falls back to the Taiwan market anchor for 連江縣 (no SerpAPI entry)", () => {
    const plan = buildMerchantQueryPlan(
      { term: "美容", termEn: "beauty salon", district: "連江縣", districtEn: "Lienchiang County" },
      "tw",
    );
    for (const item of plan) expect(item.location).toBe("Taiwan");
    expect(plan.find((p) => p.engine === "google_maps")?.ll).toBe("@23.69781,120.960515,8z");
  });

  it("keeps the tw zh discovery query unqualified", () => {
    const plan = buildMerchantQueryPlan(
      { term: "美容", termEn: "beauty salon", district: "臺北市", districtEn: "Taipei" },
      "tw",
    );
    // "台灣臺北市" is unnatural and live-tested worse (generic wiki/info pages replace
    // local salon results); TW city names have no cross-market ambiguity to fix.
    expect(plan[0].query).toBe("美容 臺北市 推薦");
  });

  it("uses Mandarin need phrasing (no Cantonese 邊間)", () => {
    const plan = buildMerchantQueryPlan(
      { term: "美容", termEn: "beauty salon", district: "臺北市", districtEn: "Taipei" },
      "tw",
    );
    const need = plan.find((p) => p.query_type === "need");
    expect(need?.query).toContain("哪一家");
    expect(plan.every((p) => !p.query.includes("邊間"))).toBe(true);
  });

  it("builds an English discovery query using the Taiwan geo label", () => {
    const plan = buildMerchantQueryPlan(
      { term: "美容", termEn: "beauty salon", district: "臺北市", districtEn: "Taipei" },
      "tw",
    );
    const en = plan.find((p) => p.id === "search-discovery-en");
    expect(en?.query).toBe("best beauty salon in Taipei, Taiwan");
  });

  it("falls back to 台灣 when district is blank", () => {
    const plan = buildMerchantQueryPlan(
      { term: "美容", termEn: "beauty salon", district: "", districtEn: "" },
      "tw",
    );
    expect(plan[0].query).toContain("台灣");
    expect(plan.find((p) => p.id === "search-discovery-en")?.query).toBe("best beauty salon in Taiwan");
  });

  it("has no brand query", () => {
    const plan = buildMerchantQueryPlan(
      { term: "美容", termEn: "beauty salon", district: "臺北市", districtEn: "Taipei" },
      "tw",
    );
    expect(plan.some((p) => p.query_type === "brand")).toBe(false);
  });
});
