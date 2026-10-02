"use client"

import Link from "next/link"
import { AlertTriangle, CheckCircle2, CircleDashed, LoaderCircle, RefreshCw, TextCursorInput } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import type { ActionOverview } from "@/lib/workspace/overview"
import type { PackItem } from "@/lib/workspace/packs-model"
import type { RowState } from "@/lib/workspace/use-sequential-runs"

/**
 * The item list the Home pack card and the pack page share. It shows each item's
 * state and links to the action's own page; it has no approve, export, reject or
 * bulk control, by design: approval and export happen only on the exact version
 * (spec 3.2).
 */
export type ItemStateKey = "generating" | "draftReady" | "needsFacts" | "approved" | "exported" | "failed" | "notStarted"

/**
 * The state to show for one item. A version that is already approved or exported
 * is more advanced than anything this browser session ran, so it wins; otherwise
 * the live row from this session's runs wins over what the overview last said.
 */
export function itemState(action: ActionOverview, live: RowState | undefined): ItemStateKey {
  const version = action.latestVersion
  if (live === "generating") return "generating"
  if (version?.deliveryState === "exported") return "exported"
  if (version?.approvalState === "approved") return "approved"
  if (live === "failed") return "failed"
  if (live === "needs_input") return "needsFacts"
  if (live === "draft_ready") return "draftReady"
  if (version && (version.approvalState === "draft" || version.approvalState === "changes_requested")) return "draftReady"
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
  failed: AlertTriangle,
  notStarted: CircleDashed,
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
