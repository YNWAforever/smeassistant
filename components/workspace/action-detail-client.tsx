"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useSyncExternalStore } from "react"
import {
  AlertTriangle, ArrowLeft, BadgeCheck, Check, CheckCircle2, CircleAlert, Clock3, CloudOff, Copy, Download, FileClock, FileImage,
  History, LoaderCircle, MapPin, PencilLine, RefreshCw, Save, Send, ShieldAlert, ShieldCheck, Sparkles, UserRound, WandSparkles, X,
} from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { CapabilityBadge, FactType, SectionCard } from "@/components/product-ui"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import { copyToClipboard, downloadText } from "@/lib/download"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { auditActorLabel, auditEventLabel } from "@/lib/workspace/audit-labels"
import { approveVersion, decideVersion, exportVersion, runAction, saveVersion, updateAction, type ClientResult } from "@/lib/workspace/client"
import { effortLabel, formatDateTime, metricLabel, priorityClass, priorityLabel, signed, stateLabel, withLocation } from "@/lib/workspace/format"
import type { ActionDetail, AuditEventRow, VersionRow } from "@/lib/workspace/queries-pages"

export interface ActionDetailClientProps {
  locale: PrototypeLocale
  workspaceSlug: string
  timezone: string
  role: WorkspaceRole
  inScope: boolean
  location: string
  detail: ActionDetail
  auditRows: AuditEventRow[]
  locations: Array<{ slug: string; name: string }>
  /** Approved image assets, offered when a social post needs an asset or explicit text-only (§3.7). */
  approvedAssets: Array<{ id: string; filename: string }>
}

type Busy = null | "run" | "save" | "approve" | "decide" | "export" | "copy" | "inputs"
type PreviewRole = "owner" | "manager" | "viewer"

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback)
  window.addEventListener("offline", callback)
  return () => {
    window.removeEventListener("online", callback)
    window.removeEventListener("offline", callback)
  }
}

function runProgress(state: string | undefined): number {
  if (state === "queued") return 20
  if (state === "running") return 64
  if (state === "failed" || state === "timed_out" || state === "cancelled") return 0
  return state ? 100 : 0
}

