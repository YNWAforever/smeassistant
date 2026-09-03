import { describe, expect, it } from "vitest";
import { mergeFindingKeysIntoModuleResults } from "./merge-finding-keys";

describe("mergeFindingKeysIntoModuleResults", () => {
  it("groups finding keys onto their own module", () => {
    const merged = mergeFindingKeysIntoModuleResults(
      {
        ig: { status: "measured", score: 60 },
        gbp: { status: "measured", score: 70 },
      },
      [
        { module: "ig", finding_key: "IG_LOW_POST_FREQUENCY" },
        { module: "gbp", finding_key: "GBP_NO_RECENT_REVIEWS" },
      ],
    );

    expect(merged).toEqual({
      ig: { status: "measured", score: 60, findingKeys: ["IG_LOW_POST_FREQUENCY"] },
      gbp: { status: "measured", score: 70, findingKeys: ["GBP_NO_RECENT_REVIEWS"] },
    });
  });

  it("gives a module with no findings an empty list rather than omitting the key", () => {
    const merged = mergeFindingKeysIntoModuleResults({ aeo: { status: "unavailable", score: null } }, []);
    expect(merged).toEqual({ aeo: { status: "unavailable", score: null, findingKeys: [] } });
  });

  it("collects every finding for the same module", () => {
    const merged = mergeFindingKeysIntoModuleResults(
      { ig: { status: "measured", score: 60 } },
      [
        { module: "ig", finding_key: "IG_LOW_POST_FREQUENCY" },
        { module: "ig", finding_key: "IG_BIO_MISSING_LOCATION" },
      ],
    );
    expect((merged!.ig as { findingKeys: string[] }).findingKeys).toEqual([
      "IG_LOW_POST_FREQUENCY",
      "IG_BIO_MISSING_LOCATION",
    ]);
  });

  it("drops a finding whose module is not in module_results rather than inventing a key", () => {
    const merged = mergeFindingKeysIntoModuleResults(
      { ig: { status: "measured", score: 60 } },
      [{ module: "trust", finding_key: "TRUST_NO_REVIEWS" }],
    );
    expect(Object.keys(merged!)).toEqual(["ig"]);
  });

  it("passes a null module_results through unchanged", () => {
    expect(mergeFindingKeysIntoModuleResults(null, [{ module: "ig", finding_key: "X" }])).toBeNull();
  });

  it("leaves a non-object module value untouched", () => {
    const merged = mergeFindingKeysIntoModuleResults({ ig: "broken" }, [
      { module: "ig", finding_key: "X" },
    ]);
    expect(merged).toEqual({ ig: "broken" });
  });
});
