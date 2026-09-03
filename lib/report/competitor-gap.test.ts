import { describe, expect, it } from "vitest";
import { competitorGap } from "./competitor-gap";

describe("competitorGap", () => {
  it("reports the review gap when the competitor is ahead", () => {
    expect(competitorGap({ own: 8, ownMatched: true, competitor: 87 })).toEqual({ kind: "comparable", difference: 79, leader: "competitor" });
  });

  it("reports the merchant as leader when it is ahead", () => {
    expect(competitorGap({ own: 87, ownMatched: true, competitor: 8 })).toEqual({ kind: "comparable", difference: 79, leader: "own" });
  });

  it("treats an equal count as comparable with no leader", () => {
    expect(competitorGap({ own: 8, ownMatched: true, competitor: 8 })).toEqual({ kind: "comparable", difference: 0, leader: "none" });
  });

  it("treats both-zero as comparable, not as missing data", () => {
    expect(competitorGap({ own: 0, ownMatched: true, competitor: 0 })).toEqual({ kind: "comparable", difference: 0, leader: "none" });
  });

  it("is not comparable, unmatched, when the merchant was never confidently matched this run", () => {
    // Spec §3: no confident match means no own-side measurement, so every gap is unanswerable.
    expect(competitorGap({ own: null, ownMatched: false, competitor: 87 })).toEqual({ kind: "not_comparable", reason: "no_own_match" });
  });

  it("is not comparable, but NOT unmatched, when the merchant was matched but review data was never collected", () => {
    // BUG 2: jobs scanned before this feature existed have maps_rank (a confident
    // match) with no maps_reviews key at all. That is a data-collection gap, not
    // a match failure, and must produce a distinct reason so the two are never
    // rendered as the same claim.
    expect(competitorGap({ own: null, ownMatched: true, competitor: 87 })).toEqual({ kind: "not_comparable", reason: "no_own_data" });
  });

  it("is not comparable when the competitor value is missing", () => {
    expect(competitorGap({ own: 8, ownMatched: true, competitor: null })).toEqual({ kind: "not_comparable", reason: "no_competitor_value" });
  });
});
