import { createHash } from "node:crypto";
import {
  isSerpApiQuotaExhausted,
  resolveSerpApiKeys,
  withSerpApiKeyFallback,
} from "./serpapi-keys";

const MAX_PHOTOS = 6;
const MAX_POSTS = 3;
const MAX_POST_ID_LENGTH = 200;
const MAX_POST_TEXT_LENGTH = 2_000;
const MAX_PUBLISHED_AT_LENGTH = 100;
/**
 * Longest edge we ask Google's fife CDN to render, in pixels.
 *
 * Derived from how the image is actually displayed, not from the decoder's
 * limits. Evidence media renders as `aspect-square w-full object-cover`
 * (components/report/evidence-media.tsx) inside the report's `max-w-3xl`
 * column (components/report/report-shell.tsx), so it is never presented wider
 * than 768 CSS px and is centre-cropped square regardless of source aspect.
 * 1600 is 2x that, which covers retina displays and the print/PDF export at
 * 300dpi with headroom.
 *
 * Raising it buys no visible quality at that display size while costing
 * storage per evidence row and page weight for merchants on mobile data.
 * The decoder's own ceilings sit far above this — MAX_DECODE_PIXELS is 12M
 * (1600x1200 is 1.9M) and MAX_BYTES is 5MB — so this is a product choice about
 * quality and weight, not a safety margin. Revisit it if the report layout
 * starts showing evidence media larger than the 3xl column.
 */
const MAX_GOOGLE_MEDIA_EDGE = 1_600;
const GOOGLE_MEDIA_HOST = /(^|\.)googleusercontent\.com$/;
const GOOGLE_SIZE_OPTION = /^([whs])(\d{1,9})$/;

export type GoogleEvidenceFailure =
  | "SERPAPI_GOOGLE_PHOTOS_FAILED"
  | "SERPAPI_GOOGLE_POSTS_FAILED";

export interface GoogleEvidenceEnrichment {
  photos: Array<{
    id: string;
    image_url: string;
    source_url: string | null;
    attribution: "Google Maps";
  }>;
  posts: Array<{
    id: string;
    text: string;
    published_at: string;
    image_url: string | null;
    link: string | null;
    action_link: string | null;
  }>;
  failures: GoogleEvidenceFailure[];
}

type JsonObject = Record<string, unknown>;

function asRecord(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function boundedString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function boundedNonEmptyString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const [first, second, third] = octets;
  return first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0 && (third === 0 || third === 2))
    || (first === 192 && second === 88 && third === 99)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51 && third === 100)
    || (first === 203 && second === 0 && third === 113);
}

function isPublicEvidenceHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  return host !== "localhost"
    && !host.endsWith(".localhost")
    && !host.includes(":")
    && !isBlockedIpv4(host);
}

function normalizedPublicLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:")
      && !url.username
      && !url.password
      && isPublicEvidenceHost(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * Google's fife CDN encodes the render size in an `=w..-h..` / `=s..` suffix,
 * and SerpApi's `image` field hands back the ORIGINAL-dimension URL. Those are
 * camera originals: they routinely exceed the evidence decoder's pixel budget
 * (4032x3024 is 12.2M pixels) and can carry post-EOI camera trailers such as
 * Samsung's SEFH/SEFT block, which the exact-container-boundary check refuses —
 * correctly, since nothing distinguishes a camera trailer from an appended
 * payload. Asking fife for a bounded render instead makes it re-encode
 * server-side, which fits the budget and drops the trailer at the source.
 *
 * Only the numeric size options are rewritten, only on googleusercontent.com
 * hosts, and only downwards; every other option and every other host is left
 * exactly as the provider sent it.
 */
function boundedGoogleMediaLink(link: string | null): string | null {
  if (link === null) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return link;
  }
  if (!GOOGLE_MEDIA_HOST.test(url.hostname.toLowerCase())) return link;

  const separator = url.pathname.lastIndexOf("=");
  if (separator < 0) return link;
  const options = url.pathname.slice(separator + 1).split("-");
  const longestEdge = options.reduce((longest, option) => {
    const match = GOOGLE_SIZE_OPTION.exec(option);
    return match ? Math.max(longest, Number(match[2])) : longest;
  }, 0);
  if (longestEdge <= MAX_GOOGLE_MEDIA_EDGE) return link;

  const scale = MAX_GOOGLE_MEDIA_EDGE / longestEdge;
  const bounded = options.map((option) => {
    const match = GOOGLE_SIZE_OPTION.exec(option);
    return match
      ? `${match[1]}${Math.max(1, Math.round(Number(match[2]) * scale))}`
      : option;
  });
  url.pathname = url.pathname.slice(0, separator + 1) + bounded.join("-");
  return url.toString();
}

