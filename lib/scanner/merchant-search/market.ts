import { getMarketConfig, type MerchantSearchMarketConfig } from "@sme-scanner/region";

export type MerchantSearchMarket = "HK" | "TW";
export type MerchantSearchLocale = "en" | "zh-HK" | "zh-TW";

export function defaultMerchantSearchMarket(_locale: MerchantSearchLocale): MerchantSearchMarket {
  return "HK";
}

export function merchantSearchMarket(market: MerchantSearchMarket): MerchantSearchMarketConfig {
  return getMarketConfig(market.toLowerCase() as "hk" | "tw").merchantSearch;
}

export function resolveMerchantSearchOrigin(input: {
  market: MerchantSearchMarket;
  queryTerms: string;
  explicitCoordinates?: { latitude: number; longitude: number; zoom: number };
}): string {
  if (input.explicitCoordinates) {
    const { latitude, longitude, zoom } = input.explicitCoordinates;
    return `@${latitude},${longitude},${zoom}z`;
  }

  const config = merchantSearchMarket(input.market);
  const normalizedQuery = input.queryTerms.normalize("NFKC").toLocaleLowerCase("en");
  const matchedOrigin = config.origins.find((origin) =>
    origin.terms.some((term) => normalizedQuery.includes(term.normalize("NFKC").toLocaleLowerCase("en"))),
  );
  return matchedOrigin?.ll ?? config.ll;
}
