import type { Metadata } from "next";

import { ScanPage } from "@/components/public-pages";
import { normaliseLocale } from "@/lib/copy";

import { publicPageMetadata } from "../_meta";
import { firstParam, resolveMarketParam } from "../_params";

/** Reads `?market=` and `?business=` handed over by the landing page. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return publicPageMetadata(normaliseLocale(locale), "scan");
}

export default async function Scan({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = normaliseLocale((await params).locale);
  const query = await searchParams;
  return (
    <ScanPage
      locale={locale}
      initialMarket={resolveMarketParam(query.market, locale)}
      initialBusiness={firstParam(query.business)}
    />
  );
}
