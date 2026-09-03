import type { Metadata } from "next"

import { LegalDocument, type LegalSection } from "@/components/legal-document"
import { copy, normaliseLocale } from "@/lib/copy"
import { t } from "@/lib/i18n"
import { LEGAL_POLICY_VERSION, PRIVACY_SECTION_KEYS } from "@/lib/legal/policy"
import { interpolate } from "@/lib/share"

import { publicMetadata } from "../../_meta"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = normaliseLocale((await params).locale)
  return publicMetadata({
    locale,
    path: "/legal/privacy",
    title: t(locale, "legal.privacyTitle"),
    description: t(locale, "legal.controllerBody"),
  })
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = normaliseLocale((await params).locale)
  const sections: LegalSection[] = PRIVACY_SECTION_KEYS.map((key) => ({
    key,
    heading: t(locale, `legal.${key}Heading`),
    body: t(locale, `legal.${key}Body`),
  }))

  return (
    <LegalDocument
      locale={locale}
      title={t(locale, "legal.privacyTitle")}
      versionLabel={interpolate(copy[locale].funnel.legal.version, { version: LEGAL_POLICY_VERSION })}
      backLabel={copy[locale].funnel.legal.backToScanner}
      sections={sections}
    />
  )
}
