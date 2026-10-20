import { ExternalLink, Globe } from "lucide-react"
import type { ReactNode } from "react"

import { formatObservedDate } from "@/components/kinnso/evidence-badge"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import type { FactTypeName } from "@/lib/domain-labels"

import { FactTypeBadge } from "./fact-type"

/**
 * One piece of evidence: a snippet or source thumbnail with its source,
 * observed date, fact type and limitation (guardrail 1). It renders nothing
 * without a source and a valid observed date, so no claim appears without
 * provenance. `thumbnail` is inline SVG or an icon, never a raster.
 */
export function EvidencePreview({
  source,
  observedAt,
  factType,
  snippet,
  thumbnail,
  limitation,
  href,
  locale,
  timeZone,
}: {
  source: string
  observedAt: string
  factType: FactTypeName
  snippet?: string
  thumbnail?: ReactNode
  limitation?: string
  href?: string
  locale: PrototypeLocale
  timeZone?: string
}) {
  const t = copy[locale].ui
  const date = formatObservedDate(observedAt, locale, timeZone)
  if (!source.trim() || !date) return null
  return (
    <article className="k-evidence kinnso-card grid grid-cols-[auto_1fr] gap-3 p-3">
      <span className="k-evidence-thumb grid size-12 place-items-center rounded-lg" aria-hidden="true">
        {thumbnail ?? <Globe className="size-5" />}
      </span>
      <div className="grid min-w-0 gap-1.5">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-semibold text-ink">{source}</span>
          <span className="text-ink-3">{fill(t.evidence.observed, { date })}</span>
          <FactTypeBadge type={factType} locale={locale} />
        </header>
        {snippet && <blockquote className="k-evidence-snippet line-clamp-2 text-sm text-ink-2">{snippet}</blockquote>}
        {limitation && (
          <p className="text-xs text-ink-3">
            <span className="font-semibold">{t.visual.evidence.limitation}: </span>
            {limitation}
          </p>
        )}
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className="kinnso-link inline-flex w-fit items-center gap-1 text-xs font-semibold text-brand-text">
            {t.visual.evidence.viewSource}
            <ExternalLink aria-hidden="true" className="size-3" />
          </a>
        )}
      </div>
    </article>
  )
}
