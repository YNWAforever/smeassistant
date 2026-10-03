"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
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
import { nextStepHref } from "@/lib/assistant/next-step"
import { localized, resolveText, type LocalizedText } from "@/lib/domain"
import {
  isDemoQuestionId,
  type AssistantContext,
  type AssistantMode,
  type AssistantOrigin,
  type AssistantSuggestion,
  type AssistantSurface,
  type DemoAssistantRunResponse,
  type DemoQuestionId,
} from "@/lib/pocket-assistant/contracts"
import { ASSISTANT_RUN_ENDPOINT, buildAssistantRequest } from "@/lib/pocket-assistant/request"
import { aiBudgetRefusal } from "@/lib/budgets/messages"

/** `AssistantSurface` now lives in contracts.ts (§3.8); re-exported for existing importers. */
export type { AssistantSurface } from "@/lib/pocket-assistant/contracts"

/**
 * The fixed questions per surface. The contextual intents (`ContextualIntentId`)
 * never belong here: they are offered only as "Needs you now" suggestions.
 */
export const surfaceQuestions: Record<AssistantSurface, DemoQuestionId[]> = {
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

type ContextualIntentId = AssistantSuggestion["intentId"]

function isContextualIntent(questionId: DemoQuestionId): questionId is ContextualIntentId {
  return questionId === "explain_missing_inputs" || questionId === "where_to_continue"
}

const labels: Record<Exclude<DemoQuestionId, ContextualIntentId>, { zh: string; en: string }> = {
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
 * P4.3 copy is keyed per locale: zh-TW says 什麼, 從 and 連線 where zh-HK says
 * 甚麼, 由 and 連接. The pre-P4.3 labels above keep their shared `zh` string.
 */
const contextualLabels: Record<ContextualIntentId, LocalizedText> = {
  explain_missing_inputs: localized("What detail do you need?", "還需要甚麼資料？", "還需要什麼資料？"),
  where_to_continue: localized("Where do I continue?", "我應該由哪裡繼續？", "我應該從哪裡繼續？"),
}
const MISSING_INPUTS_FOR = localized("What detail do you need for {title}?", "「{title}」還需要甚麼資料？", "「{title}」還需要什麼資料？")
const WHY_RECONNECT_GOOGLE = localized("Why reconnect Google?", "為何要重新連接 Google？", "為何要重新連線 Google？")
const NEEDS_YOU_NOW = localized("Needs you now", "現在需要你處理", "現在需要你處理")

/**
 * Live mode answers from the workspace's own snapshots, so the labels that
 * quote the Kam Man House sample numbers get number-free phrasing (§3.8).
 * Demo labels above stay exactly as they are.
 */
const liveLabels: Partial<Record<DemoQuestionId, { zh: string; en: string }>> = {
  explain_change: { zh: "最新的分數變化代表甚麼？", en: "What does the latest score change mean?" },
  fallback_plan: { zh: "如果分數再次下跌，今星期應做甚麼？", en: "What if the score falls again this week?" },
}

function questionLabel(questionId: DemoQuestionId, mode: AssistantMode, locale: PrototypeLocale) {
  if (isContextualIntent(questionId)) return resolveText(contextualLabels[questionId], locale)
  const label = (mode === "live" ? liveLabels[questionId] : undefined) ?? labels[questionId]
  return label[locale === "en" ? "en" : "zh"]
}

const SUGGESTIONS_ENDPOINT = "/api/assistant/suggestions"
const SUGGESTION_KINDS: readonly AssistantSuggestion["kind"][] = ["missing_inputs", "review_version", "google"]

/** Keeps only well-formed rows; anything else in the body is ignored rather than rendered. */
function parseSuggestions(body: unknown): AssistantSuggestion[] | null {
  if (!body || typeof body !== "object") return null
  const list = (body as { suggestions?: unknown }).suggestions
  if (!Array.isArray(list)) return null
  return list.filter((item): item is AssistantSuggestion => {
    if (!item || typeof item !== "object") return false
    const row = item as Partial<AssistantSuggestion>
    return (
      typeof row.id === "string" &&
      SUGGESTION_KINDS.includes(row.kind as AssistantSuggestion["kind"]) &&
      isDemoQuestionId(row.intentId) &&
      Boolean(row.label) &&
      typeof row.context?.workspaceId === "string"
    )
  })
}

function suggestionsQuery(context: AssistantContext) {
  const params = new URLSearchParams({ workspaceId: context.workspaceId })
  if (context.locationId) params.set("locationId", context.locationId)
  if (context.actionId) params.set("actionId", context.actionId)
  if (context.versionId) params.set("versionId", context.versionId)
  return params.toString()
}

function suggestionLabel(suggestion: AssistantSuggestion, locale: PrototypeLocale) {
  if (suggestion.kind === "google") return resolveText(WHY_RECONNECT_GOOGLE, locale)
  if (suggestion.kind === "review_version") return questionLabel("where_to_continue", "live", locale)
  const title = suggestion.label.actionTitle ? resolveText(suggestion.label.actionTitle, locale) : ""
  if (!title) return questionLabel("explain_missing_inputs", "live", locale)
  return resolveText(MISSING_INPUTS_FOR, locale).replace("{title}", title)
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
  basePath,
  locationParam,
}: {
  locale: PrototypeLocale
  surface: AssistantSurface
  triggerLabel?: string
  trigger?: ReactNode
  /**
   * Receives the run, never the body. The text stays on the server under
   * `run.draftRunId`; carrying it through the browser is how a model's words
   * came to be recorded as a member's.
   */
  onCreateVersion?: (run: DemoAssistantRunResponse) => void
  disabled?: boolean
  /** `live` answers from this workspace's evidence (requires `context`); default `demo` keeps the fixed sample (§3.8). */
  mode?: AssistantMode
  context?: AssistantContext
  /** `/{locale}/owner/{workspaceSlug}`; with it a live answer's next step becomes a "Continue here" link. */
  basePath?: string
  /** The page's location query value, carried onto that link. */
  locationParam?: string
}) {
  const isChinese = locale !== "en"
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<"idle" | "running" | "failed">("idle")
  const [selected, setSelected] = useState<string | null>(null)
  const [run, setRun] = useState<DemoAssistantRunResponse | null>(null)
  const [versionCreated, setVersionCreated] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<AssistantSuggestion[]>([])
  // The context object is rebuilt on every parent render; its ids are what matter.
  const contextKey = mode === "live" && context ? suggestionsQuery(context) : null
  const shown = suggestions.slice(0, 3)
  const questions = surfaceQuestions[surface].filter((questionId) => !shown.some((item) => item.intentId === questionId))

  // Each time the sheet opens in live mode, ask the server what needs the owner now.
  // The fixed questions never wait for this; any failure leaves them alone on screen.
  useEffect(() => {
    if (!open || !contextKey) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`${SUGGESTIONS_ENDPOINT}?${contextKey}`, { signal: controller.signal })
        if (!response.ok) return
        const parsed = parseSuggestions(await response.json())
        if (parsed && !controller.signal.aborted) setSuggestions(parsed)
      } catch {
        // Silent by design: the fixed list is the fallback.
      }
    })()
    return () => controller.abort()
  }, [open, contextKey])

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) setSuggestions([])
  }

  async function ask(questionId: DemoQuestionId, options: { key?: string; context?: AssistantContext; origin?: AssistantOrigin } = {}) {
    setSelected(options.key ?? questionId)
    setRun(null)
    setVersionCreated(false)
    setRefusal(null)
    setState("running")
    try {
      const response = await fetch(ASSISTANT_RUN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAssistantRequest(mode, surface, questionId, locale, options.context ?? context, options.origin ?? "fixed")),
      })
      if (!response.ok) {
        // P3.5a: a spend-budget refusal is an answer, not a broken run.
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null
        const refused = aiBudgetRefusal(locale, response.status, body?.error)
        if (refused) {
          setRefusal(refused)
          setState("idle")
          return
        }
        throw new Error("assistant_run_failed")
      }
      const result = await response.json() as DemoAssistantRunResponse
      setRun(result)
      setState("idle")
    } catch {
      setState("failed")
    }
  }

  const continueHref = mode === "live" && basePath && run?.nextStep ? nextStepHref(basePath, run.nextStep, locationParam) : null

  function createVersion() {
    if (!run?.draftRunId || !onCreateVersion) return
    onCreateVersion(run)
    setVersionCreated(true)
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
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

          {shown.length > 0 && <section className="assistant-question-section" aria-labelledby="assistant-suggestion-title">
            <p className="eyebrow" id="assistant-suggestion-title">{resolveText(NEEDS_YOU_NOW, locale)}</p>
            <div className="assistant-question-list">
              {shown.map((suggestion) => <button key={suggestion.id} type="button" aria-pressed={selected === suggestion.id} onClick={() => ask(suggestion.intentId, { key: suggestion.id, context: suggestion.context, origin: "suggested" })}><span>{suggestionLabel(suggestion, locale)}</span><ArrowRight aria-hidden="true" /></button>)}
            </div>
          </section>}

          <section className="assistant-question-section" aria-labelledby="assistant-question-title">
            <p className="eyebrow" id="assistant-question-title">{isChinese ? "由目前問題開始" : "Start from the current problem"}</p>
            <div className="assistant-question-list">
              {questions.map((questionId) => <button key={questionId} type="button" aria-pressed={selected === questionId} onClick={() => ask(questionId)}><span>{questionLabel(questionId, mode, locale)}</span><ArrowRight aria-hidden="true" /></button>)}
            </div>
          </section>

          <AssistantRunStatus state={state} isChinese={isChinese} mode={mode} />

          {refusal && <div className="assistant-warning" role="alert"><ShieldCheck aria-hidden="true" /><div><p>{refusal}</p></div></div>}

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
              <div><small>{isChinese ? "建議下一步" : "Recommended next step"}</small><strong>{run.nextAction}</strong>{continueHref && <Link className="assistant-next-link" href={continueHref} onClick={() => changeOpen(false)}>{locale === "en" ? "Continue here" : locale === "zh-TW" ? "從這裡繼續" : "由這裡繼續"}<ArrowRight aria-hidden="true" /></Link>}</div>
            </section>

            {run.output && <AssistantArtifactPreview artifact={run.output} isChinese={isChinese} />}

            {run.warnings.length > 0 && <div className="assistant-warning"><ShieldCheck aria-hidden="true" /><div><strong>{isChinese ? "限制" : "Limit"}</strong>{run.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}

            {run.draftRunId && onCreateVersion && <Button className="w-full" onClick={createVersion} disabled={versionCreated}><FilePlus2 aria-hidden="true" />{versionCreated ? (isChinese ? "已建立新版本" : "New version created") : (isChinese ? "建立新版本（不覆蓋現有內容）" : "Create a new version without overwriting")}</Button>}

            <div className="assistant-approval-boundary"><ShieldCheck aria-hidden="true" /><span>{run.requiresApproval ? (isChinese ? "此輸出需要獲授權人士核准指定版本；目前未發佈，也未扣除交付額。" : "An authorised person must approve the exact version. It is not published and no delivery is consumed.") : (isChinese ? "這是解釋與建議，不會改變掃描分數、審批狀態或用量。" : "This explanation changes no score, approval state or usage.")}</span></div>
          </div>}
        </div>
      </SheetContent>
    </Sheet>
  )
}
