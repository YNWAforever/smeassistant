"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Archive, BadgeCheck, Camera, CopyPlus, LoaderCircle, PencilLine, ShieldAlert, WandSparkles } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { CapabilityBadge, PageIntro, SectionCard } from "@/components/product-ui"
import { OfferForm } from "@/components/workspace/offer-form"
import { offerFormFrom } from "@/lib/offers/form"
import type { PrototypeLocale } from "@/lib/copy"
import { t } from "@/lib/i18n"
import { archiveOffer, confirmOffer, prepareDrafts } from "@/lib/offers/client"
import type { OfferChannelState, OfferPhoto } from "@/lib/offers/pages"
import type { OfferView } from "@/lib/offers/view"
import type { OfferTemplateKey } from "@/lib/offers/workflow"
import { runAction } from "@/lib/workspace/client"

/**
 * One offer (spec §5.1–§5.2): its facts, confirm / edit / archive, and the
 * Prepare drafts panel. The delivery notice sits before the button. Prepare
 * only creates the actions; each draft is then run one at a time through the
 * ordinary run route, so a failed channel is retried alone.
 */
type RowStatus = "idle" | "drafting" | "ready" | "needs_input" | "failed" | "budget"

export interface OfferDetailProps {
  locale: PrototypeLocale
  workspaceId: string
  workspaceSlug: string
  market: "hk" | "tw"
  offer: OfferView
  canManage: boolean
  channels: OfferChannelState[]
  usage: { approvedDeliveries: number; allowance: number | null }
  locations: Array<{ id: string; name: string }>
  manageableLocationIds: string[] | null
  photos: OfferPhoto[]
  /** The existing photo-brief action, when one is open; the link then opens it. */
  photoBriefHref: string
}

function initialStatus(channel: OfferChannelState): RowStatus {
  const action = channel.action
  if (!action) return "idle"
  if (action.run_state === "running" || action.run_state === "queued") return "drafting"
  if (action.action_state === "needs_input") return "needs_input"
  if (action.latest_version_id) return "ready"
  if (action.run_state === "failed" || action.run_state === "timed_out") return "failed"
  return "idle"
}

