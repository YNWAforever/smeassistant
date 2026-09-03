import { describe, expect, it } from "vitest";
import { scoreGBP } from "./gbp";
import type { GBPPayload } from "../types";

describe("scoreGBP owner_action coverage", () => {
  it("emits non-empty owner_action_zh for every finding on a weak profile", () => {
    const payload: GBPPayload = {
      available: true,
      rating: 3.0,
      reviews_count: 3,
      reviews: [{ rating: 3 }],
      photos_count: 0,
      hours_complete: false,
      categories: [],
    };
    const result = scoreGBP(payload, "餐飲");
    expect(result.findings.length).toBeGreaterThan(0);
    const missing = result.findings.filter(
      (f) => !f.owner_action_zh || f.owner_action_zh.trim().length === 0,
    );
    expect(missing.map((f) => f.finding_key)).toEqual([]);
  });

  it("reports unavailable data with a nullable score", () => {
    const result = scoreGBP({ available: false }, "餐飲");
    expect(result).toMatchObject({
      status: "unavailable",
      score: null,
      confidence: "none",
      evidenceCollectedAt: null,
      limitationCode: "GBP_NOT_MEASURED",
    });
    expect(result.findings).toEqual([]);
  });
});

describe("scoreGBP owner_response_low — sample cannot support a population rate", () => {
  // Google Places returns at most ~5 reviews. responded/reviews.length treats that
  // sample as if it were the whole population: 1 of 5 scraped reviews answered reads
  // as a 20% response rate and fires a warning — but the true rate against a
  // 200-review population is unknown, not 20%. Before this fix this scenario wrongly
  // fired; the correct behaviour is no finding at all, because the rate cannot be
  // estimated from a sample this much smaller than the population.
  it("does not fire when reviews.length is smaller than reviews_count, even though the sample-only rate would be low", () => {
    const payload: GBPPayload = {
      available: true,
      rating: 4.5,
      reviews_count: 200,
      reviews: [
        { rating: 5, time: "2026-01-01", owner_response: "Thanks!" },
        { rating: 4, time: "2026-02-01" },
        { rating: 5, time: "2026-03-01" },
        { rating: 4, time: "2026-04-01" },
        { rating: 5, time: "2026-05-01" },
      ],
      photos_count: 10,
      hours_complete: true,
      categories: ["cafe"],
    };
    const result = scoreGBP(payload, "餐飲");
    expect(result.findings.find((f) => f.finding_key === "gbp.owner_response_low")).toBeUndefined();
  });

  // The mirror case named in the bug report: every scraped review was answered, but
  // the population is far larger than the sample. This already produced no finding
  // before the fix (the inflated 100% rate happened to clear the 30% threshold) —
  // pinned here so the post-fix reason (unmeasurable) is not silently reverted to the
  // pre-fix reason (coincidentally high).
  it("does not fire when every scraped review was answered but the sample cannot cover the population", () => {
    const payload: GBPPayload = {
      available: true,
      rating: 4.5,
      reviews_count: 200,
      reviews: Array.from({ length: 5 }, (_, i) => ({
        rating: 5,
        time: `2026-0${(i % 9) + 1}-01`,
        owner_response: "Thanks!",
      })),
      photos_count: 10,
      hours_complete: true,
      categories: ["cafe"],
    };
    const result = scoreGBP(payload, "餐飲");
    expect(result.findings.find((f) => f.finding_key === "gbp.owner_response_low")).toBeUndefined();
  });
});
