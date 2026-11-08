"use client"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { factTypeNames, type FactTypeName } from "@/lib/domain-labels"

import { FACT_TYPE_ICONS } from "./icons"

/**
 * One of the six fact types (CLAUDE.md §0 guardrail 4) as colour + icon +
 * label. The one-sentence meaning is always the accessible description.
 * `explain` adds a focusable chip with a tooltip; leave it off inside links
 * and buttons (no nested controls) and where the meaning is already shown.
 */
export function FactTypeBadge({ type, locale, explain = false }: { type: FactTypeName; locale: PrototypeLocale; explain?: boolean }) {
  const { label, description } = copy[locale].ui.factTypes[type]
  const Icon = FACT_TYPE_ICONS[type]
  const className = `fact-type fact-${type.toLowerCase()} inline-flex items-center gap-1`
  const content = (
    <>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span>{label}</span>
      <span className="sr-only">: {description}</span>
    </>
  )
  if (!explain) return <span className={className} data-fact-type={type}>{content}</span>
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={`${className} k-fact-chip`} data-fact-type={type}>{content}</button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64" aria-hidden="true">{description}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
