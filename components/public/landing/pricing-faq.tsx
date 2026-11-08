"use client"

import type { Market } from "@sme-scanner/region"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { allowanceText, type PublicBilling } from "@/lib/commercial/presentation"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { formatMarketPrice, marketPricing } from "@/lib/funnel/pricing"
import { t as translate } from "@/lib/i18n"

import { useLandingMarket } from "./market-context"

/**
 * Free scan and Growth only (decided 2026-10-20); multi-location and managed
 * plans live on /pricing. The price follows the market chosen in the hero,
 * and while billing is closed the Growth card says so instead of implying a
 * subscription is available.
 */
export function PricingTeaser({ locale, market: fallback, billing }: { locale: PrototypeLocale; market: Market; billing: PublicBilling }) {
  const t = copy[locale].site.pricing
  const { market } = useLandingMarket(fallback)
  const price = formatMarketPrice(marketPricing(market))
  const notOpen = translate(locale, "commercial.notOpen")
  const contactHref = billing.contactHref[market]
  return (
    <section className="pl-section" aria-labelledby="pl-pricing-title">
      <h2 id="pl-pricing-title" className="pl-heading">{t.title}</h2>
      <div className="pl-plans">
        <article className="pl-plan">
          <span className="pl-chip">{t.freeChip}</span>
          <h3>{t.freeTitle}</h3>
          <p>{t.freeBody}</p>
          <Link href={`/${locale}/scan?${new URLSearchParams({ market }).toString()}`} className="pl-secondary">{t.freeCta}</Link>
        </article>
        <article className="pl-plan pl-plan-featured" data-plan="growth">
          <span className="pl-chip pl-chip-brand">{t.growthChip}</span>
          <h3>{t.growthTitle}</h3>
          <p className="pl-price">{price}<small>/{t.perMonth}</small></p>
          <p>{allowanceText(locale, "paid")}</p>
          {!billing.open && <p className="pl-note">{contactHref ? <a href={contactHref} className="pl-link">{notOpen}</a> : notOpen}</p>}
        </article>
      </div>
      <Link href={`/${locale}/pricing`} className="pl-link inline-flex items-center gap-1">{t.all}<ArrowRight aria-hidden="true" className="size-4" /></Link>
    </section>
  )
}

/** Five plain questions; answers only restate what the product already does. */
export function LandingFaq({ locale }: { locale: PrototypeLocale }) {
  const t = copy[locale].site.faq
  return (
    <section className="pl-section" aria-labelledby="pl-faq-title">
      <h2 id="pl-faq-title" className="pl-heading">{t.title}</h2>
      <Accordion type="single" collapsible className="pl-faq">
        {t.items.map((item, index) => (
          <AccordionItem key={item.q} value={`faq-${index}`}>
            <AccordionTrigger>{item.q}</AccordionTrigger>
            <AccordionContent>{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
