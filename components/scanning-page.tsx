"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, Check, CircleAlert, Link2, RefreshCw, ScanSearch } from "lucide-react"

import { FactType, ProviderBadge, PublicPageFrame, SectionCard } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { ProviderState } from "@/lib/demo-data"
import {
  CATCH_UP_MIN_INTERVAL_MS,
  COLLECTOR_KEYS,
  INITIAL_POLL_DELAY_MS,
  MAX_POLL_DURATION_MS,
  PROCESS_POST_COOLDOWN_MS,
  REPORT_REDIRECT_DELAY_MS,
  SCAN_RECLAIM_WINDOW_MINUTES,
  SCAN_STAGE_COUNT,
  advancePollLoop,
  clearPollRecord,
  collectorPhases,
  coveragePercent,
  formatElapsed,
  initialPollLoopState,
  isTerminalStatus,
  progressPercent,
  readPollRecord,
  scanReference,
  scanViewState,
  shouldCatchUp,
  stageIndex,
  stallCollectorPhases,
  writePollRecord,
  type CollectorPhase,
  type PollOutcome,
  type PollRecordStorage,
  type ScanPollRecord,
  type ScanStatusResponse,
  type StalledReason,
} from "@/lib/funnel/scan-progress"
import { interpolate } from "@/lib/share"

// `stalled` is never "failed": we stopped asking, so the collector's real state
// is unknown and claiming failure would be a fabricated finding.
const PHASE_PROVIDER_STATE: Record<CollectorPhase, ProviderState> = {
  pending: "pending",
  running: "pending",
  done: "measured",
  unavailable: "unavailable",
  failed: "failed",
  stalled: "pending",
}

const PHASE_ICON_CLASS: Record<CollectorPhase, string> = {
  pending: "collector-pending",
  running: "collector-pending",
  done: "collector-measured",
  unavailable: "collector-unavailable",
  failed: "collector-unavailable",
  stalled: "collector-pending",
}

const PHASE_ICON: Record<CollectorPhase, typeof Check> = {
  pending: RefreshCw,
  running: RefreshCw,
  done: Check,
  unavailable: CircleAlert,
  failed: CircleAlert,
  stalled: CircleAlert,
}

