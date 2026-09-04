"use client"

import { useState, type ReactNode } from "react"
import {
  ArrowRight,
  Check,
  FilePlus2,
  LockKeyhole,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { AssistantArtifactPreview } from "@/components/pocket-assistant/artifact-preview"
import { AssistantEvidenceCard } from "@/components/pocket-assistant/evidence-card"
import { AssistantRunStatus } from "@/components/pocket-assistant/run-status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import type { PrototypeLocale } from "@/lib/copy"
import type {
  AssistantContext,
  AssistantMode,
  AssistantSurface,
  DemoAssistantRunResponse,
  DemoQuestionId,
} from "@/lib/pocket-assistant/contracts"
import { ASSISTANT_RUN_ENDPOINT, buildAssistantRequest } from "@/lib/pocket-assistant/request"

/** `AssistantSurface` now lives in contracts.ts (§3.8); re-exported for existing importers. */
export type { AssistantSurface } from "@/lib/pocket-assistant/contracts"

const surfaceQuestions: Record<AssistantSurface, DemoQuestionId[]> = {
  sample: ["explain_priority", "explain_change", "explain_limits", "fallback_plan", "draft_review_reply"],
  report: ["explain_priority", "explain_limits", "draft_review_reply"],
  home: ["explain_priority", "fallback_plan", "explain_insights"],
  actions: ["compare_priorities", "explain_limits", "draft_review_reply"],
  action: ["friendlier_review_reply", "explain_priority", "rescan_validation"],
  create: ["draft_review_reply", "generate_social", "generate_faq", "generate_menu"],
  insights: ["explain_insights", "explain_limits", "rescan_validation"],
  assets: ["asset_next_step", "generate_social", "generate_menu"],
  rescan: ["rescan_validation", "explain_limits"],
  workspace: ["explain_priority", "compare_priorities", "explain_insights"],
}

const labels: Record<DemoQuestionId, { zh: string; en: string }> = {
  explain_priority: { zh: "為何評論回覆是首要行動？", en: "Why are review replies the priority?" },
  explain_change: { zh: "22% 升至 31% 代表甚麼？", en: "What does 22% to 31% mean?" },
  explain_limits: { zh: "哪些結果仍未能證明？", en: "What is still unproven?" },
  fallback_plan: { zh: "如果再次跌至 18%，今星期應做甚麼？", en: "What if it falls to 18% again?" },
  draft_review_reply: { zh: "示範 1 則合適的評論回覆", en: "Draft one suitable review reply" },
  friendlier_review_reply: { zh: "改得更親切，但不要過度承諾", en: "Make it warmer without overpromising" },
  compare_priorities: { zh: "比較這些行動的優先次序", en: "Compare these action priorities" },
  explain_insights: { zh: "解釋最新變化與因果限制", en: "Explain the change and causal limits" },
  asset_next_step: { zh: "哪些素材現在可以安全使用？", en: "Which assets are safe to use now?" },
  rescan_validation: { zh: "重掃前要驗證哪些條件？", en: "What must be validated before re-scan?" },
  generate_social: { zh: "根據已核准素材準備社交帖文", en: "Prepare a post from approved assets" },
  generate_faq: { zh: "準備 FAQ，但不要作出事實", en: "Prepare an FAQ without inventing facts" },
  generate_menu: { zh: "建立餐牌翻譯工作批次", en: "Create a menu translation batch" },
}

/**
 * Live mode answers from the workspace's own snapshots, so the labels that
 * quote the Kam Man House sample numbers get number-free phrasing (§3.8).
 * Demo labels above stay exactly as they are.
 */
const liveLabels: Partial<Record<DemoQuestionId, { zh: string; en: string }>> = {
  explain_change: { zh: "最新的分數變化代表甚麼？", en: "What does the latest score change mean?" },
  fallback_plan: { zh: "如果分數再次下跌，今星期應做甚麼？", en: "What if the score falls again this week?" },
}

function questionLabel(questionId: DemoQuestionId, mode: AssistantMode, isChinese: boolean) {
  const label = (mode === "live" ? liveLabels[questionId] : undefined) ?? labels[questionId]
  return label[isChinese ? "zh" : "en"]
}

function surfaceTitle(surface: AssistantSurface, isChinese: boolean) {
  const map: Record<AssistantSurface, [string, string]> = {
    sample: ["錦汶館公開示範", "Kam Man House public demo"],
    report: ["能見度報告", "Visibility report"],
    home: ["今日焦點", "Today’s focus"],
    actions: ["行動優先次序", "Action priorities"],
    action: ["行動草稿與版本", "Action draft and versions"],
    create: ["建立成果", "Create an outcome"],
    insights: ["成效與限制", "Insights and limits"],
    assets: ["已核准素材", "Approved assets"],
    rescan: ["重新掃描驗證", "Re-scan validation"],
    workspace: ["目前工作台", "Current workspace"],
  }
  return map[surface][isChinese ? 0 : 1]
}

export function ContextualAssistant({
  locale,
  surface,
  triggerLabel,
  trigger,
  onCreateVersion,
  disabled = false,
  mode = "demo",
  context,
}: {
  locale: PrototypeLocale
  surface: AssistantSurface
  triggerLabel?: string
  trigger?: ReactNode
  onCreateVersion?: (body: string, run: DemoAssistantRunResponse) => void
  disabled?: boolean
  /** `live` answers from this workspace's evidence (requires `context`); default `demo` keeps the fixed sample (§3.8). */
  mode?: AssistantMode
  context?: AssistantContext
}) {
  const isChinese = locale !== "en"
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<"idle" | "running" | "failed">("idle")
  const [selected, setSelected] = useState<DemoQuestionId | null>(null)
  const [run, setRun] = useState<DemoAssistantRunResponse | null>(null)
  const [versionCreated, setVersionCreated] = useState(false)
  const questions = surfaceQuestions[surface]

  async function ask(questionId: DemoQuestionId) {
    setSelected(questionId)
    setRun(null)
    setVersionCreated(false)
    setState("running")
    try {
      const response = await fetch(ASSISTANT_RUN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAssistantRequest(mode, surface, questionId, locale, context)),
      })
      if (!response.ok) throw new Error("assistant_run_failed")
      const result = await response.json() as DemoAssistantRunResponse
      setRun(result)
      setState("idle")
    } catch {
      setState("failed")
    }
  }

  function createVersion() {
    if (!run?.output || !onCreateVersion) return
    onCreateVersion(run.output.body, run)
    setVersionCreated(true)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild disabled={disabled}>
        {trigger ?? <Button className="assistant-launcher" variant="outline" disabled={disabled}><Sparkles aria-hidden="true" /><span>{triggerLabel ?? (isChinese ? "問隨身增長助理" : "Ask Visibility Operator")}</span></Button>}
      </SheetTrigger>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className="assistant-sheet h-[92svh] w-full gap-0 rounded-t-[1.5rem] p-0 sm:h-full sm:w-[min(420px,100vw)] sm:max-w-[420px] sm:rounded-none"
      >
        <SheetHeader className="assistant-sheet-header">
          <div className="assistant-title-row">
            <span className="assistant-mark"><Sparkles aria-hidden="true" /></span>
            <div>
              <Badge variant="outline">Visibility Operator</Badge>
              <SheetTitle>{isChinese ? "隨身增長助理" : "Pocket Growth Assistant"}</SheetTitle>
            </div>
          </div>
          <SheetDescription>{isChinese ? `目前情境：${surfaceTitle(surface, true)}。解釋證據、建議下一步及準備新草稿，但不會自行批准或發佈。` : `Current context: ${surfaceTitle(surface, false)}. It explains evidence, recommends a next step and prepares new drafts—never approval or publishing.`}</SheetDescription>
          <ol className="assistant-flow" aria-label={isChinese ? "助理處理流程" : "Assistant flow"}>
            {(isChinese ? ["解釋", "證據", "行動", "草稿", "審批／重掃"] : ["Explain", "Evidence", "Act", "Draft", "Approve / re-scan"]).map((item, index) => <li key={item}><span>{index + 1}</span>{item}</li>)}
          </ol>
        </SheetHeader>

        <div className="assistant-sheet-body">
          <div className="assistant-boundary"><LockKeyhole aria-hidden="true" /><span>{mode === "live" ? (isChinese ? "答案只使用此工作台的證據快照；這裡不會發佈或核准任何內容。" : "Answers use only this workspace's evidence snapshots; nothing is published or approved here.") : (isChinese ? "公開及示範模式只使用固定、已清理的錦汶館資料；不接受其他商戶或客戶資料。" : "Public and demo mode uses fixed, sanitised Kam Man House data only; no other business or customer data is accepted.")}</span></div>

          <section className="assistant-question-section" aria-labelledby="assistant-question-title">
            <p className="eyebrow" id="assistant-question-title">{isChinese ? "由目前問題開始" : "Start from the current problem"}</p>
            <div className="assistant-question-list">
              {questions.map((questionId) => <button key={questionId} type="button" aria-pressed={selected === questionId} onClick={() => ask(questionId)}><span>{questionLabel(questionId, mode, isChinese)}</span><ArrowRight aria-hidden="true" /></button>)}
            </div>
          </section>

          <AssistantRunStatus state={state} isChinese={isChinese} mode={mode} />

          {run && <div className="assistant-result" aria-live="polite">
            <section className="assistant-answer-card">
              <div className="assistant-result-label"><Check aria-hidden="true" />{isChinese ? "解釋" : "Explanation"}<code>{run.runId.replace("demo_run_", "run_").slice(0, 18)}</code></div>
              <p>{run.answer}</p>
            </section>

            <section className="assistant-evidence-section">
              <p className="eyebrow">{isChinese ? "引用的證據 snapshot" : "Referenced evidence snapshots"}</p>
              <div className="assistant-evidence-list">{run.evidenceRefs.map((item) => <AssistantEvidenceCard key={item.evidenceId} evidence={item} isChinese={isChinese} />)}</div>
            </section>

            <section className="assistant-next-action">
              <span><ScanSearch aria-hidden="true" /></span>
              <div><small>{isChinese ? "建議下一步" : "Recommended next step"}</small><strong>{run.nextAction}</strong></div>
            </section>

            {run.output && <AssistantArtifactPreview artifact={run.output} isChinese={isChinese} />}

            {run.warnings.length > 0 && <div className="assistant-warning"><ShieldCheck aria-hidden="true" /><div><strong>{isChinese ? "限制" : "Limit"}</strong>{run.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}

            {run.output && onCreateVersion && <Button className="w-full" onClick={createVersion} disabled={versionCreated}><FilePlus2 aria-hidden="true" />{versionCreated ? (isChinese ? "已建立新版本" : "New version created") : (isChinese ? "建立新版本（不覆蓋現有內容）" : "Create a new version without overwriting")}</Button>}

            <div className="assistant-approval-boundary"><ShieldCheck aria-hidden="true" /><span>{run.requiresApproval ? (isChinese ? "此輸出需要獲授權人士核准指定版本；目前未發佈，也未扣除交付額。" : "An authorised person must approve the exact version. It is not published and no delivery is consumed.") : (isChinese ? "這是解釋與建議，不會改變掃描分數、審批狀態或用量。" : "This explanation changes no score, approval state or usage.")}</span></div>
          </div>}
        </div>
      </SheetContent>
    </Sheet>
  )
}
