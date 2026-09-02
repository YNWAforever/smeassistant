"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CloudOff,
  Copy,
  Download,
  FileClock,
  FileImage,
  Filter,
  History,
  LoaderCircle,
  MapPin,
  PencilLine,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { PrototypeLocale } from "@/lib/copy"
import { actions, draftVersions, type DemoAction } from "@/lib/demo-data"
import { CapabilityBadge, FactType, PageIntro, ProviderBadge, SectionCard } from "@/components/product-ui"
import { ContextualAssistant } from "@/components/pocket-assistant/assistant-sheet"
import type { DemoAssistantRunResponse } from "@/lib/pocket-assistant/contracts"

const actionZh: Record<string, Partial<DemoAction>> = {
  "review-response": { title: "回覆 7 則未回覆的 Google 評論", summary: "7 則近期顧客評論仍等待店主回覆。", source: "Google 商戶檔案及地圖", evidence: "回覆率由 31% 降至 18%；本地比較值為 61%。", freshness: "昨日觀察", location: "奕蔭街", reason: "最新退步 · 高意向接觸點 · 草稿已備妥", effort: "10 分鐘", due: "今日", workflow: "評論回覆流程", displayPhase: "草稿已備妥" },
  "social-post": { title: "處理 Instagram 16 日內容空檔", summary: "使用已核准菜式相片，準備本週午市套餐帖文。", source: "Instagram 公開證據", evidence: "最近確認的公開帖文距今 16 日；目前來源覆蓋不完整。", freshness: "證據為 4 日前", location: "奕蔭街", reason: "持續內容空檔 · 已有核准相片", effort: "8 分鐘", due: "8 月 28 日", workflow: "社交帖文流程", displayPhase: "已要求修改" },
  "visibility-content": { title: "新增清晰的私人宴會常見問題", summary: "解答三項搜尋及 AI 介面檢查中缺少的問題。", source: "Google 搜尋及 AI 介面", evidence: "未找到有資料支持的容納人數、預訂提前期或素食選項答案。", freshness: "昨日觀察", location: "所有地點", reason: "重複查詢缺口 · 需要店主提供資料", effort: "15 分鐘", due: "8 月 30 日", workflow: "能見度內容流程", displayPhase: "需要資料" },
  "menu-translation": { title: "審閱英文餐牌翻譯", summary: "匯出雙語餐牌前，先確認食材及致敏原用語。", source: "公開網站", evidence: "24 個餐牌項目中有 9 個缺少英文標籤。", freshness: "昨日觀察", location: "天后", reason: "內容完整度缺口 · 需要店主確認資料", effort: "20 分鐘", due: "9 月 2 日", workflow: "餐牌翻譯流程", displayPhase: "需要資料" },
  "google-reconnect": { title: "恢復 Google 商戶存取", summary: "重新連接帳戶，才可啟用直接送出評論回覆。", source: "整合狀態", evidence: "目前連接權限已於 2026 年 8 月 24 日到期；讀取覆蓋可能不完整。", freshness: "2 日前更新", location: "所有地點", reason: "權限已到期 · 目前只可匯出", effort: "5 分鐘", due: "本週", workflow: "連接復原", displayPhase: "需要連接" },
}

function localAction(action: DemoAction, locale: PrototypeLocale) {
  if (locale === "en") return action
  const translated = actionZh[action.id] ?? {}
  return {
    ...action,
    ...translated,
    assignee: action.assignee === "Content approver" ? "內容審批人" : action.assignee === "Manager" ? "經理" : action.assignee === "Workspace owner" ? "工作台擁有人" : action.assignee,
  }
}

function PriorityBadge({ priority, locale }: { priority: DemoAction["priority"]; locale: PrototypeLocale }) {
  const label = locale === "en" ? priority : ({ Urgent: "緊急", High: "高", Medium: "中", Low: "低" } as const)[priority]
  return <Badge variant="outline" className={`priority-${priority.toLowerCase()}`}>{label}</Badge>
}

function ActionCard({ action, locale, role }: { action: DemoAction; locale: PrototypeLocale; role: string }) {
  const isChinese = locale !== "en"
  const display = localAction(action, locale)
  const detailAction = ["review-response", "social-post"].includes(action.id)
  const href = action.id === "google-reconnect"
    ? `/${locale}/owner/kam-man-house/settings/integrations`
    : detailAction
      ? `/${locale}/owner/kam-man-house/actions/${action.id}?role=${role}`
      : `/${locale}/owner/kam-man-house/create`
  const scopedHref = `${href}${href.includes("?") ? "&" : "?"}location=${action.location === "Tin Hau" ? "tin-hau" : action.location === "All locations" ? "all" : "yik-yam"}`
  const cta = action.displayPhase === "Draft ready" || action.displayPhase === "Changes requested"
    ? (isChinese ? "審閱草稿" : "Review draft")
    : action.displayPhase === "Requires connection"
      ? (isChinese ? "審閱依賴項目" : "Review dependency")
      : (isChinese ? "審閱所需資料" : "Review inputs")
  return (
    <article className="action-card">
      <div className="action-card-top">
        <div className="action-card-badges"><PriorityBadge priority={action.priority} locale={locale} /><Badge variant="outline">{display.displayPhase}</Badge><CapabilityBadge value={action.capability} /></div>
        <span className="action-scope"><MapPin />{display.location}</span>
      </div>
      <div className="action-card-content"><div><p className="eyebrow">{display.source}</p><h2>{display.title}</h2><p>{display.summary}</p></div><div className="action-evidence"><FactType type="Observed" /><p>{display.evidence}</p><small>{display.freshness} · {isChinese ? "2026 年 8 月 25 日 · 示範" : action.observedAt}</small></div></div>
      <div className="priority-reason"><Sparkles /><div><strong>{isChinese ? "為何列為優先" : "Why this priority"}</strong><span>{display.reason}</span></div></div>
      <dl className="action-card-meta"><div><dt>{isChinese ? "店主所需時間" : "Owner effort"}</dt><dd>{display.effort}</dd></div><div><dt>{isChinese ? "負責人" : "Assignee"}</dt><dd>{display.assignee}</dd></div><div><dt>{isChinese ? "到期日" : "Due"}</dt><dd>{display.due}</dd></div><div><dt>{isChinese ? "流程" : "Workflow"}</dt><dd>{display.workflow}</dd></div></dl>
      <div className="action-card-footer"><span>{isChinese ? `最近更新：${display.freshness}` : `Last changed ${action.freshness.toLowerCase()}`}</span><Button asChild><Link href={scopedHref}>{cta}<ArrowRight /></Link></Button></div>
    </article>
  )
}

