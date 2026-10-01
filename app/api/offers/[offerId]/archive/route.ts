import { json, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { offerErrorResponse, offersDisabledResponse } from "@/app/api/offers/_shared";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { offerRepository } from "@/lib/repositories/offers";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { loadOfferScope } from "@/lib/workspace/offer-scope";
import { canManageOffer, OfferError } from "@/lib/workspace/offers";

/**
 * POST /api/offers/[offerId]/archive -> 200 { kind, cancelledActions }.
 * archive_offer cancels the offer's open actions and writes its own
 * offer.archived audit row.
 */
type Ctx = { params: Promise<{ offerId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const disabled = offersDisabledResponse();
  if (disabled) return disabled;
  const { offerId } = await params;
  if (!UUID_RE.test(offerId)) return json({ error: "offerId is invalid" }, 400);

  try {
    const scope = await loadOfferScope(offerId);
    if (!scope) return json({ error: "not_found" }, 404);
    const auth = await authorizeWorkspaceRequest({ id: scope.workspaceId }, { minRole: "manager" });
    if (!auth.ok) return json({ error: auth.code }, auth.status);
    if (!canManageOffer(auth.membership, scope.locationId)) return json({ error: "forbidden" }, 403);

    const limit = await enforceRateLimit({ req, scope: "action_mutation", identifiers: [auth.user.id], failClosed: true });
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

    const result = await offerRepository().archive(offerId, auth.user.id);
    return json({ kind: result.kind, cancelledActions: result.cancelledActions });
  } catch (error) {
    if (error instanceof OfferError) return offerErrorResponse(error);
    return json({ error: "unavailable" }, 503);
  }
}
