import Link from "next/link"
import { ArrowRight, CheckCircle2, Filter, MapPin, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react"

import { ContextualAssistant } from "@/components/pocket-assistant/assistant-sheet"
import { CapabilityBadge, FactType, PageIntro } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LocationSelect } from "@/components/workspace/location-select"
import { ActionFilterSelect } from "@/components/workspace/action-filters"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { effortLabel, formatDateTime, priorityClass, priorityLabel, withLocation } from "@/lib/workspace/format"
import type { ActionOverview } from "@/lib/workspace/overview"
import type { ActionFilters, ActionListResult } from "@/lib/workspace/queries-pages"

export interface ActionsListViewProps {
  locale: PrototypeLocale
  workspaceSlug: string
  timezone: string
  role: WorkspaceRole
  locations: Array<{ slug: string; name: string }>
  filters: ActionFilters
  result: ActionListResult
}

const VIEWS: Array<{ key: NonNullable<ActionFilters["view"]>; en: string; zh: string }> = [
  { key: "all", en: "All", zh: "全部" },
  { key: "needs_input", en: "Needs input", zh: "需要資料" },
  { key: "drafts", en: "Drafts", zh: "草稿" },
  { key: "awaiting_approval", en: "Approvals", zh: "待審批" },
  { key: "completed", en: "Completed", zh: "已完成" },
]

function tabHref(base: string, filters: ActionFilters, view: string): string {
  const query = new URLSearchParams()
  if (filters.location) query.set("location", filters.location)
  if (filters.channel) query.set("channel", filters.channel)
  if (filters.status) query.set("status", filters.status)
  if (view !== "all") query.set("view", view)
  const qs = query.toString()
  return qs ? `${base}/actions?${qs}` : `${base}/actions`
}

function ActionCard({ action, locale, base, timezone, location }: { action: ActionOverview; locale: PrototypeLocale; base: string; timezone: string; location: string }) {
  const isChinese = locale !== "en"
  const href = withLocation(action.templateKey === "google-reconnect" ? `${base}/settings/integrations` : `${base}/actions/${action.id}`, location)
  const phase = action.displayPhaseKey
  const cta = phase === "draft_ready" || phase === "changes_requested" ? (isChinese ? "審閱草稿" : "Review draft") : phase === "requires_connection" ? (isChinese ? "審閱依賴項目" : "Review dependency") : (isChinese ? "審閱所需資料" : "Review inputs")
  const topFactors = [...action.priorityFactors].sort((a, b) => b.points - a.points).slice(0, 3)
  return (
    <article className="action-card">
      <div className="action-card-top">
        <div className="action-card-badges"><Badge variant="outline" className={priorityClass(action.priority)}>{priorityLabel(action.priority, locale)}</Badge><Badge variant="outline">{resolveText(action.displayPhase, locale)}</Badge><CapabilityBadge value={action.capability} /></div>
        <span className="action-scope"><MapPin />{resolveText(action.location.name, locale)}</span>
      </div>
      <div className="action-card-content"><div><p className="eyebrow">{action.evidence.source}</p><h2>{resolveText(action.title, locale)}</h2><p>{resolveText(action.summary, locale)}</p></div><div className="action-evidence"><FactType type={action.evidence.factType} /><p>{resolveText(action.evidence.detail, locale)}</p><small>{resolveText(action.evidence.freshness, locale)} · {formatDateTime(action.evidence.observedAt, locale, timezone)}</small></div></div>
      <div className="priority-reason"><Sparkles /><div><strong>{isChinese ? "為何列為優先" : "Why this priority"}</strong><span>{topFactors.map((f) => `${resolveText(f.label, locale)} ${f.points > 0 ? "+" : ""}${f.points}`).join(" · ")}</span></div></div>
      <dl className="action-card-meta"><div><dt>{isChinese ? "店主所需時間" : "Owner effort"}</dt><dd>{effortLabel(action.effortMinutes, locale)}</dd></div><div><dt>{isChinese ? "負責人" : "Assignee"}</dt><dd>{action.assignee?.name ?? (isChinese ? "未指派" : "Unassigned")}</dd></div><div><dt>{isChinese ? "到期日" : "Due"}</dt><dd>{action.dueAt ? formatDateTime(action.dueAt, locale, timezone) : "—"}</dd></div><div><dt>{isChinese ? "所需資料" : "Inputs"}</dt><dd>{action.missingInputs.length ? (isChinese ? `缺 ${action.missingInputs.length} 項` : `${action.missingInputs.length} missing`) : (isChinese ? "齊備" : "Ready")}</dd></div></dl>
      <div className="action-card-footer"><span>{isChinese ? "最近更新：" : "Last changed "}{formatDateTime(action.updatedAt, locale, timezone)}</span><Button asChild><Link href={href}>{cta}<ArrowRight /></Link></Button></div>
    </article>
  )
}

