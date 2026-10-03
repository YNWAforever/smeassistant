import type { PrototypeLocale } from "@/lib/copy"
import { classifyGuardrailWarning, type GuardrailFlag } from "@/lib/workspace/version-meta"

/**
 * Who reads the warning. An approver (the workspace action detail) is told to
 * check before approving; a visitor of the unsaved preview (P4.5) has nothing
 * to approve, so the two "check it" lines say "before using it" instead.
 */
export type GuardrailAudience = "approver" | "visitor"

/** The agents' warning vocabulary, in words an approver (or a preview visitor) can act on. */
export function guardrailText(flag: GuardrailFlag, locale: PrototypeLocale, audience: GuardrailAudience = "approver"): string {
  const isChinese = locale !== "en"
  const visitor = audience === "visitor"
  switch (flag.code) {
    case "unexpected_link":
      if (visitor) return locale === "zh-HK" ? "含有你沒有提供的連結，使用前請先檢查。" : locale === "zh-TW" ? "包含你沒有提供的連結，使用前請先確認。" : "Contains a link you did not supply — check it before using it."
      return locale === "zh-HK" ? "含有你沒有提供的連結，審批前請先檢查。" : locale === "zh-TW" ? "包含你沒有提供的連結，核准前請先確認。" : "Contains a link you did not supply — check it before approving."
    case "unconfirmed_claim":
      if (visitor) return locale === "zh-HK" ? "提及你未確認的價錢或誇大字眼，使用前請先檢查。" : locale === "zh-TW" ? "提到你未確認的價格或誇大用語，使用前請先確認。" : "Mentions a price or superlative you have not confirmed — check it before using it."
      return locale === "zh-HK" ? "提及你未確認的價錢或誇大字眼，審批前請先檢查。" : locale === "zh-TW" ? "提到你未確認的價格或誇大用語，核准前請先確認。" : "Mentions a price or superlative that is not in your confirmed facts — check it before approving."
    case "prohibited_term":
      return isChinese ? `含品牌禁用詞：${flag.detail ?? ""}` : `Contains a prohibited brand term: ${flag.detail ?? ""}`
    case "compensation_promise":
      return isChinese ? "似乎承諾補償、退款或折扣。" : "Appears to promise compensation, a refund or a discount."
    case "alt_text_missing":
      return isChinese ? "缺少圖片替代文字。" : "Image alt text is missing."
    case "too_many_hashtags":
      return isChinese ? "主題標籤過多。" : "Too many hashtags."
    case "jsonld_missing":
      return isChinese ? "缺少 JSON-LD 結構化資料。" : "The JSON-LD block is missing."
    case "jsonld_invalid":
      return isChinese ? "JSON-LD 結構無效，下次掃描將無法讀取。" : "The JSON-LD is not valid, so the next scan will not read it."
    case "jsonld_mismatch":
      return isChinese ? "JSON-LD 的問答與上方文字不一致。" : "The JSON-LD questions and answers do not match the text above them."
    case "title_too_long":
      return isChinese ? `標題超過 ${flag.detail ?? ""} 字元。` : `Title is longer than ${flag.detail ?? ""} characters.`
    case "bio_too_long":
      return isChinese ? `簡介超過 ${flag.detail ?? ""} 字元。` : `Bio is longer than ${flag.detail ?? ""} characters.`
    default:
      return isChinese ? `內文超過 ${flag.detail ?? ""} 字元。` : `Body is longer than ${flag.detail ?? ""} characters.`
  }
}

/**
 * Raw warning codes as visitor text (P4.5, ruling R13): known codes are
 * translated, repeats collapse, and anything unrecognised (the model's own
 * free-text notes) is dropped rather than shown raw.
 */
export function visitorWarningTexts(warnings: readonly string[], locale: PrototypeLocale): string[] {
  const texts: string[] = []
  for (const warning of warnings) {
    const flag = classifyGuardrailWarning(warning)
    // The preview's default brand has no prohibited terms, so a prohibited_term warning could only
    // be the model's own text, whose detail is not ours to echo.
    if (!flag || flag.code === "prohibited_term") continue
    const text = guardrailText(flag, locale, "visitor")
    if (!texts.includes(text)) texts.push(text)
  }
  return texts
}
