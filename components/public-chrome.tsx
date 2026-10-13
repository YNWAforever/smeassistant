import Link from "next/link"
import { ArrowRight, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"

/**
 * Public chrome with no client code: the brand link, primary links and footer
 * that PublicHeader / PublicPageFrame (components/product-ui.tsx) render, plus
 * a static header for the 404. The root not-found element ships with every
 * route, so it must not import the client header (it duplicated product-ui
 * and its Select into each page's JavaScript).
 */
export function PublicBrandLink({ locale }: { locale: PrototypeLocale }) {
  const isChinese = locale !== "en"
  return (
    <Link className="brand-lockup" href={`/${locale}`} aria-label={isChinese ? "SME Scanner by Fimmick · 主頁" : "SME Scanner by Fimmick · home"}>
      <span className="brand-mark" aria-hidden="true"><Search /></span>
      <span>
        <strong>SME Scanner</strong>{" "}
        <small>by Fimmick</small>
      </span>
    </Link>
  )
}

export function PublicNavLinks({ locale }: { locale: PrototypeLocale }) {
  const t = copy[locale]
  const isChinese = locale !== "en"
  return (
    <nav className="public-nav" aria-label={isChinese ? "網站導覽" : "Public navigation"}>
      <Link href={`/${locale}#why-sme-scanner`}>{isChinese ? "產品優勢" : "Why us"}</Link>
      <Link href={`/${locale}#sample-case`}>{isChinese ? "示範案例" : "Sample case"}</Link>
      <Link href={`/${locale}/pricing`}>{t.nav.pricing}</Link>
      <Link href={`/${locale}/trust`}>{t.nav.trust}</Link>
    </nav>
  )
}

/** The 404's header: same look as PublicHeader, without the language picker and menu sheet. */
export function StaticPublicHeader({ locale }: { locale: PrototypeLocale }) {
  const t = copy[locale]
  return (
    <header className="public-header">
      <div className="public-header-inner">
        <PublicBrandLink locale={locale} />
        <PublicNavLinks locale={locale} />
        <div className="header-actions">
          <Button asChild variant="outline" className="header-sign-in">
            <Link href={`/${locale}/owner/sign-in`}>{t.nav.signIn}</Link>
          </Button>
          <Button asChild className="header-scan-cta hidden md:inline-flex">
            <Link href={`/${locale}/scan`}>{locale === "en" ? "Free scan" : "免費掃描"}<ArrowRight /></Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

export function PublicFooter({ locale }: { locale: PrototypeLocale }) {
  const isChinese = locale !== "en"
  const t = copy[locale].funnel.footer
  return (
    <footer className="public-footer">
      <div>
        <div className="brand-lockup"><span className="brand-mark"><Search /></span><span><strong>SME Scanner</strong><small>{t.tagline}</small></span></div>
        <p>{t.body}</p>
        <small>© {new Date().getFullYear()} Fimmick</small>
      </div>
      <nav aria-label={isChinese ? "頁尾導覽" : "Footer navigation"}>
        <Link href={`/${locale}/methodology`}>{isChinese ? "評分方法與限制" : "Methodology & limitations"}</Link>
        <Link href={`/${locale}/trust`}>{resolveText({ en: "Security & privacy", "zh-HK": "安全與私隱", "zh-TW": "安全與隱私" }, locale)}</Link>
        <Link href={`/${locale}/pricing`}>{resolveText({ en: "Pricing", "zh-HK": "收費方案", "zh-TW": "方案價格" }, locale)}</Link>
        <Link href={`/${locale}/legal/privacy`}>{t.privacy}</Link>
        <Link href={`/${locale}/legal/terms`}>{t.terms}</Link>
      </nav>
      {/* Decorative sign-off; the tagline is already read once in the lockup above. */}
      <p className="footer-statement" aria-hidden="true">{t.tagline}</p>
    </footer>
  )
}
