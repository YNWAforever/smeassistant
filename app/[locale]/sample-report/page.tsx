import type { Metadata } from "next";

import { ReportPage } from "@/components/public-pages";
import { normaliseLocale } from "@/lib/copy";
import { sampleReportProps } from "@/lib/funnel/sample-report";

import { publicPageMetadata } from "../_meta";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return publicPageMetadata(normaliseLocale(locale), "sample");
}

/** Fixed, sanitised Kam Man House data — never the database (guardrail 12). */
export default async function SampleReport({ params }: { params: Promise<{ locale: string }> }) {
  const locale = normaliseLocale((await params).locale);
  return <ReportPage {...sampleReportProps(locale)} />;
}
