import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DesignSystemGallery } from "@/components/design-system/gallery";
import { normaliseLocale } from "@/lib/copy";
import { devRoutesEnabled } from "@/lib/dev-routes";

/**
 * Internal component gallery (docs/ux Phase 1). Never served by a production
 * build: the route answers 404 there, is noindex, and is absent from
 * app/sitemap.ts. Page chrome is English, like /ops; the components it shows
 * render in the URL's locale.
 */
export const metadata: Metadata = { title: "Design system", robots: { index: false, follow: false } };

export default async function DesignSystemPage({ params }: { params: Promise<{ locale: string }> }) {
  if (!devRoutesEnabled()) notFound();
  return <DesignSystemGallery locale={normaliseLocale((await params).locale)} />;
}
