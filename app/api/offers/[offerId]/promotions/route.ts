import { json, localeFrom, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { offersDisabledResponse } from "@/app/api/offers/_shared";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { localized } from "@/lib/domain";
import { actionMutationRepository } from "@/lib/repositories/action-mutations";
import { offerRepository } from "@/lib/repositories/offers";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { freshnessText } from "@/lib/workspace/actions";
import { ipHashFor, recordNeonEvent } from "@/lib/workspace/audit";
import { loadOfferScope } from "@/lib/workspace/offer-scope";
import { canUseOffer } from "@/lib/workspace/offers";
import { templateByKey, type OfferTemplateKey } from "@/lib/workspace/templates";

/**
 * POST /api/offers/[offerId]/promotions { channels?: ("instagram"|"google")[] }
 * -> 201 { actions: [{ channel, actionId, created }] }.
 *
 * One action per channel from a confirmed, unexpired offer, and the only place
 * an offer-backed action is created (R11). Idempotent: the partial unique
 * dedupe index (`offer:<id>:<template>`) makes a repeat or a concurrent
 * double-click return the open action with created:false. No model is called
 * here; drafting is the run route's job, behind its own offer gate.
 */
type Ctx = { params: Promise<{ offerId: string }> };

const TEMPLATE_BY_CHANNEL = {
  instagram: "offer-instagram-post",
  google: "offer-google-post",
} as const satisfies Record<string, OfferTemplateKey>;
type Channel = keyof typeof TEMPLATE_BY_CHANNEL;
const CHANNELS = Object.keys(TEMPLATE_BY_CHANNEL) as Channel[];

/** No body means both channels; a body must be an object whose `channels`, when present, is a non-empty list of known channels. */
async function parseChannels(req: Request): Promise<Channel[] | null> {
  const text = await req.text();
  if (!text.trim()) return CHANNELS;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const channels = (body as Record<string, unknown>).channels;
  if (channels === undefined) return CHANNELS;
  if (!Array.isArray(channels) || channels.length === 0) return null;
  const wanted: Channel[] = [];
  for (const channel of channels) {
    if (typeof channel !== "string" || !CHANNELS.includes(channel as Channel)) return null;
    if (!wanted.includes(channel as Channel)) wanted.push(channel as Channel);
  }
  return wanted;
}

export async function POST(req: Request, { params }: Ctx) {
  const disabled = offersDisabledResponse();
  if (disabled) return disabled;
  const { offerId } = await params;
  if (!UUID_RE.test(offerId)) return json({ error: "offerId is invalid" }, 400);
  const channels = await parseChannels(req);
  if (!channels) return json({ error: "channels is invalid" }, 400);

  try {
    const scope = await loadOfferScope(offerId);
    if (!scope) return json({ error: "not_found" }, 404);
    const auth = await authorizeWorkspaceRequest({ id: scope.workspaceId }, { minRole: "manager" });
    if (!auth.ok) return json({ error: auth.code }, auth.status);
    if (!canUseOffer(auth.membership, scope.locationId)) return json({ error: "forbidden" }, 403);

    const limit = await enforceRateLimit({ req, scope: "action_mutation", identifiers: [auth.user.id], failClosed: true });
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

    const offer = await offerRepository().get(scope.workspaceId, offerId);
    if (!offer) return json({ error: "not_found" }, 404);
    // The action is created at the location this read returns, so authorize that one too:
    // a relocation between the scope read and this read must not widen the caller's reach.
    if (!canUseOffer(auth.membership, offer.locationId)) return json({ error: "forbidden" }, 403);
    if (offer.status !== "confirmed") return json({ error: "offer_inactive" }, 409);
    if (offer.expired) return json({ error: "offer_expired" }, 409);

    const locale = localeFrom(req, null);
    const ipHash = ipHashFor(req);
    const now = new Date();
    const actions: Array<{ channel: Channel; actionId: string; created: boolean }> = [];
    for (const channel of channels) {
      const templateKey = TEMPLATE_BY_CHANNEL[channel];
      const template = templateByKey(templateKey);
      const created = await actionMutationRepository().createObjective({
        workspace_id: scope.workspaceId,
        // The run gate requires the action's location to equal the offer's exactly, null included.
        location_id: offer.locationId,
        template_key: templateKey,
        source: "owner_objective",
        source_finding_keys: [],
        title: template.title,
        summary: template.summary,
        evidence: {
          factType: "Recommended",
          source: "Owner offer",
          value: "",
          detail: localized(offer.title, offer.title),
          observedAt: now.toISOString(),
          freshness: freshnessText(now.toISOString(), now),
        },
        priority: "medium",
        priority_score: 50,
        priority_factors: [],
        effort_minutes: template.effortMinutes,
        // The offer_id column answers offer_id on the server; the owner is never asked for it (R3).
        required_inputs: template.requiredInputs.filter((key) => key !== "offer_id"),
        provided_inputs: {},
        action_state: "recommended",
        measurement_state: "not_eligible",
        capability: template.capability,
        dedupe_key: `offer:${offerId}:${templateKey}`,
        offer_id: offerId,
      });
      actions.push({ channel, actionId: created.id, created: created.created });
      if (created.created) {
        await recordNeonEvent({
          workspaceId: scope.workspaceId,
          locationId: offer.locationId,
          actorType: "user",
          actorId: auth.user.id,
          event: "action.updated",
          entityType: "action",
          entityId: created.id,
          locale,
          ipHash,
          payload: { change: "created", source: "owner_objective", template_key: templateKey, offer_id: offerId },
        });
      }
    }
    return json({ actions }, 201);
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
