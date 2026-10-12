import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight, SearchX } from "lucide-react";

import { LocaleDataProvider } from "@/components/locale-data-provider";
import { PublicPageFrame } from "@/components/product-ui";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy";
import { LOCALE_HEADER, resolveHtmlLang } from "@/lib/funnel/locale-redirect";
import { serverLocaleData } from "@/lib/locale-data/server";

export const metadata: Metadata = { title: "404", robots: { index: false } };

/** Every unmatched URL lands here; the locale comes from the proxy's header, as in the root layout. */
export default async function NotFound() {
  const locale = resolveHtmlLang((await headers()).get(LOCALE_HEADER));
  const t = copy[locale].funnel.notFound;
  // Rendered under the root layout, outside [locale]/layout, so it provides its own dictionaries.
  return (
    <LocaleDataProvider locale={locale} data={serverLocaleData(locale)}>
    <PublicPageFrame locale={locale}>
      <main className="not-found-page">
        <span className="not-found-mark" aria-hidden="true"><SearchX /></span>
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p className="not-found-body">{t.body}</p>
        <div className="not-found-actions">
          <Button asChild size="lg"><Link href={`/${locale}/scan`}>{t.scan}<ArrowRight /></Link></Button>
          <Button asChild size="lg" variant="outline"><Link href={`/${locale}/sample-report`}>{t.sample}</Link></Button>
        </div>
        <Link className="policy-link" href={`/${locale}`}>{t.home}<ArrowRight aria-hidden="true" /></Link>
      </main>
    </PublicPageFrame>
    </LocaleDataProvider>
  );
}
