"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { CheckCircle2, LoaderCircle, RefreshCw, Send, ShieldAlert, Trash2 } from "lucide-react"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { PUBLISH_REASON_KEYS, type PublishReasonKey } from "@/lib/copy-workspace"
import type { GbpReviewTarget } from "@/lib/oauth/google-reviews"
import type { PublishPanel, PublishPanelDelivery } from "@/lib/publishing/page-state"
import { formatDateTime } from "@/lib/workspace/format"

/**
 * P4.6 spec §4: the Google publish part of the action detail delivery card.
 *
 * Mirrors the server's authority (`panel.canPublish`, `panel.canDelete`) and
 * never decides it. Shows the latest publish delivery of the selected version:
 * published (verified time; owner-only delete behind a confirmation),
 * uncertain ("Check on Google"), failed (reason copy) or deleted.
 *
 * Idempotency: one key per dialog opening, reused for a retry of the same
 * review after a network error or an unreadable answer; a new key whenever the
 * selected review changes or a publish reaches a terminal state, because the
 * route answers a replayed key with the earlier delivery's result.
 *
 * Every mutation is followed by `onChanged` (router.refresh()); nothing is
 * counted or shown optimistically.
 */
export interface GbpPublishCardProps {
  locale: PrototypeLocale
  versionId: string
  versionNo: number
  body: string
  /** The selected version is approved and has no unsaved edits. */
  approved: boolean
  panel: PublishPanel
  workspaceSlug: string
  timezone: string
  onChanged: () => void
}

type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string }
type PublishAnswer = { deliveryId: string; state: PublishPanelDelivery["state"]; counted: boolean; reason?: string }
type TargetsAnswer = { targets: GbpReviewTarget[]; preselected: string | null }

const RECONCILE_AFTER_MS = 15_000
const KNOWN_REASONS: ReadonlySet<string> = new Set(PUBLISH_REASON_KEYS)

const mintKey = () => crypto.randomUUID().replaceAll("-", "")

async function call<T>(url: string, init: RequestInit = {}): Promise<Result<T>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, status: 0, error: "network" }
  let response: Response
  try {
    response = await fetch(url, { credentials: "same-origin", ...init })
  } catch {
    return { ok: false, status: 0, error: "network" }
  }
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  const error = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : null
  if (!response.ok) return { ok: false, status: response.status, error: error ?? `http_${response.status}` }
  // A 200 without a readable body is as uncertain as a dropped connection.
  if (body === null) return { ok: false, status: 0, error: "network" }
  return { ok: true, data: body as T }
}

const postJson = <T,>(url: string, payload: unknown) =>
  call<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })

/** A route error or a stored reason as owner-facing copy; never the raw code. */
function reasonKey(error: string | null | undefined, status = 200): PublishReasonKey {
  if (error && KNOWN_REASONS.has(error)) return error as PublishReasonKey
  if (status === 403) return "forbidden"
  if (status === 429) return "rate_limited"
  if (status === 503) return "unavailable"
  return "generic"
}

function latestFor(deliveries: PublishPanelDelivery[], versionId: string): PublishPanelDelivery | null {
  let latest: PublishPanelDelivery | null = null
  for (const delivery of deliveries) {
    if (delivery.versionId !== versionId) continue
    if (!latest || Date.parse(delivery.createdAt) >= Date.parse(latest.createdAt)) latest = delivery
  }
  return latest
}

