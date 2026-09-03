import { describe, expect, it } from "vitest";
import { creditFraction, deriveTarget, gradedDeduction } from "./graduated-score";

describe("creditFraction — higher_is_better", () => {
  it("is 0 at the floor (default 0)", () => {
    expect(creditFraction(0, 100, "higher_is_better")).toBe(0);
  });

  it("is 1 at the target", () => {
    expect(creditFraction(100, 100, "higher_is_better")).toBe(1);
  });

  it("is proportional between floor and target", () => {
    expect(creditFraction(50, 100, "higher_is_better")).toBeCloseTo(0.5);
    expect(creditFraction(32, 100, "higher_is_better")).toBeCloseTo(0.32);
  });

  it("clamps at 1 beyond the target — no bonus for exceeding it", () => {
    expect(creditFraction(500, 100, "higher_is_better")).toBe(1);
  });

  it("uses a custom floor when given one", () => {
    // GBP rating: a real Google rating is never below 1.0, so 1.0 must be 0%
    // credit, not ~22% — a floor of 0 would silently break the "worst case
    // unchanged" guarantee for this one check.
    expect(creditFraction(1.0, 4.5, "higher_is_better", { floor: 1.0 })).toBe(0);
    expect(creditFraction(4.5, 4.5, "higher_is_better", { floor: 1.0 })).toBe(1);
    const mid = creditFraction(2.75, 4.5, "higher_is_better", { floor: 1.0 });
    expect(mid).toBeCloseTo(0.5, 2);
  });
});

describe("creditFraction — lower_is_better", () => {
  it("is 1 at value 0", () => {
    expect(creditFraction(0, 15, "lower_is_better")).toBe(1);
  });

  it("is 0 at the default ceiling (2x target)", () => {
    expect(creditFraction(30, 15, "lower_is_better")).toBe(0);
  });

  it("stays at 1 for every value at or below the target — nothing to fix yet", () => {
    // target must be where a finding stops firing in BOTH directions. A
    // curve that started ramping down from 0 instead of from target would
    // still deduct points exactly at the target, which is the bug this
    // guards against.
    expect(creditFraction(15, 15, "lower_is_better")).toBe(1);
    expect(creditFraction(5, 15, "lower_is_better")).toBe(1);
  });

  it("is proportional between the target and the ceiling", () => {
    // Default ceiling is 2x target = 30; the midpoint between target(15)
    // and ceiling(30) is 22.5.
    expect(creditFraction(22.5, 15, "lower_is_better")).toBeCloseTo(0.5);
  });

  it("clamps at 0 beyond the ceiling", () => {
    expect(creditFraction(1000, 15, "lower_is_better")).toBe(0);
  });

  it("uses a custom ceiling when given one, even below the default 2x target", () => {
    // ig.content_consistency: target 7, but its old critical cliff (30) is far
    // past 2x target (14) — the ceiling must reach at least the old cliff, or
    // values between 14 and 30 days would bottom out to the full deduction
    // well before today's actual cutoff, which is harsher than today.
    const atOldDefault = creditFraction(20, 7, "lower_is_better", { ceiling: 14 });
    const atCorrectCeiling = creditFraction(20, 7, "lower_is_better", { ceiling: 30 });
    expect(atOldDefault).toBe(0);
    expect(atCorrectCeiling).toBeGreaterThan(0);
  });
});

describe("creditFraction — guards", () => {
  it("does not divide by zero when target equals floor", () => {
    expect(() => creditFraction(5, 0, "higher_is_better", { floor: 0 })).not.toThrow();
    expect(Number.isNaN(creditFraction(5, 0, "higher_is_better", { floor: 0 }))).toBe(false);
  });

  it("does not divide by zero when the lower_is_better ceiling is 0", () => {
    expect(() => creditFraction(5, 0, "lower_is_better", { ceiling: 0 })).not.toThrow();
    expect(Number.isNaN(creditFraction(5, 0, "lower_is_better", { ceiling: 0 }))).toBe(false);
  });
});

describe("gradedDeduction", () => {
  it("returns the full maxDeduction at credit 0", () => {
    expect(gradedDeduction(20, 0)).toBe(20);
  });

  it("returns 0 at credit 1", () => {
    expect(gradedDeduction(20, 1)).toBe(0);
  });

  it("rounds to the nearest integer", () => {
    expect(gradedDeduction(20, 0.32)).toBe(14); // 20 * 0.68 = 13.6 -> 14
    expect(gradedDeduction(15, 0.833)).toBe(3); // 15 * 0.167 = 2.505 -> 3
  });

  it("rounds a near-target credit down to exactly 0, not a phantom deduction", () => {
    expect(gradedDeduction(20, 0.999)).toBe(0);
  });

  it("rounds correctly at a credit fraction that loses precision under naive subtraction", () => {
    // 1 - 0.9 is not exactly 0.1 in floating point; Math.round(5 * (1 - 0.9))
    // undershoots to 0 instead of the correct 1. A credit of 0.9 is a
    // realistic case (9/10, 18/20, 90/100), not a contrived one.
    expect(gradedDeduction(5, 0.9)).toBe(1);
  });
});

describe("deriveTarget", () => {
  it("doubles the average for an unbounded higher_is_better metric", () => {
    expect(deriveTarget(50, "higher_is_better")).toBe(100);
  });

  it("halves the average for an unbounded lower_is_better (day-count) metric", () => {
    expect(deriveTarget(30, "lower_is_better")).toBe(15);
  });

  it("uses the midpoint to a ceiling for a bounded metric", () => {
    // GBP rating average 4.0, ceiling 5.0 -> target 4.5, not the impossible
    // "double the average" (8.0).
    expect(deriveTarget(4.0, "higher_is_better", { ceiling: 5.0 })).toBe(4.5);
    // GBP owner_response_rate average 60(%), ceiling 100 -> target 80.
    expect(deriveTarget(60, "higher_is_better", { ceiling: 100 })).toBe(80);
  });
});
