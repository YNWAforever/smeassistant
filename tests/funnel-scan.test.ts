import { describe, expect, it } from "vitest";

import {
  buildCandidateSearchRequest,
  buildInstagramSearchRequest,
  googleMapsUrl,
  parseSearchError,
  shouldSearchMerchantQuery,
  type MerchantCandidate,
} from "@/lib/funnel/business-search";
import { formatMarketPrice, resolveMarketParam } from "@/lib/funnel/pricing";
import { findingLabel, findingMessageKey, formatWeightedImpact, humaniseLimitationCode, readableFindingKey } from "@/lib/funnel/report-labels";
import {
  collectorPhases,
  nextPollDelay,
  progressPercent,
  scanReference,
  stageIndex,
} from "@/lib/funnel/scan-progress";
import {
  buildScanStartPayload,
  canStartScan,
  emptyScanDraft,
  isJobId,
  normaliseInstagramHandle,
  normaliseMarketParam,
} from "@/lib/funnel/scan-start";

const candidate: MerchantCandidate = {
  id: "merchant-1",
  provider: "serpapi",
  name: "錦汶館",
  alternateNames: ["Kam Man House"],
  address: "跑馬地奕蔭街 8 號",
  websiteUrl: "https://kammanhouse.example",
  permanentlyClosed: false,
  placeId: "ChIJ123",
  dataId: "0x1:0x2",
  matchConfidence: "high",
  rating: 4.4,
  reviews: 210,
};

