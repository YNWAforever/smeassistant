import { describe, expect, it } from "vitest";
import { collectorPhases, coveragePercent } from "./scan-progress";

describe("coveragePercent", () => {
  it("renders a 0-1 fraction as a whole percentage", () => {
    expect(coveragePercent(0.5)).toBe(50);
    expect(coveragePercent(0.7)).toBe(70);
    expect(coveragePercent(1)).toBe(100);
    expect(coveragePercent(0)).toBe(0);
  });
  it("passes an already-a-percentage value through unchanged", () => {
    expect(coveragePercent(70)).toBe(70);
  });
  it("returns null for null or non-finite input", () => {
    expect(coveragePercent(null)).toBeNull();
    expect(coveragePercent(NaN)).toBeNull();
  });
  it("clamps an out-of-range already-a-percentage value to 100", () => {
    expect(coveragePercent(150)).toBe(100);
  });
});

describe("collectorPhases", () => {
  it("uses real per-module states on a partial job instead of a blanket phase", () => {
    const phases = collectorPhases(null, "partial", { google_business: "measured", instagram: "unavailable", search_ai: "failed" });
    expect(phases).toEqual({ google_business: "done", instagram: "unavailable", search_ai: "failed" });
  });
  it("uses real per-module states on a done job too", () => {
    const phases = collectorPhases(null, "done", { google_business: "measured", instagram: "measured", search_ai: "measured" });
    expect(phases).toEqual({ google_business: "done", instagram: "done", search_ai: "done" });
  });
  it("falls back to an honest 'unavailable' blanket on a partial job with no module states available", () => {
    expect(collectorPhases(null, "partial")).toEqual({ google_business: "unavailable", instagram: "unavailable", search_ai: "unavailable" });
  });
  it("honors real mixed per-module states even when the overall scan status is failed", () => {
    expect(collectorPhases(null, "failed", { google_business: "measured", instagram: "unavailable", search_ai: "failed" })).toEqual({
      google_business: "done", instagram: "unavailable", search_ai: "failed",
    });
  });
  it("falls back to a blanket failed phase on outright failure with no module states available", () => {
    expect(collectorPhases(null, "failed")).toEqual({ google_business: "failed", instagram: "failed", search_ai: "failed" });
  });
  it("uses the coarser stage-based phase while the scan is still running", () => {
    expect(collectorPhases("collecting_ig_gbp", "collecting_ig_gbp")).toEqual({ google_business: "running", instagram: "running", search_ai: "pending" });
  });
});
