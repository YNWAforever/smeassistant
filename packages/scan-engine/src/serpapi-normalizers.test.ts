import { describe, expect, it } from "vitest";
import {
  normalizeGoogleAiModeRun,
  normalizeGoogleMapsRun,
  normalizeGoogleSearchRun,
  toAeoPerformanceRun,
} from "./serpapi-normalizers";
import type { MerchantEntity } from "./entity-matcher";
import type { MerchantQueryPlanItem } from "./query-plan";

const entity: MerchantEntity = {
  businessName: "Happy Cafe",
  aliases: ["Happy Cafe", "開心冰室"],
  domain: "happycafe.hk",
  websiteUrl: "https://happycafe.hk",
  placeId: "happy-place",
  gbpName: "Happy Cafe 開心冰室",
  district: "銅鑼灣",
  categories: ["cafe"],
};

const searchPlan: MerchantQueryPlanItem = {
  id: "search-discovery-zh",
  query: "餐飲 銅鑼灣 香港推薦",
  query_type: "discovery",
  engine: "google",
  hl: "zh-TW",
  gl: "hk",
  location: "Hong Kong",
  ll: null,
  device: "desktop",
};

const mapsPlan: MerchantQueryPlanItem = { ...searchPlan, id: "maps-discovery-zh", engine: "google_maps", query_type: "maps" };

// Own place_id "own-1" so a "Integration Cafe" local result matches confidently by place_id,
// independent of the shared `entity` fixture ("Happy Cafe") used by the other normalizer tests.
const mapsEntity: MerchantEntity = {
  businessName: "Integration Cafe",
  aliases: ["Integration Cafe"],
  domain: null,
  websiteUrl: null,
  placeId: "own-1",
  gbpName: null,
  district: null,
  categories: ["cafe"],
};

function mapsInput(data: { local_results: unknown[] }) {
  return {
    plan: mapsPlan,
    entity: mapsEntity,
    requestedAt: "2026-06-18T00:00:00.000Z",
    data: {
      search_metadata: { status: "Success", id: "maps-id", total_time_taken: 1.8 },
      ...data,
    },
  };
}

