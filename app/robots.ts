import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/share";

/**
 * Reports, unlock pages, scanning pages and the owner workspace are private or
 * per-visitor and must never be indexed (CLAUDE.md Phase 7). The public
 * funnel, sample report, pricing, methodology, trust and legal pages are.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/auth/", "/*/r/", "/*/unlock/", "/*/scanning/", "/*/owner/"],
      },
    ],
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
