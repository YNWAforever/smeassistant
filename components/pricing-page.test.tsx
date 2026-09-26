// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MARKETS, type Market } from "@sme-scanner/region"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en",
  useSearchParams: () => new URLSearchParams(),
}))

import { PricingPage } from "@/components/public-pages"
import { allowanceText, type PublicBilling } from "@/lib/commercial/presentation"
import { copy } from "@/lib/copy"
import { formatMarketPrice } from "@/lib/funnel/pricing"
import { t } from "@/lib/i18n"

const CLOSED_NO_CONTACT: PublicBilling = { open: false, contactHref: { hk: null, tw: null } }
const OPEN: PublicBilling = { open: true, contactHref: { hk: null, tw: null } }

function markup(locale: "en" | "zh-HK" | "zh-TW", market: Market, billing: PublicBilling) {
  const root = document.createElement("div")
  root.innerHTML = renderToStaticMarkup(<PricingPage locale={locale} market={market} billing={billing} />)
  return root
}

describe("PricingPage while billing is closed", () => {
  for (const market of ["hk", "tw"] as const) {
    for (const locale of ["en", "zh-HK", "zh-TW"] as const) {
      it(`shows the ${market} market price and the not-open label in ${locale}, with no sign-up link`, () => {
        const root = markup(locale, market, CLOSED_NO_CONTACT)
        expect(root.textContent).toContain(formatMarketPrice(MARKETS[market].pricing))
        expect(root.textContent).toContain(t(locale, "commercial.notOpen"))
        const links = Array.from(root.querySelectorAll("a")).map((a) => a.getAttribute("href"))
        expect(links).not.toContain(`/${locale}/owner/sign-in?plan=growth`)
        expect(root.textContent).not.toContain("billed via Stripe")
        expect(root.textContent).not.toContain("透過 Stripe 訂閱")
      })
    }
  }

  it("wraps the not-open label in a link when the market has a configured contact channel", () => {
    const root = markup("en", "hk", { open: false, contactHref: { hk: "https://wa.me/85291234567", tw: null } })
    const label = root.querySelector(".pricing-featured .limitation-note")
    expect(label?.textContent).toContain(t("en", "commercial.notOpen"))
    const anchor = label?.querySelector("a")
    expect(anchor?.getAttribute("href")).toBe("https://wa.me/85291234567")
  })

  it("renders the not-open label as plain text, with no <a> and no empty href, when no contact channel is configured", () => {
    const root = markup("en", "hk", CLOSED_NO_CONTACT)
    const label = root.querySelector(".pricing-featured .limitation-note")
    expect(label?.textContent).toContain(t("en", "commercial.notOpen"))
    expect(label?.querySelector("a")).toBeNull()
  })
})

describe("PricingPage while billing is open", () => {
  for (const market of ["hk", "tw"] as const) {
    for (const locale of ["en", "zh-HK", "zh-TW"] as const) {
      it(`shows the Growth sign-up link and no not-open label in ${locale}`, () => {
        const root = markup(locale, market, OPEN)
        const links = Array.from(root.querySelectorAll("a")).map((a) => a.getAttribute("href"))
        expect(links).toContain(`/${locale}/owner/sign-in?plan=growth`)
        expect(root.textContent).not.toContain(t(locale, "commercial.notOpen"))
      })
    }
  }
})

describe("PricingPage allowances", () => {
  for (const locale of ["en", "zh-HK"] as const) {
    it(`lists the free workspace allowance and the Growth allowance line in ${locale}`, () => {
      const root = markup(locale, "hk", OPEN)
      expect(root.textContent).toContain(allowanceText(locale, "lite"))
      expect(root.textContent).toContain(allowanceText(locale, "paid"))
    })
  }
})

/**
 * Fix round 1: the closing FAQ answer used to describe a Stripe subscription
 * ("How do I subscribe?") regardless of `billing.open`, contradicting the
 * Growth card's own closed state. It must not claim a subscription is
 * possible while billing is closed.
 */
describe("PricingPage FAQ matches the billing state", () => {
  for (const locale of ["en", "zh-HK"] as const) {
    it(`does not describe a subscription while closed, and shows the not-open label in ${locale}`, () => {
      const root = markup(locale, "hk", CLOSED_NO_CONTACT)
      expect(root.textContent).not.toContain(copy[locale].funnel.pricing.faqFinalBody)
      const faq = root.querySelector(".pricing-faq")
      expect(faq?.textContent).toContain(t(locale, "commercial.notOpen"))
    })

    it(`describes the real subscription answer when open in ${locale}`, () => {
      const root = markup(locale, "hk", OPEN)
      expect(root.textContent).toContain(copy[locale].funnel.pricing.faqFinalBody)
    })
  }
})