export function ActionsPage({ locale, initialLocation }: { locale: PrototypeLocale; initialLocation?: string }) {
  const isChinese = locale !== "en"
  const [view, setView] = useState("all")
  const [location, setLocation] = useState(["yik-yam", "tin-hau", "all"].includes(initialLocation ?? "") ? initialLocation! : "all")
  const [channel, setChannel] = useState("all")
  const [status, setStatus] = useState("all")
  const [role, setRole] = useState("owner")
  const filtered = useMemo(() => actions.filter((action) => {
    if (view === "urgent" && action.priority !== "Urgent") return false
    if (view === "approvals" && !["Draft ready", "Changes requested"].includes(action.displayPhase)) return false
    if (view === "mine" && action.assignee !== "Willy Lai") return false
    if (location === "yik-yam" && !["Yik Yam Street", "All locations"].includes(action.location)) return false
    if (location === "tin-hau" && !["Tin Hau", "All locations"].includes(action.location)) return false
    if (channel !== "all" && !action.source.toLowerCase().includes(channel)) return false
    if (status !== "all" && !action.displayPhase.toLowerCase().includes(status)) return false
    return true
  }), [view, location, channel, status])
  return (
    <div className="actions-page">
      <PageIntro eyebrow={isChinese ? "實證支持的工作清單" : "Evidence-backed work queue"} title={isChinese ? "行動" : "Actions"} description={isChinese ? "根據已量度的發現或清楚標示的店主目標排定優次，而非互不相干的 Agent 展示。" : "Prioritised from measured findings or a clearly labelled owner objective—never a disconnected agent gallery."} actions={<><ContextualAssistant locale={locale} surface="actions" triggerLabel={isChinese ? "比較優先次序" : "Compare priorities"} /><Select value={role} onValueChange={setRole}><SelectTrigger className="role-select" aria-label={isChinese ? "預覽角色" : "Preview role"}><UserRound /><SelectValue>{isChinese ? (role === "owner" ? "以店主身分預覽" : role === "manager" ? "以經理身分預覽" : "以檢視者身分預覽") : `Preview as ${role[0].toUpperCase()}${role.slice(1)}`}</SelectValue></SelectTrigger><SelectContent align="end"><SelectItem value="owner">{isChinese ? "以店主身分預覽" : "Preview as Owner"}</SelectItem><SelectItem value="manager">{isChinese ? "以經理身分預覽" : "Preview as Manager"}</SelectItem><SelectItem value="viewer">{isChinese ? "以檢視者身分預覽" : "Preview as Viewer"}</SelectItem></SelectContent></Select>{role === "viewer" ? <Button disabled><WandSparkles /> {isChinese ? "根據目標建立" : "Create from objective"}</Button> : <Button asChild><Link href={`/${locale}/owner/kam-man-house/create?location=${location}`}><WandSparkles /> {isChinese ? "根據目標建立" : "Create from objective"}</Link></Button>}</>} />
      {role === "viewer" && <div className="permission-banner"><ShieldAlert /><div><strong>{isChinese ? "檢視者權限預覽" : "Viewer permission preview"}</strong><span>{isChinese ? "你可查看證據及已量度成效，但不能生成、編輯、審批、送出或管理帳單。" : "You can inspect evidence and measured outcomes, but cannot generate, edit, approve, deliver or manage billing."}</span></div><Badge variant="outline">{isChinese ? "只讀" : "Read only"}</Badge></div>}
      <Tabs value={view} onValueChange={setView} className="action-tabs">
        <TabsList variant="line" className="action-tab-list"><TabsTrigger value="all">{isChinese ? "全部" : "All"} <span>5</span></TabsTrigger><TabsTrigger value="urgent">{isChinese ? "緊急" : "Urgent"} <span>1</span></TabsTrigger><TabsTrigger value="approvals">{isChinese ? "待審批" : "Approvals"} <span>2</span></TabsTrigger><TabsTrigger value="mine">{isChinese ? "分派給我" : "Assigned to me"} <span>2</span></TabsTrigger></TabsList>
        <TabsContent value={view} className="action-tab-content">
          <section className="filter-bar" aria-label={isChinese ? "行動篩選" : "Action filters"}><span className="filter-label"><Filter /> {isChinese ? "篩選" : "Filter"}</span><Select value={location} onValueChange={setLocation}><SelectTrigger aria-label={isChinese ? "篩選地點" : "Filter by location"}><MapPin /><SelectValue>{isChinese ? (location === "all" ? "所有地點" : location === "tin-hau" ? "天后" : "奕蔭街") : (location === "all" ? "All locations" : location === "tin-hau" ? "Tin Hau" : "Yik Yam Street")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">{isChinese ? "所有地點" : "All locations"}</SelectItem><SelectItem value="yik-yam">{isChinese ? "奕蔭街" : "Yik Yam Street"}</SelectItem><SelectItem value="tin-hau">{isChinese ? "天后" : "Tin Hau"}</SelectItem></SelectContent></Select><Select value={channel} onValueChange={setChannel}><SelectTrigger aria-label={isChinese ? "篩選渠道" : "Filter by channel"}><SelectValue>{isChinese ? (channel === "all" ? "所有渠道" : channel === "website" ? "網站" : channel) : (channel === "all" ? "All channels" : channel)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">{isChinese ? "所有渠道" : "All channels"}</SelectItem><SelectItem value="google">Google</SelectItem><SelectItem value="instagram">Instagram</SelectItem><SelectItem value="website">{isChinese ? "網站" : "Website"}</SelectItem></SelectContent></Select><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label={isChinese ? "篩選狀態" : "Filter by status"}><SelectValue>{isChinese ? (status === "all" ? "所有狀態" : status === "draft" ? "草稿已備妥" : status === "needs" ? "需要資料" : "需要連接") : (status === "all" ? "All statuses" : status)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">{isChinese ? "所有狀態" : "All statuses"}</SelectItem><SelectItem value="draft">{isChinese ? "草稿已備妥" : "Draft ready"}</SelectItem><SelectItem value="needs">{isChinese ? "需要資料" : "Needs input"}</SelectItem><SelectItem value="requires">{isChinese ? "需要連接" : "Requires connection"}</SelectItem></SelectContent></Select><Button variant="ghost" onClick={() => { setLocation("all"); setChannel("all"); setStatus("all") }}><RotateCcw /> {isChinese ? "重設" : "Reset"}</Button></section>
          <div className="queue-summary"><span><strong>{filtered.length}</strong> {isChinese ? "項行動" : "actions shown"}</span><span>{isChinese ? "按證據新鮮度、優先因素及準備狀態排序" : "Sorted by evidence freshness, priority factors and readiness"}</span></div>
          {filtered.length ? <div className="action-list">{filtered.map((action) => <ActionCard key={action.id} action={action} locale={locale} role={role} />)}</div> : <div className="empty-state"><span><CheckCircle2 /></span><h2>{isChinese ? (view === "urgent" ? "沒有緊急行動" : "沒有符合篩選條件的行動") : (view === "urgent" ? "No urgent actions" : "No actions match these filters")}</h2><p>{isChinese ? (view === "urgent" ? "此地點目前沒有需要立即處理的工作；其他持續及已規劃行動仍可在「全部」查看。" : "請重設一項或多項篩選；沒有資料被刪除。") : (view === "urgent" ? "Nothing requires immediate attention for this location. Persistent and planned work remains available in All." : "Reset one or more filters. No data has been deleted.")}</p><Button variant="outline" onClick={() => { setView("all"); setLocation("all"); setChannel("all"); setStatus("all") }}>{isChinese ? "顯示所有行動" : "Show all actions"}</Button></div>}
        </TabsContent>
      </Tabs>
      <div className="queue-footnote"><ShieldCheck /><p><strong>{isChinese ? "獨立生命週期狀態：" : "Separate lifecycle states:"}</strong>{isChinese ? " 行動、Agent 執行、審批、送出及量度會分開追蹤，避免一個含糊狀態代表所有事情。" : " action, agent run, approval, delivery and measurement are tracked independently. The customer-facing phase above is derived for scanning, not stored as one overloaded status."}</p></div>
    </div>
  )
}

type EditorVersion = {
  id: string
  content: string
  alt: string
  author: string
  time: string
  approval: DemoAction["approvalState"]
  delivery: DemoAction["deliveryState"]
  approver?: string
}

function initialEditorVersions(action: DemoAction): EditorVersion[] {
  if (action.id === "social-post") {
    return [
      {
        id: "v2",
        content: "今個星期，一於用一份暖心午餐為自己充電。錦汶館午市套餐每日新鮮準備，歡迎與同事一齊來。\n\n#跑馬地美食 #香港茶餐廳 #午市",
        alt: "錦汶館午市套餐，白飯配家常小菜，放在木桌上。",
        author: "May Chan",
        time: "2026 年 8 月 26 日 · 10:18",
        approval: "changes_requested",
        delivery: "not_requested",
      },
      {
        id: "v1",
        content: "今個星期，一齊來錦汶館試試午市套餐。",
        alt: "錦汶館午市套餐放在木桌上。",
        author: "Visibility Workspace",
        time: "2026 年 8 月 26 日 · 10:04",
        approval: "superseded",
        delivery: "not_requested",
      },
    ]
  }
  return draftVersions.map((item, index) => ({
    id: item.id,
    content: item.content,
    alt: item.alt,
    author: item.author,
    time: item.time,
    approval: index === 0 ? action.approvalState : "superseded",
    delivery: "not_requested",
  }))
}

function approvalLabel(state: DemoAction["approvalState"], isChinese: boolean) {
  const labels = isChinese
    ? { draft: "待審批", changes_requested: "已要求修改", approved: "已核准", rejected: "已拒絕", superseded: "已被取代" }
    : { draft: "Awaiting approval", changes_requested: "Changes requested", approved: "Approved", rejected: "Rejected", superseded: "Superseded" }
  return labels[state]
}

export function ActionDetailPage({ locale, actionId, initialRole, initialLocation }: { locale: PrototypeLocale; actionId: string; initialRole?: string; initialLocation?: string }) {
  const isChinese = locale !== "en"
  const action = actions.find((item) => item.id === actionId) ?? actions[0]
  const display = localAction(action, locale)
  const social = action.id === "social-post"
  const [role, setRole] = useState(["owner", "manager", "viewer"].includes(initialRole ?? "") ? initialRole! : "owner")
  const [versions, setVersions] = useState<EditorVersion[]>(() => initialEditorVersions(action))
  const [versionId, setVersionId] = useState("v2")
  const firstVersion = versions[0]
  const [content, setContent] = useState(firstVersion.content)
  const [altText, setAltText] = useState(firstVersion.alt)
  const [dirty, setDirty] = useState(false)
  const [comment, setComment] = useState("")
  const [runPreview, setRunPreview] = useState<"ready" | "queued" | "running" | "failed">("ready")
  const [conflict, setConflict] = useState(false)
  const [offline, setOffline] = useState(false)
  const selectedVersion = versions.find((item) => item.id === versionId) ?? versions[0]
  const approval = selectedVersion.approval
  const delivery = selectedVersion.delivery
  const versionNumber = selectedVersion.id.replace("v", "")
  const versionName = isChinese ? `第 ${versionNumber} 版` : `Version ${versionNumber}`
  const managerInScope = action.location === "Yik Yam Street"
  const canEdit = !offline && (role === "owner" || (role === "manager" && managerInScope))
  const canApprove = !offline && (role === "owner" || (role === "manager" && managerInScope))
  const isApprovedCurrent = approval === "approved" && !dirty
  const canApproveCurrent = canApprove && !dirty && approval !== "rejected" && approval !== "superseded"
  const locationQuery = ["all", "tin-hau", "yik-yam"].includes(initialLocation ?? "") ? `?location=${initialLocation}` : ""
  const workflowLabels = isChinese
    ? { ready: "草稿已備妥", queued: "已排入佇列", running: "正在安全生成", failed: "可重試失敗" }
    : { ready: "Draft ready", queued: "Queued", running: "Generating safely", failed: "Retryable failure" }

  const actionProvenance = [
    { label: isChinese ? "掃描證據" : "Scan evidence", state: "complete", detail: social ? `Instagram · ${isChinese ? "2026 年 8 月 22 日" : "22 Aug 2026"}` : `Google · ${isChinese ? "2026 年 8 月 25 日" : "25 Aug 2026"}` },
    { label: isChinese ? "發現" : "Finding", state: "complete", detail: social ? (isChinese ? "16 日內容空檔 · 部分覆蓋" : "16-day posting gap · partial") : (isChinese ? "回覆率退步" : "Response-rate regression") },
    { label: isChinese ? "行動" : "Action", state: "complete", detail: isChinese ? "已記錄優先因素" : "Priority factors recorded" },
    { label: isChinese ? "Agent 輸入" : "Agent input", state: "complete", detail: social ? (isChinese ? "品牌資料 + 已核准素材" : "Brand + approved asset") : (isChinese ? "品牌資料 + 7 則評論" : "Brand + 7 reviews") },
    { label: isChinese ? "執行" : "Run", state: "complete", detail: isChinese ? "已成功 · 示範" : "Succeeded · Demo" },
    { label: isChinese ? "輸出版本" : "Output version", state: "active", detail: versionName },
    { label: isChinese ? "審批" : "Approval", state: isApprovedCurrent ? "complete" : "pending", detail: dirty ? (isChinese ? "有未儲存修改" : "Unsaved changes") : approvalLabel(approval, isChinese) },
    { label: isChinese ? "匯出" : "Export", state: delivery === "exported" ? "complete" : "pending", detail: delivery === "exported" ? (isChinese ? "已記錄匯出" : "Export recorded") : (isChinese ? "核准指定版本後可用" : "Available after exact-version approval") },
    { label: isChinese ? "量度" : "Measurement", state: "pending", detail: social ? (isChinese ? "來源未能提供可比較資料" : "Provider not comparable") : (isChinese ? "等待可比較重掃" : "Awaiting comparable scan") },
  ] as const

  function selectVersion(nextId: string) {
    const next = versions.find((item) => item.id === nextId)
    if (!next) return
    setVersionId(nextId)
    setContent(next.content)
    setAltText(next.alt)
    setDirty(false)
  }

  function updateContent(value: string) {
    setContent(value)
    setDirty(value !== selectedVersion.content || altText !== selectedVersion.alt)
  }

  function updateAltText(value: string) {
    setAltText(value)
    setDirty(content !== selectedVersion.content || value !== selectedVersion.alt)
  }

  function saveDraft() {
    if (!canEdit) return
    if (conflict) {
      toast.error(isChinese ? "版本衝突：請先載入最新版本。" : "Version conflict: load the latest version first.")
      return
    }
    if (!dirty) {
      toast.message(isChinese ? "目前沒有需要儲存的修改。" : "There are no changes to save.")
      return
    }
    const nextNumber = Math.max(...versions.map((item) => Number(item.id.replace("v", "")))) + 1
    const next: EditorVersion = {
      id: `v${nextNumber}`,
      content,
      alt: altText,
      author: role === "manager" ? "May Chan" : "Willy Lai",
      time: isChinese ? "剛剛 · 示範" : "Just now · Demo",
      approval: "draft",
      delivery: "not_requested",
    }
    setVersions((items) => [next, ...items])
    setVersionId(next.id)
    setDirty(false)
    toast.success(isChinese ? `已儲存為不可變更的第 ${nextNumber} 版` : `Saved as immutable version ${nextNumber}`)
  }

  function createAssistantVersion(body: string, run: DemoAssistantRunResponse) {
    if (!canEdit) {
      toast.error(isChinese ? "目前角色或連線狀態不允許建立版本。" : "Your current role or connection state cannot create a version.")
      return
    }
    const nextNumber = Math.max(...versions.map((item) => Number(item.id.replace("v", "")))) + 1
    const next: EditorVersion = {
      id: `v${nextNumber}`,
      content: body,
      alt: social ? altText : "",
      author: `Visibility Operator · ${run.runId.replace("demo_run_", "run_").slice(0, 18)}`,
      time: isChinese ? "剛剛 · 固定示範執行" : "Just now · Fixed demo run",
      approval: "draft",
      delivery: "not_requested",
    }
    setVersions((items) => [next, ...items])
    setVersionId(next.id)
    setContent(next.content)
    setAltText(next.alt)
    setDirty(false)
    setRunPreview("ready")
    toast.success(isChinese ? `Agent 輸出已建立為不可變更的第 ${nextNumber} 版；沒有覆蓋原稿。` : `Agent output created immutable version ${nextNumber}; the previous draft was not overwritten.`)
  }

  function approveDraft() {
    if (!canApproveCurrent) {
      toast.error(isChinese ? "請先儲存修改，再核准指定版本。" : "Save changes before approving this exact version.")
      return
    }
    setVersions((items) => items.map((item) => item.id === versionId ? { ...item, approval: "approved", delivery: "export_ready", approver: role === "manager" ? "May Chan" : "Willy Lai" } : item))
    toast.success(isChinese ? `${versionName}已核准；現在可安全匯出。` : `${versionName} approved; safe export is now available.`)
  }

  function setDecision(nextApproval: DemoAction["approvalState"]) {
    if (!canApprove || dirty) return
    setVersions((items) => items.map((item) => item.id === versionId ? { ...item, approval: nextApproval, delivery: "not_requested" } : item))
    toast.message(nextApproval === "changes_requested" ? (isChinese ? "已要求修改此版本" : "Changes requested for this version") : (isChinese ? "已拒絕此版本" : "Version rejected"))
  }

  function exportDraft() {
    if (!isApprovedCurrent || !canApprove) {
      toast.error(isChinese ? "只有目前已儲存及已核准的指定版本可以匯出。" : "Only the selected saved and approved version can be exported.")
      return
    }
    setVersions((items) => items.map((item) => item.id === versionId ? { ...item, delivery: "exported" } : item))
    toast.success(isChinese ? "已記錄匯出；本月核准後交付用量增加 1 次。" : "Export recorded; one approved delivery was added to monthly usage.")
  }

  return (
    <div className="action-detail-page">
      <div className="action-detail-toolbar">
        <Link href={`/${locale}/owner/kam-man-house/actions${locationQuery}`} className="back-link"><ArrowLeft /> {isChinese ? "返回行動" : "Back to actions"}</Link>
        <div>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="role-select" aria-label={isChinese ? "預覽角色" : "Preview role"}><UserRound /><SelectValue>{isChinese ? (role === "owner" ? "店主" : role === "manager" ? "經理" : "檢視者") : `${role[0].toUpperCase()}${role.slice(1)}`}</SelectValue></SelectTrigger>
            <SelectContent align="end"><SelectItem value="owner">{isChinese ? "店主" : "Owner"}</SelectItem><SelectItem value="manager">{isChinese ? "經理" : "Manager"}</SelectItem><SelectItem value="viewer">{isChinese ? "檢視者" : "Viewer"}</SelectItem></SelectContent>
          </Select>
          <Label className="offline-toggle" htmlFor="offline"><Switch id="offline" checked={offline} onCheckedChange={setOffline} /><span>{offline ? (isChinese ? "離線" : "Offline") : (isChinese ? "在線" : "Online")}</span></Label>
        </div>
      </div>

      <header className="action-detail-header">
        <div>
          <div className="action-detail-badges"><PriorityBadge priority={action.priority} locale={locale} /><Badge variant="outline">{dirty ? (isChinese ? "未儲存修改" : "Unsaved changes") : approvalLabel(approval, isChinese)}</Badge><CapabilityBadge value={action.capability} /></div>
          <h1>{display.title}</h1><p>{display.summary}</p>
          <div className="header-meta"><span><MapPin />{display.location}</span><span><Clock3 />{display.effort}</span><span><UserRound />{display.assignee}</span></div>
        </div>
        <div className="action-detail-next"><small>{isChinese ? "下一步" : "Direct next step"}</small><strong>{role === "viewer" ? (isChinese ? "查看證據" : "Inspect the evidence") : dirty ? (isChinese ? "先儲存新版本" : "Save a new version first") : isApprovedCurrent ? (isChinese ? "匯出已核准版本" : "Export approved version") : (isChinese ? `審閱並核准${versionName}` : `Review and approve ${versionName}`)}</strong><span>{isChinese ? "到期：" : "Due "}{display.due}</span></div>
      </header>

      {offline && <div className="offline-banner" role="status"><CloudOff /><div><strong>{isChinese ? "你目前離線" : "You are offline"}</strong><span>{isChinese ? "文字會保留在此裝置，但儲存、審批及匯出會暫停，直至伺服器確認安全轉換。" : "Text remains on this device, but save, approval and export stay blocked until the server confirms a safe transition."}</span></div><Button variant="outline" onClick={() => setOffline(false)}>{isChinese ? "重新連接" : "Reconnect"}</Button></div>}
      {role === "viewer" && <div className="permission-banner"><ShieldAlert /><div><strong>{isChinese ? "檢視者權限" : "Viewer access"}</strong><span>{isChinese ? "可查看證據及紀錄；編輯、生成、審批及匯出會安全拒絕。" : "Evidence and history are visible; editing, generation, approval and export fail closed."}</span></div><Badge variant="outline">{isChinese ? "只讀" : "Read only"}</Badge></div>}
      {role === "manager" && !managerInScope && <div className="permission-banner"><ShieldAlert /><div><strong>{isChinese ? "超出你的奕蔭街權限範圍" : "Outside your Yik Yam Street scope"}</strong><span>{isChinese ? "你可查看此行動，但另一地點或所有地點的編輯、審批及送出仍會被拒絕。" : "You may inspect this action, but editing, approval and delivery remain blocked for another location or all-location work."}</span></div><Badge variant="outline">{isChinese ? "拒絕操作" : "Fail closed"}</Badge></div>}

      <ol className="provenance-chain" aria-label={isChinese ? "行動來源及生命週期" : "Action provenance and lifecycle"}>
        {actionProvenance.map((item, index) => <li key={item.label} className={`is-${item.state}`}><span className="provenance-node">{item.state === "complete" ? <Check /> : index + 1}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></li>)}
      </ol>

      <Tabs defaultValue="draft" className="action-detail-tabs">
        <TabsList variant="line" className="detail-tab-list"><TabsTrigger value="draft">{isChinese ? "草稿與審批" : "Draft & approval"}</TabsTrigger><TabsTrigger value="evidence">{isChinese ? "來源證據" : "Source evidence"}</TabsTrigger><TabsTrigger value="workflow">{isChinese ? "流程狀態" : "Workflow states"}</TabsTrigger><TabsTrigger value="history">{isChinese ? "版本及審計紀錄" : "Version & audit history"}</TabsTrigger></TabsList>

        <TabsContent value="draft">
          <div className="draft-layout">
            <SectionCard className="draft-editor-card">
              <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "生成輸出" : "Generated output"}</p><h2>{social ? (isChinese ? "Instagram 帖文說明草稿" : "Instagram caption draft") : (isChinese ? "Google 評論回覆" : "Google review reply")}</h2></div><div><Badge variant="outline">{versionName}</Badge><Badge variant="outline">{isChinese ? "繁體中文" : "Traditional Chinese"}</Badge></div></div>
              {social && <div className="asset-reference"><span><FileImage /></span><div><strong>lunch-set-2026-08.jpg</strong><small>{isChinese ? "已核准素材 · 8 月 20 日確認使用權 · 示範中繼資料" : "Approved asset · Rights confirmed 20 Aug · Demo metadata"}</small></div><Badge variant="outline">{isChinese ? "已核准" : "Approved"}</Badge></div>}
              <div className="original-context"><FactType type="Observed" /><div><strong>{social ? (isChinese ? "來源發現" : "Source finding") : (isChinese ? "原始 3 星評論 · Amy L." : "Original 3-star review · Amy L.")}</strong><p>{social ? display.evidence : "味道很好，但星期五午市等了差不多二十分鐘，希望下次可以快一點。"}</p><small>{action.observedAt} · {isChinese ? "原始來源保留作證據" : "Source preserved as evidence"}</small></div></div>
              <div className="field-stack"><Label htmlFor="draft-content">{social ? (isChinese ? "帖文說明" : "Caption") : (isChinese ? "回覆" : "Reply")}</Label><Textarea id="draft-content" value={content} onChange={(event) => updateContent(event.target.value)} rows={social ? 8 : 7} disabled={!canEdit} /><div className="field-helper-row"><span>{content.length} {isChinese ? "個字元" : "characters"}</span><span>{isChinese ? "溫暖 · 真誠 · zh-HK" : "Warm · Sincere · zh-HK"}</span></div></div>
              {social && <div className="field-stack"><Label htmlFor="alt-text">{isChinese ? "圖片替代文字" : "Image alt text"}</Label><Textarea id="alt-text" value={altText} onChange={(event) => updateAltText(event.target.value)} rows={3} disabled={!canEdit} /><small>{isChinese ? "無障礙匯出所需；請確認描述與已核准素材相符。" : "Required for accessible export; confirm it matches the approved asset."}</small></div>}
              <div className="brand-check-panel"><div className="brand-check-head"><ShieldCheck /><div><strong>{isChinese ? "品牌保障檢查通過，另有一項提醒" : "Brand guardrails passed with one reminder"}</strong><span>{isChinese ? "沒有發現禁用字句或無證據支持的最高級描述。" : "No prohibited terms or unsupported superlatives found."}</span></div><Badge variant="outline">{isChinese ? "1 項提醒" : "1 reminder"}</Badge></div><p><AlertTriangle /> {isChinese ? "除非店主已確認，否則不要加入食材、致敏原、價格或優惠日期。" : "Do not add ingredients, allergens, pricing or offer dates unless the owner confirmed them."}</p></div>
              <div className="draft-editor-actions"><ContextualAssistant locale={locale} surface={social ? "create" : "action"} triggerLabel={isChinese ? "用助理修改並建立新版本" : "Revise with operator as a new version"} onCreateVersion={createAssistantVersion} disabled={!canEdit} /><Button onClick={saveDraft} disabled={!canEdit || !dirty}><Save /> {isChinese ? "儲存手動修改為新版本" : "Save manual edits as a new version"}</Button></div>
            </SectionCard>

            <aside className="approval-panel">
              <SectionCard>
                <p className="eyebrow">{isChinese ? "審批決定" : "Approval decision"}</p><h2>{isApprovedCurrent ? `${versionName}${isChinese ? "已核准" : " approved"}` : (isChinese ? "一項安全的店主決定" : "One safe owner decision")}</h2><p>{isChinese ? "核准只適用於這個不可變更版本。任何修改都必須另存新版本，再次審批。" : "Approval applies only to this immutable version. Any edit must be saved as a new version and approved again."}</p>
                <div className="field-stack"><Label htmlFor="reviewer-comment">{isChinese ? "審閱者備註" : "Reviewer comment"}</Label><Textarea id="reviewer-comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder={isChinese ? "審計紀錄的選填備註" : "Optional note for the audit trail"} rows={3} disabled={!canApprove} /></div>
                {isApprovedCurrent ? <div className="approved-state"><CheckCircle2 /><div><strong>{isChinese ? `由 ${selectedVersion.approver ?? "Willy Lai"} 核准` : `Approved by ${selectedVersion.approver ?? "Willy Lai"}`}</strong><span>{isChinese ? "示範時間 · " : "Demo time · "}{versionName}</span></div></div> : <div className="decision-stack">
                  {dirty && <p className="limitation-note"><AlertTriangle /> {isChinese ? "先儲存修改，才可核准指定版本。" : "Save changes before approving an exact version."}</p>}
                  <Dialog><DialogTrigger asChild><Button disabled={!canApproveCurrent}><BadgeCheck /> {isChinese ? `核准${versionName}` : `Approve ${versionName}`}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{isChinese ? "核准這個指定版本？" : "Approve this exact version?"}</DialogTitle><DialogDescription>{isChinese ? `決定會記錄在${versionName}，不會自動發佈或扣除用量。` : `The decision is recorded against ${versionName}; it does not publish or consume usage.`}</DialogDescription></DialogHeader><div className="confirm-summary"><strong>{display.title}</strong><span>{display.location} · {social ? "Instagram" : "Google"}</span></div><DialogFooter><DialogClose asChild><Button variant="outline">{isChinese ? "繼續審閱" : "Keep reviewing"}</Button></DialogClose><DialogClose asChild><Button onClick={approveDraft}>{isChinese ? `核准${versionName}` : `Approve ${versionName}`}</Button></DialogClose></DialogFooter></DialogContent></Dialog>
                  <Button variant="outline" onClick={() => setDecision("changes_requested")} disabled={!canApprove || dirty}><PencilLine /> {isChinese ? "要求修改" : "Request changes"}</Button>
                  <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" className="text-destructive" disabled={!canApprove || dirty}><X /> {isChinese ? "拒絕草稿" : "Reject draft"}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{isChinese ? "拒絕這個版本？" : "Reject this version?"}</AlertDialogTitle><AlertDialogDescription>{isChinese ? "版本會保留在審計紀錄，但不能匯出；其後可另存新版本。" : "The version remains in history but cannot be exported; a new version can be saved later."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{isChinese ? "取消" : "Cancel"}</AlertDialogCancel><AlertDialogAction onClick={() => setDecision("rejected")}>{isChinese ? "拒絕此版本" : "Reject version"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                </div>}
              </SectionCard>
              <SectionCard className="delivery-card"><div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "送出" : "Delivery"}</p><h2>{social ? (isChinese ? "匯出至 Instagram" : "Export for Instagram") : (isChinese ? "匯出評論回覆" : "Export review reply")}</h2></div><CapabilityBadge value="Requires connection" /></div><p>{isChinese ? "目前沒有已驗證的直接發佈連接器。只有指定版本獲核准並完成匯出，才計 1 次核准後交付。" : "No verified direct-publishing connector is present. One approved delivery is counted only after exact-version approval and export."}</p><Button className="w-full" variant={isApprovedCurrent ? "default" : "outline"} disabled={!isApprovedCurrent || !canApprove} onClick={exportDraft}>{delivery === "exported" ? <><Check /> {isChinese ? "已匯出" : "Exported"}</> : <><Download /> {isChinese ? "匯出已核准版本" : "Export approved version"}</>}</Button><Button className="w-full" variant="outline" disabled={!isApprovedCurrent || !canApprove} onClick={() => { navigator.clipboard?.writeText(content); toast.success(isChinese ? "已複製核准文字" : "Approved text copied") }}><Copy /> {isChinese ? "複製文字" : "Copy text"}</Button><Button className="w-full" variant="ghost" disabled><Send /> {isChinese ? "直接發佈 · 需要連接" : "Publish directly · Connection required"}</Button></SectionCard>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="evidence"><div className="evidence-detail-grid"><SectionCard><div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "已觀察事實" : "Observed fact"}</p><h2>{display.source}</h2></div><ProviderBadge state={social ? "unavailable" : "measured"} locale={locale} /></div><div className="evidence-big-value">{social ? "16" : "18%"}<span>{social ? (isChinese ? "距離上次確認帖文的日數" : "days since confirmed post") : (isChinese ? "評論回覆率" : "review response rate")}</span></div><dl className="evidence-detail-dl"><div><dt>{isChinese ? "觀察時間" : "Observed"}</dt><dd>{action.observedAt}</dd></div><div><dt>{isChinese ? "市場" : "Market"}</dt><dd>{isChinese ? "香港" : "Hong Kong"}</dd></div><div><dt>{isChinese ? "地點" : "Location"}</dt><dd>{display.location}</dd></div><div><dt>{isChinese ? "覆蓋率" : "Coverage"}</dt><dd>{social ? (isChinese ? "部分 · 不會當作零分" : "Partial · not scored as zero") : (isChinese ? "已量度" : "Measured")}</dd></div></dl></SectionCard><SectionCard><p className="eyebrow">{isChinese ? "解讀與限制" : "Interpretation and limitation"}</p><h2>{isChinese ? "為何建立此行動" : "Why this action exists"}</h2><div className="fact-stack"><div><FactType type="Observed" /><p>{display.evidence}</p></div><div><FactType type="Inference" /><p>{display.reason}</p></div><div><FactType type="Recommended" /><p>{display.title}</p></div><div><FactType type="Unknown" /><p>{isChinese ? "此行動沒有量度收入、預訂量或顧客意圖。" : "Revenue, reservations and customer intent are not measured by this action."}</p></div></div></SectionCard></div></TabsContent>

        <TabsContent value="workflow"><div className="workflow-state-layout"><SectionCard><div className="section-card-heading"><div><p className="eyebrow">Agent run · Demo</p><h2>{isChinese ? "預覽可復原執行狀態" : "Preview recoverable run states"}</h2></div><Badge variant="outline">{isChinese ? "獨立狀態機" : "Separate state machine"}</Badge></div><div className={`run-state-box run-${runPreview}`}>{runPreview === "ready" ? <Sparkles /> : runPreview === "running" ? <LoaderCircle className="animate-spin" /> : runPreview === "failed" ? <CircleAlert /> : <FileClock />}<div><strong>{workflowLabels[runPreview]}</strong><span>{runPreview === "failed" ? (isChinese ? "現有草稿已保留；失敗不扣除用量。" : "Existing draft preserved; failures do not consume usage.") : (isChinese ? "生成及修改不扣除客戶用量。" : "Generation and revision do not consume customer usage.")}</span></div></div><Progress value={runPreview === "queued" ? 20 : runPreview === "running" ? 64 : runPreview === "failed" ? 0 : 100} aria-label={isChinese ? `示範執行狀態：${workflowLabels[runPreview]}` : `Demo run state ${runPreview}`} /><div className="state-preview-buttons">{(["queued", "running", "failed", "ready"] as const).map((state) => <Button key={state} size="sm" variant="outline" aria-pressed={runPreview === state} onClick={() => setRunPreview(state)}>{workflowLabels[state]}</Button>)}</div></SectionCard><SectionCard><p className="eyebrow">{isChinese ? "獨立生命週期摘要" : "Independent lifecycle summary"}</p><h2>{isChinese ? "不以一個含糊狀態代表所有事情" : "No single overloaded status"}</h2><dl className="state-machine-dl"><div><dt>{isChinese ? "行動" : "Action"}</dt><dd><Badge variant="outline">{isChinese ? "進行中" : "in_progress"}</Badge></dd></div><div><dt>Agent run</dt><dd><Badge variant="outline">{workflowLabels[runPreview]}</Badge></dd></div><div><dt>{isChinese ? "審批" : "Approval"}</dt><dd><Badge variant="outline">{approvalLabel(approval, isChinese)}</Badge></dd></div><div><dt>{isChinese ? "送出" : "Delivery"}</dt><dd><Badge variant="outline">{delivery === "exported" ? (isChinese ? "已匯出" : "exported") : (isChinese ? "未要求" : "not requested")}</Badge></dd></div><div><dt>{isChinese ? "量度" : "Measurement"}</dt><dd><Badge variant="outline">{social ? (isChinese ? "不符合資格" : "not eligible") : (isChinese ? "等待可比較重掃" : "awaiting comparable scan")}</Badge></dd></div></dl></SectionCard></div></TabsContent>

        <TabsContent value="history"><div className="history-layout"><SectionCard><p className="eyebrow">{isChinese ? "不可變更的輸出版本" : "Immutable output versions"}</p><h2>{isChinese ? "版本紀錄" : "Version history"}</h2><div className="version-list">{versions.map((item) => <button key={item.id} type="button" onClick={() => selectVersion(item.id)} aria-pressed={versionId === item.id} className={versionId === item.id ? "is-active" : ""}><span><History /></span><div><strong>{isChinese ? `第 ${item.id.replace("v", "")} 版` : `Version ${item.id.replace("v", "")}`} · {approvalLabel(item.approval, isChinese)}</strong><small>{item.author} · {item.time}</small></div>{versionId === item.id && <Check />}</button>)}</div></SectionCard><SectionCard><div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "衝突及冪等性" : "Conflict and idempotency"}</p><h2>{isChinese ? "安全狀態示範" : "Representative safety states"}</h2></div><Label className="conflict-toggle" htmlFor="conflict"><Switch id="conflict" checked={conflict} onCheckedChange={setConflict} /><span>{isChinese ? "預覽衝突" : "Preview conflict"}</span></Label></div>{conflict ? <div className="conflict-state" role="alert"><ShieldAlert /><div><strong>{isChinese ? "另一位審閱者已更新輸出" : "Another reviewer changed this output"}</strong><p>{isChinese ? "未儲存文字仍保留在本機。載入最新版本、比較內容，再建立新版本。" : "Unsaved text is preserved locally. Load the latest version, compare, then create a new version."}</p><Button size="sm" onClick={() => { setConflict(false); toast.message(isChinese ? "已載入最新狀態；本機文字仍保留" : "Latest state loaded; local text preserved") }}><RefreshCw /> {isChinese ? "安全載入最新狀態" : "Load latest safely"}</Button></div></div> : <div className="idempotent-state"><CheckCircle2 /><div><strong>{isChinese ? "目前沒有衝突" : "No active conflict"}</strong><p>{isChinese ? "重複審批或匯出會返回原本結果，不會重複工作或用量。" : "Repeated approval or export returns the original transition without duplicate work or usage."}</p></div></div>}<div className="audit-mini"><div><span>10:18</span><p><strong>{isChinese ? "第 2 版已儲存" : "Version 2 saved"}</strong> · Willy Lai</p></div><div><span>10:04</span><p><strong>{isChinese ? "第 1 版已生成" : "Version 1 generated"}</strong> · Demo Agent</p></div><div><span>09:49</span><p><strong>{isChinese ? "從可比較掃描排定優先次序" : "Prioritised from comparable scan"}</strong></p></div></div></SectionCard></div></TabsContent>
      </Tabs>

      <div className="sticky-approval-bar"><div><span className="sticky-status"><FileClock /></span><span><strong>{versionName} · {dirty ? (isChinese ? "未儲存" : "Unsaved") : approvalLabel(approval, isChinese)}</strong><small>{role === "viewer" ? (isChinese ? "檢視者只讀" : "Viewer access is read only") : (isChinese ? "核准不會自動發佈；匯出後才計用量" : "Approval does not publish; usage counts after export")}</small></span></div><div><Button variant="outline" onClick={saveDraft} disabled={!canEdit || !dirty}><Save /> {isChinese ? "儲存" : "Save"}</Button><Button onClick={isApprovedCurrent ? exportDraft : approveDraft} disabled={isApprovedCurrent ? !canApprove : !canApproveCurrent}>{isApprovedCurrent ? <><Download /> {isChinese ? "匯出" : "Export"}</> : <><BadgeCheck /> {isChinese ? "核准" : "Approve"}</>}</Button></div></div>
    </div>
  )
}
