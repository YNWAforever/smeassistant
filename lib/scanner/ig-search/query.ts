import type { MerchantSearchMarket } from "../merchant-search/market";
import { merchantSearchMarket } from "../merchant-search/market";
import {
  countMeaningfulCharacters,
  hasMerchantMarketTerm,
  normalizeMerchantQuery,
  withoutRecognizedLegalSuffix,
} from "../merchant-search/query";

export function buildInstagramSearchQuery(input: {
  businessName: string;
  market: MerchantSearchMarket;
  district?: string;
}): string {
  const name = withoutRecognizedLegalSuffix(input.businessName, input.market);
  if (countMeaningfulCharacters(name) < 1) return "";
  // Quotes are stripped rather than escaped: Google has no escape syntax inside
  // a phrase operator, so a name containing `"` would otherwise let the caller
  // close the phrase and append operators of their own.
  const phrase = name.replace(/"/g, "");
  const district = normalizeMerchantQuery(input.district ?? "");

  const parts = ["site:instagram.com", `"${phrase}"`];
  if (district) parts.push(district);

  const marketTerm = merchantSearchMarket(input.market).fallbackTerms[0];
  if (marketTerm && !hasMerchantMarketTerm(`${phrase} ${district}`, input.market)) {
    parts.push(marketTerm);
  }
  return parts.join(" ");
}
