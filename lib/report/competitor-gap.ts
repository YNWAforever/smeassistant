/**
 * The only claim this phase is allowed to make (spec §5): arithmetic over two
 * collected values. No forecast, no uplift, no "if you match them you will get".
 *
 * A missing own-side value is `not_comparable`, never zero — the merchant having
 * no confident match in the run is a different fact from having no reviews, and
 * collapsing the two would publish a gap the scan never measured.
 *
 * A missing own-side value itself splits into two different facts, so it needs
 * two reasons: never being confidently matched this run (`no_own_match`) versus
 * being matched but this run predating review-count collection (`no_own_data` —
 * every job scanned before this feature has `maps_rank` set with no
 * `maps_reviews`/`maps_rating` keys at all). Collapsing them produced a visible
 * self-contradiction on every pre-existing report: "found: ✓" directly above "you
 * were not confidently matched". The caller supplies `ownMatched` (from whether
 * `maps_rank` is present) so this stays a pure arithmetic function with no
 * knowledge of the raw scan payload shape.
 */
export type CompetitorGap =
  | { kind: "comparable"; difference: number; leader: "own" | "competitor" | "none" }
  | { kind: "not_comparable"; reason: "no_own_match" | "no_own_data" | "no_competitor_value" };

export function competitorGap(input: { own: number | null; ownMatched: boolean; competitor: number | null }): CompetitorGap {
  if (input.own === null) return { kind: "not_comparable", reason: input.ownMatched ? "no_own_data" : "no_own_match" };
  if (input.competitor === null) return { kind: "not_comparable", reason: "no_competitor_value" };

  const difference = Math.abs(input.competitor - input.own);
  if (difference === 0) return { kind: "comparable", difference: 0, leader: "none" };
  return { kind: "comparable", difference, leader: input.competitor > input.own ? "competitor" : "own" };
}
