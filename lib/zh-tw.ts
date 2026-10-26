import type { PrototypeLocale } from "@/lib/copy"

/**
 * Taiwan wording for an inline zh-HK string. Hundreds of components write one
 * Chinese string for both zh-HK and zh-TW (`isChinese ? "…" : "…"`), so zh-TW
 * pages read 商戶 / 店主 / 地點 / 私隱 where Taiwan writes 店家 / 據點 / 隱私
 * (CLAUDE.md §5 copy hygiene). Each pair below is safe in every context it
 * appears in on these pages; anything context-dependent belongs in the
 * locale dictionaries instead.
 */
const HK_TO_TW: ReadonlyArray<readonly [string, string]> = [
  // Google's own Taiwan name for a Business Profile; must precede 商戶 → 店家.
  ["商戶檔案", "商家檔案"],
  ["私隱", "隱私"],
  ["商戶", "店家"],
  ["店主", "店家"],
  ["增長方案", "成長方案"],
  ["監察", "監控"],
  ["地點", "據點"],
  ["上載", "上傳"],
  ["覆蓋率", "涵蓋率"],
  ["量度", "量測"],
  ["電郵", "電子郵件"],
  ["質素", "品質"],
]

export function toTaiwanWording(text: string): string {
  return HK_TO_TW.reduce((value, [hk, tw]) => value.replaceAll(hk, tw), text)
}

/** The zh-HK string as given, or its Taiwan wording on zh-TW pages. */
export function zhFor(locale: PrototypeLocale, zhHK: string): string {
  return locale === "zh-TW" ? toTaiwanWording(zhHK) : zhHK
}

/**
 * `zhFor` for whole copy blocks written once for both Chinese locales
 * (`isChinese ? { … } : { … }`). Strings are converted recursively through
 * plain objects and arrays; anything else (icon components, numbers) is kept.
 */
export function zhDeep<T>(locale: PrototypeLocale, value: T): T {
  if (locale !== "zh-TW") return value
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return toTaiwanWording(node)
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === "object" && Object.getPrototypeOf(node) === Object.prototype) {
      return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, walk(child)]))
    }
    return node
  }
  return walk(value) as T
}
