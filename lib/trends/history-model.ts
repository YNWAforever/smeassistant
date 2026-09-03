/**
 * One stored diff, shaped for display. Shared by the staff console and the
 * owner dashboard so both describe a month the same way.
 */
export interface StoredDiff {
  comparable: boolean;
  incomparable_reason: string | null;
  composite_withheld_reason: string | null;
  composite_base: number | null;
  composite_head: number | null;
  composite_delta: number | null;
  resolved_findings: string[];
  regressed_findings: string[];
  decayed_findings: string[];
  lost_coverage: string[];
  gained_coverage: string[];
  created_at: string;
}

export type TrendDirection = "improved" | "declined" | "unchanged" | "unavailable" | "none";

export interface TrendModel {
  direction: TrendDirection;
  /** False means no score may be rendered — not even a dash implying zero. */
  showScores: boolean;
  base: number | null;
  head: number | null;
  delta: number | null;
  /** The engine's own code, for a message catalogue to translate. */
  reasonCode: string | null;
  resolved: string[];
  regressed: string[];
  decayed: string[];
  lostCoverage: string[];
  gainedCoverage: string[];
  resolvedCount: number;
  regressedCount: number;
  comparedAt: string | null;
}

/**
 * Built fresh per call rather than shared. A single exported constant would
 * hand every "no diff yet" caller the same arrays, so one caller pushing into
 * `model.resolved` would poison every later merchant's empty state.
 */
function emptyModel(): TrendModel {
  return {
    direction: "none",
    showScores: false,
    base: null,
    head: null,
    delta: null,
    reasonCode: null,
    resolved: [],
    regressed: [],
    decayed: [],
    lostCoverage: [],
    gainedCoverage: [],
    resolvedCount: 0,
    regressedCount: 0,
    comparedAt: null,
  };
}

export function buildTrendModel(diff: StoredDiff | null): TrendModel {
  if (!diff) return emptyModel();

  const showScores = diff.comparable && diff.composite_delta !== null;

  let direction: TrendDirection = "unavailable";
  if (showScores) {
    const delta = diff.composite_delta as number;
    direction = delta > 0 ? "improved" : delta < 0 ? "declined" : "unchanged";
  }

  return {
    direction,
    showScores,
    base: showScores ? diff.composite_base : null,
    head: showScores ? diff.composite_head : null,
    delta: showScores ? diff.composite_delta : null,
    // Incomparability outranks a withheld composite: it is the stronger claim.
    reasonCode: diff.incomparable_reason ?? diff.composite_withheld_reason,
    // Findings survive a withheld composite — only the single number is unsafe.
    // They do NOT survive incomparability, which means nothing was fairly compared.
    resolved: diff.comparable ? diff.resolved_findings : [],
    regressed: diff.comparable ? diff.regressed_findings : [],
    decayed: diff.comparable ? diff.decayed_findings : [],
    lostCoverage: diff.comparable ? diff.lost_coverage : [],
    gainedCoverage: diff.comparable ? diff.gained_coverage : [],
    resolvedCount: diff.comparable ? diff.resolved_findings.length : 0,
    regressedCount: diff.comparable ? diff.regressed_findings.length : 0,
    comparedAt: diff.created_at,
  };
}
