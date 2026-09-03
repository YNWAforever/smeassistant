import { randomUUID } from "node:crypto";
import { resolveAnalyticsSession, setAnalyticsSessionCookie, type AnalyticsSession } from "@/lib/analytics/record-event";
import { createCachedProviderExecutor } from "@/lib/scanner/merchant-search/cache";
import { resolveGoogleMapsUrl } from "@/lib/scanner/merchant-search/maps-url";
import { countMeaningfulCharacters, normalizeMerchantQuery } from "@/lib/scanner/merchant-search/query";
import { searchSerpApi } from "@/lib/scanner/merchant-search/serpapi";
import { searchMerchants } from "@/lib/scanner/merchant-search/service";
import { serializeMerchantSearchTelemetry } from "@/lib/scanner/merchant-search/telemetry";
import type { MerchantSearchAttempt, MerchantSearchOutcome } from "@/lib/scanner/merchant-search/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_QUERY_LENGTH = 120;
const MAX_MAPS_URL_LENGTH = 2_048;
const cachedProviderExecution = createCachedProviderExecutor(async (serializedAttempt, signal) =>
  searchSerpApi(JSON.parse(serializedAttempt) as MerchantSearchAttempt, { signal }),
  "merchant-search-provider",
);
const cachedProvider = (attempt: MerchantSearchAttempt, signal?: AbortSignal) =>
  cachedProviderExecution(JSON.stringify(attempt), signal);

interface ValidBody {
  query: string;
  market: "HK" | "TW";
  sessionId: string;
  mapsUrl?: string;
}

function privateJson(
  body: unknown,
  status = 200,
  session?: AnalyticsSession,
  headers?: Record<string, string>,
): Response {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
      ...headers,
    },
  });
  if (session) setAnalyticsSessionCookie(response, session);
  return response;
}

function parseBody(value: unknown): ValidBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.market !== "HK" && body.market !== "TW") return null;
  if (typeof body.sessionId !== "string" || !SESSION_ID.test(body.sessionId)) return null;
  if (typeof body.query !== "string") return null;
  const query = normalizeMerchantQuery(body.query);
  if (query.length > MAX_QUERY_LENGTH || countMeaningfulCharacters(query) < 2) return null;
  if (body.mapsUrl !== undefined && (typeof body.mapsUrl !== "string" || !body.mapsUrl || body.mapsUrl.length > MAX_MAPS_URL_LENGTH)) {
    return null;
  }
  return {
    query,
    market: body.market,
    sessionId: body.sessionId,
    ...(typeof body.mapsUrl === "string" ? { mapsUrl: body.mapsUrl } : {}),
  };
}

function statusFor(outcome: MerchantSearchOutcome): number {
  switch (outcome) {
    case "SUCCESS":
    case "NO_RESULTS":
      return 200;
    case "INVALID_MAPS_URL":
      return 400;
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
    scope: "business_search",
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

  let maps;
  if (body.mapsUrl) {
    const resolved = await resolveGoogleMapsUrl(body.mapsUrl);
    if (!resolved.ok) {
      return privateJson({ outcome: "INVALID_MAPS_URL", candidates: [], correlationId }, 400, analyticsSession);
    }
    maps = resolved.value;
  }

  const serviceResult = await searchMerchants({
    query: maps?.name ?? body.query,
    market: body.market,
    correlationId,
    ...(maps ? { maps } : {}),
  }, {
    provider: (attempt) => cachedProvider(attempt, req.signal),
    logger: (event) => console.info(serializeMerchantSearchTelemetry(event)),
    signal: req.signal,
  });

  const responseBody = {
    outcome: serviceResult.outcome,
    candidates: serviceResult.candidates,
    correlationId,
    cached: serviceResult.cached ?? false,
  };
  return privateJson(responseBody, statusFor(serviceResult.outcome), analyticsSession);
}
