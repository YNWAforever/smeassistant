import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowRight, CheckCircle2, CircleDashed, ShieldCheck, TrendingDown } from "lucide-react"

import { EmptyState } from "@/components/kinnso/states"
import { FactType, PageIntro, SectionCard, TrendIcon } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { LocationSelect } from "@/components/workspace/location-select"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { comparisonReasonText, findingLabel, formatDay, metricLabel, scorePercent, signed, withLocation } from "@/lib/workspace/format"
import type { InsightsModel } from "@/lib/workspace/queries-pages"
import { fill } from "@/lib/copy-ui"

export interface InsightsViewProps {
  locale: PrototypeLocale
  workspaceSlug: string
  timezone: string
  locations: Array<{ slug: string; name: string }>
  model: InsightsModel
  /** The rescan control for this location (RescanButton), built by the page; omitted when there is none. */
  rescan?: ReactNode
}

/** Moved to lib/workspace/format.ts so Home renders the same words. */
const reasonText = comparisonReasonText

/**
 * Series points render as a list plus an accessible table; a point that is
 * not comparable to its predecessor is marked as a gap, so no trend is drawn
 * across it (CLAUDE.md Phase 3 item 4 "no line across gaps").
 */
function SeriesStrip({ model, locale, timezone }: { model: InsightsModel; locale: PrototypeLocale; timezone: string }) {
  const pc = copy[locale].workspaceHome.insights
  return (
    <ol className="trend-strip" aria-label={pc.visibilityScoreSeries}>
      {model.series.map((point, index) => (
        <li key={point.snapshotId} className={point.comparable || index === 0 ? "is-linked" : "is-gap"}>
          <strong>{point.score === null ? "—" : Math.round(point.score)}</strong>
          <small>{formatDay(point.observedAt, locale, timezone)}</small>
          <span>{scorePercent(point.coverage)}%</span>
          {index > 0 && !point.comparable && <em>{pc.gap}</em>}
        </li>
      ))}
    </ol>
  )
}

/** One sentence an owner can use: a felt change, or what is still missing. No score formula. */
export function insightsLeadSentence(model: InsightsModel, locale: PrototypeLocale): string {
  const pc = copy[locale].workspaceHome.insights
  if (model.locationSlug === "all") return pc.allLead
  const head = model.series.at(-1) ?? null
  if (!head) return pc.missingFirst
  const resolved = model.ledgerComparable ? model.ledger.resolved.length : 0
  const regressed = model.ledgerComparable ? model.ledger.regressed.length : 0
  const delta = model.trend.showScores ? model.trend.delta : null
  if (model.ledgerComparable || delta !== null) {
    if (resolved > 0 && regressed === 0) return fill(pc.betterResolved, { n: resolved })
    if (regressed > 0 && resolved === 0) return fill(pc.worseRegressed, { n: regressed })
    if (resolved > 0 && regressed > 0) return fill(pc.mixed, { resolved, regressed })
    if (delta !== null && delta > 0) return pc.better
    if (delta !== null && delta < 0) return pc.worse
    if (delta === 0) return pc.same
    return pc.quietChange
  }
  const reason = model.trend.reasonCode
  if (!reason || reason === "NO_DIFF") return pc.missingFirst
  return fill(pc.missingBecause, { reason: comparisonReasonText(reason, locale) })
}

