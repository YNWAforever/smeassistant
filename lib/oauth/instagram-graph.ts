// Meta Graph publishing calls for a professional Instagram account (P20.2a).
//
// The connection module (lib/oauth/instagram-connection.ts) owns consent and
// token exchange; this module owns the two-write publish protocol and the read
// used to reconcile an uncertain publish. It never logs a caption, token, media
// URL or provider body, and every call goes through an injected transport so
// tests never reach Meta.
//
// Protocol (Instagram Graph API, single feed image):
//   1. POST /{ig-user-id}/media            { image_url, caption } -> container id
//   2. GET  /{container-id}?fields=status_code                       -> poll status
//   3. POST /{ig-user-id}/media_publish     { creation_id }          -> media id
//   4. GET  /{media-id}?fields=id,permalink,timestamp                -> reconcile
//
// Nothing here retries a write. A timeout or an ambiguous provider error is
// returned as an error the caller treats as uncertain; only the caller's
// bounded container-status polling is a retry, and that is a read.

import { instagramApiVersion } from "@/lib/oauth/instagram-connection";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Content-free error codes. `provider_unavailable` covers transport failures,
 * HTTP 5xx and any Graph error this module does not recognise; the route layer
 * maps the code to user copy and never stores provider text.
 */
export type InstagramGraphErrorCode =
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "not_found"
  | "invalid_request"
  | "media_url_unreachable"
  | "already_published"
  | "provider_unavailable";

export class InstagramGraphError extends Error {
  constructor(
    readonly code: InstagramGraphErrorCode,
    /** Meta's numeric error code, for server logs only; never user copy. */
    readonly graphCode: number | null = null,
  ) {
    super(code);
    this.name = "InstagramGraphError";
  }
}

export interface InstagramGraphTransport {
  fetch: typeof fetch;
}

export interface InstagramGraphDeps {
  transport?: InstagramGraphTransport;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function fetchFor(deps: InstagramGraphDeps): typeof fetch {
  return deps.fetchImpl ?? deps.transport?.fetch ?? fetch;
}

interface GraphResponse {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
}

async function graphJson(fetchImpl: typeof fetch, url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<GraphResponse> {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    // No URL in the log line: it carries the media URL and the token.
    console.error("[instagram-graph] request failed");
    return { ok: false, status: 0, body: null };
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok, status: response.status, body };
}

/** Classifies a Graph error body/status into the content-free taxonomy. */
function classify(result: GraphResponse): InstagramGraphError {
  const error = result.body?.error;
  const fields = error && typeof error === "object" ? (error as { code?: unknown; error_subcode?: unknown; message?: unknown; type?: unknown }) : null;
  const code = typeof fields?.code === "number" ? fields.code : null;
  const message = typeof fields?.message === "string" ? fields.message : "";
  const subcode = typeof fields?.error_subcode === "number" ? fields.error_subcode : null;

  if (result.status === 401 || code === 190 || code === 102) return new InstagramGraphError("unauthorized", code);
  if (result.status === 403 || code === 10 || code === 200) return new InstagramGraphError("forbidden", code);
  if (result.status === 429 || code === 4 || code === 17 || code === 32 || code === 613) return new InstagramGraphError("rate_limited", code);
  if (result.status === 404 || code === 803) return new InstagramGraphError("not_found", code);
  // A second media_publish for the same container: a retry that reached Meta
  // twice must not read as a generic malformed request.
  if (code === 9007) return new InstagramGraphError("already_published", code);
  // Meta's image-fetch failures (aspect ratio, unreachable URL, unsupported
  // format) all surface as one of these; the owner action is the same.
  if (code === 9004 || code === 36000 || code === 352 || subcode === 2207009) return new InstagramGraphError("media_url_unreachable", code);
  if (result.status === 400 || code === 100 || code === 2) {
    // 100 with a media-related message is an unreachable/invalid image URL;
    // everything else 100-shaped is a malformed request we sent ourselves.
    if (/image|media|url|aspect|format|jpeg|photo/i.test(message)) return new InstagramGraphError("media_url_unreachable", code);
    return new InstagramGraphError("invalid_request", code);
  }
  return new InstagramGraphError("provider_unavailable", code);
}

function graphBase(): string {
  return `https://graph.facebook.com/${instagramApiVersion()}`;
}

/** Step 1: creates the media container. Returns the container id. */
export async function createMediaContainer(
  accessToken: string,
  igUserId: string,
  input: { imageUrl: string; caption: string },
  deps: InstagramGraphDeps = {},
): Promise<string> {
  const url = `${graphBase()}/${encodeURIComponent(igUserId)}/media`;
  const body = new URLSearchParams({ image_url: input.imageUrl, caption: input.caption, access_token: accessToken });
  const result = await graphJson(fetchFor(deps), url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  }, deps.timeoutMs);
  if (!result.ok) throw classify(result);
  const id = typeof result.body?.id === "string" ? result.body.id : "";
  if (!id) throw new InstagramGraphError("provider_unavailable", null);
  return id;
}

