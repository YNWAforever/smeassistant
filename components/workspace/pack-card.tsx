"use client"

import Link from "next/link"
import { useState } from "react"
import { AlertTriangle, LoaderCircle, PackageOpen } from "lucide-react"

import { SectionCard } from "@/components/product-ui"
import { PackItemList } from "@/components/workspace/pack-items"
import { Button } from "@/components/ui/button"
import { aiBudgetRefusal } from "@/lib/budgets/messages"
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { getOpenPack, startPack, type ClientResult } from "@/lib/workspace/client"
import { packActionsToDraft, STARTER_PACK, type PackOverview } from "@/lib/workspace/packs-model"
import { useSequentialRuns, type StopReason } from "@/lib/workspace/use-sequential-runs"

/**
 * The Home "Visibility starter pack" card (P4.2, spec 3.2). It states the delivery
 * unit before anything is requested, starts the pack (which creates three actions
 * and calls no model), then runs each item through the ordinary run route one at
 * a time. It never approves or exports anything: approval and export happen on the
 * action's own page, on the exact version.
 */
export interface PackCardProps {
  locale: PrototypeLocale
  workspaceId: string
  workspaceSlug: string
  role: WorkspaceRole
  /** `isAll`: the Home scope is every location of a multi-location workspace, so there is no one location to start for. */
  location: { id: string | null; isAll: boolean }
  /** Whether the caller's location scope covers this location (a workspace-wide pack needs an unscoped caller). */
  inScope: boolean
  usage: { approvedDeliveries: number; allowance: number | null } | null
  initialPack: PackOverview | null
  /** `isAll` only: the open packs of the locations the caller can read. `name: null` is a workspace-wide pack. */
  locationPacks?: Array<{ name: string | null; pack: PackOverview }>
}

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(String(value)), template)
}

export function PackCard({ locale, workspaceId, workspaceSlug, role, location, inScope, usage, initialPack, locationPacks }: PackCardProps) {
  const text = copy[locale].workspace.packs
  const templates = copy[locale].workspace.templates
  const base = `/${locale}/owner/${workspaceSlug}`
  const [pack, setPack] = useState<PackOverview | null>(initialPack)
  const [starting, setStarting] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [stopReason, setStopReason] = useState<StopReason | null>(null)
  const runs = useSequentialRuns({ onStop: setStopReason })
  const canAct = (role === "owner" || role === "manager") && inScope && !location.isAll

  const disclosure =
    text.disclosure + (usage && usage.allowance !== null ? fill(text.usage, { used: usage.approvedDeliveries, allowance: usage.allowance }) : "")

  function progress(overview: PackOverview): string {
    const drafted = fill(text.progress, { drafted: overview.counts.drafted, total: overview.items.length })
    return overview.counts.needsInput > 0 ? `${drafted} · ${fill(text.progressNeedsFacts, { n: overview.counts.needsInput })}` : drafted
  }

  function startFailure(result: Extract<ClientResult<unknown>, { ok: false }>): string {
    if (result.status === 403) return text.errors.forbidden
    if (result.error === "offline" || result.error === "network") return text.errors.network
    return text.errors.startFailed
  }

  /** Re-reads the open pack so the counts and "Review next" reflect what the runs just wrote. */
  async function refresh() {
    const latest = await getOpenPack(workspaceId, location.id)
    if (latest?.ok && latest.data.pack) setPack(latest.data.pack)
  }

  async function start() {
    if (!canAct || starting) return
    setStarting(true)
    setProblem(null)
    setStopReason(null)
    const started = await startPack(workspaceId, location.id)
    if (!started.ok) {
      setStarting(false)
      setProblem(startFailure(started))
      return
    }
    setPack(started.data.pack)
    // In turn, not in parallel: each run is its own request with its own budget check.
    await runs.runAll(packActionsToDraft(started.data.pack))
    await refresh()
    setStarting(false)
  }

  async function retry(actionId: string) {
    setStopReason(null)
    await runs.retry(actionId)
    await refresh()
  }

  const stopMessage = stopReason ? aiBudgetRefusal(locale, stopReason === "ai_paused" ? 503 : 429, stopReason) : null

  return (
    <SectionCard className="pack-card">
      <div className="section-card-heading">
        <div>
          <p className="eyebrow">{text.title}</p>
          <h2>{pack && !location.isAll ? progress(pack) : text.startHeading}</h2>
        </div>
        <PackageOpen aria-hidden="true" />
      </div>

      {location.isAll ? (
        <>
          <p className="limitation-note">{text.chooseLocation}</p>
          {locationPacks && locationPacks.length > 0 && (
            <div className="compact-action-list">
              {locationPacks.map(({ name, pack: open }) => (
                <Link key={open.pack.id} href={`${base}/packs/${open.pack.id}`}>
                  <div><strong>{name ?? text.allLocations}</strong><small>{progress(open)}</small></div>
                </Link>
              ))}
            </div>
          )}
        </>
      ) : pack ? (
        <>
          <PackItemList locale={locale} actionsHref={`${base}/actions`} items={pack.items} live={runs.rows} canRetry={canAct} onRetry={(id) => void retry(id)} />
          <div className="draft-editor-actions">
            {pack.nextToReview && (
              <Button asChild><Link href={`${base}/actions/${pack.nextToReview.actionId}`}>{text.reviewNext}</Link></Button>
            )}
            <Button asChild variant="outline"><Link href={`${base}/packs/${pack.pack.id}`}>{text.viewPack}</Link></Button>
          </div>
        </>
      ) : (
        <>
          <ul className="evidence-list">
            {STARTER_PACK.items.map((key) => (
              <li key={key}>
                <span><strong>{templates[key].title}</strong><small> {templates[key].summary}</small></span>
              </li>
            ))}
          </ul>
          <p className="limitation-note">{disclosure}</p>
          {!canAct && <p className="limitation-note"><AlertTriangle aria-hidden="true" />{text.noPermission}</p>}
          {canAct && (
            <div className="draft-editor-actions">
              <Button onClick={() => void start()} disabled={starting}>
                {starting ? <LoaderCircle className="animate-spin" /> : <PackageOpen />} {starting ? text.starting : text.start}
              </Button>
            </div>
          )}
        </>
      )}

      {problem && <p className="limitation-note" role="alert"><AlertTriangle aria-hidden="true" />{problem}</p>}
      {stopMessage && <p className="limitation-note" role="alert"><AlertTriangle aria-hidden="true" />{stopMessage}</p>}
    </SectionCard>
  )
}
