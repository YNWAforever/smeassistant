"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { CheckCircle2, LoaderCircle, RefreshCw, Send, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { INSTAGRAM_PUBLISH_REASON_KEYS, type InstagramPublishReasonKey } from "@/lib/copy-workspace-keys"
import { INSTAGRAM_CAPTION_MAX_CHARS, isPublicHttpsImageUrl } from "@/lib/publishing/instagram-eligibility"
import type { InstagramPublishPanel, InstagramPublishPanelDelivery } from "@/lib/publishing/page-state"
import { RECONCILE_AFTER_MS } from "@/lib/publishing/timing"
import { formatDateTime } from "@/lib/workspace/format"

/**
 * P20.2c: the Instagram part of the action detail delivery card.
 *
 * Mirrors the server's authority (`panel.canPublish`) and never decides it.
 * Shows the latest Instagram publish delivery of the selected version:
 * published (verified time), uncertain ("Check status"; the same reconcile the
 * page runs automatically once per load) or failed (reason copy).
 *
 * The caption is the immutable approved version text, so it is only shown,
 * never edited. The image is an owner-supplied public HTTPS URL; the card
 * validates it for feedback, and the route validates it again before Meta is
 * called. Every mutation is followed by `onChanged` (router.refresh()); nothing
 * is counted or shown optimistically.
 *
 * Idempotency: one key per dialog opening, reused for a retry of the same
 * image after a network error or an unreadable answer; a new key whenever the
 * image URL changes or a publish reaches a terminal state, because the route
 * answers a replayed key with the earlier delivery's result.
 */
export interface InstagramPublishCardProps {
  locale: PrototypeLocale
  versionId: string
  versionNo: number
  body: string
  /** The selected version is approved and has no unsaved edits. */
  approved: boolean
  panel: InstagramPublishPanel
  workspaceSlug: string
  timezone: string
  onChanged: () => void
}

type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string }
type PublishAnswer = { deliveryId: string; state: InstagramPublishPanelDelivery["state"]; counted: boolean; reason?: string }
type ReconcileAnswer = { state: InstagramPublishPanelDelivery["state"]; reason?: string; settledNow?: boolean }

const KNOWN_REASONS: ReadonlySet<string> = new Set(INSTAGRAM_PUBLISH_REASON_KEYS)
/** Publish refusals that mean the page shows a stale state; refreshing shows the real one. */
const STALE_PAGE_ERRORS: ReadonlySet<string> = new Set(["already_publishing", "target_busy", "version_changed"])

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
function reasonKey(error: string | null | undefined, status = 200): InstagramPublishReasonKey {
  if (error && KNOWN_REASONS.has(error)) return error as InstagramPublishReasonKey
  if (status === 403) return "forbidden"
  if (status === 429) return "rate_limited"
  if (status === 503) return "unavailable"
  return "generic"
}

function latestFor(deliveries: InstagramPublishPanelDelivery[], versionId: string): InstagramPublishPanelDelivery | null {
  let latest: InstagramPublishPanelDelivery | null = null
  for (const delivery of deliveries) {
    if (delivery.versionId !== versionId) continue
    if (!latest || Date.parse(delivery.createdAt) >= Date.parse(latest.createdAt)) latest = delivery
  }
  return latest
}

