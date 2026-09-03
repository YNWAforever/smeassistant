import { randomUUID } from "node:crypto";
import { resolveAnalyticsSession, setAnalyticsSessionCookie, type AnalyticsSession } from "@/lib/analytics/record-event";
import { searchInstagramRapidApi } from "@/lib/scanner/ig-search/rapidapi";
import { searchInstagramSerpApi } from "@/lib/scanner/ig-search/serpapi";
import { buildIgSearchAttempt, searchInstagramCandidates, type IgSource } from "@/lib/scanner/ig-search/service";
import type { IgSearchAttempt, IgSearchOutcome, IgSourceResult } from "@/lib/scanner/ig-search/types";
import { createCachedProviderExecutor } from "@/lib/scanner/merchant-search/cache";
import { countMeaningfulCharacters, normalizeMerchantQuery } from "@/lib/scanner/merchant-search/query";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 120;
const MAX_DISTRICT_LENGTH = 80;
const MAX_URL_LENGTH = 2_048;

// Only path B is cached, and deliberately so: it is the expensive source, and
// while RapidAPI's endpoint stays unverified it is also the one that actually
// runs on every lookup. The namespace is what keeps this key space apart from
// merchant search's -- the executor discriminates cache entries by namespace
// plus serialized attempt, nothing else (see cache.ts).
const cachedSerpApiSearch = createCachedProviderExecutor(async (serializedAttempt, signal) =>
  searchInstagramSerpApi(JSON.parse(serializedAttempt) as IgSearchAttempt, { signal }),
  "ig-search-provider",
);

/**
 * Ranked cheapest-first. RapidAPI bills per request against a monthly quota the
 * scan already draws on heavily; SerpApi bills per search on a separate quota.
 * If that trade stops making sense, reorder this array -- nothing else in the
 * feature encodes the ordering.
 */
const IG_SOURCES: readonly IgSource[] = [
  {
    key: "rapidapi",
    run: (request, signal) => searchInstagramRapidApi(request.businessName, { signal }),
  },
  {
    key: "serpapi",
    run: async (request, signal): Promise<IgSourceResult> => {
      const attempt = buildIgSearchAttempt(request);
      if (!attempt) return { outcome: "NO_RESULTS", candidates: [] };
      const result = await cachedSerpApiSearch(JSON.stringify(attempt), signal);
      return { outcome: result.outcome, candidates: result.candidates };
    },
  },
];

interface ValidBody {
  businessName: string;
  market: "HK" | "TW";
  sessionId: string;
  district?: string;
  websiteUrl?: string;
}

function privateJson(body: unknown, status = 200, session?: AnalyticsSession, headers?: Record<string, string>): Response {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "private, no-store", ...headers },
  });
  if (session) setAnalyticsSessionCookie(response, session);
  return response;
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > maxLength) return null;
  const normalized = normalizeMerchantQuery(value);
  return normalized || undefined;
}

function parseBody(value: unknown): ValidBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.market !== "HK" && body.market !== "TW") return null;
  if (typeof body.sessionId !== "string" || !SESSION_ID.test(body.sessionId)) return null;
  if (typeof body.businessName !== "string") return null;
  const businessName = normalizeMerchantQuery(body.businessName);
  if (businessName.length > MAX_NAME_LENGTH || countMeaningfulCharacters(businessName) < 2) return null;

  const district = optionalText(body.district, MAX_DISTRICT_LENGTH);
  if (district === null) return null;
  const websiteUrl = optionalText(body.websiteUrl, MAX_URL_LENGTH);
  if (websiteUrl === null) return null;

  return {
    businessName,
    market: body.market,
    sessionId: body.sessionId,
    ...(district ? { district } : {}),
    ...(websiteUrl ? { websiteUrl } : {}),
  };
}

function statusFor(outcome: IgSearchOutcome): number {
  switch (outcome) {
    case "SUCCESS":
    case "NO_RESULTS":
      return 200;
    case "PROVIDER_AUTH_ERROR":
    case "PROVIDER_PERMISSION_ERROR":
    case "PROVIDER_QUOTA_ERROR":
      return 503;
    case "TIMEOUT":
      return 504;
    case "PROVIDER_ERROR":
    case "NETWORK_ERROR":
      return 502;
  }
}

export async function POST(req: Request): Promise<Response> {
  const correlationId = randomUUID();
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return privateJson({ error: "INVALID_REQUEST", correlationId }, 400);
  }
  const body = parseBody(rawBody);
  if (!body) return privateJson({ error: "INVALID_REQUEST", correlationId }, 400);

  const analyticsSession = resolveAnalyticsSession(req);
  const limiter = await enforceRateLimit({
    req,
    scope: "ig_search",
    identifiers: [body.sessionId],
    failClosed: false,
  });
  if (!limiter.allowed) {
    return privateJson(
      { error: "RATE_LIMITED", correlationId },
      429,
      analyticsSession,
      { "retry-after": String(Math.max(1, Math.ceil(limiter.retryAfterSeconds))) },
    );
  }

  const result = await searchInstagramCandidates(
    {
      businessName: body.businessName,
      market: body.market,
      ...(body.district ? { district: body.district } : {}),
      ...(body.websiteUrl ? { websiteUrl: body.websiteUrl } : {}),
    },
    { sources: IG_SOURCES, signal: req.signal },
  );

  return privateJson(
    { outcome: result.outcome, candidates: result.candidates, correlationId },
    statusFor(result.outcome),
    analyticsSession,
  );
}
