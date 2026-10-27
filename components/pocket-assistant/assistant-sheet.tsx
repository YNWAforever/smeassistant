"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type ReactNode } from "react"
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
import { copy, type PrototypeLocale } from "@/lib/copy"
import { nextStepHref } from "@/lib/assistant/next-step"
import { resolveText } from "@/lib/domain"
import {
  isDemoQuestionId,
  isReviewRevisionIntent,
  type AssistantIntentId,
  type AssistantContext,
  type AssistantMode,
  type AssistantOrigin,
  type AssistantSuggestion,
  type AssistantSurface,
  type DemoAssistantRunResponse,
  type DemoQuestionId,
} from "@/lib/pocket-assistant/contracts"
import { assistantIntentAllowed } from "@/lib/pocket-assistant/intent-policy"
import { ASSISTANT_RUN_ENDPOINT, buildAssistantRequest } from "@/lib/pocket-assistant/request"
import { aiBudgetRefusal } from "@/lib/budgets/messages"
import { fill } from "@/lib/copy-ui"

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
  actions: ["compare_priorities", "explain_limits"],
  action: ["friendlier_review_reply", "explain_priority", "rescan_validation", "draft_review_reply"],
  create: ["draft_review_reply", "generate_social", "generate_faq", "generate_menu"],
  insights: ["explain_insights", "explain_limits", "rescan_validation"],
  assets: ["asset_next_step", "generate_social", "generate_menu"],
  rescan: ["rescan_validation", "explain_limits"],
  workspace: ["explain_priority", "compare_priorities", "explain_insights"],
}

type ContextualIntentId = AssistantSuggestion["intentId"]

export type AssistantVersionSaveResult = { ok: true; versionNo: number } | { ok: false }

function isContextualIntent(questionId: DemoQuestionId): questionId is ContextualIntentId {
  return questionId === "explain_missing_inputs" || questionId === "where_to_continue"
}

/**
 * Demo labels quote the Kam Man House sample; live mode answers from the
 * workspace's own snapshots, so those labels are number-free (§3.8).
 */
function questionLabel(questionId: AssistantIntentId, mode: AssistantMode, locale: PrototypeLocale) {
  const t = copy[locale].assistantSheet
  if (isReviewRevisionIntent(questionId)) return questionId === "shorten_review_reply" ? t.revisions.shorten : t.revisions.contactOnly
  if (isContextualIntent(questionId)) return t.contextual[questionId]
  const live = mode === "live" && questionId in t.liveQuestions ? t.liveQuestions[questionId as keyof typeof t.liveQuestions] : undefined
  return live ?? t.questions[questionId]
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
  if (suggestion.kind === "google") return copy[locale].assistantSheet.whyReconnectGoogle
  if (suggestion.kind === "review_version") return questionLabel("where_to_continue", "live", locale)
  const title = suggestion.label.actionTitle ? resolveText(suggestion.label.actionTitle, locale) : ""
  if (!title) return questionLabel("explain_missing_inputs", "live", locale)
  return fill(copy[locale].assistantSheet.missingInputsFor, { title })
}

