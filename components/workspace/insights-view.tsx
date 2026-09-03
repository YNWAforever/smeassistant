import Link from "next/link"
import { ArrowRight, CheckCircle2, CircleDashed, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react"

import { FactType, PageIntro, SectionCard } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LocationSelect } from "@/components/workspace/location-select"
import type { PrototypeLocale } from "@/lib/copy"
import { findingLabel, formatDay, metricLabel, scorePercent, signed, withLocation } from "@/lib/workspace/format"
import type { InsightsModel } from "@/lib/workspace/queries-pages"

export interface InsightsViewProps {
  locale: PrototypeLocale
  workspaceSlug: string
  timezone: string
  locations: Array<{ slug: string; name: string }>
  model: InsightsModel
}

function reasonText(reason: string | null, isChinese: boolean): string {
  switch (reason) {
    case "SCORING_VERSION_MISMATCH":
      return isChinese ? "評分版本不同" : "Scoring version changed"
    case "SCORING_VERSION_UNKNOWN":
      return isChinese ? "評分版本未知" : "Scoring version unknown"
    case "NO_SHARED_MEASURED_MODULE":
      return isChinese ? "沒有共同已量度來源" : "No shared measured source"
    case "INSUFFICIENT_INDEPENDENT_CHANNELS":
      return isChinese ? "獨立來源不足" : "Too few independent channels"
    default:
      return reason ?? (isChinese ? "尚無可比較掃描" : "No comparable scan yet")
  }
}

/**
 * Series points render as a list plus an accessible table; a point that is
 * not comparable to its predecessor is marked as a gap, so no trend is drawn
 * across it (CLAUDE.md Phase 3 item 4 "no line across gaps").
 */
function SeriesStrip({ model, locale, timezone }: { model: InsightsModel; locale: PrototypeLocale; timezone: string }) {
  const isChinese = locale !== "en"
  return (
    <ol className="trend-strip" aria-label={isChinese ? "能見度評分序列" : "Visibility score series"}>
      {model.series.map((point, index) => (
        <li key={point.snapshotId} className={point.comparable || index === 0 ? "is-linked" : "is-gap"}>
          <strong>{point.score === null ? "—" : Math.round(point.score)}</strong>
          <small>{formatDay(point.observedAt, locale, timezone)}</small>
          <span>{scorePercent(point.coverage)}%</span>
          {index > 0 && !point.comparable && <em>{isChinese ? "缺口" : "gap"}</em>}
        </li>
      ))}
    </ol>
  )
}

