"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { AlertTriangle, BadgeCheck, LoaderCircle, Plus, Save, ShieldAlert, Tag, WandSparkles } from "lucide-react"
import { toast } from "sonner"

import { PageIntro, SectionCard } from "@/components/product-ui"
import { OfferPromotionPanel } from "@/components/workspace/offer-promotion-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { archiveOffer, confirmOffer, createOffer, getUsage, updateOffer, type ClientResult } from "@/lib/workspace/client"
import { formatOfferDate, formatOfferPrice, isOfferStaleCode, marketCurrency } from "@/lib/workspace/offer-format"
import type { Offer, OfferInput } from "@/lib/workspace/offers"

/**
 * The Offers page (design 3.2): list, create/edit form, confirm and archive.
 * The server decides every one of these (location scope, role, revision); the
 * controls here mirror `canManage` / `canUse`, which the page computed with the
 * same `canManageOffer` / `canUseOffer` the routes call, keyed by location id or
 * "workspace" for a workspace-wide offer. Functions are not serialisable, so
 * the maps travel instead.
 */
export interface OffersViewProps {
  locale: PrototypeLocale
  workspaceId: string
  market: "hk" | "tw"
  role: WorkspaceRole
  canManage: Record<string, boolean>
  canUse: Record<string, boolean>
  offers: Offer[]
  locations: Array<{ id: string; slug: string; name: string }>
  /** Rights-approved assets only. */
  assets: Array<{ id: string; filename: string; locationId: string | null }>
  /** When present, drafts created from an offer link to their action pages. */
  workspaceSlug?: string
}

const WORKSPACE = "workspace"
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type Failure = Extract<ClientResult<unknown>, { ok: false }>

interface FormState {
  locationKey: string
  title: string
  details: string
  terms: string
  price: string
  validFrom: string
  validUntil: string
  claims: string
  prohibitedTerms: string
  assetId: string
}

function lines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean)
}

function initialForm(offer: Offer | null, firstKey: string): FormState {
  if (!offer) return { locationKey: firstKey, title: "", details: "", terms: "", price: "", validFrom: "", validUntil: "", claims: "", prohibitedTerms: "", assetId: "" }
  return {
    locationKey: offer.locationId ?? WORKSPACE,
    title: offer.title,
    details: offer.details,
    terms: offer.terms,
    price: offer.priceAmount === null ? "" : String(offer.priceAmount),
    validFrom: offer.validFrom,
    validUntil: offer.validUntil,
    claims: offer.claims.join("\n"),
    prohibitedTerms: offer.prohibitedTerms.join("\n"),
    assetId: offer.assetId ?? "",
  }
}

