/**
 * Conversation Studio feature flag (design §2 S7, §4).
 *
 * On only for the exact string "true"; anything else (unset, "TRUE", "1",
 * " true") keeps the Studio as absent as before the slice: the page 404s, the
 * nav hides the item and every `/api/studio/**` route returns 404 before it
 * touches auth, the limiter or the database.
 *
 * The environment record is a parameter so tests never depend on the ambient
 * process environment and a caller can pass an explicit one.
 */
export const STUDIO_FLAG_VARIABLE = "CONVERSATION_STUDIO_ENABLED" as const;

export function conversationStudioEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[STUDIO_FLAG_VARIABLE] === "true";
}