/** localStorage access itself can throw in privacy modes, not just its methods. */
function pollStorage(): PollRecordStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function ScanningPage({ locale, jobId }: { locale: PrototypeLocale; jobId: string }) {
  const c = copy[locale].funnel.scanning
  const router = useRouter()
  const [status, setStatus] = useState<ScanStatusResponse>({
    status: "queued",
    shareSlug: null,
    processingStage: null,
    coverage: null,
    failureCorrelationId: null,
  })
  const [elapsed, setElapsed] = useState(0)
  const [copied, setCopied] = useState(false)
  // The furthest stage seen: an unexpected `processingStage` maps to 0, so the
  // bar must never walk backwards.
  const [index, setIndex] = useState(0)
  const [stalled, setStalled] = useState<StalledReason | null>(null)
  const [checking, setChecking] = useState(false)
  const [resuming, setResuming] = useState(false)
  const lastPollAtRef = useRef(0)
  const processPostedRef = useRef(false)
  // The poll record lives in a ref rather than state: reading it is an
  // effect-time side effect (there is no localStorage during server rendering,
  // and reading it in render would be impure), and setting state synchronously
  // in an effect body is what react-hooks/set-state-in-effect forbids. `restart`
  // bumps `generation` from an event handler instead, which re-arms every effect
  // that depends on the record.
  const recordRef = useRef<{ jobId: string; record: ScanPollRecord } | null>(null)
  const [generation, setGeneration] = useState(0)

  const ensureRecord = useCallback((): ScanPollRecord => {
    if (recordRef.current?.jobId !== jobId) {
      recordRef.current = { jobId, record: readPollRecord(jobId, pollStorage(), Date.now()) }
    }
    return recordRef.current.record
  }, [jobId])

  // The queued job is claimed exactly once; the response is irrelevant here
  // (the poll below is the single source of truth) and a failure must not break
  // the page — the worker hand-off may already have picked the job up.
  const postProcess = useCallback(() => {
    const storage = pollStorage()
    const current = readPollRecord(jobId, storage, Date.now())
    writePollRecord(jobId, storage, { ...current, lastProcessAt: Date.now() })
    return fetch("/api/scan/process", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jobId }),
    }).catch(() => undefined)
  }, [jobId])

  // EFFECT 1 — claim the job. `processPostedRef` is what stops a restart-driven
  // re-run (the deps include `generation`, which restart bumps) from POSTing
  // again; resume() posts explicitly instead.
  useEffect(() => {
    if (processPostedRef.current) return
    processPostedRef.current = true
    // A rapid refresh already asked, and scan_process is only 20/hour per
    // jobId x IP — do not burn the budget the Resume button needs.
    if (Date.now() - ensureRecord().lastProcessAt < PROCESS_POST_COOLDOWN_MS) return
    void postProcess()
  }, [jobId, generation, ensureRecord, postProcess])

  // EFFECT 2 — the bounded loop. Every rule lives in advancePollLoop; this only
  // reschedules, stops, or surfaces the stalled reason.
  useEffect(() => {
    const record = ensureRecord()
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let loop = initialPollLoopState()
    const budgetElapsed = () => Date.now() - record.budgetStartedAt

    async function tick() {
      lastPollAtRef.current = Date.now()
      let outcome: PollOutcome
      try {
        const response = await fetch(`/api/scan/status?jobId=${encodeURIComponent(jobId)}`, { headers: { accept: "application/json" } })
        const data = response.ok ? ((await response.json().catch(() => null)) as ScanStatusResponse | null) : null
        if (cancelled) return
        if (data && typeof data.status === "string") {
          outcome = { kind: "status", status: data.status }
          setStatus(data)
          setIndex((furthest) => Math.max(furthest, stageIndex(data.processingStage, data.status)))
          if (isTerminalStatus(data.status)) clearPollRecord(jobId, pollStorage())
        } else {
          outcome = { kind: "http", httpStatus: response.status }
        }
      } catch {
        if (cancelled) return
        outcome = { kind: "network" }
      }
      if (cancelled) return
      const storage = pollStorage()
      writePollRecord(jobId, storage, { ...record, lastPollAt: lastPollAtRef.current })
      loop = advancePollLoop(loop, outcome, budgetElapsed())
      setChecking(false)
      setResuming(false)
      setStalled(loop.stalledReason)
      // The two returns are the bound: nothing reschedules once stalled or
      // terminal.
      if (loop.stalledReason || loop.terminal) return
      timer = setTimeout(() => void tick(), loop.delayMs)
    }

    // Reopening a backgrounded tab resolves to the report instead of sitting on
    // a false stalled card. One throttled read, allowed even while stalled.
    function onVisibility() {
      if (document.visibilityState !== "visible") return
      if (!shouldCatchUp(loop)) return
      if (Date.now() - lastPollAtRef.current < CATCH_UP_MIN_INTERVAL_MS) return
      if (timer) clearTimeout(timer)
      void tick()
    }

    timer = setTimeout(() => void tick(), INITIAL_POLL_DELAY_MS)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [jobId, generation, ensureRecord])

  // EFFECT 3 — elapsed. Recomputed from `startedAt` rather than incremented, so
  // it stays truthful across a refresh and across background-tab throttling.
  // The first value is scheduled rather than set inline: it has to come from the
  // record, which only exists once effects run.
  useEffect(() => {
    const record = ensureRecord()
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - record.startedAt) / 1000)))
    const first = setTimeout(update, 0)
    const ticker = setInterval(update, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(ticker)
    }
  }, [jobId, generation, ensureRecord])

  /**
   * Re-arms the polling budget. `startedAt` is deliberately preserved, so
   * "Check again" never resets the honest elapsed clock. `stalled` is
   * deliberately NOT cleared here: the card has to stay mounted for its own busy
   * label to be visible, and `tick` clears it on the next healthy answer.
   */
  const restart = useCallback((opts: { process: boolean }) => {
    const now = Date.now()
    const storage = pollStorage()
    const current = readPollRecord(jobId, storage, now)
    const next: ScanPollRecord = {
      startedAt: current.startedAt,
      budgetStartedAt: now,
      lastProcessAt: opts.process ? now : current.lastProcessAt,
      lastPollAt: now,
    }
    writePollRecord(jobId, storage, next)
    recordRef.current = { jobId, record: next }
    setGeneration((value) => value + 1)
  }, [jobId])

  const checkAgain = useCallback(() => {
    setChecking(true)
    restart({ process: false })
  }, [restart])

  // The POST runs the scan inline (maxDuration = 300) and can hold the
  // connection for minutes, so it is fire-and-forget with a busy flag; polling
  // stays the source of truth and the response body is never read.
  const resume = useCallback(() => {
    setResuming(true)
    void postProcess().finally(() => setResuming(false))
    restart({ process: true })
  }, [postProcess, restart])

  const reportHref = status.shareSlug ? `/${locale}/r/${status.shareSlug}` : null

  useEffect(() => {
    if (!reportHref) return
    if (status.status !== "done" && status.status !== "partial") return
    const timer = setTimeout(() => router.push(reportHref), REPORT_REDIRECT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [reportHref, router, status.status])

  const view = scanViewState({ status: status.status, stalledReason: stalled })
  const base = collectorPhases(status.processingStage, status.status, status.moduleStates)
  const phases = view === "stalled" ? stallCollectorPhases(base) : base

  return (
    <PublicPageFrame locale={locale}>
      <main className="scanning-page">
        <div className="scan-status-hero">
          <div className="scan-pulse" aria-hidden="true">
            <ScanSearch />
          </div>
          <Badge variant="outline">
            {c.reference} · {scanReference(jobId)}
          </Badge>
          <h1>{c.title}</h1>
          <p>{c.body}</p>
          <div className="scan-progress-summary">
            <Progress value={progressPercent(index)} aria-label={interpolate(c.progress, { done: index })} />
            <span>{interpolate(c.progress, { done: index })}</span>
            <span>{elapsed < 60 ? interpolate(c.elapsed, { seconds: elapsed }) : interpolate(c.elapsedMinutes, formatElapsed(elapsed))}</span>
          </div>
        </div>

        <div className="collector-list" aria-live="polite" aria-label={c.title}>
          {COLLECTOR_KEYS.map((key) => {
            const phase = phases[key]
            const Icon = PHASE_ICON[phase]
            return (
              <article key={key}>
                <span className={`collector-icon ${PHASE_ICON_CLASS[phase]}`}>
                  <Icon />
                </span>
                <div>
                  <h2>{c.collectors[key]}</h2>
                  <p>{c.phase[phase]}</p>
                </div>
                <ProviderBadge state={PHASE_PROVIDER_STATE[phase]} locale={locale} />
              </article>
            )
          })}
        </div>

        {/* `reportHref &&` stays: readyBody promises an automatic redirect that
            the redirect effect cannot perform without a slug. */}
        {reportHref && view === "ready" && (
          <div className="partial-result-card">
            <div>
              <FactType type="Observed" />
              <h2>{c.readyTitle}</h2>
              <p>{c.readyBody}</p>
              {coveragePercent(status.coverage) != null && <small>{interpolate(c.coverageLine, { coverage: coveragePercent(status.coverage)! })}</small>}
            </div>
            <Button asChild>
              <Link href={reportHref}>
                {c.readyButton} <ArrowRight />
              </Link>
            </Button>
          </div>
        )}

        {/* We stopped asking; we did not learn that anything failed. The action
            row uses Tailwind utilities rather than a new semantic class, and the
            card reuses .partial-result-card so no new CSS rule is needed. */}
        {view === "stalled" && stalled && (
          <div className="partial-result-card" role="status">
            <div>
              <FactType type="Unknown" />
              <h2>{c.stalledTitle}</h2>
              <p>{c.stalledBody}</p>
              <small>
                {`${stalled === "timeout" ? interpolate(c.stalledReason.timeout, { minutes: MAX_POLL_DURATION_MS / 60_000 }) : c.stalledReason[stalled]} ${interpolate(c.stalledResumeNote, { minutes: SCAN_RECLAIM_WINDOW_MINUTES })}`}
              </small>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={checkAgain} disabled={checking}>
                <RefreshCw /> {checking ? c.stalledChecking : c.stalledCheck}
              </Button>
              {stalled === "missing" ? (
                <Button variant="outline" asChild>
                  <Link href={`/${locale}/scan`}>
                    {c.retry} <ArrowRight />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" onClick={resume} disabled={resuming}>
                  {resuming ? c.stalledResuming : c.stalledResume}
                </Button>
              )}
            </div>
          </div>
        )}

        {view === "failed" && (
          <div className="partial-result-card">
            <div>
              <FactType type="Unknown" />
              <h2>{c.failedTitle}</h2>
              <p>{c.failedBody}</p>
              {status.failureCorrelationId && <small>{interpolate(c.failedReference, { reference: status.failureCorrelationId })}</small>}
            </div>
            <Button asChild>
              <Link href={`/${locale}/scan`}>
                {c.retry} <ArrowRight />
              </Link>
            </Button>
          </div>
        )}

        <div className="recovery-grid">
          <SectionCard>
            <Link2 />
            <h2>{c.recoveryTitle}</h2>
            <p>{c.recoveryBody}</p>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href)
                setCopied(true)
              }}
            >
              {copied ? c.copied : c.copyLink}
            </Button>
          </SectionCard>
          <SectionCard>
            <RefreshCw />
            <h2>{c.backgroundTitle}</h2>
            <p>{c.backgroundBody}</p>
            <span className="step-kicker">{index} / {SCAN_STAGE_COUNT}</span>
          </SectionCard>
        </div>
      </main>
    </PublicPageFrame>
  )
}
