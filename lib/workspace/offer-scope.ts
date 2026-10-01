import { offerRepository } from "@/lib/repositories/offers";

export interface OfferScope {
  offerId: string;
  workspaceId: string;
  locationId: string | null;
}

/**
 * The offer's workspace and location, read by id before any write so the
 * route authorizes against the stored row, never against caller-supplied ids
 * (guardrail 9). Null means the offer does not exist.
 */
export async function loadOfferScope(offerId: string): Promise<OfferScope | null> {
  return offerRepository().scope(offerId);
}
