import { serpApiHttpFailure } from "../serpapi-outcome";
import { resolveSerpApiKeys, withSerpApiKeyFallback } from "@sme-scanner/scan-engine";
import { normalizeInstagramOrganicResult } from "./normalize-candidate";
import type {
  IgSearchAttempt,
  IgSearchOutcome,
  IgSearchProviderMetadata,
  IgSearchProviderResult,
} from "./types";

type Environment = Record<string, string | undefined>;

export interface IgSerpApiDependencies {
  env?: Environment;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  /** The caller's own AbortSignal, composed with the timeout -- never swapped for it. */
  signal?: AbortSignal;
  onEvent?: (event: {
    provider: "serpapi";
    outcome: IgSearchOutcome;
    searchId?: string;
    durationMs: number;
    candidateCount: number;
  }) => void;
}

export function buildIgSerpApiRequest(attempt: IgSearchAttempt, apiKey: string): { url: string; init: RequestInit } {
  const parameters = new URLSearchParams({
    engine: "google",
    q: attempt.q,
    hl: attempt.hl,
    gl: attempt.gl,
    location: attempt.location,
    num: "10",
    output: "json",
    api_key: apiKey,
  });
  return {
    url: `https://serpapi.com/search.json?${parameters.toString()}`,
    init: { method: "GET", headers: { accept: "application/json" } },
  };
}

function metadataFor(
  body: Record<string, unknown> | null,
  durationMs: number,
  organicResultsState: IgSearchProviderMetadata["organicResultsState"],
  httpCategory?: IgSearchProviderMetadata["httpCategory"],
): IgSearchProviderMetadata {
  const searchMetadata = body?.search_metadata && typeof body.search_metadata === "object"
    ? body.search_metadata as Record<string, unknown>
    : null;
  return {
    ...(typeof searchMetadata?.id === "string" ? { searchId: searchMetadata.id } : {}),
    ...(typeof searchMetadata?.status === "string" ? { status: searchMetadata.status } : {}),
    organicResultsState,
    durationMs,
    ...(httpCategory ? { httpCategory } : {}),
  };
}

function result(
  outcome: IgSearchOutcome,
  metadata: IgSearchProviderMetadata,
  candidates: IgSearchProviderResult["candidates"] = [],
): IgSearchProviderResult {
  return { outcome, candidates, metadata };
}

export function classifyIgSearchResponse(input: {
  status: number;
  body: unknown;
  durationMs: number;
}): IgSearchProviderResult {
  const body = input.body && typeof input.body === "object" && !Array.isArray(input.body)
    ? input.body as Record<string, unknown>
    : null;
  const rows = Array.isArray(body?.organic_results) ? body.organic_results : null;
  const organicResultsState: IgSearchProviderMetadata["organicResultsState"] = rows
    ? (rows.length ? "present" : "empty")
    : body ? "absent" : "invalid";

  const failure = serpApiHttpFailure(input.status);
  if (failure) return result(failure.outcome, metadataFor(body, input.durationMs, organicResultsState, failure.category));
  if (!body) return result("PROVIDER_ERROR", metadataFor(null, input.durationMs, "invalid", "other"));

  const topError = typeof body.error === "string" ? body.error.toLocaleLowerCase("en") : "";
  if (topError) {
    if (/hasn't returned any results|no results|did not return any results/.test(topError)) {
      return result("NO_RESULTS", metadataFor(body, input.durationMs, organicResultsState, "success"));
    }
    if (/api key|unauthorized|authentication/.test(topError)) {
      return result("PROVIDER_AUTH_ERROR", metadataFor(body, input.durationMs, organicResultsState, "auth"));
    }
    return result("PROVIDER_ERROR", metadataFor(body, input.durationMs, organicResultsState, "other"));
  }

  const metadata = metadataFor(body, input.durationMs, organicResultsState, "success");
  if (metadata.status?.toLocaleLowerCase("en") === "error") return result("PROVIDER_ERROR", metadata);
  if (!rows) {
    const status = metadata.status?.toLocaleLowerCase("en");
    return status === "success" || status === "fully empty"
      ? result("NO_RESULTS", metadata)
      : result("PROVIDER_ERROR", metadata);
  }
  const candidates = rows
    .map((row) => normalizeInstagramOrganicResult(row))
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  return candidates.length ? result("SUCCESS", metadata, candidates) : result("NO_RESULTS", metadata);
}

function emptyMetadata(durationMs: number): IgSearchProviderMetadata {
  return { organicResultsState: "absent", durationMs };
}

function emit(dependencies: IgSerpApiDependencies, providerResult: IgSearchProviderResult): void {
  dependencies.onEvent?.({
    provider: "serpapi",
    outcome: providerResult.outcome,
    ...(providerResult.metadata.searchId ? { searchId: providerResult.metadata.searchId } : {}),
    durationMs: providerResult.metadata.durationMs,
    candidateCount: providerResult.candidates.length,
  });
}

export async function searchInstagramSerpApi(
  attempt: IgSearchAttempt,
  dependencies: IgSerpApiDependencies = {},
): Promise<IgSearchProviderResult> {
  const startedAt = performance.now();
  // Never process.env.SERPAPI_KEY directly: the resolver is the only thing that
  // agrees with the key the rest of the app actually uses (CLAUDE.md gotcha).
  const keys = resolveSerpApiKeys(dependencies.env ?? process.env);
  if (keys.length === 0) {
    const providerResult = result("PROVIDER_AUTH_ERROR", emptyMetadata(0));
    emit(dependencies, providerResult);
    return providerResult;
  }

  async function attemptWithKey(apiKey: string): Promise<IgSearchProviderResult> {
    const request = buildIgSerpApiRequest(attempt, apiKey);
    const timeoutSignal = AbortSignal.timeout(dependencies.timeoutMs ?? 8_000);
    const signal = dependencies.signal ? AbortSignal.any([dependencies.signal, timeoutSignal]) : timeoutSignal;
    try {
      const response = await (dependencies.fetcher ?? fetch)(request.url, { ...request.init, signal });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      return classifyIgSearchResponse({
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

  // Only a quota outcome is retried on the next key: a timeout is not the key's
  // fault, and an auth error would fail the same way twice.
  const providerResult = await withSerpApiKeyFallback(keys, async (apiKey) => {
    const attemptResult = await attemptWithKey(apiKey);
    return { result: attemptResult, quotaExhausted: attemptResult.outcome === "PROVIDER_QUOTA_ERROR" };
  }) ?? result("PROVIDER_AUTH_ERROR", emptyMetadata(0));

  emit(dependencies, providerResult);
  return providerResult;
}
