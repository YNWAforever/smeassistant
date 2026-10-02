"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { AlertTriangle } from "lucide-react"

import { PageIntro, SectionCard } from "@/components/product-ui"
import { PackItemList } from "@/components/workspace/pack-items"
import { Button } from "@/components/ui/button"
import { aiBudgetRefusal } from "@/lib/budgets/messages"
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import type { PackOverview } from "@/lib/workspace/packs-model"
import { useSequentialRuns, type StopReason } from "@/lib/workspace/use-sequential-runs"

/**
 * One pack's page (P4.2, spec 3.2): the same item list as the Home card, with a
 * per-item Retry and "Review next". There is no approve or export control here;
 * those happen only on the action's own page, on the exact version. A closed
 * pack is read-only history.
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
  const canRetry = !closed && (role === "owner" || role === "manager") && inScope

  async function retry(actionId: string) {
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
        <PackItemList locale={locale} actionsHref={`${base}/actions`} items={pack.items} live={runs.rows} canRetry={canRetry} onRetry={(id) => void retry(id)} />
        {!closed && pack.nextToReview && (
          <div className="draft-editor-actions">
            <Button asChild><Link href={`${base}/actions/${pack.nextToReview.actionId}`}>{text.reviewNext}</Link></Button>
          </div>
        )}
        {stopMessage && <p className="limitation-note" role="alert"><AlertTriangle aria-hidden="true" />{stopMessage}</p>}
      </SectionCard>
    </div>
  )
}
