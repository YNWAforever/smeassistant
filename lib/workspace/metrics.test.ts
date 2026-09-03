import { describe, expect, it } from "vitest";
import { deriveMetrics, METRIC_KEYS } from "./metrics";

const now = new Date("2026-09-03T00:00:00Z");

const rawData = {
  gbp: {
    rating: 4.3,
    reviews_count: 5,
    reviews: [
      { id: "r1", rating: 5, text: "great", time: "2026-08-30T10:00:00Z", owner_response: "thanks" },
      { id: "r2", rating: 3, text: "slow", time: "2026-08-20T10:00:00Z", owner_response: null },
      { id: "r3", rating: 4, text: "ok", time: "2026-08-10T10:00:00Z", owner_response: "" },
      { id: "r4", rating: 5, text: "nice", time: "2026-07-10T10:00:00Z", owner_response: "cheers" },
      { id: "r5", rating: 2, text: "meh", time: "2026-06-10T10:00:00Z", owner_response: null },
    ],
    photos: [{ name: "a" }, { name: "b" }, { name: "c" }],
    hours_complete: false,
  },
  ig: {
    profile: { followers: 1240, reels_count: 2, highlights_count: 4 },
    posts: [
      { id: "p1", like_count: 40, comment_count: 2, posted_at: "2026-08-18T09:00:00Z" },
      { id: "p2", like_count: 20, comment_count: 0, posted_at: "2026-08-01T09:00:00Z" },
    ],
    reels: [{ id: "v1" }, { id: "v2" }],
    highlights: [{ id: "h1" }, { id: "h2" }, { id: "h3" }, { id: "h4" }],
  },
  aeo: {
    serpapi_runs: [
      { query: "café happy valley", ai_overview_mentioned: true, ai_mode_mentioned: false, brand_organic_rank: 4, competitors_mentioned: ["a", "b"] },
      { query: "brunch happy valley", ai_overview_mentioned: false, ai_mode_mentioned: false, brand_organic_rank: null, competitors_mentioned: ["a", "b", "c"] },
      { query: "coffee tin hau", ai_overview_mentioned: false, ai_mode_mentioned: true, brand_organic_rank: 9, competitors_mentioned: [] },
    ],
    website: { url: "https://example.test", has_faq_schema: false, meta_description_len: 138, h1_count: 1 },
  },
};

describe("deriveMetrics", () => {
  it("derives the documented keys from raw evidence", () => {
    const metrics = deriveMetrics({
      rawData,
      findings: [],
      aeoRows: [
        { surface: "ai_overview", cited: true, rank: null },
        { surface: "ai_overview", cited: false, rank: null },
        { surface: "organic", cited: true, rank: 4 },
      ],
      websiteChecks: { evaluated: 15, passed: 11, results: [{ key: "faq_schema", pass: false }] },
      now,
    });
    expect(metrics["gbp.rating"]).toBe(4.3);
    expect(metrics["gbp.reviews_count"]).toBe(5);
    expect(metrics["gbp.reviews_sampled"]).toBe(5);
    expect(metrics["gbp.unanswered_sampled"]).toBe(3);
    // 5 sampled of 5 total → measurable → 2 responded / 5.
    expect(metrics["gbp.response_rate_pct"]).toBe(40);
    expect(metrics["gbp.days_since_last_review"]).toBe(3);
    expect(metrics["gbp.photos_count"]).toBe(3);
    expect(metrics["gbp.hours_complete"]).toBe(0);
    expect(metrics["ig.followers"]).toBe(1240);
    expect(metrics["ig.posts_sampled"]).toBe(2);
    expect(metrics["ig.days_since_last_post"]).toBe(15);
    expect(metrics["ig.reels_count"]).toBe(2);
    expect(metrics["ig.highlights_count"]).toBe(4);
    expect(metrics["ig.avg_engagement"]).toBe(31);
    expect(metrics["aeo.runs_total"]).toBe(3);
    expect(metrics["aeo.runs_usable"]).toBe(3);
    expect(metrics["aeo.ai_citation_count"]).toBe(2);
    expect(metrics["aeo.best_organic_rank"]).toBe(4);
    expect(metrics["aeo.best_maps_rank"]).toBeUndefined();
    expect(metrics["aeo.competitors_above"]).toBe(3);
    expect(metrics["aeo.ai_overview_presence_rate"]).toBe(50);
    expect(metrics["aeo.ai_mode_presence_rate"]).toBeUndefined();
    expect(metrics["aeo.organic_presence_rate"]).toBe(100);
    expect(metrics["website.checks_passed"]).toBe(11);
    expect(metrics["website.checks_evaluated"]).toBe(15);
    expect(metrics["website.has_faq_schema"]).toBe(0);
    for (const key of Object.keys(metrics)) expect(METRIC_KEYS).toContain(key);
  });

  it("omits the response rate when the sample does not cover the population", () => {
    const metrics = deriveMetrics({
      rawData: { ...rawData, gbp: { ...rawData.gbp, reviews_count: 120 } },
      findings: [],
      aeoRows: [],
      websiteChecks: null,
      now,
    });
    expect(metrics["gbp.response_rate_pct"]).toBeUndefined();
    expect(metrics["gbp.unanswered_sampled"]).toBe(3);
  });

  it("prefers a finding's evidence value for the same metric", () => {
    const metrics = deriveMetrics({
      rawData,
      findings: [{ finding_key: "gbp.reviews_volume_low", evidence: { reviews_count: 7 } }],
      aeoRows: [],
      websiteChecks: null,
      now,
    });
    expect(metrics["gbp.reviews_count"]).toBe(7);
    // 5 sampled of 7 → not measurable.
    expect(metrics["gbp.response_rate_pct"]).toBeUndefined();
  });

  it("returns nothing for empty raw data and never writes stand-in zeros", () => {
    expect(deriveMetrics({ rawData: null, findings: [], aeoRows: [], websiteChecks: null, now })).toEqual({});
    const unreachable = deriveMetrics({
      rawData: { aeo: { website: { has_faq_schema: true } } },
      findings: [],
      aeoRows: [],
      websiteChecks: { evaluated: 0, passed: 0, results: [] },
      now,
    });
    expect(unreachable).toEqual({ "website.has_faq_schema": 1 });
  });
});
