"use client"

import { copy, type PrototypeLocale } from "@/lib/copy"

import { useCountUp, useReveal } from "./motion"

/**
 * Score out of 100 with coverage beside it (guardrails 1 and 2). A null score
 * is a "no score yet" state, never 0, and never animates.
 *
 * Motion: below the fold the arc fills and the number counts up once when it
 * arrives. A new score counts from the old one only when `comparable` is true
 * (guardrail 3); otherwise it jumps. `replay` re-runs the fill (gallery).
 */
export function ScoreDial({
  score,
  coverage,
  locale,
  size = 132,
  comparable = false,
  replay,
}: {
  score: number | null
  coverage: number | null
  locale: PrototypeLocale
  size?: number
  comparable?: boolean
  replay?: number
}) {
  const t = copy[locale].ui.score
  const [ref, reveal] = useReveal<HTMLElement>()
  const value = score === null ? null : Math.max(0, Math.min(100, Math.round(score)))
  const shown = useCountUp(value ?? 0, { animate: comparable, play: `${reveal === "in"}:${replay ?? 0}` })
  const stroke = 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const label = value === null
    ? `${t.noScore}. ${t.noScoreBody}`
    : `${value} ${t.outOf}${coverage === null ? "" : `, ${t.coverage} ${Math.round(coverage)}%`}`
  return (
    <figure ref={ref} className="k-score inline-flex items-center gap-4" role="img" aria-label={label} data-reveal-state={reveal} data-score={value ?? "none"}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {value !== null && (
          <circle
            className="k-score-arc"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - shown / 100)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="var(--ink)" fontSize={value === null ? 15 : 34} fontWeight={700} className="tabular-nums">
          {value === null ? "—" : Math.round(shown)}
        </text>
      </svg>
      <figcaption className="grid gap-1">
        {value === null ? (
          <>
            <strong className="text-base text-ink">{t.noScore}</strong>
            <span className="max-w-48 text-sm text-ink-2">{t.noScoreBody}</span>
          </>
        ) : (
          <span className="text-sm text-ink-2">{t.outOf}</span>
        )}
        {coverage !== null && (
          <span className="text-sm font-semibold text-ink">{Math.round(coverage)}% {t.coverage}</span>
        )}
      </figcaption>
    </figure>
  )
}
