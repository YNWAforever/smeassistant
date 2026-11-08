import Link from "next/link"
import { Check, FileCheck2 } from "lucide-react"

import { PublicPageFrame, SectionCard } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { allowanceText, type PublicBilling } from "@/lib/commercial/presentation"
import { zhDeep } from "@/lib/zh-tw"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import { formatMarketPrice, marketPricing } from "@/lib/funnel/pricing"
import { t } from "@/lib/i18n"
import { interpolate } from "@/lib/share"
import { getMarketConfig, type Market } from "@sme-scanner/region"

// No re-exports of the page components: Next ships every client component a
// server module imports, so a barrel here made each public page download the
// landing, scan, scanning, report and unlock pages. Import them directly.

export function PricingPage({ locale, market, billing }: { locale: PrototypeLocale; market: Market; billing: PublicBilling }) {
  const p = copy[locale].funnel.pricing
  const f = copy[locale].funnel.landing
  const pricing = marketPricing(market)
  const growthPrice = formatMarketPrice(pricing)
  const liteAllowance = allowanceText(locale, "lite")
  const paidAllowance = allowanceText(locale, "paid")
  const notOpenLabel = t(locale, "commercial.notOpen")
  const contactHref = billing.contactHref[market]
  // Shared by the Growth card's CTA and the closing FAQ answer: the same
  // "not open yet" label, anchored to the market's contact channel when one
  // is configured, plain text otherwise (Review Focus 5).
  const notOpenNode = contactHref ? <a href={contactHref}>{notOpenLabel}</a> : notOpenLabel
  const pc = copy[locale].pricingPage
  const pl = pc.plans
  // zh-TW reads the plan cards in Taiwan wording, including the prices and allowance lines joined in.
  const plans = zhDeep(locale, [
    { key: "free", label: pl.free.label, title: copy[locale].site.pricing.freeTitle, price: pl.free.price, cadence: "", description: pl.free.description, meta: pl.free.meta, features: [...pl.free.features, liteAllowance], cta: pl.free.cta, href: `/${locale}/scan`, featured: false },
    { key: "growth", label: pl.growth.label, title: pl.growth.title, price: growthPrice, cadence: fill(pl.growth.cadence, { perMonth: f.perMonth }), description: pl.growth.description, meta: pl.growth.meta, features: [paidAllowance, ...pl.growth.features], cta: pl.growth.cta, href: `/${locale}/owner/sign-in?plan=growth`, featured: true },
    { key: "multi", label: pl.multi.label, title: pl.multi.title, price: f.contactPricing, cadence: "", description: pl.multi.description, meta: pl.multi.meta, features: pl.multi.features, cta: pl.multi.cta, href: `/${locale}/owner/sign-in?plan=multi`, featured: false },
    { key: "managed", label: pl.managed.label, title: pl.managed.title, price: f.contactPricing, cadence: "", description: pl.managed.description, meta: pl.managed.meta, features: pl.managed.features, cta: pl.managed.cta, href: `/${locale}/trust`, featured: false },
  ])
  return (
    <PublicPageFrame locale={locale}>
      <main className="content-page pricing-page">
        <header className="content-page-intro"><Badge variant="outline">{p.badge}</Badge><h1>{pc.title}</h1><p>{pc.lead}</p><p>{interpolate(p.marketNote, { currency: pricing.currency, market: locale === "en" ? getMarketConfig(market).geoLabelEn : getMarketConfig(market).geoLabelZh })}</p></header>
        <div className="pricing-grid">
          {plans.map((plan) => <SectionCard key={plan.key} className={`pricing-card ${plan.featured ? "pricing-featured" : ""}`}>
            {plan.featured && <div className="recommended-label">{pc.recommended}</div>}
            <div className="pricing-card-head"><div><Badge variant={plan.featured ? "default" : "outline"}>{plan.label}</Badge><h2>{plan.title}</h2></div><span className={`price ${plan.key === "free" ? "price-text" : ""}`}>{plan.price}{plan.cadence && <small>{plan.cadence}</small>}</span></div>
            <p>{plan.description}</p>
            <strong className="plan-meta">{plan.meta}</strong>
            <ul className="check-list">{plan.features.map((feature) => <li key={feature}><Check /> {feature}</li>)}</ul>
            {plan.key === "growth" && !billing.open ? (
              <p className="limitation-note">{notOpenNode}</p>
            ) : (
              <Button asChild variant={plan.featured ? "default" : "outline"} className="w-full"><Link href={plan.href}>{plan.cta}</Link></Button>
            )}
          </SectionCard>)}
        </div>
        <p className="plan-test-note">{billing.open ? p.planNote : f.planNote}</p>
        <SectionCard className="pricing-usage-banner"><FileCheck2 /><div><p className="eyebrow">{pc.usage.eyebrow}</p><h2>{pc.usage.title}</h2><p>{pc.usage.body}</p></div></SectionCard>
        <SectionCard className="pricing-faq"><div><p className="eyebrow">{pc.faq.eyebrow}</p><h2>{pc.faq.title}</h2><p>{pc.faq.body}</p></div><div><h3>{pc.faq.autoPublishTitle}</h3><p>{pc.faq.autoPublishBody}</p></div><div><h3>{p.faqFinalTitle}</h3><p>{billing.open ? p.faqFinalBody : notOpenNode}</p></div></SectionCard>
      </main>
    </PublicPageFrame>
  )
}
