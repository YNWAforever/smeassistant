import type { FindingKey, ModuleKey, ModuleStatus } from "./types";

/**
 * Comparing two scans of the same merchant.
 *
 * This is the most dangerous computation in the monitoring product, because every
 * naive version of it lies in a way that reads as good news.
 *
 * Three traps it exists to avoid:
 *
 * 1. NEVER subtract overall_score. It is a coverage-NORMALIZED weighted mean
 *    (`weighted / coverage`), so two scans computed over different measured sets
 *    are on different denominators. The coupling is also non-monotonic: losing a
 *    WEAK module RAISES the composite. And score_coverage cannot rescue it —
 *    with weights .30/.35/.25/.10 the sums collide ({aeo,trust} = {gbp} = 0.35;
 *    {ig,aeo,trust} = {ig,gbp} = 0.65), so the stored number does not identify
 *    which modules were measured.
 *
 * 2. NEVER set-difference findings across the whole scan. Every scorer's
 *    unavailable branch returns `findings: []`, and the processor preserves it.
 *    So one RapidAPI outage would congratulate a paying merchant on "fixing"
 *    eight Instagram problems they never touched.
 *
 * 3. NEVER compare across scoring versions. A version bump means the rules
 *    changed, so a delta measures our code, not their business. Rows written
 *    before scoring_version existed carry NULL and are equally incomparable.
 *
 * Pure by construction: no env, no fetch, no clock, no Supabase — consistent with
 * the rest of this package.
 */

const WEIGHTS: Record<ModuleKey, number> = {
  ig: 0.3,
  gbp: 0.35,
  aeo: 0.25,
  trust: 0.1,
};

/** Trust is derived from IG and GBP, so it is not an independent acquisition channel. */
const INDEPENDENT_CHANNELS: ModuleKey[] = ["ig", "gbp", "aeo"];

const MODULE_KEYS = Object.keys(WEIGHTS) as ModuleKey[];

/**
 * Findings whose trigger is elapsed time, not merchant behaviour. A merchant who
 * changes nothing acquires these simply by waiting, so reporting them as
 * regressions would blame someone for the calendar — and, once alerts exist, page
 * them about it.
 */
const DECAY_FINDING_KEYS = new Set<string>([
  "ig.content_consistency",
  "gbp.review_freshness",
  "gbp.photos_freshness",
  "trust.review_recency",
]);

export interface ScanDiffModule {
  status: ModuleStatus;
  score: number | null;
  findingKeys: FindingKey[];
}

export interface ScanDiffInput {
  /** audit_jobs.scoring_version. NULL for rows written before it existed. */
  scoringVersion: string | null;
  modules: Partial<Record<ModuleKey, ScanDiffModule>>;
}

export type ScanDiffIncomparableReason =
  | "SCORING_VERSION_UNKNOWN"
  | "SCORING_VERSION_MISMATCH"
  | "NO_SHARED_MEASURED_MODULE";

export interface ScanDiff {
  /** False means no field below carries meaning except incomparableReason. */
  comparable: boolean;
  incomparableReason: ScanDiffIncomparableReason | null;
  /** Modules measured with a usable score on BOTH sides. The only fair basis. */
  intersectionModules: ModuleKey[];
  /** Composites recomputed over the intersection alone. Null when withheld. */
  compositeBase: number | null;
  compositeHead: number | null;
  compositeDelta: number | null;
  /** Why a composite was withheld even though the scans are comparable. */
  compositeWithheldReason: "INSUFFICIENT_INDEPENDENT_CHANNELS" | null;
  /** Present in base, gone in head — only for modules measured on both sides. */
  resolvedFindings: FindingKey[];
  /** New in head, and genuinely merchant-driven. */
  regressedFindings: FindingKey[];
  /** New in head, but triggered by elapsed time rather than a change. */
  decayedFindings: FindingKey[];
  /** Measured before, not now. Its findings are unknown, not fixed. */
  lostCoverage: ModuleKey[];
  /** Not measured before, measured now. Its findings are new to us, not new. */
  gainedCoverage: ModuleKey[];
}

function measuredModules(input: ScanDiffInput): Set<ModuleKey> {
  const measured = new Set<ModuleKey>();
  for (const key of MODULE_KEYS) {
    const module = input.modules[key];
    if (module && module.status === "measured" && module.score !== null) measured.add(key);
  }
  return measured;
}

