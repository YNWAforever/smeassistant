import type { EvidenceCandidate } from "@sme-scanner/contracts";
/**
 * How much a collector's own confidence in its answer. Distinct from
 * `packages/scoring`'s `Confidence`, which also carries `"none"` for an
 * unmeasured module — a `ProviderResult` that hasn't measured anything takes
 * the `unavailable`/`unsupported`/`failed` branch instead, so `"none"` never
 * applies here.
 */
export type ProviderConfidence = "high" | "medium" | "low";

/**
 * Normalized result returned by an external scan provider.
 *
 * Collectors keep their provider-specific payloads intact in `data`; the
 * processor only relies on this small state machine to distinguish measured
 * evidence from a provider that was unavailable or failed.
 */
export type ProviderResult<T> =
  | {
      status: "measured";
      data: T;
      confidence: ProviderConfidence;
      collectedAt: string;
    }
  | {
      status: "unavailable" | "unsupported";
      limitationCode: string;
    }
  | {
      status: "failed";
      limitationCode: string;
      retryable: boolean;
    };

export type ProviderCollection<TIg, TGbp, TAeo> = {
  ig: ProviderResult<TIg>;
  gbp: ProviderResult<TGbp>;
  aeo: ProviderResult<TAeo>;
  /** Trust is derived by the scorer from IG and GBP evidence. */
  trust?: ProviderResult<unknown>;
  evidence?: EvidenceCandidate[];
  raw?: {
    ig?: unknown;
    gbp?: unknown;
    aeo?: unknown;
  };
};

export function providerData<T>(result: ProviderResult<T>): T | null {
  return result.status === "measured" ? result.data : null;
}
