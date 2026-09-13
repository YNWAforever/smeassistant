import type { Metadata } from "next";

import { ScanPage } from "@/components/public-pages";
import { normaliseLocale } from "@/lib/copy";
import { currentScanConsentPolicyVersion } from "@/lib/scan/consent";

import { normaliseIntentParam } from "@/lib/funnel/scan-start";
import { publicPageMetadata } from "../_meta";
import { firstParam, resolveMarketParam } from "../_params";

/** Reads `?market=`, `?business=` and `?intent=` handed over by the landing page. */
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
      initialIntent={normaliseIntentParam(firstParam(query.intent))}
      // Resolved here, not in the client: a deployment that sets
      // REPORT_CONSENT_POLICY_VERSION would otherwise make every browser send
      // LEGAL_POLICY_VERSION and 409 on every scan. The route is
      // force-dynamic, so router.refresh() serves a bumped version.
      consentPolicyVersion={currentScanConsentPolicyVersion()}
    />
  );
}
