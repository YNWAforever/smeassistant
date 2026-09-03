import { servedLocales, defaultServedLocale } from "@sme-scanner/region";

/**
 * Build Next.js metadata `alternates.languages` (hreflang) for a path that is
 * the same across locales. `path` is locale-free and starts with "/" ("/",
 * "/pricing", "/r/abc").
 *
 * Every locale is prefixed here, unlike upstream sme-scanner, which serves its
 * default locale unprefixed (`localePrefix: "as-needed"`). This app routes
 * `/{locale}/...` for all three locales (CLAUDE.md §3.1) and `proxy.ts` sends an
 * unprefixed path to a 307, so an unprefixed href would advertise a redirect as
 * a page's canonical address.
 */
export function localeAlternates(path: string): {
  languages: Record<string, string>;
} {
  const languages: Record<string, string> = {};
  for (const loc of servedLocales) {
    languages[loc] = prefixed(loc, path);
  }
  // x-default points at the default locale's own (prefixed) path.
  languages["x-default"] = prefixed(defaultServedLocale, path);
  return { languages };
}

function prefixed(locale: string, path: string): string {
  if (path === `/${locale}` || path.startsWith(`/${locale}/`)) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}
