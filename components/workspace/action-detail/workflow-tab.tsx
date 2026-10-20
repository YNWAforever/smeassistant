import { CircleAlert, FileClock, LoaderCircle, Sparkles } from "lucide-react"

import { SectionCard } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { runErrorLabel } from "@/lib/assistant/draft-failure"
import type { PrototypeLocale } from "@/lib/copy"
import { formatDateTime, stateLabel } from "@/lib/workspace/format"
import type { ActionDetail, VersionRow } from "@/lib/workspace/queries-pages"
import { zhFor } from "@/lib/zh-tw"
import { runProgress } from "./helpers"

/** The Workflow tab of an action: the latest agent run and the five separate lifecycle states (guardrail 8). */
export function WorkflowTab({ action, runs, workflowState, workflowLabel, approvalLabel, delivery, locale, timezone }: {
  action: ActionDetail["action"]
  runs: ActionDetail["runs"]
  workflowState: ActionDetail["runs"][number]["state"] | null
  workflowLabel: string
  approvalLabel: string
  delivery: VersionRow["delivery_state"]
  locale: PrototypeLocale
  timezone: string
}) {
  const isChinese = locale !== "en"
  const latestRun = runs[0]
  return (
    <div className="workflow-state-layout">
      <SectionCard><div className="section-card-heading"><div><p className="eyebrow">Agent run</p><h2>{isChinese ? "可復原執行狀態" : "Recoverable run state"}</h2></div><Badge variant="outline">{isChinese ? "獨立狀態機" : "Separate state machine"}</Badge></div>
        <div className={`run-state-box run-${workflowState === "succeeded" ? "ready" : workflowState === "running" || workflowState === "queued" ? workflowState : workflowState ? "failed" : "ready"}`}>{!workflowState || workflowState === "succeeded" ? <Sparkles /> : workflowState === "running" ? <LoaderCircle className="animate-spin" /> : workflowState === "queued" ? <FileClock /> : <CircleAlert />}<div><strong>{workflowLabel}</strong><span>{workflowState === "timed_out" ? (isChinese ? "上一次執行沒有完成並已釋放；現有草稿已保留，可再按生成重試。" : "The previous run did not finish and has been released; your existing draft is preserved — press Generate to try again.") : workflowState === "failed" ? (isChinese ? "現有草稿已保留；失敗不扣除用量。" : "Existing draft preserved; failures do not consume usage.") : (isChinese ? "生成及修改不扣除客戶用量。" : "Generation and revision do not consume customer usage.")}{latestRun?.error ? ` · ${runErrorLabel(locale, latestRun.error)}` : ""}</span></div></div>
        <Progress value={runProgress(workflowState ?? undefined)} aria-label={isChinese ? `執行狀態：${workflowLabel}` : `Run state ${workflowLabel}`} />
        {runs.length === 0 ? <p className="limitation-note">{isChinese ? "尚未執行。" : "No runs yet."}</p> : <div className="version-list">{runs.map((run) => <div key={run.id}><span><FileClock /></span><div><strong>{run.agent_key} · {stateLabel(run.state, locale)}</strong><small>{formatDateTime(run.created_at, locale, timezone)}{run.finished_at ? ` → ${formatDateTime(run.finished_at, locale, timezone)}` : ""}{run.error ? ` · ${runErrorLabel(locale, run.error)}` : ""}</small></div></div>)}</div>}
      </SectionCard>
      <SectionCard><p className="eyebrow">{isChinese ? "獨立生命週期摘要" : "Independent lifecycle summary"}</p><h2>{isChinese ? "不以一個含糊狀態代表所有事情" : "No single overloaded status"}</h2><dl className="state-machine-dl"><div><dt>{isChinese ? "行動" : "Action"}</dt><dd><Badge variant="outline">{stateLabel(action.actionState, locale)}</Badge></dd></div><div><dt>Agent run</dt><dd><Badge variant="outline">{workflowLabel}</Badge></dd></div><div><dt>{isChinese ? zhFor(locale, "審批") : "Approval"}</dt><dd><Badge variant="outline">{approvalLabel}</Badge></dd></div><div><dt>{isChinese ? "送出" : "Delivery"}</dt><dd><Badge variant="outline">{stateLabel(delivery, locale)}</Badge></dd></div><div><dt>{isChinese ? zhFor(locale, "量度") : "Measurement"}</dt><dd><Badge variant="outline">{stateLabel(action.measurementState, locale)}</Badge></dd></div></dl></SectionCard>
    </div>
  )
}
