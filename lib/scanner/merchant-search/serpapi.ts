import { serpApiHttpFailure } from "../serpapi-outcome";
import {
  resolveSerpApiKey,
  resolveSerpApiKeys,
  withSerpApiKeyFallback,
} from "@sme-scanner/scan-engine";
import { normalizeSerpApiCandidate } from "./normalize-candidate";
import type {
  MerchantSearchAttempt,
  MerchantSearchOutcome,
  MerchantSearchProviderMetadata,
  MerchantSearchProviderResult,
} from "./types";

type Environment = Record<string, string | undefined>;

export interface SerpApiDependencies {
  env?: Environment;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  /**
   * The caller's own AbortSignal (e.g. `req.signal`), composed with the
   * request timeout below so a client disconnect stops the in-flight fetch
   * too, without ever dropping the timeout.
   */
  signal?: AbortSignal;
  onEvent?: (event: {
    provider: "serpapi";
    outcome: MerchantSearchOutcome;
    searchId?: string;
    status?: string;
    durationMs: number;
    candidateCount: number;
  }) => void;
}

interface ClassifyInput {
  status: number;
  body: unknown;
  durationMs: number;
}

// Re-exported so existing callers and tests keep their import path; the single
// implementation now lives in @sme-scanner/scan-engine's serpapi-keys.ts
// alongside the quota failover that depends on the same resolution order.
export { resolveSerpApiKey };

export function buildSerpApiRequest(attempt: MerchantSearchAttempt, apiKey: string): {
  url: string;
  init: RequestInit;
} {
  const parameters = new URLSearchParams({
    engine: "google_maps",
    type: attempt.type,
    q: attempt.q,
    ll: attempt.ll,
    hl: attempt.hl,
    gl: attempt.gl,
    output: "json",
    api_key: apiKey,
  });
  if (attempt.placeId) parameters.set("place_id", attempt.placeId);
  if (attempt.dataId) parameters.set("data_id", attempt.dataId);
  if (attempt.dataCid) parameters.set("data_cid", attempt.dataCid);
  return {
    url: `https://serpapi.com/search.json?${parameters.toString()}`,
    init: { method: "GET", headers: { accept: "application/json" } },
  };
}

function metadataFor(
  body: Record<string, unknown> | null,
  durationMs: number,
  localResultsState: MerchantSearchProviderMetadata["localResultsState"],
  httpCategory?: MerchantSearchProviderMetadata["httpCategory"],
): MerchantSearchProviderMetadata {
  const searchMetadata = body?.search_metadata && typeof body.search_metadata === "object"
    ? body.search_metadata as Record<string, unknown>
    : null;
  return {
    ...(typeof searchMetadata?.id === "string" ? { searchId: searchMetadata.id } : {}),
    ...(typeof searchMetadata?.status === "string" ? { status: searchMetadata.status } : {}),
    localResultsState,
    durationMs,
    ...(httpCategory ? { httpCategory } : {}),
  };
}

function result(
  outcome: MerchantSearchOutcome,
  metadata: MerchantSearchProviderMetadata,
  candidates: MerchantSearchProviderResult["candidates"] = [],
): MerchantSearchProviderResult {
  return { outcome, candidates, metadata };
}

