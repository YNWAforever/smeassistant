"use client"

import Link from "next/link"
import type { CSSProperties } from "react"

import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"

import { FactTypeBadge } from "./fact-type"
import { useReveal } from "./motion"

/** `impact` is our 0–1 prioritisation estimate (the persisted impact factor), not a measured outcome. */
export type MatrixItem = { id: string; title: string; impact: number; effortMinutes: number; href?: string }

type Quadrant = "quickWins" | "plan" | "fillIns" | "later"
const QUADRANT_ORDER: Quadrant[] = ["quickWins", "plan", "fillIns", "later"]
const clamp = (n: number) => Math.max(0, Math.min(1, n))

export function quadrantOf(item: MatrixItem, maxEffortMinutes: number): Quadrant {
  const high = clamp(item.impact) >= 0.5
  const quick = item.effortMinutes <= maxEffortMinutes / 2
  if (high) return quick ? "quickWins" : "plan"
  return quick ? "fillIns" : "later"
}

/**
 * 2×2 of open actions: impact up, effort across. It explains why one action
 * comes first; it is labelled Recommended because the placement is our
 * estimate. The numbered list is the accessible version and the link target;
 * the plot repeats the numbers visually.
 */
export function ImpactEffortMatrix({ items, locale, maxEffortMinutes = 30 }: { items: MatrixItem[]; locale: PrototypeLocale; maxEffortMinutes?: number }) {
  const t = copy[locale].ui.visual.matrix
  const minutes = copy[locale].ui.action.minutes
  const [ref, reveal] = useReveal<HTMLElement>()
  const ordered = QUADRANT_ORDER.flatMap((quadrant) =>
    items
      .filter((item) => quadrantOf(item, maxEffortMinutes) === quadrant)
      .sort((a, b) => b.impact - a.impact || a.effortMinutes - b.effortMinutes)
      .map((item) => ({ item, quadrant })),
  )
  const size = 240
  const inset = 24
  const span = size - inset * 2
  const seen = new Map<string, number>()
  const place = (item: MatrixItem) => {
    const cx = inset + clamp(item.effortMinutes / maxEffortMinutes) * span
    const cy = inset + (1 - clamp(item.impact)) * span
    const key = `${Math.round(cx / 12)}:${Math.round(cy / 12)}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    return { cx: cx + n * 10, cy: cy - n * 4 }
  }

  return (
    <section ref={ref} className="k-matrix kinnso-card grid gap-4 p-4" aria-label={t.title} data-reveal-state={reveal}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">{t.title}</h3>
        <FactTypeBadge type="Recommended" locale={locale} />
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-ink-2">{t.empty}</p>
      ) : (
        <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,240px)_1fr]">
          <svg viewBox={`0 0 ${size} ${size}`} className="k-matrix-plot w-full max-w-60" aria-hidden="true">
            <rect x={inset} y={inset} width={span / 2} height={span / 2} className="k-matrix-best" />
            <rect x={inset} y={inset} width={span} height={span} fill="none" stroke="var(--line)" />
            <line x1={inset + span / 2} y1={inset} x2={inset + span / 2} y2={inset + span} stroke="var(--line)" strokeDasharray="3 3" />
            <line x1={inset} y1={inset + span / 2} x2={inset + span} y2={inset + span / 2} stroke="var(--line)" strokeDasharray="3 3" />
            <text x={inset + 6} y={inset + 14} className="k-matrix-label">{t.quadrants.quickWins}</text>
            <text x={inset + span - 6} y={inset + 14} textAnchor="end" className="k-matrix-label">{t.quadrants.plan}</text>
            <text x={inset + 6} y={inset + span - 6} className="k-matrix-label">{t.quadrants.fillIns}</text>
            <text x={inset + span - 6} y={inset + span - 6} textAnchor="end" className="k-matrix-label">{t.quadrants.later}</text>
            <text x={inset + span / 2} y={size - 4} textAnchor="middle" className="k-matrix-axis">{t.effort} →</text>
            <text x={10} y={inset + span / 2} textAnchor="middle" className="k-matrix-axis" transform={`rotate(-90 10 ${inset + span / 2})`}>{t.impact} →</text>
            {ordered.map(({ item }, index) => {
              const { cx, cy } = place(item)
              return (
                <g key={item.id} className="k-reveal" style={{ "--i": index, transformOrigin: `${cx}px ${cy}px` } as CSSProperties}>
                  <circle cx={cx} cy={cy} r={10} className="k-matrix-dot" />
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="k-matrix-num">{index + 1}</text>
                </g>
              )
            })}
          </svg>
          <ol className="grid gap-2 text-sm">
            {ordered.map(({ item, quadrant }, index) => (
              <li key={item.id} className="flex items-start gap-2" data-quadrant={quadrant}>
                <span className="k-matrix-badge grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold" aria-hidden="true">{index + 1}</span>
                <span className="grid">
                  {item.href ? <Link href={item.href} className="kinnso-link font-semibold text-ink">{item.title}</Link> : <span className="font-semibold text-ink">{item.title}</span>}
                  <span className="text-xs text-ink-3">{t.quadrants[quadrant]} · {fill(minutes, { n: item.effortMinutes })}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="text-xs text-ink-3">{t.note}</p>
    </section>
  )
}
