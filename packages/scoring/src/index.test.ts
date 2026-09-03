import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { score, scoreAll } from "./index";
import { scoreIG } from "./modules/ig";
import { scoreAEO } from "./modules/aeo";
import { scoreGBP } from "./modules/gbp";
import type { AuditPayload, IGPayload, AEOPayload } from "./types";

const FIXED_NOW = new Date("2026-06-15T12:00:00Z");

describe("score — trust module integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes new trust findings in overall result", () => {
    const payload: AuditPayload = {
      business_name: "測試餐廳",
      industry: "餐飲",
      district: "灣仔",
      ig: {
        available: true,
        username: "test",
        followers: 600,
        bio: "testing",
        highlights_count: 3,
        posts_last_12: [],
      },
      gbp: {
        available: true,
        reviews_count: 60,
        rating: 4.6,
        reviews: [
          { rating: 5, time: "2026-06-10", owner_response: "Thanks!" },
          { rating: 4, time: "2026-06-12", owner_response: "Thanks!" },
          { rating: 5, time: "2026-06-14" },
        ],
      },
      aeo: {
        available: true,
        serpapi_runs: [],
        website: { available: false },
      },
    };

    const result = score(payload);

    expect(result.modules.trust).toBeDefined();

    const trustFindings = result.findings.filter((f) => f.module === "trust");
    // 5, not 6: reviews_count is 60 but only 3 reviews were scraped, so
    // trust.owner_engagement is now unmeasurable (the sample can't cover the
    // population) and does not fire. The other 5 trust findings (review_volume,
    // review_rating, review_recency, social_proof, cross_signal) always resolve a
    // tier regardless of sample size.
    expect(trustFindings.length).toBe(5);

    expect(result.overall).toBeGreaterThan(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it("handles unavailable trust data gracefully", () => {
    const payload: AuditPayload = {
      business_name: "無資料店",
      industry: "餐飲",
      district: "灣仔",
      ig: { available: false },
      gbp: { available: false },
      aeo: { available: false, serpapi_runs: [], website: { available: false } },
    };

    const result = score(payload);

    expect(result.modules.trust.score).toBeNull();
    expect(result.modules.trust.status).toBe("unavailable");
    expect(result.modules.trust.limitationCode).toBe("TRUST_NOT_MEASURED");
  });
});

describe("score availability and coverage", () => {
  it("excludes unavailable modules and reports weighted coverage", () => {
    const result = scoreAll({
      business_name: "測試餐廳",
      industry: "餐飲",
      district: "灣仔",
      ig: { available: true, followers: 100, posts_last_12: [] },
      gbp: { available: false },
      aeo: { available: true, serpapi_runs: [], website: { available: true, meta_description_len: 120, h1_count: 1 } },
    });

    expect(result.modules.gbp).toMatchObject({
      status: "unavailable",
      score: null,
      confidence: "none",
      limitationCode: "GBP_NOT_MEASURED",
    });
    expect(result.modules.trust.score).toBeNull();
    expect(result.overall).not.toBeNull();
    expect(result.coverage).toBeCloseTo(0.55);
    // Deliberately a literal, not an import: bumping the version must require a
    // conscious test edit, because a bump means previously stored scores are no
    // longer comparable to new ones.
    // Bumped 2026-08-02 -> 2026-08-16: IG and GBP moved from binary threshold
    // deductions to continuous curves against a derived target for 11 of their
    // 17 checks, changing what score most payloads produce.
    expect(result.scoringVersion).toBe("2026-08-16");
  });

  it("withholds the composite when fewer than two independent channels are measured", () => {
    const result = scoreAll({
      business_name: "測試餐廳",
      industry: "餐飲",
      district: "灣仔",
      ig: { available: true, followers: 100, posts_last_12: [] },
      gbp: { available: false },
      aeo: { available: false, serpapi_runs: [] },
    });

    expect(result.overall).toBeNull();
    expect(result.coverage).toBeCloseTo(0.3);
  });
});

describe("ig.reels_missing", () => {
  it("fires when reels_count is 0", () => {
    const payload: IGPayload = {
      available: true,
      followers: 1000,
      bio: "This is a bio long enough to pass the check and not trigger other findings",
      external_url: "https://example.com",
      posts_last_12: [
        { id: "1", media_type: "GraphImage", like_count: 50, comment_count: 5, posted_at: new Date().toISOString() },
        { id: "2", media_type: "GraphSidecar", like_count: 40, comment_count: 4, posted_at: new Date(Date.now() - 7 * 86400000).toISOString() },
      ],
      highlights_count: 3,
      reels_count: 0,
    };
    const result = scoreIG(payload);
    const keys = result.findings.map((f) => f.finding_key);
    expect(keys).toContain("ig.reels_missing");
    const f = result.findings.find((x) => x.finding_key === "ig.reels_missing")!;
    expect(f.severity).toBe("warning");
    expect(f.score_impact).toBe(-15);
  });

  it("does not fire when reels_count > 0", () => {
    const payload: IGPayload = {
      available: true,
      followers: 1000,
      bio: "This is a bio long enough to pass the check and not trigger other findings",
      external_url: "https://example.com",
      posts_last_12: [],
      highlights_count: 3,
      reels_count: 5,
    };
    const result = scoreIG(payload);
    const keys = result.findings.map((f) => f.finding_key);
    expect(keys).not.toContain("ig.reels_missing");
  });
});

// ── ig.follower_count_low ──────────────────────────────────────────────────────
// Regression tests for the follower threshold check, now graduated against a
// target of 2x the industry average (500 -> 1000 for 餐飲) instead of a flat
// 500-follower cliff. The critical/warning severity boundary at 100 is
// unchanged from before graduation.

describe("ig.follower_count_low", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Base payload that avoids all OTHER IG findings so we can isolate follower check:
  // - bio > 90 chars (the new target) → no profile_clarity
  // - external_url    → no bio_cta
  // - highlights >= 6 (the new target) → no story_highlights_missing
  // - reels_count > 0 → no reels_missing
  // - posts every 5 days, mixed types → no content_consistency, no content_mix
  // - engagement > 4% (the new target) → no engagement_low
  const baseIG = (followers: number): IGPayload => ({
    available: true,
    followers,
    bio: "A".repeat(95),
    external_url: "https://example.com",
    highlights_count: 6,
    reels_count: 2,
    posts_last_12: [
      { id: "1", media_type: "GraphImage",   like_count: Math.round(followers * 0.05), comment_count: 2, posted_at: new Date(Date.now()).toISOString() },
      { id: "2", media_type: "GraphSidecar", like_count: Math.round(followers * 0.04), comment_count: 1, posted_at: new Date(Date.now() - 5 * DAY_MS).toISOString() },
      { id: "3", media_type: "GraphVideo",   like_count: Math.round(followers * 0.04), comment_count: 1, posted_at: new Date(Date.now() - 10 * DAY_MS).toISOString() },
    ],
  });

  it("still deducts the full -20 at 0 followers (worst case unchanged)", () => {
    const result = scoreIG(baseIG(0), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.follower_count_low");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.score_impact).toBe(-20);
  });

  it("fires critical at −19 when followers are 58 (below the old critical cliff of 100)", () => {
    const result = scoreIG(baseIG(58), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.follower_count_low");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.score_impact).toBe(-19);
    expect((f!.evidence as Record<string, unknown>).followers).toBe(58);
  });

  it("fires warning at −15 when followers are 250 (between the old critical cliff and the new target)", () => {
    const result = scoreIG(baseIG(250), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.follower_count_low");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.score_impact).toBe(-15);
  });

  it("fires in the old dead zone — 500 followers used to score a free pass", () => {
    const result = scoreIG(baseIG(500), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.follower_count_low");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.score_impact).toBe(-10);
  });

  it("does not fire at the derived target (1000 for a 500-follower average)", () => {
    const result = scoreIG(baseIG(1000), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.follower_count_low");
    expect(f).toBeUndefined();
  });

  it("does not fire well above the target", () => {
    const result = scoreIG(baseIG(2000), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.follower_count_low");
    expect(f).toBeUndefined();
  });
});

// ── ig.content_consistency posting recency ───────────────────────────────────
// The days-since-last-post branch is graduated against a target of 7 days
// (half the 14-day average) with a ceiling of 30 days — 30, not the default
// 14 (2x target) — because the existing critical cliff at 30 days must stay
// the point where the curve bottoms out; a 14-day ceiling would flatten the
// whole 14-29 day range to the maximum deduction, harsher than today for
// that range. The zero-posts case is untouched — it is a hard floor, not a
// point on this curve.

describe("ig.content_consistency posting recency", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  function postsLatest(daysAgo: number, count = 5): NonNullable<IGPayload["posts_last_12"]> {
    const now = Date.now();
    return Array.from({ length: count }, (_, i) => ({
      id: String(i + 1),
      media_type: i % 2 === 0 ? "GraphImage" : "GraphSidecar",
      like_count: 50,
      comment_count: 3,
      posted_at: new Date(now - (daysAgo + i * 7) * DAY_MS).toISOString(),
    }));
  }

  const strongIGBase = (posts: NonNullable<IGPayload["posts_last_12"]>): IGPayload => ({
    available: true,
    followers: 600,
    bio: "A".repeat(95),
    external_url: "https://example.com",
    highlights_count: 6,
    reels_count: 2,
    posts_last_12: posts,
  });

  it("still deducts the full -20 at the old 30-day critical cliff and beyond", () => {
    const result = scoreIG(strongIGBase(postsLatest(40)), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.content_consistency");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.score_impact).toBe(-20);
  });

  it("stays warning, not critical, at exactly 30 days — the old code's boundary was strictly > 30", () => {
    // The deduction bottoms out to the full -20 at the ceiling (30), but the
    // severity cliff is unchanged from before graduation: 30 itself was never
    // "critical" pre-graduation (only 31+), so severity must not flip a day
    // early just because the deduction curve already reached its floor.
    const result = scoreIG(strongIGBase(postsLatest(30)), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.content_consistency");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.score_impact).toBe(-20);
  });

  it("fires graduated, not flat, at 20 days — already flagged before, but flat at -15 either way", () => {
    // Not a "dead zone" case: old code already fired here (20 > the old
    // 14-day warning threshold), just at a flat -15 regardless of how far
    // past 14 the value was. This proves the deduction is now proportional
    // instead of flat, not that a finding newly appears.
    const result = scoreIG(strongIGBase(postsLatest(20)), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.content_consistency");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.score_impact).toBe(-11);
  });

  it("fires in the old dead zone — 10 days used to score a free pass (old warning threshold was 14)", () => {
    const result = scoreIG(strongIGBase(postsLatest(10)), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.content_consistency");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.score_impact).toBe(-3);
  });

  it("does NOT fire exactly at the new target of 7 days", () => {
    // The exact boundary this check exists to prove: creditFraction's
    // lower_is_better curve must be flat at credit 1 for every value at or
    // below target, not just at 0 — a curve that only reached credit 1 at
    // value 0 would still deduct points at the target itself.
    const result = scoreIG(strongIGBase(postsLatest(7)), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.content_consistency");
    expect(f).toBeUndefined();
  });

  it("fires critical (-20) when there are no posts at all — untouched hard floor, not part of the curve", () => {
    const result = scoreIG(strongIGBase([]), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.content_consistency");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.score_impact).toBe(-20);
  });
});

describe("scoreAEO with serpapi_runs", () => {
  const basePayload: AEOPayload = {
    available: true,
    serpapi_runs: [],
    website: { available: false },
  };

  it("fires aeo.ai_overview_missing critical when no runs mention brand in AI Overview", () => {
    const payload: AEOPayload = {
      ...basePayload,
      serpapi_runs: [
        { query: "餐廳 旺角", ai_overview_mentioned: false, ai_mode_mentioned: false, brand_organic_rank: null, competitors_mentioned: [] },
        { query: "best restaurant mong kok", ai_overview_mentioned: false, ai_mode_mentioned: false, brand_organic_rank: null, competitors_mentioned: [] },
      ],
    };
    const result = scoreAEO(payload);
    const f = result.findings.find((x) => x.finding_key === "aeo.ai_overview_missing");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.score_impact).toBe(-30);
  });

  it("fires aeo.ai_overview_missing warning when some (not all) runs mention brand", () => {
    const payload: AEOPayload = {
      ...basePayload,
      serpapi_runs: [
        { query: "餐廳 旺角", ai_overview_mentioned: true, ai_mode_mentioned: true, brand_organic_rank: 2, competitors_mentioned: [] },
        { query: "best restaurant mong kok", ai_overview_mentioned: false, ai_mode_mentioned: false, brand_organic_rank: null, competitors_mentioned: [] },
        { query: "q3", ai_overview_mentioned: false, ai_mode_mentioned: false, brand_organic_rank: null, competitors_mentioned: [] },
        { query: "q4", ai_overview_mentioned: false, ai_mode_mentioned: false, brand_organic_rank: null, competitors_mentioned: [] },
      ],
    };
    const result = scoreAEO(payload);
    const f = result.findings.find((x) => x.finding_key === "aeo.ai_overview_missing");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.score_impact).toBe(-15);
  });

  it("fires aeo.organic_rank_poor when rank > 5", () => {
    const payload: AEOPayload = {
      ...basePayload,
      serpapi_runs: [
        { query: "q1", ai_overview_mentioned: false, ai_mode_mentioned: false, brand_organic_rank: 8, competitors_mentioned: [] },
      ],
    };
    const result = scoreAEO(payload);
    const f = result.findings.find((x) => x.finding_key === "aeo.organic_rank_poor");
    expect(f).toBeDefined();
    expect(f!.score_impact).toBe(-15);
  });

  it("returns a nullable score and limitation when not available", () => {
    const result = scoreAEO({ available: false, serpapi_runs: [] });
    expect(result).toMatchObject({
      status: "unavailable",
      score: null,
      confidence: "none",
      limitationCode: "AEO_NOT_MEASURED",
    });
  });

  it("does NOT fire aeo.ai_overview_missing when mention rate >= 0.5", () => {
    const payload: AEOPayload = {
      ...basePayload,
      serpapi_runs: [
        { query: "q1", ai_overview_mentioned: true, ai_mode_mentioned: false, brand_organic_rank: null, competitors_mentioned: [] },
        { query: "q2", ai_overview_mentioned: true, ai_mode_mentioned: false, brand_organic_rank: null, competitors_mentioned: [] },
        { query: "q3", ai_overview_mentioned: false, ai_mode_mentioned: false, brand_organic_rank: null, competitors_mentioned: [] },
      ],
    };
    const result = scoreAEO(payload);
    const f = result.findings.find((x) => x.finding_key === "aeo.ai_overview_missing");
    expect(f).toBeUndefined();
  });

  it("does not treat missing FAQ schema as a critical AI visibility failure", () => {
    const payload: AEOPayload = {
      available: true,
      serpapi_runs: [],
      website: { available: true, has_faq_schema: false, meta_description_len: 140, h1_count: 1 },
    };
    const result = scoreAEO(payload);
    expect(result.findings.find((x) => x.finding_key === "aeo.website_no_faq_schema")).toBeUndefined();
  });
});

describe("gbp.reviews_volume_low graduated", () => {
  it("still deducts the full -20 at 0 reviews (worst case unchanged)", () => {
    const result = scoreGBP({ available: true, reviews_count: 0, hours_complete: true, categories: ["cafe"], photos_count: 10 }, "餐飲");
    const f = result.findings.find((x) => x.finding_key === "gbp.reviews_volume_low");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.score_impact).toBe(-20);
  });

  it("fires in the old dead zone — 32 reviews used to score a free pass", () => {
    const result = scoreGBP({ available: true, reviews_count: 32, hours_complete: true, categories: ["cafe"], photos_count: 10 }, "餐飲");
    const f = result.findings.find((x) => x.finding_key === "gbp.reviews_volume_low");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.score_impact).toBe(-14);
  });

  it("does not fire at the derived target (100 reviews for a 50-review average)", () => {
    const result = scoreGBP({ available: true, reviews_count: 100, hours_complete: true, categories: ["cafe"], photos_count: 10 }, "餐飲");
    expect(result.findings.find((x) => x.finding_key === "gbp.reviews_volume_low")).toBeUndefined();
  });
});

describe("gbp.rating_low graduated", () => {
  it("still deducts the full -25 at the real worst case (1.0, since 0 means unrated)", () => {
    const result = scoreGBP({ available: true, rating: 1.0, reviews_count: 50, hours_complete: true, categories: ["cafe"], photos_count: 10 }, "餐飲");
    const f = result.findings.find((x) => x.finding_key === "gbp.rating_low");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.score_impact).toBe(-25);
  });

  it("fires in the old dead zone — a 4.2 rating used to score a free pass", () => {
    const result = scoreGBP({ available: true, rating: 4.2, reviews_count: 50, hours_complete: true, categories: ["cafe"], photos_count: 10 }, "餐飲");
    const f = result.findings.find((x) => x.finding_key === "gbp.rating_low");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.score_impact).toBe(-2);
  });

  it("does not fire at the derived target (4.5 for a 4.0 average)", () => {
    const result = scoreGBP({ available: true, rating: 4.5, reviews_count: 50, hours_complete: true, categories: ["cafe"], photos_count: 10 }, "餐飲");
    expect(result.findings.find((x) => x.finding_key === "gbp.rating_low")).toBeUndefined();
  });
});

describe("gbp freshness graduated", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("gbp.review_freshness graduated", () => {
    it("still deducts the full -15 at the old 90-day cutoff and beyond", () => {
      const result = scoreGBP({
        available: true,
        reviews_count: 50,
        reviews: [{ rating: 5, time: "2026-03-17" }], // 90 days before the fixed clock
        hours_complete: true, categories: ["cafe"], photos_count: 10,
      }, "餐飲");
      const f = result.findings.find((x) => x.finding_key === "gbp.review_freshness");
      expect(f).toBeDefined();
      expect(f!.severity).toBe("warning");
      expect(f!.score_impact).toBe(-15);
    });

    it("fires in the old dead zone — 45 days used to score a free pass", () => {
      const result = scoreGBP({
        available: true,
        reviews_count: 50,
        reviews: [{ rating: 5, time: "2026-05-01" }], // 45 days before the fixed clock
        hours_complete: true, categories: ["cafe"], photos_count: 10,
      }, "餐飲");
      const f = result.findings.find((x) => x.finding_key === "gbp.review_freshness");
      expect(f).toBeDefined();
      expect(f!.score_impact).toBe(-6);
    });

    it("does not fire at the derived target (15 days for a 30-day average)", () => {
      const result = scoreGBP({
        available: true,
        reviews_count: 50,
        reviews: [{ rating: 5, time: "2026-06-01" }], // 15 days before the fixed clock
        hours_complete: true, categories: ["cafe"], photos_count: 10,
      }, "餐飲");
      expect(result.findings.find((x) => x.finding_key === "gbp.review_freshness")).toBeUndefined();
    });
  });

  describe("gbp.photos_freshness graduated", () => {
    it("still deducts the full -10 at the old 90-day cutoff and beyond", () => {
      const result = scoreGBP({
        available: true, reviews_count: 50, hours_complete: true, categories: ["cafe"], photos_count: 10,
        latest_photo_at: "2026-03-17", // 90 days before the fixed clock
      }, "餐飲");
      const f = result.findings.find((x) => x.finding_key === "gbp.photos_freshness");
      expect(f).toBeDefined();
      expect(f!.score_impact).toBe(-10);
    });

    it("fires in the old dead zone — 60 days used to score a free pass", () => {
      const result = scoreGBP({
        available: true, reviews_count: 50, hours_complete: true, categories: ["cafe"], photos_count: 10,
        latest_photo_at: "2026-04-16", // 60 days before the fixed clock
      }, "餐飲");
      const f = result.findings.find((x) => x.finding_key === "gbp.photos_freshness");
      expect(f).toBeDefined();
      expect(f!.score_impact).toBe(-3);
    });

    it("does not mention the photo-count benchmark anymore — it is a freshness message now", () => {
      const result = scoreGBP({
        available: true, reviews_count: 50, hours_complete: true, categories: ["cafe"], photos_count: 10,
        latest_photo_at: "2026-04-16",
      }, "餐飲");
      const f = result.findings.find((x) => x.finding_key === "gbp.photos_freshness");
      expect(f!.owner_message_en).not.toMatch(/average is 10/);
      expect(f!.owner_message_en).toMatch(/days/i);
    });
  });
});

describe("gbp.owner_response_low graduated", () => {
  it("still deducts the full -15 at 0% response", () => {
    const result = scoreGBP({
      available: true, reviews_count: 5, hours_complete: true, categories: ["cafe"], photos_count: 10,
      reviews: [
        { rating: 5, time: "2026-06-01" }, { rating: 5, time: "2026-06-02" },
        { rating: 5, time: "2026-06-03" }, { rating: 5, time: "2026-06-04" }, { rating: 5, time: "2026-06-05" },
      ],
    }, "餐飲");
    const f = result.findings.find((x) => x.finding_key === "gbp.owner_response_low");
    expect(f).toBeDefined();
    expect(f!.score_impact).toBe(-15);
  });

  it("fires in the old dead zone — 50% response used to score a free pass", () => {
    const result = scoreGBP({
      available: true, reviews_count: 4, hours_complete: true, categories: ["cafe"], photos_count: 10,
      reviews: [
        { rating: 5, time: "2026-06-01", owner_response: "Thanks!" },
        { rating: 5, time: "2026-06-02", owner_response: "Thanks!" },
        { rating: 5, time: "2026-06-03" }, { rating: 5, time: "2026-06-04" },
      ],
    }, "餐飲");
    const f = result.findings.find((x) => x.finding_key === "gbp.owner_response_low");
    expect(f).toBeDefined();
    expect(f!.score_impact).toBe(-6);
  });

  it("does not fire at the derived target (80% for a 60% average)", () => {
    const result = scoreGBP({
      available: true, reviews_count: 5, hours_complete: true, categories: ["cafe"], photos_count: 10,
      reviews: [
        { rating: 5, time: "2026-06-01", owner_response: "Thanks!" },
        { rating: 5, time: "2026-06-02", owner_response: "Thanks!" },
        { rating: 5, time: "2026-06-03", owner_response: "Thanks!" },
        { rating: 5, time: "2026-06-04", owner_response: "Thanks!" },
        { rating: 5, time: "2026-06-05" },
      ],
    }, "餐飲");
    expect(result.findings.find((x) => x.finding_key === "gbp.owner_response_low")).toBeUndefined();
  });
});

describe("gbp.photos_volume graduated", () => {
  it("still deducts the full -10 at 0 photos", () => {
    const result = scoreGBP({ available: true, reviews_count: 50, hours_complete: true, categories: ["cafe"], photos_count: 0 }, "餐飲");
    const f = result.findings.find((x) => x.finding_key === "gbp.photos_volume");
    expect(f).toBeDefined();
    expect(f!.score_impact).toBe(-10);
  });

  it("fires in the old dead zone — 12 photos used to score a free pass", () => {
    const result = scoreGBP({ available: true, reviews_count: 50, hours_complete: true, categories: ["cafe"], photos_count: 12 }, "餐飲");
    const f = result.findings.find((x) => x.finding_key === "gbp.photos_volume");
    expect(f).toBeDefined();
    expect(f!.score_impact).toBe(-4);
  });

  it("does not fire at the derived target (20 photos for a 10-photo average)", () => {
    const result = scoreGBP({ available: true, reviews_count: 50, hours_complete: true, categories: ["cafe"], photos_count: 20 }, "餐飲");
    expect(result.findings.find((x) => x.finding_key === "gbp.photos_volume")).toBeUndefined();
  });

  it("still skips entirely when photos_count is unmeasured (undefined)", () => {
    const result = scoreGBP({ available: true, reviews_count: 50, hours_complete: true, categories: ["cafe"] }, "餐飲");
    expect(result.findings.find((x) => x.finding_key === "gbp.photos_volume")).toBeUndefined();
  });
});

describe("ig.profile_clarity graduated", () => {
  it("still deducts the full -15 at bio length 0", () => {
    const result = scoreIG({ available: true, bio: "", followers: 600, posts_last_12: [] }, "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.profile_clarity");
    expect(f).toBeDefined();
    expect(f!.score_impact).toBe(-15);
  });

  it("fires in the old dead zone — a 50-char bio used to score a free pass", () => {
    const result = scoreIG({ available: true, bio: "A".repeat(50), followers: 600, posts_last_12: [] }, "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.profile_clarity");
    expect(f).toBeDefined();
    expect(f!.score_impact).toBe(-7);
  });

  it("does not fire at the derived target (90 chars for a 45-char average)", () => {
    const result = scoreIG({ available: true, bio: "A".repeat(90), followers: 600, posts_last_12: [] }, "餐飲");
    expect(result.findings.find((x) => x.finding_key === "ig.profile_clarity")).toBeUndefined();
  });
});

describe("ig.story_highlights_missing graduated", () => {
  it("still deducts the full -15 at 0 highlights", () => {
    const result = scoreIG({ available: true, followers: 600, highlights_count: 0, posts_last_12: [] }, "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.story_highlights_missing");
    expect(f).toBeDefined();
    expect(f!.score_impact).toBe(-15);
  });

  it("fires in the old dead zone — 3 highlights used to score a free pass", () => {
    const result = scoreIG({ available: true, followers: 600, highlights_count: 3, posts_last_12: [] }, "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.story_highlights_missing");
    expect(f).toBeDefined();
    expect(f!.score_impact).toBe(-8);
  });

  it("does not fire at the derived target (6 for a 3-average)", () => {
    const result = scoreIG({ available: true, followers: 600, highlights_count: 6, posts_last_12: [] }, "餐飲");
    expect(result.findings.find((x) => x.finding_key === "ig.story_highlights_missing")).toBeUndefined();
  });
});

describe("ig.engagement_low graduated", () => {
  const withEngagement = (rate: number): IGPayload => {
    const followers = 1000;
    const totalInteractions = Math.round(followers * rate); // rate as a fraction, e.g. 0.02 = 2%
    return {
      available: true,
      followers,
      bio: "A".repeat(95),
      external_url: "https://example.com",
      highlights_count: 6,
      reels_count: 2,
      posts_last_12: [
        { id: "1", media_type: "GraphImage", like_count: totalInteractions, comment_count: 0, posted_at: new Date(Date.now()).toISOString() },
      ],
    };
  };

  it("still deducts the full -20 at 0% engagement (worst case unchanged), and stays critical throughout — this check never had a warning tier", () => {
    const result = scoreIG(withEngagement(0), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.engagement_low");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.score_impact).toBe(-20);
  });

  it("fires in the old dead zone — 2% engagement used to score a free pass, and stays critical", () => {
    const result = scoreIG(withEngagement(0.02), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "ig.engagement_low");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.score_impact).toBe(-10);
  });

  it("does not fire at the derived target (4% for a 2% average)", () => {
    const result = scoreIG(withEngagement(0.04), "餐飲");
    expect(result.findings.find((x) => x.finding_key === "ig.engagement_low")).toBeUndefined();
  });
});
