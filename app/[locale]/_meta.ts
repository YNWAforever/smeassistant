import type { Metadata } from "next";

import { copy, type PrototypeLocale } from "@/lib/copy";
import { DEFAULT_LOCALE } from "@/lib/locale";
import { localeAlternates } from "@/lib/seo";

/**
 * Metadata for the public, indexable segments.
 *
 * Titles and descriptions come from `lib/copy.ts` so all three locales stay in
 * one place; the brand suffix is applied once by the root layout's title
 * template (`%s · SME Scanner`).
 *
 * `localeAlternates` (lib/seo.ts, ported from upstream) emits the default
 * locale unprefixed because upstream runs `localePrefix: "as-needed"`. Every
 * locale is prefixed in this app (CLAUDE.md §3.1), so each href is re-prefixed
 * here before it reaches the <link rel="alternate"> tags.
 */
function withLocalePrefix(locale: string, href: string): string {
  if (href === `/${locale}` || href.startsWith(`/${locale}/`)) return href;
  return href === "/" ? `/${locale}` : `/${locale}${href}`;
}

/** `path` is locale-free and starts with "/" ("/", "/pricing", "/sample-report"). */
export function publicAlternates(locale: PrototypeLocale, path: string): Metadata["alternates"] {
  const { languages } = localeAlternates(path);
  return {
    canonical: withLocalePrefix(locale, path),
    languages: Object.fromEntries(
      Object.entries(languages).map(([key, href]) => [
        key,
        withLocalePrefix(key === "x-default" ? DEFAULT_LOCALE : key, href),
      ]),
    ),
  };
}

export function publicMetadata(input: {
  locale: PrototypeLocale;
  path: string;
  title: string;
  description: string;
}): Metadata {
  const { locale, path, title, description } = input;
  return {
    title,
    description,
    alternates: publicAlternates(locale, path),
    openGraph: {
      siteName: "SME Scanner",
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "SME Scanner Visibility Workspace" }],
      title: `${title} · SME Scanner`,
      description,
      type: "website",
      locale,
      url: withLocalePrefix(locale, path),
    },
  };
}

/** One place for the public funnel's page titles, so every segment reads the same fields. */
export function publicPageMetadata(locale: PrototypeLocale, page: "landing" | "scan" | "sample" | "pricing" | "methodology" | "trust"): Metadata {
  const c = copy[locale];
  switch (page) {
    case "landing":
      return publicMetadata({ locale, path: "/", title: c.landing.title, description: c.landing.body });
    case "scan":
      return publicMetadata({
        locale,
        path: "/scan",
        title: c.nav.scanner,
        description: `${c.funnel.scan.securityBody} ${c.funnel.landing.timing}`,
      });
    case "sample":
      return publicMetadata({
        locale,
        path: "/sample-report",
        title: c.nav.sample,
        description: `${c.funnel.demoBar.body} · ${c.funnel.demoBar.note}`,
      });
    case "pricing":
      return publicMetadata({
        locale,
        path: "/pricing",
        title: c.nav.pricing,
        description: `${c.funnel.pricing.marketNote} ${c.funnel.pricing.planNote}`,
      });
    case "methodology":
      return publicMetadata({
        locale,
        path: "/methodology",
        title: c.nav.methodology,
        description: `${c.funnel.methodology.versionBadge} · ${c.landing.checked}`,
      });
    case "trust":
      return publicMetadata({ locale, path: "/trust", title: c.nav.trust, description: c.funnel.trust.intro });
  }
}
