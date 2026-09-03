import type { MerchantPerformanceEvidenceRun } from "@sme-scanner/scoring";

// Decides whether the bounded AEO retry (one supplementary AI-mode call with brand phrasing)
// should fire: only when the AI-mode run is ambiguous (a fuzzy match or no match at all) and no
// other run in the same scan already confirms a citation. Kept separate from the fetch/retry
// execution in runSerpAEO so the decision itself is unit-testable without mocking SerpAPI.
export function shouldRetryAiMode(runs: MerchantPerformanceEvidenceRun[]): boolean {
  const aiModeRun = runs.find((run) => run.engine === "google_ai_mode");
  if (!aiModeRun) return false;

  const aiModeAvailable = aiModeRun.serpapi.status === "Success" && !aiModeRun.serpapi.error;
  if (!aiModeAvailable) return false;

  const aiModeAmbiguous =
    aiModeRun.merchant_presence.confidence === "low" || aiModeRun.merchant_presence.confidence === "none";
  if (!aiModeAmbiguous) return false;

  const hasConfirmedCitationElsewhere = runs.some(
    (run) =>
      run.merchant_presence.ai_cited &&
      run.merchant_presence.confidence !== "low" &&
      run.merchant_presence.confidence !== "none",
  );
  return !hasConfirmedCitationElsewhere;
}
