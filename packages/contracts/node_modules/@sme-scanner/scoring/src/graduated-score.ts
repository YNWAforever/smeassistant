export type CurveDirection = "higher_is_better" | "lower_is_better";

export interface CreditOptions {
  /**
   * "higher_is_better" only. The value below which credit is 0. Default 0.
   * Override when 0 isn't a real achievable worst case — e.g. a Google
   * rating is never below 1.0, so a floor of 0 would let the worst real
   * case compute as ~22% credit instead of 0%, silently breaking the
   * "worst case scores exactly as badly as today" guarantee for that check.
   */
  floor?: number;
  /**
   * "lower_is_better" only. The value at or beyond which credit is 0.
   * Default 2 * target. Override to at least today's existing hard cutoff
   * when that cutoff is further out than 2 * target — otherwise the curve
   * bottoms out to the full deduction before reaching today's cutoff,
   * which is harsher than today for the zone in between.
   */
  ceiling?: number;
}

/**
 * 0 at the worst case, 1 at (or before) the target. Never outside [0, 1].
 *
 * "higher_is_better": credit rises linearly from `floor` (default 0) to
 * `target`, then stays at 1 beyond it. "lower_is_better": credit stays at 1
 * for every `value` at or below `target` — nothing to fix yet — then falls
 * linearly from 1 to 0 between `target` and `ceiling` (default 2 * target).
 * `target` must be the boundary where a finding stops firing in BOTH
 * directions; a lower_is_better curve that started ramping down from 0
 * instead of from `target` would still deduct points at the target itself.
 */
export function creditFraction(
  value: number,
  target: number,
  direction: CurveDirection,
  options: CreditOptions = {},
): number {
  if (direction === "higher_is_better") {
    const floor = options.floor ?? 0;
    const span = target - floor;
    if (span <= 0) return value >= target ? 1 : 0;
    return Math.max(0, Math.min(1, (value - floor) / span));
  }
  if (value <= target) return 1;
  const ceiling = options.ceiling ?? target * 2;
  const span = ceiling - target;
  if (span <= 0) return value >= ceiling ? 0 : 1;
  return Math.max(0, Math.min(1, 1 - (value - target) / span));
}

/** Rounded deduction: maxDeduction (a positive magnitude) at credit 0, 0 at credit 1. */
export function gradedDeduction(maxDeduction: number, credit: number): number {
  return Math.round(maxDeduction - maxDeduction * credit);
}

/**
 * Derives a target from an existing per-industry average — never hand-authored
 * separately, so there is exactly one number per metric to keep honest.
 *
 * Unbounded metrics double (higher_is_better) or halve (lower_is_better) the
 * average. A bounded metric (a rating out of 5, a rate out of 100) instead
 * targets the midpoint between the average and its ceiling — doubling a
 * rating average of 4.0 would demand an impossible 8.0.
 */
export function deriveTarget(
  average: number,
  direction: CurveDirection,
  options: { ceiling?: number } = {},
): number {
  if (options.ceiling !== undefined) {
    // Assumes higher_is_better geometry (target sits between average and
    // ceiling, above average). No current caller passes a bounded
    // lower_is_better metric; this would need revisiting if one appears.
    return average + (options.ceiling - average) / 2;
  }
  return direction === "higher_is_better" ? average * 2 : average / 2;
}
