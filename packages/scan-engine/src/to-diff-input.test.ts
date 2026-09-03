import { describe, expect, it } from "vitest";
import { toDiffInput, type DiffJobRow } from "./to-diff-input";

function row(overrides: Partial<DiffJobRow> = {}): DiffJobRow {
  return {
    scoring_version: "2026-08-02",
    module_results: {
      ig: { status: "measured", score: 60, findingKeys: ["IG_LOW_POST_FREQUENCY"] },
      gbp: { status: "measured", score: 70, findingKeys: [] },
      aeo: { status: "unavailable", score: null, findingKeys: [] },
      trust: { status: "measured", score: 50, findingKeys: [] },
    },
    ...overrides,
  };
}

describe("toDiffInput", () => {
  it("carries the scoring version and every module through", () => {
    const input = toDiffInput(row());
    expect(input.scoringVersion).toBe("2026-08-02");
    expect(input.modules.ig).toEqual({
      status: "measured",
      score: 60,
      findingKeys: ["IG_LOW_POST_FREQUENCY"],
    });
    expect(input.modules.aeo).toEqual({ status: "unavailable", score: null, findingKeys: [] });
  });

  it("passes a null scoring version through so the engine can refuse the pair", () => {
    // Rows written before scoring_version existed must produce
    // SCORING_VERSION_UNKNOWN, not a guess.
    expect(toDiffInput(row({ scoring_version: null })).scoringVersion).toBeNull();
  });

  it("treats a missing module_results as no modules rather than throwing", () => {
    const input = toDiffInput(row({ module_results: null }));
    expect(input.modules).toEqual({});
  });

  it("defaults absent finding keys to an empty list", () => {
    const input = toDiffInput(
      row({ module_results: { ig: { status: "measured", score: 60 } } as never }),
    );
    expect(input.modules.ig).toEqual({ status: "measured", score: 60, findingKeys: [] });
  });

  it("drops a module whose shape is not recognisable", () => {
    const input = toDiffInput(row({ module_results: { ig: "broken" } as never }));
    expect(input.modules).toEqual({});
  });
});
