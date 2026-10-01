import { json, readJson, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { expectedRevision, offerErrorResponse, offersDisabledResponse } from "@/app/api/offers/_shared";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { offerRepository } from "@/lib/repositories/offers";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { loadOfferScope } from "@/lib/workspace/offer-scope";
import { canManageOffer, OfferError } from "@/lib/workspace/offers";

/**
 * POST /api/offers/[offerId]/confirm { expected_revision } -> 200 { kind, revision }.
 * confirm_offer owns the state machine and writes its own offer.confirmed
 * audit row; offer_incomplete and offer_currency_market are 422, the other
 * codes 409.
 */
type Ctx = { params: Promise<{ offerId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const disabled = offersDisabledResponse();
  if (disabled) return disabled;
  const { offerId } = await params;
  if (!UUID_RE.test(offerId)) return json({ error: "offerId is invalid" }, 400);
  const body = await readJson(req);
  if (!body) return json({ error: "Invalid JSON" }, 400);
  const revision = expectedRevision(body);
  if (revision === null) return json({ error: "expected_revision is invalid" }, 400);

  try {
    const scope = await loadOfferScope(offerId);
    if (!scope) return json({ error: "not_found" }, 404);
    const auth = await authorizeWorkspaceRequest({ id: scope.workspaceId }, { minRole: "manager" });
    if (!auth.ok) return json({ error: auth.code }, auth.status);
    if (!canManageOffer(auth.membership, scope.locationId)) return json({ error: "forbidden" }, 403);

    const limit = await enforceRateLimit({ req, scope: "action_mutation", identifiers: [auth.user.id], failClosed: true });
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

    const result = await offerRepository().confirm(offerId, auth.user.id, revision);
    return json({ kind: result.kind, revision: result.revision });
  } catch (error) {
    if (error instanceof OfferError) return offerErrorResponse(error);
    return json({ error: "unavailable" }, 503);
  }
}
