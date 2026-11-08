"use client"

import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import type { ProviderStateName } from "@/lib/domain-labels"

import { PROVIDER_STATE_ICONS } from "./icons"
import { useChangeFlash, useInView } from "./motion"

export type CoverageSource = { key: string; label: string; state: ProviderStateName }

/**
 * One segment per source (guardrail 2: unavailable is not zero). Coverage
 * counts measured sources; the score is never derived here. Pending segments
 * shimmer while on screen; a segment that changes state scales in once.
 */
export function CoverageMeter({ sources, locale }: { sources: CoverageSource[]; locale: PrototypeLocale }) {
  const t = copy[locale].ui
  const [viewRef, inView] = useInView<HTMLDivElement>()
  const barRef = useChangeFlash<HTMLDivElement>(sources.map((source) => source.state))
  const measured = sources.filter((source) => source.state === "measured").length
  const summary = fill(t.score.coverageOf, { measured, total: sources.length })
  return (
    <div ref={viewRef} className="k-coverage grid gap-2" data-offscreen={inView ? undefined : ""}>
      <div ref={barRef} className="k-coverage-bar" role="img" aria-label={summary}>
        {sources.map((source) => (
          <span key={source.key} className="k-coverage-segment k-shimmer-host" data-state={source.state}>
            {source.state === "pending" && <span className="k-shimmer" />}
          </span>
        ))}
      </div>
      <p className="text-xs text-ink-3">{summary}</p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
        {sources.map((source) => {
          const Icon = PROVIDER_STATE_ICONS[source.state]
          return (
            <li key={source.key} className="inline-flex items-center gap-1" data-state={source.state}>
              <Icon aria-hidden="true" className="k-state-icon size-3.5" />
              <span>{source.label}</span>
              <span className="sr-only">: {t.providerStates[source.state]}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
