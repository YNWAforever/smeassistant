import type { Metadata } from "next";

import { PricingPage } from "@/components/public-pages";
import { normaliseLocale } from "@/lib/copy";

import { publicPageMetadata } from "../_meta";
import { resolveMarketParam } from "../_params";

/** Prices follow `?market=`, which the landing/scan pages carry forward. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return publicPageMetadata(normaliseLocale(locale), "pricing");
}

export default async function Pricing({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = normaliseLocale((await params).locale);
  const query = await searchParams;
  return <PricingPage locale={locale} market={resolveMarketParam(query.market, locale)} />;
}
