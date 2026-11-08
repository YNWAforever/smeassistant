"use client"

import { useState } from "react"

import { ProviderBadge } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { copy } from "@/lib/copy"
import { limitationCopy } from "@/lib/funnel/report-labels"
import type { ReportFindingGroup, ReportModuleRow, ReportProps } from "@/lib/funnel/report-props"
import { interpolate } from "@/lib/share"

import { ObservationDate } from "./observation-date"
import styles from "./dashboard.module.css"

type Filter = { severity: string; module: string }

const SEVERITY_ORDER = ["critical", "warning", "info"]
const severityRank = (severity: string) => { const index = SEVERITY_ORDER.indexOf(severity); return index < 0 ? SEVERITY_ORDER.length : index }

/**
 * Every finding, grouped by source and collapsed. Each finding inherits its
 * source, date, coverage state and limitation from the module that produced it
 * (guardrail 1: no claim without provenance). Filters only hide rows; the
 * server-rendered markup lists everything, so the page works without script.
 */
export function FindingsBrowser({ groups, modules, scannedAt, locale }: { groups: ReportFindingGroup[]; modules: ReportModuleRow[]; scannedAt?: string | null; locale: ReportProps["locale"] }) {
  const c = copy[locale].funnel.report
  const r = copy[locale].report
  const [filter, setFilter] = useState<Filter>({ severity: "all", module: "all" })
  const all = groups.flatMap((group) => group.findings)
  const severities = [...new Map(all.map((finding) => [finding.severity, finding.severityLabel])).entries()].sort(([a], [b]) => severityRank(a) - severityRank(b))
  const matches = (severity: string, module: string) =>
    (filter.severity === "all" || filter.severity === severity) && (filter.module === "all" || filter.module === module)
  const shown = all.filter((finding) => matches(finding.severity, finding.module)).length

  const chips = (kind: keyof Filter, label: string, options: Array<[string, string]>) => (
    <div className={styles.filterRow} role="group" aria-label={label}>
      <span>{label}</span>
      {[["all", r.filters.all] as [string, string], ...options].map(([value, text]) => (
        <button key={value} type="button" className={styles.filterChip} aria-pressed={filter[kind] === value} onClick={() => setFilter((current) => ({ ...current, [kind]: value }))}>
          {text}
        </button>
      ))}
    </div>
  )

  return (
    <>
      {all.length > 1 && (
        <div className={styles.filters} role="group" aria-label={r.filters.label}>
          {severities.length > 1 && chips("severity", r.filters.severity, severities)}
          {groups.length > 1 && chips("module", r.filters.source, groups.map((group) => [group.module, group.label]))}
          <p className={styles.caption} role="status">{shown === 0 ? r.filters.none : interpolate(r.filters.showing, { shown, total: all.length })}</p>
        </div>
      )}
      {groups.map((group) => {
        const source = modules.find((row) => row.key === group.module)
        const visible = group.findings.filter((finding) => matches(finding.severity, finding.module))
        return (
          <div key={group.module} hidden={visible.length === 0} data-print-reveal className={styles.findingGroup}>
            <h3 id={`report-detail-${group.module}`} className={styles.detailAnchor}>{group.label}</h3>
            <details className={styles.detailDisclosure}>
              <summary>{c.findingsTitle} · {group.label} ({visible.length})</summary>
              <ul className={styles.findingList}>
                {group.findings.map((finding) => (
                  <li key={finding.id} hidden={!matches(finding.severity, finding.module)} data-print-reveal className={styles.finding}>
                    <div className={styles.findingHead}>
                      <Badge variant="outline" className={`priority-${finding.tone}`}>{finding.severityLabel}</Badge>
                      <strong>{finding.label}</strong>
                    </div>
                    {finding.message && <p><span className={styles.findingLabel}>{r.whyItMatters}</span>{finding.message}</p>}
                    {finding.overallImpact && <p className={styles.caption}>{finding.overallImpact}</p>}
                    {finding.action && <p><span className={styles.findingLabel}>{r.whatToDo}</span>{finding.action}</p>}
                    {finding.evidence.length > 0 && (
                      <p className={styles.caption}>{c.evidenceLabel}: {finding.evidence.map(([key, value]) => `${key}: ${value}`).join(" · ")}</p>
                    )}
                    {finding.fixPackDraft && <p className={styles.caption}>{c.draftLabel}: {finding.fixPackDraft}</p>}
                    <p className={styles.provenance}>
                      {r.source}: {group.label} · <ObservationDate value={source?.observedAt} scannedAt={scannedAt} locale={locale} />
                      {source && source.state !== "measured" && <> <ProviderBadge state={source.state} locale={locale} /></>}
                    </p>
                    {source?.limitationCode && <p className={styles.caption}>{limitationCopy(locale, source.limitationCode).reason}</p>}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )
      })}
    </>
  )
}
