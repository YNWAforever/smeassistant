import { describe, expect, it } from "vitest";
import { comparisonReasonText } from "./format";

describe("comparisonReasonText", () => {
  it("explains each incomparable reason in both languages", () => {
    for (const code of [
      "SCORING_VERSION_MISMATCH",
      "SCORING_VERSION_UNKNOWN",
      "NO_SHARED_MEASURED_MODULE",
      "INSUFFICIENT_INDEPENDENT_CHANNELS",
      "NO_DIFF",
    ]) {
      const en = comparisonReasonText(code, false);
      const zh = comparisonReasonText(code, true);
      expect(en).not.toBe("");
      expect(zh).not.toBe("");
      expect(en).not.toBe(zh);
      // The whole point: the owner never sees the engine's code.
      expect(en).not.toContain(code);
      expect(zh).not.toContain(code);
    }
  });

  it("never echoes an unrecognised code back to the owner", () => {
    // The previous Insights catalogue fell through to `reason ?? default`, so a
    // new engine code would have surfaced raw on the page.
    expect(comparisonReasonText("SOME_FUTURE_CODE", false)).toBe("No comparable scan yet");
    expect(comparisonReasonText("SOME_FUTURE_CODE", true)).toBe("尚無可比較掃描");
  });

  it("handles a missing reason", () => {
    expect(comparisonReasonText(null, false)).toBe("No comparable scan yet");
    expect(comparisonReasonText(undefined, true)).toBe("尚無可比較掃描");
  });
});
