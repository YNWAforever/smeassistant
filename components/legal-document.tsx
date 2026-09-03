import Link from "next/link"

import { PublicPageFrame, SectionCard } from "@/components/product-ui"
import type { PrototypeLocale } from "@/lib/copy"

export interface LegalSection {
  key: string
  heading: string
  body: string
}

export interface LegalDocumentProps {
  locale: PrototypeLocale
  title: string
  versionLabel: string
  backLabel: string
  sections: LegalSection[]
}

/**
 * Presentational only: the route resolves the locale and hands this component
 * already-translated strings, so it renders with no request context and stays a
 * server component. Styling reuses the public content-page primitives so the
 * legal documents match the rest of the site (CLAUDE.md §5: preserve the design).
 */
export function LegalDocument({ locale, title, versionLabel, backLabel, sections }: LegalDocumentProps) {
  return (
    <PublicPageFrame locale={locale}>
      <main className="content-page legal-page">
        <header className="content-page-intro">
          <p className="eyebrow">{versionLabel}</p>
          <h1>{title}</h1>
        </header>
        <div className="legal-sections">
          {sections.map((section) => (
            <SectionCard key={section.key} as="article">
              <h2 id={section.key}>{section.heading}</h2>
              <p className="legal-body">{section.body}</p>
            </SectionCard>
          ))}
        </div>
        <p className="legal-back">
          <Link href={`/${locale}`}>{backLabel}</Link>
        </p>
      </main>
    </PublicPageFrame>
  )
}
