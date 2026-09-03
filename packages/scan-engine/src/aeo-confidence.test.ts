import { describe, expect, it } from "vitest";
import type { AEOPayload, AEOPerformanceRun } from "@sme-scanner/scoring";
import { resolveAeoConfidence } from "./aeo-confidence";

/**
 * A run is "usable" exactly when `run.available && !run.unsupported` — the
 * same predicate `hasUsableAeoEvidence` uses to decide measured/unmeasured.
 * `query-plan.ts` issues 4 plan items, so usable runs range 0-4 (5 when the
 * bounded AI-mode retry fires), but the grading boundary only cares about the
 * count crossing 2 and 3.
 */
function usableRun(overrides: Partial<AEOPerformanceRun> = {}): AEOPerformanceRun {
  return {
    query: "best coffee Central",
    query_type: "discovery",
    engine: "google",
    available: true,
    unsupported: false,
    ai_overview_triggered: false,
    ai_mentioned: false,
    ai_cited: false,
    organic_rank: null,
    local_pack_rank: null,
    maps_rank: null,
    confidence: "none",
    matched_by: [],
    competitors_above: [],
    ...overrides,
  };
}

function unusableRun(): AEOPerformanceRun {
  return usableRun({ available: false });
}

function payload(overrides: Partial<AEOPayload>): AEOPayload {
  return { available: true, serpapi_runs: [], ...overrides };
}

describe("resolveAeoConfidence", () => {
  it("grades high when the website is reachable and exactly three runs are usable", () => {
    const result = resolveAeoConfidence(
      payload({
        website: { available: true },
        performance_runs: [usableRun(), usableRun(), usableRun()],
      }),
    );
    expect(result).toBe("high");
  });

  it("grades high when the website is reachable and all four runs are usable", () => {
    const result = resolveAeoConfidence(
      payload({
        website: { available: true },
        performance_runs: [usableRun(), usableRun(), usableRun(), usableRun()],
      }),
    );
    expect(result).toBe("high");
  });

  it("grades medium, not high, when three runs are usable but the website is unreachable", () => {
    const result = resolveAeoConfidence(
      payload({
        website: { available: false },
        performance_runs: [usableRun(), usableRun(), usableRun()],
      }),
    );
    expect(result).toBe("medium");
  });

  it("grades medium when only two runs are usable, regardless of the website", () => {
    const result = resolveAeoConfidence(
      payload({
        website: { available: true },
        performance_runs: [usableRun(), usableRun()],
      }),
    );
    expect(result).toBe("medium");
  });

  it("grades low for a website-only payload with zero usable runs — measured but no search evidence", () => {
    const result = resolveAeoConfidence(
      payload({
        website: { available: true },
        performance_runs: [unusableRun(), unusableRun()],
      }),
    );
    expect(result).toBe("low");
  });

  it("grades low when only one run is usable and the website is unreachable", () => {
    const result = resolveAeoConfidence(
      payload({
        website: { available: false },
        performance_runs: [usableRun(), unusableRun()],
      }),
    );
    expect(result).toBe("low");
  });

  it("grades low when performance_runs is absent entirely", () => {
    const result = resolveAeoConfidence(payload({ website: { available: false } }));
    expect(result).toBe("low");
  });
});
