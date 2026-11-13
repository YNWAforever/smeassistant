import { actionEvidenceCopy } from "@/lib/copy-action-evidence";
import { type LocalizedText } from "@/lib/domain";
import { findingLabel } from "@/lib/funnel/report-labels";
import { FINDING_KEYS } from "@sme-scanner/scoring";

const RECORDED_FINDING_KEYS = new Set<string>([...FINDING_KEYS, "website.checks.faq_schema"]);

/**
 * owner_message prose mixes observations, advice and possible business effects.
 * A finding key establishes that a scan flagged a rule; it does not establish
 * those effects. Use only catalogued labels for observed action detail, including
 * legacy saved rows. Never echo unknown keys or accept prose as a finding label.
 */
export function recordedFindingEvidence(keys: readonly string[]) {
  const knownKeys = [...new Set(keys)].filter(key => RECORDED_FINDING_KEYS.has(key));
  const detail = (locale: keyof LocalizedText) => {
    const labels = [...new Set(knownKeys.map(key => key === "website.checks.faq_schema" ? actionEvidenceCopy[locale].websiteFaq : findingLabel(locale, key)))];
    return labels.length
      ? actionEvidenceCopy[locale].recorded.replace("{findings}", labels.join(locale === "en" ? "; " : "、"))
      : actionEvidenceCopy[locale].unavailable;
  };
  return {
    factType: knownKeys.length ? "Observed" as const : "Unknown" as const,
    detail: { en: detail("en"), "zh-HK": detail("zh-HK"), "zh-TW": detail("zh-TW") },
  };
}
