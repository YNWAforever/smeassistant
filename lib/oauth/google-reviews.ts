// Google Business Profile reviews: finding the managed location for a place,
// listing reviews that still need a reply, and writing or removing one reply.
//
// The only module that talks to the v4 reviews API. It follows the
// google-business-profile.ts conventions: an injected fetchImpl, a 10 s
// AbortSignal on every call, and errors that carry only a code. A thrown
// GbpError never holds the access token, review text, reviewer names, reply
// text or a Google response body -- not in its message, not as a cause, not
// as an extra property -- and nothing here logs.

import { listManagedLocations } from "./google-business-profile";

export const REVIEWS_BASE = "https://mybusiness.googleapis.com/v4";

const REVIEWS_PAGE_SIZE = 50;
const REVIEWS_ORDER_BY = "updateTime desc";
const REVIEWS_MAX_PAGES = 3;
const REVIEWS_MAX_TARGETS = 50;
const EXCERPT_CODE_POINTS = 200;
const TIMEOUT_MS = 10_000;

export type GbpErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "provider_error"
  | "timeout"
  | "network";

export class GbpError extends Error {
  readonly code: GbpErrorCode;

  constructor(code: GbpErrorCode) {
    super(code);
    this.code = code;
  }
}
// On the prototype, so the only own enumerable key of an instance is `code`.
Object.defineProperty(GbpError.prototype, "name", { value: "GbpError", writable: true, configurable: true });

export type GbpReviewTarget = {
  reviewName: string;
  reviewer: string;
  starRating: 1 | 2 | 3 | 4 | 5 | null;
  createTime: string;
  excerpt: string;
};

export type GbpLocationRef = { accountName: string; locationName: string };

interface ReviewResource {
  name?: string;
  reviewer?: { displayName?: string };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
}

interface ReviewsResponse {
  reviews?: ReviewResource[];
  nextPageToken?: string;
}

const STAR_RATINGS: ReadonlyMap<string, 1 | 2 | 3 | 4 | 5> = new Map([
  ["ONE", 1],
  ["TWO", 2],
  ["THREE", 3],
  ["FOUR", 4],
  ["FIVE", 5],
]);

const REVIEW_ID = /^[A-Za-z0-9_-]+$/;

function statusToCode(status: number): GbpErrorCode {
  switch (status) {
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 429:
      return "rate_limited";
    default:
      return "provider_error";
  }
}

function isAbort(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) return false;
  const name = (error as { name?: unknown }).name;
  return name === "TimeoutError" || name === "AbortError";
}

/**
 * One fetch with code-only failure: a rejection becomes `timeout` (an abort,
 * which is what AbortSignal.timeout produces) or `network`; a non-2xx becomes
 * the mapped status code. The original error and the response body are
 * dropped on purpose -- either can echo the request, and so the token.
 */
async function send(fetchImpl: typeof fetch, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(input, init);
  } catch (error) {
    throw new GbpError(isAbort(error) ? "timeout" : "network");
  }
  if (!response.ok) throw new GbpError(statusToCode(response.status));
  return response;
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new GbpError("provider_error");
  }
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * The managed location whose metadata carries this placeId: the first match
 * across every account (in API order) and location the token can see, or
 * null when none does. Listing failures surface as GbpError codes.
 */
export async function findLocationForPlace(
  accessToken: string,
  placeId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GbpLocationRef | null> {
  // listManagedLocations owns the paging and the timeout; this wrapper only
  // converts its failures into GbpError codes before they reach it.
  const guarded: typeof fetch = (input, init) => send(fetchImpl, input, init);
  let locations: Awaited<ReturnType<typeof listManagedLocations>>;
  try {
    locations = await listManagedLocations(accessToken, guarded);
  } catch (error) {
    // Body parsing happens inside listManagedLocations (raw response.json()),
    // whose SyntaxError can quote Google's body. Only a code leaves here.
    if (error instanceof GbpError) throw error;
    throw new GbpError("provider_error");
  }
  const match = locations.find((location) => location.placeId === placeId);
  return match ? { accountName: match.accountName, locationName: match.locationName } : null;
}

/**
 * Reviews at this location without an owner reply, newest first (the API's
 * `updateTime desc` order), at most 50, reading at most 3 pages of 50. A
 * review "has a reply" when `reviewReply.comment` is non-empty. Reviews whose
 * name is missing or not under this location are dropped.
 */
export async function listUnrepliedReviews(
  accessToken: string,
  location: GbpLocationRef,
  fetchImpl: typeof fetch = fetch,
): Promise<GbpReviewTarget[]> {
  const targets: GbpReviewTarget[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < REVIEWS_MAX_PAGES; page += 1) {
    const url = new URL(`${REVIEWS_BASE}/${location.accountName}/${location.locationName}/reviews`);
    url.searchParams.set("pageSize", String(REVIEWS_PAGE_SIZE));
    url.searchParams.set("orderBy", REVIEWS_ORDER_BY);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await send(fetchImpl, url.toString(), {
      headers: authHeaders(accessToken),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await readJson<ReviewsResponse>(response);

    for (const review of body.reviews ?? []) {
      if (review.reviewReply?.comment) continue;
      if (!review.name || !reviewNameIsUnder(review.name, location)) continue;
      targets.push({
        reviewName: review.name,
        reviewer: review.reviewer?.displayName ?? "",
        starRating: STAR_RATINGS.get(review.starRating ?? "") ?? null,
        createTime: review.createTime ?? "",
        excerpt: [...(review.comment ?? "")].slice(0, EXCERPT_CODE_POINTS).join(""),
      });
      if (targets.length >= REVIEWS_MAX_TARGETS) return targets;
    }

    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return targets;
}

/** One review's current owner reply, as Google holds it now. */
export async function getReview(
  accessToken: string,
  reviewName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ name: string; replyComment: string | null; replyUpdateTime: string | null }> {
  const response = await send(fetchImpl, `${REVIEWS_BASE}/${reviewName}`, {
    method: "GET",
    headers: authHeaders(accessToken),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await readJson<ReviewResource>(response);
  return {
    name: body.name ?? reviewName,
    replyComment: body.reviewReply?.comment ?? null,
    replyUpdateTime: body.reviewReply?.updateTime ?? null,
  };
}

/** Creates or replaces the owner reply. The response body is not read. */
export async function putReply(
  accessToken: string,
  reviewName: string,
  comment: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await send(fetchImpl, `${REVIEWS_BASE}/${reviewName}/reply`, {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ comment }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** Removes the owner reply. A 404 resolves: the reply is already gone. */
export async function deleteReply(
  accessToken: string,
  reviewName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    await send(fetchImpl, `${REVIEWS_BASE}/${reviewName}/reply`, {
      method: "DELETE",
      headers: authHeaders(accessToken),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof GbpError && error.code === "not_found") return;
    throw error;
  }
}

/** Equal after NFC normalisation, CRLF → LF, and trimming. */
export function sameReply(a: string, b: string): boolean {
  const normalise = (s: string) => s.normalize("NFC").replace(/\r\n/g, "\n").trim();
  return normalise(a) === normalise(b);
}

/**
 * True only for `${accountName}/${locationName}/reviews/<id>` with `<id>`
 * matching `^[A-Za-z0-9_-]+$` -- no extra segments, no encoded slashes, no
 * other location.
 */
export function reviewNameIsUnder(reviewName: string, location: GbpLocationRef): boolean {
  const prefix = `${location.accountName}/${location.locationName}/reviews/`;
  if (!reviewName.startsWith(prefix)) return false;
  return REVIEW_ID.test(reviewName.slice(prefix.length));
}
