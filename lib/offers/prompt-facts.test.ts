import { describe, expect, it } from "vitest";
import { offerRow } from "./fixtures.test-helpers";
import { offerPromptFacts } from "./prompt-facts";

describe("offerPromptFacts", () => {
  it("carries only what the prompt needs, already formatted", () => {
    const facts = offerPromptFacts(offerRow({ prohibited_wording: ["最平"], asset_ids: ["A1"], approved_claims: ["Home-made soup"] }), { locale: "zh-HK", channel: "whatsapp_message", hasAsset: false });
    expect(facts).toEqual({
      id: "00000000-0000-4000-8000-0000000000a1",
      revision: 1,
      title: "Weekday lunch set",
      details: "Soup, main and drink",
      terms: "Monday to Friday, 12:00–15:00",
      priceDisplay: "HK$88",
      validityDisplay: "2026-10-05 – 2026-10-31",
      endsOn: "2026-10-31",
      openEnded: false,
      approvedClaims: ["Home-made soup"],
      channel: "whatsapp_message",
      hasAsset: false,
    });
    for (const key of ["prohibited_wording", "asset_ids", "created_by", "workspace_id"]) expect(facts).not.toHaveProperty(key);
  });
  it("follows the run locale for an open-ended offer", () => {
    expect(offerPromptFacts(offerRow({ ends_on: null, open_ended: true }), { locale: "en", channel: "google_post", hasAsset: false }).validityDisplay).toBe("From 2026-10-05, no fixed end date");
  });
});
