import { json } from "@/app/api/actions/_shared/mutation";
import type { Membership } from "@/lib/auth";
import { artifactRepository } from "@/lib/repositories/artifacts";
import { assetRepository } from "@/lib/repositories/assets";
import { assetLocationScope, assetUsableByAction } from "@/lib/workspace/assets";
import { OfferError, type OfferErrorCode } from "@/lib/workspace/offers";
import { offerPromotionsEnabled } from "@/lib/workspace/offers-flag";

/** Shipped dark: with the flag off every offer route is indistinguishable from a missing route. */
export function offersDisabledResponse(): Response | null {
  return offerPromotionsEnabled() ? null : json({ error: "not_found" }, 404);
}

/** The workspace's market, the only thing that decides an offer's currency. Null when the workspace is unreadable. */
export async function workspaceMarket(workspaceId: string): Promise<"hk" | "tw" | null> {
  const workspace = await artifactRepository().assistantWorkspace(workspaceId);
  return workspace?.market === "tw" ? "tw" : workspace?.market === "hk" ? "hk" : null;
}

/**
 * The location and asset a body names must belong to this workspace, and the
 * asset must be rights-approved and usable at the offer's location. The
 * repository checks neither, and a bare uuid from the client proves nothing.
 */
export async function checkOfferRefs(
  workspaceId: string,
  membership: Membership,
  refs: { location_id: string | null; asset_id: string | null },
): Promise<Response | null> {
  if (refs.location_id) {
    const locations = await artifactRepository().assistantLocations(workspaceId);
    if (!locations.some((location) => location.id === refs.location_id)) return json({ error: "location_id is invalid" }, 400);
  }
  if (refs.asset_id) {
    const asset = await assetRepository().get(workspaceId, refs.asset_id);
    if (
      !asset ||
      asset.rights_status !== "approved" ||
      !assetUsableByAction(asset, refs.location_id, assetLocationScope(membership))
    ) {
      return json({ error: "asset_id is invalid" }, 400);
    }
  }
  return null;
}

const UNPROCESSABLE: ReadonlySet<OfferErrorCode> = new Set(["offer_incomplete", "offer_currency_market"]);

/**
 * offer_incomplete and offer_currency_market are the owner's to fix (422); a
 * row deleted mid-request is 404; the rest are state conflicts (409).
 */
export function offerErrorResponse(error: OfferError): Response {
  if (error.code === "offer_not_found") return json({ error: error.code }, 404);
  return json({ error: error.code }, UNPROCESSABLE.has(error.code) ? 422 : 409);
}

export function expectedRevision(body: Record<string, unknown>): number | null {
  const value = body.expected_revision;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 2_147_483_647 ? value : null;
}
