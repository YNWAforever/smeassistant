import { prepareOfferDrafts } from "@/lib/offers/service";
import { actionMutationRepository } from "@/lib/repositories/action-mutations";
import { json, offerRouteContext, readBody, requestLocale, serviceDeps, unavailable } from "../../_shared/context";

/**
 * POST /api/workspaces/[workspaceId]/offers/[offerId]/drafts { template_keys, locale }
 * → { actions: [{ templateKey, actionId, created }] }
 * Creates or reuses one action per channel for a confirmed, current offer
 * (409 with the usability code otherwise). It never calls the model: the
 * client runs each action through POST /api/actions/[actionId]/run.
 */
type Params = { params: Promise<{ workspaceId: string; offerId: string }> };

export async function POST(req: Request, { params }: Params) {
  const { workspaceId, offerId } = await params;
  const guard = await offerRouteContext(req, { workspaceId, offerId }, { mutation: true });
  if (!guard.ok) return guard.response;
  const body = await readBody(req);
  if (!body) return json({ error: "Invalid JSON" }, 400);
  const locale = requestLocale(req, body);
  try {
    const result = await prepareOfferDrafts({ ...serviceDeps(req, guard.ctx, locale), actions: actionMutationRepository() }, offerId, body.template_keys);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ actions: result.actions });
  } catch {
    return unavailable("offer_drafts_failed");
  }
}
