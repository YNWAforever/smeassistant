import Link from "next/link"
import { ArrowRight, CalendarClock, Check, CheckCircle2, CircleAlert, CircleCheck, Clock3, FileClock, Globe2, ShieldCheck, Sparkles, TrendingDown, TrendingUp } from "lucide-react"

import { ContextualAssistant } from "@/components/pocket-assistant/assistant-sheet"
import { CapabilityBadge, FactType, PageIntro, ScoreDial, SectionCard } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FixPackCard } from "@/components/workspace/fix-pack-card"
import { LocationSelect } from "@/components/workspace/location-select"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import { effortLabel, findingLabel, formatDateTime, formatDay, metricLabel, priorityClass, priorityLabel, scorePercent, signed, withLocation } from "@/lib/workspace/format"
import { measuredPrimarySources } from "@/lib/workspace/module-states"
import type { HomeBrief } from "@/lib/workspace/queries-pages"
import type { ActionOverview } from "@/lib/workspace/overview"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"

export interface HomeBriefViewProps {
  locale: PrototypeLocale
  workspaceSlug: string
  workspaceName: string
  tier: "lite" | "paid"
  timezone: string
  locations: Array<{ slug: string; name: string }>
  brief: HomeBrief
  demo?: boolean
  /** When present, the Fix Pack drafts card (agent_runs) renders after the secondary grid. */
  fixPack?: { workspaceId: string; role: WorkspaceRole }
}

function actionHref(locale: PrototypeLocale, slug: string, action: ActionOverview, location: string): string {
  const base = `/${locale}/owner/${slug}`
  const href = action.templateKey === "google-reconnect" ? `${base}/settings/integrations` : `${base}/actions/${action.id}`
  return withLocation(href, location)
}

