import { json, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { consumePublishLimits } from "@/lib/publishing/limits";
import { reconcileDelivery, type ReconcileResult } from "@/lib/publishing/reconcile";
import { limitRefusal, readPublishUsage, unavailableResponse } from "@/lib/publishing/route-support";
import { publishingRepository, type PublishDelivery } from "@/lib/repositories/publishing";
import { sendDeliveryNotices } from "@/lib/workspace/delivery-notices";

/**
 * POST /api/deliveries/[deliveryId]/reconcile (P4.6 spec §3.3)
 * → 200 { deliveryId, state, counted, reason? }
 * | 400 | 401 | 403 | 404 not_found | 429 (Retry-After) | 503.
 *
 * Settles an uncertain (`publishing`) delivery by reading the review back
 * from Google; it never writes to Google. Allowed while the publish flag is
 * off (ruling P4), so an uncertain row never strands after a rollback. Before
 * 0014 no publish delivery exists, and `getDelivery`'s first query (0002
 * columns only) answers null, so no 0014 column is named.
 *
 * Owner, or manager in the delivery's location. A delivery that is not
 * `publishing` reports its state; one younger than 15 s answers `too_soon`
 * (the publish request may still be running). Neither calls Google or spends
 * the `gbp_reconcile` budget. A delivery this call newly counts sends the
 * export route's in-app notices.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const LOG = "api/deliveries/reconcile";
/** Longer than any in-flight publish could still be writing its own outcome. */
const RECONCILE_AFTER_MS = 15_000;

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

  if (delivery.state !== "publishing") {
    return json({ deliveryId, state: delivery.state, counted: delivery.counted });
  }
  if (Date.now() - Date.parse(delivery.createdAt) < RECONCILE_AFTER_MS) {
    return json({ deliveryId, state: "publishing", counted: false, reason: "too_soon" });
  }

  const refused = limitRefusal(
    await consumePublishLimits("reconcile", { workspaceId: delivery.workspaceId, deliveryId }),
  );
  if (refused) return refused;

  let result: ReconcileResult;
  try {
    result = await reconcileDelivery(delivery, auth.user.id, { repository });
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
