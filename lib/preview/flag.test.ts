import { describe, expect, it } from "vitest";
import { previewDraftEnabled, previewDraftHrefFor } from "./flag";

describe("previewDraftEnabled", () => {
  it("is on only for the exact string true", () => {
    expect(previewDraftEnabled({ PREVIEW_DRAFT_ENABLED: "true" })).toBe(true);
    for (const value of [undefined, "", "TRUE", "True", "1", " true", "true ", "yes"]) {
      expect(previewDraftEnabled({ PREVIEW_DRAFT_ENABLED: value })).toBe(false);
    }
    expect(previewDraftEnabled({})).toBe(false);
  });
});

describe("previewDraftHrefFor", () => {
  it("previewDraftHrefFor returns the start link only for viewer access with the flag on", () => {
    expect(previewDraftHrefFor({ enabled: true, access: "viewer", locale: "zh-HK", slug: "abc_DEF-1" })).toBe("/zh-HK/start/abc_DEF-1");
    for (const access of ["public", "member", "staff"] as const) {
      expect(previewDraftHrefFor({ enabled: true, access, locale: "en", slug: "abc" })).toBeUndefined();
    }
    for (const access of ["public", "viewer", "member", "staff"] as const) {
      expect(previewDraftHrefFor({ enabled: false, access, locale: "en", slug: "abc" })).toBeUndefined();
    }
  });

  it("encodes the slug as one path segment", () => {
    expect(previewDraftHrefFor({ enabled: true, access: "viewer", locale: "en", slug: "a/b?c" })).toBe("/en/start/a%2Fb%3Fc");
  });
});
