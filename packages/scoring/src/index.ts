import { scoreAEO } from "./modules/aeo";
import { scoreGBP } from "./modules/gbp";
import { scoreIG } from "./modules/ig";
import { scoreTrust } from "./modules/trust";
import type { AuditPayload, ModuleKey, ModuleScore, ScoreResult } from "./types";

/**
 * The headline score is a weighted average of module scores, not a simple
 * mean -- a finding's real effect on the headline is score_impact *
 * WEIGHTS[module], not the raw module-relative score_impact. Exported so
 * apps/web can convert a finding's module-relative score_impact into its
 * true effect on the overall score (see apps/web/lib/report/top-priorities.ts
 * and apps/web/lib/report/weighted-impact.ts) without re-declaring these
 * numbers -- a second copy would drift from this one.
 */
export const WEIGHTS: Record<ModuleKey, number> = {
  ig: 0.3,
  gbp: 0.35,
  aeo: 0.25,
  trust: 0.1,
};

const INDEPENDENT_CHANNELS: ModuleKey[] = ["ig", "gbp", "aeo"];

function calculateComposite(modules: Record<ModuleKey, ModuleScore>) {
  const measured = (Object.keys(WEIGHTS) as ModuleKey[]).filter(
    (key) => modules[key].status === "measured" && modules[key].score !== null,
  );
  const independentCount = INDEPENDENT_CHANNELS.filter(
    (key) => modules[key].status === "measured" && modules[key].score !== null,
  ).length;
  const coverage = measured.reduce((total, key) => total + WEIGHTS[key], 0);

  if (independentCount < 2 || coverage === 0) {
    return { overall: null, coverage };
  }

  const weighted = measured.reduce(
    (total, key) => total + (modules[key].score ?? 0) * WEIGHTS[key],
    0,
  );
  return { overall: Math.round(weighted / coverage), coverage };
}

export function scoreAll(payload: AuditPayload): ScoreResult {
  const industry = payload.industry;
  const ig = scoreIG(payload.ig, industry);
  const gbp = scoreGBP(payload.gbp, industry);
  const aeo = scoreAEO(payload.aeo, industry);
  const trust = scoreTrust(payload.gbp, payload.ig, industry);
  const modules = { ig, gbp, aeo, trust };
  const composite = calculateComposite(modules);

  return {
    ...composite,
    scoringVersion: "2026-08-16",
    modules,
    findings: [...ig.findings, ...gbp.findings, ...aeo.findings, ...trust.findings],
  };
}

export const score = scoreAll;

export { scoreTrust } from "./modules/trust";
export {
  diffScans,
  DECAY_FINDING_KEYS,
  type ScanDiff,
  type ScanDiffInput,
  type ScanDiffModule,
  type ScanDiffIncomparableReason,
} from "./diff";
export * from "./types";
export * from "./agents/contracts";