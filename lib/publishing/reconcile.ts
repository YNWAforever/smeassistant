import "server-only";

import { GbpError, getReview, sameReply } from "@/lib/oauth/google-reviews";
import { GbpConnectionError, withGbpAccessToken } from "@/lib/publishing/connection";
import { gbpReason } from "@/lib/publishing/route-support";
import { storedState, type RunPublishDeps, type RunPublishResult } from "@/lib/publishing/run-publish";
import {
  publishingRepository,
  type PublishDelivery,
  type PublishFailureReason,
  type PublishReceipt,
} from "@/lib/repositories/publishing";

/**
 * Settles one uncertain (`publishing`) delivery by reading the review back
 * from Google (spec §3.3 step 3, §5). It only reads: it never writes to Google,
 * so an uncertain PUT is never repeated blindly (ruling P5).
 *
 * - The reply equals our body → `published` (counted once, in SQL).
 * - No reply (absent or empty) → `failed: not_applied`.
 * - A different reply → `failed: already_replied`.
 * - The review is gone (`not_found`) → `failed: review_not_found`.
 * - A connection error, or any other Google error, leaves it `publishing` and
 *   returns the §5 reason (`connection_expired`, `provider_forbidden`,
 *   `provider_rate_limited`, `provider_unavailable`) without finishing.
 * - An unreadable token or any other fault is rethrown (the route answers 503).
 *
 * `settledNow` is true only when this call finished the delivery; a finish
 * that found it already settled (a concurrent reconcile) reports the stored
 * state with `settledNow: false`, so the caller sends notices at most once.
 *
 * Logs carry only `{ category, deliveryId }`.
 */
export type ReconcileResult = RunPublishResult & { settledNow: boolean };

type Outcome =
  | { kind: "published"; receipt: PublishReceipt }
  | { kind: "failed"; reason: PublishFailureReason };

export async function reconcileDelivery(
  delivery: PublishDelivery,
  actorId: string,
  deps: RunPublishDeps = {},
): Promise<ReconcileResult> {
  const repository = deps.repository ?? publishingRepository();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const withToken = deps.withToken ?? withGbpAccessToken;

  let outcome: Outcome;
  try {
    const current = await withToken(delivery.workspaceId, (token) => getReview(token, delivery.targetRef, fetchImpl));
    if (!current.replyComment) {
      outcome = { kind: "failed", reason: "not_applied" };
    } else if (sameReply(current.replyComment, delivery.body)) {
      outcome = { kind: "published", receipt: { review_name: current.name, reply_update_time: current.replyUpdateTime } };
    } else {
      outcome = { kind: "failed", reason: "already_replied" };
    }
  } catch (error) {
    if (error instanceof GbpError && error.code === "not_found") {
      outcome = { kind: "failed", reason: "review_not_found" };
    } else if (error instanceof GbpConnectionError || error instanceof GbpError) {
      const reason: PublishFailureReason = error instanceof GbpConnectionError ? "connection_expired" : gbpReason(error.code);
      console.error("[publishing/reconcile] reconcile read failed", {
        category: `gbp_publish_${reason}`,
        deliveryId: delivery.id,
      });
      return { state: "publishing", counted: false, reason, settledNow: false };
    } else {
      throw error;
    }
  }

  if (outcome.kind === "failed") {
    console.error("[publishing/reconcile] reconciled as failed", {
      category: `gbp_publish_${outcome.reason}`,
      deliveryId: delivery.id,
    });
  }

  try {
    const finished = await repository.finish({
      deliveryId: delivery.id,
      actorId,
      outcome: outcome.kind,
      receipt: outcome.kind === "published" ? outcome.receipt : null,
      reason: outcome.kind === "failed" ? outcome.reason : null,
    });
    const settledNow = finished.kind === "finished";
    return {
      state: finished.state,
      counted: finished.counted,
      // An `existing` finish holds another call's reason, which this one did not read.
      ...(settledNow && finished.state === "failed" && outcome.kind === "failed" ? { reason: outcome.reason } : {}),
      settledNow,
    };
  } catch {
    console.error("[publishing/reconcile] reconcile not finished", {
      category: "gbp_publish_finish_failed",
      deliveryId: delivery.id,
    });
    return { ...(await storedState(repository, delivery.id)), settledNow: false };
  }
}
