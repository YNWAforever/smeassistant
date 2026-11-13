import { describe, expect, it } from "vitest";
import { recordedFindingEvidence } from "./action-evidence";

describe("recorded finding descriptions", () => {
  it("includes only catalogued labels and deduplicates labels shared by different rules", () => {
    expect(recordedFindingEvidence(["gbp.reviews_volume_low", "trust.review_volume", "gbp.reviews_volume_low", "evil.claim"])).toEqual({
      factType: "Observed",
      detail: { en: "The scan flagged: Review Count.", "zh-HK": "掃描記錄到：評論數量。", "zh-TW": "掃描記錄到：評論數量。" },
    });
  });
  it("supports the local website check without untrusted message text", () => {
    expect(recordedFindingEvidence(["website.checks.faq_schema"]).detail.en).toBe("The scan flagged: Website FAQ schema.");
  });
  it.each([{ keys: [] }, { keys: ["unknown.causal_claim"] }, { keys: ["gbp.reviews_volume_low.untrusted"] }, { keys: ["gbp.reviews__volume_low"] }])("fails closed for missing or unknown findings: $keys", ({ keys }) => {
    expect(recordedFindingEvidence(keys)).toMatchObject({ factType: "Unknown", detail: { en: "The recorded finding details are unavailable." } });
  });
});
