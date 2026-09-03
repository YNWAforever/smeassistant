import type { Metadata } from "next";

import { ScanningPage } from "@/components/public-pages";
import { copy, normaliseLocale } from "@/lib/copy";

/**
 * A scan in flight is a private, transient URL keyed by an unguessable job id.
 * It must never be indexed, and it is never statically rendered: the page polls
 * /api/scan/status from the client.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = normaliseLocale((await params).locale);
  return {
    title: copy[locale].funnel.scanning.title,
    description: copy[locale].funnel.scanning.body,
    robots: { index: false, follow: false },
  };
}

export default async function Scanning({ params }: { params: Promise<{ locale: string; jobId: string }> }) {
  const { locale, jobId } = await params;
  return <ScanningPage locale={normaliseLocale(locale)} jobId={jobId} />;
}
