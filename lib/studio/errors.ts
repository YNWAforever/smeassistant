import type { PrototypeLocale } from "@/lib/copy";
import { studioText } from "./copy";
import type { StudioErrorCode } from "./types";

/**
 * The one status mapping for Conversation Studio failures (design §7).
 *
 * It mirrors the live assistant route (`app/api/assistant/run/route.ts`) so the
 * same failure means the same HTTP status across the product: identity 401,
 * role/scope 403, missing-or-foreign row 404, malformed body 400, a conflict
 * with the conversation's current state 409, a limiter or budget refusal 429,
 * and any provider/dependency outage 503. A pre-stream failure is JSON with
 * `{ error: <code> }`; an in-stream failure is an SSE `error` event carrying the
 * same code, so the client needs one table.
 */
export type StudioErrorStatus = 400 | 401 | 403 | 404 | 409 | 429 | 503;

export const STUDIO_ERROR_STATUS: Readonly<Record<StudioErrorCode, StudioErrorStatus>> = Object.freeze({
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  rate_limited: 429,
  ai_paused: 503,
  ai_budget_reached: 429,
  ai_unavailable: 503,
  archived: 409,
  conversation_busy: 409,
  unavailable: 503,
});

export function studioStatusForError(code: StudioErrorCode): StudioErrorStatus {
  return STUDIO_ERROR_STATUS[code] ?? 503;
}

/** The localized sentence the orchestrator stores and the client can show. */
export function studioErrorMessage(locale: PrototypeLocale, code: StudioErrorCode): string {
  return studioText(locale).errors[code] ?? studioText(locale).errors.unavailable;
}

/**
 * Only transport/provider conditions are worth a retry button. A budget refusal,
 * a pause, a role refusal or an archived conversation will fail the same way
 * again until something outside the retry changes.
 */
export function isRetryableStudioError(code: StudioErrorCode): boolean {
  return code === "ai_unavailable" || code === "unavailable" || code === "rate_limited";
}

/** JSON body used by every Studio route for a pre-stream failure. */
export function studioErrorBody(code: StudioErrorCode): { error: StudioErrorCode } {
  return { error: code };
}
