"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { AlertTriangle, Play } from "lucide-react"

import { PageIntro, SectionCard } from "@/components/product-ui"
import { continuableActions, PackItemList } from "@/components/workspace/pack-items"
import { Button } from "@/components/ui/button"
import { aiBudgetRefusal } from "@/lib/budgets/messages"
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import type { PackOverview } from "@/lib/workspace/packs-model"
import { useSequentialRuns, type StopReason } from "@/lib/workspace/use-sequential-runs"

/**
 * One pack's page (P4.2, spec 3.2): the same item list as the Home card, with a
 * per-item Retry, Continue and "Review next". There is no approve or export
 * control here; those happen only on the action's own page, on the exact
 * version. A closed or finished pack runs nothing: it is read-only history.
 */
export interface PackViewProps {
  locale: PrototypeLocale
  workspaceSlug: string
  role: WorkspaceRole
  /** Whether the caller's location scope covers the pack's location. */
  inScope: boolean
  pack: PackOverview
  /** The pack's location name; null is a workspace-wide pack. */
  locationName: string | null
}

export function PackView({ locale, workspaceSlug, role, inScope, pack, locationName }: PackViewProps) {
  const text = copy[locale].workspace.packs
  const router = useRouter()
  const base = `/${locale}/owner/${workspaceSlug}`
  const closed = pack.pack.closedAt !== null
  const [stopReason, setStopReason] = useState<StopReason | null>(null)
  const runs = useSequentialRuns({ onStop: setStopReason })
  const canAct = !closed && !pack.finished && (role === "owner" || role === "manager") && inScope
  const [continuing, setContinuing] = useState(false)
  // Any run in flight: Retry and Continue are hidden meanwhile, so one item is never run twice.
  const running = continuing || runs.running
  const continuable = continuableActions(pack, runs.rows)

  /** Runs the items still waiting, in turn: after a refusal, a reload, or a pack another tab started. */
  async function continueRun() {
    if (!canAct || running || continuable.length === 0) return
    setContinuing(true)
    setStopReason(null)
    await runs.runAll(continuable)
    router.refresh()
    setContinuing(false)
  }

  async function retry(actionId: string) {
    if (running) return
    setStopReason(null)
    await runs.retry(actionId)
    // The overview is read on the server; refresh it so Review next and the counts are current.
    router.refresh()
  }

  const stopMessage = stopReason ? aiBudgetRefusal(locale, stopReason === "ai_paused" ? 503 : 429, stopReason) : null

  return (
    <div className="pack-view">
      <PageIntro eyebrow={`${text.pageEyebrow} · ${locationName ?? text.allLocations}`} title={text.title} description={text.pageDescription} />
      <SectionCard className="pack-card">
        {closed && <p className="limitation-note">{text.closed}</p>}
        <PackItemList locale={locale} actionsHref={`${base}/actions`} items={pack.items} live={runs.rows} canRetry={canAct && !running} onRetry={(id) => void retry(id)} />
        {!closed && (pack.nextToReview || (canAct && !running && continuable.length > 0)) && (
          <div className="draft-editor-actions">
            {canAct && !running && continuable.length > 0 && (
              <Button onClick={() => void continueRun()}><Play /> {text.continue}</Button>
            )}
            {pack.nextToReview && (
              <Button asChild><Link href={`${base}/actions/${pack.nextToReview.actionId}`}>{text.reviewNext}</Link></Button>
            )}
          </div>
        )}
        {stopMessage && <p className="limitation-note" role="alert"><AlertTriangle aria-hidden="true" />{stopMessage}</p>}
      </SectionCard>
    </div>
  )
}

/**
 * The pack page when a read failed. The pack may well exist, so this never says
 * it does not (a 404 is kept for a pack that is missing or out of scope).
 */
export function PackUnavailable({ locale, workspaceSlug }: { locale: PrototypeLocale; workspaceSlug: string }) {
  const text = copy[locale].workspace.packs
  return (
    <div className="pack-view">
      <PageIntro eyebrow={text.pageEyebrow} title={text.title} description={text.pageDescription} />
      <SectionCard className="pack-card">
        <p className="limitation-note" role="alert"><AlertTriangle aria-hidden="true" />{text.unavailable}</p>
        <Link href={`/${locale}/owner/${workspaceSlug}`}>{text.backToHome}</Link>
      </SectionCard>
    </div>
  )
}
