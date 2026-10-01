import { describe, expect, it } from "vitest";
import { offersEnabled } from "./flag";

describe("offersEnabled", () => {
  it("is on only for the exact string true", () => {
    expect(offersEnabled({ OFFERS_ENABLED: "true" })).toBe(true);
    for (const value of ["1", "TRUE", " true", "yes", undefined]) expect(offersEnabled({ OFFERS_ENABLED: value })).toBe(false);
  });
});
