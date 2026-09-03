import type { Metadata } from "next"

import { LegalDocument, type LegalSection } from "@/components/legal-document"
import { copy, normaliseLocale } from "@/lib/copy"
import { t } from "@/lib/i18n"
import { LEGAL_POLICY_VERSION, TERMS_SECTION_KEYS } from "@/lib/legal/policy"
import { interpolate } from "@/lib/share"

import { publicMetadata } from "../../_meta"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = normaliseLocale((await params).locale)
  return publicMetadata({
    locale,
    path: "/legal/terms",
    title: t(locale, "legal.termsTitle"),
    description: t(locale, "legal.serviceBody"),
  })
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = normaliseLocale((await params).locale)
  const sections: LegalSection[] = TERMS_SECTION_KEYS.map((key) => ({
    key,
    heading: t(locale, `legal.${key}Heading`),
    body: t(locale, `legal.${key}Body`),
  }))

  return (
    <LegalDocument
      locale={locale}
      title={t(locale, "legal.termsTitle")}
      versionLabel={interpolate(copy[locale].funnel.legal.version, { version: LEGAL_POLICY_VERSION })}
      backLabel={copy[locale].funnel.legal.backToScanner}
      sections={sections}
    />
  )
}
