import { copy, type PrototypeLocale } from "@/lib/copy"

/**
 * Score out of 100 with coverage beside it (guardrails 1 and 2). A null score
 * is a "no score yet" state, never 0. Static here; Phase 1B adds the fill
 * animation with a reduced-motion equivalent.
 */
export function KinnsoScoreDial({ score, coverage, locale, size = 132 }: { score: number | null; coverage: number | null; locale: PrototypeLocale; size?: number }) {
  const t = copy[locale].ui.score
  const stroke = 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const value = score === null ? null : Math.max(0, Math.min(100, Math.round(score)))
  const label = value === null
    ? `${t.noScore}. ${t.noScoreBody}`
    : `${value} ${t.outOf}${coverage === null ? "" : `, ${t.coverage} ${Math.round(coverage)}%`}`
  return (
    <figure className="kinnso-score inline-flex items-center gap-4" role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {value !== null && (
          <circle
            className="kinnso-score-arc"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - value / 100)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="var(--ink)" fontSize={value === null ? 15 : 34} fontWeight={700}>
          {value === null ? "—" : value}
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
