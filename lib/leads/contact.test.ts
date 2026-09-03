import { describe, expect, it } from "vitest";
import { CONTACT_CHANNELS, normalizeMarketContact, resolveContactMarket } from "./contact";
import { buildConsentRecords, CONSENT_POLICY_VERSION } from "./consent";

describe("market contact policy", () => {
  it("offers only WhatsApp, phone, and email for Hong Kong", () => {
    expect(CONTACT_CHANNELS.HK).toEqual(["whatsapp", "phone", "email"]);
    expect(normalizeMarketContact({ market: "HK", channel: "line", identifier: "@shop" })).toBeNull();
  });

  it("offers only LINE, phone, and email for Taiwan", () => {
    expect(CONTACT_CHANNELS.TW).toEqual(["line", "phone", "email"]);
    expect(normalizeMarketContact({ market: "TW", channel: "whatsapp", identifier: "0912345678" })).toBeNull();
  });

  it("normalizes local phone-based contacts to E.164", () => {
    expect(normalizeMarketContact({
      market: "HK",
      channel: "whatsapp",
      identifier: "9123 4567",
    })).toEqual({ channel: "whatsapp", identifier: "+85291234567" });
    expect(normalizeMarketContact({
      market: "TW",
      channel: "phone",
      identifier: "0912-345-678",
    })).toEqual({ channel: "phone", identifier: "+886912345678" });
  });

  it("preserves a LINE identifier except for surrounding whitespace", () => {
    expect(normalizeMarketContact({
      market: "TW",
      channel: "line",
      identifier: "  @happy_shop  ",
    })).toEqual({ channel: "line", identifier: "@happy_shop" });
  });

  it("normalizes email casing for either market", () => {
    expect(normalizeMarketContact({
      market: "HK",
      channel: "email",
      identifier: " Owner@Example.COM ",
    })).toEqual({ channel: "email", identifier: "owner@example.com" });
  });

  it("falls back to the locale market when a direct unlock URL has no market query", () => {
    expect(resolveContactMarket(null, "zh-TW")).toBe("TW");
    expect(resolveContactMarket(null, "zh-HK")).toBe("HK");
    expect(resolveContactMarket("HK", "zh-TW")).toBe("HK");
  });
});

describe("consent records", () => {
  it("creates three independent records with marketing defaulted to false", () => {
    expect(buildConsentRecords({
      reportDelivery: true,
      scanDiscussion: true,
      locale: "zh-HK",
    })).toEqual([
      { consentType: "report_delivery", granted: true, policyVersion: CONSENT_POLICY_VERSION, locale: "zh-HK" },
      { consentType: "scan_discussion", granted: true, policyVersion: CONSENT_POLICY_VERSION, locale: "zh-HK" },
      { consentType: "marketing", granted: false, policyVersion: CONSENT_POLICY_VERSION, locale: "zh-HK" },
    ]);
  });
});