export type InstagramContainerStatus = "in_progress" | "finished" | "error" | "expired" | "published";

const CONTAINER_STATES: ReadonlyMap<string, InstagramContainerStatus> = new Map([
  ["IN_PROGRESS", "in_progress"],
  ["FINISHED", "finished"],
  ["ERROR", "error"],
  ["EXPIRED", "expired"],
  ["PUBLISHED", "published"],
]);

/**
 * Step 2: bounded read of the container status. A container Meta reports
 * `ERROR`/`EXPIRED` is a definite pre-write failure; `in_progress` means keep
 * polling (the caller owns the bound), and nothing here throws for it.
 */
export async function getMediaContainerStatus(
  accessToken: string,
  containerId: string,
  deps: InstagramGraphDeps = {},
): Promise<InstagramContainerStatus> {
  const url = new URL(`${graphBase()}/${encodeURIComponent(containerId)}`);
  url.searchParams.set("fields", "status_code");
  url.searchParams.set("access_token", accessToken);
  const result = await graphJson(fetchFor(deps), url.toString(), {}, deps.timeoutMs);
  if (!result.ok) throw classify(result);
  const raw = typeof result.body?.status_code === "string" ? result.body.status_code : "";
  const status = CONTAINER_STATES.get(raw.toUpperCase());
  if (!status) throw new InstagramGraphError("provider_unavailable", null);
  return status;
}

/**
 * Step 3: the one write. The id returned is Meta's media id; the publish is
 * idempotent per container (Meta refuses a second publish of the same
 * container), so a retry with the same container cannot double-post.
 */
export async function publishMediaContainer(
  accessToken: string,
  igUserId: string,
  containerId: string,
  deps: InstagramGraphDeps = {},
): Promise<string> {
  const url = `${graphBase()}/${encodeURIComponent(igUserId)}/media_publish`;
  const body = new URLSearchParams({ creation_id: containerId, access_token: accessToken });
  const result = await graphJson(fetchFor(deps), url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  }, deps.timeoutMs);
  if (!result.ok) throw classify(result);
  const id = typeof result.body?.id === "string" ? result.body.id : "";
  if (!id) throw new InstagramGraphError("provider_unavailable", null);
  return id;
}

export type InstagramMedia = { id: string; permalink: string | null; timestamp: string | null };

/**
 * Reads a recently published media item. Also used by reconcile to find the
 * item a publish may have created: `caption` is only returned by the list
 * endpoint, so `listRecentMedia` carries it.
 */
export type InstagramRecentMedia = InstagramMedia & { caption: string | null };

/** Step 4b: lists the account's recent media, newest first. */
export async function listRecentMedia(
  accessToken: string,
  igUserId: string,
  deps: InstagramGraphDeps & { limit?: number } = {},
): Promise<InstagramRecentMedia[]> {
  const url = new URL(`${graphBase()}/${encodeURIComponent(igUserId)}/media`);
  url.searchParams.set("fields", "id,permalink,timestamp,caption");
  url.searchParams.set("limit", String(deps.limit ?? 20));
  url.searchParams.set("access_token", accessToken);
  const result = await graphJson(fetchFor(deps), url.toString(), {}, deps.timeoutMs);
  if (!result.ok) throw classify(result);
  const data = result.body?.data;
  if (!Array.isArray(data)) return [];
  const media: InstagramRecentMedia[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const value = item as Record<string, unknown>;
    if (typeof value.id !== "string") continue;
    media.push({
      id: value.id,
      permalink: typeof value.permalink === "string" ? value.permalink : null,
      timestamp: typeof value.timestamp === "string" ? value.timestamp : null,
      caption: typeof value.caption === "string" ? value.caption : null,
    });
  }
  return media;
}