export function classifySerpApiResponse(input: ClassifyInput): MerchantSearchProviderResult {
  const body = input.body && typeof input.body === "object" && !Array.isArray(input.body)
    ? input.body as Record<string, unknown>
    : null;
  const rows = Array.isArray(body?.local_results)
    ? body.local_results
    : body?.place_results && typeof body.place_results === "object"
      ? [body.place_results]
      : null;
  const localResultsState: MerchantSearchProviderMetadata["localResultsState"] = rows
    ? (rows.length ? "present" : "empty")
    : body ? "absent" : "invalid";
  const failure = serpApiHttpFailure(input.status);
  if (failure) return result(failure.outcome, metadataFor(body, input.durationMs, localResultsState, failure.category));
  if (!body) return result("PROVIDER_ERROR", metadataFor(null, input.durationMs, "invalid", "other"));

  const topError = typeof body.error === "string" ? body.error.toLocaleLowerCase("en") : "";
  if (topError) {
    if (/hasn't returned any results|no results|did not return any results/.test(topError)) {
      return result("NO_RESULTS", metadataFor(body, input.durationMs, localResultsState, "success"));
    }
    if (/api key|unauthorized|authentication/.test(topError)) {
      return result("PROVIDER_AUTH_ERROR", metadataFor(body, input.durationMs, localResultsState, "auth"));
    }
    return result("PROVIDER_ERROR", metadataFor(body, input.durationMs, localResultsState, "other"));
  }

  const metadata = metadataFor(body, input.durationMs, localResultsState, "success");
  if (metadata.status?.toLocaleLowerCase("en") === "error") return result("PROVIDER_ERROR", metadata);
  if (rows?.length) {
    const candidates = rows
      .map((row, index) => normalizeSerpApiCandidate(row, index))
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
    return candidates.length ? result("SUCCESS", metadata, candidates) : result("NO_RESULTS", metadata);
  }
  if (rows?.length === 0) return result("NO_RESULTS", metadata);
  const status = metadata.status?.toLocaleLowerCase("en");
  if (status === "success" || status === "fully empty") return result("NO_RESULTS", metadata);
  return result("PROVIDER_ERROR", metadata);
}

function emptyMetadata(durationMs: number): MerchantSearchProviderMetadata {
  return { localResultsState: "absent", durationMs };
}

function emit(dependencies: SerpApiDependencies, providerResult: MerchantSearchProviderResult): void {
  dependencies.onEvent?.({
    provider: "serpapi",
    outcome: providerResult.outcome,
    ...(providerResult.metadata.searchId ? { searchId: providerResult.metadata.searchId } : {}),
    ...(providerResult.metadata.status ? { status: providerResult.metadata.status } : {}),
    durationMs: providerResult.metadata.durationMs,
    candidateCount: providerResult.candidates.length,
  });
}

export async function searchSerpApi(
  attempt: MerchantSearchAttempt,
  dependencies: SerpApiDependencies = {},
): Promise<MerchantSearchProviderResult> {
  const startedAt = performance.now();
  const keys = resolveSerpApiKeys(dependencies.env ?? process.env);
  if (keys.length === 0) {
    const providerResult = result("PROVIDER_AUTH_ERROR", emptyMetadata(0));
    emit(dependencies, providerResult);
    return providerResult;
  }

  async function attemptWithKey(apiKey: string): Promise<MerchantSearchProviderResult> {
    const request = buildSerpApiRequest(attempt, apiKey);
    const timeoutSignal = AbortSignal.timeout(dependencies.timeoutMs ?? 8_000);
    // Composed, not swapped: the caller disconnecting must not remove the
    // timeout, and the timeout firing must not require the caller to have
    // passed a signal at all.
    const signal = dependencies.signal ? AbortSignal.any([dependencies.signal, timeoutSignal]) : timeoutSignal;
    try {
      const response = await (dependencies.fetcher ?? fetch)(request.url, {
        ...request.init,
        signal,
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      return classifySerpApiResponse({
        status: response.status,
        body,
        durationMs: Math.max(0, performance.now() - startedAt),
      });
    } catch (error) {
      const durationMs = Math.max(0, performance.now() - startedAt);
      const errorName = error && typeof error === "object" && "name" in error ? error.name : undefined;
      return result(
        errorName === "AbortError" || errorName === "TimeoutError" ? "TIMEOUT" : "NETWORK_ERROR",
        emptyMetadata(durationMs),
      );
    }
  }

  // Only a quota outcome is retried on the next key. A timeout or network error
  // is not the key's fault, and an auth error would fail the same way twice.
  const providerResult = await withSerpApiKeyFallback(keys, async (apiKey) => {
    const attemptResult = await attemptWithKey(apiKey);
    return {
      result: attemptResult,
      quotaExhausted: attemptResult.outcome === "PROVIDER_QUOTA_ERROR",
    };
  }) ?? result("PROVIDER_AUTH_ERROR", emptyMetadata(0));

  // Emitted once, for the outcome the caller actually receives — a failover
  // would otherwise report two events for one logical search.
  emit(dependencies, providerResult);
  return providerResult;
}
