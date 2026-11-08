import { CircleAlert, FileClock, LoaderCircle, Sparkles } from "lucide-react"

import { SectionCard } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { runErrorLabel } from "@/lib/assistant/draft-failure"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import { formatDateTime, stateLabel } from "@/lib/workspace/format"
import type { ActionDetail, VersionRow } from "@/lib/workspace/queries-pages"
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
  const t = copy[locale].actionTabs.workflow
  const latestRun = runs[0]
  return (
    <div className="workflow-state-layout">
      <SectionCard><div className="section-card-heading"><div><p className="eyebrow">Agent run</p><h2>{t.title}</h2></div><Badge variant="outline">{t.badge}</Badge></div>
        <div className={`run-state-box run-${workflowState === "succeeded" ? "ready" : workflowState === "running" || workflowState === "queued" ? workflowState : workflowState ? "failed" : "ready"}`}>{!workflowState || workflowState === "succeeded" ? <Sparkles /> : workflowState === "running" ? <LoaderCircle className="animate-spin" /> : workflowState === "queued" ? <FileClock /> : <CircleAlert />}<div><strong>{workflowLabel}</strong><span>{workflowState === "timed_out" ? t.timedOut : workflowState === "failed" ? t.failed : t.noUsage}{latestRun?.error ? ` · ${runErrorLabel(locale, latestRun.error)}` : ""}</span></div></div>
        <Progress value={runProgress(workflowState ?? undefined)} aria-label={fill(t.progress, { state: workflowLabel })} />
        {runs.length === 0 ? <p className="limitation-note">{t.noRuns}</p> : <div className="version-list">{runs.map((run) => <div key={run.id}><span><FileClock /></span><div><strong>{run.agent_key} · {stateLabel(run.state, locale)}</strong><small>{formatDateTime(run.created_at, locale, timezone)}{run.finished_at ? ` → ${formatDateTime(run.finished_at, locale, timezone)}` : ""}{run.error ? ` · ${runErrorLabel(locale, run.error)}` : ""}</small></div></div>)}</div>}
      </SectionCard>
      <SectionCard><p className="eyebrow">{t.lifecycleEyebrow}</p><h2>{t.lifecycleTitle}</h2><dl className="state-machine-dl"><div><dt>{t.action}</dt><dd><Badge variant="outline">{stateLabel(action.actionState, locale)}</Badge></dd></div><div><dt>Agent run</dt><dd><Badge variant="outline">{workflowLabel}</Badge></dd></div><div><dt>{t.approval}</dt><dd><Badge variant="outline">{approvalLabel}</Badge></dd></div><div><dt>{t.delivery}</dt><dd><Badge variant="outline">{stateLabel(delivery, locale)}</Badge></dd></div><div><dt>{t.measurement}</dt><dd><Badge variant="outline">{stateLabel(action.measurementState, locale)}</Badge></dd></div></dl></SectionCard>
    </div>
  )
}
