import { describe, expect, it } from "vitest";
import { score } from "../index";
import type { AuditPayload, AEOPerformanceRun } from "../types";
import { scoreTrust } from "./trust";

// Payloads chosen to trigger a wide spread of finding tiers across all four modules,
// including weak (penalty), strong (bonus), and unavailable branches.
function aeoRun(over: Partial<AEOPerformanceRun>): AEOPerformanceRun {
  return {
    query: "q",
    query_type: "discovery",
    engine: "google",
    available: true,
    unsupported: false,
    ai_overview_triggered: true,
    ai_answered: true,
    ai_mentioned: false,
    ai_cited: false,
    organic_rank: 8,
    local_pack_rank: null,
    maps_rank: null,
    confidence: "high",
    matched_by: ["domain"],
    competitors_above: ["Rival A", "Rival B"],
    ...over,
  };
}

const weak: AuditPayload = {
  business_name: "Test Shop",
  industry: "餐飲",
  district: "銅鑼灣",
  ig: { available: true, followers: 30, posts_count: 2, bio: "" },
  gbp: { available: true, rating: 3.2, reviews_count: 3, reviews: [{ rating: 3 }], photos_count: 0, hours_complete: false, categories: ["cafe"] },
  aeo: {
    available: true,
    serpapi_runs: [],
    performance_runs: [aeoRun({ organic_rank: 9, maps_rank: 9, engine: "google_maps", query_type: "maps" }), aeoRun({})],
    website: { available: true, has_faq_schema: false, meta_description_len: 10, h1_count: 0 },
  },
};

const strong: AuditPayload = {
  business_name: "Test Shop",
  industry: "餐飲",
  district: "銅鑼灣",
  ig: { available: true, followers: 40000, posts_count: 60, bio: "Best cafe — book now" },
  gbp: { available: true, rating: 4.8, reviews_count: 500, reviews: [{ rating: 5, owner_response: "thanks", time: new Date().toISOString() }], photos_count: 50, hours_complete: true, categories: ["cafe"] },
  aeo: {
    available: true,
    serpapi_runs: [],
    performance_runs: [aeoRun({ ai_cited: true, organic_rank: 1, competitors_above: [] })],
    website: { available: true, has_faq_schema: true, meta_description_len: 140, h1_count: 1 },
  },
};

const unavailable: AuditPayload = {
  business_name: "Test Shop",
  industry: "餐飲",
  district: "銅鑼灣",
  ig: { available: false },
  gbp: { available: false },
  aeo: { available: false, serpapi_runs: [] },
};

describe("bilingual findings coverage", () => {
  for (const [name, payload] of [["weak", weak], ["strong", strong], ["unavailable", unavailable]] as const) {
    it(`every ${name}-payload finding has non-empty owner_message_en`, () => {
      const result = score(payload);
      const missing = result.findings.filter(
        (f) => !f.owner_message_en || f.owner_message_en.trim().length === 0,
      );
      expect(missing.map((f) => f.finding_key)).toEqual([]);
    });
  }
});

describe("trust English copy", () => {
  it("emits English for a high-rating bonus and includes the rating value", () => {
    const r = scoreTrust(
      { available: true, rating: 4.8, reviews_count: 500, reviews: [{ rating: 5 }] },
      { available: true, followers: 40000 },
      "餐飲",
    );
    const rating = r.findings.find((f) => f.finding_key === "trust.review_rating");
    expect(rating?.owner_message_en).toContain("4.8");
    expect(rating?.owner_message_en).toMatch(/[A-Za-z]/);
  });
});