export function ActionDetailClient({ locale, workspaceSlug, timezone, role, inScope, location, detail, auditRows, locations, approvedAssets }: ActionDetailClientProps) {
  const isChinese = locale !== "en"
  const router = useRouter()
  const base = `/${locale}/owner/${workspaceSlug}`
  const { action, versions, runs, measurements } = detail
  const inputs = copy[locale].workspace.inputs
  const social = action.templateKey === "social-post"
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
  const offline = !online

  const [previewRole, setPreviewRole] = useState<PreviewRole>("owner")
  const effectiveRole: PreviewRole = role === "owner" ? previewRole : role
  const [versionId, setVersionId] = useState<string | null>(versions[0]?.id ?? null)
  const [content, setContent] = useState(versions[0]?.body ?? "")
  const [altText, setAltText] = useState(versions[0]?.alt_text ?? "")
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState<Busy>(null)
  const [conflict, setConflict] = useState(false)
  const [allowanceBlocked, setAllowanceBlocked] = useState<{ approvedDeliveries: number | null; allowance: number | null } | null>(null)
  const [factsNeeded, setFactsNeeded] = useState<string[] | null>(null)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [lastRunError, setLastRunError] = useState<string | null>(null)
  const [pendingSelect, setPendingSelect] = useState<string | null>(null)

  // Versions arrive from the server; after router.refresh() re-point the editor
  // at the version we just created, or at the newest one if the selected one
  // vanished. Done during render (React's "adjust state on prop change"), so
  // unsaved local text survives an unrelated refresh.
  const versionsKey = versions.map((v) => v.id).join(",")
  const [seenVersionsKey, setSeenVersionsKey] = useState(versionsKey)
  if (seenVersionsKey !== versionsKey) {
    setSeenVersionsKey(versionsKey)
    const target = pendingSelect && versions.find((v) => v.id === pendingSelect) ? pendingSelect : versions.some((v) => v.id === versionId) ? null : versions[0]?.id ?? null
    if (target) {
      const next = versions.find((v) => v.id === target)!
      setVersionId(next.id)
      setContent(next.body)
      setAltText(next.alt_text ?? "")
      setPendingSelect(null)
    }
  }

  const selectedVersion: VersionRow | null = versions.find((item) => item.id === versionId) ?? null
  const approval = selectedVersion?.approval_state ?? null
  const delivery = selectedVersion?.delivery_state ?? "not_requested"
  const dirty = selectedVersion ? content !== selectedVersion.body || altText !== (selectedVersion.alt_text ?? "") : content.trim().length > 0
  const versionLabel = (no: number) => (isChinese ? `第 ${no} 版` : `Version ${no}`)
  const versionName = selectedVersion ? versionLabel(selectedVersion.version_no) : (isChinese ? "尚未有版本" : "No version yet")
  const approvalText = (state: VersionRow["approval_state"] | null) => (state ? stateLabel(state, locale) : (isChinese ? "尚未有版本" : "No version yet"))
  const canEdit = !offline && inScope && effectiveRole !== "viewer" && busy === null
  const canApprove = !offline && inScope && effectiveRole !== "viewer" && busy === null && selectedVersion !== null
  const isApprovedCurrent = approval === "approved" && !dirty
  const canApproveCurrent = canApprove && !dirty && approval !== "rejected" && approval !== "superseded" && approval !== "approved"
  const latestRun = runs[0]
  const runStateKey = latestRun?.state
  const neededKeys = factsNeeded ?? (action.actionState === "needs_input" ? action.missingInputs : [])
  const showInputForm = neededKeys.length > 0 && effectiveRole !== "viewer" && inScope
  const canGenerate = canEdit && action.capability !== "Requires connection" && runStateKey !== "running" && runStateKey !== "queued"
  const relatedAudit = auditRows.slice(0, 12)

  const provenance = [
    { label: isChinese ? "掃描證據" : "Scan evidence", state: "complete", detail: `${action.evidence.source} · ${formatDateTime(action.evidence.observedAt, locale, timezone)}` },
    { label: isChinese ? "發現" : "Finding", state: "complete", detail: resolveText(action.evidence.detail, locale) },
    { label: isChinese ? "行動" : "Action", state: "complete", detail: isChinese ? "已記錄優先因素" : "Priority factors recorded" },
    { label: isChinese ? "Agent 輸入" : "Agent input", state: neededKeys.length ? "pending" : "complete", detail: neededKeys.length ? (isChinese ? `缺 ${neededKeys.length} 項資料` : `${neededKeys.length} inputs missing`) : (isChinese ? "資料齊備" : "Inputs ready") },
    { label: isChinese ? "執行" : "Run", state: runStateKey === "succeeded" ? "complete" : latestRun ? "active" : "pending", detail: latestRun ? stateLabel(latestRun.state, locale) : (isChinese ? "尚未執行" : "Not run yet") },
    { label: isChinese ? "輸出版本" : "Output version", state: selectedVersion ? "active" : "pending", detail: versionName },
    { label: isChinese ? "審批" : "Approval", state: isApprovedCurrent ? "complete" : "pending", detail: dirty ? (isChinese ? "有未儲存修改" : "Unsaved changes") : approvalText(approval) },
    { label: isChinese ? "匯出" : "Export", state: delivery === "exported" ? "complete" : "pending", detail: delivery === "exported" ? (isChinese ? "已記錄匯出" : "Export recorded") : (isChinese ? "核准指定版本後可用" : "Available after exact-version approval") },
    { label: isChinese ? "量度" : "Measurement", state: action.measurementState === "measured" ? "complete" : "pending", detail: stateLabel(action.measurementState, locale) },
  ] as const

  function selectVersion(nextId: string) {
    const next = versions.find((item) => item.id === nextId)
    if (!next) return
    setVersionId(next.id)
    setContent(next.body)
    setAltText(next.alt_text ?? "")
    setConflict(false)
  }

  function failureToast<T>(result: Extract<ClientResult<T>, { ok: false }>) {
    if (result.error === "offline" || result.error === "network") toast.error(isChinese ? "無法連接伺服器；文字已保留在此裝置。" : "The server could not be reached; your text is kept on this device.")
    else if (result.status === 403) toast.error(isChinese ? "你的角色或地點範圍不允許此操作。" : "Your role or location scope does not allow this action.")
    else if (result.status === 429) toast.error(isChinese ? "請求過於頻繁，請稍後再試。" : "Too many requests; try again shortly.")
    else if (result.error === "agent_unavailable") toast.error(isChinese ? "此行動目前沒有可用的 Agent。" : "No agent is available for this action yet.")
    else toast.error(isChinese ? `操作失敗（${result.error}）。` : `The request failed (${result.error}).`)
  }

  async function generate(extraInputs?: Record<string, unknown>) {
    if (!canGenerate && !extraInputs) return
    setBusy("run")
    setLastRunError(null)
    const result = await runAction(action.id, extraInputs ? { inputs: extraInputs } : {})
    setBusy(null)
    if (!result.ok) return failureToast(result)
    if (result.data.factsNeeded?.length) {
      setFactsNeeded(result.data.factsNeeded)
      toast.message(isChinese ? "生成前需要店主提供資料；沒有猜測任何事實。" : "The agent needs owner facts before drafting; nothing was guessed.")
      router.refresh()
      return
    }
    if (result.data.state === "failed") {
      setLastRunError(result.data.error ?? "failed")
      toast.error(isChinese ? "生成未能完成；現有草稿已保留，不扣除用量。" : "Generation did not complete; the existing draft is preserved and nothing was counted.")
      router.refresh()
      return
    }
    setFactsNeeded(null)
    if (result.data.versionId) setPendingSelect(result.data.versionId)
    toast.success(result.data.versionNo ? (isChinese ? `Agent 輸出已建立為不可變更的第 ${result.data.versionNo} 版；沒有覆蓋原稿。` : `Agent output created immutable version ${result.data.versionNo}; the previous draft was not overwritten.`) : (isChinese ? "執行已完成" : "Run completed"))
    router.refresh()
  }

  async function submitInputs() {
    if (!canEdit) return
    const provided: Record<string, unknown> = {}
    const runInputs: Record<string, unknown> = {}
    for (const key of neededKeys) {
      const value = inputValues[key] ?? ""
      if (key === "asset_or_text_only") {
        if (value === "text_only") { provided[key] = "text_only"; runInputs.text_only = true }
        else if (value) { provided[key] = "asset"; provided.asset_id = value; runInputs.asset_id = value }
      } else if (value.trim()) provided[key] = value.trim()
    }
    const missing = neededKeys.filter((key) => provided[key] === undefined)
    if (missing.length) {
      toast.error(isChinese ? "請先填妥所有所需資料。" : "Fill in every required input first.")
      return
    }
    setBusy("inputs")
    const patched = await updateAction(action.id, { provided_inputs: provided })
    setBusy(null)
    if (!patched.ok) return failureToast(patched)
    toast.message(isChinese ? "已記錄店主資料；正在重新生成。" : "Owner inputs recorded; generating again.")
    await generate({ ...provided, ...runInputs })
  }

  async function saveDraft() {
    if (!canEdit) return
    if (conflict) { toast.error(isChinese ? "版本衝突：請先載入最新版本。" : "Version conflict: load the latest version first."); return }
    if (!dirty) { toast.message(isChinese ? "目前沒有需要儲存的修改。" : "There are no changes to save."); return }
    if (!content.trim()) { toast.error(isChinese ? "版本內容不能為空。" : "A version cannot be empty."); return }
    setBusy("save")
    const result = await saveVersion(action.id, { body: content, alt_text: altText || undefined, base_version_id: selectedVersion?.id })
    setBusy(null)
    if (!result.ok) {
      if (result.status === 409 && result.error === "version_conflict") { setConflict(true); return }
      return failureToast(result)
    }
    setPendingSelect(result.data.versionId)
    toast.success(isChinese ? `已儲存為不可變更的第 ${result.data.versionNo} 版` : `Saved as immutable version ${result.data.versionNo}`)
    router.refresh()
  }

  function loadLatest() {
    setConflict(false)
    toast.message(isChinese ? "已載入最新狀態；本機文字仍保留" : "Latest state loaded; local text preserved")
    router.refresh()
  }

  async function approveDraft() {
    if (!canApproveCurrent || !selectedVersion) { toast.error(isChinese ? "請先儲存修改，再核准指定版本。" : "Save changes before approving this exact version."); return }
    setBusy("approve")
    const result = await approveVersion(selectedVersion.id, comment.trim() || undefined)
    setBusy(null)
    if (!result.ok) {
      if (result.error === "version_closed") toast.error(isChinese ? "此版本已關閉，不能再核准。" : "This version is closed and can no longer be approved.")
      else failureToast(result)
      return
    }
    toast.success(result.data.idempotent ? (isChinese ? `${versionName}早已核准；沒有重複記錄。` : `${versionName} was already approved; nothing was duplicated.`) : (isChinese ? `${versionName}已核准；現在可安全匯出。` : `${versionName} approved; safe export is now available.`))
    setComment("")
    router.refresh()
  }

  async function setDecision(decision: "changes_requested" | "rejected") {
    if (!canApprove || dirty || !selectedVersion) return
    setBusy("decide")
    const result = await decideVersion(selectedVersion.id, decision, comment.trim() || undefined)
    setBusy(null)
    if (!result.ok) return failureToast(result)
    toast.message(decision === "changes_requested" ? (isChinese ? "已要求修改此版本" : "Changes requested for this version") : (isChinese ? "已拒絕此版本" : "Version rejected"))
    setComment("")
    router.refresh()
  }

  async function deliver(mode: "export" | "copy") {
    if (!isApprovedCurrent || !canApprove || !selectedVersion) { toast.error(isChinese ? "只有目前已儲存及已核准的指定版本可以匯出。" : "Only the selected saved and approved version can be exported."); return }
    setBusy(mode)
    const result = await exportVersion(selectedVersion.id, mode)
    setBusy(null)
    if (!result.ok) {
      if (result.error === "allowance_exceeded") { setAllowanceBlocked({ approvedDeliveries: null, allowance: null }); return }
      if (result.error === "not_approved") toast.error(isChinese ? "此版本尚未核准。" : "This version is not approved.")
      else failureToast(result)
      return
    }
    setAllowanceBlocked(null)
    const text = selectedVersion.alt_text ? `${selectedVersion.body}\n\n---\n${isChinese ? "圖片替代文字" : "Alt text"}: ${selectedVersion.alt_text}\n` : selectedVersion.body
    if (mode === "export") {
      downloadText(`${action.templateKey}-v${selectedVersion.version_no}.md`, text, "text/markdown;charset=utf-8")
    } else {
      const copied = await copyToClipboard(selectedVersion.body)
      if (!copied) toast.error(isChinese ? "無法存取剪貼簿；請手動複製。" : "Clipboard unavailable; copy the text manually.")
    }
    toast.success(result.data.counted ? (isChinese ? "已記錄匯出；本月核准後交付用量增加 1 次。" : "Export recorded; one approved delivery was added to monthly usage.") : (mode === "copy" ? (isChinese ? "已複製核准文字；此版本已計算，不再重複扣除。" : "Approved text copied; this version was already counted, nothing more was used.") : (isChinese ? "已再次匯出；此版本已計算，不再重複扣除。" : "Exported again; this version was already counted, nothing more was used.")))
    router.refresh()
  }

  const roleName = (r: PreviewRole) => (isChinese ? (r === "owner" ? "店主" : r === "manager" ? "經理" : "檢視者") : `${r[0].toUpperCase()}${r.slice(1)}`)
  const workflowState = runStateKey ?? null
  const workflowLabel = workflowState ? stateLabel(workflowState, locale) : (isChinese ? "尚未執行" : "Not run yet")
  const locationName = resolveText(action.location.name, locale) || locations.find((l) => l.slug === location)?.name || ""

  return (
    <div className="action-detail-page">
      <div className="action-detail-toolbar">
        <Link href={withLocation(`${base}/actions`, location)} className="back-link"><ArrowLeft /> {isChinese ? "返回行動" : "Back to actions"}</Link>
        <div>
          {role === "owner" ? (
            <Select value={previewRole} onValueChange={(value) => setPreviewRole(value as PreviewRole)}>
              <SelectTrigger className="role-select" aria-label={isChinese ? "預覽角色" : "Preview role"}><UserRound /><SelectValue>{roleName(previewRole)}</SelectValue></SelectTrigger>
              <SelectContent align="end"><SelectItem value="owner">{isChinese ? "店主" : "Owner"}</SelectItem><SelectItem value="manager">{isChinese ? "經理" : "Manager"}</SelectItem><SelectItem value="viewer">{isChinese ? "檢視者" : "Viewer"}</SelectItem></SelectContent>
            </Select>
          ) : <Badge variant="outline"><UserRound /> {roleName(role)}</Badge>}
          <span className="offline-toggle" aria-live="polite">{offline ? <CloudOff /> : <Check />}<span>{offline ? (isChinese ? "離線" : "Offline") : (isChinese ? "在線" : "Online")}</span></span>
        </div>
      </div>

      <header className="action-detail-header">
        <div>
          <div className="action-detail-badges"><Badge variant="outline" className={priorityClass(action.priority)}>{priorityLabel(action.priority, locale)}</Badge><Badge variant="outline">{dirty ? (isChinese ? "未儲存修改" : "Unsaved changes") : selectedVersion ? approvalText(approval) : resolveText(action.displayPhase, locale)}</Badge><CapabilityBadge value={action.capability} /></div>
          <h1>{resolveText(action.title, locale)}</h1><p>{resolveText(action.summary, locale)}</p>
          <div className="header-meta"><span><MapPin />{locationName}</span><span><Clock3 />{effortLabel(action.effortMinutes, locale)}</span><span><UserRound />{action.assignee?.name ?? (isChinese ? "未指派" : "Unassigned")}</span></div>
        </div>
        <div className="action-detail-next"><small>{isChinese ? "下一步" : "Direct next step"}</small><strong>{effectiveRole === "viewer" ? (isChinese ? "查看證據" : "Inspect the evidence") : showInputForm ? (isChinese ? "提供所需資料" : "Provide the required inputs") : dirty ? (isChinese ? "先儲存新版本" : "Save a new version first") : isApprovedCurrent ? (isChinese ? "匯出已核准版本" : "Export approved version") : selectedVersion ? (isChinese ? `審閱並核准${versionName}` : `Review and approve ${versionName}`) : (isChinese ? "生成第一份草稿" : "Generate the first draft")}</strong><span>{isChinese ? "到期：" : "Due "}{action.dueAt ? formatDateTime(action.dueAt, locale, timezone) : "—"}</span></div>
      </header>

      {offline && <div className="offline-banner" role="status"><CloudOff /><div><strong>{isChinese ? "你目前離線" : "You are offline"}</strong><span>{isChinese ? "文字會保留在此裝置，但儲存、審批及匯出會暫停，直至伺服器確認安全轉換。" : "Text remains on this device, but save, approval and export stay blocked until the server confirms a safe transition."}</span></div><Button variant="outline" onClick={() => { if (navigator.onLine) router.refresh(); else toast.message(isChinese ? "仍然離線；請檢查網絡連線。" : "Still offline; check your connection.") }}>{isChinese ? "重新連接" : "Reconnect"}</Button></div>}
      {effectiveRole === "viewer" && <div className="permission-banner"><ShieldAlert /><div><strong>{isChinese ? "檢視者權限" : "Viewer access"}</strong><span>{isChinese ? "可查看證據及紀錄；編輯、生成、審批及匯出會安全拒絕。" : "Evidence and history are visible; editing, generation, approval and export fail closed."}</span></div><Badge variant="outline">{isChinese ? "只讀" : "Read only"}</Badge></div>}
      {role === "manager" && !inScope && <div className="permission-banner"><ShieldAlert /><div><strong>{isChinese ? "超出你的地點權限範圍" : "Outside your location scope"}</strong><span>{isChinese ? "你可查看此行動，但另一地點或所有地點的編輯、審批及送出仍會被拒絕。" : "You may inspect this action, but editing, approval and delivery remain blocked for another location or all-location work."}</span></div><Badge variant="outline">{isChinese ? "拒絕操作" : "Fail closed"}</Badge></div>}

      <ol className="provenance-chain" aria-label={isChinese ? "行動來源及生命週期" : "Action provenance and lifecycle"}>
        {provenance.map((item, index) => <li key={item.label} className={`is-${item.state}`}><span className="provenance-node">{item.state === "complete" ? <Check /> : index + 1}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></li>)}
      </ol>

      <Tabs defaultValue="draft" className="action-detail-tabs">
        <TabsList variant="line" className="detail-tab-list"><TabsTrigger value="draft">{isChinese ? "草稿與審批" : "Draft & approval"}</TabsTrigger><TabsTrigger value="evidence">{isChinese ? "來源證據" : "Source evidence"}</TabsTrigger><TabsTrigger value="workflow">{isChinese ? "流程狀態" : "Workflow states"}</TabsTrigger><TabsTrigger value="history">{isChinese ? "版本及審計紀錄" : "Version & audit history"}</TabsTrigger></TabsList>

        <TabsContent value="draft">
          <div className="draft-layout">
            <SectionCard className="draft-editor-card">
              <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "生成輸出" : "Generated output"}</p><h2>{copy[locale].workspace.templates[action.templateKey]?.workflow ?? action.templateKey}</h2></div><div><Badge variant="outline">{versionName}</Badge>{selectedVersion && <Badge variant="outline">{selectedVersion.author_type === "agent" ? (isChinese ? "由 Agent 生成" : "Generated by agent") : (isChinese ? "手動編輯" : "Edited by a member")}</Badge>}</div></div>
              {social && approvedAssets.length > 0 && <div className="asset-reference"><span><FileImage /></span><div><strong>{approvedAssets[0].filename}</strong><small>{isChinese ? `已核准素材 · 共 ${approvedAssets.length} 項可用` : `Approved asset · ${approvedAssets.length} available`}</small></div><Badge variant="outline">{isChinese ? "已核准" : "Approved"}</Badge></div>}
              <div className="original-context"><FactType type={action.evidence.factType} /><div><strong>{isChinese ? "來源發現" : "Source finding"}</strong><p>{resolveText(action.evidence.detail, locale)}</p><small>{formatDateTime(action.evidence.observedAt, locale, timezone)} · {isChinese ? "原始來源保留作證據" : "Source preserved as evidence"}</small></div></div>
              {showInputForm && (
                <form className="field-stack input-form" onSubmit={(event) => { event.preventDefault(); void submitInputs() }} aria-label={isChinese ? "所需資料" : "Required inputs"}>
                  <p className="limitation-note"><AlertTriangle /> {isChinese ? "Agent 不會猜測事實。請提供以下資料，再重新生成。" : "The agent never guesses facts. Provide the inputs below, then generate again."}</p>
                  {neededKeys.map((key) => key === "asset_or_text_only" ? (
                    <div key={key} className="field-stack"><Label htmlFor={`input-${key}`}>{inputs[key] ?? key}</Label>
                      <Select value={inputValues[key] ?? ""} onValueChange={(value) => setInputValues((prev) => ({ ...prev, [key]: value }))}>
                        <SelectTrigger id={`input-${key}`} aria-label={inputs[key] ?? key}><SelectValue placeholder={isChinese ? "選擇已核准素材或純文字" : "Choose an approved asset or text only"} /></SelectTrigger>
                        <SelectContent><SelectItem value="text_only">{isChinese ? "純文字（不使用相片）" : "Text only (no photo)"}</SelectItem>{approvedAssets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.filename}</SelectItem>)}</SelectContent>
                      </Select>
                      {approvedAssets.length === 0 && <small>{isChinese ? "尚未有已核准素材；可先上載並確認使用權，或選擇純文字。" : "No approved assets yet; upload and confirm rights first, or choose text only."} <Link href={`${base}/assets`}>{isChinese ? "前往素材" : "Go to assets"}</Link></small>}
                    </div>
                  ) : (
                    <div key={key} className="field-stack"><Label htmlFor={`input-${key}`}>{inputs[key] ?? key}</Label>{key.startsWith("owner_fact") || key === "menu_items" || key === "reviews_without_response" ? <Textarea id={`input-${key}`} rows={3} value={inputValues[key] ?? ""} onChange={(event) => setInputValues((prev) => ({ ...prev, [key]: event.target.value }))} disabled={!canEdit} /> : <Input id={`input-${key}`} value={inputValues[key] ?? ""} onChange={(event) => setInputValues((prev) => ({ ...prev, [key]: event.target.value }))} disabled={!canEdit} />}</div>
                  ))}
                  <div className="draft-editor-actions"><Button type="submit" disabled={!canEdit}>{busy === "inputs" || busy === "run" ? <LoaderCircle className="animate-spin" /> : <WandSparkles />} {isChinese ? "儲存資料並重新生成" : "Save inputs and generate"}</Button></div>
                </form>
              )}
              <div className="field-stack"><Label htmlFor="draft-content">{social ? (isChinese ? "帖文說明" : "Caption") : (isChinese ? "草稿" : "Draft")}</Label><Textarea id="draft-content" value={content} onChange={(event) => setContent(event.target.value)} rows={social ? 8 : 7} disabled={!canEdit} placeholder={selectedVersion ? undefined : (isChinese ? "尚未生成草稿。按「生成草稿」或直接撰寫，儲存後成為第 1 版。" : "No draft yet. Generate one, or write here and save it as version 1.")} /><div className="field-helper-row"><span>{content.length} {isChinese ? "個字元" : "characters"}</span><span>{selectedVersion ? formatDateTime(selectedVersion.created_at, locale, timezone) : ""}</span></div></div>
              {(social || altText) && <div className="field-stack"><Label htmlFor="alt-text">{isChinese ? "圖片替代文字" : "Image alt text"}</Label><Textarea id="alt-text" value={altText} onChange={(event) => setAltText(event.target.value)} rows={3} disabled={!canEdit} /><small>{isChinese ? "無障礙匯出所需；請確認描述與已核准素材相符。" : "Required for accessible export; confirm it matches the approved asset."}</small></div>}
              <div className="brand-check-panel"><div className="brand-check-head"><ShieldCheck /><div><strong>{isChinese ? "品牌保障提醒" : "Brand guardrail reminder"}</strong><span>{isChinese ? "生成內容只使用店主確認的事實。" : "Generated content uses owner-confirmed facts only."}</span></div><Badge variant="outline">{isChinese ? "1 項提醒" : "1 reminder"}</Badge></div><p><AlertTriangle /> {isChinese ? "除非店主已確認，否則不要加入食材、致敏原、價格或優惠日期。" : "Do not add ingredients, allergens, pricing or offer dates unless the owner confirmed them."}</p></div>
              {lastRunError && <p className="limitation-note" role="alert"><CircleAlert /> {isChinese ? "上次生成失敗：" : "Last generation failed: "}{lastRunError}</p>}
              <div className="draft-editor-actions"><Button variant="outline" onClick={() => void generate()} disabled={!canGenerate || showInputForm}>{busy === "run" ? <LoaderCircle className="animate-spin" /> : <WandSparkles />} {selectedVersion ? (isChinese ? "以 Agent 重新生成為新版本" : "Regenerate with the agent as a new version") : (isChinese ? "生成草稿" : "Generate a draft")}</Button><Button onClick={() => void saveDraft()} disabled={!canEdit || !dirty}>{busy === "save" ? <LoaderCircle className="animate-spin" /> : <Save />} {isChinese ? "儲存手動修改為新版本" : "Save manual edits as a new version"}</Button></div>
              {conflict && <div className="conflict-state" role="alert"><ShieldAlert /><div><strong>{isChinese ? "另一位審閱者已更新輸出" : "Another reviewer changed this output"}</strong><p>{isChinese ? "未儲存文字仍保留在本機。載入最新版本、比較內容，再建立新版本。" : "Unsaved text is preserved locally. Load the latest version, compare, then create a new version."}</p><Button size="sm" onClick={loadLatest}><RefreshCw /> {isChinese ? "安全載入最新狀態" : "Load latest safely"}</Button></div></div>}
            </SectionCard>

            <aside className="approval-panel">
              <SectionCard>
                <p className="eyebrow">{isChinese ? "審批決定" : "Approval decision"}</p><h2>{isApprovedCurrent ? `${versionName}${isChinese ? "已核准" : " approved"}` : (isChinese ? "一項安全的店主決定" : "One safe owner decision")}</h2><p>{isChinese ? "核准只適用於這個不可變更版本。任何修改都必須另存新版本，再次審批。" : "Approval applies only to this immutable version. Any edit must be saved as a new version and approved again."}</p>
                <div className="field-stack"><Label htmlFor="reviewer-comment">{isChinese ? "審閱者備註" : "Reviewer comment"}</Label><Textarea id="reviewer-comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder={isChinese ? "審計紀錄的選填備註" : "Optional note for the audit trail"} rows={3} disabled={!canApprove} /></div>
                {isApprovedCurrent && selectedVersion ? <div className="approved-state"><CheckCircle2 /><div><strong>{isChinese ? "已核准" : "Approved"}</strong><span>{formatDateTime(selectedVersion.approved_at, locale, timezone)} · {versionName}{selectedVersion.reviewer_comment ? ` · ${selectedVersion.reviewer_comment}` : ""}</span></div></div> : <div className="decision-stack">
                  {dirty && <p className="limitation-note"><AlertTriangle /> {isChinese ? "先儲存修改，才可核准指定版本。" : "Save changes before approving an exact version."}</p>}
                  <Dialog><DialogTrigger asChild><Button disabled={!canApproveCurrent}><BadgeCheck /> {isChinese ? `核准${versionName}` : `Approve ${versionName}`}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{isChinese ? "核准這個指定版本？" : "Approve this exact version?"}</DialogTitle><DialogDescription>{isChinese ? `決定會記錄在${versionName}，不會自動發佈或扣除用量。` : `The decision is recorded against ${versionName}; it does not publish or consume usage.`}</DialogDescription></DialogHeader><div className="confirm-summary"><strong>{resolveText(action.title, locale)}</strong><span>{locationName} · {action.evidence.source}</span></div><DialogFooter><DialogClose asChild><Button variant="outline">{isChinese ? "繼續審閱" : "Keep reviewing"}</Button></DialogClose><DialogClose asChild><Button onClick={() => void approveDraft()}>{isChinese ? `核准${versionName}` : `Approve ${versionName}`}</Button></DialogClose></DialogFooter></DialogContent></Dialog>
                  <Button variant="outline" onClick={() => void setDecision("changes_requested")} disabled={!canApprove || dirty || approval === "changes_requested"}><PencilLine /> {isChinese ? "要求修改" : "Request changes"}</Button>
                  <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" className="text-destructive" disabled={!canApprove || dirty || approval === "rejected"}><X /> {isChinese ? "拒絕草稿" : "Reject draft"}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{isChinese ? "拒絕這個版本？" : "Reject this version?"}</AlertDialogTitle><AlertDialogDescription>{isChinese ? "版本會保留在審計紀錄，但不能匯出；其後可另存新版本。" : "The version remains in history but cannot be exported; a new version can be saved later."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{isChinese ? "取消" : "Cancel"}</AlertDialogCancel><AlertDialogAction onClick={() => void setDecision("rejected")}>{isChinese ? "拒絕此版本" : "Reject version"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                </div>}
              </SectionCard>
              <SectionCard className="delivery-card"><div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "送出" : "Delivery"}</p><h2>{social ? (isChinese ? "匯出至 Instagram" : "Export for Instagram") : (isChinese ? "匯出已核准版本" : "Export the approved version")}</h2></div><CapabilityBadge value="Requires connection" /></div><p>{isChinese ? "目前沒有已驗證的直接發佈連接器。只有指定版本獲核准並完成匯出，才計 1 次核准後交付。" : "No verified direct-publishing connector is present. One approved delivery is counted only after exact-version approval and export."}</p>
                {allowanceBlocked && <div className="conflict-state" role="alert"><ShieldAlert /><div><strong>{isChinese ? "本月核准後交付額已用完" : "This month's approved-delivery allowance is used up"}</strong><p>{isChinese ? "版本仍已核准並保留；升級方案或等待下月額度後即可匯出。" : "The version stays approved; upgrade the plan or wait for next month's allowance to export it."}</p><Button asChild size="sm" variant="outline"><Link href={`${base}/settings/billing`}>{isChinese ? "查看帳單與方案" : "View billing and plans"}</Link></Button></div></div>}
                <Button className="w-full" variant={isApprovedCurrent ? "default" : "outline"} disabled={!isApprovedCurrent || !canApprove} onClick={() => void deliver("export")}>{busy === "export" ? <LoaderCircle className="animate-spin" /> : delivery === "exported" ? <Check /> : <Download />} {delivery === "exported" ? (isChinese ? "再次匯出（不重複計算）" : "Export again (not counted twice)") : (isChinese ? "匯出已核准版本" : "Export approved version")}</Button>
                <Button className="w-full" variant="outline" disabled={!isApprovedCurrent || !canApprove} onClick={() => void deliver("copy")}>{busy === "copy" ? <LoaderCircle className="animate-spin" /> : <Copy />} {isChinese ? "複製文字" : "Copy text"}</Button>
                <Button className="w-full" variant="ghost" disabled><Send /> {isChinese ? "直接發佈 · 需要連接" : "Publish directly · Connection required"}</Button>
              </SectionCard>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="evidence">
          <div className="evidence-detail-grid">
            <SectionCard><div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "已觀察事實" : "Observed fact"}</p><h2>{action.evidence.source}</h2></div><FactType type={action.evidence.factType} /></div><div className="evidence-big-value">{action.evidence.value || "—"}<span>{resolveText(action.evidence.detail, locale)}</span></div><dl className="evidence-detail-dl"><div><dt>{isChinese ? "觀察時間" : "Observed"}</dt><dd>{formatDateTime(action.evidence.observedAt, locale, timezone)}</dd></div><div><dt>{isChinese ? "地點" : "Location"}</dt><dd>{locationName}</dd></div><div><dt>{isChinese ? "新鮮度" : "Freshness"}</dt><dd>{resolveText(action.evidence.freshness, locale) || "—"}</dd></div><div><dt>{isChinese ? "量度" : "Measurement"}</dt><dd>{stateLabel(action.measurementState, locale)}</dd></div></dl></SectionCard>
            <SectionCard><p className="eyebrow">{isChinese ? "解讀與限制" : "Interpretation and limitation"}</p><h2>{isChinese ? "為何建立此行動" : "Why this action exists"}</h2><div className="fact-stack"><div><FactType type={action.evidence.factType} /><p>{resolveText(action.evidence.detail, locale)}</p></div><div><FactType type="Inference" /><p>{action.priorityFactors.map((factor) => `${resolveText(factor.label, locale)} ${signed(factor.points)}`).join(" · ") || priorityLabel(action.priority, locale)}</p></div><div><FactType type="Recommended" /><p>{resolveText(action.title, locale)}</p></div><div><FactType type="Unknown" /><p>{isChinese ? "此行動沒有量度收入、預訂量或顧客意圖。" : "Revenue, reservations and customer intent are not measured by this action."}</p></div></div></SectionCard>
            {measurements.length > 0 && <SectionCard><p className="eyebrow">{isChinese ? "量度" : "Measurement"}</p><h2>{isChinese ? "行動前後" : "Before and after"}</h2><dl className="trust-dl">{measurements.map((m) => <div key={m.id}><dt>{metricLabel(m.metric_key, locale)} · <FactType type={m.fact_type} /></dt><dd>{m.before_value ?? "—"} → {m.after_value ?? "—"} ({signed(Number(m.delta), 1)})</dd></div>)}</dl></SectionCard>}
          </div>
        </TabsContent>

        <TabsContent value="workflow">
          <div className="workflow-state-layout">
            <SectionCard><div className="section-card-heading"><div><p className="eyebrow">Agent run</p><h2>{isChinese ? "可復原執行狀態" : "Recoverable run state"}</h2></div><Badge variant="outline">{isChinese ? "獨立狀態機" : "Separate state machine"}</Badge></div>
              <div className={`run-state-box run-${workflowState === "succeeded" ? "ready" : workflowState === "running" || workflowState === "queued" ? workflowState : workflowState ? "failed" : "ready"}`}>{!workflowState || workflowState === "succeeded" ? <Sparkles /> : workflowState === "running" ? <LoaderCircle className="animate-spin" /> : workflowState === "queued" ? <FileClock /> : <CircleAlert />}<div><strong>{workflowLabel}</strong><span>{workflowState === "failed" || workflowState === "timed_out" ? (isChinese ? "現有草稿已保留；失敗不扣除用量。" : "Existing draft preserved; failures do not consume usage.") : (isChinese ? "生成及修改不扣除客戶用量。" : "Generation and revision do not consume customer usage.")}{latestRun?.error ? ` · ${latestRun.error}` : ""}</span></div></div>
              <Progress value={runProgress(workflowState ?? undefined)} aria-label={isChinese ? `執行狀態：${workflowLabel}` : `Run state ${workflowLabel}`} />
              {runs.length === 0 ? <p className="limitation-note">{isChinese ? "尚未執行。" : "No runs yet."}</p> : <div className="version-list">{runs.map((run) => <div key={run.id}><span><FileClock /></span><div><strong>{run.agent_key} · {stateLabel(run.state, locale)}</strong><small>{formatDateTime(run.created_at, locale, timezone)}{run.finished_at ? ` → ${formatDateTime(run.finished_at, locale, timezone)}` : ""}{run.error ? ` · ${run.error}` : ""}</small></div></div>)}</div>}
            </SectionCard>
            <SectionCard><p className="eyebrow">{isChinese ? "獨立生命週期摘要" : "Independent lifecycle summary"}</p><h2>{isChinese ? "不以一個含糊狀態代表所有事情" : "No single overloaded status"}</h2><dl className="state-machine-dl"><div><dt>{isChinese ? "行動" : "Action"}</dt><dd><Badge variant="outline">{stateLabel(action.actionState, locale)}</Badge></dd></div><div><dt>Agent run</dt><dd><Badge variant="outline">{workflowLabel}</Badge></dd></div><div><dt>{isChinese ? "審批" : "Approval"}</dt><dd><Badge variant="outline">{approvalText(approval)}</Badge></dd></div><div><dt>{isChinese ? "送出" : "Delivery"}</dt><dd><Badge variant="outline">{stateLabel(delivery, locale)}</Badge></dd></div><div><dt>{isChinese ? "量度" : "Measurement"}</dt><dd><Badge variant="outline">{stateLabel(action.measurementState, locale)}</Badge></dd></div></dl></SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="history-layout">
            <SectionCard><p className="eyebrow">{isChinese ? "不可變更的輸出版本" : "Immutable output versions"}</p><h2>{isChinese ? "版本紀錄" : "Version history"}</h2>
              {versions.length === 0 ? <p>{isChinese ? "尚未有版本。" : "No versions yet."}</p> : <div className="version-list">{versions.map((item) => <button key={item.id} type="button" onClick={() => selectVersion(item.id)} aria-pressed={versionId === item.id} className={versionId === item.id ? "is-active" : ""}><span><History /></span><div><strong>{versionLabel(item.version_no)} · {stateLabel(item.approval_state, locale)}</strong><small>{item.author_type === "agent" ? "Agent" : (isChinese ? "成員" : "Member")} · {formatDateTime(item.created_at, locale, timezone)}{item.reviewer_comment ? ` · ${item.reviewer_comment}` : ""}</small></div>{versionId === item.id && <Check />}</button>)}</div>}
            </SectionCard>
            <SectionCard><div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "衝突及冪等性" : "Conflict and idempotency"}</p><h2>{isChinese ? "安全狀態" : "Safety states"}</h2></div></div>
              {conflict ? <div className="conflict-state" role="alert"><ShieldAlert /><div><strong>{isChinese ? "另一位審閱者已更新輸出" : "Another reviewer changed this output"}</strong><p>{isChinese ? "未儲存文字仍保留在本機。載入最新版本、比較內容，再建立新版本。" : "Unsaved text is preserved locally. Load the latest version, compare, then create a new version."}</p><Button size="sm" onClick={loadLatest}><RefreshCw /> {isChinese ? "安全載入最新狀態" : "Load latest safely"}</Button></div></div> : <div className="idempotent-state"><CheckCircle2 /><div><strong>{isChinese ? "目前沒有衝突" : "No active conflict"}</strong><p>{isChinese ? "重複審批或匯出會返回原本結果，不會重複工作或用量。" : "Repeated approval or export returns the original transition without duplicate work or usage."}</p></div></div>}
              <div className="audit-mini">{relatedAudit.length === 0 ? <div><span>—</span><p>{isChinese ? "尚未有審計事件。" : "No audit events yet."}</p></div> : relatedAudit.map((row) => <div key={row.id}><span>{formatDateTime(row.created_at, locale, timezone)}</span><p><strong>{auditEventLabel(row.event, isChinese)}</strong> · {auditActorLabel(row.actor_type, isChinese)}{typeof row.payload?.version_no === "number" ? ` · ${versionLabel(row.payload.version_no)}` : ""}</p></div>)}</div>
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>

      <div className="sticky-approval-bar"><div><span className="sticky-status"><FileClock /></span><span><strong>{versionName} · {dirty ? (isChinese ? "未儲存" : "Unsaved") : approvalText(approval)}</strong><small>{effectiveRole === "viewer" ? (isChinese ? "檢視者只讀" : "Viewer access is read only") : (isChinese ? "核准不會自動發佈；匯出後才計用量" : "Approval does not publish; usage counts after export")}</small></span></div><div><Button variant="outline" onClick={() => void saveDraft()} disabled={!canEdit || !dirty}><Save /> {isChinese ? "儲存" : "Save"}</Button><Button onClick={() => void (isApprovedCurrent ? deliver("export") : approveDraft())} disabled={isApprovedCurrent ? !canApprove : !canApproveCurrent}>{isApprovedCurrent ? <><Download /> {isChinese ? "匯出" : "Export"}</> : <><BadgeCheck /> {isChinese ? "核准" : "Approve"}</>}</Button></div></div>
    </div>
  )
}
