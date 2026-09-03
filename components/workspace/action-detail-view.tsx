import Link from "next/link"
import { ArrowLeft, BadgeCheck, Check, Clock3, FileClock, History, MapPin, PencilLine, Save, ShieldAlert, ShieldCheck, UserRound, X } from "lucide-react"

import { CapabilityBadge, FactType, SectionCard } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { effortLabel, formatDateTime, metricLabel, priorityClass, priorityLabel, signed, stateLabel, withLocation } from "@/lib/workspace/format"
import type { ActionDetail } from "@/lib/workspace/queries-pages"

export interface ActionDetailViewProps {
  locale: PrototypeLocale
  workspaceSlug: string
  timezone: string
  role: WorkspaceRole
  inScope: boolean
  location: string
  detail: ActionDetail
}

/**
 * Read-only in Phase 3: the draft, approval, export and run controls render
 * with the prototype's copy but disabled, and no fetch is wired. Phase 4 adds
 * the mutations (CLAUDE.md §3.2.3 actions/versions routes).
 */
export function ActionDetailView({ locale, workspaceSlug, timezone, role, inScope, location, detail }: ActionDetailViewProps) {
  const isChinese = locale !== "en"
  const base = `/${locale}/owner/${workspaceSlug}`
  const { action, versions, runs, measurements } = detail
  const inputs = copy[locale].workspace.inputs
  const latest = versions[0] ?? null
  const versionName = latest ? (isChinese ? `第 ${latest.version_no} 版` : `Version ${latest.version_no}`) : (isChinese ? "尚未有版本" : "No version yet")
  const canAct = role !== "viewer" && inScope
  const provenance = [
    { label: isChinese ? "掃描證據" : "Scan evidence", state: "complete", detail: `${action.evidence.source} · ${formatDateTime(action.evidence.observedAt, locale, timezone)}` },
    { label: isChinese ? "發現" : "Finding", state: "complete", detail: resolveText(action.evidence.detail, locale) },
    { label: isChinese ? "行動" : "Action", state: "complete", detail: isChinese ? "已記錄優先因素" : "Priority factors recorded" },
    { label: isChinese ? "Agent 輸入" : "Agent input", state: action.missingInputs.length ? "pending" : "complete", detail: action.missingInputs.length ? (isChinese ? `缺 ${action.missingInputs.length} 項資料` : `${action.missingInputs.length} inputs missing`) : (isChinese ? "資料齊備" : "Inputs ready") },
    { label: isChinese ? "執行" : "Run", state: runs[0]?.state === "succeeded" ? "complete" : runs.length ? "active" : "pending", detail: runs[0] ? stateLabel(runs[0].state, locale) : (isChinese ? "尚未執行" : "Not run yet") },
    { label: isChinese ? "輸出版本" : "Output version", state: latest ? "active" : "pending", detail: versionName },
    { label: isChinese ? "審批" : "Approval", state: latest?.approval_state === "approved" ? "complete" : "pending", detail: latest ? stateLabel(latest.approval_state, locale) : "—" },
    { label: isChinese ? "匯出" : "Export", state: latest?.delivery_state === "exported" ? "complete" : "pending", detail: latest?.delivery_state === "exported" ? (isChinese ? "已記錄匯出" : "Export recorded") : (isChinese ? "核准指定版本後可用" : "Available after exact-version approval") },
    { label: isChinese ? "量度" : "Measurement", state: action.measurementState === "measured" ? "complete" : "pending", detail: stateLabel(action.measurementState, locale) },
  ] as const

  return (
    <div className="action-detail-page">
      <div className="action-detail-toolbar">
        <Link href={withLocation(`${base}/actions`, location)} className="back-link"><ArrowLeft /> {isChinese ? "返回行動" : "Back to actions"}</Link>
        <div><Badge variant="outline"><UserRound /> {copy[locale].workspace.states[role === "owner" ? "ready" : "ready"] && (role === "owner" ? (isChinese ? "店主" : "Owner") : role === "manager" ? (isChinese ? "經理" : "Manager") : (isChinese ? "檢視者" : "Viewer"))}</Badge></div>
      </div>

      <header className="action-detail-header">
        <div>
          <div className="action-detail-badges"><Badge variant="outline" className={priorityClass(action.priority)}>{priorityLabel(action.priority, locale)}</Badge><Badge variant="outline">{resolveText(action.displayPhase, locale)}</Badge><CapabilityBadge value={action.capability} /></div>
          <h1>{resolveText(action.title, locale)}</h1><p>{resolveText(action.summary, locale)}</p>
          <div className="header-meta"><span><MapPin />{resolveText(action.location.name, locale)}</span><span><Clock3 />{effortLabel(action.effortMinutes, locale)}</span><span><UserRound />{action.assignee?.name ?? (isChinese ? "未指派" : "Unassigned")}</span></div>
        </div>
        <div className="action-detail-next"><small>{isChinese ? "下一步" : "Direct next step"}</small><strong>{role === "viewer" ? (isChinese ? "查看證據" : "Inspect the evidence") : action.missingInputs.length ? (isChinese ? "提供所需資料" : "Provide the required inputs") : latest ? (isChinese ? `審閱並核准${versionName}` : `Review and approve ${versionName}`) : (isChinese ? "生成第一份草稿" : "Generate the first draft")}</strong><span>{isChinese ? "到期：" : "Due "}{action.dueAt ? formatDateTime(action.dueAt, locale, timezone) : "—"}</span></div>
      </header>

      {role === "viewer" && <div className="permission-banner"><ShieldAlert /><div><strong>{isChinese ? "檢視者權限" : "Viewer access"}</strong><span>{isChinese ? "可查看證據及紀錄；編輯、生成、審批及匯出會安全拒絕。" : "Evidence and history are visible; editing, generation, approval and export fail closed."}</span></div><Badge variant="outline">{isChinese ? "只讀" : "Read only"}</Badge></div>}
      {role === "manager" && !inScope && <div className="permission-banner"><ShieldAlert /><div><strong>{isChinese ? "超出你的地點權限範圍" : "Outside your location scope"}</strong><span>{isChinese ? "你可查看此行動，但另一地點或所有地點的編輯、審批及送出仍會被拒絕。" : "You may inspect this action, but editing, approval and delivery remain blocked for another location or all-location work."}</span></div><Badge variant="outline">{isChinese ? "只讀" : "Read only"}</Badge></div>}

      <ol className="provenance-chain" aria-label={isChinese ? "行動來源及生命週期" : "Action provenance and lifecycle"}>
        {provenance.map((item, index) => <li key={item.label} className={`is-${item.state}`}><span className="provenance-node">{item.state === "complete" ? <Check /> : index + 1}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></li>)}
      </ol>

      <Tabs defaultValue="draft" className="action-detail-tabs">
        <TabsList variant="line" className="detail-tab-list"><TabsTrigger value="draft">{isChinese ? "草稿與審批" : "Draft & approval"}</TabsTrigger><TabsTrigger value="evidence">{isChinese ? "來源證據" : "Source evidence"}</TabsTrigger><TabsTrigger value="history">{isChinese ? "版本及審計紀錄" : "Version & audit history"}</TabsTrigger></TabsList>

        <TabsContent value="draft">
          <div className="draft-layout">
            <SectionCard className="draft-editor-card">
              <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "生成輸出" : "Generated output"}</p><h2>{copy[locale].workspace.templates[action.templateKey]?.workflow ?? action.templateKey}</h2></div><div><Badge variant="outline">{versionName}</Badge></div></div>
              <div className="original-context"><FactType type={action.evidence.factType} /><div><strong>{isChinese ? "來源發現" : "Source finding"}</strong><p>{resolveText(action.evidence.detail, locale)}</p><small>{formatDateTime(action.evidence.observedAt, locale, timezone)} · {isChinese ? "原始來源保留作證據" : "Source preserved as evidence"}</small></div></div>
              {action.requiredInputs.length > 0 && <div className="field-stack"><Label>{isChinese ? "所需資料" : "Required inputs"}</Label><ul className="requirement-list">{action.requiredInputs.map((key) => <li key={key}><Badge variant="outline">{action.missingInputs.includes(key) ? (isChinese ? "缺少" : "Missing") : (isChinese ? "已提供" : "Provided")}</Badge><span>{inputs[key] ?? key}</span></li>)}</ul></div>}
              <div className="field-stack"><Label htmlFor="draft-content">{isChinese ? "草稿" : "Draft"}</Label><Textarea id="draft-content" defaultValue={latest?.body ?? ""} rows={7} disabled readOnly placeholder={isChinese ? "尚未生成草稿。第 4 階段接上生成與編輯。" : "No draft yet. Generation and editing arrive in Phase 4."} /><div className="field-helper-row"><span>{(latest?.body ?? "").length} {isChinese ? "個字元" : "characters"}</span><span>{latest ? (latest.author_type === "agent" ? (isChinese ? "由 Agent 生成" : "Generated by agent") : (isChinese ? "手動編輯" : "Edited by a member")) : ""}</span></div></div>
              {latest?.alt_text && <div className="field-stack"><Label>{isChinese ? "圖片替代文字" : "Image alt text"}</Label><Textarea defaultValue={latest.alt_text} rows={3} disabled readOnly /></div>}
              <div className="draft-editor-actions"><Button disabled><PencilLine /> {isChinese ? "生成新草稿" : "Generate a draft"}</Button><Button variant="outline" disabled><Save /> {isChinese ? "儲存手動修改為新版本" : "Save manual edits as a new version"}</Button></div>
              <p className="limitation-note"><ShieldCheck /> {isChinese ? "生成、編輯、審批及匯出在第 4 階段接上；此頁現時只讀。" : "Generation, editing, approval and export are wired in Phase 4; this page is read-only for now."}</p>
            </SectionCard>
            <aside className="approval-panel">
              <SectionCard>
                <p className="eyebrow">{isChinese ? "審批決定" : "Approval decision"}</p><h2>{latest?.approval_state === "approved" ? `${versionName}${isChinese ? "已核准" : " approved"}` : (isChinese ? "一項安全的店主決定" : "One safe owner decision")}</h2><p>{isChinese ? "核准只適用於這個不可變更版本。任何修改都必須另存新版本，再次審批。" : "Approval applies only to this immutable version. Any edit must be saved as a new version and approved again."}</p>
                <div className="decision-stack"><Button disabled={!canAct || true}><BadgeCheck /> {isChinese ? `核准${versionName}` : `Approve ${versionName}`}</Button><Button variant="outline" disabled><PencilLine /> {isChinese ? "要求修改" : "Request changes"}</Button><Button variant="ghost" className="text-destructive" disabled><X /> {isChinese ? "拒絕草稿" : "Reject draft"}</Button></div>
              </SectionCard>
              <SectionCard className="delivery-card"><div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "送出" : "Delivery"}</p><h2>{isChinese ? "匯出已核准版本" : "Export the approved version"}</h2></div><CapabilityBadge value="Requires connection" /></div><p>{isChinese ? "目前沒有已驗證的直接發佈連接器。只有指定版本獲核准並完成匯出，才計 1 次核准後交付。" : "No verified direct-publishing connector exists. One approved delivery counts only after exact-version approval and export."}</p><Button variant="outline" disabled>{isChinese ? "匯出" : "Export"}</Button></SectionCard>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="evidence">
          <div className="evidence-detail-grid">
            <SectionCard><div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "已觀察事實" : "Observed fact"}</p><h2>{action.evidence.source}</h2></div><FactType type={action.evidence.factType} /></div><div className="evidence-big-value">{action.evidence.value || "—"}<span>{resolveText(action.evidence.detail, locale)}</span></div><small>{formatDateTime(action.evidence.observedAt, locale, timezone)} · {resolveText(action.evidence.freshness, locale)}</small></SectionCard>
            <SectionCard><p className="eyebrow">{isChinese ? "為何列為優先" : "Why this priority"}</p><h2>{priorityLabel(action.priority, locale)}</h2><dl className="trust-dl">{action.priorityFactors.map((factor) => <div key={factor.key}><dt>{resolveText(factor.label, locale)}</dt><dd>{factor.points > 0 ? "+" : ""}{factor.points}</dd></div>)}</dl></SectionCard>
            {measurements.length > 0 && <SectionCard><p className="eyebrow">{isChinese ? "量度" : "Measurement"}</p><h2>{isChinese ? "行動前後" : "Before and after"}</h2><dl className="trust-dl">{measurements.map((m) => <div key={m.id}><dt>{metricLabel(m.metric_key, locale)} · <FactType type={m.fact_type} /></dt><dd>{m.before_value ?? "—"} → {m.after_value ?? "—"} ({signed(Number(m.delta), 1)})</dd></div>)}</dl></SectionCard>}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="history-layout">
            <SectionCard><p className="eyebrow">{isChinese ? "不可變更的輸出版本" : "Immutable output versions"}</p><h2>{isChinese ? "版本紀錄" : "Version history"}</h2>
              {versions.length === 0 ? <p>{isChinese ? "尚未有版本。" : "No versions yet."}</p> : <div className="version-list">{versions.map((item) => <div key={item.id} className={item.id === latest?.id ? "is-active" : ""}><span><History /></span><div><strong>{isChinese ? `第 ${item.version_no} 版` : `Version ${item.version_no}`} · {stateLabel(item.approval_state, locale)}</strong><small>{item.author_type === "agent" ? (isChinese ? "Agent" : "Agent") : (isChinese ? "成員" : "Member")} · {formatDateTime(item.created_at, locale, timezone)}{item.reviewer_comment ? ` · ${item.reviewer_comment}` : ""}</small></div></div>)}</div>}
            </SectionCard>
            <SectionCard><p className="eyebrow">{isChinese ? "Agent 執行" : "Agent runs"}</p><h2>{isChinese ? "執行紀錄" : "Run history"}</h2>
              {runs.length === 0 ? <p>{isChinese ? "尚未執行。" : "No runs yet."}</p> : <div className="version-list">{runs.map((run) => <div key={run.id}><span><FileClock /></span><div><strong>{run.agent_key} · {stateLabel(run.state, locale)}</strong><small>{formatDateTime(run.created_at, locale, timezone)}{run.error ? ` · ${run.error}` : ""}</small></div></div>)}</div>}
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
