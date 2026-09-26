import { hasMessage, t } from "@/lib/i18n";
import type { OwnerFailureKind, OwnerProblem } from "./failure-types";

/** Every code the model can emit today. Tests prove each has a label in every locale. */
export const KNOWN_REASON_CODES = [
  "ATTEMPTS_EXHAUSTED", "COLLECTION_FAILED", "SCORING_FAILED", "PERSIST_FAILED", "PROCESSOR_FAILED", "CLAIM_FAILED",
  "consent_missing", "consent_policy_stale",
  "action_run_timeout", "action_run_reaped", "invalid_output", "action_run_failed",
  "expired", "error", "workspace_post_process_failed",
] as const;

const SAFE_CODE = /^[A-Za-z_]+$/;

/** A reason's label; an unknown or unsafe code gets the generic line. A raw code is never returned. Client-safe. */
export function problemReasonLabel(locale: string, code: string): string {
  const key = `problems.reason.${code}`;
  return SAFE_CODE.test(code) && hasMessage(locale, key) ? t(locale, key) : t(locale, "problems.reason.generic");
}

export function problemTitle(locale: string, kind: OwnerFailureKind): string {
  return t(locale, `problems.kind.${kind}`);
}

export function nextStepText(locale: string, problem: OwnerProblem): string {
  if (problem.kind === "scan_dead_lettered") return t(locale, "problems.next.dead_lettered");
  return t(locale, `problems.next.${problem.ownerAction}`);
}