export function OffersView({ locale, workspaceId, market, role, canManage, canUse, offers, locations, assets, workspaceSlug }: OffersViewProps) {
  const text = copy[locale].workspace.offers
  const router = useRouter()
  const currency = marketCurrency(market)
  const locationName = (id: string | null) => (id === null ? text.scope.all : locations.find((l) => l.id === id)?.name ?? text.scope.all)
  const keyOf = (offer: Offer) => offer.locationId ?? WORKSPACE
  const canCreateAny = Object.values(canManage).some(Boolean)
  const actionsHref = workspaceSlug ? `/${locale}/owner/${workspaceSlug}/actions` : undefined

  // Only the id is kept: the offer itself is read from the `offers` prop on every render, so after a
  // router.refresh() the form saves against the refreshed revision while its typed fields stay put.
  const [editor, setEditor] = useState<{ id: string | null } | null>(null)
  const editingOffer = editor?.id ? offers.find((candidate) => candidate.id === editor.id) ?? null : null
  const [confirming, setConfirming] = useState<string | null>(null)
  const [archiving, setArchiving] = useState<string | null>(null)
  const [promoFor, setPromoFor] = useState<string | null>(null)
  const [usage, setUsage] = useState<{ approvedDeliveries: number; allowance: number | null } | "unavailable" | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [cardMessage, setCardMessage] = useState<{ id: string; text: string } | null>(null)

  function failureText(result: Failure): string {
    if (result.error === "offline" || result.error === "network") return text.errors.network
    if (result.status === 403) return text.errors.forbidden
    if (result.status === 429) return text.errors.rate
    if (result.status === 409) {
      if (result.error === "offer_revision_changed") return text.errors.revisionChanged
      if (result.error === "offer_archived") return text.errors.archived
      if (isOfferStaleCode(result.error)) return text.stale[result.error]
    }
    if (result.status === 422) return result.error === "offer_currency_market" ? text.errors.currency : result.error === "offer_incomplete" ? text.errors.incomplete : text.errors.invalid
    if (result.status === 400) return text.errors.invalid
    return text.errors.generic
  }

  async function confirm(offer: Offer) {
    setBusy(offer.id)
    setCardMessage(null)
    const result = await confirmOffer(offer.id, offer.revision)
    setBusy(null)
    if (!result.ok) { setCardMessage({ id: offer.id, text: failureText(result) }); return }
    setConfirming(null)
    toast.success(text.toasts.confirmed)
    router.refresh()
  }

  async function archive(offer: Offer) {
    setBusy(offer.id)
    setCardMessage(null)
    const result = await archiveOffer(offer.id)
    setBusy(null)
    if (!result.ok) { setCardMessage({ id: offer.id, text: failureText(result) }); return }
    setArchiving(null)
    toast.success(text.toasts.archived)
    router.refresh()
  }

  async function openPromotions(offer: Offer) {
    if (promoFor === offer.id) { setPromoFor(null); return }
    setPromoFor(offer.id)
    setUsage(null)
    // The same read the sidebar uses; a failed read says so rather than looking like an unlimited allowance.
    const result = await getUsage(workspaceId)
    setUsage(result.ok ? { approvedDeliveries: result.data.approved_deliveries, allowance: result.data.allowance } : "unavailable")
  }

  return (
    <div className="offers-page">
      <PageIntro
        eyebrow={text.page.eyebrow}
        title={text.page.title}
        description={text.page.description}
        actions={canCreateAny ? <Button onClick={() => setEditor({ id: null })} disabled={editor !== null}><Plus /> {text.actions.newOffer}</Button> : undefined}
      />
      {role === "viewer" && (
        <div className="permission-banner"><ShieldAlert /><div><strong>{text.viewer.title}</strong><span>{text.viewer.body}</span></div></div>
      )}

      {editor && (editor.id === null || editingOffer) && (
        <OfferForm
          key={editor.id ?? "new"}
          locale={locale}
          workspaceId={workspaceId}
          currency={currency}
          offer={editingOffer}
          canManage={canManage}
          locations={locations}
          assets={assets}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); router.refresh() }}
          onReload={() => router.refresh()}
        />
      )}

      {offers.length === 0 ? (
        <div className="empty-state"><span><Tag /></span><h2>{text.list.empty}</h2><p>{text.list.emptyBody}</p></div>
      ) : (
        <div className="action-list">
          {offers.map((offer) => {
            const key = keyOf(offer)
            const manage = canManage[key] === true && offer.status !== "archived"
            const use = canUse[key] === true && offer.status === "confirmed" && !offer.expired
            const price = formatOfferPrice(offer.priceAmount, offer.currency, locale)
            const message = cardMessage?.id === offer.id ? cardMessage.text : null
            return (
              <SectionCard key={offer.id} className="offer-card">
                <div className="section-card-heading">
                  <div><p className="eyebrow">{locationName(offer.locationId)}</p><h2>{offer.title}</h2></div>
                  <div>
                    <Badge variant="outline">{text.status[offer.status]}</Badge>
                    {offer.expired && offer.status !== "archived" && <Badge variant="outline" className="cap-beta">{text.status.expired}</Badge>}
                  </div>
                </div>
                <p>{offer.details}</p>
                <dl className="asset-meta">
                  <div><dt>{text.meta.price}</dt><dd>{price ?? text.meta.noPrice}</dd></div>
                  <div><dt>{text.meta.valid}</dt><dd>{text.meta.range.replace("{from}", formatOfferDate(offer.validFrom, locale)).replace("{until}", formatOfferDate(offer.validUntil, locale))}</dd></div>
                  <div><dt>{text.meta.location}</dt><dd>{locationName(offer.locationId)}</dd></div>
                  <div><dt>{text.meta.revision}</dt><dd>{offer.revision}</dd></div>
                  {offer.terms && <div><dt>{text.meta.terms}</dt><dd>{offer.terms}</dd></div>}
                  {offer.claims.length > 0 && <div><dt>{text.meta.claims}</dt><dd>{offer.claims.join(" · ")}</dd></div>}
                </dl>
                {message && <p className="limitation-note" role="alert"><AlertTriangle aria-hidden="true" />{message}</p>}

                {confirming === offer.id && manage && (
                  <div className="brand-check-panel">
                    <p>{text.confirm.statement}</p>
                    <div className="draft-editor-actions">
                      <Button variant="outline" onClick={() => setConfirming(null)} disabled={busy === offer.id}>{text.actions.cancel}</Button>
                      <Button onClick={() => void confirm(offer)} disabled={busy === offer.id}>{busy === offer.id ? <LoaderCircle className="animate-spin" /> : <BadgeCheck />} {text.confirm.action}</Button>
                    </div>
                  </div>
                )}
                {archiving === offer.id && manage && (
                  <div className="brand-check-panel">
                    <p>{text.archiveStep.statement}</p>
                    <div className="draft-editor-actions">
                      <Button variant="outline" onClick={() => setArchiving(null)} disabled={busy === offer.id}>{text.actions.cancel}</Button>
                      <Button variant="destructive" onClick={() => void archive(offer)} disabled={busy === offer.id}>{busy === offer.id && <LoaderCircle className="animate-spin" />} {text.archiveStep.action}</Button>
                    </div>
                  </div>
                )}

                {promoFor === offer.id && use && (
                  usage ? (
                    <OfferPromotionPanel locale={locale} offerId={offer.id} offerTitle={offer.title} usage={usage} canCreate={use} actionsHref={actionsHref} />
                  ) : (
                    <p className="limitation-note" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" />{text.promotion.checkingUsage}</p>
                  )
                )}

                {(manage || use) && confirming !== offer.id && archiving !== offer.id && (
                  <div className="draft-editor-actions">
                    {manage && <Button variant="outline" onClick={() => setEditor({ id: offer.id })} disabled={editor !== null}>{text.actions.edit}</Button>}
                    {manage && offer.status === "draft" && <Button variant="outline" onClick={() => { setCardMessage(null); setConfirming(offer.id) }}><BadgeCheck /> {text.actions.confirm}</Button>}
                    {manage && <Button variant="outline" onClick={() => { setCardMessage(null); setArchiving(offer.id) }}>{text.actions.archive}</Button>}
                    {use && <Button onClick={() => void openPromotions(offer)}><WandSparkles /> {text.actions.createDrafts}</Button>}
                  </div>
                )}
              </SectionCard>
            )
          })}
        </div>
      )}
    </div>
  )
}

