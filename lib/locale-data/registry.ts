import type { PrototypeLocale } from "@/lib/copy";
import { localeData as bundled } from "@/lib/locale-data/all";

import type { LocaleData } from "./types";

const provided = new Map<PrototypeLocale, LocaleData>();

/** Called by LocaleDataProvider while rendering, before its children read any text. Idempotent. */
export function provideLocaleData(locale: PrototypeLocale, data: LocaleData): void {
  if (provided.get(locale) !== data) provided.set(locale, data);
}

export function findLocaleData(locale: PrototypeLocale): LocaleData | undefined {
  return provided.get(locale) ?? bundled[locale];
}

export function localeDataFor(locale: PrototypeLocale): LocaleData {
  const data = findLocaleData(locale);
  if (data) return data;
  const message = `Locale dictionary "${locale}" was not provided to this page; render it under <LocaleDataProvider>.`;
  // A read of a locale the page never provided is a bug; development and tests
  // fail loudly. In production a visitor sees the page's own language instead
  // of a crashed page, and the error is still reported.
  const fallback = provided.values().next().value;
  if (process.env.NODE_ENV !== "production" || !fallback) throw new Error(message);
  console.error(message);
  return fallback;
}
