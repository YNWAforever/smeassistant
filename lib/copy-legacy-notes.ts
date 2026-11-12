import type { PrototypeLocale } from "@/lib/copy"

/**
 * One-time bridge copy for browser-only notes written before Kinnso became the
 * only chat. Import is explicit and never deletes the local copy.
 */
export type LegacyNotesCopy = {
  banner: {
    title: string
    body: string
    import: string
    importing: string
    review: string
    dismiss: string
    imported: string
    failed: string
  }
}

const en: LegacyNotesCopy = {
  banner: {
    title: "Your old notes are still here",
    body: "Bring your {count} browser notes into Kinnso so they sit beside the new conversation. Your local copy stays until you choose to clear it.",
    import: "Bring notes into Kinnso",
    importing: "Bringing notes over…",
    review: "Review old notes",
    dismiss: "Not now",
    imported: "{count} notes are now in Kinnso.",
    failed: "Could not bring the notes over. Try again from Old notes.",
  },
}

const zhHK: LegacyNotesCopy = {
  banner: {
    title: "你仲有舊筆記喺度",
    body: "將 {count} 則瀏覽器筆記搬入 Kinnso，同新對話放埋一齊。本機副本會保留，直到你自己清除。",
    import: "搬筆記入 Kinnso",
    importing: "搬緊筆記…",
    review: "睇舊筆記",
    dismiss: "遲啲先",
    imported: "已經有 {count} 則筆記喺 Kinnso。",
    failed: "搬唔到筆記。請去「舊筆記」再試。",
  },
}

const zhTW: LegacyNotesCopy = {
  banner: {
    title: "你還有舊筆記在這裡",
    body: "將 {count} 則瀏覽器筆記搬進 Kinnso，和新對話放在一起。本機副本會保留，直到你自己清除。",
    import: "搬筆記進 Kinnso",
    importing: "搬移筆記…",
    review: "看舊筆記",
    dismiss: "稍後",
    imported: "已經有 {count} 則筆記在 Kinnso。",
    failed: "無法搬移筆記。請到「舊筆記」再試。",
  },
}

export const legacyNotesCopy: Record<PrototypeLocale, LegacyNotesCopy> = {
  en,
  "zh-HK": zhHK,
  "zh-TW": zhTW,
}

/** Replace `{count}` without pulling in a formatter dependency. */
export function legacyNotesText(copy: LegacyNotesCopy, key: keyof LegacyNotesCopy["banner"], count: number): string {
  return copy.banner[key].replace("{count}", String(count))
}