export function InsightsView({ locale, workspaceSlug, timezone, locations, model, rescan }: InsightsViewProps) {
  const pc = copy[locale].workspaceHome.insights
  const base = `/${locale}/owner/${workspaceSlug}`
  const isAll = model.locationSlug === "all"
  const head = model.series.at(-1) ?? null
  const trend = model.trend
  const comparable = trend.showScores && trend.delta !== null
  const delta = comparable ? trend.delta : null
  const sentence = insightsLeadSentence(model, locale)
  return (
    <div className="insights-page">
      <PageIntro title={pc.leadTitle} description={isAll || head ? sentence : undefined} actions={<LocationSelect locale={locale} value={model.locationSlug} locations={locations} className="location-select" ariaLabel={pc.chooseInsightsLocation} />} />
      {isAll ? (
        <>
        <div className="location-proof-grid">
          {model.perLocation.map((row) => (
            <SectionCard key={row.location.id}>
              <p className="eyebrow">{row.location.name}</p>
              <h2>{row.comparable ? pc.locationReady : pc.locationWaiting}</h2>
              <Link href={withLocation(`${base}/insights`, row.location.slug)}>{pc.openLocation} <ArrowRight /></Link>
            </SectionCard>
          ))}
        </div>
        <details className="owner-disclosure insights-why">
          <summary>{copy[locale].home.trust}</summary>
          <div className="request-context-banner"><ShieldCheck /><div><strong>{pc.noInventedAggregateScore}</strong><span>{pc.locationsHaveDifferentCoverage}</span></div></div>
          <div className="location-proof-grid">
            {model.perLocation.map((row) => (
              <SectionCard key={`${row.location.id}-score`}>
                <p className="eyebrow">{row.location.name}</p>
                <h2>{row.score === null ? "—" : Math.round(row.score)} <small>/ 100</small></h2>
                <p>{row.coverage === null ? pc.noScanYet : `${pc.coverageLead} ${scorePercent(row.coverage)}% · ${row.comparable ? pc.comparable : pc.oneMoreComparableScan}`}</p>
              </SectionCard>
            ))}
          </div>
        </details>
        </>
      ) : !head ? (
        <EmptyState locale={locale} kind="noData" title={copy[locale].shell.empty.insights.title} body={copy[locale].shell.empty.insights.body} action={<Button asChild variant="outline" className="min-h-11"><Link href={withLocation(base, model.locationSlug)}>{copy[locale].shell.empty.insights.action}</Link></Button>} />
      ) : (
        <>
        {/* One scan, nothing to compare yet: show the starting point and the way forward instead of a lone sentence. */}
        {!comparable && !model.ledgerComparable && <SectionCard className="insights-baseline">
          <p className="eyebrow">{pc.baselineEyebrow}</p>
          <h2>{fill(pc.baselineTitle, { date: formatDay(head.observedAt, locale, timezone) })}</h2>
          <p>{fill(pc.baselineBody, { coverage: scorePercent(head.coverage) ?? "—" })}</p>
          {rescan && <div className="insights-baseline-actions">{rescan}</div>}
        </SectionCard>}
        <details className="owner-disclosure insights-why">
          <summary>{copy[locale].home.trust}</summary>
          <div className="before-after-grid">
            {model.metricCards.length === 0 && <p>{pc.noComparableEarlierValue}</p>}
            {model.metricCards.map((card) => (
              <SectionCard key={card.metricKey} className="metric-change-card"><FactType type={card.factType} /><p className="eyebrow">{metricLabel(card.metricKey, locale)}</p><h2>{card.factType !== "Unknown" && card.before !== null ? card.before : "—"} → {card.after === null ? "—" : card.after}</h2><p>{card.before !== null && card.factType !== "Unknown" ? `${pc.from} ${card.before} · ${formatDay(card.observedAt, locale, timezone)}` : pc.noComparableEarlierValue}</p></SectionCard>
            ))}
          </div>
          <p>{pc.observedFactsPossiblyRelated}</p>
          {!comparable && <SectionCard className="no-comparable-card"><CircleDashed /><div><p className="eyebrow">{pc.noComparableScanYet}</p><h2>{reasonText(trend.reasonCode, locale)}</h2><p>{pc.noTrendIsShown}</p></div></SectionCard>}
          <div className="insight-summary-grid">
            <SectionCard className="insight-stat"><TrendIcon delta={comparable ? delta : null} /><span>{pc.visibilityScore}</span><strong>{signed(delta)}</strong><small>{comparable && trend.base !== null && trend.head !== null ? `${Math.round(trend.base)} → ${Math.round(trend.head)} · ${pc.comparableSuffix}` : reasonText(trend.reasonCode, locale)}</small></SectionCard>
            <SectionCard className="insight-stat"><CheckCircle2 /><span>{pc.resolvedFindings}</span><strong>{model.ledgerComparable ? model.ledger.resolved.length : "—"}</strong><small>{model.ledgerComparable ? pc.acrossEligibleScans : copy[locale].home.noComparable}</small></SectionCard>
            <SectionCard className="insight-stat"><TrendingDown /><span>{pc.regressedFindings}</span><strong>{model.ledgerComparable ? model.ledger.regressed.length : "—"}</strong><small>{model.ledgerComparable ? pc.latestComparableScan : copy[locale].home.noComparable}</small></SectionCard>
            <SectionCard className="insight-stat"><CircleDashed /><span>{pc.coverageLead}</span><strong>{scorePercent(head.coverage)}%</strong><details className="owner-disclosure"><summary>{copy[locale].home.trust}</summary><small>{pc.unmeasuredSourcesAreNot}</small></details></SectionCard>
          </div>
          <details className="owner-disclosure insights-series-disclosure">
            <summary>{pc.visibilityAndCoverage}</summary>
          <SectionCard className="trend-card">
            <div className="section-card-heading"><div><p className="eyebrow">{pc.visibilityAndCoverage}</p><h2>{fill(model.series.length === 1 ? pc.scoreAcrossOne : pc.scoreAcrossMany, { scans: model.series.length })}</h2></div><Badge variant="outline">{pc.noLineAcrossEvidence}</Badge></div>
            <SeriesStrip model={model} locale={locale} timezone={timezone} />
            <Table>
              <TableCaption>{pc.accessibleDataTableFor}</TableCaption>
              <TableHeader><TableRow><TableHead>{pc.scanDate}</TableHead><TableHead>{pc.score}</TableHead><TableHead>{pc.coverageLead}</TableHead><TableHead>{pc.eligibility}</TableHead></TableRow></TableHeader>
              <TableBody>{model.series.map((point) => <TableRow key={point.snapshotId}><TableCell>{formatDay(point.observedAt, locale, timezone)}</TableCell><TableCell>{point.score === null ? pc.withheld : Math.round(point.score)}</TableCell><TableCell>{scorePercent(point.coverage)}%</TableCell><TableCell>{point.comparable ? pc.comparable : reasonText(point.incomparableReason, locale)}</TableCell></TableRow>)}</TableBody>
            </Table>
          </SectionCard>
          </details>
          {/* This card used to join every percentage with arrows and nothing
              else: no date, no denominator, no gap mark, no fact type -- on a
              page that otherwise badges "No line across evidence gaps". Two
              concrete misreads it produced: ai_mode flipping 0% -> 50% purely
              because an ambiguity retry added a second probe that scan, and two
              points three months apart reading as consecutive because the scan
              between them errored and was silently dropped. */}
          {model.aeoTrend.surfaces.some((s) => s.points.length > 0) && <details className="owner-disclosure insights-presence-disclosure"><summary>{pc.presenceRate}</summary><SectionCard className="surface-trend-card"><div className="section-card-heading"><div><p className="eyebrow">{pc.searchAndAiSurfaces}</p><h2>{pc.presenceRate}</h2></div><FactType type="Observed" /></div>
            <ul className="evidence-list">{model.aeoTrend.surfaces.filter((s) => s.points.length > 0).map((surface) => (
              <li key={surface.surface}>
                <Badge variant="outline">{metricLabel(`aeo.${surface.surface}_presence_rate`, locale)}</Badge>
                <span>
                  <strong>{Math.round((surface.points.at(-1)?.presenceRate ?? 0) * 100)}%</strong>
                  <small>{surface.points.map((point) => `${formatDay(point.capturedAt, locale, timezone)}: ${point.cited}/${point.total}${point.skippedScans > 0 ? (fill(pc.afterUnmeasured, { skippedScans: point.skippedScans })) : ""}`).join(" · ")}</small>
                </span>
              </li>
            ))}</ul>
            <details className="owner-disclosure"><summary>{copy[locale].home.trust}</summary><p className="limitation-note">{pc.theDenominatorIsThe}</p></details>
          </SectionCard></details>}
          {(model.ledger.resolved.length > 0 || model.ledger.regressed.length > 0 || model.ledger.decayed.length > 0) && <SectionCard className="change-ledger-card"><div className="section-card-heading"><div><p className="eyebrow">{pc.changeLedger}</p><h2>{pc.resolvedRegressedAndDecayed}</h2></div></div><ul className="evidence-list">{model.ledger.resolved.map((k) => <li key={`r${k}`}><Badge variant="outline">{pc.resolved}</Badge><span><strong>{findingLabel(k, locale)}</strong></span></li>)}{model.ledger.regressed.map((k) => <li key={`g${k}`}><Badge variant="outline">{pc.regressed}</Badge><span><strong>{findingLabel(k, locale)}</strong></span></li>)}{model.ledger.decayed.map((k) => <li key={`d${k}`}><Badge variant="outline">{pc.decayed}</Badge><span><strong>{findingLabel(k, locale)}</strong></span></li>)}</ul></SectionCard>}
          {/* P2.1 item 7: the approved/exported WORK itself, not only the
              scores and checks it produced -- deliveries was never read
              anywhere before this. */}
          {model.deliveries.length > 0 && (
            <SectionCard className="delivered-work-card">
              <div className="section-card-heading"><div><p className="eyebrow">{pc.approvedAndExportedWork}</p><h2>{pc.recentlyDelivered}</h2></div></div>
              <Table>
                <TableCaption className="sr-only">{pc.approvedAndExportedContent}</TableCaption>
                <TableHeader><TableRow><TableHead>{pc.action}</TableHead><TableHead>{pc.version}</TableHead><TableHead>{pc.mode}</TableHead><TableHead>{pc.delivered}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {model.deliveries.map((row) => (
                    <TableRow key={`${row.action_id}-${row.version_no}`}>
                      <TableCell><Link href={withLocation(`${base}/actions/${row.action_id}`, model.locationSlug)}>{row.title[locale] ?? row.title.en}</Link></TableCell>
                      <TableCell>{fill(pc.versionShort, { version_no: row.version_no })}</TableCell>
                      <TableCell>{row.mode === "export" ? (copy[locale].ui.visual.feedback.export) : row.mode === "copy" ? pc.copy : pc.publish}{row.channel ? ` · ${row.channel}` : ""}</TableCell>
                      <TableCell>{formatDay(row.delivered_at, locale, timezone)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SectionCard>
          )}
        </details>
        </>
      )}
    </div>
  )
}
