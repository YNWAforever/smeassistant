import type { PrototypeLocale } from "@/lib/copy";
import { copy } from "@/lib/copy";
import type { Priority } from "@/lib/domain";
import { readableFindingKey } from "@/lib/report/finding-label";

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
