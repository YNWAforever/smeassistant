import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActionDetailView } from "@/components/workspace/action-detail-view";
import { offerRepository } from "@/lib/repositories/offers";
import { assetLocationScope, assetUsableByAction, listAssets } from "@/lib/workspace/assets";
import { formatOfferPrice } from "@/lib/workspace/offer-format";
import { offerPromotionsEnabled } from "@/lib/workspace/offers-flag";
import { inScopeFor, loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { getAction, getActivity } from "@/lib/workspace/queries-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Action", zh: "行動" });
}

/**
 * Action detail: read model + the audit rows that belong to this action (the
 * action itself, its versions and its runs), so the history tab renders real
 * events (§3.11) without a second round trip from the client.
 */
export default async function ActionDetailRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const { actionId } = await props.params;
  if (!actionId) notFound();
  const detail = await getAction(page.ctx, actionId);
  if (!detail) notFound();

  // P4.1: an offer promotion action is written from one offer; the card and the stale
  // banner read it live, so an edit, an end date or an archive shows before the owner clicks.
  // A read failure only hides the card; approve/export enforce the same rules server-side.
  const offer = detail.offerId ? await offerRepository().get(page.ctx.workspace.id, detail.offerId).catch(() => null) : null;

  const entityIds = new Set<string>([actionId, ...detail.versions.map((v) => v.id), ...detail.runs.map((r) => r.id)]);
  const [activity, assets] = await Promise.all([
    getActivity(page.ctx, { limit: 200 }),
    listAssets(page.ctx.workspace.id, page.ctx.locations, { signedUrls: false }).catch(() => []),
  ]);
  const auditRows = activity.filter((row) => row.entity_id !== null && entityIds.has(row.entity_id));
  // P2.3 item 15: the picker offered every approved image in the workspace, so
  // a social post for one shop could attach another shop's photo, and a manager
  // scoped to one location could see and use assets outside it. Same predicate
  // the run route enforces -- the server is the authority, this keeps the list
  // from offering what it would refuse.
  const scope = assetLocationScope(page.membership);
  const approvedAssets = assets
    .filter((asset) => asset.rights_status === "approved" && asset.kind === "image")
    .filter((asset) => assetUsableByAction(asset, detail.action.location.id, scope))
    .map((asset) => ({ id: asset.id, filename: asset.filename }));

  return (
    <ActionDetailView
      locale={page.locale}
      workspaceSlug={page.workspaceSlug}
      workspaceId={page.ctx.workspace.id}
      timezone={page.ctx.workspace.timezone}
      role={page.membership.role}
      inScope={inScopeFor(page.membership, detail.action.location.id)}
      location={page.locationSlug}
      locations={page.locations}
      detail={detail}
      auditRows={auditRows}
      approvedAssets={approvedAssets}
      offer={offer ? {
        title: offer.title,
        priceText: formatOfferPrice(offer.priceAmount, offer.currency, page.locale),
        validFrom: offer.validFrom,
        validUntil: offer.validUntil,
        revision: offer.revision,
        status: offer.status,
        expired: offer.expired,
      } : null}
      latestVersionOfferRevision={detail.versions[0]?.offerRevision ?? null}
      offersEnabled={offerPromotionsEnabled()}
    />
  );
}
