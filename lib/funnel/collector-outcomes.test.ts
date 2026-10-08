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
