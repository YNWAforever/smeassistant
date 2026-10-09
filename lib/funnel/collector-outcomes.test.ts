import { expect, it } from "vitest";
import { collectorPhases, stallCollectorPhases } from "./scan-progress";

it.each(["collecting_aeo", "scoring", "persisting"])("never infers measured outcomes from stage %s", stage => {
  const phases = collectorPhases(stage, "processing", null);
  expect(Object.values(phases)).not.toContain("done");
  expect(phases.instagram).toBe("awaiting_result");
});
it.each(["done", "partial", "failed"])("keeps legacy terminal payload outcomes unknown: %s", status => {
  expect(Object.values(collectorPhases(null, status))).toEqual(["awaiting_result", "awaiting_result", "awaiting_result"]);
});
it("keeps evidenced outcomes while overlaying a stalled unknown result", () => {
  expect(stallCollectorPhases({ google_business: "done", instagram: "awaiting_result", search_ai: "failed" })).toEqual({ google_business: "done", instagram: "stalled", search_ai: "failed" });
});

// F-15: the engine reads Instagram only from the handle given at start, so a
// missing handle is known from the first poll. It must read "not provided",
// never "awaiting a result" that cannot come, and never a measured outcome.
it.each(["collecting_ig_gbp", "collecting_aeo", "scoring", "persisting", "queued"])("shows a missing Instagram handle as not provided while %s", stage => {
  const phases = collectorPhases(stage, "processing", null, ["instagram"]);
  expect(phases.instagram).toBe("not_provided");
  expect(phases.google_business).toBe(collectorPhases(stage, "processing", null).google_business);
});
it("refines a terminal unavailable Instagram to not provided, but never overrides an evidenced outcome", () => {
  expect(collectorPhases(null, "partial", { google_business: "measured", instagram: "unavailable", search_ai: "failed" }, ["instagram"]))
    .toEqual({ google_business: "done", instagram: "not_provided", search_ai: "failed" });
  expect(collectorPhases(null, "done", { google_business: "measured", instagram: "measured", search_ai: "measured" }, ["instagram"]).instagram).toBe("done");
  expect(collectorPhases(null, "partial", { google_business: "measured", instagram: "failed", search_ai: "measured" }, ["instagram"]).instagram).toBe("failed");
});
