import type { PrototypeLocale } from "@/lib/copy";
import { copy } from "@/lib/copy";
import type { Priority } from "@/lib/domain";
import { readableFindingKey } from "@/lib/report/finding-label";

/**
 * Why two scans could not be compared, in the owner's language.
 *
 * Shared so Home and Insights cannot diverge: Home used to render the raw
 * engine code ("Reason: NO_DIFF") while Insights had a private catalogue. The
 * default deliberately does NOT echo an unrecognised code -- that is how the
 * raw value reached the page in the first place.
 */
export function comparisonReasonText(reason: string | null | undefined, isChinese: boolean): string {
  switch (reason) {
    case "SCORING_VERSION_MISMATCH":
      return isChinese ? "評分版本不同" : "Scoring version changed";
    case "SCORING_VERSION_UNKNOWN":
      return isChinese ? "評分版本未知" : "Scoring version unknown";
    case "NO_SHARED_MEASURED_MODULE":
      return isChinese ? "沒有共同已量度來源" : "No shared measured source";
    case "INSUFFICIENT_INDEPENDENT_CHANNELS":
      return isChinese ? "獨立來源不足" : "Too few independent channels";
    case "NO_DIFF":
      return isChinese ? "尚未有第二次可比較的掃描" : "No second comparable scan yet";
    default:
      return isChinese ? "尚無可比較掃描" : "No comparable scan yet";
  }
}

/** Presentation helpers shared by the workspace pages (server-safe, no React). */
export function formatDateTime(iso: string | null | undefined, locale: PrototypeLocale, timezone: string, style: "date" | "datetime" = "datetime"): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
      dateStyle: style === "date" ? "medium" : "medium",
      ...(style === "datetime" ? { timeStyle: "short" as const } : {}),
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDay(iso: string | null | undefined, locale: PrototypeLocale, timezone: string): string {
  return formatDateTime(iso, locale, timezone, "date");
}

export function effortLabel(minutes: number, locale: PrototypeLocale): string {
  return locale === "en" ? `${minutes} minutes` : `${minutes} 分鐘`;
}

export function priorityLabel(priority: Priority, locale: PrototypeLocale): string {
  return copy[locale].workspace.priority[priority];
}

export function priorityClass(priority: Priority): string {
  return `priority-${priority}`;
}

export function scorePercent(coverage: number | null | undefined): number | null {
  if (coverage === null || coverage === undefined || !Number.isFinite(coverage)) return null;
  return coverage <= 1 ? Math.round(coverage * 100) : Math.round(coverage);
}

export function signed(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(digits));
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export function metricLabel(key: string, locale: PrototypeLocale): string {
  const table = copy[locale].workspace.metrics as Record<string, string>;
  return table[key] ?? key;
}

export function findingLabel(key: string): string {
  return readableFindingKey(key);
}

export function stateLabel(key: string, locale: PrototypeLocale): string {
  const table = copy[locale].workspace.states as Record<string, string>;
  return table[key] ?? key;
}

export function withLocation(href: string, location: string | null | undefined): string {
  if (!location) return href;
  return `${href}${href.includes("?") ? "&" : "?"}location=${encodeURIComponent(location)}`;
}