export function OfferDetail({ locale, workspaceId, workspaceSlug, market, offer, canManage, channels, usage, locations, manageableLocationIds, photos, photoBriefHref }: OfferDetailProps) {
  const router = useRouter()
  const base = `/${locale}/owner/${workspaceSlug}`
  const [editing, setEditing] = useState(false)
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [busy, setBusy] = useState<null | "confirm" | "archive" | "prepare">(null)
  const [selected, setSelected] = useState<OfferTemplateKey[]>(channels.filter((c) => !c.action).map((c) => c.templateKey))
  const [rows, setRows] = useState<Record<string, { status: RowStatus; actionId: string | null; keys?: string[] }>>(
    Object.fromEntries(channels.map((c) => [c.templateKey, { status: initialStatus(c), actionId: c.action?.id ?? null }])),
  )
  const usable = offer.phase === "running" || offer.phase === "upcoming"
  const fail = (error: string) => {
    const key = `offers.errors.${error}`
    const message = t(locale, key)
    toast.error(message === key ? t(locale, "offers.errors.generic") : message)
  }

  async function confirm() {
    setBusy("confirm")
    const result = await confirmOffer(workspaceId, offer.id, offer.revision, locale)
    setBusy(null)
    if (!result.ok) return fail(result.error)
    toast.success(t(locale, "offers.confirm.done"))
    router.refresh()
  }

  async function archive() {
    setBusy("archive")
    const result = await archiveOffer(workspaceId, offer.id, locale)
    setBusy(null)
    if (!result.ok) return fail(result.error)
    router.refresh()
  }

  async function runOne(templateKey: OfferTemplateKey, actionId: string) {
    setRows((prev) => ({ ...prev, [templateKey]: { status: "drafting", actionId } }))
    const result = await runAction(actionId)
    const status: RowStatus = !result.ok
      ? result.error === "ai_budget_reached" || result.error === "ai_paused" ? "budget" : "failed"
      : result.data.state === "failed" ? "failed" : result.data.factsNeeded?.length ? "needs_input" : "ready"
    setRows((prev) => ({ ...prev, [templateKey]: { status, actionId, keys: result.ok ? result.data.factsNeeded : undefined } }))
  }

  async function prepare() {
    if (!selected.length) return
    setBusy("prepare")
    const result = await prepareDrafts(workspaceId, offer.id, selected, locale)
    if (!result.ok) {
      setBusy(null)
      return fail(result.error)
    }
    // One after another: each run is inline under its own route budget.
    for (const action of result.data.actions) {
      if (!action.created && rows[action.templateKey]?.status === "ready") continue
      await runOne(action.templateKey, action.actionId)
    }
    setBusy(null)
    router.refresh()
  }

  const n = selected.length
  const notice = usage.allowance === null
    ? t(locale, "offers.prepare.noticePaid", { n, used: usage.approvedDeliveries })
    : t(locale, "offers.prepare.notice", { n, used: usage.approvedDeliveries, allowance: usage.allowance })
  const locationName = offer.location_id ? locations.find((l) => l.id === offer.location_id)?.name ?? "—" : t(locale, "offers.row.allLocations")

  return (
    <div className="offer-detail-page">
      <PageIntro eyebrow={t(locale, `offers.status.${offer.status}`)} title={offer.title} description={`${offer.priceDisplay ?? t(locale, "offers.row.noPrice")} · ${offer.validity} · ${locationName}`} />
      <p><Link href={`${base}/offers`}>{t(locale, "offers.detail.back")}</Link> <CapabilityBadge value="Beta" /></p>
      {!canManage && <div className="permission-banner"><ShieldAlert /><div><span>{t(locale, "offers.detail.readOnly")}</span></div></div>}

      {editing && canManage ? (
        <>
          {offer.status === "confirmed" && <p className="limitation-note" role="alert"><ShieldAlert /> {t(locale, "offers.detail.editWarning")}</p>}
          <OfferForm locale={locale} workspaceId={workspaceId} workspaceSlug={workspaceSlug} market={market} locations={locations} manageableLocationIds={manageableLocationIds} photos={photos}
            initial={offerFormFrom(offer, { starts_on: offer.starts_on, ends_on: offer.ends_on, open_ended: offer.open_ended })} edit={{ offerId: offer.id, revision: offer.revision }} onDone={() => setEditing(false)} />
        </>
      ) : (
        <SectionCard className="offer-facts">
          <div className="section-card-heading"><div><p className="eyebrow">{t(locale, "offers.confirm.heading")}</p><h2>{offer.title}</h2></div><Badge variant="outline">{t(locale, `offers.status.${offer.status}`)}</Badge></div>
          <p>{offer.details}</p>
          <dl className="trust-dl">
            <div><dt>{t(locale, "offers.facts.price")}</dt><dd>{offer.priceDisplay ?? t(locale, "offers.row.noPrice")}</dd></div>
            <div><dt>{t(locale, "offers.facts.validity")}</dt><dd>{offer.validity}</dd></div>
            {offer.terms && <div><dt>{t(locale, "offers.facts.terms")}</dt><dd>{offer.terms}</dd></div>}
            {offer.approved_claims.length > 0 && <div><dt>{t(locale, "offers.facts.claims")}</dt><dd>{offer.approved_claims.join(" · ")}</dd></div>}
            {offer.prohibited_wording.length > 0 && <div><dt>{t(locale, "offers.facts.wording")}</dt><dd>{offer.prohibited_wording.join(" · ")}</dd></div>}
          </dl>
          {canManage && offer.status === "draft" && (
            <div className="field-stack">
              <div className="consent-row"><Checkbox id="offer-confirm" checked={confirmChecked} onCheckedChange={(v) => setConfirmChecked(v === true)} /><Label htmlFor="offer-confirm">{t(locale, "offers.confirm.checkbox")}</Label></div>
              <Button onClick={() => void confirm()} disabled={!confirmChecked || busy !== null}>{busy === "confirm" ? <LoaderCircle className="animate-spin" /> : <BadgeCheck />} {t(locale, "offers.confirm.button")}</Button>
            </div>
          )}
          {canManage && offer.status !== "archived" && (
            <div className="draft-editor-actions">
              <Button variant="outline" onClick={() => setEditing(true)}><PencilLine /> {t(locale, "offers.detail.edit")}</Button>
              <Button variant="ghost" onClick={() => void archive()} disabled={busy !== null} title={t(locale, "offers.detail.archiveHint")}>{busy === "archive" ? <LoaderCircle className="animate-spin" /> : <Archive />} {t(locale, "offers.detail.archive")}</Button>
            </div>
          )}
          {canManage && (offer.phase === "ended" || offer.phase === "archived") && (
            <Button asChild variant="outline"><Link href={`${base}/offers?new=1&from=${offer.id}`}><CopyPlus /> {t(locale, "offers.detail.startNew")}</Link></Button>
          )}
        </SectionCard>
      )}

      <SectionCard className="offer-prepare">
        <div className="section-card-heading"><div><p className="eyebrow">{t(locale, "offers.prepare.heading")}</p></div><CapabilityBadge value="Beta" /></div>
        {!usable || offer.status !== "confirmed" ? (
          <p className="limitation-note">{t(locale, "offers.prepare.notReady")}</p>
        ) : (
          <>
            <div className="field-stack">
              {channels.map((channel) => {
                const row = rows[channel.templateKey]
                return (
                  <div key={channel.templateKey} className="consent-row" data-template={channel.templateKey}>
                    <Checkbox id={`channel-${channel.templateKey}`} checked={selected.includes(channel.templateKey)} disabled={!canManage || busy !== null}
                      onCheckedChange={(v) => setSelected((prev) => (v === true ? [...prev, channel.templateKey] : prev.filter((k) => k !== channel.templateKey)))} />
                    <span>
                      <Label htmlFor={`channel-${channel.templateKey}`}>{t(locale, `offers.channels.${channel.channel}`)}</Label>
                      {row?.actionId && row.status !== "idle" && <small data-status={row.status}>{row.status === "needs_input" ? t(locale, "offers.run.needsInput", { keys: (row.keys ?? []).join(", ") || "—" }) : t(locale, `offers.run.${row.status}`)}</small>}
                      {row?.actionId && <small><Link href={`${base}/actions/${row.actionId}`}>{t(locale, "offers.prepare.exists")}</Link></small>}
                    </span>
                    {row?.actionId && row.status === "failed" && canManage && <Button size="sm" variant="outline" onClick={() => void runOne(channel.templateKey, row.actionId!)} disabled={busy !== null}>{t(locale, "offers.run.tryAgain")}</Button>}
                  </div>
                )
              })}
            </div>
            <p className="limitation-note" data-testid="delivery-notice">{notice}</p>
            {canManage && <Button onClick={() => void prepare()} disabled={busy !== null || n === 0}>{busy === "prepare" ? <LoaderCircle className="animate-spin" /> : <WandSparkles />} {t(locale, "offers.prepare.button")}</Button>}
          </>
        )}
        <p><Link href={photoBriefHref}><Camera /> {t(locale, "offers.prepare.photoBrief")}</Link></p>
      </SectionCard>
    </div>
  )
}
