import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OffersView } from "@/components/workspace/offers-view";
import { offerRepository } from "@/lib/repositories/offers";
import { assetLocationScope, listAssets } from "@/lib/workspace/assets";
import { canManageOffer, canReadOffer, canUseOffer } from "@/lib/workspace/offers";
import { offerPromotionsEnabled } from "@/lib/workspace/offers-flag";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Offers", zh: "優惠" });
}

/**
 * Offers (P4.1). Shipped dark: while OFFER_PROMOTIONS_ENABLED is off this is
 * indistinguishable from a missing page. Visibility and the manage/use decisions
 * are computed here with the same helpers the routes call, and travel as maps
 * keyed by location id or "workspace" (functions are not serialisable); the UI
 * mirrors them and the routes remain the authority.
 */
export default async function OffersRoute(props: OwnerPageProps) {
  if (!offerPromotionsEnabled()) notFound();
  const page = await loadOwnerPage(props);
  const { membership, ctx } = page;

  const [allOffers, allAssets] = await Promise.all([
    offerRepository().list(ctx.workspace.id),
    listAssets(ctx.workspace.id, ctx.locations, { signedUrls: false }).catch(() => []),
  ]);
  const offers = allOffers.filter((offer) => canReadOffer(membership, offer.locationId));

  const keys: Array<{ key: string; locationId: string | null }> = [
    { key: "workspace", locationId: null },
    ...ctx.locations.map((location) => ({ key: location.id, locationId: location.id })),
  ];
  const canManage = Object.fromEntries(keys.map(({ key, locationId }) => [key, canManageOffer(membership, locationId)]));
  const canUse = Object.fromEntries(keys.map(({ key, locationId }) => [key, canUseOffer(membership, locationId)]));

  // The picker lists only rights-approved images a scoped manager could attach; the routes check again.
  const scope = assetLocationScope(membership);
  const assets = allAssets
    .filter((asset) => asset.rights_status === "approved" && asset.kind === "image")
    .filter((asset) => asset.location_id === null || scope === null || scope.includes(asset.location_id))
    .map((asset) => ({ id: asset.id, filename: asset.filename, locationId: asset.location_id }));

  return (
    <OffersView
      locale={page.locale}
      workspaceId={ctx.workspace.id}
      workspaceSlug={page.workspaceSlug}
      market={ctx.workspace.market}
      role={membership.role}
      canManage={canManage}
      canUse={canUse}
      offers={offers}
      locations={ctx.locations.map((location) => ({ id: location.id, slug: location.slug, name: location.name }))}
      assets={assets}
    />
  );
}
