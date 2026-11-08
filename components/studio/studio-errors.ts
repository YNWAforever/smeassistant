import type { StudioCopy } from "@/lib/studio/copy"

/**
 * Every Studio error code maps to one sentence from `studioText(locale)`.
 * Unknown codes (a peer route's extra validation code, a socket failure) fall
 * back to the honest generic sentence, never to a hard-coded English string.
 */
export function studioErrorText(t: StudioCopy, code: string): string {
  const table = t.errors as unknown as Record<string, string>
  if (typeof table[code] === "string") return table[code]
  if (code === "network" || code === "offline") return t.errors.network
  if (code === "stream") return t.errors.stream
  return t.errors.unavailable
}

/** The failure sentence for a provider/pause state; the composer shows it in place of the hint. */
export function studioBlockedText(t: StudioCopy, code: "ai_paused" | "ai_unavailable"): string {
  return code === "ai_paused" ? t.errors.ai_paused : t.notices.aiUnavailable
}

/** A short, localised label for the conversation list when the row has no title yet. */
export function studioConversationLabel(t: StudioCopy, title: string): string {
  const trimmed = title.trim()
  return trimmed.length > 0 ? trimmed : t.rail.untitled
}
