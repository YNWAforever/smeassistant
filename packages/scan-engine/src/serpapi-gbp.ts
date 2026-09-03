import {
  isSerpApiQuotaExhausted,
  resolveSerpApiKeys,
  withSerpApiKeyFallback,
} from "./serpapi-keys";

const MAX_CATEGORIES = 10;
const MAX_REVIEWS = 5;
const MAX_REVIEW_IMAGES = 4;

export type SerpApiGbpOutcome =
  | {
      ok: true;
      value: {
        name: string;
        address: string;
        rating: number;
        reviewsCount: number;
        categories: string[];
        reviews: Array<{
          id: string;
          link: string | null;
          rating: number;
          text: string;
          time: string;
          images: string[];
          ownerResponse?: string;
        }>;
      };
    }
  | {
      ok: false;
      code: "SERPAPI_GBP_NOT_CONFIGURED" | "SERPAPI_GBP_FAILED" | "SERPAPI_GBP_INVALID_RESPONSE";
      retryable: boolean;
    };

type SerpApiGbpOptions = {
  dataId: string | null;
  placeId: string | null;
  apiKey: string;
  language: string;
  fetcher?: typeof fetch;
};

type JsonObject = Record<string, unknown>;

function asRecord(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function embeddedIpv4Ipv6(hostname: string): string | null {
  const match = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(hostname);
  if (!match) return null;

  const high = Number.parseInt(match[1], 16);
  const low = Number.parseInt(match[2], 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isBlockedIpv6(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const embeddedIpv4 = embeddedIpv4Ipv6(host);
  if (embeddedIpv4) return isBlockedIpv4(embeddedIpv4);
  if (!host.includes(":")) return false;
  if (host === "::" || host === "::1") return true;
  const firstHextet = Number.parseInt(host.split(":", 1)[0] ?? "", 16);
  return Number.isFinite(firstHextet)
    && ((firstHextet & 0xffc0) === 0xfe80 || (firstHextet & 0xfe00) === 0xfc00);
}

function isPublicEvidenceHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host !== "localhost" && !host.endsWith(".localhost")
    && !isBlockedIpv4(host) && !isBlockedIpv6(host);
}

function normalizedPublicLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:")
      && !url.username && !url.password && isPublicEvidenceHost(url.hostname)
      ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeReview(value: unknown) {
  const review = asRecord(value);
  if (!review) return null;

  const id = nonEmptyString(review.review_id);
  if (!id) return null;

  const snippet = asRecord(review.extracted_snippet);
  const response = asRecord(review.response);
  const responseSnippet = asRecord(response?.extracted_snippet);
  const images = Array.isArray(review.images)
    ? review.images
      .map(normalizedPublicLink)
      .filter((image): image is string => image !== null)
      .slice(0, MAX_REVIEW_IMAGES)
    : [];
  const ownerResponse = responseSnippet
    ? optionalString(responseSnippet.original) || optionalString(response?.snippet)
    : optionalString(response?.snippet);

  return {
    id,
    link: normalizedPublicLink(review.link),
    rating: nonNegativeNumber(review.rating) ?? 0,
    text: snippet ? optionalString(snippet.original) || optionalString(review.snippet) : optionalString(review.snippet),
    time: optionalString(review.iso_date) || optionalString(review.date),
    images,
    ...(ownerResponse ? { ownerResponse } : {}),
  };
}

export async function fetchSerpApiGbp({
  dataId,
  placeId,
  apiKey,
  language,
  fetcher = fetch,
}: SerpApiGbpOptions): Promise<SerpApiGbpOutcome> {
  if (!nonEmptyString(apiKey)) {
    return { ok: false, code: "SERPAPI_GBP_NOT_CONFIGURED", retryable: false };
  }

  const dataIdentity = nonEmptyString(dataId);
  const identity = dataIdentity ?? nonEmptyString(placeId);
  if (!identity) {
    return { ok: false, code: "SERPAPI_GBP_INVALID_RESPONSE", retryable: false };
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_maps_reviews");
  if (dataIdentity) {
    url.searchParams.set("data_id", dataIdentity);
  } else {
    url.searchParams.set("place_id", identity);
  }
  url.searchParams.set("hl", language);
  url.searchParams.set("sort_by", "newestFirst");

  // The caller's key stays primary — it is the injection seam these tests use —
  // with any configured fallback appended for quota failover.
  const keys = [...new Set([apiKey, ...resolveSerpApiKeys()])].filter(Boolean);

  try {
    const attempt = await withSerpApiKeyFallback(keys, async (key) => {
      url.searchParams.set("api_key", key);
      const attemptResponse = await fetcher(url.toString(), { signal: AbortSignal.timeout(10_000) });
      const attemptBody = asRecord(await attemptResponse.json().catch(() => null));
      return {
        result: { response: attemptResponse, body: attemptBody },
        quotaExhausted: isSerpApiQuotaExhausted(attemptResponse.status, attemptBody),
      };
    });
    if (!attempt) {
      return { ok: false, code: "SERPAPI_GBP_NOT_CONFIGURED", retryable: false };
    }
    const { response, body } = attempt;

    if (!response.ok || body?.error) {
      return {
        ok: false,
        code: "SERPAPI_GBP_FAILED",
        retryable: response.status === 429 || response.status >= 500,
      };
    }

    const place = asRecord(body?.place_info);
    const name = nonEmptyString(place?.title);
    const rating = nonNegativeNumber(place?.rating);
    const reviewsCount = nonNegativeNumber(place?.reviews);
    if (!name || rating === null || reviewsCount === null) {
      return { ok: false, code: "SERPAPI_GBP_INVALID_RESPONSE", retryable: false };
    }

    const categories = [nonEmptyString(place?.type)].filter((category): category is string => category !== null).slice(0, MAX_CATEGORIES);
    const reviews = Array.isArray(body?.reviews)
      ? body.reviews.slice(0, MAX_REVIEWS).map(normalizeReview).filter((review): review is NonNullable<typeof review> => review !== null)
      : [];

    return {
      ok: true,
      value: {
        name,
        address: optionalString(place?.address),
        rating,
        reviewsCount,
        categories,
        reviews,
      },
    };
  } catch {
    return { ok: false, code: "SERPAPI_GBP_FAILED", retryable: true };
  }
}
