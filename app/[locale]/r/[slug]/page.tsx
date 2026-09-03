import type { Metadata } from "next";

import { ReportPage } from "@/components/public-pages";
import { normaliseLocale } from "@/lib/copy";
import { buildReportProps, type ReportViewModelLike } from "@/lib/funnel/report-props";
import { t } from "@/lib/i18n";
import { loadReport } from "@/lib/report/load-report";

/**
 * `loadReport` reads the viewer-grant cookie and calls `notFound()` for an
 * unknown slug, so the segment is request-scoped by definition.
 */
export const dynamic = "force-dynamic";

/**
 * Anyone can scan any business from public data alone, including a competitor,
 * so a report may exist for a business that never asked for one. It must never
 * become a search result about them (upstream does exactly this).
 *
 * opengraph-image.tsx still renders a branded card: noindex governs crawlers,
 * not link unfurls, and a deliberately shared link should still preview.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: t(locale, "report.freeAudit"),
    robots: { index: false, follow: false },
  };
}

export default async function Report({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const model = await loadReport(slug, locale);
  return <ReportPage {...buildReportProps(model satisfies ReportViewModelLike, normaliseLocale(locale))} />;
}
