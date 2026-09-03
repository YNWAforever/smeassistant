import type { Market } from "@sme-scanner/region";
import { PLACE_TYPE_TERMS_TW } from "./place-type-terms-tw";

// Map common Google Place types to a natural Hong Kong search term. Extend as new verticals appear.
const PLACE_TYPE_TERMS_HK: Record<string, string> = {
  cafe: "咖啡店",
  coffee_shop: "咖啡店",
  restaurant: "餐廳",
  chinese_restaurant: "中菜",
  cha_chaan_teng: "茶餐廳",
  bakery: "麵包店",
  bar: "酒吧",
  meal_takeaway: "外賣店",
  beauty_salon: "美容院",
  hair_care: "髮型屋",
  spa: "spa",
  gym: "健身室",
  clothing_store: "服裝店",
  florist: "花店",
  store: "店",
};

// English counterpart used for English-language discovery queries (tourist / expat search behaviour).
const PLACE_TYPE_TERMS_EN: Record<string, string> = {
  cafe: "cafe",
  coffee_shop: "coffee shop",
  restaurant: "restaurant",
  chinese_restaurant: "Chinese restaurant",
  cha_chaan_teng: "Hong Kong cafe",
  bakery: "bakery",
  bar: "bar",
  meal_takeaway: "takeaway",
  beauty_salon: "beauty salon",
  hair_care: "hair salon",
  spa: "spa",
  gym: "gym",
  clothing_store: "clothing store",
  florist: "florist",
  store: "shop",
};

// Broad English term per industry value (the DB stores the Cantonese industry value).
const INDUSTRY_TERMS_EN: Record<string, string> = {
  餐飲: "restaurant",
  美容: "beauty salon",
  診所: "clinic",
  本地服務: "local services",
  零售: "shop",
  其他: "local business",
};

// Resolve the most specific natural search term:
// mapped place-type -> de-underscored raw type -> broad industry -> generic fallback.
export function resolveSearchTerm(
  categories: string[] | undefined,
  industry: string,
  market: Market,
): string {
  const terms = market === "tw" ? PLACE_TYPE_TERMS_TW : PLACE_TYPE_TERMS_HK;
  for (const type of categories ?? []) {
    const mapped = terms[type.toLowerCase()];
    if (mapped) return mapped;
  }
  const firstType = (categories ?? [])[0];
  if (firstType) return firstType.replace(/_/g, " ");
  return industry.trim() || "本地服務";
}

// English equivalent of resolveSearchTerm. `industry` is the Cantonese industry value (e.g. "餐飲");
// Google Place types are already English, so the de-underscored raw type is a usable fallback.
export function resolveSearchTermEn(categories: string[] | undefined, industry: string): string {
  for (const type of categories ?? []) {
    const mapped = PLACE_TYPE_TERMS_EN[type.toLowerCase()];
    if (mapped) return mapped;
  }
  const firstType = (categories ?? [])[0];
  if (firstType) return firstType.replace(/_/g, " ");
  return INDUSTRY_TERMS_EN[industry.trim()] ?? "local services";
}
