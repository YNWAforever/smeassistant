import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locale";

/** Request header the proxy stamps with the URL locale so the root layout can set <html lang>. */
export const LOCALE_HEADER = "x-sme-locale";

/** Top-level segments the locale prefix never applies to (route handlers, Next internals). */
const PASSTHROUGH_ROOTS = new Set(["api", "auth", "_next", "_vercel"]);

export function localeFromPathname(pathname: string): Locale | null {
  const first = pathname.split("/").filter(Boolean)[0];
  return first && isLocale(first) ? first : null;
}

/**
 * Decide whether an incoming pathname must be redirected to its zh-HK-prefixed
 * twin. Returns the redirect target, or null when the request should pass
 * through untouched. Every locale is prefixed in this app (CLAUDE.md §3.1), so
 * the only paths left alone are route handlers, Next internals, files with an
 * extension, and paths that already carry a locale.
 */
export function resolveLocaleRedirect(pathname: string): string | null {
  const normalised = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const segments = normalised.split("/").filter(Boolean);
  const [first] = segments;
  if (first && PASSTHROUGH_ROOTS.has(first)) return null;
  const last = segments[segments.length - 1];
  if (last && last.includes(".")) return null;
  if (first && isLocale(first)) return null;
  return `/${DEFAULT_LOCALE}${normalised === "/" ? "" : normalised}`;
}

/** <html lang> for the root layout: the proxy-stamped locale, else the default. */
export function resolveHtmlLang(headerValue: string | null | undefined): Locale {
  return isLocale(headerValue) ? headerValue : DEFAULT_LOCALE;
}