describe("buildScanStartPayload", () => {
  it("sends the upstream field names for a confirmed SerpApi candidate", () => {
    const draft = { ...emptyScanDraft("hk", "錦汶館"), candidate, industry: "餐飲", district: "天后", instagramHandle: "@kammanhouse", instagramMatchProvenance: "picker_confirmed" as const };
    expect(buildScanStartPayload(draft, "zh-HK")).toEqual({
      business_name: "錦汶館",
      market: "HK",
      locale: "zh-HK",
      industry: "餐飲",
      district: "天后",
      objective: "better_visibility",
      place_id: "ChIJ123",
      data_id: "0x1:0x2",
      place_match_confidence: "high",
      provider: "serpapi",
      address: "跑馬地奕蔭街 8 號",
      alternate_names: ["Kam Man House"],
      ig_handle: "kammanhouse",
      ig_match_provenance: "picker_confirmed",
      website_url: "https://kammanhouse.example",
    });
  });

  it("marks manual entry without any provider identity and keeps a pasted maps link", () => {
    const draft = { ...emptyScanDraft("tw", "小南門"), manualEntry: true, industry: "餐飲", district: "台北市", objective: "more_leads" as const, mapsUrl: "https://maps.app.goo.gl/abc", websiteUrl: " https://example.tw " };
    const payload = buildScanStartPayload(draft, "zh-TW");
    expect(payload).toEqual({
      business_name: "小南門",
      market: "TW",
      locale: "zh-TW",
      industry: "餐飲",
      district: "台北市",
      objective: "more_leads",
      manual_entry: true,
      website_url: "https://example.tw",
      maps_url: "https://maps.app.goo.gl/abc",
    });
    expect(payload).not.toHaveProperty("place_id");
    expect(payload).not.toHaveProperty("provider");
    expect(payload).not.toHaveProperty("ig_handle");
  });

  it("falls back to manual entry when a candidate carries no identity", () => {
    const draft = { ...emptyScanDraft("hk", "X"), candidate: { ...candidate, placeId: undefined, dataId: undefined, dataCid: undefined }, industry: "零售", district: "中西區" };
    expect(canStartScan(draft)).toBe(false);
    expect(buildScanStartPayload({ ...draft, manualEntry: true }, "en").manual_entry).toBe(true);
  });

  it("requires name, industry, district and a business identity", () => {
    const base = { ...emptyScanDraft("hk", "錦汶館"), industry: "餐飲", district: "天后" };
    expect(canStartScan(base)).toBe(false);
    expect(canStartScan({ ...base, manualEntry: true })).toBe(true);
    expect(canStartScan({ ...base, candidate })).toBe(true);
    expect(canStartScan({ ...base, candidate, district: "" })).toBe(false);
  });

  it("normalises handles and market params", () => {
    expect(normaliseInstagramHandle("@@kam_man")).toBe("kam_man");
    expect(normaliseInstagramHandle("https://www.instagram.com/kam.man/?hl=en")).toBe("kam.man");
    expect(normaliseMarketParam("TW", "en")).toBe("tw");
    expect(normaliseMarketParam(undefined, "zh-TW")).toBe("tw");
    expect(normaliseMarketParam("xx", "zh-HK")).toBe("hk");
    expect(isJobId("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isJobId("demo-job-247")).toBe(false);
  });
});

describe("business search requests", () => {
  it("needs two meaningful characters", () => {
    expect(shouldSearchMerchantQuery(" a ")).toBe(false);
    expect(shouldSearchMerchantQuery("錦汶")).toBe(true);
    expect(shouldSearchMerchantQuery("a-")).toBe(false);
  });

  it("sends a pasted Google Maps link as mapsUrl", () => {
    const mapsUrl = "https://www.google.com/maps/place/Kam+Man+House/@22.27,114.18,17z";
    const request = buildCandidateSearchRequest({ market: "HK", query: mapsUrl, sessionId: "s" });
    expect(request.url).toBe("/api/business/search");
    expect(JSON.parse(request.init.body as string)).toEqual({ query: "Google Maps merchant", market: "HK", sessionId: "s", mapsUrl });
    expect(googleMapsUrl("http://www.google.com/maps/x")).toBeUndefined();
    expect(googleMapsUrl("not a url")).toBeUndefined();
  });

  it("sends a plain query with the normalised text and optional Instagram context", () => {
    const request = buildCandidateSearchRequest({ market: "TW", query: "  小南門   台北 ", sessionId: "s" });
    expect(JSON.parse(request.init.body as string)).toEqual({ query: "小南門 台北", market: "TW", sessionId: "s" });
    const ig = buildInstagramSearchRequest({ market: "HK", businessName: "錦汶館", sessionId: "s", district: "天后", websiteUrl: " " });
    expect(JSON.parse(ig.init.body as string)).toEqual({ businessName: "錦汶館", market: "HK", sessionId: "s", district: "天后" });
  });

  it("maps failures to the copy keys", () => {
    expect(parseSearchError(429, {})).toBe("RATE_LIMITED");
    expect(parseSearchError(400, { error: "INVALID_REQUEST" })).toBe("INVALID_REQUEST");
    expect(parseSearchError(400, { outcome: "INVALID_MAPS_URL" })).toBe("INVALID_MAPS_URL");
    expect(parseSearchError(504, { outcome: "TIMEOUT" })).toBe("TIMEOUT");
    expect(parseSearchError(500, {})).toBe("PROVIDER_ERROR");
  });
});

describe("scan progress", () => {
  it("derives the stage index, progress and collector phases", () => {
    expect(stageIndex(null, "queued")).toBe(0);
    expect(stageIndex("collecting_ig_gbp", "collecting")).toBe(2);
    expect(stageIndex("collecting_aeo", "collecting")).toBe(3);
    expect(stageIndex("scoring", "scoring")).toBe(4);
    expect(stageIndex("unexpected", "collecting")).toBe(0);
    expect(stageIndex("done", "done")).toBe(6);
    expect(stageIndex(null, "partial")).toBe(6);
    expect(progressPercent(4)).toBe(67);
    expect(collectorPhases("collecting", "collecting")).toEqual({ google_business: "pending", instagram: "pending", search_ai: "pending" });
    expect(collectorPhases("collecting_ig_gbp", "collecting")).toEqual({ google_business: "running", instagram: "running", search_ai: "pending" });
    expect(collectorPhases("collecting_aeo", "collecting")).toEqual({ google_business: "done", instagram: "done", search_ai: "running" });
    expect(collectorPhases("persisting", "persisting")).toEqual({ google_business: "done", instagram: "done", search_ai: "done" });
    expect(collectorPhases("partial", "partial")).toEqual({ google_business: "collected", instagram: "collected", search_ai: "collected" });
    expect(collectorPhases("failed", "failed")).toEqual({ google_business: "failed", instagram: "failed", search_ai: "failed" });
  });

  it("builds the scan reference and the 1 s → 8 s backoff", () => {
    expect(scanReference("11111111-2222-4333-8444-555555555555")).toBe("SCAN-111111");
    expect(scanReference("ab12cd34-ef56-4789-8abc-def012345678")).toBe("SCAN-AB12CD");
    const delays = [1000];
    while (delays[delays.length - 1] < 8000) delays.push(nextPollDelay(delays[delays.length - 1]));
    expect(delays).toEqual([1000, 1500, 2250, 3375, 5063, 7595, 8000]);
    expect(nextPollDelay(8000)).toBe(8000);
  });
});

describe("pricing", () => {
  it("binds plan prices to the market config", () => {
    expect(formatMarketPrice({ amount: 888, currency: "HKD", unit: "per_location_per_month" })).toBe("HK$888");
    expect(formatMarketPrice({ amount: 2800, currency: "TWD", unit: "per_location_per_month" })).toBe("NT$2,800");
    expect(resolveMarketParam("TW", "zh-HK")).toBe("tw");
    expect(resolveMarketParam(null, "zh-TW")).toBe("tw");
    expect(resolveMarketParam(null, "en")).toBe("hk");
  });
});

describe("report labels", () => {
  it("maps finding keys to message keys and human labels", () => {
    expect(findingMessageKey("gbp.reviews_volume_low")).toBe("findingGbpReviewsVolumeLow");
    expect(readableFindingKey("gbp.reviews_volume_low")).toBe("reviews volume low");
    expect(findingLabel("en", "gbp.reviews_volume_low")).not.toContain("finding");
    expect(findingLabel("zh-HK", "made.up_key")).toBe("up key");
    expect(humaniseLimitationCode("IG_HANDLE_NOT_PROVIDED")).toBe("IG handle not provided");
  });

  it("formats the weighted impact like upstream", () => {
    expect(formatWeightedImpact(-10, "gbp")).toBe("-3.5");
    expect(formatWeightedImpact(-20, "ig")).toBe("-6");
    expect(formatWeightedImpact(-15, "aeo")).toBe("-3.8");
    expect(formatWeightedImpact(0, "trust")).toBe("0");
    expect(formatWeightedImpact(-8, "unknown")).toBe("0");
  });
});
