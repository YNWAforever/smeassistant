import type { MetadataRoute } from "next";
import { servedLocales } from "@sme-scanner/region";
import { getSiteUrl } from "@/lib/share";

const PUBLIC_PATHS = ["", "/scan", "/sample-report", "/demo-workspace", "/pricing", "/methodology", "/trust", "/legal/privacy", "/legal/terms"];

/** Every indexable public path in every served locale, with hreflang alternates. */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  return PUBLIC_PATHS.map((path) => ({
    url: `${site}/${servedLocales[0]}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/scan" ? 0.9 : 0.6,
    alternates: {
      languages: Object.fromEntries(servedLocales.map((locale) => [locale, `${site}/${locale}${path}`])),
    },
  }));
}
