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
    expect(previewDraftHrefFor({ enabled: true, access: "viewer", status: "done", locale: "zh-HK", slug: "abc_DEF-1" })).toBe("/zh-HK/start/abc_DEF-1");
    for (const access of ["public", "member", "staff"] as const) {
      expect(previewDraftHrefFor({ enabled: true, access, status: "done", locale: "en", slug: "abc" })).toBeUndefined();
    }
    for (const access of ["public", "viewer", "member", "staff"] as const) {
      expect(previewDraftHrefFor({ enabled: false, access, status: "done", locale: "en", slug: "abc" })).toBeUndefined();
    }
  });

  it("links only a done or partial job, as the page and route require (R13)", () => {
    expect(previewDraftHrefFor({ enabled: true, access: "viewer", status: "partial", locale: "en", slug: "abc" })).toBe("/en/start/abc");
    for (const status of ["queued", "collecting", "scoring", "persisting", "failed", "DONE", "", "unknown"]) {
      expect(previewDraftHrefFor({ enabled: true, access: "viewer", status, locale: "en", slug: "abc" })).toBeUndefined();
    }
  });

  it("encodes the slug as one path segment", () => {
    expect(previewDraftHrefFor({ enabled: true, access: "viewer", status: "done", locale: "en", slug: "a/b?c" })).toBe("/en/start/a%2Fb%3Fc");
  });
});
