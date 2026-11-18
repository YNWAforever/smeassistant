import "server-only";

import { listRecentMedia } from "@/lib/oauth/instagram-graph";
import { withInstagramAccessToken } from "@/lib/publishing/instagram-connection";
import { storedState, type RunInstagramPublishRepository } from "@/lib/publishing/instagram-run-publish";
import type {
  InstagramPublishReceipt,
  PublishDelivery,
  PublishFailureReason,
  PublishState,
} from "@/lib/repositories/publishing";

/**
 * Settles an uncertain Instagram feed publish by reading the account's recent
 * media back; it never publishes, retries or creates a container.
 *
 * The delivery's payload snapshot is the only identity we have: the caption
 * that was approved and the time the publish began. A media item counts as
 * ours when its caption matches the snapshot exactly and its timestamp is not
 * before the delivery began (minus a small clock skew). Exactly one match
 * finishes `published` with `{ media_id, permalink, published_at }`; no match
 * finishes `failed: not_applied`; two or more matches stay `publishing`
 * (ambiguous), so the owner sees "still settling" rather than a guess. A read
 * failure throws; nothing is changed.
 */

export type InstagramReconcileResult = {
  state: PublishState;
  counted: boolean;
  reason?: PublishFailureReason | "ambiguous";
  settledNow: boolean;
};

export type InstagramReconcileDeps = {
  repository: RunInstagramPublishRepository;
  withToken?: typeof withInstagramAccessToken;
  listMedia?: typeof listRecentMedia;
  now?: () => number;
};

/** Clock skew allowance between our delivery row and Meta's media timestamp. */
export const RECONCILE_MATCH_SKEW_MS = 10 * 60 * 1000;

export async function reconcileInstagramDelivery(
  delivery: PublishDelivery,
  actorId: string,
  deps: InstagramReconcileDeps,
): Promise<InstagramReconcileResult> {
  const withToken = deps.withToken ?? withInstagramAccessToken;
  const listMedia = deps.listMedia ?? listRecentMedia;
  const now = deps.now ?? Date.now;

  const caption = typeof delivery.payload?.caption === "string" ? delivery.payload.caption : null;
  const beganAt = Date.parse(delivery.createdAt) - RECONCILE_MATCH_SKEW_MS;
  if (!caption) {
    // No snapshot to match against: refuse to guess. Reconcile remains available
    // only for deliveries this pipeline began.
    return { ...(await finishFailed(deps.repository, delivery, actorId, "not_applied")), settledNow: true };
  }

  const media = await withToken(delivery.workspaceId, async (token, account) => listMedia(token, account.id, { limit: 20 }));
  const matches = media.filter((item) => {
    if (item.caption !== caption) return false;
    if (!item.timestamp) return false;
    const at = Date.parse(item.timestamp);
    return Number.isFinite(at) && at >= beganAt && at <= now() + RECONCILE_MATCH_SKEW_MS;
  });

  if (matches.length > 1) {
    return { state: "publishing", counted: false, reason: "ambiguous", settledNow: false };
  }
  if (matches.length === 1) {
    const receipt: InstagramPublishReceipt = {
      media_id: matches[0].id,
      permalink: matches[0].permalink,
      published_at: matches[0].timestamp,
    };
    try {
      const finished = await deps.repository.finish({
        deliveryId: delivery.id,
        actorId,
        outcome: "published",
        receipt,
        reason: null,
      });
      return { state: finished.state, counted: finished.counted, settledNow: true };
    } catch {
      return { ...(await storedState(deps.repository, delivery.id)), settledNow: false };
    }
  }

  return { ...(await finishFailed(deps.repository, delivery, actorId, "not_applied")), settledNow: true };
}

async function finishFailed(
  repository: RunInstagramPublishRepository,
  delivery: PublishDelivery,
  actorId: string,
  reason: PublishFailureReason,
): Promise<{ state: PublishState; counted: boolean; reason?: PublishFailureReason }> {
  try {
    const finished = await repository.finish({ deliveryId: delivery.id, actorId, outcome: "failed", receipt: null, reason });
    return { state: finished.state, counted: finished.counted, reason };
  } catch {
    return storedState(repository, delivery.id);
  }
}
