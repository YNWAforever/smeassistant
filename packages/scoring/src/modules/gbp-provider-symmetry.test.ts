import { describe, expect, it } from "vitest";
import { scoreGBP } from "./gbp";
import type { GBPPayload } from "../types";

/**
 * The same merchant must score the same regardless of which provider answered.
 *
 * Only the Google Places New path reports photo names and opening-hours
 * completeness; the SerpApi GBP fallback cannot observe either. The collector used
 * to coerce that absence to `0` and `false`, so gbp.photos_volume (-10) and
 * gbp.hours_incomplete (-15) fired on evidence nobody had collected. An identical
 * business scored up to 25 lower purely because the primary key was exhausted or
 * GOOGLE_PLACES_KEY was unset that minute.
 *
 * That mattered beyond one report: a provider swap between two scans would have
 * shown a phantom 25-point drop, and any month-over-month comparison built on it
 * would have reported a regression the merchant never had.
 */

/** What both providers can always observe. */
const shared: GBPPayload = {
  available: true,
  name: "Test Merchant",
  rating: 4.8,
  reviews_count: 240,
  reviews: [{ rating: 5, text: "great", time: new Date().toISOString(), owner_response: "thanks" }],
  categories: ["餐廳"],
};

/** Places New additionally reports these two. */
const placesPayload: GBPPayload = { ...shared, photos_count: 40, hours_complete: true };

/** SerpApi cannot, so they are absent — not zero, not false. */
const serpApiPayload: GBPPayload = { ...shared };

describe("GBP provider symmetry", () => {
  it("does not invent a photos finding when photos were never measured", () => {
    const keys = scoreGBP(serpApiPayload).findings.map((f) => f.finding_key);
    expect(keys).not.toContain("gbp.photos_volume");
  });

  it("does not invent an hours finding when hours were never measured", () => {
    const keys = scoreGBP(serpApiPayload).findings.map((f) => f.finding_key);
    expect(keys).not.toContain("gbp.hours_incomplete");
  });

  it("scores an unmeasured signal the same as a strong measured one", () => {
    // Neither payload deserves a penalty: one proved the signal is fine, the other
    // never looked. Absence of evidence is not evidence of absence — the same rule
    // the composite score is built on.
    expect(scoreGBP(serpApiPayload).score).toBe(scoreGBP(placesPayload).score);
  });

  it("still penalises a real measured zero", () => {
    const measuredZero: GBPPayload = { ...shared, photos_count: 0, hours_complete: false };
    const keys = scoreGBP(measuredZero).findings.map((f) => f.finding_key);
    expect(keys).toContain("gbp.photos_volume");
    expect(keys).toContain("gbp.hours_incomplete");
    expect(scoreGBP(measuredZero).score!).toBeLessThan(scoreGBP(placesPayload).score!);
  });

  it("costs exactly 25 points to fabricate both findings, which is what used to happen", () => {
    // Pins the magnitude so the regression is recognisable if it ever returns.
    const measuredZero: GBPPayload = { ...shared, photos_count: 0, hours_complete: false };
    expect(scoreGBP(placesPayload).score! - scoreGBP(measuredZero).score!).toBe(25);
  });
});
