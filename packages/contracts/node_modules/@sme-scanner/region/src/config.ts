// Single source of truth for market-varying values.
// Locale (UI language) is decoupled from Market (geo/business context):
//   zh-TW -> tw market; zh-HK / en -> hk market.
// MUST NOT import i18n/routing.ts (cycle); Locale/Market are plain unions here.
import { INDUSTRIES_HK, INDUSTRIES_TW, DISTRICTS_HK, DISTRICTS_TW } from "./lists";

export type Market = "hk" | "tw";
type Loc = "zh-HK" | "en" | "zh-TW";

export type MarketContactChannel = "whatsapp" | "line" | "phone" | "email";

export interface MarketCta {
  id: "contact_whatsapp" | "contact_line" | "contact_phone" | "contact_email";
  channel: MarketContactChannel;
  href: string;
}

export interface MarketPricing {
  amount: number;
  currency: "HKD" | "TWD";
  unit: "per_location_per_month";
}

function configuredEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function verifiedE164(value: string, countryCode: "+852" | "+886"): string | null {
  if (!/^\+[1-9]\d{7,14}$/.test(value) || !value.startsWith(countryCode)) return null;
  const subscriber = value.slice(countryCode.length);
  if (!/^\d{8,10}$/.test(subscriber) || /^0+$/.test(subscriber)) return null;
  return value;
}

function verifiedEmail(value: string): string | null {
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value.toLowerCase();
}

function verifiedLineUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || (host !== "line.me" && host !== "www.line.me")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getMarketCtas(market: Market): MarketCta[] {
  const countryCode = market === "hk" ? "+852" : "+886";
  const ctas: MarketCta[] = [];
  if (market === "hk") {
    const whatsapp = verifiedE164(configuredEnv("NEXT_PUBLIC_HK_WHATSAPP_NUMBER"), countryCode);
    if (whatsapp) ctas.push({ id: "contact_whatsapp", channel: "whatsapp", href: `https://wa.me/${whatsapp.slice(1)}` });
  } else {
    const line = verifiedLineUrl(configuredEnv("NEXT_PUBLIC_TW_LINE_URL"));
    if (line) ctas.push({ id: "contact_line", channel: "line", href: line });
  }
  const phone = verifiedE164(configuredEnv(market === "hk" ? "NEXT_PUBLIC_HK_PHONE_NUMBER" : "NEXT_PUBLIC_TW_PHONE_NUMBER"), countryCode);
  if (phone) ctas.push({ id: "contact_phone", channel: "phone", href: `tel:${phone}` });
  const email = verifiedEmail(configuredEnv(market === "hk" ? "NEXT_PUBLIC_HK_CONTACT_EMAIL" : "NEXT_PUBLIC_TW_CONTACT_EMAIL"));
  if (email) ctas.push({ id: "contact_email", channel: "email", href: `mailto:${email}` });
  return ctas;
}

export interface IndustryOption {
  value: string; // STABLE benchmark key — identical across markets
  label: string;
  labelEn: string;
}
export interface DistrictOption {
  zh: string;
  en: string;
  // District-level SerpAPI anchors — same semantics as MarketConfig.serpLocation /
  // mapsLl, but emulating a searcher physically inside this district. Optional:
  // districts absent from SerpAPI's locations DB fall back to the market-level values.
  serpLocation?: string;
  mapsLl?: string;
}

export type MerchantSearchLanguage = "en" | "zh-hk" | "zh-tw";

export interface MerchantSearchOrigin {
  terms: readonly string[];
  ll: string;
}

export interface MerchantSearchMarketConfig {
  code: "HK" | "TW";
  labelZh: string;
  labelEn: string;
  countryName: string;
  gl: "hk" | "tw";
  defaultLanguage: MerchantSearchLanguage;
  alternateLanguage: "en";
  ll: string;
  fallbackTerms: readonly string[];
  currency: "HKD" | "TWD";
  origins: readonly MerchantSearchOrigin[];
}

export interface MarketConfig {
  market: Market;
  gl: string; // Google geo
  googleLanguage: "zh-TW"; // Traditional Chinese for both markets
  geoLabelEn: string; // 'Hong Kong' | 'Taiwan'
  geoLabelZh: string; // '香港' | '台灣'
  // SerpAPI geo anchoring — distinct from the display labels above.
  // serpLocation MUST be a canonical name from https://serpapi.com/locations.json;
  // localized labels (香港/台灣) are rejected with "Unsupported location".
  serpLocation: string;
  // google_maps `ll` search origin (@lat,lng,zoom). Maps searches ignore gl, so
  // without this an ambiguous district (e.g. 中西區) can geocode to the wrong country.
  mapsLl: string;
  merchantSearch: MerchantSearchMarketConfig;
  contact: {
    channel: "whatsapp" | "line";
    href: string;
    phonePlaceholder: string;
  };
  ctas: MarketCta[];
  fontStack: string[];
  brandFooterEn: string;
  industries: IndustryOption[];
  districts: DistrictOption[];
  pricing: MarketPricing;
}

