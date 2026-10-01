import { describe, expect, it } from "vitest";
import { templateByKey } from "./templates";
import { gateBlockingInputs, isPresent, missingConfirmedInputs } from "./workflow-inputs";

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

  it("treats an empty array and an empty plain object as missing", () => {
    const menu = templateByKey("menu-translation");
    expect(missingConfirmedInputs(menu, { menu_items: [] }, none)).toEqual(["menu_items"]);
    expect(missingConfirmedInputs(menu, { menu_items: {} }, none)).toEqual(["menu_items"]);
    expect(missingConfirmedInputs(menu, { menu_items: [{ name: "Roast goose" }] }, none)).toEqual([]);
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
  it("is false only for undefined, null, blank strings, empty arrays and empty plain objects", () => {
    expect(isPresent(undefined)).toBe(false);
    expect(isPresent(null)).toBe(false);
    expect(isPresent("")).toBe(false);
    expect(isPresent("  \n")).toBe(false);
    expect(isPresent([])).toBe(false);
    expect(isPresent({})).toBe(false);
    expect(isPresent("x")).toBe(true);
    expect(isPresent(0)).toBe(true);
    expect(isPresent(false)).toBe(true);
    expect(isPresent([""])).toBe(true);
    expect(isPresent({ name: "x" })).toBe(true);
    expect(isPresent(new Date(0))).toBe(true);
  });
});

describe("gateBlockingInputs", () => {
  const social = templateByKey("social-post");
  const reviews = templateByKey("review-response");

  it("ignores a persisted asset_or_text_only marker; only the server satisfier counts", () => {
    expect(gateBlockingInputs(social, { asset_or_text_only: "asset" }, none)).toEqual(["asset_or_text_only"]);
    expect(gateBlockingInputs(social, { asset_or_text_only: "asset" }, new Set(["asset_or_text_only"]))).toEqual([]);
  });

  it("accepts owner-typed review text for the evidence input (spec 2: present in provided)", () => {
    expect(gateBlockingInputs(reviews, { reviews_without_response: "typed" }, none)).toEqual([]);
    expect(gateBlockingInputs(reviews, { reviews_without_response: "typed" }, new Set(["reviews_without_response"]))).toEqual([]);
  });

  it("blocks the evidence input when neither typed text nor scanned reviews exist", () => {
    expect(gateBlockingInputs(reviews, {}, none)).toEqual(["reviews_without_response"]);
    expect(gateBlockingInputs(reviews, { reviews_without_response: "   " }, none)).toEqual(["reviews_without_response"]);
  });

  it("still honours an owner-provided confirmed fact", () => {
    expect(gateBlockingInputs(templateByKey("ig-bio"), { approved_claim: "x", cta_link: "y" }, none)).toEqual([]);
  });
});
