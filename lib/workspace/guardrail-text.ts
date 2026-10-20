import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import { classifyGuardrailWarning, type GuardrailFlag } from "@/lib/workspace/version-meta"

/**
 * Who reads the warning. An approver (the workspace action detail) is told to
 * check before approving; a visitor of the unsaved preview (P4.5) has nothing
 * to approve, so the two "check it" lines say "before using it" instead.
 */
export type GuardrailAudience = "approver" | "visitor"

/** The agents' warning vocabulary, in words an approver (or a preview visitor) can act on. */
export function guardrailText(flag: GuardrailFlag, locale: PrototypeLocale, audience: GuardrailAudience = "approver"): string {
  const t = copy[locale].workspaceLabels.guardrails
  const detail = { detail: flag.detail ?? "" }
  switch (flag.code) {
    case "offer_price_mismatch":
      return t.offerPriceMismatch
    case "offer_dates_missing":
      return t.offerDatesMissing
    case "offer_prohibited_term":
      return t.offerProhibitedTerm
    case "unexpected_link":
      return t.unexpectedLink[audience]
    case "unconfirmed_claim":
      return t.unconfirmedClaim[audience]
    case "prohibited_term":
      return fill(t.prohibitedTerm, detail)
    case "compensation_promise":
      return t.compensationPromise
    case "alt_text_missing":
      return t.altTextMissing
    case "too_many_hashtags":
      return t.tooManyHashtags
    case "jsonld_missing":
      return t.jsonldMissing
    case "jsonld_invalid":
      return t.jsonldInvalid
    case "jsonld_mismatch":
      return t.jsonldMismatch
    case "title_too_long":
      return fill(t.titleTooLong, detail)
    case "bio_too_long":
      return fill(t.bioTooLong, detail)
    default:
      return fill(t.bodyTooLong, detail)
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
