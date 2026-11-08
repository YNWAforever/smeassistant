import type { Market } from "@sme-scanner/region"

import { LandingHero } from "@/components/public/landing/hero"
import { LandingMarketProvider } from "@/components/public/landing/market-context"
import { LandingFaq, PricingTeaser } from "@/components/public/landing/pricing-faq"
import { HowItWorks, SampleReportTeaser, TrustStrip, WhatWeCheck } from "@/components/public/landing/sections"
import { PublicPageFrame } from "@/components/product-ui"
import type { PublicBilling } from "@/lib/commercial/presentation"
import type { PrototypeLocale } from "@/lib/copy"

/**
 * The landing page (docs/ux Phase 2): hero with the free scan, how it works,
 * what we check, a demo-labelled sample report, pricing, FAQ and a trust
 * strip. One primary action per screen. The comparison table, coverage
 * rules and how-the-work-is-prepared live on /methodology; the approval
 * contract on /trust.
 */
export function LandingPage({ locale, market, billing, heroPhrases }: { locale: PrototypeLocale; market: Market; billing: PublicBilling; heroPhrases?: string[] }) {
  return (
    <PublicPageFrame locale={locale}>
      <main className="pl-landing">
        <LandingMarketProvider initial={market}>
          <LandingHero locale={locale} market={market} headline={heroPhrases} />
          <HowItWorks locale={locale} />
          <WhatWeCheck locale={locale} />
          <SampleReportTeaser locale={locale} />
          <PricingTeaser locale={locale} market={market} billing={billing} />
          <LandingFaq locale={locale} />
          <TrustStrip locale={locale} />
        </LandingMarketProvider>
      </main>
    </PublicPageFrame>
  )
}
