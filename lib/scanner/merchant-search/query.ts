import type { MerchantSearchLanguage, MerchantSearchOrigin } from "@sme-scanner/region";
import { merchantSearchMarket, type MerchantSearchMarket } from "./market";

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const MEANINGFUL = /[\p{L}\p{N}]/gu;

export function normalizeMerchantQuery(input: string): string {
  return input.normalize("NFKC").replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
}

export function merchantQueryComparisonKey(input: string): string {
  return normalizeMerchantQuery(input).toLocaleLowerCase("en");
}

export function countMeaningfulCharacters(input: string): number {
  return normalizeMerchantQuery(input).match(MEANINGFUL)?.length ?? 0;
}

export function detectMerchantQueryLanguage(
  input: string,
  market: MerchantSearchMarket,
): MerchantSearchLanguage {
  return /\p{Script=Han}/u.test(normalizeMerchantQuery(input))
    ? merchantSearchMarket(market).defaultLanguage
    : "en";
}

export function detectMerchantLocation(
  input: string,
  market: MerchantSearchMarket,
): MerchantSearchOrigin | null {
  const comparison = merchantQueryComparisonKey(input);
  return merchantSearchMarket(market).origins.find((origin) =>
    origin.terms.some((term) => comparison.includes(merchantQueryComparisonKey(term))),
  ) ?? null;
}

const LEGAL_SUFFIXES: Record<MerchantSearchMarket, readonly RegExp[]> = {
  HK: [
    /\s*(?:limited|ltd\.?)$/iu,
    /\s*(?:有限公司|有限責任公司)$/u,
  ],
  TW: [
    /\s*(?:limited|ltd\.?|co\.?,?\s*ltd\.?)$/iu,
    /\s*(?:股份有限公司|有限公司|有限責任公司)$/u,
  ],
};

export function withoutRecognizedLegalSuffix(input: string, market: MerchantSearchMarket): string {
  const normalized = normalizeMerchantQuery(input);
  for (const suffix of LEGAL_SUFFIXES[market]) {
    if (suffix.test(normalized)) return normalizeMerchantQuery(normalized.replace(suffix, ""));
  }
  return normalized;
}

export function hasMerchantMarketTerm(input: string, market: MerchantSearchMarket): boolean {
  const comparison = merchantQueryComparisonKey(input);
  return merchantSearchMarket(market).fallbackTerms.some((term) =>
    comparison.includes(merchantQueryComparisonKey(term)),
  );
}
