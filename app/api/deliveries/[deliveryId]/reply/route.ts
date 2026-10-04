import { json, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { deleteReply, GbpError, getReview, sameReply } from "@/lib/oauth/google-reviews";
import { withGbpAccessToken } from "@/lib/publishing/connection";
import { gbpReplyPublishEnabled } from "@/lib/publishing/flag";
import { consumePublishLimits } from "@/lib/publishing/limits";
import { googleFailureResponse, limitRefusal, unavailableResponse } from "@/lib/publishing/route-support";
import { PublishError, publishingRepository, type PublishDelivery } from "@/lib/repositories/publishing";

/**
 * DELETE /api/deliveries/[deliveryId]/reply (P4.6 spec §3.4)
 * → 200 { state: 'cancelled' } (also when the review itself is gone)
 * | 400 | 401 | 403 | 404 not_enabled (flag off, before any SQL) | 404 not_found |
 * 409 delivery_not_published | 409 reply_changed_on_google |
 * 409 connection_missing|connection_expired | 429 (Retry-After) |
 * 502 <reason code> | 503.
 *
 * Owner only. Never a blind write: the review is re-read first, and a reply
 * on Google that is no longer our approved version is left alone (409). Our
 * reply, or none at all, is deleted (a 404 on the reply counts as already
 * deleted) and only then is the delivery cancelled. A review that is gone
 * from Google (`not_found` on the re-read) took its reply with it, so nothing
 * is deleted and the delivery is cancelled (final-review ruling), otherwise
 * the row would stay `published` and block re-publishing the version. A
 * cancel never refunds: `counted` and `first_published_at` stay. Any other
 * Google failure cancels nothing. If the delete lands but the cancel fails, a
 * retry finds no reply and completes the cancel.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const LOG = "api/deliveries/reply";

export async function DELETE(_req: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  if (!gbpReplyPublishEnabled()) return json({ error: "not_enabled" }, 404);
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
  const { workspaceId, targetRef, body } = delivery;

  const auth = await authorizeWorkspaceRequest(
    { id: workspaceId },
    { minRole: "owner", locationId: delivery.locationId ?? undefined },
  );
  if (!auth.ok) return json({ error: auth.code }, auth.status);

  if (delivery.state !== "published") return json({ error: "delivery_not_published" }, 409);

  const refused = limitRefusal(await consumePublishLimits("delete", { workspaceId }));
  if (refused) return refused;

  let outcome: "deleted" | "gone" | "changed";
  try {
    outcome = await withGbpAccessToken(workspaceId, async (token) => {
      let current: Awaited<ReturnType<typeof getReview>>;
      try {
        current = await getReview(token, targetRef);
      } catch (error) {
        if (error instanceof GbpError && error.code === "not_found") return "gone";
        throw error;
      }
      if (current.replyComment && !sameReply(current.replyComment, body)) return "changed";
      await deleteReply(token, targetRef);
      return "deleted";
    });
  } catch (error) {
    return googleFailureResponse(error, LOG, { deliveryId });
  }
  if (outcome === "changed") {
    console.error(`[${LOG}] reply changed on Google`, { category: "gbp_publish_reply_changed_on_google", deliveryId });
    return json({ error: "reply_changed_on_google" }, 409);
  }

  try {
    await repository.cancel({ deliveryId, actorId: auth.user.id });
  } catch (error) {
    if (error instanceof PublishError) return json({ error: error.code }, 409);
    return unavailableResponse(LOG, { deliveryId });
  }
  return json({ state: "cancelled" });
}
