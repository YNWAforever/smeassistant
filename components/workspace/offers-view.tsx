import Link from "next/link"
import { ChevronRight, Plus, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CapabilityBadge, PageIntro, SectionCard } from "@/components/product-ui"
import { OfferForm } from "@/components/workspace/offer-form"
import type { OfferFormInitial } from "@/lib/offers/form"
import type { PrototypeLocale } from "@/lib/copy"
import { t } from "@/lib/i18n"
import type { OfferPhoto } from "@/lib/offers/pages"
import type { OfferPhase, OfferView } from "@/lib/offers/view"

/**
 * The offers list (spec §5.1): four groups by phase, and the new-offer form
 * for members who may manage offers. Everything here is Beta and copy-only.
 */
const GROUPS: Array<{ key: "running" | "upcoming" | "draft" | "ended"; phases: OfferPhase[] }> = [
  { key: "running", phases: ["running"] },
  { key: "upcoming", phases: ["upcoming"] },
  { key: "draft", phases: ["draft"] },
  { key: "ended", phases: ["ended", "archived"] },
]

export interface OffersViewProps {
  locale: PrototypeLocale
  workspaceId: string
  workspaceSlug: string
  market: "hk" | "tw"
  offers: OfferView[]
  locations: Array<{ id: string; name: string }>
  canCreate: boolean
  manageableLocationIds: string[] | null
  photos: OfferPhoto[]
  /** Set when the page was opened with ?new=1 (and optionally ?from=<offerId>). */
  newForm: OfferFormInitial | null
}

export function OffersView({ locale, workspaceId, workspaceSlug, market, offers, locations, canCreate, manageableLocationIds, photos, newForm }: OffersViewProps) {
  const base = `/${locale}/owner/${workspaceSlug}/offers`
  const locationName = (id: string | null) => (id ? locations.find((l) => l.id === id)?.name ?? "—" : t(locale, "offers.row.allLocations"))
  return (
    <div className="offers-page">
      <PageIntro
        eyebrow="Beta"
        title={t(locale, "offers.title")}
        description={t(locale, "offers.description")}
        actions={canCreate && !newForm ? <Button asChild><Link href={`${base}?new=1`}><Plus /> {t(locale, "offers.new")}</Link></Button> : undefined}
      />
      <p className="limitation-note"><ShieldAlert /> {t(locale, "offers.betaNote")}</p>
      {canCreate && newForm && (
        <OfferForm locale={locale} workspaceId={workspaceId} workspaceSlug={workspaceSlug} market={market} locations={locations} manageableLocationIds={manageableLocationIds} photos={photos} initial={newForm} />
      )}
      {offers.length === 0 && !newForm && <SectionCard><p>{t(locale, "offers.empty")}</p></SectionCard>}
      {GROUPS.map(({ key, phases }) => {
        const rows = offers.filter((offer) => phases.includes(offer.phase))
        if (!rows.length) return null
        return (
          <SectionCard key={key} className="offer-group">
            <div className="section-card-heading"><div><p className="eyebrow">{t(locale, `offers.groups.${key}`)}</p></div></div>
            <div className="version-list">
              {rows.map((offer) => (
                <Link key={offer.id} href={`${base}/${offer.id}`} className="offer-row" data-phase={offer.phase}>
                  <div>
                    <strong>{offer.title}</strong>
                    <small>{offer.priceDisplay ?? t(locale, "offers.row.noPrice")} · {offer.validity} · {locationName(offer.location_id)} · {t(locale, "offers.row.drafts", { n: offer.draftCount })}</small>
                  </div>
                  <CapabilityBadge value="Beta" />
                  <ChevronRight />
                </Link>
              ))}
            </div>
          </SectionCard>
        )
      })}
    </div>
  )
}