/** Step 4: reads a published media back; used to settle an uncertain publish. */
export async function getPublishedMedia(
  accessToken: string,
  mediaId: string,
  deps: InstagramGraphDeps = {},
): Promise<InstagramMedia> {
  const url = new URL(`${graphBase()}/${encodeURIComponent(mediaId)}`);
  url.searchParams.set("fields", "id,permalink,timestamp");
  url.searchParams.set("access_token", accessToken);
  const result = await graphJson(fetchFor(deps), url.toString(), {}, deps.timeoutMs);
  if (!result.ok) throw classify(result);
  const id = typeof result.body?.id === "string" ? result.body.id : mediaId;
  return {
    id,
    permalink: typeof result.body?.permalink === "string" ? result.body.permalink : null,
    timestamp: typeof result.body?.timestamp === "string" ? result.body.timestamp : null,
  };
}

/** One platform-reported value over a window. `value` is null when Meta returned no number. */
export type InstagramInsightPoint = {
  metric: string;
  period: string | null;
  endTime: string | null;
  value: number | null;
};

function insightNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/**
 * Parses `/insights` payloads for both edges. Account metrics come back as
 * `values: [{value, end_time}]` (one point per day); media metrics usually come
 * back as a single `values: [{value}]` or a bare `value`. Anything malformed is
 * skipped rather than guessed; the caller records a missing metric as
 * unavailable.
 */
function parseInsightPoints(body: Record<string, unknown> | null): InstagramInsightPoint[] {
  const data = body?.data;
  if (!Array.isArray(data)) return [];
  const points: InstagramInsightPoint[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.name !== "string" || !entry.name) continue;
    const period = typeof entry.period === "string" ? entry.period : null;
    if (Array.isArray(entry.values)) {
      for (const raw of entry.values) {
        if (!raw || typeof raw !== "object") continue;
        const point = raw as Record<string, unknown>;
        points.push({
          metric: entry.name,
          period,
          endTime: typeof point.end_time === "string" ? point.end_time : null,
          value: insightNumber(point.value),
        });
      }
    } else if (insightNumber(entry.value) !== null) {
      points.push({ metric: entry.name, period, endTime: null, value: insightNumber(entry.value) });
    }
  }
  return points;
}

/**
 * Reads account-level insights for the connected professional account. The
 * caller owns the metric list and the window; this function only shapes Meta's
 * answer. Requires `instagram_manage_insights` on the token.
 */
export async function getAccountInsights(
  accessToken: string,
  igUserId: string,
  input: { metrics: readonly string[]; period?: "day" | "week"; since?: number; until?: number },
  deps: InstagramGraphDeps = {},
): Promise<InstagramInsightPoint[]> {
  const url = new URL(`${graphBase()}/${encodeURIComponent(igUserId)}/insights`);
  url.searchParams.set("metric", input.metrics.join(","));
  url.searchParams.set("period", input.period ?? "day");
  if (input.since !== undefined) url.searchParams.set("since", String(input.since));
  if (input.until !== undefined) url.searchParams.set("until", String(input.until));
  url.searchParams.set("access_token", accessToken);
  const result = await graphJson(fetchFor(deps), url.toString(), {}, deps.timeoutMs);
  if (!result.ok) throw classify(result);
  return parseInsightPoints(result.body);
}

/**
 * Reads per-media insights for one published media item. Requires
 * `instagram_manage_insights`; a media id the account cannot see is
 * `not_found`, which the caller records as unavailable for that item.
 */
export async function getMediaInsights(
  accessToken: string,
  mediaId: string,
  metrics: readonly string[],
  deps: InstagramGraphDeps = {},
): Promise<InstagramInsightPoint[]> {
  const url = new URL(`${graphBase()}/${encodeURIComponent(mediaId)}/insights`);
  url.searchParams.set("metric", metrics.join(","));
  url.searchParams.set("access_token", accessToken);
  const result = await graphJson(fetchFor(deps), url.toString(), {}, deps.timeoutMs);
  if (!result.ok) throw classify(result);
  return parseInsightPoints(result.body);
}
