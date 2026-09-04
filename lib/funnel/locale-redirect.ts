import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locale";

/** Request header the proxy stamps with the URL locale so the root layout can set <html lang>. */
export const LOCALE_HEADER = "x-sme-locale";

/** Top-level segments the locale prefix never applies to (route handlers, Next internals). */
const PASSTHROUGH_ROOTS = new Set(["api", "auth", "_next", "_vercel", "opengraph-image", "twitter-image", "icon", "apple-icon"]);

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

/**
 * True for every path under `/{locale}/owner` — the surface whose Supabase
 * session the proxy refreshes on each request (sign-in included, so the
 * sign-in page can see an existing session).
 */
export function isOwnerPath(pathname: string): boolean {
  const [first, second] = pathname.split("/").filter(Boolean);
  return Boolean(first && isLocale(first) && second === "owner");
}

/**
 * The owner gate (Phase 2 contract): `/{locale}/owner/*` requires a session,
 * except `/{locale}/owner/sign-in` (and anything beneath it), which is where
 * the gate sends people.
 */
export function isOwnerGatedPath(pathname: string): boolean {
  if (!isOwnerPath(pathname)) return false;
  const third = pathname.split("/").filter(Boolean)[2];
  return third !== "sign-in";
}

/**
 * Where the gate sends a signed-out visitor: the locale's sign-in page with the
 * original path + search as `returnTo`, so the callback can bring them back.
 */
export function signInRedirectFor(locale: Locale, pathname: string, search: string): string {
  const returnTo = `${pathname}${search.startsWith("?") || search === "" ? search : `?${search}`}`;
  return `/${locale}/owner/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * A `returnTo` is honoured only as a same-origin absolute path: it must start
 * with a single "/" (so "//evil.example" and "/\evil.example", which browsers
 * read as protocol-relative, are refused) and carry no scheme. Shared by the
 * auth callback and the magic-link routes so the rule cannot drift.
 */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  if (!/^\/(?![/\\])/.test(raw)) return null;
  return raw;
}

/**
 * Paths the legacy sme-scanner app served that live elsewhere here. Bookmarks
 * and search results keep working after the domain moves. A locale prefix is
 * honoured when present; otherwise the default locale applies. Returns the
 * target for a 308, or null when the path is not a legacy one.
 */
const LEGACY_PATHS: Record<string, string> = {
  owner: "/owner/select-workspace",
  privacy: "/legal/privacy",
  terms: "/legal/terms",
  scanner: "/scan",
};

export function resolveLegacyRedirect(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const locale = segments[0] && isLocale(segments[0]) ? segments[0] : null;
  const rest = locale ? segments.slice(1) : segments;
  if (rest.length !== 1) return null;
  const target = LEGACY_PATHS[rest[0]];
  return target ? `/${locale ?? DEFAULT_LOCALE}${target}` : null;
}
