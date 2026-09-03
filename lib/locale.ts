export type Locale = "zh-HK" | "en" | "zh-TW";
export const LOCALES: readonly Locale[] = ["zh-HK", "en", "zh-TW"];
export const DEFAULT_LOCALE: Locale = "zh-HK";
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}