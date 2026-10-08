import { expect, it } from "vitest";
import { offerDatesMissing, offerPriceMismatch, type OfferEvidence } from "./offer-checks";
const offer: OfferEvidence = { title: "Fixture", details: "Confirmed only", terms: "Dine in", price: { amount: 88, currency: "HKD" }, valid_from: "2026-10-05", valid_until: "2026-10-19", claims: [], photo_alt_text: null };
it.each(["NT$88", "US$88", "USD 88", "88美元", "$88", "88元"])("warns on wrong or ambiguous currency: %s", body => expect(offerPriceMismatch(body, offer)).toBe(true));
it.each(["HK$88", "HKD 88.00", "88港元", "88蚊"])("accepts matching HKD amount and currency: %s", body => expect(offerPriceMismatch(body, offer)).toBe(false));
it.each(["2026-10-05", "19 Oct", "2025年10月5日至2025年10月19日", "5/10/2025 to 19/10/2025", "5 Oct 2025 to 19 October 2025", "Oct 5, 2025 to Oct 19, 2025"])("requires both correct validity boundaries: %s", body => expect(offerDatesMissing(body, offer)).toBe(true));
it.each(["2026-10-05 to 2026-10-19", "10月5日至10月19日", "5/10 to 19/10", "5 Oct to 19 October", "Oct 5 to Oct 19"])("accepts full same-year date range: %s", body => expect(offerDatesMissing(body, offer)).toBe(false));
it.each([
  "5 Oct to 19 Oct (2025)",
  "Oct 5 to Oct 19 (2025)",
  "5/10 to 19/10 (2025)",
  "10月5日至10月19日（2025年）",
  "10月5日至10月19日 (2025年)",
  "(2025) 5 Oct to 19 Oct",
  "（2025年）10月5日至10月19日",
  "5 Oct (2025) to 19 Oct (2026)",
  "2026-10-05 to 2026-10-19 (2025)",
  "5 Oct 2025 to 19 Oct 2025 (2026)",
])("warns on a conflicting parenthesized boundary year: %s", body => expect(offerDatesMissing(body, offer)).toBe(true));
it.each([
  "5 Oct to 19 Oct (2026)",
  "10月5日至10月19日（2026年）",
  "(2026) 5 Oct to 19 Oct",
  "（2026年）10月5日至10月19日",
  "Family-run since (2019). Offer: 5 Oct to 19 Oct.",
  "5 Oct to 19 Oct. Established (2019).",
])("accepts correct boundary years without treating unrelated years as validity: %s", body => expect(offerDatesMissing(body, offer)).toBe(false));
it("accepts individually qualified cross-year boundaries", () => {
  expect(offerDatesMissing("30 Dec (2026) to 2 Jan (2027)", { ...offer, valid_from: "2026-12-30", valid_until: "2027-01-02" })).toBe(false);
});
it("requires years for a cross-year offer and permits a one-day offer", () => {
  const cross = { ...offer, valid_from: "2026-12-30", valid_until: "2027-01-02" };
  expect(offerDatesMissing("12月30日至1月2日", cross)).toBe(true);
  expect(offerDatesMissing("2026年12月30日至2027年1月2日", cross)).toBe(false);
  expect(offerDatesMissing("2026-10-05", { ...offer, valid_until: offer.valid_from })).toBe(false);
  expect(offerDatesMissing("2026-02-30", { ...offer, valid_from: "2026-02-30", valid_until: "2026-02-30" })).toBe(true);
});
