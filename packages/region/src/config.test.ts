import { describe, expect, it, vi } from "vitest";
import {
  MARKETS,
  localeToMarket,
  getMarketConfig,
  getMarketCtas,
  resolveServedLocales,
  LOCALE_LABELS,
} from "./config";

describe("localeToMarket", () => {
  it("maps zh-TW to tw, everything else to hk", () => {
    expect(localeToMarket("zh-TW")).toBe("tw");
    expect(localeToMarket("zh-HK")).toBe("hk");
    expect(localeToMarket("en")).toBe("hk");
  });
});

describe("getMarketConfig", () => {
  it("accepts a market key", () => {
    expect(getMarketConfig("tw").gl).toBe("tw");
    expect(getMarketConfig("hk").gl).toBe("hk");
  });
  it("accepts a locale and derives the market", () => {
    expect(getMarketConfig("zh-TW").contact.channel).toBe("line");
    expect(getMarketConfig("zh-HK").contact.channel).toBe("whatsapp");
    expect(getMarketConfig("en").geoLabelEn).toBe("Hong Kong");
  });
  it("exposes market-specific lists", () => {
    expect(getMarketConfig("tw").districts.some((d) => d.zh === "臺北市")).toBe(true);
    expect(getMarketConfig("hk").districts.some((d) => d.zh === "中西區")).toBe(true);
    expect(MARKETS.tw.geoLabelZh).toBe("台灣");
    expect(MARKETS.hk.geoLabelZh).toBe("香港");
  });
});

describe("pricing", () => {
  it("is HK$888/month for hk, NT$2,800/month for tw", () => {
    expect(MARKETS.hk.pricing).toEqual({ amount: 888, currency: "HKD", unit: "per_location_per_month" });
    expect(MARKETS.tw.pricing).toEqual({ amount: 2800, currency: "TWD", unit: "per_location_per_month" });
  });

  it("round-trips through getMarketConfig by locale", () => {
    expect(getMarketConfig("zh-TW").pricing.currency).toBe("TWD");
    expect(getMarketConfig("en").pricing.currency).toBe("HKD");
    expect(getMarketConfig("zh-HK").pricing.amount).toBe(888);
  });
});

describe("resolveServedLocales", () => {
  it("serves all three locales by default", () => {
    expect(resolveServedLocales(undefined)).toEqual({
      locales: ["zh-HK", "en", "zh-TW"],
      defaultLocale: "zh-HK",
    });
  });
  it("restricts to TW when env=tw", () => {
    expect(resolveServedLocales("tw")).toEqual({ locales: ["zh-TW"], defaultLocale: "zh-TW" });
  });
  it("restricts to HK locales when env=hk", () => {
    expect(resolveServedLocales("hk")).toEqual({ locales: ["zh-HK", "en"], defaultLocale: "zh-HK" });
  });
});

describe("LOCALE_LABELS", () => {
  it("labels every locale", () => {
    expect(LOCALE_LABELS["zh-HK"]).toBe("廣東話");
    expect(LOCALE_LABELS["en"]).toBe("English");
    expect(LOCALE_LABELS["zh-TW"]).toBe("國語");
  });
});

describe("verified market CTAs", () => {
  it("fails closed when destinations are blank or placeholder values", () => {
    vi.stubEnv("NEXT_PUBLIC_HK_WHATSAPP_NUMBER", "85200000000");
    vi.stubEnv("NEXT_PUBLIC_HK_PHONE_NUMBER", "");
    vi.stubEnv("NEXT_PUBLIC_HK_CONTACT_EMAIL", "");
    vi.stubEnv("NEXT_PUBLIC_TW_LINE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_TW_PHONE_NUMBER", "");
    vi.stubEnv("NEXT_PUBLIC_TW_CONTACT_EMAIL", "");

    expect(getMarketCtas("hk")).toEqual([]);
    expect(getMarketCtas("tw")).toEqual([]);
  });

  it("exposes only validated destinations for the matching market", () => {
    vi.stubEnv("NEXT_PUBLIC_HK_WHATSAPP_NUMBER", "+85291234567");
    vi.stubEnv("NEXT_PUBLIC_HK_PHONE_NUMBER", "+85223456789");
    vi.stubEnv("NEXT_PUBLIC_HK_CONTACT_EMAIL", "hello@hk.example");
    vi.stubEnv("NEXT_PUBLIC_TW_LINE_URL", "https://line.me/R/ti/p/@sme-scanner");
    vi.stubEnv("NEXT_PUBLIC_TW_PHONE_NUMBER", "+886912345678");
    vi.stubEnv("NEXT_PUBLIC_TW_CONTACT_EMAIL", "hello@tw.example");

    expect(getMarketCtas("hk")).toEqual([
      { id: "contact_whatsapp", channel: "whatsapp", href: "https://wa.me/85291234567" },
      { id: "contact_phone", channel: "phone", href: "tel:+85223456789" },
      { id: "contact_email", channel: "email", href: "mailto:hello@hk.example" },
    ]);
    expect(getMarketCtas("tw")).toEqual([
      { id: "contact_line", channel: "line", href: "https://line.me/R/ti/p/@sme-scanner" },
      { id: "contact_phone", channel: "phone", href: "tel:+886912345678" },
      { id: "contact_email", channel: "email", href: "mailto:hello@tw.example" },
    ]);
  });

  it("rejects wrong protocols and wrong-market destinations", () => {
    vi.stubEnv("NEXT_PUBLIC_HK_WHATSAPP_NUMBER", "0912345678");
    vi.stubEnv("NEXT_PUBLIC_HK_PHONE_NUMBER", "+886912345678");
    vi.stubEnv("NEXT_PUBLIC_HK_CONTACT_EMAIL", "not-an-email");
    vi.stubEnv("NEXT_PUBLIC_TW_LINE_URL", "http://line.me/R/ti/p/@sme-scanner");
    vi.stubEnv("NEXT_PUBLIC_TW_PHONE_NUMBER", "+85291234567");
    vi.stubEnv("NEXT_PUBLIC_TW_CONTACT_EMAIL", "");

    expect(getMarketCtas("hk")).toEqual([]);
    expect(getMarketCtas("tw")).toEqual([]);
  });
});