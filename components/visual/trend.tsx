import { Minus, TrendingDown, TrendingUp } from "lucide-react"

import { formatObservedDate } from "@/components/kinnso/evidence-badge"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import type { IncomparableReason } from "@/lib/copy-visual"

const plain = (n: number) => String(Math.round(n * 10) / 10)

/**
 * Change since the last comparable scan (guardrail 3). Without a comparable
 * pair, or with an unknown delta, it shows "Not comparable" and the reason:
 * never a number, never a flat "0".
 */
export function TrendChip({
  delta,
  comparable,
  reason,
  locale,
  format = plain,
}: {
  delta: number | null
  comparable: boolean
  reason?: IncomparableReason
  locale: PrototypeLocale
  format?: (n: number) => string
}) {
  const t = copy[locale].ui.visual.trend
  if (!comparable || delta === null) {
    return (
      <span className="k-trend grid gap-0.5" data-trend="none">
        <span className="k-trend-chip inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" data-trend="none">
          <Minus aria-hidden="true" className="size-3.5" />
          {t.notComparable}
        </span>
        {reason && <span className="text-xs text-ink-3">{t.reasons[reason]}</span>}
      </span>
    )
  }
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat"
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus
  const text = direction === "flat" ? t.flat : fill(direction === "up" ? t.up : t.down, { n: format(Math.abs(delta)) })
  return (
    <span className="k-trend-chip inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" data-trend={direction}>
      <Icon aria-hidden="true" className="size-3.5" />
      {text}
    </span>
  )
}

export type SparkPoint = { id: string; at: string; value: number | null; comparableToPrevious: boolean }

/** Runs of consecutive, comparable, known values. A line never crosses a gap. */
export function sparkSegments(points: SparkPoint[]): number[][] {
  const segments: number[][] = []
  let current: number[] = []
  points.forEach((point, index) => {
    const breaks = point.value === null || (index > 0 && !point.comparableToPrevious)
    if (breaks && current.length) { segments.push(current); current = [] }
    if (point.value !== null) current.push(index)
  })
  if (current.length) segments.push(current)
  return segments
}

/**
 * Small history line. Lines join only comparable neighbours; an unknown value
 * is a gap, not a zero. The text list beside it is what screen readers get.
 */
export function Sparkline({
  label,
  points,
  locale,
  width = 120,
  height = 32,
  timeZone,
  format = plain,
}: {
  label: string
  points: SparkPoint[]
  locale: PrototypeLocale
  width?: number
  height?: number
  timeZone?: string
  format?: (n: number) => string
}) {
  const t = copy[locale].ui.visual.trend
  const known = points.flatMap((point) => (point.value === null ? [] : [point.value]))
  const min = Math.min(...known)
  const max = Math.max(...known)
  const pad = 4
  const x = (index: number) => (points.length < 2 ? width / 2 : pad + (index * (width - pad * 2)) / (points.length - 1))
  const y = (value: number) => (max === min ? height / 2 : height - pad - ((value - min) * (height - pad * 2)) / (max - min))
  const segments = sparkSegments(points)
  const hasGap = points.some((point, index) => point.value === null || (index > 0 && !point.comparableToPrevious))
  const latest = points.at(-1)
  const summary = latest && latest.value !== null
    ? fill(t.summary, { label, count: points.length, value: format(latest.value) })
    : fill(t.summaryUnknown, { label, count: points.length })
  return (
    <figure className="k-spark grid gap-1">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
        {segments.map((segment) => (
          segment.length > 1 ? (
            <polyline
              key={segment[0]}
              points={segment.map((i) => `${x(i)},${y(points[i]!.value!)}`).join(" ")}
              fill="none"
              stroke="var(--brand)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null
        ))}
        {points.map((point, index) => point.value !== null && (
          <circle key={point.id} cx={x(index)} cy={y(point.value)} r={index === points.length - 1 ? 3 : 2} fill={index === points.length - 1 ? "var(--brand)" : "var(--paper)"} stroke="var(--brand)" strokeWidth={1.5} />
        ))}
      </svg>
      <figcaption className="grid gap-0.5">
        <span className="sr-only">{summary}</span>
        <ol className="sr-only">
          {points.map((point, index) => (
            <li key={point.id}>
              {formatObservedDate(point.at, locale, timeZone) ?? t.unknown}: {point.value === null ? t.unknown : format(point.value)}
              {index > 0 && !point.comparableToPrevious ? ` (${t.breakBefore})` : ""}
            </li>
          ))}
        </ol>
        {hasGap && <span className="text-xs text-ink-3">{t.gapNote}</span>}
      </figcaption>
    </figure>
  )
}
