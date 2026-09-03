import type { ProviderConfidence, ProviderResult } from "./provider-result";

const RANK: Record<ProviderConfidence, number> = { high: 3, medium: 2, low: 1 };

export function weakerConfidence(a: ProviderConfidence, b: ProviderConfidence): ProviderConfidence {
  return RANK[a] <= RANK[b] ? a : b;
}

/**
 * Trust has no provider of its own — scoreTrust(gbp, ig) derives it, and returns
 * "unavailable" unless both are available. So it cannot be more trustworthy than
 * the weaker of the two things it is derived from.
 *
 * Until this existed, ScanProviderCollection.trust was assigned in exactly one
 * place in the repository (a test fixture), so processor.ts's
 * `if (collection.trust)` branch never ran in production and the scorer's
 * hardcoded "medium" reached every report.
 */
export function deriveTrustProvider(
  ig: ProviderResult<unknown>,
  gbp: ProviderResult<unknown>,
  collectedAt: string,
): ProviderResult<unknown> {
  if (ig.status !== "measured" || gbp.status !== "measured") {
    return { status: "unavailable", limitationCode: "TRUST_NOT_MEASURED" };
  }
  return {
    status: "measured",
    data: null,
    confidence: weakerConfidence(ig.confidence, gbp.confidence),
    collectedAt,
  };
}
