import { localDate } from "@/lib/offers/dates";
import { confirmOffer } from "@/lib/offers/service";
import { toOfferView } from "@/lib/offers/view";
import { expectedRevision, json, offerRouteContext, readBody, requestLocale, serviceDeps, unavailable } from "../../_shared/context";

/**
 * POST /api/workspaces/[workspaceId]/offers/[offerId]/confirm { expected_revision, locale } → { offer }
 * 409 offer_conflict | end_date_required | offer_ended | assets_invalid | offer_archived.
 */
type Params = { params: Promise<{ workspaceId: string; offerId: string }> };

export async function POST(req: Request, { params }: Params) {
  const { workspaceId, offerId } = await params;
  const guard = await offerRouteContext(req, { workspaceId, offerId }, { mutation: true });
  if (!guard.ok) return guard.response;
  const body = await readBody(req);
  if (!body) return json({ error: "Invalid JSON" }, 400);
  const revision = expectedRevision(body);
  if (revision === null) return json({ error: "expected_revision is invalid" }, 400);
  const locale = requestLocale(req, body);
  try {
    const deps = serviceDeps(req, guard.ctx, locale);
    const result = await confirmOffer(deps, offerId, revision);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ offer: toOfferView(result.offer, { today: localDate(guard.ctx.workspace.timezone, deps.now), locale }) });
  } catch {
    return unavailable("offer_confirm_failed");
  }
}
