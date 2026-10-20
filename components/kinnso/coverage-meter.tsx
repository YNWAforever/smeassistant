import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import type { ProviderStateName } from "@/lib/domain-labels"

import { PROVIDER_STATE_ICONS } from "./evidence-badge"

export type CoverageSource = { key: string; label: string; state: ProviderStateName }

/**
 * One segment per source (guardrail 2: unavailable is not zero). Coverage
 * counts measured sources; the score is never derived here.
 */
export function CoverageMeter({ sources, locale }: { sources: CoverageSource[]; locale: PrototypeLocale }) {
  const t = copy[locale].ui
  const measured = sources.filter((source) => source.state === "measured").length
  const summary = fill(t.score.coverageOf, { measured, total: sources.length })
  return (
    <div className="kinnso-coverage grid gap-2">
      <div className="kinnso-coverage-bar" role="img" aria-label={summary}>
        {sources.map((source) => (
          <span key={source.key} className="kinnso-coverage-segment" data-state={source.state} />
        ))}
      </div>
      <p className="text-xs text-ink-3">{summary}</p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
        {sources.map((source) => {
          const Icon = PROVIDER_STATE_ICONS[source.state]
          return (
            <li key={source.key} className="inline-flex items-center gap-1" data-state={source.state}>
              <Icon aria-hidden="true" className="kinnso-coverage-icon size-3.5" />
              <span>{source.label}</span>
              <span className="sr-only">: {t.providerStates[source.state]}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
