"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { LoaderCircle, Save, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SectionCard } from "@/components/product-ui"
import type { PrototypeLocale } from "@/lib/copy"
import { t } from "@/lib/i18n"
import { createOffer, updateOffer, type OfferFormBody } from "@/lib/offers/client"
import type { OfferFormInitial } from "@/lib/offers/form"
import type { OfferPhoto } from "@/lib/offers/pages"

/**
 * The offer facts form (spec §5.1). The currency is the workspace market's
 * and shown as a fixed prefix, never a picker; the server sets and checks it.
 * Nothing here is inferred: every fact is typed by the owner.
 */
export interface OfferFormProps {
  locale: PrototypeLocale
  workspaceId: string
  workspaceSlug: string
  market: "hk" | "tw"
  locations: Array<{ id: string; name: string }>
  /** Locations this member may put an offer on; null = any, including all locations. */
  manageableLocationIds: string[] | null
  photos: OfferPhoto[]
  initial: OfferFormInitial
  /** Set when editing an existing offer. */
  edit?: { offerId: string; revision: number }
  onDone?: () => void
}

function lines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

export function OfferForm({ locale, workspaceId, workspaceSlug, market, locations, manageableLocationIds, photos, initial, edit, onDone }: OfferFormProps) {
  const router = useRouter()
  const [form, setForm] = useState<OfferFormInitial>(initial)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof OfferFormInitial>(key: K, value: OfferFormInitial[K]) => setForm((prev) => ({ ...prev, [key]: value }))
  const symbol = market === "tw" ? "NT$" : "HK$"
  const locationOptions = manageableLocationIds === null ? locations : locations.filter((l) => manageableLocationIds.includes(l.id))
  const allowWorkspaceWide = manageableLocationIds === null
  const usablePhotos = photos.filter((photo) => photo.locationId === null || photo.locationId === form.locationId)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    const body: OfferFormBody = {
      title: form.title,
      details: form.details,
      terms: form.terms.trim() ? form.terms : null,
      price_amount: form.price.trim() ? form.price.trim() : null,
      starts_on: form.startsOn,
      ends_on: form.openEnded || !form.endsOn ? null : form.endsOn,
      open_ended: form.openEnded,
      approved_claims: lines(form.claims),
      prohibited_wording: lines(form.wording),
      asset_ids: form.assetIds.filter((id) => usablePhotos.some((photo) => photo.id === id)),
      location_id: form.locationId,
    }
    const result = edit ? await updateOffer(workspaceId, edit.offerId, edit.revision, body, locale) : await createOffer(workspaceId, body, locale)
    setBusy(false)
    if (!result.ok) {
      const key = `offers.errors.${result.error}`
      const message = t(locale, key)
      toast.error(message === key ? t(locale, "offers.errors.generic") : message)
      return
    }
    onDone?.()
    router.push(`/${locale}/owner/${workspaceSlug}/offers/${result.data.offer.id}`)
    router.refresh()
  }

  return (
    <SectionCard className="offer-form">
      <form className="field-stack" onSubmit={(event) => void submit(event)} aria-label={t(locale, "offers.form.heading")}>
        <div className="section-card-heading"><div><p className="eyebrow">{t(locale, "offers.form.heading")}</p></div></div>
        <p className="limitation-note"><ShieldCheck /> {t(locale, "offers.form.note")}</p>
        <div className="field-stack"><Label htmlFor="offer-title">{t(locale, "offers.form.title")}</Label><Input id="offer-title" value={form.title} maxLength={120} onChange={(e) => set("title", e.target.value)} required /></div>
        <div className="field-stack"><Label htmlFor="offer-details">{t(locale, "offers.form.details")}</Label><Textarea id="offer-details" rows={3} value={form.details} maxLength={1000} onChange={(e) => set("details", e.target.value)} required /></div>
        <div className="field-stack"><Label htmlFor="offer-price">{t(locale, "offers.form.price")} · <span data-testid="offer-price-prefix">{symbol}</span></Label><Input id="offer-price" inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} /></div>
        <div className="field-stack"><Label htmlFor="offer-starts">{t(locale, "offers.form.startsOn")}</Label><Input id="offer-starts" type="date" value={form.startsOn} onChange={(e) => set("startsOn", e.target.value)} required /></div>
        <div className="field-stack"><Label htmlFor="offer-ends">{t(locale, "offers.form.endsOn")}</Label><Input id="offer-ends" type="date" value={form.openEnded ? "" : form.endsOn} min={form.startsOn || undefined} onChange={(e) => set("endsOn", e.target.value)} disabled={form.openEnded} /></div>
        <div className="consent-row"><Checkbox id="offer-open-ended" checked={form.openEnded} onCheckedChange={(value) => set("openEnded", value === true)} /><Label htmlFor="offer-open-ended">{t(locale, "offers.form.openEnded")}</Label></div>
        <div className="field-stack"><Label htmlFor="offer-terms">{t(locale, "offers.form.terms")}</Label><Textarea id="offer-terms" rows={2} value={form.terms} maxLength={1000} onChange={(e) => set("terms", e.target.value)} /></div>
        <div className="field-stack"><Label htmlFor="offer-claims">{t(locale, "offers.form.claims")}</Label><Textarea id="offer-claims" rows={2} value={form.claims} onChange={(e) => set("claims", e.target.value)} /></div>
        <div className="field-stack"><Label htmlFor="offer-wording">{t(locale, "offers.form.wording")}</Label><Textarea id="offer-wording" rows={2} value={form.wording} onChange={(e) => set("wording", e.target.value)} /></div>
        <div className="field-stack"><Label htmlFor="offer-location">{t(locale, "offers.form.location")}</Label>
          <select id="offer-location" className="native-select" value={form.locationId ?? ""} onChange={(e) => set("locationId", e.target.value || null)}>
            {allowWorkspaceWide && <option value="">{t(locale, "offers.form.allLocations")}</option>}
            {locationOptions.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </div>
        <fieldset className="field-stack"><legend>{t(locale, "offers.form.photos")}</legend>
          {usablePhotos.length === 0
            ? <small>{t(locale, "offers.form.photosNone")} <Link href={`/${locale}/owner/${workspaceSlug}/assets`}>{t(locale, "offers.form.photosLink")}</Link></small>
            : usablePhotos.map((photo) => (
              <div key={photo.id} className="consent-row"><Checkbox id={`offer-photo-${photo.id}`} checked={form.assetIds.includes(photo.id)} onCheckedChange={(value) => set("assetIds", value === true ? [...form.assetIds, photo.id].slice(0, 4) : form.assetIds.filter((id) => id !== photo.id))} /><Label htmlFor={`offer-photo-${photo.id}`}>{photo.filename}</Label></div>
            ))}
        </fieldset>
        <div className="draft-editor-actions">
          {onDone && <Button type="button" variant="outline" onClick={onDone}>{t(locale, "offers.form.cancel")}</Button>}
          <Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />} {t(locale, edit ? "offers.form.saveEdit" : "offers.form.save")}</Button>
        </div>
      </form>
    </SectionCard>
  )
}