describe("SerpAPI merchant performance normalizers", () => {
  it("normalizes Google Search organic rank, AI Overview citation, and competitors", () => {
    const run = normalizeGoogleSearchRun({
      plan: searchPlan,
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: {
        search_metadata: { status: "Success", id: "search-id", total_time_taken: 1.2 },
        ai_overview: {
          text_blocks: [{ text: "Try Happy Cafe for lunch." }],
          references: [{ title: "Happy Cafe", link: "https://happycafe.hk/menu" }],
        },
        organic_results: [
          { title: "Competitor Cafe", link: "https://competitor.hk", snippet: "Cafe", position: 1 },
          { title: "Happy Cafe menu", link: "https://happycafe.hk/menu", snippet: "Official", position: 2 },
        ],
        local_results: [{ title: "Competitor Cafe", place_id: "competitor-place", position: 1 }],
      },
    });

    expect(run.merchant_presence).toMatchObject({
      found: true,
      confidence: "high",
      ai_mentioned: true,
      ai_cited: true,
      organic_rank: 2,
    });
    expect(run.competitors[0]).toMatchObject({ name: "Competitor Cafe", source: "organic", rank: 1 });
    expect(toAeoPerformanceRun(run)).toMatchObject({ ai_cited: true, organic_rank: 2, confidence: "high" });
  });

  it("normalizes Google Search local-pack rank and preserves organic plus local-pack competitors", () => {
    const run = normalizeGoogleSearchRun({
      plan: searchPlan,
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: {
        search_metadata: { status: "Success", id: "search-local-id", total_time_taken: 1.4 },
        organic_results: [
          { title: "Competitor Cafe", link: "https://competitor.hk", snippet: "Cafe", position: 1 },
          { title: "Happy Cafe menu", link: "https://happycafe.hk/menu", snippet: "Official", position: 3 },
        ],
        local_results: [
          { title: "Competitor One", place_id: "competitor-one", position: 1, rating: 4.8, reviews: 420 },
          { title: "Competitor Two", place_id: "competitor-two", position: 2, rating: 4.6, reviews: 220 },
          { title: "Happy Cafe 開心冰室", place_id: "happy-place", position: 3, rating: 4.4, reviews: 80 },
        ],
      },
    });

    expect(run.merchant_presence.local_pack_rank).toBe(3);
    expect(run.competitors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Competitor Cafe", source: "organic", rank: 1 }),
        expect.objectContaining({ name: "Competitor One", source: "local_pack", rank: 1 }),
        expect.objectContaining({ name: "Competitor Two", source: "local_pack", rank: 2 }),
      ])
    );
  });

  it("marks AI Overview as triggered when references exist without extracted text", () => {
    const run = normalizeGoogleSearchRun({
      plan: searchPlan,
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: {
        search_metadata: { status: "Success", id: "search-ai-refs-id", total_time_taken: 1.1 },
        ai_overview: {
          text_blocks: [],
          references: [{ title: "Happy Cafe", link: "https://happycafe.hk" }],
        },
        organic_results: [],
        local_results: [],
      },
    });

    expect(run.raw_refs.ai_overview_triggered).toBe(true);
    expect(toAeoPerformanceRun(run).ai_overview_triggered).toBe(true);
  });

  it("extracts nested list titles and snippets from AI Overview blocks", () => {
    const run = normalizeGoogleSearchRun({
      plan: searchPlan,
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: {
        search_metadata: { status: "Success", id: "search-ai-list-id", total_time_taken: 1.3 },
        ai_overview: {
          text_blocks: [
            {
              type: "list",
              list: [
                {
                  title: "Happy Cafe",
                  snippet: "Popular for lunch in Causeway Bay.",
                },
                {
                  text: "Try the set menu.",
                },
              ],
            },
          ],
          references: [{ title: "Happy Cafe", link: "https://happycafe.hk/menu" }],
        },
        organic_results: [],
        local_results: [],
      },
    });

    expect(run.raw_refs.ai_overview_text).toContain("Happy Cafe");
    expect(run.raw_refs.ai_overview_text).toContain("Popular for lunch in Causeway Bay.");
    expect(run.raw_refs.ai_overview_text).toContain("Try the set menu.");
    expect(run.merchant_presence.ai_mentioned).toBe(true);
  });

  it("normalizes AI Mode reconstructed markdown and references", () => {
    const run = normalizeGoogleAiModeRun({
      plan: { ...searchPlan, id: "ai-mode-need-zh", engine: "google_ai_mode", query_type: "need" },
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: {
        search_metadata: { status: "Success", id: "ai-id", total_time_taken: 2.4 },
        reconstructed_markdown: "Happy Cafe is a nearby option.",
        references: [{ title: "Happy Cafe", link: "https://happycafe.hk" }],
      },
    });

    expect(run.raw_refs.ai_mode_markdown).toContain("Happy Cafe");
    expect(run.merchant_presence.ai_cited).toBe(true);
  });

  it("normalizes Maps rank by place id", () => {
    const run = normalizeGoogleMapsRun({
      plan: { ...searchPlan, id: "maps-discovery-zh", engine: "google_maps", query_type: "maps" },
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: {
        search_metadata: { status: "Success", id: "maps-id", total_time_taken: 1.8 },
        local_results: [
          { title: "Competitor Cafe", place_id: "competitor-place", position: 1, rating: 4.7, reviews: 300 },
          { title: "Happy Cafe 開心冰室", place_id: "happy-place", position: 4, rating: 4.4, reviews: 80 },
        ],
      },
    });

    expect(run.merchant_presence.maps_rank).toBe(4);
    expect(run.merchant_presence.confidence).toBe("high");
    expect(run.competitors).toHaveLength(1);
  });

  it("marks an error payload as unavailable and not unsupported", () => {
    const run = normalizeGoogleSearchRun({
      plan: searchPlan,
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: { search_metadata: { status: "Error", id: null, total_time_taken: null }, error: "Request timed out" },
    });

    expect(run.serpapi.status).toBe("Error");
    expect(toAeoPerformanceRun(run)).toMatchObject({ available: false, unsupported: false });
  });

  it("marks an unsupported-engine error as unsupported", () => {
    const run = normalizeGoogleAiModeRun({
      plan: { ...searchPlan, id: "ai-mode-need-zh", engine: "google_ai_mode", query_type: "need" },
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: { search_metadata: { status: "Error", id: null, total_time_taken: null }, error: "Unsupported Google AI Mode language" },
    });

    expect(toAeoPerformanceRun(run)).toMatchObject({ available: false, unsupported: true });
  });

  it("treats a null body as an unavailable run instead of a successful empty result", () => {
    const run = normalizeGoogleSearchRun({
      plan: searchPlan,
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: null,
    });

    expect(run.serpapi.status).toBe("Error");
    expect(toAeoPerformanceRun(run).available).toBe(false);
  });

  it("handles an empty object body without crashing", () => {
    const run = normalizeGoogleSearchRun({
      plan: searchPlan,
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: {},
    });

    expect(run.merchant_presence.found).toBe(false);
    expect(run.merchant_presence.confidence).toBe("none");
    expect(run.competitors).toEqual([]);
  });

  it("does not throw when SerpAPI fields arrive as non-arrays", () => {
    const run = normalizeGoogleSearchRun({
      plan: searchPlan,
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: {
        search_metadata: { status: "Success", id: "weird", total_time_taken: 1.0 },
        ai_overview: { text_blocks: {}, references: "nope" },
        organic_results: {},
        local_results: null,
      },
    });

    expect(run.merchant_presence.found).toBe(false);
    expect(run.competitors).toEqual([]);
  });

  it("coerces a non-numeric organic position to a finite rank", () => {
    const run = normalizeGoogleSearchRun({
      plan: searchPlan,
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: {
        search_metadata: { status: "Success", id: "nan-pos", total_time_taken: 1.0 },
        organic_results: [
          { title: "Happy Cafe menu", link: "https://happycafe.hk/menu", snippet: "Official", position: "not-a-number" },
        ],
      },
    });

    expect(run.merchant_presence.organic_rank).toBe(1);
    expect(Number.isNaN(run.merchant_presence.organic_rank)).toBe(false);
  });

  it("treats varied 'not supported' phrasings as unsupported", () => {
    const run = normalizeGoogleAiModeRun({
      plan: { ...searchPlan, id: "ai-mode-need-zh", engine: "google_ai_mode", query_type: "need" },
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: {
        search_metadata: { status: "Error", id: null, total_time_taken: null },
        error: "google_ai_mode engine is not supported on your plan",
      },
    });

    expect(toAeoPerformanceRun(run)).toMatchObject({ available: false, unsupported: true });
  });

  it("records presence but no rank for a fuzzy-only organic match, and keeps it as a competitor", () => {
    // "Happy Central Cafe" fuzzy-matches entity "Happy Cafe" (token overlap) but may be a different
    // business — presence is reported at low confidence, yet no rank is asserted and the result is
    // not removed from the competitor list.
    const run = normalizeGoogleSearchRun({
      plan: searchPlan,
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: {
        search_metadata: { status: "Success", id: "fuzzy-organic", total_time_taken: 1.0 },
        organic_results: [
          // Empty snippet: the realistic fuzzy surface — a longer snippet dilutes token overlap
          // below the fuzzy threshold by construction.
          { title: "Happy Central Cafe", link: "https://happycentral.hk", snippet: "", position: 1 },
          { title: "Competitor Cafe", link: "https://competitor.hk", snippet: "Cafe", position: 2 },
        ],
      },
    });

    expect(run.merchant_presence.found).toBe(true);
    expect(run.merchant_presence.confidence).toBe("low");
    expect(run.merchant_presence.organic_rank).toBeNull();
    expect(run.competitors.map((c) => c.name)).toContain("Happy Central Cafe");
  });

  it("prefers a confident organic match over an earlier fuzzy one for rank and competitor window", () => {
    const run = normalizeGoogleSearchRun({
      plan: searchPlan,
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: {
        search_metadata: { status: "Success", id: "fuzzy-shadow", total_time_taken: 1.0 },
        organic_results: [
          { title: "Happy Central Cafe", link: "https://happycentral.hk", snippet: "", position: 1 },
          { title: "Happy Cafe menu", link: "https://happycafe.hk/menu", snippet: "Official", position: 4 },
        ],
      },
    });

    expect(run.merchant_presence.confidence).toBe("high");
    expect(run.merchant_presence.organic_rank).toBe(4);
    expect(run.competitors.map((c) => c.name)).toContain("Happy Central Cafe");
  });

  it("records presence but no rank for a fuzzy-only maps match", () => {
    const run = normalizeGoogleMapsRun({
      plan: { ...searchPlan, id: "maps-discovery-zh", engine: "google_maps", query_type: "maps" },
      entity,
      requestedAt: "2026-06-18T00:00:00.000Z",
      data: {
        search_metadata: { status: "Success", id: "fuzzy-maps", total_time_taken: 1.0 },
        local_results: [
          { title: "Competitor Cafe", place_id: "c2", position: 1 },
          { title: "Happy Central Cafe", place_id: "other-place", position: 2 },
        ],
      },
    });

    expect(run.merchant_presence.found).toBe(true);
    expect(run.merchant_presence.confidence).toBe("low");
    expect(run.merchant_presence.maps_rank).toBeNull();
    expect(run.competitors.map((c) => c.name)).toContain("Happy Central Cafe");
  });

  it("carries each competitor's rating and review count from the maps result", () => {
    const run = normalizeGoogleMapsRun(mapsInput({
      local_results: [
        { title: "Rival Cafe", place_id: "rival-1", rating: 4.6, reviews: 87, position: 1 },
        { title: "Integration Cafe", place_id: "own-1", rating: 4.1, reviews: 8, position: 2 },
      ],
    }));

    expect(run.competitors).toHaveLength(1);
    expect(run.competitors[0]).toMatchObject({ name: "Rival Cafe", rating: 4.6, reviews: 87 });
  });

  it("records the merchant's own rating and review count from the same run", () => {
    const run = normalizeGoogleMapsRun(mapsInput({
      local_results: [
        { title: "Rival Cafe", place_id: "rival-1", rating: 4.6, reviews: 87, position: 1 },
        { title: "Integration Cafe", place_id: "own-1", rating: 4.1, reviews: 8, position: 2 },
      ],
    }));

    // Symmetry (spec §3): the own-side value must come from this run, not from the GBP module.
    expect(run.merchant_presence.maps_rating).toBe(4.1);
    expect(run.merchant_presence.maps_reviews).toBe(8);
  });

  it("leaves own-side rating and reviews null when the merchant is not confidently matched", () => {
    const run = normalizeGoogleMapsRun(mapsInput({
      local_results: [
        { title: "Rival Cafe", place_id: "rival-1", rating: 4.6, reviews: 87, position: 1 },
      ],
    }));

    expect(run.merchant_presence.maps_rank).toBeNull();
    expect(run.merchant_presence.maps_rating).toBeNull();
    expect(run.merchant_presence.maps_reviews).toBeNull();
  });

  it("drops a non-numeric rating and a missing review count instead of passing raw or undefined values through", () => {
    // Mirrors "coerces a non-numeric organic position to a finite rank" above: SerpAPI is an
    // untyped JSON boundary, and a string rating (or an absent reviews key) must not leak past
    // the normalizer as anything other than null — not the raw string, not undefined.
    const run = normalizeGoogleMapsRun(mapsInput({
      local_results: [
        { title: "Rival Cafe", place_id: "rival-1", rating: "4.6", position: 1 },
        { title: "Integration Cafe", place_id: "own-1", rating: "4.1", position: 2 },
      ],
    }));

    expect(run.competitors[0]).toMatchObject({ name: "Rival Cafe", rating: null, reviews: null });
    expect(run.merchant_presence.maps_rating).toBeNull();
    expect(run.merchant_presence.maps_reviews).toBeNull();
  });
});
