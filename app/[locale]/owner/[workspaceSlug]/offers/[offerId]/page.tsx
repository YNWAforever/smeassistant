import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OfferDetail } from "@/components/workspace/offer-detail";
import { offersEnabled } from "@/lib/offers/flag";
import { offerDetail, offerPhotos } from "@/lib/offers/pages";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";

export const dynamic = "force-dynamic";

type OfferPageProps = Omit<OwnerPageProps, "params"> & { params: Promise<{ locale: string; workspaceSlug: string; offerId: string }> };

export async function generateMetadata(props: OfferPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Offer", zh: "優惠" });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One offer: facts, confirmation and the Prepare drafts panel (spec §5.1–§5.2). */
export default async function OfferRoute(props: OfferPageProps) {
  if (!offersEnabled()) notFound();
  const { offerId } = await props.params;
  if (!UUID_RE.test(offerId)) notFound();
  const page = await loadOwnerPage(props);
  const membership = page.membership!;
  const [detail, photos] = await Promise.all([offerDetail(page.ctx, membership, offerId, page.locale), offerPhotos(page.ctx, membership)]);
  if (!detail) notFound();
  return (
    <OfferDetail
      locale={page.locale}
      workspaceId={page.ctx.workspace.id}
      workspaceSlug={page.workspaceSlug}
      market={page.ctx.workspace.market}
      offer={detail.offer}
      canManage={detail.canManage}
      channels={detail.channels}
      usage={{ approvedDeliveries: page.ctx.usage.approvedDeliveries, allowance: page.ctx.usage.allowance }}
      locations={page.ctx.locations.map((l) => ({ id: l.id, name: l.name }))}
      manageableLocationIds={membership.role === "manager" ? membership.locationScope : null}
      photos={photos}
      photoBriefHref={`/${page.locale}/owner/${page.workspaceSlug}/create`}
    />
  );
}
