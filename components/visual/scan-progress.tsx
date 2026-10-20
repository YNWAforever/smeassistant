"use client"

import type { CSSProperties } from "react"

import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"

import type { CoverageSource } from "./coverage-meter"
import { PROVIDER_STATE_ICONS } from "./icons"
import { useChangeFlash, useInView } from "./motion"

/**
 * One row per source while a scan runs. Pending rows show a soft pulse
 * (paused offscreen, still under reduced motion); a row that settles scales
 * in once. Failed and unavailable stay distinct, and neither counts as a
 * zero (guardrail 2). Only the summary line is announced.
 */
export function ScanProgress({ sources, locale }: { sources: CoverageSource[]; locale: PrototypeLocale }) {
  const t = copy[locale].ui
  const [viewRef, inView] = useInView<HTMLElement>()
  const listRef = useChangeFlash<HTMLUListElement>(sources.map((source) => source.state))
  const done = sources.filter((source) => source.state !== "pending").length
  const summary = done === sources.length ? t.visual.scan.complete : fill(t.visual.scan.progress, { done, total: sources.length })
  return (
    <section ref={viewRef} aria-label={t.visual.scan.label} className="k-scan grid gap-3" data-offscreen={inView ? undefined : ""}>
      <div className="grid gap-1.5">
        <p className="text-sm font-semibold text-ink" role="status">{summary}</p>
        <div className="k-scan-track" aria-hidden="true">
          <span className="k-progress-bar k-scan-fill" style={{ "--progress": sources.length ? done / sources.length : 0 } as CSSProperties} />
        </div>
      </div>
      <ul ref={listRef} className="grid gap-1">
        {sources.map((source) => {
          const Icon = PROVIDER_STATE_ICONS[source.state]
          return (
            <li key={source.key} className="k-scan-row flex min-h-11 items-center gap-3 rounded-lg px-3" data-state={source.state}>
              {source.state === "pending" ? (
                <span className="k-scan-dot k-pulse size-2.5 shrink-0 rounded-full" aria-hidden="true" />
              ) : (
                <Icon aria-hidden="true" className="k-state-icon size-4 shrink-0" />
              )}
              <span className="flex-1 text-sm text-ink">{source.label}</span>
              <span className="text-xs text-ink-2">{t.providerStates[source.state]}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
