import { describe, expect, it } from "vitest";
import { formatOfferPrice, offerPriceDisplay, validityText } from "./format";

describe("formatOfferPrice", () => {
  it("writes the market symbol with cents only when non-zero", () => {
    expect(formatOfferPrice("88.00", "HKD")).toBe("HK$88");
    expect(formatOfferPrice("88.50", "HKD")).toBe("HK$88.50");
    expect(formatOfferPrice(350, "TWD")).toBe("NT$350");
    expect(formatOfferPrice(1200, "TWD")).toBe("NT$1,200");
  });
  it("is null for an unpriced offer", () => {
    expect(offerPriceDisplay({ price_amount: null, currency: null })).toBeNull();
  });
});

describe("validityText", () => {
  const dated = { starts_on: "2026-10-05", ends_on: "2026-10-31", open_ended: false };
  const open = { starts_on: "2026-10-05", ends_on: null, open_ended: true };
  it("gives a dated range in every locale", () => {
    for (const locale of ["en", "zh-HK", "zh-TW"]) expect(validityText(dated, locale)).toBe("2026-10-05 – 2026-10-31");
  });
  it("says there is no end date, in the locale's wording", () => {
    expect(validityText(open, "zh-HK")).toBe("由 2026-10-05 起，未設結束日期");
    expect(validityText(open, "zh-TW")).toBe("自 2026-10-05 起，未設結束日期");
    expect(validityText(open, "en")).toBe("From 2026-10-05, no fixed end date");
  });
});
