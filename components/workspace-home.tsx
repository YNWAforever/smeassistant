"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileClock,
  Globe2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { actions, integrations } from "@/lib/demo-data"
import { CapabilityBadge, FactType, PageIntro, ScoreDial, SectionCard } from "@/components/product-ui"
import { ContextualAssistant } from "@/components/pocket-assistant/assistant-sheet"

export function OwnerHomePage({ locale, initialLocation }: { locale: PrototypeLocale; initialLocation?: string }) {
  const t = copy[locale].home
  const isChinese = locale !== "en"
  const [location, setLocation] = useState(["yik-yam", "tin-hau", "all"].includes(initialLocation ?? "") ? initialLocation! : "yik-yam")
  const locationName = location === "all" ? "All locations" : location === "tin-hau" ? "Tin Hau" : "Yik Yam Street"
  const displayLocationName = isChinese ? (location === "all" ? "所有地點" : location === "tin-hau" ? "天后" : "奕蔭街") : locationName
  const scopedActions = location === "all" ? actions : actions.filter((action) => action.location === locationName || action.location === "All locations")
  const primary = location === "tin-hau" ? actions.find((action) => action.id === "menu-translation")! : actions[0]
  const actionZh: Record<string, { title: string; summary: string; evidence: string }> = {
    "review-response": { title: "回覆 7 則未回覆的 Google 評論", summary: "草稿已按品牌語氣及評論內容準備好，等你一次過審閱。", evidence: "可比較的 Google 商戶快照顯示，評論回覆率由 31% 降至 18%。" },
    "social-post": { title: "處理 Instagram 16 日內容空檔", summary: "一則以店舖近況為主的社交帖文草稿已準備好。", evidence: "最近可取得的公開帖文距今 16 日。" },
    "visibility-content": { title: "新增清晰的私人宴會常見問題", summary: "解答三項搜尋及 AI 介面檢查中缺少的問題。", evidence: "未找到有資料支持的容納人數、預訂提前期或素食選項答案。" },
    "menu-translation": { title: "審閱英文餐牌翻譯", summary: "先確認菜式資料，再完成餘下英文標籤。", evidence: "24 個餐牌項目中，只有 15 個有英文標籤。" },
    "google-reconnect": { title: "重新連接 Google 商戶權限", summary: "恢復連接後，才可安全取得非公開營運資料。", evidence: "目前連接已失效，工作台不會推斷缺少的資料。" },
  }
  const actionCopy = (action: typeof primary) => isChinese ? (actionZh[action.id] ?? { title: action.title, summary: action.summary, evidence: action.evidence }) : { title: action.title, summary: action.summary, evidence: action.evidence }
  const primaryCopy = actionCopy(primary)
  const actionHref = (id: string) => id === "google-reconnect"
    ? `/${locale}/owner/kam-man-house/settings/integrations?location=${location}`
    : ["review-response", "social-post"].includes(id)
      ? `/${locale}/owner/kam-man-house/actions/${id}?location=${location}`
      : `/${locale}/owner/kam-man-house/create?location=${location}`
  const effortLabel = (value: string) => isChinese ? value.replace(" minutes", " 分鐘").replace(" minute", " 分鐘") : value
  return (
    <div className="owner-home-page">
      <PageIntro
        eyebrow={isChinese ? "示範快照 · 2026 年 8 月 27 日" : "Demo snapshot · 27 August 2026"}
        title={t.title}
        description={t.subtitle}
        actions={<><Select value={location} onValueChange={setLocation}><SelectTrigger className="location-select" aria-label={isChinese ? "選擇地點" : "Choose location"}><MapPin /><SelectValue>{displayLocationName}</SelectValue></SelectTrigger><SelectContent align="end"><SelectItem value="yik-yam">{isChinese ? "奕蔭街" : "Yik Yam Street"}</SelectItem><SelectItem value="tin-hau">{isChinese ? "天后" : "Tin Hau"}</SelectItem><SelectItem value="all">{isChinese ? "所有地點" : "All locations"}</SelectItem></SelectContent></Select><Button asChild variant="outline"><Link href={`/${locale}/scanning/demo-rescan-248?business=${encodeURIComponent("錦汶館")}&market=hk&location=${location}`}><RefreshCw /> {isChinese ? "重新掃描 · 示範" : "Re-scan · Demo"}</Link></Button></>}
      />

      <section className="workspace-agent-strip" aria-label={isChinese ? "AI 能見度團隊狀態" : "AI Visibility Team status"}>
        <div className="workspace-agent-summary"><span><Sparkles /></span><div><Badge variant="outline">{isChinese ? "增長工作台 · 示範" : "Growth Workspace · Demo"}</Badge><h2>{isChinese ? "AI 能見度團隊已完成分析 · 1 項待你決定" : "AI Visibility Team finished the analysis · 1 decision for you"}</h2><p>{isChinese ? "各專員只在背後協作；你只需審閱一項首要行動。" : "Specialists coordinate backstage; you review one priority action."}</p></div></div>
        <ol>
          {(isChinese ? ["偵察完成", "優先次序完成", "7 份草稿已備妥", "待你審批"] : ["Scout complete", "Priority ready", "7 drafts prepared", "Awaiting approval"]).map((step, index) => <li key={step} className={index < 3 ? "is-complete" : "is-current"}><span>{index < 3 ? <Check /> : index + 1}</span><strong>{step}</strong></li>)}
        </ol>
        <small><ShieldCheck /> {isChinese ? "不會自動發佈 · 指定版本獲核准並完成匯出後才計 1 次交付" : "Never auto-published · one delivery counts only after exact-version approval and export"}</small>
      </section>

      {location !== "yik-yam" && <div className="context-banner" role="status"><MapPin /><div><strong>{isChinese ? `已切換至${displayLocationName}` : `Context changed to ${locationName}`}</strong><span>{isChinese ? (location === "tin-hau" ? "沒有緊急行動。評分 69，上升 3 分，覆蓋率 82%。" : "摘要按地點範圍顯示；未能取得資料的地點不會當成零分平均。") : (location === "tin-hau" ? "No urgent actions. Score 69, up 3 with 82% coverage." : "Summary data is location-aware; unavailable locations are never averaged as zero.")}</span></div><Badge variant="outline">{isChinese ? "示範範圍" : "Demo context"}</Badge></div>}

      <section className="owner-brief-grid" aria-label={isChinese ? "今日營運摘要" : "Today’s operating brief"}>
        <article className="brief-priority-card">
          <div className="card-label-row"><span><Sparkles /> {t.priority}</span><Badge className={location === "tin-hau" ? "priority-medium" : "priority-urgent"}>{isChinese ? (location === "tin-hau" ? "中等 · 沒有緊急工作" : "緊急") : (location === "tin-hau" ? "Medium · no urgent work" : "Urgent")}</Badge></div>
          <h2>{primaryCopy.title}</h2>
          <p>{primaryCopy.summary}</p>
          <div className="why-now-box"><FactType type="Observed" /><div><strong>{isChinese ? "為何現在做" : "Why now"}</strong><span>{primaryCopy.evidence}</span><small>{isChinese ? "觀察於 2026 年 8 月 25 日 · 示範證據" : primary.observedAt}</small></div></div>
          <div className="brief-action-meta"><span><Clock3 /> {effortLabel(primary.effort)} {isChinese ? "店主時間" : "owner time"}</span><span><FileClock /> {isChinese ? (location === "tin-hau" ? "需要店主確認資料" : "7 份草稿已備妥") : (location === "tin-hau" ? "Owner facts required" : "7 drafts ready")}</span></div>
          <div className="brief-priority-actions"><Button asChild size="lg"><Link href={actionHref(primary.id)}>{isChinese && location === "tin-hau" ? "審閱所需資料" : location === "tin-hau" ? "Review required inputs" : t.reviewDrafts}<ArrowRight /></Link></Button><ContextualAssistant locale={locale} surface="home" triggerLabel={isChinese ? "問為何先做這項" : "Ask why this comes first"} /></div>
        </article>

        <article className="brief-score-card">
          <div className="card-label-row"><span><TrendingDown /> {t.changed}</span><Badge variant="outline">{isChinese ? "可比較" : "Comparable"}</Badge></div>
          {location === "all" ? <div className="aggregate-empty"><CircleAlert /><h2>{isChinese ? "不製造合併平均分" : "No fabricated aggregate score"}</h2><p>{isChinese ? "兩個地點的證據覆蓋與比較資格不同；請逐個地點查看評分。" : "Coverage and eligibility differ by location; inspect each location separately."}</p></div> : <><ScoreDial score={location === "tin-hau" ? 69 : 62} coverage={location === "tin-hau" ? 82 : 78} delta={location === "tin-hau" ? 3 : -4} /><div className="coverage-source-line"><span><Check /> {isChinese ? "3 個來源已量度" : "3 measured"}</span><span><CircleAlert /> {isChinese ? "1 個暫時未能取得" : "1 unavailable"}</span></div></>}
          <Link href={`/${locale}/owner/kam-man-house/insights?location=${location}`}>{isChinese ? "審閱可比較證據" : "Review comparable evidence"} <ArrowRight /></Link>
        </article>

        <article className="brief-proof-card">
          <div className="card-label-row"><span><CircleCheck /> {t.proof}</span><Badge variant="outline">{isChinese ? (location === "tin-hau" ? "可比較變化" : "行動後觀察") : (location === "tin-hau" ? "Comparable change" : "Observed after action")}</Badge></div>
          <div className="proof-value"><TrendingUp /><strong>{location === "tin-hau" ? "+4" : "+9"}<span> {isChinese ? (location === "tin-hau" ? "個項目" : "個百分點") : (location === "tin-hau" ? "items" : "pts")}</span></strong></div>
          <h2>{isChinese ? (location === "tin-hau" ? "英文餐牌完整度有所改善" : "評論回覆率有所改善") : (location === "tin-hau" ? "English menu completeness improved" : "Review response rate improved")}</h2>
          <p>{isChinese ? (location === "tin-hau" ? "兩次可比較網站快照顯示，24 個項目中的英文標籤由 11 個增至 15 個。" : "兩次可比較 Google 商戶快照顯示，8 月 5 日回覆一批評論後，回覆率由 22% 升至 31%。") : (location === "tin-hau" ? "English labels increased from 11 to 15 of 24 items across two comparable website snapshots." : "From 22% to 31% after the 5 August reply batch, on two comparable Google Business snapshots.")}</p>
          <div className="proof-caveat"><FactType type={location === "tin-hau" ? "Observed" : "Attributed"} /><span>{isChinese ? (location === "tin-hau" ? "餘下 9 個未翻譯標籤屬於證據缺口，不會當成零分。" : "只顯示時間上的可能關聯；不宣稱帶來收入或預訂因果。") : (location === "tin-hau" ? "The remaining nine missing labels are evidence, not a zero score." : "Temporal association only; no revenue or booking causation is claimed.")}</span></div>
          <Link href={`/${locale}/owner/kam-man-house/insights?location=${location}${location === "tin-hau" ? "" : "#review-response"}`}>{isChinese ? "查看行動前後" : "Inspect before and after"} <ArrowRight /></Link>
        </article>
      </section>

      <section className="month-brief" aria-labelledby="month-title">
        <div className="month-brief-heading"><div><p className="eyebrow">{t.month}</p><h2 id="month-title">{isChinese ? "小行動，累積看得見的進展。" : "Small actions, visible momentum."}</h2></div><div className="next-scan"><CalendarClock /><span>{isChinese ? "下次掃描" : "Next scan"}<strong>{isChinese ? "9 月 14 日" : "14 September"}</strong></span></div></div>
        <div className="month-metrics"><article><span className="metric-icon resolved"><CheckCircle2 /></span><div><strong>2</strong><span>{isChinese ? "個問題已解決" : "issues resolved"}</span></div><small>{isChinese ? "來自可比較掃描" : "Across comparable scans"}</small></article><article><span className="metric-icon regressed"><TrendingDown /></span><div><strong>1</strong><span>{isChinese ? "項新退步" : "new regression"}</span></div><small>{isChinese ? "評論回覆率" : "Review response rate"}</small></article><article><span className="metric-icon approval"><FileClock /></span><div><strong>3</strong><span>{isChinese ? "項等待審批" : "awaiting approval"}</span></div><small>{isChinese ? "需要店主或經理決定" : "Owner or manager action"}</small></article><article><span className="metric-icon complete"><CircleCheck /></span><div><strong>4</strong><span>{isChinese ? "項行動已完成" : "actions completed"}</span></div><small>{isChinese ? "其中 2 項已有後續量度" : "2 measured later"}</small></article></div>
      </section>

      <div className="home-secondary-grid">
        <SectionCard className="pending-approval-card">
          <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "決定清單" : "Decision queue"}</p><h2>{isChinese ? "等待審批" : "Pending approvals"}</h2></div><Button asChild variant="ghost"><Link href={`/${locale}/owner/kam-man-house/actions`}>{isChinese ? "查看全部" : "View all"} <ArrowRight /></Link></Button></div>
          <div className="compact-action-list">
            {scopedActions.slice(0, 3).map((action) => <Link key={action.id} href={actionHref(action.id)}><span className={`priority-marker priority-${action.priority.toLowerCase()}`} /><div><strong>{actionCopy(action).title}</strong><small>{isChinese ? (action.location === "All locations" ? "所有地點" : action.location === "Tin Hau" ? "天后" : "奕蔭街") : action.location} · {isChinese ? "等待店主決定" : action.displayPhase}</small></div><span className="compact-effort">{action.effort}</span><ArrowRight /></Link>)}
          </div>
        </SectionCard>

        <SectionCard className="integration-health-card">
          <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "資料來源可靠度" : "Source reliability"}</p><h2>{isChinese ? "連接狀態" : "Integration health"}</h2></div><Button asChild variant="ghost"><Link href={`/${locale}/owner/kam-man-house/settings/integrations`}>{isChinese ? "管理" : "Manage"}</Link></Button></div>
          <div className="integration-compact-list">
            {integrations.map((integration) => <div key={integration.name}><span className={integration.capability === "Live" ? "health-ok" : integration.capability === "Requires connection" ? "health-warn" : "health-neutral"}>{integration.capability === "Live" ? <Check /> : integration.capability === "Requires connection" ? <CircleAlert /> : <Globe2 />}</span><div><strong>{isChinese ? ({ "Google Business Profile": "Google 商戶檔案", "Instagram public evidence": "Instagram 公開證據", "Public website": "公開網站" }[integration.name] ?? integration.name) : integration.name}</strong><small>{isChinese ? (integration.capability === "Live" ? "已連接 · 最近同步紀錄可用" : integration.capability === "Requires connection" ? "需要重新連接" : "公開證據模式") : `${integration.status} · ${integration.lastSync}`}</small></div><CapabilityBadge value={integration.capability} /></div>)}
          </div>
        </SectionCard>
      </div>

      <SectionCard className="change-ledger-card">
        <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "最近變化紀錄" : "Recent change ledger"}</p><h2>{isChinese ? "先看證據，再看圖表" : "Evidence before charts"}</h2></div><Badge variant="outline">{isChinese ? "8 月 25 日可比較掃描" : "25 Aug comparable scan"}</Badge></div>
        <div className="change-ledger">
          <article><FactType type="Observed" /><div><h3>{isChinese ? "評論回覆率下跌" : "Review response rate fell"}</h3><p>{isChinese ? "可比較 Google 商戶快照顯示 31% → 18%。" : "31% → 18% across comparable Google Business snapshots."}</p><small>{isChinese ? "退步 · 奕蔭街" : "Regressed · Yik Yam Street"}</small></div><Button asChild variant="outline" size="sm"><Link href={`/${locale}/owner/kam-man-house/actions/review-response`}>{isChinese ? "立即處理" : "Act now"}</Link></Button></article>
          <article><FactType type="Observed" /><div><h3>{isChinese ? "網站餐牌完整度有所改善" : "Website menu completeness improved"}</h3><p>{isChinese ? "24 個項目中的英文標籤由 11 個增至 15 個。" : "English labels increased from 11 to 15 of 24 items."}</p><small>{isChinese ? "改善 · 天后" : "Improved · Tin Hau"}</small></div><Button asChild variant="outline" size="sm"><Link href={`/${locale}/owner/kam-man-house/insights`}>{isChinese ? "查看證明" : "View proof"}</Link></Button></article>
          <article><FactType type="Unknown" /><div><h3>{isChinese ? "Instagram 比較暫時未能取得" : "Instagram comparison unavailable"}</h3><p>{isChinese ? "目前公開來源快照不完整，因此沒有推論任何變化。" : "The current public provider snapshot was incomplete. No change was inferred."}</p><small>{isChinese ? "覆蓋缺口 · 不計分" : "Coverage gap · Not scored"}</small></div><Button asChild variant="outline" size="sm"><Link href={`/${locale}/owner/kam-man-house/settings/integrations`}>{isChinese ? "檢查來源" : "Check source"}</Link></Button></article>
        </div>
      </SectionCard>

      <div className="operational-footnote"><ShieldCheck /><span>{isChinese ? "工作台示範資料按地點範圍顯示。先交代店主當前決定與證據，再顯示圖表及用量。" : "Workspace sample data is location-scoped. Charts and usage appear after the owner’s current decision and evidence."}</span><CapabilityBadge value="Demo" /></div>
    </div>
  )
}
