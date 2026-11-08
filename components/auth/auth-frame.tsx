"use client"

import Link from "next/link"
import { CircleHelp } from "lucide-react"
import { useEffect, type ReactNode } from "react"

import { LocaleSelect } from "@/components/product/public-frame"
import { PublicBrandLink } from "@/components/public-chrome"
import { copy, type PrototypeLocale } from "@/lib/copy"

/**
 * Chrome for signed-in tasks that happen before a workspace opens: sign-in,
 * onboarding and choosing a workspace. Brand, language and help only; no
 * marketing nav, scan button or large footer, so the one task on the page is
 * the only thing asking for attention. Pages render their own <main>.
 */
export function AuthFrame({ locale, children }: { locale: PrototypeLocale; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  const t = copy[locale].shell.auth
  return (
    <div className="public-site auth-site">
      <a className="skip-link" href="#main-content">{copy[locale].site.brand.skip}</a>
      <header className="auth-header">
        <div className="auth-header-inner">
          <PublicBrandLink locale={locale} />
          <div className="auth-header-actions">
            <LocaleSelect locale={locale} />
            <Link className="auth-help" href={`/${locale}#pl-faq-title`} aria-label={t.helpLabel}><CircleHelp aria-hidden="true" /><span>{t.help}</span></Link>
          </div>
        </div>
      </header>
      <div id="main-content" className="skip-target" tabIndex={-1} />
      {children}
    </div>
  )
}