function OfferForm({
  locale, workspaceId, currency, offer, canManage, locations, assets, onClose, onSaved, onReload,
}: {
  locale: PrototypeLocale
  workspaceId: string
  currency: "HKD" | "TWD"
  offer: Offer | null
  canManage: Record<string, boolean>
  locations: OffersViewProps["locations"]
  assets: OffersViewProps["assets"]
  onClose: () => void
  onSaved: () => void
  onReload: () => void
}) {
  const text = copy[locale].workspace.offers
  // Only places the caller may manage are offered; the server checks again.
  const scopes = [
    ...locations.filter((l) => canManage[l.id] === true).map((l) => ({ key: l.id, name: l.name })),
    ...(canManage[WORKSPACE] === true ? [{ key: WORKSPACE, name: text.scope.all }] : []),
  ]
  const [form, setForm] = useState<FormState>(() => initialForm(offer, scopes[0]?.key ?? WORKSPACE))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; reload: boolean } | null>(null)
  const locationId = form.locationKey === WORKSPACE ? null : form.locationKey
  const assetOptions = assets.filter((asset) => asset.locationId === null || asset.locationId === locationId)
  const set = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }))

  function parse(): { ok: true; body: OfferInput } | { ok: false; error: string } {
    const title = form.title.trim()
    const details = form.details.trim()
    if (!title || !details) return { ok: false, error: text.errors.required }
    if (!DATE_RE.test(form.validFrom) || !DATE_RE.test(form.validUntil) || form.validUntil < form.validFrom) return { ok: false, error: text.errors.dates }
    const typedPrice = form.price.trim()
    // A comma is accepted only as a thousands separator. Stripping it anywhere
    // else would silently change a price the owner typed ("12,80" → 1280).
    if (typedPrice.includes(",") && !/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(typedPrice)) return { ok: false, error: text.errors.price }
    const rawPrice = typedPrice.replace(/,/g, "")
    let price: number | null = null
    if (rawPrice) {
      if (!/^\d+(\.\d{1,2})?$/.test(rawPrice) || Number(rawPrice) > 9_999_999_999.99) return { ok: false, error: text.errors.price }
      price = Number(rawPrice)
    }
    return {
      ok: true,
      body: {
        location_id: locationId,
        title,
        details,
        terms: form.terms.trim(),
        price_amount: price,
        // The market fixes the currency; it is only meaningful with a price.
        currency: price === null ? null : currency,
        valid_from: form.validFrom,
        valid_until: form.validUntil,
        claims: lines(form.claims),
        prohibited_terms: lines(form.prohibitedTerms),
        asset_id: form.assetId || null,
      },
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const parsed = parse()
    if (!parsed.ok) { setError({ text: parsed.error, reload: false }); return }
    setBusy(true)
    setError(null)
    const result = offer ? await updateOffer(offer.id, offer.revision, parsed.body) : await createOffer(workspaceId, parsed.body)
    setBusy(false)
    if (!result.ok) {
      const stale = result.status === 409 && result.error === "offer_revision_changed"
      const message =
        result.error === "offline" || result.error === "network" ? text.errors.network
        : result.status === 403 ? text.errors.forbidden
        : result.status === 429 ? text.errors.rate
        : stale ? text.errors.revisionChanged
        : result.status === 409 && result.error === "offer_archived" ? text.errors.archived
        : result.status === 400 || result.status === 422 ? text.errors.invalid
        : text.errors.generic
      // The typed text stays in the form: nothing here resets it.
      setError({ text: message, reload: stale })
      return
    }
    toast.success(offer ? text.toasts.updated : text.toasts.created)
    onSaved()
  }

  return (
    <SectionCard className="offer-form">
      <form className="field-stack" onSubmit={(event) => void submit(event)} aria-label={offer ? text.actions.edit : text.actions.newOffer}>
        <div className="field-stack">
          <Label htmlFor="offer-location">{text.fields.location}</Label>
          <NativeSelect id="offer-location" value={form.locationKey} onChange={(event) => set({ locationKey: event.target.value, assetId: "" })} disabled={busy || scopes.length < 2}>
            {scopes.map((scope) => <NativeSelectOption key={scope.key} value={scope.key}>{scope.name}</NativeSelectOption>)}
          </NativeSelect>
        </div>
        <div className="field-stack"><Label htmlFor="offer-title">{text.fields.title}</Label><Input id="offer-title" value={form.title} maxLength={120} onChange={(event) => set({ title: event.target.value })} disabled={busy} required /></div>
        <div className="field-stack"><Label htmlFor="offer-details">{text.fields.details}</Label><Textarea id="offer-details" rows={3} value={form.details} maxLength={1000} onChange={(event) => set({ details: event.target.value })} disabled={busy} required /></div>
        <div className="field-stack"><Label htmlFor="offer-terms">{text.fields.terms}</Label><Textarea id="offer-terms" rows={2} value={form.terms} maxLength={1000} onChange={(event) => set({ terms: event.target.value })} disabled={busy} /></div>
        <div className="field-stack">
          <Label htmlFor="offer-price">{text.fields.price}</Label>
          <Input id="offer-price" inputMode="decimal" value={form.price} onChange={(event) => set({ price: event.target.value })} disabled={busy} />
          <small>{text.hints.price}</small>
        </div>
        <div className="field-stack">
          {/* Fixed to the market: interface language never changes currency (guardrail 11), so this is not a choice. */}
          <Label htmlFor="offer-currency">{text.fields.currency}</Label>
          <Input id="offer-currency" value={currency} readOnly disabled />
          <small>{text.hints.currency}</small>
        </div>
        <div className="field-stack"><Label htmlFor="offer-valid-from">{text.fields.validFrom}</Label><Input id="offer-valid-from" type="date" value={form.validFrom} onChange={(event) => set({ validFrom: event.target.value })} disabled={busy} required /></div>
        <div className="field-stack"><Label htmlFor="offer-valid-until">{text.fields.validUntil}</Label><Input id="offer-valid-until" type="date" value={form.validUntil} onChange={(event) => set({ validUntil: event.target.value })} disabled={busy} required /></div>
        <div className="field-stack"><Label htmlFor="offer-claims">{text.fields.claims}</Label><Textarea id="offer-claims" rows={3} value={form.claims} onChange={(event) => set({ claims: event.target.value })} disabled={busy} /><small>{text.hints.claims}</small></div>
        <div className="field-stack"><Label htmlFor="offer-prohibited">{text.fields.prohibitedTerms}</Label><Textarea id="offer-prohibited" rows={2} value={form.prohibitedTerms} onChange={(event) => set({ prohibitedTerms: event.target.value })} disabled={busy} /><small>{text.hints.prohibitedTerms}</small></div>
        <div className="field-stack">
          <Label htmlFor="offer-asset">{text.fields.asset}</Label>
          <NativeSelect id="offer-asset" value={form.assetId} onChange={(event) => set({ assetId: event.target.value })} disabled={busy}>
            <NativeSelectOption value="">{text.noAsset}</NativeSelectOption>
            {assetOptions.map((asset) => <NativeSelectOption key={asset.id} value={asset.id}>{asset.filename}</NativeSelectOption>)}
          </NativeSelect>
          <small>{text.hints.asset}</small>
        </div>
        {error && (
          <p className="limitation-note" role="alert">
            <AlertTriangle aria-hidden="true" />{error.text}
            {error.reload && <Button type="button" size="sm" variant="outline" onClick={onReload}>{text.actions.reload}</Button>}
          </p>
        )}
        <div className="draft-editor-actions">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{text.actions.cancel}</Button>
          <Button type="submit" disabled={busy || scopes.length === 0}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />} {offer ? text.actions.saveChanges : text.actions.save}</Button>
        </div>
      </form>
    </SectionCard>
  )
}
