import { describe, expect, it } from "vitest";
import { basisLabel, buildExportText, comparisonReasonText, ordinal } from "./format";

describe("ordinal", () => {
  it("covers every day a monthly cadence can fall on", () => {
    // scan_schedules.anniversary_day is constrained to 1..28.
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "28th",
    ]);
  });
});

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

describe("basisLabel", () => {
  // The honesty-critical path: a NULL basis must render as "not recorded" in
  // every locale, never as a guessed basis. This is the case most likely to
  // regress unnoticed -- a dropped SELECT, a lost thread, a typo'd key all
  // produce exactly this string, so the assertion checks the literal text.
  it("renders 'basis not recorded' for a null basis in every locale", () => {
    expect(basisLabel(null, "en")).toBe("basis not recorded");
    expect(basisLabel(null, "zh-HK")).toBe("未記錄依據");
    expect(basisLabel(null, "zh-TW")).toBe("未記錄依據");
  });

  it("renders 'exported' in every locale", () => {
    expect(basisLabel("exported", "en")).toBe("exported");
    expect(basisLabel("exported", "zh-HK")).toBe("已匯出");
    expect(basisLabel("exported", "zh-TW")).toBe("已匯出");
  });

  it("renders 'owner_asserted' with the register Task 8 set for the applied banner (你/您)", () => {
    expect(basisLabel("owner_asserted", "en")).toBe("you reported applying this");
    expect(basisLabel("owner_asserted", "zh-HK")).toBe("你回報已套用");
    expect(basisLabel("owner_asserted", "zh-TW")).toBe("您回報已套用");
  });

  it("renders 'verified' with the verb Task 8 set for the applied banner (核實/查證)", () => {
    expect(basisLabel("verified", "en")).toBe("verified on site");
    expect(basisLabel("verified", "zh-HK")).toBe("已在網站核實");
    expect(basisLabel("verified", "zh-TW")).toBe("已在網站查證");
  });
});

describe("buildExportText", () => {
  const base = { body: "The FAQ body.", altText: null, acceptanceCriteria: [] as string[], locale: "en" as const };

  it("leaves a non-website template's export exactly as it was", () => {
    expect(buildExportText({ ...base, templateKey: "review-response" })).toBe("The FAQ body.");
  });

  it("appends instructions, a numbered checklist and the not-applied disclaimer for the FAQ template", () => {
    const text = buildExportText({ ...base, templateKey: "visibility-content", acceptanceCriteria: ["JSON-LD parses", "Q&A text matches the script"] });
    expect(text).toContain("The FAQ body.");
    expect(text).toContain('<script type="application/ld+json">');
    expect(text).toContain("1. JSON-LD parses");
    expect(text).toContain("2. Q&A text matches the script");
    expect(text).toContain("does not publish anything");
  });

  it("does the same for website-basics, with its own instructions", () => {
    const text = buildExportText({ ...base, templateKey: "website-basics", body: "Title: x", acceptanceCriteria: ["Title under 60 chars"] });
    expect(text).toContain("website editor or CMS");
    expect(text).toContain("1. Title under 60 chars");
    expect(text).toContain("not a claim that your website has changed");
  });

  it("omits the checklist heading entirely when the agent recorded no acceptance_criteria", () => {
    const text = buildExportText({ ...base, templateKey: "visibility-content" });
    expect(text).not.toContain("Checklist");
  });

  it("still appends alt text before the instructions block", () => {
    const text = buildExportText({ ...base, templateKey: "visibility-content", altText: "A plate of char siu." });
    const altIndex = text.indexOf("Alt text");
    const instructionsIndex = text.indexOf("How to apply this");
    expect(altIndex).toBeGreaterThan(-1);
    expect(instructionsIndex).toBeGreaterThan(altIndex);
  });

  it("localizes the instructions and disclaimer in zh-HK and zh-TW", () => {
    expect(buildExportText({ ...base, templateKey: "website-basics", locale: "zh-HK" })).toContain("網站編輯器");
    expect(buildExportText({ ...base, templateKey: "website-basics", locale: "zh-TW" })).toContain("網站編輯器");
  });
});
