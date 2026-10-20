"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, Menu } from "lucide-react"
import { useEffect, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { copy, LOCALE_NAMES, LOCALE_SHORT_NAMES, supportedLocales, type PrototypeLocale } from "@/lib/copy"
import { MotionDirector } from "@/components/motion-director"
import { EnvironmentBar } from "@/components/product/badges"
import { PublicBrandLink, PublicFooter, PublicNavLinks } from "@/components/public-chrome"

export function LocaleSelect({ locale }: { locale: PrototypeLocale }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  function changeLocale(nextLocale: string) {
    const parts = pathname.split("/").filter(Boolean)
    if (supportedLocales.includes(parts[0] as PrototypeLocale)) parts[0] = nextLocale
    else parts.unshift(nextLocale)
    const query = searchParams.toString()
    const hash = typeof window === "undefined" ? "" : window.location.hash
    router.push(`/${parts.join("/")}${query ? `?${query}` : ""}${hash}`)
  }
  return (
    <Select value={locale} onValueChange={changeLocale}>
      <SelectTrigger className="locale-trigger" aria-label={copy[locale].product.language}>
        <SelectValue><span className="locale-full">{LOCALE_NAMES[locale]}</span><span className="locale-short" aria-hidden="true">{LOCALE_SHORT_NAMES[locale]}</span></SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {supportedLocales.map((item) => (
          <SelectItem key={item} value={item}>{LOCALE_NAMES[item]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function PublicHeader({ locale, signInHref }: { locale: PrototypeLocale; signInHref?: string }) {
  // A page with its own context (an unlocked report) passes a sign-in link that
  // carries it, so signing in from the header does not drop the claim (F-20).
  const signIn = signInHref ?? `/${locale}/owner/sign-in`
  const t = copy[locale]
  const nav = t.site.nav
  return (
    <header className="public-header">
      <div className="public-header-inner">
        <PublicBrandLink locale={locale} />
        <PublicNavLinks locale={locale} />
        <div className="header-actions">
          <span className="header-locale"><LocaleSelect locale={locale} /></span>
          {/* Returning owners need a sign-in entry point without opening the
              hamburger menu: this was `hidden lg:inline-flex`, so on any
              phone-width viewport the only way back into a workspace was the
              menu. It stays listed in the menu as well. */}
          <Button asChild variant="outline" className="header-sign-in">
            <Link href={signIn}>{t.nav.signIn}</Link>
          </Button>
          <Button asChild className="header-scan-cta hidden md:inline-flex">
            <Link href={`/${locale}/scan`}>{nav.freeScan}<ArrowRight /></Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="public-menu-trigger" aria-label={nav.openMenu}><Menu /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(92vw,22rem)]" closeLabel={nav.closeMenu}>
              <SheetHeader>
                <SheetTitle>{t.site.brand.name}</SheetTitle>
                <SheetDescription>{nav.menuTitle}</SheetDescription>
              </SheetHeader>
              <nav className="mobile-sheet-nav" aria-label={nav.mobileLabel}>
                <Link href={`/${locale}/scan`}>{nav.freeScan}</Link>
                <Link href={`/${locale}#how-it-works`}>{nav.howItWorks}</Link>
                <Link href={`/${locale}/sample-report`}>{nav.sample}</Link>
                <Link href={`/${locale}/pricing`}>{nav.pricing}</Link>
                <Link href={`/${locale}/methodology`}>{nav.methodology}</Link>
                <Link href={`/${locale}/trust`}>{nav.trust}</Link>
                <Link href={signIn}>{t.nav.signIn}</Link>
              </nav>
              {/* On phones the header has no room for the language control, so it lives here too. */}
              <div className="mobile-sheet-locale"><LocaleSelect locale={locale} /></div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

/**
 * `demo` renders the EnvironmentBar and adds the `has-env-bar` hook the CSS
 * offsets are gated behind (CLAUDE.md §5 "Global"); it is false everywhere else.
 */
export function PublicPageFrame({ locale, demo = false, signInHref, children }: { locale: PrototypeLocale; demo?: boolean; signInHref?: string; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale === "zh-HK" ? "zh-HK" : locale === "zh-TW" ? "zh-TW" : "en"
  }, [locale])
  return (
    <div className={`public-site${demo ? " has-env-bar" : ""}`}>
      <a className="skip-link" href="#main-content">{copy[locale].site.brand.skip}</a>
      <EnvironmentBar locale={locale} show={demo} />
      <PublicHeader locale={locale} signInHref={signInHref} />
      {/* Skip-link target: pages render their own <main>, so focus lands just before it. */}
      <div id="main-content" className="skip-target" tabIndex={-1} />
      {children}
      <PublicFooter locale={locale} />
      <MotionDirector />
    </div>
  )
}
