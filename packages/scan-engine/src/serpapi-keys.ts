/**
 * Shared SerpApi key resolution and quota failover.
 *
 * Every SerpApi call in the app draws on the same account quota, and when that
 * quota is exhausted a scan silently degrades: merchant lookup, GBP reviews,
 * Google evidence and the AEO probes all stop returning data. A second key lets
 * scanning continue past the first key's limit.
 *
 * Quota exhaustion is NOT reliably an HTTP 429. SerpApi returns a JSON body
 * carrying an `error` string even on 2xx/4xx responses, so "You've run out of
 * searches" can arrive with a status this code would otherwise treat as fine.
 * Detection therefore inspects both the status and the error text, which is why
 * it lives here once rather than being re-derived at each call site.
 */

type Environment = Record<string, string | undefined>;

/**
 * Quota is the ONLY condition worth retrying on a different key.
 *
 * An auth failure means the key is wrong, and a bad request means the query is
 * wrong — replaying either against the fallback burns a second search to fail
 * the same way, and on a bad key it would also mask the real problem. Server
 * errors are transient and belong to each caller's own retry policy.
 */
const QUOTA_ERROR_TEXT =
  /run out of searches|exceeded your|searches per month|plan.*limit|account.*limit/i;

/**
 * How long a key stays marked exhausted before it is retried.
 *
 * SerpApi quota resets on the account's own billing cycle, which this code
 * cannot observe, so a permanent mark would strand a key that has since been
 * topped up — serverless instances are reused and would carry that mark for
 * their whole lifetime. Re-probing periodically costs at most one wasted search
 * per key per window, and only while the key is actually exhausted.
 */
const EXHAUSTED_TTL_MS = 10 * 60 * 1000;

/** Keys observed to be out of quota, with the time they were marked. */
const exhaustedAt = new Map<string, number>();

export function resolveSerpApiKeys(env: Environment = process.env): string[] {
  // SERPAPI_API_KEY and SERPAPI_KEY are two NAMES for the primary key (the
  // latter is the legacy spelling), not two separate keys — hence `||`. The
  // fallback is a genuinely different key on a separate quota.
  const primary = env.SERPAPI_API_KEY?.trim() || env.SERPAPI_KEY?.trim() || "";
  const fallback =
    env.SERPAPI_API_KEY_FALLBACK?.trim() || env.SERPAPI_KEY_FALLBACK?.trim() || "";
  // Deduplicated so an operator who sets the fallback to the same value as the
  // primary does not spend a second search re-confirming the same exhaustion.
  return [...new Set([primary, fallback].filter(Boolean))];
}

/** Back-compat shim for callers that only ever want one key. */
export function resolveSerpApiKey(env: Environment = process.env): string | null {
  return resolveSerpApiKeys(env)[0] ?? null;
}

export function isSerpApiQuotaExhausted(status: number, body: unknown): boolean {
  if (status === 429) return true;
  const error = (body as { error?: unknown } | null | undefined)?.error;
  return typeof error === "string" && QUOTA_ERROR_TEXT.test(error);
}

export function markSerpApiKeyExhausted(apiKey: string, now = Date.now()): void {
  exhaustedAt.set(apiKey, now);
}

function isKnownExhausted(apiKey: string, now: number): boolean {
  const markedAt = exhaustedAt.get(apiKey);
  if (markedAt === undefined) return false;
  if (now - markedAt < EXHAUSTED_TTL_MS) return true;
  exhaustedAt.delete(apiKey);
  return false;
}

/** Test seam — the module-level map would otherwise leak between test cases. */
export function resetSerpApiKeyState(): void {
  exhaustedAt.clear();
}

export interface SerpApiAttempt<T> {
  result: T;
  /** True when this attempt failed because the key ran out of searches. */
  quotaExhausted: boolean;
}

/**
 * Runs `attempt` against each configured key until one does not report quota
 * exhaustion, and returns that attempt's result.
 *
 * Keys already known to be exhausted are skipped without spending a request. If
 * every key is exhausted the LAST result is returned, so the caller still sees a
 * real provider response to classify rather than a synthetic error — callers
 * already know how to report a quota failure, and inventing a different shape
 * here would bypass their handling.
 */
export async function withSerpApiKeyFallback<T>(
  keys: string[],
  attempt: (apiKey: string) => Promise<SerpApiAttempt<T>>,
  now: () => number = Date.now,
): Promise<T | null> {
  if (keys.length === 0) return null;

  const at = now();
  const fresh = keys.filter((key) => !isKnownExhausted(key, at));
  // If every key is marked exhausted the marks may simply be stale, so re-probe
  // rather than failing without contacting the provider at all.
  const order = fresh.length > 0 ? fresh : keys;

  let last: T | null = null;
  for (const apiKey of order) {
    const outcome = await attempt(apiKey);
    last = outcome.result;
    if (!outcome.quotaExhausted) return outcome.result;
    markSerpApiKeyExhausted(apiKey, now());
  }
  return last;
}
