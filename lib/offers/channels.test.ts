import { describe, expect, it } from "vitest";
import { CHANNEL_LIMITS, isOfferTemplateKey, isOfferWorkflow, offerChannel } from "./channels";

describe("offer channels", () => {
  it("picks the market's chat channel", () => {
    expect(offerChannel("offer-chat-message", "hk")).toBe("whatsapp_message");
    expect(offerChannel("offer-chat-message", "tw")).toBe("line_message");
    expect(offerChannel("offer-gbp-post", "tw")).toBe("google_post");
    expect(offerChannel("offer-social-post", "hk")).toBe("instagram_post");
  });
  it("recognises an offer workflow by its offer_confirmed input", () => {
    expect(isOfferWorkflow({ inputs: [{ key: "offer_confirmed", kind: "confirmed_fact" }] })).toBe(true);
    expect(isOfferWorkflow({ inputs: [{ key: "brand_voice", kind: "preference" }] })).toBe(false);
    expect(isOfferTemplateKey("offer-gbp-post")).toBe(true);
    expect(isOfferTemplateKey("gbp-post")).toBe(false);
  });
  it("limits each channel", () => {
    expect(CHANNEL_LIMITS.google_post).toEqual({ maxChars: 1500, maxHashtags: 0 });
    expect(CHANNEL_LIMITS.instagram_post).toEqual({ maxChars: 2200, maxHashtags: 5 });
    expect(CHANNEL_LIMITS.whatsapp_message.maxChars).toBe(500);
    expect(CHANNEL_LIMITS.line_message.maxChars).toBe(500);
  });
});
