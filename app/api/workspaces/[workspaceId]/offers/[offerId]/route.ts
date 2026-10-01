import { localDate } from "@/lib/offers/dates";
import { archiveOffer, updateOffer } from "@/lib/offers/service";
import { toOfferView } from "@/lib/offers/view";
import { expectedRevision, json, offerRouteContext, readBody, requestLocale, serviceDeps, unavailable } from "../_shared/context";

/**
 * PATCH /api/workspaces/[workspaceId]/offers/[offerId]
 *   { expected_revision, …fields } → { offer }   (revision + 1, back to draft)
 *   { archive: true }              → { offer }   (archived; terminal)
 * 409 offer_conflict on a stale revision, offer_archived after archive.
 */
type Params = { params: Promise<{ workspaceId: string; offerId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { workspaceId, offerId } = await params;
  const guard = await offerRouteContext(req, { workspaceId, offerId }, { mutation: true });
  if (!guard.ok) return guard.response;
  const body = await readBody(req);
  if (!body) return json({ error: "Invalid JSON" }, 400);
  const locale = requestLocale(req, body);
  const revision = body.archive === true ? null : expectedRevision(body);
  if (body.archive !== true && revision === null) return json({ error: "expected_revision is invalid" }, 400);
  try {
    const deps = serviceDeps(req, guard.ctx, locale);
    const result = body.archive === true ? await archiveOffer(deps, offerId) : await updateOffer(deps, offerId, revision!, body);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ offer: toOfferView(result.offer, { today: localDate(guard.ctx.workspace.timezone, deps.now), locale }) });
  } catch {
    return unavailable(body.archive === true ? "offer_archive_failed" : "offer_update_failed");
  }
}