export function InstagramPublishCard({ locale, versionId, versionNo, body, approved, panel, workspaceSlug, timezone, onChanged }: InstagramPublishCardProps) {
  const t = copy[locale].workspace.instagramPublish
  const integrationsHref = `/${locale}/owner/${workspaceSlug}/settings/integrations`

  const [open, setOpen] = useState(false)
  const [imageUrl, setImageUrl] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [key, setKey] = useState<string>("")
  const [busy, setBusy] = useState<null | "publish" | "reconcile">(null)
  const [dialogError, setDialogError] = useState<InstagramPublishReasonKey | null>(null)
  const [notice, setNotice] = useState<InstagramPublishReasonKey | null>(null)

  // Spec parity with the Google card: once per page load, settle each
  // uncertain row old enough to read back.
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
    void Promise.all(due.map((delivery) => postJson<ReconcileAnswer>(`/api/deliveries/${delivery.id}/reconcile-instagram`, {}))).then(() => onChanged())
  }, [panel.deliveries, onChanged])

  const latest = latestFor(panel.deliveries, versionId)
  const active = latest !== null && (latest.state === "publishing" || latest.state === "published")
  const captionLength = Array.from(body).length
  const captionOk = captionLength > 0 && captionLength <= INSTAGRAM_CAPTION_MAX_CHARS
  const imageOk = isPublicHttpsImageUrl(imageUrl)
  const showPublish = panel.canPublish && approved && !active
  const connectionMissing = panel.enabled && approved && !panel.connectionActive && !active
  const noPermission = panel.enabled && approved && panel.connectionActive && !panel.mayAct && !active

  if (!latest && !showPublish && !connectionMissing && !noPermission) return null

  function openDialog(next: boolean) {
    setOpen(next)
    if (!next) return
    setKey(mintKey())
    setConfirmed(false)
    setDialogError(null)
    setNotice(null)
  }

  function changeImage(next: string) {
    setImageUrl(next)
    // A replayed key answers with the earlier delivery, whatever image it used.
    setKey(mintKey())
    setConfirmed(false)
    setDialogError(null)
  }

  async function publish() {
    if (!imageOk || !captionOk || !confirmed || busy) return
    setBusy("publish")
    setDialogError(null)
    const result = await postJson<PublishAnswer>(`/api/versions/${versionId}/publish-instagram`, {
      imageUrl,
      idempotencyKey: key,
      confirmVersionNo: versionNo,
    })
    setBusy(null)
    if (!result.ok) {
      // A dropped answer may still have begun a delivery: keep the key so a retry replays it.
      if (result.error === "idempotency_key_conflict") setKey(mintKey())
      setDialogError(result.error === "network" ? "network" : reasonKey(result.error, result.status))
      // The page state is out of date: another publish began, or a newer version exists.
      if (STALE_PAGE_ERRORS.has(result.error)) onChanged()
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
    const result = await postJson<ReconcileAnswer>(`/api/deliveries/${deliveryId}/reconcile-instagram`, {})
    setBusy(null)
    if (!result.ok) {
      setNotice(result.error === "network" ? "network" : reasonKey(result.error, result.status))
      return
    }
    // Still uncertain (ambiguous, or Instagram has not finished): the card
    // already says nothing is resent; a known refusal gets its own copy.
    if (result.data.state === "publishing") {
      if (result.data.reason && KNOWN_REASONS.has(result.data.reason) && result.data.reason !== "too_soon") setNotice(reasonKey(result.data.reason))
      return
    }
    onChanged()
  }

  return (
    <div className="field-stack" data-testid="instagram-publish-card">
      {latest?.state === "published" && (
        <div className="approved-state">
          <CheckCircle2 />
          <div>
            <strong>{t.publishedTitle}</strong>
            {latest.verifiedAt && <span>{t.verifiedAt.replace("{time}", formatDateTime(latest.verifiedAt, locale, timezone))}</span>}
          </div>
        </div>
      )}
      {latest?.state === "publishing" && (
        <div className="conflict-state">
          <ShieldAlert />
          <div>
            <strong>{t.uncertainTitle}</strong>
            <p>{t.uncertainBody}</p>
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void reconcile(latest.id)}>
              {busy === "reconcile" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} {busy === "reconcile" ? t.checking : t.checkStatus}
            </Button>
          </div>
        </div>
      )}
      {latest?.state === "failed" && (
        <div className="conflict-state">
          <ShieldAlert />
          <div>
            <strong>{t.failedTitle}</strong>
            <p>{t.reasons[reasonKey(latest.reason)]}</p>
          </div>
        </div>
      )}
      {notice && <p className="limitation-note" role="status">{t.reasons[notice]}</p>}

      {connectionMissing && (
        <p className="limitation-note">
          {t.reasons.connection_missing}
          {panel.mayAct && <> <Link href={integrationsHref}>{t.connectInstagram}</Link></>}
        </p>
      )}
      {noPermission && <p className="limitation-note">{t.noPermission}</p>}

      {showPublish && (
        <Dialog open={open} onOpenChange={openDialog}>
          <DialogTrigger asChild>
            <Button className="w-full" variant="outline"><Send /> {t.publishButton}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.dialogTitle}</DialogTitle>
              <DialogDescription>{t.dialogDescription}</DialogDescription>
            </DialogHeader>
            <div className="field-stack">
              <Label htmlFor="instagram-publish-image">{t.imageUrlLabel}</Label>
              <Input
                id="instagram-publish-image"
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={imageUrl}
                disabled={busy !== null}
                onChange={(event) => changeImage(event.target.value)}
              />
              <small>{t.imageUrlHint}</small>
              {imageUrl !== "" && !imageOk && <p className="limitation-note" role="alert">{t.reasons.invalid_image_url}</p>}
            </div>
            <div className="field-stack">
              <Label htmlFor="instagram-publish-caption">{t.captionLabel}</Label>
              <Textarea id="instagram-publish-caption" value={body} readOnly rows={6} />
              <small>{t.captionCount.replace("{n}", String(captionLength))}</small>
              {!captionOk && <p className="limitation-note" role="alert">{t.reasons[captionLength === 0 ? "empty_caption" : "caption_too_long"]}</p>}
            </div>
            <Label className="consent-row" htmlFor="instagram-publish-confirm">
              <Checkbox id="instagram-publish-confirm" checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} />
              <span>{t.confirm}</span>
            </Label>
            {dialogError && <p className="limitation-note" role="alert">{t.reasons[dialogError]}</p>}
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">{t.cancel}</Button></DialogClose>
              <Button disabled={!imageOk || !captionOk || !confirmed || busy !== null} onClick={() => void publish()}>
                {busy === "publish" ? <><LoaderCircle className="animate-spin" /> {t.publishingNow}</> : <><Send /> {t.publishConfirm}</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
