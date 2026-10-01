import { json, localeFrom, readJson, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { checkOfferRefs, offersDisabledResponse, workspaceMarket } from "@/app/api/offers/_shared";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { offerRepository } from "@/lib/repositories/offers";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { ipHashFor, recordNeonEvent } from "@/lib/workspace/audit";
import { canManageOffer, canReadOffer, parseOfferBody } from "@/lib/workspace/offers";

/**
 * GET  /api/workspaces/[id]/offers  -> 200 { offers }  (any member; a scoped manager sees workspace-wide and in-scope offers)
 * POST /api/workspaces/[id]/offers  -> 201 { offer }   (owner; a manager only for an in-scope location)
 * Offers are owner-confirmed facts that promotion copy is written from
 * (docs/superpowers/specs/2026-10-01-offers-promotion-copy-design.md 3.1).
 */
type Ctx = { params: Promise<{ workspaceId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const disabled = offersDisabledResponse();
  if (disabled) return disabled;
  const { workspaceId } = await params;
  if (!UUID_RE.test(workspaceId)) return json({ error: "workspaceId is invalid" }, 400);
  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "viewer" });
  if (!auth.ok) return json({ error: auth.code }, auth.status);
  try {
    const offers = await offerRepository().list(workspaceId);
    return json({ offers: offers.filter((offer) => canReadOffer(auth.membership, offer.locationId)) });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const disabled = offersDisabledResponse();
  if (disabled) return disabled;
  const { workspaceId } = await params;
  if (!UUID_RE.test(workspaceId)) return json({ error: "workspaceId is invalid" }, 400);
  const body = await readJson(req);
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager" });
  if (!auth.ok) return json({ error: auth.code }, auth.status);

  try {
    const market = await workspaceMarket(workspaceId);
    if (!market) return json({ error: "unavailable" }, 503);
    const parsed = parseOfferBody(body, market);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const input = parsed.offer;
    if (input.location_id && !UUID_RE.test(input.location_id)) return json({ error: "location_id is invalid" }, 400);
    if (input.asset_id && !UUID_RE.test(input.asset_id)) return json({ error: "asset_id is invalid" }, 400);
    if (!canManageOffer(auth.membership, input.location_id)) return json({ error: "forbidden" }, 403);
    const refs = await checkOfferRefs(workspaceId, auth.membership, input);
    if (refs) return refs;

    const limit = await enforceRateLimit({ req, scope: "action_mutation", identifiers: [auth.user.id], failClosed: true });
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

    const offer = await offerRepository().create(workspaceId, auth.user.id, input);
    await recordNeonEvent({
      workspaceId,
      locationId: offer.locationId,
      actorType: "user",
      actorId: auth.user.id,
      event: "offer.created",
      entityType: "offer",
      entityId: offer.id,
      locale: localeFrom(req, body),
      ipHash: ipHashFor(req),
      payload: { offer_id: offer.id, location_id: offer.locationId },
    });
    return json({ offer }, 201);
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
