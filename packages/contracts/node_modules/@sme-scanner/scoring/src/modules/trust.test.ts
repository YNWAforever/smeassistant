import { describe, it, expect } from "vitest";
import { scoreAll } from "../index";
import { scoreTrust } from "./trust";
import type { AuditPayload, GBPPayload, IGPayload } from "../types";

function makeGBP(overrides: Partial<GBPPayload> = {}): GBPPayload {
  return {
    available: true,
    rating: 4.2,
    reviews_count: 30,
    reviews: [
      { rating: 5, time: "2026-05-15", owner_response: "Thank you!" },
      { rating: 4, time: "2026-03-01" },
    ],
    ...overrides,
  };
}

function makeIG(overrides: Partial<IGPayload> = {}): IGPayload {
  return {
    available: true,
    followers: 400,
    ...overrides,
  };
}

describe("scoreTrust", () => {
  it("measures TRUST when IG, fallback GBP, and AEO payloads are available", () => {
    const payload = {
      business_name: "Demo Coffee",
      industry: "Cafe",
      district: "Central",
      ig: makeIG({ username: "demo.coffee", bio: "Coffee and pastries in Central. Visit us today.", posts_count: 12, external_url: "https://example.com" }),
      // These are the scoreable facts normalized from a measured SerpApi GBP fallback.
      gbp: makeGBP({ place_id: "ChIJEffVtbwBBDQRjC76lkC6mKE", name: "Demo Coffee", rating: 4.7, reviews_count: 42, photos_count: 10, hours_complete: true, categories: ["cafe"], recent_posts_count: 2 }),
      aeo: { available: true, serpapi_runs: [{ query: "best coffee Central", ai_overview_mentioned: true, ai_mode_mentioned: true, brand_organic_rank: 1, competitors_mentioned: [] }], website: { available: true, has_faq_schema: true, meta_description_len: 120, h1_count: 1 } },
    } satisfies AuditPayload;
    const result = scoreAll(payload);
    expect(result.modules.trust).toMatchObject({ status: "measured", score: expect.any(Number), limitationCode: null });
  });
  // ── data_unavailable ──
  it("returns unavailable when either source is unavailable", () => {
    const result = scoreTrust(
      { available: false },
      { available: false },
      "餐飲",
    );
    expect(result).toMatchObject({
      status: "unavailable",
      score: null,
      confidence: "none",
      limitationCode: "TRUST_NOT_MEASURED",
    });
    expect(result.findings).toEqual([]);
  });

  // ── review_volume ──
  it("triggers critical for reviews < 5", () => {
    const result = scoreTrust(makeGBP({ reviews_count: 3, reviews: [] }), makeIG(), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.review_volume");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.score_impact).toBe(-25);
  });

  it("triggers warning for reviews < vertical min (20 for 餐飲)", () => {
    const result = scoreTrust(makeGBP({ reviews_count: 12, reviews: [] }), makeIG(), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.review_volume");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.score_impact).toBe(-15);
  });

  it("triggers info for reviews < vertical avg (50 for 餐飲)", () => {
    const result = scoreTrust(makeGBP({ reviews_count: 35, reviews: [] }), makeIG(), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.review_volume");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("info");
    expect(f!.score_impact).toBe(-5);
  });

  // Previously asserted score_impact: 5. Trust bonuses can no longer raise the
  // score (fix(scoring): positive tiers now impact 0), so the top review_volume
  // tier still resolves and still renders its encouragement copy, but contributes
  // no score movement.
  it("still surfaces an info finding for reviews >= vertical avg, with zero score impact", () => {
    const result = scoreTrust(makeGBP({ reviews_count: 60, reviews: [] }), makeIG(), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.review_volume");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("info");
    expect(f!.score_impact).toBe(0);
  });

  // ── review_rating ──
  it("triggers critical for rating < 3.5", () => {
    const result = scoreTrust(makeGBP({ rating: 3.2 }), makeIG(), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.review_rating");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.score_impact).toBe(-30);
  });

  it("triggers warning for rating < 4.0", () => {
    const result = scoreTrust(makeGBP({ rating: 3.7 }), makeIG(), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.review_rating");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.score_impact).toBe(-20);
  });

  // Previously asserted score_impact: 10. See the review_volume comment above —
  // trust bonuses no longer move the score.
  it("still surfaces an info finding for rating >= 4.5, with zero score impact", () => {
    const result = scoreTrust(makeGBP({ rating: 4.7 }), makeIG(), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.review_rating");
    expect(f).toBeDefined();
    expect(f!.score_impact).toBe(0);
  });

  it("triggers no rating finding when rating is 0 (no data)", () => {
    const result = scoreTrust(makeGBP({ rating: 0 }), makeIG(), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.review_rating");
    expect(f).toBeUndefined();
  });

  // ── review_recency ──
  // Previously asserted score_impact: 5. See the review_volume comment above —
  // trust bonuses no longer move the score.
  it("still surfaces an info finding for a review within 7 days, with zero score impact", () => {
    const gbp = makeGBP({
      reviews: [{ rating: 5, time: new Date().toISOString() }],
    });
    const result = scoreTrust(gbp, makeIG(), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.review_recency");
    expect(f).toBeDefined();
    expect(f!.score_impact).toBe(0);
  });

  it("triggers critical for no reviews (no review data)", () => {
    const result = scoreTrust(makeGBP({ reviews: [] }), makeIG(), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.review_recency");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
  });

  // ── owner_engagement ──
  it("triggers critical for 0% response rate with 10+ reviews", () => {
    const reviews = Array.from({ length: 12 }, (_, i) => ({
      rating: 5,
      time: `2026-0${(i % 9) + 1}-15`,
    }));
    const result = scoreTrust(makeGBP({ reviews_count: 12, reviews }), makeIG(), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.owner_engagement");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.score_impact).toBe(-15);
  });

  it("does NOT trigger critical for 0% response rate with < 10 reviews", () => {
    const reviews = Array.from({ length: 5 }, (_, i) => ({
      rating: 5,
      time: `2026-0${(i % 5) + 1}-15`,
    }));
    const result = scoreTrust(makeGBP({ reviews_count: 5, reviews }), makeIG(), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.owner_engagement");
    expect(f?.severity).not.toBe("critical");
  });

  it("triggers warning for response rate < 30%", () => {
    const reviews = [
      { rating: 5, time: "2026-01-01", owner_response: "Thanks" },
      { rating: 4, time: "2026-01-02" },
      { rating: 5, time: "2026-01-03" },
      { rating: 3, time: "2026-01-04" },
      { rating: 5, time: "2026-01-05" },
      { rating: 4, time: "2026-01-06" },
      { rating: 5, time: "2026-01-07" },
      { rating: 4, time: "2026-01-08" },
      { rating: 5, time: "2026-01-09" },
      { rating: 5, time: "2026-01-10" },
    ];
    const result = scoreTrust(makeGBP({ reviews_count: 10, reviews }), makeIG(), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.owner_engagement");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.score_impact).toBe(-10);
  });

  // Previously asserted score_impact: 8. See the review_volume comment above —
  // trust bonuses no longer move the score.
  it("still surfaces an info finding for response rate >= 80%, with zero score impact", () => {
    const reviews = [
      { rating: 5, time: "2026-01-01", owner_response: "Thanks" },
      { rating: 4, time: "2026-01-02", owner_response: "Thanks" },
      { rating: 5, time: "2026-01-03", owner_response: "Thanks" },
      { rating: 3, time: "2026-01-04", owner_response: "Thanks" },
      { rating: 5, time: "2026-01-05" },
    ];
    const result = scoreTrust(makeGBP({ reviews_count: 5, reviews }), makeIG(), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.owner_engagement");
    expect(f).toBeDefined();
    expect(f!.score_impact).toBe(0);
  });

  // ── response rate denominator fix ──
  // Google Places API only returns the most recent 5 reviews. This test used to
  // assert that 5 scraped reviews (4 responded) against a 20-review population
  // computed 4/max(5,20) = 20% and fired a warning. That "fix" was itself the bug:
  // a sample numerator (4 responded out of 5 scraped) over a population denominator
  // (20) is not a response rate — it just looks more plausible than the 80% the
  // sample alone would have suggested. Now that the sample is smaller than the
  // population, the rate is unmeasurable and no finding fires at all.
  it("does not fire owner_engagement when the scraped sample (5) is smaller than reviews_count (20)", () => {
    const reviews = [
      { rating: 5, time: "2026-05-01", owner_response: "Thanks" },
      { rating: 4, time: "2026-04-15", owner_response: "Thanks" },
      { rating: 5, time: "2026-04-01", owner_response: "Thanks" },
      { rating: 4, time: "2026-03-15", owner_response: "Thanks" },
      { rating: 3, time: "2026-03-01" }, // no response
    ];
    // 20 total reviews, but only 5 scraped (Google Places API limit)
    const result = scoreTrust(makeGBP({ reviews_count: 20, reviews }), makeIG(), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.owner_engagement");
    expect(f).toBeUndefined();
  });

  // ── owner_engagement — sample cannot support a population rate ──
  // Google Places returns at most ~5 reviews. Computing a rate against
  // max(scraped, reviews_count) still divides a sample numerator by a population
  // denominator — 5 responses out of a 200-review population is not "2.5% response
  // rate", it is an unmeasured rate. A merchant who replied to every review Google
  // showed us must not be penalised for reviews we never looked at.
  it("does not fire when reviews.length is smaller than reviews_count, even if every scraped review was answered", () => {
    const reviews = Array.from({ length: 5 }, (_, i) => ({
      rating: 5,
      time: `2026-0${(i % 9) + 1}-01`,
      owner_response: "Thanks!",
    }));
    const result = scoreTrust(makeGBP({ reviews_count: 200, reviews }), makeIG(), "餐飲");
    expect(result.findings.find((f) => f.finding_key === "trust.owner_engagement")).toBeUndefined();
  });

  // ── social_proof ──
  it("triggers critical for followers < 100", () => {
    const result = scoreTrust(makeGBP(), makeIG({ followers: 50 }), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.social_proof");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.score_impact).toBe(-20);
  });

  it("triggers warning for followers < vertical ig_min (200 for 餐飲)", () => {
    const result = scoreTrust(makeGBP(), makeIG({ followers: 150 }), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.social_proof");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.score_impact).toBe(-12);
  });

  // Previously asserted score_impact: 5. See the review_volume comment above —
  // trust bonuses no longer move the score.
  it("still surfaces an info finding for followers >= vertical ig_avg, with zero score impact", () => {
    const result = scoreTrust(makeGBP(), makeIG({ followers: 600 }), "餐飲");
    const f = result.findings.find((x) => x.finding_key === "trust.social_proof");
    expect(f).toBeDefined();
    expect(f!.score_impact).toBe(0);
  });

  // ── cross_signal ──
  it("triggers critical when both platforms are critically weak", () => {
    const result = scoreTrust(
      makeGBP({ reviews_count: 2, reviews: [] }),
      makeIG({ followers: 100 }),
      "餐飲",
    );
    const f = result.findings.find((x) => x.finding_key === "trust.cross_signal");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.score_impact).toBe(-25);
  });

  it("triggers warning when one platform is weak", () => {
    const result = scoreTrust(
      makeGBP({ reviews_count: 55, reviews: [] }),
      makeIG({ followers: 100 }),
      "餐飲",
    );
    const f = result.findings.find((x) => x.finding_key === "trust.cross_signal");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.score_impact).toBe(-12);
  });

  // Previously asserted score_impact: 8. See the review_volume comment above —
  // trust bonuses no longer move the score.
  it("still surfaces an info finding when both platforms are strong, with zero score impact", () => {
    const result = scoreTrust(
      makeGBP({ reviews_count: 60, reviews: [] }),
      makeIG({ followers: 600 }),
      "餐飲",
    );
    const f = result.findings.find((x) => x.finding_key === "trust.cross_signal");
    expect(f).toBeDefined();
    expect(f!.score_impact).toBe(0);
  });

  it("reports unavailable when GBP is the only source", () => {
    const result = scoreTrust(
      makeGBP({ reviews_count: 3, reviews: [] }),
      { available: false },
      "餐飲",
    );
    expect(result.status).toBe("unavailable");
    expect(result.score).toBeNull();
    expect(result.findings).toEqual([]);
  });

  it("reports unavailable when IG is the only source", () => {
    const result = scoreTrust(
      { available: false },
      makeIG({ followers: 50 }),
      "餐飲",
    );
    expect(result.status).toBe("unavailable");
    expect(result.score).toBeNull();
    expect(result.findings).toEqual([]);
  });

  // ── single-platform fallback ──
  it("reports unavailable when GBP is unavailable", () => {
    const result = scoreTrust(
      { available: false },
      makeIG({ followers: 600 }),
      "餐飲",
    );
    expect(result.status).toBe("unavailable");
    expect(result.score).toBeNull();
    expect(result.findings).toEqual([]);
  });

  it("reports unavailable when IG is unavailable", () => {
    const result = scoreTrust(
      makeGBP({ reviews_count: 60, reviews: [] }),
      { available: false },
      "餐飲",
    );
    expect(result.status).toBe("unavailable");
    expect(result.score).toBeNull();
    expect(result.findings).toEqual([]);
  });

  // ── score clamping ──
  it("clamps score to 0-100 range", () => {
    const result = scoreTrust(
      makeGBP({ reviews_count: 60, reviews: [], rating: 4.8 }),
      makeIG({ followers: 800 }),
      "餐飲",
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  // ── fallback industry ──
  it("uses 其他 benchmarks when industry is null", () => {
    const result = scoreTrust(makeGBP({ reviews_count: 8, reviews: [] }), makeIG(), null);
    const f = result.findings.find((x) => x.finding_key === "trust.review_volume");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
  });

  it("uses scanner rule threshold semantics without uncited industry average or minimum claims", () => {
    const results = [
      scoreTrust(makeGBP({ reviews_count: 12, reviews: [] }), makeIG({ followers: 150 }), "餐飲"),
      scoreTrust(makeGBP({ reviews_count: 35, reviews: [] }), makeIG({ followers: 400 }), "餐飲"),
      scoreTrust(makeGBP({ reviews_count: 60, reviews: [] }), makeIG({ followers: 600 }), "餐飲"),
    ];
    const serialized = JSON.stringify(results.flatMap((result) => result.findings));
    expect(serialized).not.toMatch(/industry (minimum|average)|行業(平均|最低)|benchmark_(review|rating|ig)/i);
    expect(serialized).toMatch(/scanner rule threshold/i);
    expect(serialized).toContain("掃描器規則門檻");
  });

  // ── bonuses cannot mask a live penalty (the masked case) ──
  // trust starts at 100 and previously added tier impacts including positives, so a
  // strong profile's bonuses could outweigh a genuine, currently-firing deficit and
  // clamp straight back to 100 — hiding the one thing that actually needs fixing.
  //
  // This reproduces that exact shape: review_volume, review_rating, review_recency,
  // social_proof and cross_signal are all strong enough to hit their bonus tier
  // (+5 +10 +5 +5 +8 = +33 pre-fix), while owner_engagement has a live -10 warning
  // (1 of 60 reviews answered, fully scraped so the rate is measurable). Net impact
  // pre-fix: +33 - 10 = +23 -> 100 + 23 = 123 -> clamped to 100, the penalty
  // invisible. Bonuses must not be able to do that: trust reflects deficits only.
  //
  // reviews_count is 60 (not the 200 in the original bug report) and reviews.length
  // is also 60, so the sample fully covers the population — the fix from the
  // previous cycle (unmeasurable when the sample is smaller than reviews_count)
  // does not itself suppress this finding, isolating the bonus-masking bug this
  // test targets.
  it("does not let bonus tiers mask a live owner_engagement penalty", () => {
    const reviews = Array.from({ length: 60 }, (_, i) => ({
      rating: 5,
      time: i === 0 ? new Date().toISOString() : "2020-01-01",
      owner_response: i === 0 ? "Thanks!" : undefined,
    }));
    const gbp = makeGBP({ reviews_count: 60, rating: 4.8, reviews });
    const ig = makeIG({ followers: 600 });

    const result = scoreTrust(gbp, ig, "餐飲");

    const owner = result.findings.find((f) => f.finding_key === "trust.owner_engagement");
    expect(owner?.severity).toBe("warning");
    expect(owner?.score_impact).toBe(-10);

    // 100 - 10 = 90: only the live deficit moves the score; the five bonus tiers
    // (review_volume, review_rating, review_recency, social_proof, cross_signal)
    // contribute 0.
    expect(result.score).toBe(90);
  });
});