/**
 * Weighted mean over the given modules, renormalized by their summed weight, and
 * withheld unless at least two independent channels are present — the same rule
 * scoreAll applies, so a delta is never held to a weaker standard than the score.
 */
function compositeOver(
  input: ScanDiffInput,
  modules: ModuleKey[],
): { value: number | null; withheld: "INSUFFICIENT_INDEPENDENT_CHANNELS" | null } {
  const independent = modules.filter((key) => INDEPENDENT_CHANNELS.includes(key)).length;
  const coverage = modules.reduce((total, key) => total + WEIGHTS[key], 0);
  if (independent < 2 || coverage === 0) return { value: null, withheld: "INSUFFICIENT_INDEPENDENT_CHANNELS" };
  const weighted = modules.reduce((total, key) => total + (input.modules[key]?.score ?? 0) * WEIGHTS[key], 0);
  return { value: Math.round(weighted / coverage), withheld: null };
}

function incomparable(reason: ScanDiffIncomparableReason): ScanDiff {
  return {
    comparable: false,
    incomparableReason: reason,
    intersectionModules: [],
    compositeBase: null,
    compositeHead: null,
    compositeDelta: null,
    compositeWithheldReason: null,
    resolvedFindings: [],
    regressedFindings: [],
    decayedFindings: [],
    lostCoverage: [],
    gainedCoverage: [],
  };
}

/**
 * @param base the earlier scan
 * @param head the later scan
 */
export function diffScans(base: ScanDiffInput, head: ScanDiffInput): ScanDiff {
  if (base.scoringVersion === null || head.scoringVersion === null) {
    return incomparable("SCORING_VERSION_UNKNOWN");
  }
  if (base.scoringVersion !== head.scoringVersion) {
    return incomparable("SCORING_VERSION_MISMATCH");
  }

  const baseMeasured = measuredModules(base);
  const headMeasured = measuredModules(head);
  const intersection = MODULE_KEYS.filter((key) => baseMeasured.has(key) && headMeasured.has(key));

  if (intersection.length === 0) {
    // Two scans of the same merchant sharing no measured module have nothing
    // comparable in them at all — not even a per-module finding delta.
    return incomparable("NO_SHARED_MEASURED_MODULE");
  }

  const baseComposite = compositeOver(base, intersection);
  const headComposite = compositeOver(head, intersection);
  const delta =
    baseComposite.value !== null && headComposite.value !== null
      ? headComposite.value - baseComposite.value
      : null;

  // Findings are compared ONLY where both sides measured the module. Anything
  // else is an absence of evidence, and absence is never a fix.
  const baseFindings = new Set<string>();
  const headFindings = new Set<string>();
  for (const key of intersection) {
    for (const finding of base.modules[key]!.findingKeys) baseFindings.add(finding);
    for (const finding of head.modules[key]!.findingKeys) headFindings.add(finding);
  }

  const resolvedFindings: FindingKey[] = [];
  for (const finding of baseFindings) {
    if (!headFindings.has(finding)) resolvedFindings.push(finding as FindingKey);
  }

  const regressedFindings: FindingKey[] = [];
  const decayedFindings: FindingKey[] = [];
  for (const finding of headFindings) {
    if (baseFindings.has(finding)) continue;
    if (DECAY_FINDING_KEYS.has(finding)) decayedFindings.push(finding as FindingKey);
    else regressedFindings.push(finding as FindingKey);
  }

  return {
    comparable: true,
    incomparableReason: null,
    intersectionModules: intersection,
    compositeBase: baseComposite.value,
    compositeHead: headComposite.value,
    compositeDelta: delta,
    compositeWithheldReason: baseComposite.withheld ?? headComposite.withheld,
    resolvedFindings: resolvedFindings.sort(),
    regressedFindings: regressedFindings.sort(),
    decayedFindings: decayedFindings.sort(),
    lostCoverage: MODULE_KEYS.filter((key) => baseMeasured.has(key) && !headMeasured.has(key)),
    gainedCoverage: MODULE_KEYS.filter((key) => !baseMeasured.has(key) && headMeasured.has(key)),
  };
}

export { DECAY_FINDING_KEYS };
