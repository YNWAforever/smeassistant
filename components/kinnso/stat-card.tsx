import { Minus, TrendingDown, TrendingUp } from "lucide-react"

import { copy, type PrototypeLocale } from "@/lib/copy"
import type { FactTypeName } from "@/lib/domain-labels"

import { formatObservedDate } from "./evidence-badge"
import { FactTypeBadge } from "./fact-type-badge"

export type StatDelta = { value: number | null; comparable: boolean }

/**
 * One number with its provenance (guardrail 1): source and observed date are
 * required props, so a stat cannot render without them. A null value reads
 * "Unknown", never 0 (guardrail 2). A delta appears only for a comparable
 * pair (guardrail 3); otherwise the card says "Not comparable".
 */
export function StatCard({
  label,
  value,
  unit,
  factType,
  source,
  observedAt,
  delta,
  locale,
  timeZone,
}: {
  label: string
  value: number | null
  unit?: string
  factType: FactTypeName
  source: string
  observedAt: string | null
  delta?: StatDelta
  locale: PrototypeLocale
  timeZone?: string
}) {
  const t = copy[locale].ui
  const date = formatObservedDate(observedAt, locale, timeZone)
  const shown = value === null || !Number.isFinite(value) ? null : value
  const deltaValue = delta?.comparable && delta.value !== null && Number.isFinite(delta.value) ? delta.value : null
  const DeltaIcon = deltaValue === null || deltaValue === 0 ? Minus : deltaValue < 0 ? TrendingDown : TrendingUp
  return (
    <article className="kinnso-card grid gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink-2">{label}</h3>
        <FactTypeBadge type={shown === null ? "Unknown" : factType} locale={locale} />
      </div>
      <p className="text-3xl font-bold tabular-nums text-ink" data-value={shown === null ? "unknown" : String(shown)}>
        {shown === null ? <span className="text-xl text-ink-3">{t.stat.unknown}</span> : <>{shown.toLocaleString(locale)}{unit && <span className="ml-1 text-base font-semibold text-ink-3">{unit}</span>}</>}
      </p>
      {delta && (
        <p className="inline-flex items-center gap-1 text-sm text-ink-2" data-delta={deltaValue === null ? "none" : String(deltaValue)}>
          <DeltaIcon aria-hidden="true" className="size-4" />
          {deltaValue === null ? t.stat.notComparable : `${deltaValue > 0 ? "+" : ""}${deltaValue.toLocaleString(locale)} ${t.stat.sinceComparable}`}
        </p>
      )}
      <p className="text-xs text-ink-3">{t.evidence.source}: {source} · {date ?? t.evidence.dateUnknown}</p>
    </article>
  )
}