export function HomeBriefView({ locale, workspaceSlug, tier, timezone, locations, brief, demo = false, fixPack }: HomeBriefViewProps) {
  const t = copy[locale].home
  const isChinese = locale !== "en"
  const base = `/${locale}/owner/${workspaceSlug}`
  const location = brief.locationSlug
  const { snapshot, changed, priority, proof, month } = brief
  const sources = snapshot ? measuredPrimarySources(snapshot.moduleStates) : null
  const tierLabel = tier === "paid" ? (isChinese ? "增長工作台" : "Growth Workspace") : (isChinese ? "免費方案" : "Free plan")
  const decisions = brief.agentStrip.awaiting
  const steps = isChinese
    ? ["偵察完成", "優先次序完成", `${brief.drafts} 份草稿已備妥`, "待你審批"]
    : ["Scout complete", "Priority ready", `${brief.drafts} drafts prepared`, "Awaiting approval"]
  const stepDone = [brief.agentStrip.scout, brief.agentStrip.priority, brief.drafts > 0, false]
  const changedBadge = changed.comparable ? (isChinese ? "可比較" : "Comparable") : (isChinese ? "未能比較" : "Not comparable")
  const changedReason = changed.reason ? (isChinese ? `原因：${changed.reason}` : `Reason: ${changed.reason}`) : null

  return (
    <div className="owner-home-page">
      <PageIntro
        eyebrow={snapshot ? `${isChinese ? "快照" : "Snapshot"} · ${formatDateTime(snapshot.observedAt, locale, timezone)}` : (isChinese ? "尚未有快照" : "No snapshot yet")}
        title={t.title}
        description={t.subtitle}
        actions={<LocationSelect locale={locale} value={location} locations={locations} />}
      />

      <section className="workspace-agent-strip" aria-label={isChinese ? "AI 能見度團隊狀態" : "AI Visibility Team status"}>
        <div className="workspace-agent-summary"><span><Sparkles /></span><div><Badge variant="outline">{tierLabel}{demo ? (isChinese ? " · 示範" : " · Demo") : ""}</Badge><h2>{isChinese ? `AI 能見度團隊已完成分析 · ${decisions} 項待你決定` : `AI Visibility Team finished the analysis · ${decisions} ${decisions === 1 ? "decision" : "decisions"} for you`}</h2><p>{isChinese ? "各專員只在背後協作；你只需審閱一項首要行動。" : "Specialists coordinate backstage; you review one priority action."}</p></div></div>
        <ol>
          {steps.map((step, index) => <li key={step} className={stepDone[index] ? "is-complete" : "is-current"}><span>{stepDone[index] ? <Check /> : index + 1}</span><strong>{step}</strong></li>)}
        </ol>
        <small><ShieldCheck /> {isChinese ? "不會自動發佈 · 指定版本獲核准並完成匯出後才計 1 次交付" : "Never auto-published · one delivery counts only after exact-version approval and export"}</small>
      </section>

      {location === "all" && <div className="context-banner" role="status"><CircleAlert /><div><strong>{isChinese ? "已切換至所有地點" : "Context changed to all locations"}</strong><span>{isChinese ? "摘要按地點範圍顯示；未能取得資料的地點不會當成零分平均。" : "Summary data is location-aware; unavailable locations are never averaged as zero."}</span></div></div>}

      <section className="owner-brief-grid" aria-label={isChinese ? "今日營運摘要" : "Today's operating brief"}>
        <article className="brief-priority-card">
          <div className="card-label-row"><span><Sparkles /> {t.priority}</span>{priority ? <Badge className={priorityClass(priority.priority)}>{priorityLabel(priority.priority, locale)}</Badge> : <Badge variant="outline">{isChinese ? "沒有待辦" : "Nothing open"}</Badge>}</div>
          {priority ? (
            <>
              <h2>{resolveText(priority.title, locale)}</h2>
              <p>{resolveText(priority.summary, locale)}</p>
              <div className="why-now-box"><FactType type={priority.evidence.factType} /><div><strong>{isChinese ? "為何現在做" : "Why now"}</strong><span>{resolveText(priority.evidence.detail, locale)}</span><small>{isChinese ? "觀察於" : "Observed"} {formatDateTime(priority.evidence.observedAt, locale, timezone)} · {priority.evidence.source}</small></div></div>
              <div className="brief-action-meta"><span><Clock3 /> {effortLabel(priority.effortMinutes, locale)} {isChinese ? "店主時間" : "owner time"}</span><span><FileClock /> {resolveText(priority.displayPhase, locale)}</span></div>
              <div className="brief-priority-actions"><Button asChild size="lg"><Link href={actionHref(locale, workspaceSlug, priority, location)}>{priority.missingInputs.length ? (isChinese ? "審閱所需資料" : "Review required inputs") : t.reviewDrafts}<ArrowRight /></Link></Button><ContextualAssistant locale={locale} surface="home" triggerLabel={isChinese ? "問為何先做這項" : "Ask why this comes first"} /></div>
            </>
          ) : (
            <>
              <h2>{isChinese ? "暫時沒有需要你決定的行動" : "No action needs your decision right now"}</h2>
              <p>{snapshot ? (isChinese ? "最新快照沒有產生新的行動；持續項目仍可在行動頁查看。" : "The latest snapshot produced no new action; persistent work stays on the actions page.") : (isChinese ? "完成一次掃描後，行動會從已量度的發現推導出來。" : "Actions are derived from measured findings once a scan completes.")}</p>
            </>
          )}
        </article>

        <article className="brief-score-card">
          <div className="card-label-row"><span>{changed.delta !== null && changed.delta < 0 ? <TrendingDown /> : <TrendingUp />} {t.changed}</span><Badge variant="outline">{changedBadge}</Badge></div>
          {!snapshot ? (
            <div className="aggregate-empty"><CircleAlert /><h2>{location === "all" ? (isChinese ? "不製造合併平均分" : "No fabricated aggregate score") : (isChinese ? "尚未有快照" : "No snapshot yet")}</h2><p>{location === "all" ? (isChinese ? "各地點的證據覆蓋與比較資格不同；請逐個地點查看評分。" : "Coverage and eligibility differ by location; inspect each location separately.") : (isChinese ? "完成第一次掃描後，評分與覆蓋率會在這裡出現。" : "Score and coverage appear here after the first scan completes.")}</p></div>
          ) : snapshot.overallScore === null ? (
            <div className="aggregate-empty"><CircleAlert /><h2>{isChinese ? "評分暫不顯示 · 已量度證據太少" : "Score withheld · too little measured evidence"}</h2><p>{isChinese ? `覆蓋率 ${scorePercent(snapshot.coverage)}%。缺少的來源會降低覆蓋率，不會當成零分。` : `Coverage ${scorePercent(snapshot.coverage)}%. Missing sources lower coverage; they are never scored as zero.`}</p></div>
          ) : (
            <>
              <ScoreDial score={Math.round(snapshot.overallScore)} coverage={scorePercent(snapshot.coverage) ?? 0} delta={changed.delta === null ? 0 : Math.round(changed.delta)} />
              <div className="coverage-source-line"><span><Check /> {isChinese ? `${sources?.measured ?? 0} 個來源已量度` : `${sources?.measured ?? 0} measured`}</span><span><CircleAlert /> {isChinese ? `${(sources?.total ?? 4) - (sources?.measured ?? 0)} 個暫時未能取得` : `${(sources?.total ?? 4) - (sources?.measured ?? 0)} unavailable`}</span></div>
              {changedReason && <p className="limitation-note">{changedReason}</p>}
            </>
          )}
          <Link href={withLocation(`${base}/insights`, location)}>{isChinese ? "審閱可比較證據" : "Review comparable evidence"} <ArrowRight /></Link>
        </article>

        <article className="brief-proof-card">
          <div className="card-label-row"><span><CircleCheck /> {t.proof}</span><Badge variant="outline">{proof ? (proof.factType === "Attributed" ? (isChinese ? "行動後觀察" : "Observed after action") : (isChinese ? "可比較變化" : "Comparable change")) : (isChinese ? "尚無量度" : "Nothing measured yet")}</Badge></div>
          {proof ? (
            <>
              <div className="proof-value">{proof.delta !== null && proof.delta < 0 ? <TrendingDown /> : <TrendingUp />}<strong>{signed(proof.delta, 1)}<span> {isChinese ? "變化" : "change"}</span></strong></div>
              <h2>{metricLabel(proof.metricKey, locale)}</h2>
              <p>{isChinese ? `${proof.before ?? "—"} → ${proof.after ?? "—"}，於 ${formatDay(proof.observedAt, locale, timezone)} 量度` : `${proof.before ?? "—"} → ${proof.after ?? "—"}, measured ${formatDay(proof.observedAt, locale, timezone)}`}{proof.windowDays ? (isChinese ? ` · ${proof.windowDays} 日內` : ` · ${proof.windowDays}-day window`) : ""}</p>
              <div className="proof-caveat"><FactType type={proof.factType} /><span>{proof.factType === "Attributed" ? (isChinese ? "只顯示時間上的可能關聯；不宣稱帶來收入或預訂因果。" : "Temporal association only; no revenue or booking causation is claimed.") : (isChinese ? "兩次可比較快照之間的已觀察差異。" : "Observed difference between two comparable snapshots.")}</span></div>
            </>
          ) : (
            <>
              <h2>{isChinese ? "完成一項行動並等待可比較掃描後，證明會在這裡出現" : "Proof appears after an action is completed and a comparable scan lands"}</h2>
              <p>{isChinese ? "工作台只會用兩次可比較快照的差異作證明，不會推斷未量度的變化。" : "The workspace only cites the difference between two comparable snapshots; it never infers unmeasured change."}</p>
            </>
          )}
          <Link href={withLocation(`${base}/insights`, location)}>{isChinese ? "查看行動前後" : "Inspect before and after"} <ArrowRight /></Link>
        </article>
      </section>

      <section className="month-brief" aria-labelledby="month-title">
        <div className="month-brief-heading"><div><p className="eyebrow">{t.month}</p><h2 id="month-title">{isChinese ? "小行動，累積看得見的進展。" : "Small actions, visible momentum."}</h2></div><div className="next-scan"><CalendarClock /><span>{isChinese ? "下次掃描" : "Next scan"}<strong>{brief.nextScanAt ? formatDay(brief.nextScanAt, locale, timezone) : (isChinese ? "未排程" : "Not scheduled")}</strong></span></div></div>
        <div className="month-metrics">
          <article><span className="metric-icon resolved"><CheckCircle2 /></span><div><strong>{month.resolved}</strong><span>{isChinese ? "個問題已解決" : "issues resolved"}</span></div><small>{isChinese ? "來自可比較掃描" : "Across comparable scans"}</small></article>
          <article><span className="metric-icon regressed"><TrendingDown /></span><div><strong>{month.regressed}</strong><span>{isChinese ? "項新退步" : month.regressed === 1 ? "new regression" : "new regressions"}</span></div><small>{brief.ledger.regressed[0] ? findingLabel(brief.ledger.regressed[0]) : (isChinese ? "沒有退步" : "None recorded")}</small></article>
          <article><span className="metric-icon approval"><FileClock /></span><div><strong>{month.awaitingApproval}</strong><span>{isChinese ? "項等待審批" : "awaiting approval"}</span></div><small>{isChinese ? "草稿版本" : "Draft versions"}</small></article>
          <article><span className="metric-icon completed"><CircleCheck /></span><div><strong>{month.completed}</strong><span>{isChinese ? "項行動已完成" : "actions completed"}</span></div><small>{isChinese ? `${month.measured} 項已量度` : `${month.measured} measured`}</small></article>
        </div>
      </section>

      <div className="home-secondary-grid">
        <SectionCard className="pending-approval-card">
          <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "決定清單" : "Decision queue"}</p><h2>{isChinese ? "等待你的決定" : "Open actions"}</h2></div><Button asChild variant="ghost"><Link href={withLocation(`${base}/actions`, location)}>{isChinese ? "查看全部" : "View all"} <ArrowRight /></Link></Button></div>
          <div className="compact-action-list">
            {brief.openActions.length === 0 && <p>{isChinese ? "沒有待辦行動。" : "No open actions."}</p>}
            {brief.openActions.slice(0, 3).map((action) => <Link key={action.id} href={actionHref(locale, workspaceSlug, action, location)}><span className={`priority-marker ${priorityClass(action.priority)}`} /><div><strong>{resolveText(action.title, locale)}</strong><small>{resolveText(action.location.name, locale)} · {resolveText(action.displayPhase, locale)}</small></div><span className="compact-effort">{effortLabel(action.effortMinutes, locale)}</span><ArrowRight /></Link>)}
          </div>
        </SectionCard>

        <SectionCard className="integration-health-card">
          <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "資料來源可靠度" : "Source reliability"}</p><h2>{isChinese ? "連接狀態" : "Integration health"}</h2></div><Button asChild variant="ghost"><Link href={`${base}/settings/integrations`}>{isChinese ? "管理" : "Manage"}</Link></Button></div>
          <div className="integration-compact-list">
            {[
              { name: isChinese ? "Google 商戶檔案" : "Google Business Profile", ok: brief.integrations.google.status === "active", warn: brief.integrations.google.status !== "active", note: brief.integrations.google.status === "active" ? (isChinese ? "已連接" : "Connected") : (isChinese ? "需要連接" : "Requires connection") },
              { name: isChinese ? "Instagram 公開證據" : "Instagram public evidence", ok: brief.integrations.instagram.state === "measured", warn: false, note: copy[locale].common[brief.integrations.instagram.state === "unknown" ? "unavailable" : brief.integrations.instagram.state] },
              { name: isChinese ? "公開網站" : "Public website", ok: brief.integrations.website.state === "measured", warn: false, note: copy[locale].common[brief.integrations.website.state === "unknown" ? "unavailable" : brief.integrations.website.state] },
            ].map((row) => <div key={row.name}><span className={row.ok ? "health-ok" : row.warn ? "health-warn" : "health-neutral"}>{row.ok ? <Check /> : row.warn ? <CircleAlert /> : <Globe2 />}</span><div><strong>{row.name}</strong><small>{row.note}</small></div></div>)}
          </div>
        </SectionCard>
      </div>

      {fixPack && <FixPackCard locale={locale} workspaceId={fixPack.workspaceId} viewerRole={fixPack.role} />}

      <SectionCard className="change-ledger-card">
        <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "最近變化紀錄" : "Recent change ledger"}</p><h2>{isChinese ? "先看證據，再看圖表" : "Evidence before charts"}</h2></div><Badge variant="outline">{snapshot ? `${formatDay(snapshot.observedAt, locale, timezone)}${changed.comparable ? (isChinese ? " 可比較掃描" : " comparable scan") : ""}` : (isChinese ? "尚未有掃描" : "No scan yet")}</Badge></div>
        <div className="change-ledger">
          {brief.ledger.regressed.map((key) => <article key={`r-${key}`}><FactType type="Observed" /><div><h3>{findingLabel(key)}</h3><p>{isChinese ? "在最新可比較掃描中出現退步。" : "Regressed in the latest comparable scan."}</p><small>{isChinese ? "退步" : "Regressed"}</small></div><Button asChild variant="outline" size="sm"><Link href={withLocation(`${base}/actions`, location)}>{isChinese ? "立即處理" : "Act now"}</Link></Button></article>)}
          {brief.ledger.resolved.map((key) => <article key={`s-${key}`}><FactType type="Observed" /><div><h3>{findingLabel(key)}</h3><p>{isChinese ? "在最新可比較掃描中已解決。" : "Resolved in the latest comparable scan."}</p><small>{isChinese ? "已解決" : "Resolved"}</small></div><Button asChild variant="outline" size="sm"><Link href={withLocation(`${base}/insights`, location)}>{isChinese ? "查看證明" : "View proof"}</Link></Button></article>)}
          {brief.ledger.decayed.map((key) => <article key={`d-${key}`}><FactType type="Observed" /><div><h3>{findingLabel(key)}</h3><p>{isChinese ? "時間推移導致的變化，不視為退步。" : "Time-driven change; not treated as a regression."}</p><small>{isChinese ? "時間推移" : "Decayed"}</small></div></article>)}
          {!changed.comparable && <article><FactType type="Unknown" /><div><h3>{isChinese ? "比較暫時未能取得" : "Comparison unavailable"}</h3><p>{changedReason ?? (isChinese ? "需要兩次符合資格的掃描才會推論變化。" : "Two eligible scans are needed before any change is inferred.")}</p><small>{isChinese ? "覆蓋缺口 · 不計分" : "Coverage gap · Not scored"}</small></div><Button asChild variant="outline" size="sm"><Link href={`${base}/settings/integrations`}>{isChinese ? "檢查來源" : "Check source"}</Link></Button></article>}
        </div>
      </SectionCard>

      <div className="operational-footnote"><ShieldCheck /><span>{isChinese ? "所有數字均來自已儲存的掃描快照；未量度的來源會降低覆蓋率，不會當成零分。" : "Every number comes from a stored scan snapshot; unmeasured sources lower coverage and are never scored as zero."}</span>{demo && <CapabilityBadge value="Demo" />}</div>
    </div>
  )
}
