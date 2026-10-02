import { json, localeFrom, readJson, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { checkOfferRefs, expectedRevision, offersDisabledResponse, workspaceMarket } from "@/app/api/offers/_shared";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { offerRepository } from "@/lib/repositories/offers";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { ipHashFor, recordNeonEvent } from "@/lib/workspace/audit";
import { loadOfferScope } from "@/lib/workspace/offer-scope";
import { canManageOffer, parseOfferBody } from "@/lib/workspace/offers";

/**
 * PATCH /api/offers/[offerId] { expected_revision, ...offer fields } -> 200 { offer }
 * | 409 { error: "offer_revision_changed" | "offer_archived" }.
 * A fact edit resets the offer to draft and clears the confirmation; a save
 * that changes nothing keeps both. Moving the offer to another location also
 * cancels its open actions (offerRepository.update). The
 * caller must manage both the stored offer's location and the location the
 * body moves it to (a manager cannot widen an offer to the whole workspace).
 */
type Ctx = { params: Promise<{ offerId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
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

    const market = await workspaceMarket(scope.workspaceId);
    if (!market) return json({ error: "unavailable" }, 503);
    const parsed = parseOfferBody(body, market);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const input = parsed.offer;
    if (input.location_id && !UUID_RE.test(input.location_id)) return json({ error: "location_id is invalid" }, 400);
    if (input.asset_id && !UUID_RE.test(input.asset_id)) return json({ error: "asset_id is invalid" }, 400);
    if (!canManageOffer(auth.membership, input.location_id)) return json({ error: "forbidden" }, 403);
    const refs = await checkOfferRefs(scope.workspaceId, auth.membership, input);
    if (refs) return refs;

    const limit = await enforceRateLimit({ req, scope: "action_mutation", identifiers: [auth.user.id], failClosed: true });
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

    const result = await offerRepository().update(scope.workspaceId, offerId, revision, input);
    if (result.kind !== "updated") {
      if (result.kind === "not_found") return json({ error: "not_found" }, 404);
      return json({ error: result.kind === "archived" ? "offer_archived" : "offer_revision_changed" }, 409);
    }
    // A save that changes nothing keeps the revision and the confirmation, so there is nothing to record.
    if (result.changed.length === 0) return json({ offer: result.offer });
    await recordNeonEvent({
      workspaceId: scope.workspaceId,
      locationId: result.offer.locationId,
      actorType: "user",
      actorId: auth.user.id,
      event: "offer.updated",
      entityType: "offer",
      entityId: offerId,
      locale: localeFrom(req, body),
      ipHash: ipHashFor(req),
      payload: { changed: result.changed, revision: result.offer.revision, cancelled_actions: result.cancelledActions },
    });
    return json({ offer: result.offer });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
