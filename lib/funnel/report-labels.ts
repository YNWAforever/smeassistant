import { WEIGHTS, type ModuleKey } from "@sme-scanner/scoring";

import { hasMessage, t } from "@/lib/i18n";

export const REPORT_MODULE_ORDER = ["ig", "gbp", "aeo", "trust"] as const;

/** "gbp.reviews_volume_low" → "reviews volume low" (fallback when a label is missing). */
export function readableFindingKey(key: string): string {
  return key.split(".").pop()?.replaceAll("_", " ") ?? key;
}

/** "gbp.reviews_volume_low" → "findingGbpReviewsVolumeLow" (the `report.*` message key). */
export function findingMessageKey(findingKey: string): string {
  const [module = "", rest = ""] = findingKey.split(".");
  const pascal = rest
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `finding${module.charAt(0).toUpperCase()}${module.slice(1)}${pascal}`;
}

export function findingLabel(locale: string, findingKey: string): string {
  const key = `report.${findingMessageKey(findingKey)}`;
  return hasMessage(locale, key) || hasMessage("en", key) ? t(locale, key) : readableFindingKey(findingKey);
}

const MODULE_MESSAGE_KEYS: Record<string, string> = {
  ig: "report.moduleIg",
  gbp: "report.moduleGbp",
  aeo: "report.moduleAeo",
  trust: "report.moduleTrust",
};

export function moduleLabel(locale: string, module: string): string {
  const key = MODULE_MESSAGE_KEYS[module];
  return key ? t(locale, key) : module.toUpperCase();
}

const SEVERITY_MESSAGE_KEYS: Record<string, string> = {
  critical: "report.severityCritical",
  warning: "report.severityWarning",
  info: "report.severityInfo",
};

export function severityLabel(locale: string, severity: string): string {
  const key = SEVERITY_MESSAGE_KEYS[severity];
  return key ? t(locale, key) : severity;
}

/**
 * score_impact is module-relative; its effect on the 0–100 headline score is
 * score_impact × WEIGHTS[module]. One decimal, half away from zero, trailing
 * ".0" dropped: -3.75 → "-3.8", -6.0 → "-6" (upstream weighted-impact.ts).
 */
export function formatWeightedImpact(scoreImpact: number, module: string): string {
  const weighted = scoreImpact * (WEIGHTS[module as ModuleKey] ?? 0);
  const magnitude = Math.round(Math.abs(weighted) * 10) / 10;
  return String(weighted < 0 ? -magnitude : magnitude);
}

/** "−3.8 overall" / "整體 −3.8" via report.scoreImpactOverall. */
export function overallImpactLabel(locale: string, scoreImpact: number, module: string): string {
  return t(locale, "report.scoreImpactOverall", { value: formatWeightedImpact(scoreImpact, module) });
}

/** "IG_HANDLE_NOT_PROVIDED" → "IG handle not provided". Untranslated fallback for a code with no report.limitation* entry (below); never itself locale-aware, on purpose -- item 18's own scope. */
export function humaniseLimitationCode(code: string): string {
  const [module, ...words] = code.split("_");
  return `${module.toUpperCase()} ${words.map((word) => word.toLowerCase()).join(" ")}`.trim();
}

/** "IG_HANDLE_NOT_PROVIDED" → "limitationIgHandleNotProvided" (the `report.*` message key). */
export function limitationMessageKey(code: string): string {
  const pascal = code
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `limitation${pascal}`;
}

/**
 * Human-readable evidence limitation (P2.3 item 18), localized in en/zh-HK/zh-TW
 * when a translation exists. Never changes what the limitation code MEANS to
 * scoring -- this only chooses how to display the same code an owner already
 * sees today. Unknown codes use localized generic copy; raw diagnostics are
 * retained in evidence rather than disclosed in owner-facing text.
 */
export function limitationLabel(locale: string, code: string): string {
  const key = `report.${limitationMessageKey(code)}`;
  return KNOWN_LIMITATIONS.includes(code as KnownLimitationCode) ? t(locale, key) : limitationFallback(locale).unknown;
}

const KNOWN_LIMITATIONS = [
  "IG_HANDLE_NOT_PROVIDED", "IG_PROVIDER_FAILED", "IG_PROVIDER_NOT_CONFIGURED", "IG_NOT_MEASURED",
  "GBP_PROVIDER_FAILED", "GBP_NOT_MEASURED", "GOOGLE_PLACES_HTTP_FAILED", "GOOGLE_PLACES_NETWORK_FAILED", "GOOGLE_PLACES_REQUEST_DENIED",
  "SERPAPI_GBP_FAILED", "SERPAPI_GBP_INVALID_RESPONSE", "SERPAPI_GBP_NOT_CONFIGURED", "SERPAPI_GOOGLE_EVIDENCE_FAILED", "SERPAPI_GOOGLE_PHOTOS_FAILED", "SERPAPI_GOOGLE_POSTS_FAILED",
  "AEO_PROVIDER_FAILED", "AEO_PROVIDER_NOT_CONFIGURED", "AEO_NOT_MEASURED", "TRUST_NOT_MEASURED",
  "WEBSITE_URL_NOT_PROVIDED", "WEBSITE_UNREACHABLE", "WEBSITE_FETCH_FAILED", "WEBSITE_INVALID_CONTENT_TYPE", "WEBSITE_TOO_LARGE", "WEBSITE_URL_BLOCKED",
  "CLAIM_FAILED", "COLLECTION_FAILED", "PERSIST_FAILED", "PROCESSOR_FAILED", "SCORING_FAILED",
] as const;
export type KnownLimitationCode = typeof KNOWN_LIMITATIONS[number];

function limitationFallback(locale: string) {
  if (locale === "zh-HK") return {
    unknown: "未能量度這項證據", retry: "請核對已提供的公開來源，稍後再掃描。",
    instagram: "請提供商戶的公開 Instagram 帳號，再掃描。",
    website: "請核對商戶的公開網站網址及可用性，再掃描。",
  };
  if (locale === "zh-TW") return {
    unknown: "無法量測這項證據", retry: "請確認已提供的公開來源，稍後重新掃描。",
    instagram: "請提供店家的公開 Instagram 帳號，再重新掃描。",
    website: "請確認店家的公開網站網址及可用性，再重新掃描。",
  };
  return {
    unknown: "Evidence could not be measured", retry: "Check the supplied public sources and try scanning again later.",
    instagram: "Provide the business's public Instagram handle, then scan again.",
    website: "Check the business's public website address and availability, then scan again.",
  };
}

/** Provider diagnostics remain in the original evidence; owner copy is bounded. */
export function limitationCopy(locale: string, code: string | null) {
  const copy = limitationFallback(locale);
  return {
    reason: code ? limitationLabel(locale, code) : copy.unknown,
    nextStep: code === "IG_HANDLE_NOT_PROVIDED" ? copy.instagram
      : code === "TRUST_NOT_MEASURED" || code?.startsWith("WEBSITE_") ? copy.website : copy.retry,
  };
}
