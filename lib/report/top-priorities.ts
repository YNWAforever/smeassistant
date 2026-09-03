import { WEIGHTS, type ModuleKey } from "@sme-scanner/scoring";

export interface PriorityFinding {
  finding_key: string;
  score_impact: number | null;
  module: string;
}

/**
 * A finding's score_impact is module-relative (it subtracts from that
 * module's own 0-100 score). The headline score is a weighted average
 * (see WEIGHTS in @sme-scanner/scoring), so a finding's real effect on the
 * headline is score_impact * WEIGHTS[module]. Ranking by raw score_impact
 * can put a smaller real deficit ahead of a larger one -- e.g. a -15 aeo
 * finding (weighted -3.75) outranking a -12 gbp finding (weighted -4.20).
 */
function weightedImpact(finding: PriorityFinding): number {
  const weight = WEIGHTS[finding.module as ModuleKey] ?? 0;
  return Math.abs(finding.score_impact ?? 0) * weight;
}

/** Select only real measured deficits; bonuses and informational rows are never owner priorities. */
export function selectTopPriorities<T extends PriorityFinding>(findings: readonly T[], limit = 3): T[] {
  return findings
    .filter((finding) => (finding.score_impact ?? 0) < 0)
    .sort((left, right) => {
      const impactDifference = weightedImpact(right) - weightedImpact(left);
      return impactDifference || left.finding_key.localeCompare(right.finding_key);
    })
    .slice(0, limit);
}