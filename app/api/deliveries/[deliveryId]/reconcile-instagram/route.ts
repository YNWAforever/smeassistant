import { json, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { consumeInstagramPublishLimits } from "@/lib/publishing/instagram-limits";
import { reconcileInstagramDelivery, type InstagramReconcileResult } from "@/lib/publishing/instagram-reconcile";
import { limitRefusal, readPublishUsage, unavailableResponse } from "@/lib/publishing/route-support";
import { RECONCILE_AFTER_MS } from "@/lib/publishing/timing";
import { publishingRepository, type PublishDelivery } from "@/lib/repositories/publishing";
import { sendDeliveryNotices } from "@/lib/workspace/delivery-notices";

/**
 * POST /api/deliveries/[deliveryId]/reconcile-instagram (P20.2b)
 * → 200 { deliveryId, state, counted, reason? }
 * | 400 | 401 | 403 | 404 not_found | 429 (Retry-After) | 503.
 *
 * Settles an uncertain (`publishing`) Instagram delivery by reading the
 * account's recent media back; it never publishes. Allowed while the publish
 * flag is off, so an uncertain row never strands after a rollback. A delivery
 * of another channel is not found here (its own route owns it). Owner, or
 * manager in the delivery's location. A delivery that is not `publishing`
 * reports its state; one younger than `RECONCILE_AFTER_MS` answers `too_soon`.
 * A delivery this call newly counts sends the export route's in-app notices.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const LOG = "api/deliveries/reconcile-instagram";

export async function POST(_req: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  const { deliveryId } = await params;
  if (!UUID_RE.test(deliveryId)) return json({ error: "deliveryId is invalid" }, 400);

  const repository = publishingRepository();
  let delivery: PublishDelivery | null;
  try {
    delivery = await repository.getDelivery(deliveryId);
  } catch {
    return unavailableResponse(LOG, { deliveryId });
  }
  if (!delivery) return json({ error: "not_found" }, 404);

  const auth = await authorizeWorkspaceRequest(
    { id: delivery.workspaceId },
    { minRole: "manager", locationId: delivery.locationId ?? undefined },
  );
  if (!auth.ok) return json({ error: auth.code }, auth.status);

  // The channel check comes after authorization so it never widens the response
  // for a stranger; to an authorized member, another channel's delivery is simply
  // not this endpoint's.
  if (delivery.channel !== "instagram") return json({ error: "not_found" }, 404);
  if (delivery.state !== "publishing") {
    return json({ deliveryId, state: delivery.state, counted: delivery.counted });
  }
  if (Date.now() - Date.parse(delivery.createdAt) < RECONCILE_AFTER_MS) {
    return json({ deliveryId, state: "publishing", counted: false, reason: "too_soon" });
  }

  const refused = limitRefusal(
    await consumeInstagramPublishLimits("reconcile", { workspaceId: delivery.workspaceId, deliveryId }),
  );
  if (refused) return refused;

  let result: InstagramReconcileResult;
  try {
    result = await reconcileInstagramDelivery(delivery, auth.user.id, { repository });
  } catch {
    // An unreadable token or another fault: nothing was read, nothing changed.
    return unavailableResponse(LOG, { deliveryId });
  }

  if (result.settledNow && result.counted) {
    const usage = await readPublishUsage(LOG, delivery.workspaceId);
    if (usage) {
      await sendDeliveryNotices({ workspaceId: delivery.workspaceId, actionId: delivery.actionId, kind: "publish", usage });
    }
  }

  return json({
    deliveryId,
    state: result.state,
    counted: result.counted,
    ...(result.reason ? { reason: result.reason } : {}),
  });
}
