/** `coverage` is already a percentage (0–100), e.g. from `scorePercent`. */
export type ScanBar = { id: string; label: string; coverage: number | null; comparableToPrevious: boolean }

/**
 * One bar per scan: how much of what we look for that scan could check
 * (coverage, 0–100). It is never the score and never a result: a taller bar
 * means more sources were readable, nothing more. A scan that cannot be
 * compared with the one before it carries a gap mark (guardrail 3).
 */
export function ScanHistoryBars({ bars, title, gapLabel }: { bars: ScanBar[]; title: string; gapLabel: string }) {
  const percent = (value: number | null) => value === null ? null : Math.max(0, Math.min(100, Math.round(value)))
  const summary = bars.map((bar) => `${bar.label}: ${percent(bar.coverage) === null ? "—" : `${percent(bar.coverage)}%`}`).join(", ")
  return (
    <figure className="k-scan-bars" aria-label={`${title}. ${summary}`} role="img">
      <div className="k-scan-bars-plot" aria-hidden="true">
        {bars.map((bar, index) => {
          const value = percent(bar.coverage)
          return (
            <div key={bar.id} className="k-scan-bar" data-gap={index > 0 && !bar.comparableToPrevious ? "" : undefined}>
              <span className="k-scan-bar-value">{value === null ? "—" : `${value}%`}</span>
              <span className="k-scan-bar-track"><span className="k-scan-bar-fill" style={{ height: `${value ?? 0}%` }} /></span>
              <span className="k-scan-bar-label">{bar.label}</span>
              {index > 0 && !bar.comparableToPrevious && <span className="k-scan-bar-gap">{gapLabel}</span>}
            </div>
          )
        })}
      </div>
    </figure>
  )
}
