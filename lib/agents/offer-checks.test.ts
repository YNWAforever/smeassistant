import { describe, expect, it } from "vitest";
import { offerDatesMissing, offerPriceMismatch, offerProhibitedHits, promotionChannel, type OfferEvidence } from "./offer-checks";

const offer = (over: Partial<OfferEvidence> = {}): OfferEvidence => ({
  title: "Autumn set dinner",
  details: "Four-course set dinner for two.",
  terms: "Dine in only.",
  price: { amount: 1280, currency: "HKD" },
  valid_from: "2026-10-05",
  valid_until: "2026-10-19",
  claims: [],
  photo_alt_text: null,
  ...over,
});

describe("offerPriceMismatch", () => {
  it.each(["Set dinner HK$1,280 for two", "Set dinner $1280.00 for two", "兩人晚餐 1,280元", "兩人晚餐 1280蚊", "Set dinner HKD 1280 for two", "only HK$1,280."])(
    "reads %j as the offer's 1280 by value",
    (body) => {
      expect(offerPriceMismatch(body, offer())).toBe(false);
    },
  );

  it("does not read a phone number or a year as a price", () => {
    expect(offerPriceMismatch("HK$1,280 for two. Call 2345 6789, family-run since 2019.", offer())).toBe(false);
  });

  it("flags a different price", () => {
    expect(offerPriceMismatch("Set dinner HK$1,180 for two", offer())).toBe(true);
  });

  it("flags a second, different price beside the right one", () => {
    expect(offerPriceMismatch("HK$1,280 for two, or $99 for the starter", offer())).toBe(true);
  });

  it("flags a body that states no price when the offer has one", () => {
    expect(offerPriceMismatch("Come and enjoy our autumn set dinner.", offer())).toBe(true);
  });

  it("with no offer price, flags any price and accepts none", () => {
    const free = offer({ price: null });
    expect(offerPriceMismatch("Tasting menu $50", free)).toBe(true);
    expect(offerPriceMismatch("Come and enjoy our autumn set dinner.", free)).toBe(false);
  });

  it("reads a Taiwan offer's NT$ and 元 forms", () => {
    const tw = offer({ price: { amount: 2800, currency: "TWD" } });
    expect(offerPriceMismatch("雙人套餐 NT$2,800", tw)).toBe(false);
    expect(offerPriceMismatch("雙人套餐 2800元", tw)).toBe(false);
    expect(offerPriceMismatch("雙人套餐 NT$2,500", tw)).toBe(true);
  });

  it("is not fooled by a decimal that merely starts with the right digits", () => {
    expect(offerPriceMismatch("HK$1,280.50 for two", offer())).toBe(true);
  });
});

describe("offerDatesMissing", () => {
  it.each(["Until 2026-10-19", "即日起至10月19日", "valid until 19/10", "valid until 19 Oct", "from 5 Oct to 19 October"])("finds the date in %j", (body) => {
    expect(offerDatesMissing(body, offer())).toBe(false);
  });

  it("finds the start date too", () => {
    expect(offerDatesMissing("Starts 2026-10-05", offer())).toBe(false);
  });

  it("is missing when only a different date appears", () => {
    expect(offerDatesMissing("Until 2026-10-12", offer())).toBe(true);
    expect(offerDatesMissing("until 12/10 or 29 Oct", offer())).toBe(true);
  });

  it("does not match a day number inside a longer number", () => {
    expect(offerDatesMissing("call 119/10 or 2119 Oct", offer())).toBe(true);
  });

  it("is missing when the body has no date", () => {
    expect(offerDatesMissing("Come and enjoy our autumn set dinner.", offer())).toBe(true);
  });
});

describe("offerProhibitedHits", () => {
  it("matches case-insensitively and returns the term as listed", () => {
    expect(offerProhibitedHits("Best deal in town", ["best"])).toEqual(["best"]);
    expect(offerProhibitedHits("BEST deal", ["Best"])).toEqual(["Best"]);
  });

  it("ignores blank terms and absent terms", () => {
    expect(offerProhibitedHits("A fine deal", ["", "  ", "cheapest"])).toEqual([]);
  });
});

describe("promotionChannel", () => {
  it("reads the channel from the template key", () => {
    expect(promotionChannel("offer-instagram-post")).toBe("instagram");
    expect(promotionChannel("offer-google-post")).toBe("google");
  });
});
