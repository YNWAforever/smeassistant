"use client"

import Link from "next/link"
import { AlertTriangle, CheckCircle2, CircleDashed, CircleMinus, CirclePause, LoaderCircle, RefreshCw, TextCursorInput } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import type { ActionOverview } from "@/lib/workspace/overview"
import { packActionsToDraft, type PackItem, type PackOverview } from "@/lib/workspace/packs-model"
import type { RowState } from "@/lib/workspace/use-sequential-runs"

/**
 * The item list the Home pack card and the pack page share. It shows each item's
 * state and links to the action's own page; it has no approve, export, reject or
 * bulk control, by design: approval and export happen only on the exact version
 * (spec 3.2).
 */
export type ItemStateKey = "generating" | "draftReady" | "needsFacts" | "approved" | "exported" | "published" | "failed" | "paused" | "done" | "dismissed" | "notStarted"

/**
 * The state to show for one item. A version that is already approved or exported
 * is more advanced than anything this browser session ran, so it wins; otherwise
 * the live row from this session's runs wins over what the overview last said.
 */
export function itemState(action: ActionOverview, live: RowState | undefined): ItemStateKey {
  const version = action.latestVersion
  if (live === "generating") return "generating"
  // P4.6: a reply verified on Google is delivered too, and says where.
  if (version?.deliveryState === "published") return "published"
  if (version?.deliveryState === "exported") return "exported"
  if (version?.approvalState === "approved") return "approved"
  if (live === "failed") return "failed"
  // Refused by the AI pause or the spend budget: nothing failed, the item waits to be continued.
  if (live === "paused") return "paused"
  if (live === "needs_input") return "needsFacts"
  if (live === "draft_ready") return "draftReady"
  if (version && (version.approvalState === "draft" || version.approvalState === "changes_requested")) return "draftReady"
  // A finished action with nothing drafted: it was completed or set aside, so it is not waiting to start.
  if (!version && action.actionState === "completed") return "done"
  if (!version && (action.actionState === "dismissed" || action.actionState === "cancelled" || action.actionState === "expired")) return "dismissed"
  if (action.displayPhaseKey === "generating") return "generating"
  if (action.runState === "failed" || action.runState === "timed_out") return "failed"
  // A run that came back asking for facts. Before any run, an item that lists required inputs is simply not started.
  if (action.actionState === "needs_input" && action.runState === "succeeded") return "needsFacts"
  return "notStarted"
}

const ICONS: Record<ItemStateKey, typeof CircleDashed> = {
  generating: LoaderCircle,
  draftReady: CheckCircle2,
  needsFacts: TextCursorInput,
  approved: CheckCircle2,
  exported: CheckCircle2,
  published: CheckCircle2,
  failed: AlertTriangle,
  paused: CirclePause,
  done: CheckCircle2,
  dismissed: CircleMinus,
  notStarted: CircleDashed,
}

/**
 * What Continue runs, in position order: the items `packActionsToDraft` would
 * spend on that are still waiting, not started or paused. A failed item has its
 * own Retry, an item asking for facts needs the owner's facts rather than another
 * run, and an item already generating (in this tab or another) is left alone.
 */
export function continuableActions(pack: PackOverview, live: Record<string, RowState>): string[] {
  const waiting = new Set(
    pack.items.filter(({ action }) => {
      const state = itemState(action, live[action.id])
      return state === "notStarted" || state === "paused"
    }).map(({ action }) => action.id),
  )
  return packActionsToDraft(pack).filter((id) => waiting.has(id))
}

export function PackItemList({
  locale,
  actionsHref,
  items,
  live,
  canRetry,
  onRetry,
}: {
  locale: PrototypeLocale
  /** `/{locale}/owner/{slug}/actions` */
  actionsHref: string
  items: PackItem[]
  live: Record<string, RowState>
  canRetry: boolean
  onRetry: (actionId: string) => void
}) {
  const text = copy[locale].workspace.packs
  return (
    <ul className="evidence-list" role="status" aria-live="polite">
      {items.map(({ templateKey, action }) => {
        const state = itemState(action, live[action.id])
        const Icon = ICONS[state]
        return (
          <li key={action.id} data-template={templateKey}>
            <Icon className={state === "generating" ? "animate-spin" : undefined} aria-hidden="true" />
            <span>
              <strong>{resolveText(action.title, locale)}</strong> <Badge variant="outline">{text.states[state]}</Badge>
            </span>
            {state === "failed" && canRetry && (
              <Button size="sm" variant="outline" onClick={() => onRetry(action.id)}><RefreshCw /> {text.retry}</Button>
            )}
            <Link href={`${actionsHref}/${action.id}`}>{text.open}</Link>
          </li>
        )
      })}
    </ul>
  )
}