export const MARKETS: Record<Market, MarketConfig> = {
  hk: {
    market: "hk",
    gl: "hk",
    googleLanguage: "zh-TW",
    geoLabelEn: "Hong Kong",
    geoLabelZh: "香港",
    serpLocation: "Hong Kong",
    mapsLl: "@22.3193039,114.1693611,11z",
    merchantSearch: {
      code: "HK",
      labelZh: "香港",
      labelEn: "Hong Kong",
      countryName: "Hong Kong",
      gl: "hk",
      defaultLanguage: "zh-hk",
      alternateLanguage: "en",
      ll: "@22.3193,114.1694,12z",
      fallbackTerms: ["Hong Kong", "香港"],
      currency: "HKD",
      origins: [
        { terms: ["Central", "中環", "中西區"], ll: "@22.2819,114.1582,15z" },
        { terms: ["Causeway Bay", "銅鑼灣"], ll: "@22.2802,114.1849,15z" },
        { terms: ["Wan Chai", "灣仔"], ll: "@22.2770,114.1723,15z" },
        { terms: ["Tsim Sha Tsui", "尖沙咀"], ll: "@22.2988,114.1722,15z" },
        { terms: ["Mong Kok", "旺角"], ll: "@22.3193,114.1694,15z" },
        { terms: ["Happy Valley", "跑馬地"], ll: "@22.2691,114.1844,15z" },
      ],
    },
    contact: {
      channel: "whatsapp",
      href: getMarketCtas("hk").find((cta) => cta.channel === "whatsapp")?.href ?? "",
      phonePlaceholder: "852 9123 4567",
    },
    ctas: getMarketCtas("hk"),
    fontStack: ['"PingFang HK"', '"Microsoft JhengHei"', '"Noto Sans HK"'],
    brandFooterEn: "Hong Kong SMEs",
    industries: INDUSTRIES_HK,
    districts: DISTRICTS_HK,
    pricing: { amount: 888, currency: "HKD", unit: "per_location_per_month" },
  },
  tw: {
    market: "tw",
    gl: "tw",
    googleLanguage: "zh-TW",
    geoLabelEn: "Taiwan",
    geoLabelZh: "台灣",
    serpLocation: "Taiwan",
    mapsLl: "@23.69781,120.960515,8z",
    merchantSearch: {
      code: "TW",
      labelZh: "台灣",
      labelEn: "Taiwan",
      countryName: "Taiwan",
      gl: "tw",
      defaultLanguage: "zh-tw",
      alternateLanguage: "en",
      ll: "@23.6978,120.9605,7z",
      fallbackTerms: ["Taiwan", "台灣"],
      currency: "TWD",
      origins: [
        { terms: ["New Taipei", "新北", "新北市"], ll: "@25.0169,121.4628,11z" },
        { terms: ["Taipei", "台北", "臺北", "台北市", "臺北市"], ll: "@25.0330,121.5654,12z" },
        { terms: ["Taichung", "台中", "臺中"], ll: "@24.1477,120.6736,11z" },
        { terms: ["Tainan", "台南", "臺南"], ll: "@22.9999,120.2269,11z" },
        { terms: ["Kaohsiung", "高雄"], ll: "@22.6273,120.3014,11z" },
      ],
    },
    contact: {
      channel: "line",
      href: getMarketCtas("tw").find((cta) => cta.channel === "line")?.href ?? "",
      phonePlaceholder: "0912 345 678",
    },
    ctas: getMarketCtas("tw"),
    fontStack: ['"PingFang TC"', '"Microsoft JhengHei"', '"Noto Sans TC"'],
    brandFooterEn: "Taiwan SMEs",
    industries: INDUSTRIES_TW,
    districts: DISTRICTS_TW,
    pricing: { amount: 2800, currency: "TWD", unit: "per_location_per_month" },
  },
};

export function localeToMarket(locale: Loc): Market {
  return locale === "zh-TW" ? "tw" : "hk";
}

export function getMarketConfig(localeOrMarket: Loc | Market): MarketConfig {
  const market = localeOrMarket === "hk" || localeOrMarket === "tw" ? localeOrMarket : localeToMarket(localeOrMarket);
  const config = MARKETS[market];
  const ctas = getMarketCtas(market);
  return {
    ...config,
    ctas,
    contact: {
      ...config.contact,
      href: ctas.find((cta) => cta.channel === config.contact.channel)?.href ?? "",
    },
  };
}

const ALL_LOCALES: Loc[] = ["zh-HK", "en", "zh-TW"];

export function resolveServedLocales(env: string | undefined): {
  locales: Loc[];
  defaultLocale: Loc;
} {
  if (env === "tw") return { locales: ["zh-TW"], defaultLocale: "zh-TW" };
  if (env === "hk") return { locales: ["zh-HK", "en"], defaultLocale: "zh-HK" };
  return { locales: ALL_LOCALES, defaultLocale: "zh-HK" };
}

const served = resolveServedLocales(process.env.NEXT_PUBLIC_REGION);
export const servedLocales: Loc[] = served.locales;
export const defaultServedLocale: Loc = served.defaultLocale;

export const LOCALE_LABELS: Record<Loc, string> = {
  "zh-HK": "廣東話",
  en: "English",
  "zh-TW": "國語",
};