function Stars({ rating, label }: { rating: GbpReviewTarget["starRating"]; label: string }) {
  if (rating === null) return <span>{label}</span>
  return <span role="img" aria-label={label}>{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span>
}

export function GbpPublishCard({ locale, versionId, versionNo, body, approved, panel, workspaceSlug, timezone, onChanged }: GbpPublishCardProps) {
  const t = copy[locale].workspace.publish
  const integrationsHref = `/${locale}/owner/${workspaceSlug}/settings/integrations`

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [targets, setTargets] = useState<GbpReviewTarget[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [key, setKey] = useState<string>("")
  const [busy, setBusy] = useState<null | "publish" | "reconcile" | "delete">(null)
  const [dialogError, setDialogError] = useState<PublishReasonKey | null>(null)
  const [notice, setNotice] = useState<PublishReasonKey | null>(null)

  // Spec §3.3: once per page load, settle each uncertain row old enough to read back.
  const reconciled = useRef<Set<string>>(new Set())
  useEffect(() => {
    const due = panel.deliveries.filter(
      (delivery) =>
        delivery.state === "publishing" &&
        !reconciled.current.has(delivery.id) &&
        Date.now() - Date.parse(delivery.createdAt) > RECONCILE_AFTER_MS,
    )
    if (due.length === 0) return
    for (const delivery of due) reconciled.current.add(delivery.id)
    void Promise.all(due.map((delivery) => postJson<PublishAnswer>(`/api/deliveries/${delivery.id}/reconcile`, {}))).then(() => onChanged())
  }, [panel.deliveries, onChanged])

  const latest = latestFor(panel.deliveries, versionId)
  const active = latest !== null && (latest.state === "publishing" || latest.state === "published")
  const showPublish = panel.canPublish && approved && !active
  const blocked = panel.enabled && approved && !panel.eligibility.ok && !active
    ? panel.eligibility.reason
    : null
  const blockedReason = blocked === "flag_off" || blocked === "not_review_response" || blocked === "not_approved" ? null : blocked
  const noPermission = panel.enabled && approved && panel.eligibility.ok && !panel.canPublish && !active

  if (!latest && !showPublish && !blockedReason && !noPermission) return null

  async function openDialog(next: boolean) {
    setOpen(next)
    if (!next) return
    setKey(mintKey())
    setTargets(null)
    setSelected(null)
    setConfirmed(false)
    setDialogError(null)
    setLoading(true)
    const result = await call<TargetsAnswer>(`/api/versions/${versionId}/publish/targets`)
    setLoading(false)
    if (!result.ok) {
      setDialogError(result.error === "network" ? "network" : reasonKey(result.error, result.status))
      return
    }
    setTargets(result.data.targets)
    const preselected = result.data.preselected
    setSelected(preselected && result.data.targets.some((target) => target.reviewName === preselected) ? preselected : null)
  }

  function choose(reviewName: string) {
    if (reviewName === selected) return
    setSelected(reviewName)
    // A replayed key answers with the earlier delivery, whatever review it named.
    setKey(mintKey())
    setDialogError(null)
  }

  async function publish() {
    if (!selected || !confirmed || busy) return
    setBusy("publish")
    setDialogError(null)
    const result = await postJson<PublishAnswer>(`/api/versions/${versionId}/publish`, {
      reviewName: selected,
      idempotencyKey: key,
      confirmVersionNo: versionNo,
    })
    setBusy(null)
    if (!result.ok) {
      // A dropped answer may still have begun a delivery: keep the key so a retry replays it.
      if (result.error === "idempotency_key_conflict") setKey(mintKey())
      setDialogError(result.error === "network" ? "network" : reasonKey(result.error, result.status))
      return
    }
    if (result.data.state === "failed") {
      setKey(mintKey())
      setDialogError(reasonKey(result.data.reason))
      onChanged()
      return
    }
    if (result.data.state === "published") setKey(mintKey())
    setOpen(false)
    onChanged()
  }

  async function reconcile(deliveryId: string) {
    setBusy("reconcile")
    setNotice(null)
    const result = await postJson<PublishAnswer>(`/api/deliveries/${deliveryId}/reconcile`, {})
    setBusy(null)
    if (!result.ok) {
      setNotice(result.error === "network" ? "network" : reasonKey(result.error, result.status))
      return
    }
    if (result.data.state === "publishing") {
      setNotice(reasonKey(result.data.reason))
      return
    }
    onChanged()
  }

  async function deleteReply(deliveryId: string) {
    setBusy("delete")
    setNotice(null)
    const result = await call<{ state: "cancelled" }>(`/api/deliveries/${deliveryId}/reply`, { method: "DELETE" })
    setBusy(null)
    if (!result.ok) {
      setNotice(result.error === "network" ? "network" : reasonKey(result.error, result.status))
      return
    }
    onChanged()
  }

  return (
    <div className="field-stack">
      {latest?.state === "published" && (
        <div className="approved-state">
          <CheckCircle2 />
          <div>
            <strong>{t.state.published}</strong>
            {latest.verifiedAt && <span>{t.verifiedAt.replace("{time}", formatDateTime(latest.verifiedAt, locale, timezone))}</span>}
          </div>
        </div>
      )}
      {latest?.state === "published" && panel.canDelete && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="w-full" variant="ghost" disabled={busy !== null}>
              {busy === "delete" ? <LoaderCircle className="animate-spin" /> : <Trash2 />} {t.deleteReply}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
              <AlertDialogDescription>{t.deleteConfirm}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void deleteReply(latest.id)}>{t.deleteReply}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {latest?.state === "publishing" && (
        <div className="conflict-state">
          <ShieldAlert />
          <div>
            <strong>{t.uncertainTitle}</strong>
            <p>{t.state.publishing}</p>
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void reconcile(latest.id)}>
              {busy === "reconcile" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} {t.checkOnGoogle}
            </Button>
          </div>
        </div>
      )}
      {latest?.state === "failed" && (
        <div className="conflict-state">
          <ShieldAlert />
          <div>
            <strong>{t.state.failed}</strong>
            <p>{t.reasons[reasonKey(latest.reason)]}</p>
          </div>
        </div>
      )}
      {latest?.state === "cancelled" && (
        <div className="idempotent-state">
          <Trash2 />
          <div>
            <strong>{t.state.cancelled}</strong>
          </div>
        </div>
      )}
      {notice && <p className="limitation-note" role="status">{t.reasons[notice]}</p>}

      {blockedReason && (
        <p className="limitation-note">
          {t.reasons[blockedReason]}
          {blockedReason === "connection_missing" && (
            <>
              {" "}
              <Link href={integrationsHref}>{t.connectGoogle}</Link>
            </>
          )}
        </p>
      )}
      {noPermission && <p className="limitation-note">{t.noPermission}</p>}

      {showPublish && (
        <Dialog open={open} onOpenChange={(next) => void openDialog(next)}>
          <DialogTrigger asChild>
            <Button className="w-full" variant="outline"><Send /> {t.publishButton}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.dialogTitle}</DialogTitle>
              <DialogDescription>{t.dialogDescription}</DialogDescription>
            </DialogHeader>
            {loading ? (
              <p className="limitation-note"><LoaderCircle className="animate-spin" /> {t.loadingTargets}</p>
            ) : targets && targets.length === 0 ? (
              <p className="limitation-note">{t.noTargets}</p>
            ) : targets ? (
              <div className="field-stack">
                <Label id="gbp-publish-targets-label">{t.pickReview}</Label>
                <RadioGroup value={selected ?? ""} onValueChange={choose} aria-labelledby="gbp-publish-targets-label">
                  {targets.map((target, index) => (
                    <Label className="consent-row" key={target.reviewName} htmlFor={`gbp-publish-target-${index}`}>
                      <RadioGroupItem id={`gbp-publish-target-${index}`} value={target.reviewName} />
                      <span>
                        <strong>
                          <Stars rating={target.starRating} label={target.starRating === null ? t.noRating : t.stars.replace("{n}", String(target.starRating))} />
                          {" · "}{target.reviewer}{" · "}{formatDateTime(target.createTime, locale, timezone, "date")}
                        </strong>
                        <small>{target.excerpt}</small>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            ) : null}
            <div className="field-stack">
              <Label htmlFor="gbp-publish-body">{t.versionLabel.replace("{n}", String(versionNo))}</Label>
              <Textarea id="gbp-publish-body" value={body} readOnly rows={5} />
            </div>
            <Label className="consent-row" htmlFor="gbp-publish-confirm">
              <Checkbox id="gbp-publish-confirm" checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} />
              <span>{t.confirm}</span>
            </Label>
            {dialogError && <p className="limitation-note" role="alert">{t.reasons[dialogError]}</p>}
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">{t.cancel}</Button></DialogClose>
              <Button disabled={!selected || !confirmed || busy !== null} onClick={() => void publish()}>
                {busy === "publish" ? <><LoaderCircle className="animate-spin" /> {t.publishingNow}</> : <><Send /> {t.publishConfirm}</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
