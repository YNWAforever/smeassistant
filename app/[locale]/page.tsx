import type { Metadata } from "next";
import { localeToMarket } from "@sme-scanner/region";

import { LandingPage } from "@/components/public-pages";
import { publicBilling } from "@/lib/commercial/presentation";
import { normaliseLocale } from "@/lib/copy";

import { publicPageMetadata } from "./_meta";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return publicPageMetadata(normaliseLocale(locale), "landing");
}

export default async function Landing({ params }: { params: Promise<{ locale: string }> }) {
  const locale = normaliseLocale((await params).locale);
  // The landing market radio seeds itself from the locale (upstream's
  // localeToMarket); choosing a market on the page is what carries it forward
  // to /scan?market=… — the locale never changes it afterwards (guardrail 11).
  // This route is not force-dynamic, so `billing.open` is fixed at build time
  // (a known limitation, task-4-brief.md step 3) until it is next rebuilt.
  return <LandingPage locale={locale} market={localeToMarket(locale)} billing={publicBilling()} />;
}
