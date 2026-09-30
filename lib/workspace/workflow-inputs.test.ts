import { describe, expect, it } from "vitest";
import { templateByKey } from "./templates";
import { isPresent, missingConfirmedInputs } from "./workflow-inputs";

const none: ReadonlySet<string> = new Set();

describe("missingConfirmedInputs", () => {
  it("never returns a preference", () => {
    const workflow = { inputs: [{ key: "brand_voice", kind: "preference" as const }] };
    expect(missingConfirmedInputs(workflow, {}, none)).toEqual([]);
  });

  it("returns missing confirmed facts and evidence in inputs order", () => {
    const workflow = {
      inputs: [
        { key: "a", kind: "confirmed_fact" as const },
        { key: "b", kind: "evidence" as const },
        { key: "c", kind: "preference" as const },
        { key: "d", kind: "confirmed_fact" as const },
      ],
    };
    expect(missingConfirmedInputs(workflow, {}, none)).toEqual(["a", "b", "d"]);
  });

  it("treats blank and whitespace-only strings as missing", () => {
    const workflow = { inputs: [{ key: "cta_link", kind: "confirmed_fact" as const }] };
    expect(missingConfirmedInputs(workflow, { cta_link: "   " }, none)).toEqual(["cta_link"]);
    expect(missingConfirmedInputs(workflow, { cta_link: "" }, none)).toEqual(["cta_link"]);
  });

  it("treats non-string values as present", () => {
    const workflow = {
      inputs: [
        { key: "text_only", kind: "confirmed_fact" as const },
        { key: "selected_reviews", kind: "evidence" as const },
        { key: "n", kind: "confirmed_fact" as const },
      ],
    };
    expect(missingConfirmedInputs(workflow, { text_only: true, selected_reviews: ["k"], n: 0 }, none)).toEqual([]);
  });

  it("a satisfied key passes even when not provided", () => {
    const workflow = { inputs: [{ key: "reviews_without_response", kind: "evidence" as const }] };
    expect(missingConfirmedInputs(workflow, {}, new Set(["reviews_without_response"]))).toEqual([]);
  });

  it("reads the real ig-bio table row", () => {
    expect(missingConfirmedInputs(templateByKey("ig-bio"), { brand_voice: "warm" }, new Set())).toEqual(["approved_claim", "cta_link"]);
  });
});

describe("isPresent", () => {
  it("is false only for undefined, null and blank strings", () => {
    expect(isPresent(undefined)).toBe(false);
    expect(isPresent(null)).toBe(false);
    expect(isPresent("")).toBe(false);
    expect(isPresent("  \n")).toBe(false);
    expect(isPresent("x")).toBe(true);
    expect(isPresent(0)).toBe(true);
    expect(isPresent(false)).toBe(true);
    expect(isPresent([])).toBe(true);
  });
});
