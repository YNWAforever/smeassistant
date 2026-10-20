import type { MetadataRoute } from "next";
import { servedLocales } from "@sme-scanner/region";
import { getSiteUrl } from "@/lib/share";

const PUBLIC_PATHS = ["", "/scan", "/sample-report", "/demo-workspace", "/pricing", "/methodology", "/trust", "/legal/privacy", "/legal/terms"];

/**
 * Every indexable public path in every served locale. Each language version is
 * its own entry and lists all versions plus x-default (the default locale), as
 * search engines expect for hreflang.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  return PUBLIC_PATHS.flatMap((path) => {
    const languages = {
      ...Object.fromEntries(servedLocales.map((locale) => [locale, `${site}/${locale}${path}`])),
      "x-default": `${site}/${servedLocales[0]}${path}`,
    };
    return servedLocales.map((locale) => ({
      url: `${site}/${locale}${path}`,
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : path === "/scan" ? 0.9 : 0.6,
      alternates: { languages },
    }));
  });
}
