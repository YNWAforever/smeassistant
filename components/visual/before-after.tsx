"use client"

import { Slider as SliderPrimitive } from "radix-ui"
import { useState, type ReactNode } from "react"

import { formatObservedDate } from "@/components/kinnso/evidence-badge"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import type { IncomparableReason } from "@/lib/copy-visual"

import { FactTypeBadge } from "./fact-type"
import { TrendChip } from "./trend"

export type CompareSide = { observedAt: string | null; content: ReactNode }

/**
 * Two comparable scans side by side, or on a slider. Always labelled
 * Attributed ("timing, not proof", guardrail 4). Scans that are not
 * comparable are never placed side by side (guardrail 3): it shows why.
 */
export function BeforeAfterCompare({
  before,
  after,
  comparable,
  reason,
  mode = "side",
  locale,
  timeZone,
}: {
  before: CompareSide
  after: CompareSide
  comparable: boolean
  reason?: IncomparableReason
  mode?: "side" | "slider"
  locale: PrototypeLocale
  timeZone?: string
}) {
  const t = copy[locale].ui.visual.compare
  const observed = copy[locale].ui.evidence
  const [split, setSplit] = useState(50)
  const dateLine = (side: CompareSide) => {
    const date = formatObservedDate(side.observedAt, locale, timeZone)
    return date ? fill(observed.observed, { date }) : observed.dateUnknown
  }

  if (!comparable) {
    return (
      <section className="k-compare kinnso-card grid gap-2 p-4" aria-label={t.title} data-comparable="false">
        <h3 className="text-base font-semibold text-ink">{t.notComparable}</h3>
        <TrendChip delta={null} comparable={false} reason={reason} locale={locale} />
      </section>
    )
  }

  const label = (name: string, side: CompareSide) => (
    <p className="grid text-xs">
      <span className="font-semibold text-ink">{name}</span>
      <span className="text-ink-3">{dateLine(side)}</span>
    </p>
  )

  return (
    <section className="k-compare kinnso-card grid gap-3 p-4" aria-label={t.title} data-comparable="true">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">{t.title}</h3>
        <span className="inline-flex items-center gap-2 text-xs text-ink-2">
          <FactTypeBadge type="Attributed" locale={locale} />
          <span>{t.attributed}</span>
        </span>
      </header>
      {mode === "side" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="k-compare-pane grid gap-2">{label(t.before, before)}{before.content}</div>
          <div className="k-compare-pane grid gap-2">{label(t.after, after)}{after.content}</div>
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="flex justify-between gap-2">{label(t.before, before)}{label(t.after, after)}</div>
          {/* The after layer is clipped from the left edge to the split, so it covers the before layer from there on. */}
          <div className="k-compare-stage grid">
            <div className="k-compare-layer" aria-hidden={split <= 0 ? "true" : undefined}>{before.content}</div>
            <div className="k-compare-layer k-compare-after" style={{ clipPath: `inset(0 0 0 ${split}%)` }} aria-hidden={split >= 100 ? "true" : undefined}>{after.content}</div>
            <span className="k-compare-divider" style={{ left: `${split}%` }} aria-hidden="true" />
          </div>
          <SliderPrimitive.Root className="k-compare-slider relative flex h-11 w-full touch-none items-center select-none" value={[split]} onValueChange={([value]) => setSplit(value ?? 50)} min={0} max={100} step={1}>
            <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-paper-2">
              <SliderPrimitive.Range className="absolute h-full bg-brand" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb aria-label={t.slider} className="block size-5 rounded-full border-2 border-brand bg-paper shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)" />
          </SliderPrimitive.Root>
        </div>
      )}
    </section>
  )
}
