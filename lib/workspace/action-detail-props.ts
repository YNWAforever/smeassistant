import { loadPublishPanel } from "@/lib/publishing/page-state";
import { offerRepository } from "@/lib/repositories/offers";
import { assetLocationScope, assetUsableByAction, listAssets } from "@/lib/workspace/assets";
import { formatOfferPrice } from "@/lib/workspace/offer-format";
import { offerPromotionsEnabled } from "@/lib/workspace/offers-flag";
import { inScopeFor, type OwnerPageContext } from "@/lib/workspace/page-context";
import { getAction, getActivity } from "@/lib/workspace/queries-pages";
import { auditBelongsToAction } from "@/lib/workspace/audit-scope";
import { ownerReviewCheckRepository } from "@/lib/repositories/owner-review-check";
import { EMPTY_OWNER_CHECK } from "@/lib/workspace/owner-review-check";
import type { ActionDetailViewProps } from "@/components/workspace/action-detail-view";

/**
 * Everything the action detail needs, for the full page (/actions/[id]) and
 * the Actions side panel (?open=id). Null when the action is not in this
 * workspace or not readable by this member; callers turn that into a 404 or
 * simply no panel. The read model, offer card, audit rows, scoped assets,
 * publish panel and owner check are loaded exactly as the detail page did.
 */
export async function loadActionDetailProps(page: OwnerPageContext, actionId: string, initialVersionId: string | null): Promise<ActionDetailViewProps | null> {
  const detail = await getAction(page.ctx, actionId);
  if (!detail) return null;

  // P4.1: an offer promotion action is written from one offer; the card and the stale
  // banner read it live, so an edit, an end date or an archive shows before the owner clicks.
  // A read failure only hides the card; approve/export enforce the same rules server-side.
  const offer = detail.offerId ? await offerRepository().get(page.ctx.workspace.id, detail.offerId).catch(() => null) : null;

  const entityIds = new Set<string>([actionId, ...detail.versions.map((v) => v.id), ...detail.runs.map((r) => r.id)]);
  const inScope = inScopeFor(page.membership, detail.action.location.id);
  // P4.6: the Google publish card. Null for any other template, or when a read
  // fails (the card hides; the page never fails because of it). With the flag
  // off it reads no connection and names no 0014 column unless publish rows exist.
  const [activity, verificationActivity, assets, publishPanel, ownerCheck] = await Promise.all([
    getActivity(page.ctx, { limit: 200 }),
    // A durable result must not disappear behind unrelated workspace events.
    // Scope this read before LIMIT; the normal history remains bounded.
    getActivity(page.ctx, { limit: 1, verificationFor: { actionId, locationId: detail.action.location.id } }),
    listAssets(page.ctx.workspace.id, page.ctx.locations, { signedUrls: false }).catch(() => []),
    loadPublishPanel({
      workspaceId: page.ctx.workspace.id,
      templateKey: detail.action.templateKey,
      locationPlaceId: page.ctx.locations.find((l) => l.id === detail.action.location.id)?.placeId ?? null,
      role: page.membership.role,
      inScope,
      versions: detail.versions.map((v) => ({ id: v.id, approval_state: v.approval_state, body: v.body })),
    }),
    detail.action.templateKey === "review-response" && detail.versions.length
      ? ownerReviewCheckRepository().load({ workspaceId: page.ctx.workspace.id, actionId, locationId: detail.action.location.id }).catch(() => EMPTY_OWNER_CHECK)
      : Promise.resolve(EMPTY_OWNER_CHECK),
  ]);
  const auditRows = [...new Map([...activity, ...verificationActivity].map((row) => [row.id, row])).values()]
    .filter((row) => auditBelongsToAction(row, { actionId, entityIds }))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
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

  return {
    locale: page.locale,
    workspaceSlug: page.workspaceSlug,
    workspaceId: page.ctx.workspace.id,
    timezone: page.ctx.workspace.timezone,
    role: page.membership.role,
    inScope,
    location: page.locationSlug,
    locations: page.locations,
    detail,
    auditRows,
    approvedAssets,
    offer: offer ? {
      title: offer.title,
      priceText: formatOfferPrice(offer.priceAmount, offer.currency, page.locale),
      validFrom: offer.validFrom,
      validUntil: offer.validUntil,
      revision: offer.revision,
      status: offer.status,
      expired: offer.expired,
    } : null,
    latestVersionOfferRevision: detail.versions[0]?.offerRevision ?? null,
    offersEnabled: offerPromotionsEnabled(),
    initialVersionId,
    publishPanel,
    ownerCheck,
    ownerCheckIdentity: [page.ctx.workspace.name, page.ctx.locations.find(l => l.id === detail.action.location.id)?.name,
      page.ctx.locations.find(l => l.id === detail.action.location.id)?.address].filter(Boolean).join(" · "),
  };
}
