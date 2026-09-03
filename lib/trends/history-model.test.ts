import { describe, expect, it } from "vitest";
import { buildTrendModel, type StoredDiff } from "./history-model";

function diff(overrides: Partial<StoredDiff> = {}): StoredDiff {
  return {
    comparable: true,
    incomparable_reason: null,
    composite_withheld_reason: null,
    composite_base: 55,
    composite_head: 62,
    composite_delta: 7,
    resolved_findings: ["IG_LOW_POST_FREQUENCY"],
    regressed_findings: [],
    decayed_findings: ["GBP_POSTS_STALE"],
    lost_coverage: [],
    gained_coverage: [],
    created_at: "2026-08-15T02:00:00.000Z",
    ...overrides,
  };
}

describe("buildTrendModel", () => {
  it("reports an improvement", () => {
    const model = buildTrendModel(diff());
    expect(model.direction).toBe("improved");
    expect(model.delta).toBe(7);
    expect(model.showScores).toBe(true);
  });

  it("reports a decline", () => {
    const model = buildTrendModel(diff({ composite_delta: -4, composite_head: 51 }));
    expect(model.direction).toBe("declined");
  });

  it("reports no change at exactly zero", () => {
    expect(buildTrendModel(diff({ composite_delta: 0 })).direction).toBe("unchanged");
  });

  it("hides every number when the pair is incomparable", () => {
    const model = buildTrendModel(
      diff({
        comparable: false,
        incomparable_reason: "SCORING_VERSION_MISMATCH",
        composite_base: null,
        composite_head: null,
        composite_delta: null,
      }),
    );
    expect(model.direction).toBe("unavailable");
    expect(model.showScores).toBe(false);
    expect(model.base).toBeNull();
    expect(model.head).toBeNull();
    expect(model.delta).toBeNull();
    expect(model.reasonCode).toBe("SCORING_VERSION_MISMATCH");
  });

  it("drops findings entirely when the pair is incomparable", () => {
    // An incomparable pair's findings were never fairly compared, so reporting
    // them as fixed or broken would be inventing a result.
    const model = buildTrendModel(
      diff({ comparable: false, incomparable_reason: "NO_SHARED_MEASURED_MODULE" }),
    );
    expect(model.resolved).toEqual([]);
    expect(model.regressed).toEqual([]);
    expect(model.decayed).toEqual([]);
    expect(model.resolvedCount).toBe(0);
    expect(model.regressedCount).toBe(0);
  });

  it("hides scores but keeps findings when only the composite was withheld", () => {
    // Findings are still real; only the single number is unsafe to show.
    const model = buildTrendModel(
      diff({
        composite_withheld_reason: "INSUFFICIENT_INDEPENDENT_CHANNELS",
        composite_base: null,
        composite_head: null,
        composite_delta: null,
      }),
    );
    expect(model.showScores).toBe(false);
    expect(model.direction).toBe("unavailable");
    expect(model.reasonCode).toBe("INSUFFICIENT_INDEPENDENT_CHANNELS");
    expect(model.resolved).toEqual(["IG_LOW_POST_FREQUENCY"]);
  });

  it("prefers the incomparable reason over a withheld composite", () => {
    // Incomparability is the stronger claim: it explains why nothing at all
    // can be said, so it must be the reason the merchant sees.
    const model = buildTrendModel(
      diff({
        comparable: false,
        incomparable_reason: "SCORING_VERSION_UNKNOWN",
        composite_withheld_reason: "INSUFFICIENT_INDEPENDENT_CHANNELS",
      }),
    );
    expect(model.reasonCode).toBe("SCORING_VERSION_UNKNOWN");
  });

  it("keeps decayed findings out of the regression count", () => {
    // DECAY_FINDING_KEYS exists precisely so time-driven findings are never
    // reported to a merchant as something they broke.
    const model = buildTrendModel(diff({ regressed_findings: ["GBP_NO_RECENT_REVIEWS"] }));
    expect(model.regressed).toEqual(["GBP_NO_RECENT_REVIEWS"]);
    expect(model.decayed).toEqual(["GBP_POSTS_STALE"]);
    expect(model.regressedCount).toBe(1);
  });

  it("carries coverage changes through", () => {
    const model = buildTrendModel(diff({ lost_coverage: ["aeo"], gained_coverage: ["gbp"] }));
    expect(model.lostCoverage).toEqual(["aeo"]);
    expect(model.gainedCoverage).toEqual(["gbp"]);
  });

  it("returns an empty model for a merchant with no diff yet", () => {
    const model = buildTrendModel(null);
    expect(model.direction).toBe("none");
    expect(model.showScores).toBe(false);
    expect(model.reasonCode).toBeNull();
    expect(model.comparedAt).toBeNull();
  });
});

describe("empty model isolation", () => {
  it("hands each caller its own arrays", () => {
    // A shared constant would let one caller's push poison every later
    // merchant's "no diff yet" state.
    const first = buildTrendModel(null);
    const second = buildTrendModel(null);

    expect(first).not.toBe(second);
    first.resolved.push("LEAKED");
    expect(second.resolved).toEqual([]);
  });
});