export function ContextualAssistant({
  locale,
  surface,
  triggerLabel,
  trigger,
  onCreateVersion,
  reviewDraft = false,
  allowGeneration = false,
  disabled = false,
  mode = "demo",
  context,
  basePath,
  locationParam,
  initialOpen = false,
  autoAsk,
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
  onCreateVersion?: (run: DemoAssistantRunResponse) => Promise<AssistantVersionSaveResult>
  /** Only the review-response editor can offer the review-specific revisions. */
  reviewDraft?: boolean
  /** Only the Action Edit step opts into drafts; shell launchers explain. */
  allowGeneration?: boolean
  disabled?: boolean
  /** `live` answers from this workspace's evidence (requires `context`); default `demo` keeps the fixed sample (§3.8). */
  mode?: AssistantMode
  context?: AssistantContext
  /** `/{locale}/owner/{workspaceSlug}`; with it a live answer's next step becomes a "Continue here" link. */
  basePath?: string
  /** The page's location query value, carried onto that link. */
  locationParam?: string
  /** Open on mount: the lazy launcher (./assistant-launcher.tsx) renders this once the visitor asks. */
  initialOpen?: boolean
  /**
   * For a trigger whose label is itself a question ("Ask why this comes first"):
   * the first opening asks it, so the owner is not made to pick the same
   * question again from the list. Asked once per mount; reopening shows that answer.
   */
  autoAsk?: DemoQuestionId
}) {
  const t = copy[locale].assistantSheet
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(initialOpen)
  const [state, setState] = useState<"idle" | "running" | "failed">("idle")
  const [selected, setSelected] = useState<string | null>(null)
  const [run, setRun] = useState<DemoAssistantRunResponse | null>(null)
  const [savedVersionNo, setSavedVersionNo] = useState<number | null>(null)
  const [savingVersion, setSavingVersion] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const savePending = useRef(false)
  const saveScope = useRef<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [needsReconciliation,setNeedsReconciliation]=useState(false)
  const [suggestions, setSuggestions] = useState<AssistantSuggestion[]>([])
  // The context object is rebuilt on every parent render; its ids are what matter.
  const contextKey = mode === "live" && context ? suggestionsQuery(context) : null
  const allowed = (intent: AssistantIntentId) => assistantIntentAllowed(surface, intent, mode, allowGeneration)
    && !(mode === "live" && surface === "action" && !reviewDraft && (intent === "friendlier_review_reply" || intent === "draft_review_reply"))
  const shown = suggestions.filter(item => allowed(item.intentId)).slice(0, 3)
  const questions: AssistantIntentId[] = [
    ...(mode === "live" && reviewDraft && surface === "action" && context?.versionId ? ["shorten_review_reply" as const, "contact_review_reply" as const] : []),
    ...surfaceQuestions[surface].filter((questionId) => !shown.some((item) => item.intentId === questionId)),
  ].filter(allowed) as AssistantIntentId[]
  // Only the latest request may write the answer: a slower earlier one (an auto-ask,
  // or a previous click) must not overwrite the question the owner chose since.
  const latestAsk = useRef(0)

  // A soft navigation (another location or filter) can keep this component mounted
  // with a new context. An answer about the old context must not stay on screen.
  const [answeredFor, setAnsweredFor] = useState(contextKey)
  if (answeredFor !== contextKey) {
    setAnsweredFor(contextKey)
    setRun(null)
    setSelected(null)
    setRefusal(null)
    setSavedVersionNo(null)
    setSavingVersion(false)
    setSaveFailed(false)
    setState("idle")
  }
  useEffect(() => {
    latestAsk.current += 1
    saveScope.current = contextKey
  }, [contextKey])

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

  async function ask(questionId: AssistantIntentId, options: { key?: string; context?: AssistantContext; origin?: AssistantOrigin } = {}) {
    if(!allowed(questionId) || needsReconciliation || savePending.current)return
    const seq = ++latestAsk.current
    const stale = () => seq !== latestAsk.current
    setSelected(options.key ?? questionId)
    setRun(null)
    setSavedVersionNo(null)
    setSaveFailed(false)
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
        if (stale()) return
        if(response.status===409 && body?.error==='run_in_progress') {
          setNeedsReconciliation(true)
          setRefusal(t.refusals.runInProgress)
          setState("idle")
          return
        }
        const refused = aiBudgetRefusal(locale, response.status, body?.error)
        if (refused) {
          setRefusal(refused)
          setState("idle")
          return
        }
        throw new Error("assistant_run_failed")
      }
      const result = await response.json() as DemoAssistantRunResponse
      if (stale()) return
      setRun(result)
      setState("idle")
    } catch {
      if (stale()) return
      if(mode==='live') {
        setNeedsReconciliation(true)
        setRefusal(t.refusals.unconfirmed)
      }
      setState("failed")
    }
  }

  // Keyed by question and context: reopening in the same context shows the earlier
  // answer, while a new location or filter asks again about the new context.
  const autoAskedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!open || !autoAsk) return
    const key = `${autoAsk}|${contextKey ?? ""}`
    if (autoAskedFor.current === key) return
    autoAskedFor.current = key
    void ask(autoAsk)
    // `ask` is recreated every render; the ref keys this to the question and context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoAsk, contextKey])

  const continueHref = mode === "live" && basePath && run?.nextStep ? nextStepHref(basePath, run.nextStep, locationParam) : null

  async function createVersion() {
    if (!run?.draftRunId || !onCreateVersion || savePending.current || savedVersionNo !== null) return
    const scope = contextKey
    savePending.current = true
    setSavingVersion(true)
    setSaveFailed(false)
    try {
      const result = await onCreateVersion(run)
      if (saveScope.current !== scope) return
      if (result.ok) setSavedVersionNo(result.versionNo)
      else setSaveFailed(true)
    } catch {
      if (saveScope.current === scope) setSaveFailed(true)
    } finally {
      savePending.current = false
      if (saveScope.current === scope) setSavingVersion(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger asChild disabled={disabled}>
        {trigger ?? <Button className="assistant-launcher" variant="outline" disabled={disabled} aria-label={triggerLabel ?? copy[locale].shell.assistant.name}><Sparkles aria-hidden="true" /><span>{triggerLabel ?? copy[locale].shell.assistant.name}</span></Button>}
      </SheetTrigger>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className="assistant-sheet h-[92svh] w-full gap-0 rounded-t-[1.5rem] p-0 sm:h-full sm:w-[min(420px,100vw)] sm:max-w-[420px] sm:rounded-none"
      >
        <SheetHeader className="assistant-sheet-header">
          <div className="assistant-title-row">
            <span className="assistant-mark"><Sparkles aria-hidden="true" /></span>
            <div>
              {/* The name is the title; the badge says what the answers are drawn from. */}
              <Badge variant="outline">{mode === "live" ? t.sourceBadge.live : t.sourceBadge.demo}</Badge>
              <SheetTitle>{copy[locale].shell.assistant.name}</SheetTitle>
            </div>
          </div>
          <SheetDescription>{fill(t.description, { surface: t.surfaces[surface] })}</SheetDescription>
          <ol className="assistant-flow" aria-label={t.flowLabel}>
            {t.flow.map((item, index) => <li key={item}><span>{index + 1}</span>{item}</li>)}
          </ol>
        </SheetHeader>

        <div className="assistant-sheet-body">
          <div className="assistant-boundary"><LockKeyhole aria-hidden="true" /><span>{mode === "live" ? t.boundary.live : t.boundary.demo}</span></div>

          {shown.length > 0 && <section className="assistant-question-section" aria-labelledby="assistant-suggestion-title">
            <p className="eyebrow" id="assistant-suggestion-title">{t.needsYouNow}</p>
            <div className="assistant-question-list">
              {shown.map((suggestion) => <button key={suggestion.id} type="button" disabled={needsReconciliation || savingVersion} aria-pressed={selected === suggestion.id} onClick={() => ask(suggestion.intentId, { key: suggestion.id, context: suggestion.context, origin: "suggested" })}><span>{suggestionLabel(suggestion, locale)}</span><ArrowRight aria-hidden="true" /></button>)}
            </div>
          </section>}

          <section className="assistant-question-section" aria-labelledby="assistant-question-title">
            <p className="eyebrow" id="assistant-question-title">{t.startFrom}</p>
            <div className="assistant-question-list">
              {questions.map((questionId) => <button key={questionId} type="button" disabled={needsReconciliation || savingVersion} aria-pressed={selected === questionId} onClick={() => ask(questionId)}><span>{questionLabel(questionId, mode,locale)}</span><ArrowRight aria-hidden="true" /></button>)}
            </div>
          </section>

          <AssistantRunStatus state={state} locale={locale} mode={mode} />

          {refusal && <div className="assistant-warning" role="alert"><ShieldCheck aria-hidden="true" /><div><p>{refusal}</p></div></div>}
          {needsReconciliation && basePath && context?.actionId && <a href={`${basePath}/actions/${context.actionId}`}>{t.viewRunHistory}</a>}

          {run && <div className="assistant-result" aria-live="polite">
            <section className="assistant-answer-card">
              <div className="assistant-result-label"><Check aria-hidden="true" />{t.explanation}<code>{run.runId.replace("demo_run_", "run_").slice(0, 18)}</code></div>
              <p>{run.answer}</p>
            </section>

            <section className="assistant-evidence-section">
              <p className="eyebrow">{t.referencedEvidence}</p>
              <div className="assistant-evidence-list">{run.evidenceRefs.map((item) => <AssistantEvidenceCard key={item.evidenceId} evidence={item} locale={locale} />)}</div>
            </section>

            <section className="assistant-next-action">
              <span><ScanSearch aria-hidden="true" /></span>
              <div><small>{t.nextStep}</small><strong>{run.nextAction}</strong>{continueHref && <Link className="assistant-next-link" href={continueHref} onClick={() => changeOpen(false)}>{t.continueHere}<ArrowRight aria-hidden="true" /></Link>}</div>
            </section>

            {run.output && <AssistantArtifactPreview artifact={run.output} locale={locale} />}

            {run.warnings.length > 0 && <div className="assistant-warning"><ShieldCheck aria-hidden="true" /><div><strong>{t.limit}</strong>{run.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}

            {saveFailed && <p role="alert">{t.saveFailed}</p>}
            {run.draftRunId && onCreateVersion && <Button className="w-full" onClick={() => void createVersion()} disabled={savingVersion || savedVersionNo !== null}><FilePlus2 aria-hidden="true" />{savingVersion ? t.saving : savedVersionNo !== null ? fill(t.saved, { n: savedVersionNo }) : t.createVersion}</Button>}

            <div className="assistant-approval-boundary"><ShieldCheck aria-hidden="true" /><span>{run.requiresApproval ? t.approvalBoundary.requiresApproval : t.approvalBoundary.explanationOnly}</span></div>
          </div>}
        </div>
      </SheetContent>
    </Sheet>
  )
}
