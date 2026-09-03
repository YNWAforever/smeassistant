import type { Metadata } from "next";

import { UnlockPage } from "@/components/public-pages";
import { copy, normaliseLocale } from "@/lib/copy";
import { resolveUnlockMarket } from "@/lib/funnel/unlock";

import { firstParam } from "../../_params";

/** Reads `?market=` (the report's own market, carried on the unlock link). */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = normaliseLocale((await params).locale);
  return {
    title: copy[locale].funnel.unlock.title,
    description: copy[locale].funnel.unlock.body,
    // The unlock form belongs to one specific report, which is itself noindex.
    robots: { index: false, follow: false },
  };
}

export default async function Unlock({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  const query = await searchParams;
  return (
    <UnlockPage
      locale={normaliseLocale(locale)}
      slug={slug}
      market={resolveUnlockMarket(firstParam(query.market), locale)}
    />
  );
}
