"use client"

import Link from "next/link"
import { useState } from "react"
import { AlertTriangle, LoaderCircle, PackageOpen, Play } from "lucide-react"

import { SectionCard } from "@/components/product-ui"
import { continuableActions, PackItemList } from "@/components/workspace/pack-items"
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
 *
 * A finished pack (every item's action closed) is shown as the start state again,
 * with a link to it: Start closes it and opens the next one on the server. When
 * Start returns a pack that already existed (another tab or person started it),
 * nothing is run automatically; the card refreshes it and offers Continue.
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
  const [continuing, setContinuing] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [stopReason, setStopReason] = useState<StopReason | null>(null)
  const runs = useSequentialRuns({ onStop: setStopReason })
  const canAct = (role === "owner" || role === "manager") && inScope && !location.isAll
  // Any run in flight (Start, Continue or a Retry): Retry and Continue are hidden meanwhile, so one item is never run twice.
  const running = starting || continuing || runs.running
  // A finished pack is history: the card offers the next one, and links to this one.
  const openPack = pack && !pack.finished ? pack : null
  const lastPack = pack?.finished ? pack : null
  const continuable = openPack ? continuableActions(openPack, runs.rows) : []

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
    if (!canAct || running) return
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
    if (started.data.created) {
      // In turn, not in parallel: each run is its own request with its own budget check.
      await runs.runAll(packActionsToDraft(started.data.pack))
    }
    // Not created: someone else's Start made this pack and may be running it now, so
    // nothing runs here; the refreshed pack shows what is left, behind Continue.
    await refresh()
    setStarting(false)
  }

  /** Runs the items still waiting, in turn: after a refusal, a reload, or a pack another tab started. */
  async function continueRun() {
    if (!canAct || running || continuable.length === 0) return
    setContinuing(true)
    setProblem(null)
    setStopReason(null)
    await runs.runAll(continuable)
    await refresh()
    setContinuing(false)
  }

  async function retry(actionId: string) {
    if (running) return
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
          <h2>{openPack && !location.isAll ? progress(openPack) : text.startHeading}</h2>
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
      ) : openPack ? (
        <>
          <PackItemList locale={locale} actionsHref={`${base}/actions`} items={openPack.items} live={runs.rows} canRetry={canAct && !running} onRetry={(id) => void retry(id)} />
          <div className="draft-editor-actions">
            {canAct && !running && continuable.length > 0 && (
              <Button onClick={() => void continueRun()}><Play /> {text.continue}</Button>
            )}
            {openPack.nextToReview && (
              <Button asChild><Link href={`${base}/actions/${openPack.nextToReview.actionId}`}>{text.reviewNext}</Link></Button>
            )}
            <Button asChild variant="outline"><Link href={`${base}/packs/${openPack.pack.id}`}>{text.viewPack}</Link></Button>
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
          {(canAct || lastPack) && (
            <div className="draft-editor-actions">
              {canAct && (
                <Button onClick={() => void start()} disabled={starting}>
                  {starting ? <LoaderCircle className="animate-spin" /> : <PackageOpen />} {starting ? text.starting : text.start}
                </Button>
              )}
              {lastPack && (
                <Button asChild variant="outline"><Link href={`${base}/packs/${lastPack.pack.id}`}>{text.viewLastPack}</Link></Button>
              )}
            </div>
          )}
        </>
      )}

      {problem && <p className="limitation-note" role="alert"><AlertTriangle aria-hidden="true" />{problem}</p>}
      {stopMessage && <p className="limitation-note" role="alert"><AlertTriangle aria-hidden="true" />{stopMessage}</p>}
    </SectionCard>
  )
}
