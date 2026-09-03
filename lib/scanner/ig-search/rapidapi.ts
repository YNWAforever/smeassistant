import { buildInstagramCandidate, normalizeInstagramHandle } from "./handle";
import type { IgSourceResult, InstagramCandidate } from "./types";

type Environment = Record<string, string | undefined>;

const HOST = "instagram-scraper-stable-api.p.rapidapi.com";
const DEFAULT_SEARCH_PATH = "search_ig.php";
// A bare .php filename and nothing else. The host is fixed above, so this can
// never redirect the call elsewhere; the guard exists so a typo in an operator's
// env cannot turn into a path traversal or an absolute URL.
const SEARCH_PATH_SHAPE = /^[a-z0-9_]+\.php$/i;
const MAX_CANDIDATES = 8;
const MAX_SNIPPET = 200;

export interface RapidApiDependencies {
  env?: Environment;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function resolveSearchPath(env: Environment): string | null {
  const configured = env.RAPIDAPI_INSTAGRAM_SEARCH_PATH?.trim() || DEFAULT_SEARCH_PATH;
  return SEARCH_PATH_SHAPE.test(configured) ? configured : null;
}

export function buildRapidApiSearchRequest(
  query: string,
  apiKey: string,
  searchPath: string,
): { url: string; init: RequestInit } {
  if (!SEARCH_PATH_SHAPE.test(searchPath)) throw new Error("Invalid RapidAPI search path");
  return {
    url: `https://${HOST}/${searchPath}?search_query=${encodeURIComponent(query)}`,
    init: {
      method: "GET",
      headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": apiKey, accept: "application/json" },
    },
  };
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function userRows(body: unknown): unknown[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const root = body as Record<string, unknown>;
  const nested = root.data && typeof root.data === "object" && !Array.isArray(root.data)
    ? root.data as Record<string, unknown>
    : null;
  for (const source of [root.users, root.results, root.items, nested?.users, nested?.results, nested?.items]) {
    if (Array.isArray(source)) return source;
  }
  return [];
}

/**
 * Deliberately tolerant about the envelope and strict about the handle. The
 * endpoint's exact response shape is unverified, so this accepts the shapes
 * this API family commonly returns -- but every username still has to survive
 * `normalizeInstagramHandle`, which means an unexpected payload produces ZERO
 * candidates rather than wrong ones.
 */
export function normalizeRapidApiSearchBody(body: unknown): InstagramCandidate[] {
  const seen = new Set<string>();
  const candidates: InstagramCandidate[] = [];
  for (const row of userRows(body)) {
    if (!row || typeof row !== "object") continue;
    const outer = row as Record<string, unknown>;
    const user = outer.user && typeof outer.user === "object" ? outer.user as Record<string, unknown> : outer;
    const handle = normalizeInstagramHandle(text(user.username) ?? "");
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    const displayName = text(user.full_name) ?? text(user.fullName);
    const bioSnippet = (text(user.biography) ?? text(user.bio))?.slice(0, MAX_SNIPPET);
    candidates.push(buildInstagramCandidate(handle, "picker_confirmed", {
      ...(displayName ? { displayName } : {}),
      ...(bioSnippet ? { bioSnippet } : {}),
    }));
    if (candidates.length === MAX_CANDIDATES) break;
  }
  return candidates;
}

function unsubscribed(body: unknown): boolean {
  const message = body && typeof body === "object" && !Array.isArray(body)
    ? text((body as Record<string, unknown>).message) ?? ""
    : "";
  return /not subscribed|does not exist|not found|no endpoint/i.test(message);
}

export async function searchInstagramRapidApi(
  query: string,
  dependencies: RapidApiDependencies = {},
): Promise<IgSourceResult> {
  const env = dependencies.env ?? process.env;
  const apiKey = env.RAPIDAPI_INSTAGRAM_KEY?.trim();
  const searchPath = resolveSearchPath(env);
  // Both "no key" and "no usable endpoint path" mean this source cannot answer
  // here -- the chain must fall through to SerpApi, not report a failure.
  if (!apiKey || !searchPath) return { outcome: "UNSUPPORTED", candidates: [] };

  const request = buildRapidApiSearchRequest(query, apiKey, searchPath);
  const timeoutSignal = AbortSignal.timeout(dependencies.timeoutMs ?? 6_000);
  const signal = dependencies.signal ? AbortSignal.any([dependencies.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await (dependencies.fetcher ?? fetch)(request.url, { ...request.init, signal });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    // 404 and an unsubscribed 403 are the two ways "this endpoint is not on
    // your plan" arrives. Neither is worth surfacing: path B answers the same
    // question. A 401 IS worth surfacing -- the key is wrong for every call the
    // scanner makes, not just this one.
    if (response.status === 404) return { outcome: "UNSUPPORTED", candidates: [] };
    if (response.status === 403) {
      return unsubscribed(body)
        ? { outcome: "UNSUPPORTED", candidates: [] }
        : { outcome: "PROVIDER_PERMISSION_ERROR", candidates: [] };
    }
    if (response.status === 401) return { outcome: "PROVIDER_AUTH_ERROR", candidates: [] };
    if (response.status === 429) return { outcome: "PROVIDER_QUOTA_ERROR", candidates: [] };
    if (!response.ok) return { outcome: "PROVIDER_ERROR", candidates: [] };

    const candidates = normalizeRapidApiSearchBody(body);
    return candidates.length ? { outcome: "SUCCESS", candidates } : { outcome: "NO_RESULTS", candidates: [] };
  } catch (error) {
    const errorName = error && typeof error === "object" && "name" in error ? error.name : undefined;
    return {
      outcome: errorName === "AbortError" || errorName === "TimeoutError" ? "TIMEOUT" : "NETWORK_ERROR",
      candidates: [],
    };
  }
}
