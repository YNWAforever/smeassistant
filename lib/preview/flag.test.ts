import { describe, expect, it } from "vitest";
import { previewDraftEnabled } from "./flag";

describe("previewDraftEnabled", () => {
  it("is on only for the exact string true", () => {
    expect(previewDraftEnabled({ PREVIEW_DRAFT_ENABLED: "true" })).toBe(true);
    for (const value of [undefined, "", "TRUE", "True", "1", " true", "true ", "yes"]) {
      expect(previewDraftEnabled({ PREVIEW_DRAFT_ENABLED: value })).toBe(false);
    }
    expect(previewDraftEnabled({})).toBe(false);
  });
});
