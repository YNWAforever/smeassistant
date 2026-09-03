import { describe, expect, it } from "vitest";
import { selectTopPriorities } from "./top-priorities";

// All findings below share a single module ("ig") on purpose: these tests cover
// the filter/sort/tiebreak/limit mechanics of selectTopPriorities independent of
// module weighting, which has its own dedicated test further down. A uniform
// module means weighting scales every candidate by the same factor and cannot
// change their relative order, so these assertions are unaffected by the
// weighted-impact fix.
describe("selectTopPriorities", () => {
  it("sorts by absolute score_impact descending and takes the top 3", () => {
    const findings = [
      { finding_key: "a", score_impact: -10, module: "ig" }, { finding_key: "b", score_impact: -25, module: "ig" },
      { finding_key: "c", score_impact: -5, module: "ig" }, { finding_key: "d", score_impact: -20, module: "ig" }, { finding_key: "e", score_impact: -30, module: "ig" },
    ];
    expect(selectTopPriorities(findings).map((finding) => finding.finding_key)).toEqual(["e", "b", "d"]);
  });
  it("returns fewer than 3 when fewer findings exist, without padding", () => {
    const findings = [{ finding_key: "a", score_impact: -10, module: "ig" }];
    expect(selectTopPriorities(findings)).toEqual(findings);
  });
  it("returns an empty array for no findings", () => { expect(selectTopPriorities([])).toEqual([]); });
  it("excludes bonus findings even when their magnitude is large", () => {
    expect(selectTopPriorities([{ finding_key: "bonus", score_impact: 10, module: "ig" }, { finding_key: "deficit", score_impact: -5, module: "ig" }])
      .map((finding) => finding.finding_key)).toEqual(["deficit"]);
  });
  it("excludes null and zero impact findings", () => {
    expect(selectTopPriorities([{ finding_key: "a", score_impact: null, module: "ig" }, { finding_key: "z", score_impact: 0, module: "ig" }, { finding_key: "b", score_impact: -5, module: "ig" }])
      .map((finding) => finding.finding_key)).toEqual(["b"]);
  });
  it("uses the finding key as a deterministic tie-breaker", () => {
    expect(selectTopPriorities([{ finding_key: "z", score_impact: -10, module: "ig" }, { finding_key: "a", score_impact: -10, module: "ig" }])
      .map((finding) => finding.finding_key)).toEqual(["a", "z"]);
  });

  // The headline score is a weighted average (ig .30 / gbp .35 / aeo .25 / trust .10),
  // so a finding's real effect on it is score_impact * WEIGHTS[module], not the raw
  // module-relative score_impact. A -15 aeo finding (x0.25 = -3.75 headline points) is
  // a smaller real deficit than a -12 gbp finding (x0.35 = -4.20 headline points), even
  // though -15's magnitude is larger. Ranking by raw score_impact gets this backwards.
  it("weights score_impact by its module's headline weight before ranking", () => {
    const findings = [
      { finding_key: "aeo-finding", score_impact: -15, module: "aeo" },
      { finding_key: "gbp-finding", score_impact: -12, module: "gbp" },
    ];
    expect(selectTopPriorities(findings).map((finding) => finding.finding_key)).toEqual([
      "gbp-finding",
      "aeo-finding",
    ]);
  });
});