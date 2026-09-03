import { servedLocales, defaultServedLocale } from "@sme-scanner/region";

/**
 * Build Next.js metadata `alternates.languages` (hreflang) for a path that is
 * the same across locales. `path` must start with "/" and exclude any locale
 * prefix (e.g. "/r/abc"). The default locale is unprefixed (localePrefix:as-needed).
 */
export function localeAlternates(path: string): {
  languages: Record<string, string>;
} {
  const languages: Record<string, string> = {};
  for (const loc of servedLocales) {
    languages[loc] = loc === defaultServedLocale ? path : `/${loc}${path}`;
  }
  // x-default points at the default-locale (unprefixed) path.
  languages["x-default"] = path;
  return { languages };
}
