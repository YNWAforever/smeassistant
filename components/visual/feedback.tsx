"use client"

import { Check, Copy, Download } from "lucide-react"
import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"

import { useCountUp } from "./motion"

/**
 * These components only show feedback for a result the caller already has
 * from the server. None of them approves, exports or counts anything.
 */

/** Check that draws itself when `play` turns on (after a successful approval). */
export function ApprovedCheck({ play = false, locale }: { play?: boolean; locale: PrototypeLocale }) {
  return (
    <span className={`k-approved inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold${play ? " k-scale-in" : ""}`}>
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
        <circle cx="8" cy="8" r="7" className="k-approved-ring" />
        <path d="M4.5 8.2l2.3 2.3 4.7-5" pathLength={1} className={`k-check-path k-approved-tick${play ? " k-check-draw" : ""}`} />
      </svg>
      {copy[locale].ui.visual.feedback.approved}
    </span>
  )
}

type ActionState = "idle" | "busy" | "done"

/**
 * Copy or export button that turns into a check on success and raises a
 * toast. `onAction` does the work (clipboard write, the export request) and
 * resolves true on success. Both labels share one grid cell, so the button
 * never changes width.
 */
export function CopyExportButton({ mode, onAction, locale, className }: { mode: "copy" | "export"; onAction: () => Promise<boolean> | boolean; locale: PrototypeLocale; className?: string }) {
  const t = copy[locale].ui.visual.feedback
  const [state, setState] = useState<ActionState>("idle")
  useEffect(() => {
    if (state !== "done") return
    const timer = setTimeout(() => setState("idle"), 2000)
    return () => clearTimeout(timer)
  }, [state])
  const run = async () => {
    if (state === "busy") return
    setState("busy")
    let ok = false
    try { ok = await onAction() } catch { ok = false }
    setState(ok ? "done" : "idle")
    if (ok) toast.success(mode === "copy" ? t.copiedToast : t.exportedToast)
    else toast.error(t.failed)
  }
  const Icon = mode === "copy" ? Copy : Download
  const idle = mode === "copy" ? t.copy : t.export
  const done = mode === "copy" ? t.copied : t.exported
  return (
    <Button type="button" variant="outline" className={`min-h-11 ${className ?? ""}`} onClick={run} disabled={state === "busy"} data-state={state}>
      <span className="grid">
        <span className="k-morph col-start-1 row-start-1 inline-flex items-center gap-2" style={{ opacity: state === "done" ? 0 : 1 }} aria-hidden={state === "done"}>
          <Icon aria-hidden="true" />{state === "busy" ? t.working : idle}
        </span>
        <span className="k-morph col-start-1 row-start-1 inline-flex items-center gap-2" style={{ opacity: state === "done" ? 1 : 0, transform: state === "done" ? "none" : "scale(0.9)" }} aria-hidden={state !== "done"}>
          <Check aria-hidden="true" />{done}
        </span>
      </span>
    </Button>
  )
}

/**
 * Approved deliveries this month (guardrail 7: deliveries, not tokens, are
 * the unit). The number counts up and a "Delivery counted" note appears when
 * `used` goes up; an unlimited plan shows the count without a bar.
 */
export function UsageMeter({ used, allowance, locale }: { used: number; allowance: number | null; locale: PrototypeLocale }) {
  const t = copy[locale].ui.visual.feedback
  const shown = Math.round(useCountUp(used, { duration: 300 }))
  const [previous, setPrevious] = useState(used)
  const [counted, setCounted] = useState(false)
  if (used !== previous) {
    setPrevious(used)
    setCounted(used > previous)
  }
  const label = allowance === null ? fill(t.usageUnlimited, { used }) : fill(t.usage, { used, allowance })
  const visible = allowance === null ? fill(t.usageUnlimited, { used: shown }) : fill(t.usage, { used: shown, allowance })
  return (
    <div className="k-usage grid gap-1.5">
      <p className="text-sm text-ink tabular-nums" aria-hidden="true">{visible}</p>
      {allowance !== null && (
        <div className="k-usage-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={allowance} aria-valuenow={Math.min(used, allowance)}>
          <span className="k-progress-bar k-usage-fill" data-full={used >= allowance ? "" : undefined} style={{ "--progress": allowance > 0 ? Math.min(1, used / allowance) : 1 } as CSSProperties} />
        </div>
      )}
      {allowance === null && <span className="sr-only">{label}</span>}
      <span className="min-h-5 text-xs" role="status">
        {counted && <span key={used} className="k-fade-up k-usage-counted inline-flex items-center gap-1 font-semibold"><Check aria-hidden="true" className="size-3.5" />{t.counted}</span>}
      </span>
    </div>
  )
}

const FIRST_APPROVAL_PREFIX = "kinnso-first-approval:"
const firstApprovalCache = new Map<string, "show" | "seen">()
const noSubscribe = () => () => {}

/** Reads (and marks) "seen" once per browser and workspace; per-viewer convenience only. */
function firstApprovalSnapshot(key: string | null): "show" | "seen" {
  if (!key) return "seen"
  const cached = firstApprovalCache.get(key)
  if (cached) return cached
  let seen = true
  try {
    seen = window.localStorage.getItem(FIRST_APPROVAL_PREFIX + key) !== null
    if (!seen) window.localStorage.setItem(FIRST_APPROVAL_PREFIX + key, new Date().toISOString())
  } catch {
    seen = true
  }
  firstApprovalCache.set(key, seen ? "seen" : "show")
  return seen ? "seen" : "show"
}

/**
 * One subtle pulse around the owner's first approved action, shown once per
 * workspace in this browser. `active` is the caller's server-backed fact
 * that this is the first approval.
 */
export function FirstApprovalPulse({ active, storageKey, children, locale }: { active: boolean; storageKey: string; children: ReactNode; locale: PrototypeLocale }) {
  const key = active ? storageKey : null
  const state = useSyncExternalStore(noSubscribe, () => firstApprovalSnapshot(key), () => "seen" as const)
  useEffect(() => () => { if (key) firstApprovalCache.set(key, "seen") }, [key])
  if (state !== "show") return <>{children}</>
  return (
    <div className="k-first relative">
      <span className="k-first-ring k-pulse-once pointer-events-none absolute -inset-1 rounded-[inherit]" aria-hidden="true" />
      {children}
      <span className="k-fade-up k-first-note mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" role="status">
        {copy[locale].ui.visual.feedback.firstApproval}
      </span>
    </div>
  )
}
