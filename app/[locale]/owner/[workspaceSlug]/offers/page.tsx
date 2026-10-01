import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OffersView } from "@/components/workspace/offers-view";
import { EMPTY_OFFER_FORM, offerFormFrom } from "@/lib/offers/form";
import { roleAtLeast } from "@/lib/auth";
import { offersEnabled } from "@/lib/offers/flag";
import { listOfferViews, offerPhotos } from "@/lib/offers/pages";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Offers", zh: "優惠" });
}

/**
 * Offers list (P4.1, spec §5.1). Any member reads; owners and managers create.
 * ?new=1 opens the form; &from=<offerId> pre-fills it from an earlier offer
 * with the dates cleared ("Start a new offer from this one").
 */
export default async function OffersRoute(props: OwnerPageProps) {
  if (!offersEnabled()) notFound();
  const page = await loadOwnerPage(props);
  const membership = page.membership!;
  const [offers, photos] = await Promise.all([listOfferViews(page.ctx, membership, page.locale), offerPhotos(page.ctx, membership)]);
  const canCreate = roleAtLeast(membership.role, "manager");
  const from = page.query.from ? offers.find((offer) => offer.id === page.query.from) : undefined;
  return (
    <OffersView
      locale={page.locale}
      workspaceId={page.ctx.workspace.id}
      workspaceSlug={page.workspaceSlug}
      market={page.ctx.workspace.market}
      offers={offers}
      locations={page.ctx.locations.map((l) => ({ id: l.id, name: l.name }))}
      canCreate={canCreate}
      manageableLocationIds={membership.role === "manager" ? membership.locationScope : null}
      photos={photos}
      newForm={page.query.new === "1" ? (from ? offerFormFrom(from) : EMPTY_OFFER_FORM) : null}
    />
  );
}