export function InsightsView({ locale, workspaceSlug, timezone, locations, model }: InsightsViewProps) {
  const isChinese = locale !== "en"
  const base = `/${locale}/owner/${workspaceSlug}`
  const isAll = model.locationSlug === "all"
  const head = model.series.at(-1) ?? null
  const trend = model.trend
  const comparable = trend.showScores && trend.delta !== null
  const delta = comparable ? trend.delta : null
  return (
    <div className="insights-page">
      <PageIntro eyebrow={isChinese ? "可比較變化及成果證據" : "Comparable change and outcome evidence"} title={isChinese ? "成效" : "Insights"} description={isChinese ? "把已觀察事實、可能相關的變化與仍未知的結果分開，避免用單一分數製造虛假把握。" : "Observed facts, possibly related changes and unknown outcomes stay separate."} actions={<LocationSelect locale={locale} value={model.locationSlug} locations={locations} className="location-select" ariaLabel={isChinese ? "選擇成效地點" : "Choose insights location"} />} />
      {isAll && <div className="request-context-banner"><ShieldCheck /><div><strong>{isChinese ? "不製造合併平均分" : "No invented aggregate score"}</strong><span>{isChinese ? "不同地點的來源覆蓋與掃描日期不一致，因此先逐店呈現，待各店都有可比較掃描才顯示合併趨勢。" : "Locations have different coverage and scan dates, so they remain separate until each has comparable scans."}</span></div></div>}
      {isAll ? (
        <div className="location-proof-grid">
          {model.perLocation.map((row) => (
            <SectionCard key={row.location.id}>
              <p className="eyebrow">{row.location.name}</p>
              <h2>{row.score === null ? "—" : Math.round(row.score)} <small>/ 100</small></h2>
              <p>{row.coverage === null ? (isChinese ? "尚未有掃描" : "No scan yet") : `${isChinese ? "覆蓋率" : "Coverage"} ${scorePercent(row.coverage)}% · ${row.comparable ? (isChinese ? "可比較" : "Comparable") : (isChinese ? "尚需一次可比較掃描" : "One more comparable scan required")}`}</p>
              <Badge variant="outline">{row.comparable ? <CheckCircle2 /> : <CircleDashed />} {row.comparable ? (isChinese ? "有趨勢" : "Trend available") : (isChinese ? "暫無趨勢" : "No trend yet")}</Badge>
              <Link href={withLocation(`${base}/insights`, row.location.slug)}>{isChinese ? "查看地點" : "Open location"} <ArrowRight /></Link>
            </SectionCard>
          ))}
        </div>
      ) : !head ? (
        <SectionCard className="no-comparable-card"><CircleDashed /><div><p className="eyebrow">{isChinese ? "尚未有掃描" : "No scan yet"}</p><h2>{isChinese ? "完成第一次掃描後，成效會在這裡出現" : "Insights appear after the first scan completes"}</h2></div></SectionCard>
      ) : (
        <>
          {!comparable && <SectionCard className="no-comparable-card"><CircleDashed /><div><p className="eyebrow">{isChinese ? "暫無可比較掃描" : "No comparable scan yet"}</p><h2>{reasonText(trend.reasonCode, isChinese)}</h2><p>{isChinese ? "符合資格前不顯示趨勢；分數與覆蓋率仍按每次掃描如實列出。" : "No trend is shown until eligibility is met; each scan's score and coverage are still listed honestly."}</p></div></SectionCard>}
          <div className="insight-summary-grid">
            <SectionCard>{delta !== null && delta < 0 ? <TrendingDown /> : <TrendingUp />}<span>{isChinese ? "能見度評分" : "Visibility score"}</span><strong>{signed(delta)}</strong><small>{comparable && trend.base !== null && trend.head !== null ? `${Math.round(trend.base)} → ${Math.round(trend.head)} · ${isChinese ? "可比較" : "comparable"}` : reasonText(trend.reasonCode, isChinese)}</small></SectionCard>
            <SectionCard><CheckCircle2 /><span>{isChinese ? "已解決問題" : "Resolved findings"}</span><strong>{model.ledger.resolved.length}</strong><small>{isChinese ? "跨兩次符合資格掃描" : "Across eligible scans"}</small></SectionCard>
            <SectionCard><TrendingDown /><span>{isChinese ? "新退步" : "Regressed findings"}</span><strong>{model.ledger.regressed.length}</strong><small>{isChinese ? "最新可比較掃描" : "Latest comparable scan"}</small></SectionCard>
            <SectionCard><CircleDashed /><span>{isChinese ? "覆蓋率" : "Coverage"}</span><strong>{scorePercent(head.coverage)}%</strong><small>{isChinese ? "未量度來源不當作零分" : "Unmeasured sources are not zero"}</small></SectionCard>
          </div>
          <SectionCard className="trend-card">
            <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "整體能見度及覆蓋率" : "Visibility and coverage"}</p><h2>{isChinese ? `${model.series.length} 次掃描的能見度評分` : `Visibility score across ${model.series.length} ${model.series.length === 1 ? "scan" : "scans"}`}</h2></div><Badge variant="outline">{isChinese ? "不跨越證據缺口" : "No line across evidence gaps"}</Badge></div>
            <SeriesStrip model={model} locale={locale} timezone={timezone} />
            <Table>
              <TableCaption>{isChinese ? "無障礙資料表：圖表的相同數據" : "Accessible data table for the same series"}</TableCaption>
              <TableHeader><TableRow><TableHead>{isChinese ? "掃描日期" : "Scan date"}</TableHead><TableHead>{isChinese ? "評分" : "Score"}</TableHead><TableHead>{isChinese ? "覆蓋率" : "Coverage"}</TableHead><TableHead>{isChinese ? "比較資格" : "Eligibility"}</TableHead></TableRow></TableHeader>
              <TableBody>{model.series.map((point) => <TableRow key={point.snapshotId}><TableCell>{formatDay(point.observedAt, locale, timezone)}</TableCell><TableCell>{point.score === null ? (isChinese ? "暫不顯示" : "Withheld") : Math.round(point.score)}</TableCell><TableCell>{scorePercent(point.coverage)}%</TableCell><TableCell>{point.comparable ? (isChinese ? "可比較" : "Comparable") : reasonText(point.incomparableReason, isChinese)}</TableCell></TableRow>)}</TableBody>
            </Table>
          </SectionCard>
          <div className="before-after-grid">
            {model.metricCards.map((card) => (
              <SectionCard key={card.metricKey}><FactType type={card.factType} /><p className="eyebrow">{metricLabel(card.metricKey, locale)}</p><h2>{card.after === null ? "—" : card.after}{card.delta !== null && <small> {signed(card.delta, 1)}</small>}</h2><p>{card.factType === "Observed" ? `${isChinese ? "由" : "From"} ${card.before} · ${formatDay(card.observedAt, locale, timezone)}` : (isChinese ? "沒有可比較的前值" : "No comparable earlier value")}</p></SectionCard>
            ))}
          </div>
          {model.aeoTrend.surfaces.some((s) => s.points.length > 0) && <SectionCard><p className="eyebrow">{isChinese ? "搜尋及 AI 介面" : "Search and AI surfaces"}</p><h2>{isChinese ? "被引用比率趨勢" : "Presence rate trend"}</h2><ul className="evidence-list">{model.aeoTrend.surfaces.filter((s) => s.points.length > 0).map((surface) => <li key={surface.surface}><Badge variant="outline">{surface.surface}</Badge><span><strong>{Math.round((surface.points.at(-1)?.presenceRate ?? 0) * 100)}%</strong><small>{surface.points.map((p) => `${Math.round(p.presenceRate * 100)}%`).join(" → ")}</small></span></li>)}</ul></SectionCard>}
          {(model.ledger.resolved.length > 0 || model.ledger.regressed.length > 0 || model.ledger.decayed.length > 0) && <SectionCard className="change-ledger-card"><div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "變化紀錄" : "Change ledger"}</p><h2>{isChinese ? "已解決、退步及時間推移" : "Resolved, regressed and decayed"}</h2></div></div><ul className="evidence-list">{model.ledger.resolved.map((k) => <li key={`r${k}`}><Badge variant="outline">{isChinese ? "已解決" : "Resolved"}</Badge><span><strong>{findingLabel(k)}</strong></span></li>)}{model.ledger.regressed.map((k) => <li key={`g${k}`}><Badge variant="outline">{isChinese ? "退步" : "Regressed"}</Badge><span><strong>{findingLabel(k)}</strong></span></li>)}{model.ledger.decayed.map((k) => <li key={`d${k}`}><Badge variant="outline">{isChinese ? "時間推移" : "Decayed"}</Badge><span><strong>{findingLabel(k)}</strong></span></li>)}</ul></SectionCard>}
        </>
      )}
    </div>
  )
}
