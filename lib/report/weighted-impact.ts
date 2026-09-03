import { WEIGHTS, type ModuleKey } from "@sme-scanner/scoring";

/**
 * A finding's score_impact is module-relative (it subtracts from that
 * module's own 0-100 score). The headline score is a weighted average (see
 * WEIGHTS in @sme-scanner/scoring), so a finding's real effect on the
 * headline is score_impact * WEIGHTS[module] -- imported from the scoring
 * package rather than re-declared here, so the two never drift apart.
 */

/** The finding's real effect on the headline score, unrounded. */
export function weightedImpact(scoreImpact: number, module: string): number {
  return scoreImpact * (WEIGHTS[module as ModuleKey] ?? 0);
}

/**
 * Formats to one decimal place, rounding half away from zero (so -3.75
 * becomes "-3.8", matching how a reader would expect a magnitude to round),
 * then strips a trailing ".0" so a whole number reads as "-6" rather than
 * "-6.0".
 */
export function formatWeightedImpact(scoreImpact: number, module: string): string {
  const weighted = weightedImpact(scoreImpact, module);
  const roundedMagnitude = Math.round(Math.abs(weighted) * 10) / 10;
  const rounded = weighted < 0 ? -roundedMagnitude : roundedMagnitude;
  const fixed = (rounded === 0 ? 0 : rounded).toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}
