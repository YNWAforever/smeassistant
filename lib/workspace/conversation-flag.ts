/** Server-side opt-in only. Never read this flag in the browser or change hosted configuration here. */
export function conversationHomeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.CONVERSATION_HOME_ENABLED !== "true") return false;
  if (env.VERCEL_ENV !== undefined) return env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development";
  if (env.VERCEL) return false;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test";
}