async function request(
  engine: "google_maps_photos" | "google_maps_posts",
  dataId: string,
  apiKey: string,
  language: string,
  fetcher: typeof fetch,
): Promise<JsonObject> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", engine);
  url.searchParams.set("data_id", dataId);
  url.searchParams.set("hl", language);

  // The caller's key stays primary — it is the injection seam these tests use —
  // with any configured fallback appended for quota failover.
  const keys = [...new Set([apiKey, ...resolveSerpApiKeys()])].filter(Boolean);

  const attempt = await withSerpApiKeyFallback(keys, async (key) => {
    url.searchParams.set("api_key", key);
    const attemptResponse = await fetcher(url.toString(), { signal: AbortSignal.timeout(10_000) });
    const attemptBody = asRecord(await attemptResponse.json().catch(() => null));
    return {
      result: { response: attemptResponse, body: attemptBody },
      quotaExhausted: isSerpApiQuotaExhausted(attemptResponse.status, attemptBody),
    };
  });

  if (!attempt) throw new Error("SERPAPI_GOOGLE_EVIDENCE_FAILED");
  const { response, body } = attempt;
  if (!response.ok || !body || body.error) throw new Error("SERPAPI_GOOGLE_EVIDENCE_FAILED");
  return body;
}

function normalizePhoto(value: unknown, sourceUrl: string | null) {
  const photo = asRecord(value);
  if (!photo) return null;
  const imageUrl = boundedGoogleMediaLink(normalizedPublicLink(photo.image))
    ?? boundedGoogleMediaLink(normalizedPublicLink(photo.thumbnail));
  if (!imageUrl) return null;
  const providerIdentity = typeof photo.photo_meta_serpapi_link === "string"
    && photo.photo_meta_serpapi_link.trim()
    ? photo.photo_meta_serpapi_link
    : imageUrl;
  return {
    id: createHash("sha256").update(providerIdentity).digest("hex"),
    image_url: imageUrl,
    source_url: sourceUrl,
    attribution: "Google Maps" as const,
  };
}

function normalizePost(value: unknown) {
  const post = asRecord(value);
  if (!post) return null;
  const publicLink = normalizedPublicLink(post.link);
  const imageUrl = boundedGoogleMediaLink(normalizedPublicLink(post.image))
    ?? boundedGoogleMediaLink(normalizedPublicLink(post.thumbnail));
  const id = boundedNonEmptyString(post.post_id, MAX_POST_ID_LENGTH)
    ?? boundedNonEmptyString(post.id, MAX_POST_ID_LENGTH)
    ?? boundedNonEmptyString(publicLink, MAX_POST_ID_LENGTH)
    ?? (imageUrl ? createHash("sha256").update(imageUrl).digest("hex") : null);
  if (!id) return null;
  const action = asRecord(post.action);
  return {
    id,
    text: boundedString(post.description ?? post.text ?? post.snippet, MAX_POST_TEXT_LENGTH),
    published_at: boundedString(post.iso_date ?? post.date, MAX_PUBLISHED_AT_LENGTH),
    image_url: imageUrl,
    link: publicLink,
    action_link: normalizedPublicLink(action?.link),
  };
}

export async function fetchSerpApiGoogleEvidence({
  dataId,
  mapsUrl,
  apiKey,
  language,
  fetcher = fetch,
}: {
  dataId: string;
  mapsUrl: string | null;
  apiKey: string;
  language: string;
  fetcher?: typeof fetch;
}): Promise<GoogleEvidenceEnrichment> {
  const [photosResult, postsResult] = await Promise.allSettled([
    request("google_maps_photos", dataId, apiKey, language, fetcher),
    request("google_maps_posts", dataId, apiKey, language, fetcher),
  ]);
  const photoRows = photosResult.status === "fulfilled" && Array.isArray(photosResult.value.photos)
    ? photosResult.value.photos
    : [];
  const postRows = postsResult.status === "fulfilled" && Array.isArray(postsResult.value.posts)
    ? postsResult.value.posts
    : [];
  const sourceUrl = normalizedPublicLink(mapsUrl);

  return {
    photos: photoRows
      .slice(0, MAX_PHOTOS)
      .map((photo) => normalizePhoto(photo, sourceUrl))
      .filter((photo): photo is NonNullable<typeof photo> => photo !== null),
    posts: postRows
      .slice(0, MAX_POSTS)
      .map(normalizePost)
      .filter((post): post is NonNullable<typeof post> => post !== null),
    failures: [
      photosResult.status === "rejected" ? "SERPAPI_GOOGLE_PHOTOS_FAILED" as const : null,
      postsResult.status === "rejected" ? "SERPAPI_GOOGLE_POSTS_FAILED" as const : null,
    ].filter((code): code is GoogleEvidenceFailure => code !== null),
  };
}
