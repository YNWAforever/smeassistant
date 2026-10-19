import { CircleHelp, Eye, Lightbulb, Link2, Sigma, Sparkles, type LucideIcon } from "lucide-react"

import { copy, type PrototypeLocale } from "@/lib/copy"
import { factTypeNames, type FactTypeName } from "@/lib/domain-labels"

const ICONS: Record<FactTypeName, LucideIcon> = {
  Observed: Eye,
  Inference: Lightbulb,
  Recommended: Sparkles,
  Attributed: Link2,
  Estimated: Sigma,
  Unknown: CircleHelp,
}

/**
 * One of the six fact types (CLAUDE.md §0 guardrail 4) as colour + icon +
 * label. The one-sentence meaning is the accessible description and the
 * hover title, so the label never stands alone as jargon.
 */
export function FactTypeBadge({ type, locale }: { type: FactTypeName; locale: PrototypeLocale }) {
  const { label, description } = copy[locale].ui.factTypes[type]
  const Icon = ICONS[type]
  return (
    <span className={`fact-type fact-${type.toLowerCase()} inline-flex items-center gap-1`} title={description} data-fact-type={type}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span>{label}</span>
      <span className="sr-only">: {description}</span>
    </span>
  )
}

/** The six labels with their meanings: replaces a glossary page. */
export function FactTypeLegend({ locale }: { locale: PrototypeLocale }) {
  const t = copy[locale].ui
  return (
    <section aria-label={t.factLegend} className="grid gap-2">
      <p className="text-sm font-semibold text-ink">{t.factLegend}</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        {factTypeNames.map((type) => (
          <div key={type} className="flex items-start gap-2">
            <dt><FactTypeBadge type={type} locale={locale} /></dt>
            <dd className="text-sm text-ink-2">{t.factTypes[type].description}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
