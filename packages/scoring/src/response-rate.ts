/**
 * Owner-response rate is only a valid statistic when the scraped review sample
 * covers the whole population. Google Places typically returns at most ~5
 * reviews; if reviews_count (the population) is unknown or larger than the
 * sample, no rate can be estimated — a sample numerator over a mismatched
 * denominator is not a rate, in either direction. gbp.ts and trust.ts both
 * need this same measurability rule, so it lives here once rather than
 * drifting apart between the two call sites.
 */
export interface OwnerResponseReview {
  owner_response?: string | null;
}

export interface OwnerResponseRateResult {
  measurable: boolean;
  rate: number | null;
  respondedCount: number;
}

export function computeOwnerResponseRate(
  reviews: readonly OwnerResponseReview[],
  reviewsCount: number | null | undefined,
): OwnerResponseRateResult {
  const sampleSize = reviews.length;
  const measurable = reviewsCount != null && sampleSize >= reviewsCount;

  if (!measurable) {
    return { measurable: false, rate: null, respondedCount: 0 };
  }

  const respondedCount = reviews.filter(
    (r) => r.owner_response !== undefined && r.owner_response !== null && r.owner_response !== "",
  ).length;

  return {
    measurable: true,
    rate: sampleSize > 0 ? respondedCount / sampleSize : 0,
    respondedCount,
  };
}