export function ActionsListView({ locale, workspaceSlug, timezone, role, locations, filters, result }: ActionsListViewProps) {
  const isChinese = locale !== "en"
  const base = `/${locale}/owner/${workspaceSlug}`
  const view = filters.view ?? "all"
  const location = filters.location ?? "all"
  const channels = [
    { value: "google", label: "Google" },
    { value: "instagram", label: "Instagram" },
    { value: "website", label: isChinese ? "網站" : "Website" },
    { value: "search_ai", label: isChinese ? "搜尋及 AI" : "Search & AI" },
  ]
  const statuses = ["recommended", "needs_input", "ready", "in_progress", "completed", "dismissed", "expired"].map((value) => ({ value, label: (copy[locale].workspace.states as Record<string, string>)[value] ?? value }))
  return (
    <div className="actions-page">
      <PageIntro
        eyebrow={isChinese ? "實證支持的工作清單" : "Evidence-backed work queue"}
        title={isChinese ? "行動" : "Actions"}
        description={isChinese ? "根據已量度的發現或清楚標示的店主目標排定優次，而非互不相干的 Agent 展示。" : "Prioritised from measured findings or a clearly labelled owner objective—never a disconnected agent gallery."}
        actions={<><ContextualAssistant locale={locale} surface="actions" triggerLabel={isChinese ? "比較優先次序" : "Compare priorities"} /><LocationSelect locale={locale} value={location} locations={locations} className="location-select" /></>}
      />
      {role === "viewer" && <div className="permission-banner"><ShieldAlert /><div><strong>{isChinese ? "檢視者權限" : "Viewer access"}</strong><span>{isChinese ? "你可查看證據及已量度成效，但不能生成、編輯、審批、送出或管理帳單。" : "You can inspect evidence and measured outcomes, but cannot generate, edit, approve, deliver or manage billing."}</span></div><Badge variant="outline">{isChinese ? "只讀" : "Read only"}</Badge></div>}
      <div className="action-tabs">
        <nav className="action-tab-list" aria-label={isChinese ? "行動分類" : "Action views"}>
          {VIEWS.map((tab) => <Link key={tab.key} href={tabHref(base, filters, tab.key)} aria-current={view === tab.key ? "page" : undefined} className={view === tab.key ? "is-active" : ""}>{isChinese ? tab.zh : tab.en} <span>{result.counts[tab.key]}</span></Link>)}
        </nav>
        <div className="action-tab-content">
          <section className="filter-bar" aria-label={isChinese ? "行動篩選" : "Action filters"}>
            <span className="filter-label"><Filter /> {isChinese ? "篩選" : "Filter"}</span>
            <ActionFilterSelect param="channel" value={filters.channel ?? "all"} options={channels} allLabel={isChinese ? "所有渠道" : "All channels"} ariaLabel={isChinese ? "篩選渠道" : "Filter by channel"} />
            <ActionFilterSelect param="status" value={filters.status ?? "all"} options={statuses} allLabel={isChinese ? "所有狀態" : "All statuses"} ariaLabel={isChinese ? "篩選狀態" : "Filter by status"} />
          </section>
          <div className="queue-summary"><span><strong>{result.actions.length}</strong> {isChinese ? "項行動" : result.actions.length === 1 ? "action shown" : "actions shown"}</span><span>{isChinese ? "按優先分數、所需時間及範本排序" : "Sorted by priority score, effort and template"}</span></div>
          {result.actions.length ? <div className="action-list">{result.actions.map((action) => <ActionCard key={action.id} action={action} locale={locale} base={base} timezone={timezone} location={location} />)}</div> : <div className="empty-state"><span><CheckCircle2 /></span><h2>{isChinese ? "沒有符合篩選條件的行動" : "No actions match these filters"}</h2><p>{isChinese ? "請重設一項或多項篩選；沒有行動不代表沒有證據。" : "Reset one or more filters; an empty list does not mean there is no evidence."}</p></div>}
        </div>
      </div>
      <div className="queue-footnote"><ShieldCheck /><p><strong>{isChinese ? "獨立生命週期狀態：" : "Separate lifecycle states:"}</strong>{isChinese ? " 行動、Agent 執行、審批、送出及量度會分開追蹤，避免一個含糊狀態代表所有事情。" : " action, agent run, approval, delivery and measurement are tracked independently. The customer-facing phase above is derived for scanning, not stored as one overloaded status."}</p></div>
    </div>
  )
}
