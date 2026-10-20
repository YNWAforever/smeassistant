import Link from "next/link"
import { ArrowRight, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { copy, type PrototypeLocale } from "@/lib/copy"

/**
 * Public chrome with no client code: the brand link, primary links and footer
 * that PublicHeader / PublicPageFrame (components/product-ui.tsx) render, plus
 * a static header for the 404. The root not-found element ships with every
 * route, so it must not import the client header (it duplicated product-ui
 * and its Select into each page's JavaScript).
 */
export function PublicBrandLink({ locale }: { locale: PrototypeLocale }) {
  const t = copy[locale].site.brand
  return (
    <Link className="brand-lockup" href={`/${locale}`} aria-label={t.homeLabel}>
      <span className="brand-mark" aria-hidden="true"><Search /></span>
      <span>
        <strong>{t.name}</strong>{" "}
        <small>{t.byline}</small>
      </span>
    </Link>
  )
}

export function PublicNavLinks({ locale }: { locale: PrototypeLocale }) {
  const t = copy[locale].site.nav
  return (
    <nav className="public-nav" aria-label={t.label}>
      <Link href={`/${locale}#how-it-works`}>{t.howItWorks}</Link>
      <Link href={`/${locale}/pricing`}>{t.pricing}</Link>
      <Link href={`/${locale}/methodology`}>{t.methodology}</Link>
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
            <Link href={`/${locale}/scan`}>{t.site.nav.freeScan}<ArrowRight /></Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

export function PublicFooter({ locale }: { locale: PrototypeLocale }) {
  const t = copy[locale].funnel.footer
  const site = copy[locale].site
  return (
    <footer className="public-footer">
      <div>
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true"><Search /></span><span><strong>{site.brand.name}</strong><small>{t.tagline}</small></span></div>
        <p>{site.footer.body}</p>
        <small>© {new Date().getFullYear()} Fimmick</small>
      </div>
      <nav aria-label={site.footer.label}>
        <Link href={`/${locale}/methodology`}>{site.footer.methodology}</Link>
        <Link href={`/${locale}/trust`}>{site.footer.trust}</Link>
        <Link href={`/${locale}/pricing`}>{site.footer.pricing}</Link>
        <Link href={`/${locale}/legal/privacy`}>{t.privacy}</Link>
        <Link href={`/${locale}/legal/terms`}>{t.terms}</Link>
      </nav>
      {/* Decorative sign-off; the tagline is already read once in the lockup above. */}
      <p className="footer-statement" aria-hidden="true">{t.tagline}</p>
    </footer>
  )
}
