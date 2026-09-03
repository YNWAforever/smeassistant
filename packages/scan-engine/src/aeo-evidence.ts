import type { AEOPayload } from "@sme-scanner/scoring";

export function hasUsableAeoEvidence(payload: AEOPayload): boolean {
  if (payload.website?.available) return true;
  return (payload.performance_runs ?? []).some((run) => run.available && !run.unsupported);
}