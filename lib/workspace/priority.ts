import { weightedImpact } from "@/lib/report/weighted-impact";
import type { Priority } from "@/lib/domain";

/**
 * Deterministic priority score (CLAUDE.md §3.6.3). Every factor is persisted
 * on the action so "Why this priority" can show the same numbers later.
 */
export type PriorityFactorKey = "impact" | "severity" | "urgency" | "readiness" | "effort" | "risk" | "evidence";

export interface PriorityFactor {
  key: PriorityFactorKey;
  points: number;
}

export interface PriorityInput {
  /** The strongest (most negative) score_impact among the action's findings. */
  scoreImpact: number;
  /** Engine module of that finding: ig | gbp | aeo | trust. */
  module: string;
  severity: "critical" | "warning" | "info";
  /** Any source finding is in the latest comparable diff's regressed_findings. */
  regressed: boolean;
  /** Days since the evidence was observed; null when unknown. */
  evidenceAgeDays: number | null;
  /** Every required input is available (provided or not needed). */
  inputsAvailable: boolean;
  /** A draft output version already exists for this action. */
  hasDraft: boolean;
  effortMinutes: number;
  externalFacing: boolean;
  brandProfileExists: boolean;
  moduleConfidence: "high" | "medium" | "low" | "none";
  moduleMeasured: boolean;
}

export interface PriorityResult {
  score: number;
  priority: Priority;
  factors: PriorityFactor[];
}

const SEVERITY_POINTS: Record<PriorityInput["severity"], number> = { critical: 15, warning: 8, info: 2 };
const CONFIDENCE_POINTS: Record<PriorityInput["moduleConfidence"], number> = { high: 10, medium: 5, low: 0, none: 0 };

export function priorityFromScore(score: number): Priority {
  if (score >= 60) return "urgent";
  if (score >= 40) return "high";
  if (score >= 20) return "medium";
  return "low";
}

export function scorePriority(input: PriorityInput): PriorityResult {
  const impact = Math.min(40, Math.abs(weightedImpact(input.scoreImpact, input.module)) * 4);
  const severity = SEVERITY_POINTS[input.severity];
  const urgency = input.regressed ? 15 : input.evidenceAgeDays !== null && input.evidenceAgeDays <= 7 ? 8 : 0;
  const readiness = (input.inputsAvailable ? 10 : 0) + (input.hasDraft ? 5 : 0);
  const effort = -Math.min(10, input.effortMinutes / 3);
  const risk = input.externalFacing && !input.brandProfileExists ? -5 : 0;
  const evidence = input.moduleMeasured ? CONFIDENCE_POINTS[input.moduleConfidence] : -10;

  const factors: PriorityFactor[] = [
    { key: "impact", points: round(impact) },
    { key: "severity", points: severity },
    { key: "urgency", points: urgency },
    { key: "readiness", points: readiness },
    { key: "effort", points: round(effort) },
    { key: "risk", points: risk },
    { key: "evidence", points: evidence },
  ];
  const score = round(factors.reduce((sum, factor) => sum + factor.points, 0));
  return { score, priority: priorityFromScore(score), factors };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
