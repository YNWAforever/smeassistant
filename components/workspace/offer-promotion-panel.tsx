"use client"

import Link from "next/link"
import { useState } from "react"
import { AlertTriangle, CheckCircle2, CircleDashed, LoaderCircle, RefreshCw, WandSparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { aiBudgetRefusal } from "@/lib/budgets/messages"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { createPromotions, type ClientResult, type PromotionChannel } from "@/lib/workspace/client"
import { isOfferStaleCode } from "@/lib/workspace/offer-format"
import { useSequentialRuns, type RowState } from "@/lib/workspace/use-sequential-runs"

/**
 * "Create promotion drafts" for one confirmed offer (design 3.2). It states the
 * delivery unit before anything runs, then calls POST /api/offers/[id]/promotions
 * (which creates one action per channel and calls no model) and runs each action
 * in turn through the ordinary run route, so spend budgets and the AI pause apply
 * unchanged. One channel failing never touches the other, and a retry runs only
 * that action. The offer id is never shown to the owner as an input (R3).
 */
export interface OfferPromotionPanelProps {
  locale: PrototypeLocale
  offerId: string
  offerTitle: string
  /** "unavailable" when the usage read failed: the panel says so instead of implying an unlimited allowance. */
  usage: { approvedDeliveries: number; allowance: number | null } | "unavailable"
  canCreate: boolean
  /** Base path of the actions list; when present each draft links to its action page. */
  actionsHref?: string
}

const CHANNELS: readonly PromotionChannel[] = ["instagram", "google"]

type RowStatus = "waiting" | "generating" | "ready" | "needs_input" | "failed"
interface Entry {
  channel: PromotionChannel
  actionId: string
}

// `paused` only happens with stopOnRefusal on; this panel turns it off, so a refusal stays `failed` (ruling P5).
const STATUS: Record<RowState, RowStatus> = { idle: "waiting", generating: "generating", draft_ready: "ready", needs_input: "needs_input", failed: "failed", paused: "failed" }

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(String(value)), template)
}

export function OfferPromotionPanel({ locale, offerId, offerTitle, usage, canCreate, actionsHref }: OfferPromotionPanelProps) {
  const text = copy[locale].workspace.offers
  const inputLabels = copy[locale].workspace.inputs
  const [phase, setPhase] = useState<"idle" | "creating" | "started">("idle")
  const [entries, setEntries] = useState<Entry[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  // A refused run (spend budget, kill switch) is that draft failing, in plain words; the other channel still runs.
  const runs = useSequentialRuns({ stopOnRefusal: false })

  const channelNames = CHANNELS.map((channel) => text.promotion.channels[channel]).join(text.promotion.listSeparator)
  const disclosure =
    fill(text.promotion.disclosure, { n: CHANNELS.length, channels: channelNames }) +
    (usage === "unavailable"
      ? text.promotion.usageUnavailable
      : usage.allowance !== null ? fill(text.promotion.usage, { used: usage.approvedDeliveries, allowance: usage.allowance }) : "")

  function failureText(result: Extract<ClientResult<unknown>, { ok: false }>): string {
    if (result.status === 409 && isOfferStaleCode(result.error)) return text.stale[result.error]
    if (result.status === 403) return text.errors.forbidden
    if (result.error === "offline" || result.error === "network") return text.errors.network
    return aiBudgetRefusal(locale, result.status, result.error) ?? text.promotion.failed
  }

  /** The row's explanation in words, from the run's last answer. */
  function messageFor(actionId: string): string | null {
    const result = runs.results[actionId]
    if (!result) return null
    if (!result.ok) return failureText(result)
    // offer_id is bound by the action's column, so it is never something the owner supplies.
    const facts = (result.data.factsNeeded ?? []).filter((key) => key !== "offer_id")
    if (result.data.factsNeeded?.length) {
      const labels = facts.map((key) => inputLabels[key]).filter((label): label is string => Boolean(label))
      return labels.length ? fill(text.promotion.needsInput, { facts: labels.join(text.promotion.listSeparator) }) : text.promotion.needsInputGeneric
    }
    if (result.data.state === "failed") return text.promotion.failed
    return null
  }

  async function create() {
    if (!canCreate || phase !== "idle") return
    setPhase("creating")
    setProblem(null)
    const created = await createPromotions(offerId)
    if (!created.ok) {
      setPhase("idle")
      setProblem(created.status === 409 && isOfferStaleCode(created.error) ? text.stale[created.error] : created.status === 403 ? text.errors.forbidden : text.promotion.createFailed)
      return
    }
    setEntries(created.data.actions.map((entry) => ({ channel: entry.channel, actionId: entry.actionId })))
    setPhase("started")
    // In turn, not in parallel: each run is its own request with its own budget check.
    await runs.runAll(created.data.actions.map((entry) => entry.actionId))
  }

  const icon = (status: RowStatus) =>
    status === "generating" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : status === "ready" ? <CheckCircle2 aria-hidden="true" /> : status === "waiting" ? <CircleDashed aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />

  return (
    <div className="brand-check-panel" aria-label={`${text.promotion.title}: ${offerTitle}`}>
      <div className="brand-check-head">
        <WandSparkles aria-hidden="true" />
        <div><strong>{text.promotion.title}</strong><span>{offerTitle}</span></div>
      </div>
      <p className="limitation-note">{disclosure}</p>
      {!canCreate && <p className="limitation-note"><AlertTriangle aria-hidden="true" />{text.promotion.noPermission}</p>}
      {problem && <p className="limitation-note" role="alert"><AlertTriangle aria-hidden="true" />{problem}</p>}
      {phase !== "started" && (
        <div className="draft-editor-actions">
          <Button onClick={() => void create()} disabled={!canCreate || phase === "creating"}>
            {phase === "creating" ? <LoaderCircle className="animate-spin" /> : <WandSparkles />} {phase === "creating" ? text.promotion.creating : text.promotion.create}
          </Button>
        </div>
      )}
      {entries.length > 0 && (
        <ul className="evidence-list" role="status" aria-live="polite">
          {entries.map((entry) => {
            const status = STATUS[runs.rows[entry.actionId] ?? "idle"]
            const message = status === "generating" ? null : messageFor(entry.actionId)
            return (
              <li key={entry.actionId}>
                {icon(status)}
                <span>
                  <strong>{text.promotion.channels[entry.channel]}</strong>{" "}
                  <Badge variant="outline">{text.promotion.states[status]}</Badge>
                  {message && <small> {message}</small>}
                </span>
                {status === "failed" && (
                  <Button size="sm" variant="outline" onClick={() => void runs.retry(entry.actionId)}><RefreshCw /> {text.promotion.retry}</Button>
                )}
                {actionsHref && status !== "waiting" && status !== "generating" && (
                  <Link href={`${actionsHref}/${entry.actionId}`}>{text.promotion.open}</Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
