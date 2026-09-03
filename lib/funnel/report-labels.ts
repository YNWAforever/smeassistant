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

/** "IG_HANDLE_NOT_PROVIDED" → "IG handle not provided". */
export function humaniseLimitationCode(code: string): string {
  const [module, ...words] = code.split("_");
  return `${module.toUpperCase()} ${words.map((word) => word.toLowerCase()).join(" ")}`.trim();
}
