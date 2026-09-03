import type { AEOPayload, AEOPerformanceRun } from "@sme-scanner/scoring";
import type { ProviderConfidence } from "./provider-result";

/**
 * Same predicate `hasUsableAeoEvidence` applies per-run: a run counts only
 * when SerpApi actually answered it and the engine wasn't reported
 * unsupported for this account/plan.
 */
function isUsableRun(run: AEOPerformanceRun): boolean {
  return run.available && !run.unsupported;
}

/**
 * Grades a measured AEO payload's confidence from evidence volume.
 *
 * `hasUsableAeoEvidence` (the measured/unmeasured gate) returns `true` for a
 * website-only payload with zero usable search runs — this grading is
 * additive on top of that gate, not a replacement, so that boundary does not
 * move. It is what makes the website-only case honestly `low` rather than
 * indistinguishable from a payload with four confirmed runs and a reachable
 * website.
 */
export function resolveAeoConfidence(payload: AEOPayload): ProviderConfidence {
  const usableRuns = (payload.performance_runs ?? []).filter(isUsableRun).length;
  const websiteReachable = Boolean(payload.website?.available);

  if (websiteReachable && usableRuns >= 3) return "high";
  if (usableRuns >= 2) return "medium";
  return "low";
}
