import { NextResponse } from "next/server";
import { isLocale } from "@/lib/locale";
import type { PrototypeLocale } from "@/lib/copy";
import { studioStatusForError } from "@/lib/studio/errors";
import type { StudioErrorCode } from "@/lib/studio/types";

/**
 * Shared HTTP plumbing for `/api/studio/**` (design §7).
 *
 * Every Studio route answers `404 { error: "not_found" }` while the feature flag
 * is off — before auth, the limiter or any query — and every pre-stream failure
 * is the same JSON envelope and status mapping as the live assistant route.
 */

export const STUDIO_JSON_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
});

export const STUDIO_SSE_HEADERS = Object.freeze({
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no",
  "X-Content-Type-Options": "nosniff",
  Connection: "keep-alive",
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Undefined for "absent or empty"; null for "present but malformed". */
export function optionalUuid(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" && UUID_RE.test(value) ? value.toLowerCase() : null;
}

/** Undefined for absent/empty; null for malformed; a positive integer otherwise. */
export function optionalPositiveInt(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function studioJson(body: unknown, status = 200): Response {
  return NextResponse.json(body, { status, headers: STUDIO_JSON_HEADERS });
}

/** The JSON body for a pre-stream failure; the status comes from the one mapping table. */
export function studioError(code: StudioErrorCode): Response {
  return studioJson({ error: code }, studioStatusForError(code));
}

export function studioDisabledResponse(): Response {
  return studioJson({ error: "not_found" }, 404);
}

export function authFailure(auth: { status: 401 | 403 | 404; code: "unauthenticated" | "forbidden" | "not_found" }): Response {
  return studioJson({ error: auth.code }, auth.status);
}

/**
 * The request locale. The Studio page is locale-prefixed but the SSE route has
 * no path locale, so the client passes `?locale=`; a body field and a default
 * keep the route usable from a bare client, and an invalid explicit value is a
 * 400 rather than a silent fallback that would write the wrong language.
 */
export function parseStudioLocale(request: Request, body?: Record<string, unknown>): PrototypeLocale | null {
  const raw = new URL(request.url).searchParams.get("locale")
    ?? (body && typeof body.locale === "string" ? body.locale : undefined);
  if (raw === undefined || raw === null || raw === "") return "zh-HK";
  return isLocale(raw) ? raw : null;
}
