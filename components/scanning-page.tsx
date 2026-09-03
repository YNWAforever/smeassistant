"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowRight, Check, CircleAlert, Link2, RefreshCw, ScanSearch } from "lucide-react"

import { FactType, ProviderBadge, PublicPageFrame, SectionCard } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { ProviderState } from "@/lib/demo-data"
import {
  COLLECTOR_KEYS,
  INITIAL_POLL_DELAY_MS,
  REPORT_REDIRECT_DELAY_MS,
  SCAN_STAGE_COUNT,
  collectorPhases,
  isTerminalStatus,
  nextPollDelay,
  progressPercent,
  scanReference,
  stageIndex,
  type CollectorPhase,
  type ScanStatusResponse,
} from "@/lib/funnel/scan-progress"
import { interpolate } from "@/lib/share"

const PHASE_PROVIDER_STATE: Record<CollectorPhase, ProviderState> = {
  pending: "pending",
  running: "pending",
  done: "measured",
  collected: "measured",
  failed: "failed",
}

const PHASE_ICON_CLASS: Record<CollectorPhase, string> = {
  pending: "collector-pending",
  running: "collector-pending",
  done: "collector-measured",
  collected: "collector-measured",
  failed: "collector-unavailable",
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

  // The queued job is claimed exactly once; the response is irrelevant here
  // (the poll below is the single source of truth) and a failure must not break
  // the page — the worker hand-off may already have picked the job up.
  useEffect(() => {
    void fetch("/api/scan/process", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jobId }),
    }).catch(() => undefined)
  }, [jobId])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let delay = INITIAL_POLL_DELAY_MS

    async function poll() {
      try {
        const response = await fetch(`/api/scan/status?jobId=${encodeURIComponent(jobId)}`, { headers: { accept: "application/json" } })
        const data = (await response.json().catch(() => null)) as ScanStatusResponse | null
        if (cancelled) return
        if (data && typeof data.status === "string") {
          setStatus(data)
          setIndex((furthest) => Math.max(furthest, stageIndex(data.processingStage, data.status)))
          if (isTerminalStatus(data.status)) return
        }
      } catch {
        if (cancelled) return
      }
      delay = nextPollDelay(delay)
      timer = setTimeout(() => void poll(), delay)
    }

    timer = setTimeout(() => void poll(), INITIAL_POLL_DELAY_MS)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [jobId])

  useEffect(() => {
    const ticker = setInterval(() => setElapsed((seconds) => seconds + 1), 1000)
    return () => clearInterval(ticker)
  }, [])

  const reportHref = status.shareSlug ? `/${locale}/r/${status.shareSlug}` : null

  useEffect(() => {
    if (!reportHref) return
    if (status.status !== "done" && status.status !== "partial") return
    const timer = setTimeout(() => router.push(reportHref), REPORT_REDIRECT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [reportHref, router, status.status])

  const phases = collectorPhases(status.processingStage, status.status)
  const failed = status.status === "failed"

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
            <span>{interpolate(c.elapsed, { seconds: elapsed })}</span>
          </div>
        </div>

        <div className="collector-list" aria-live="polite" aria-label={c.title}>
          {COLLECTOR_KEYS.map((key) => {
            const phase = phases[key]
            return (
              <article key={key}>
                <span className={`collector-icon ${PHASE_ICON_CLASS[phase]}`}>
                  {phase === "done" || phase === "collected" ? <Check /> : phase === "failed" ? <CircleAlert /> : <RefreshCw />}
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

        {reportHref && (status.status === "done" || status.status === "partial") && (
          <div className="partial-result-card">
            <div>
              <FactType type="Observed" />
              <h2>{c.readyTitle}</h2>
              <p>{c.readyBody}</p>
              {status.coverage != null && <small>{interpolate(c.coverageLine, { coverage: status.coverage })}</small>}
            </div>
            <Button asChild>
              <Link href={reportHref}>
                {c.readyButton} <ArrowRight />
              </Link>
            </Button>
          </div>
        )}

        {failed && (
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
