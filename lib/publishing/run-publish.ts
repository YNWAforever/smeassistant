import "server-only";

import { GbpError, getReview, putReply, sameReply } from "@/lib/oauth/google-reviews";
import { GbpConnectionError, withGbpAccessToken } from "@/lib/publishing/connection";
import {
  publishingRepository,
  type PublishFailureReason,
  type PublishReceipt,
  type PublishState,
} from "@/lib/repositories/publishing";

/**
 * The Google half of one publish (spec §3.2 step 5, §5), run after `begin` has
 * recorded the delivery as `publishing`:
 *
 * (a) pre-read the review. Our reply already there → `published` without a
 *     write; a different reply → `failed: already_replied` without a write.
 * (b) PUT the reply, once.
 * (c) read it back. Equal to our body (after NFC, CRLF → LF, trim) →
 *     `published` with the receipt `{ review_name, reply_update_time }`.
 *
 * Only a definite outcome is finished. A timeout, network or provider error on
 * the PUT, or any failure or mismatch on the read-back, leaves the delivery
 * `publishing` (uncertain) with exactly one PUT sent: never a blind second
 * PUT. Reconcile settles it. A 401 on the pre-read or the PUT (Google refused,
 * nothing was written) buys the token helper's one refresh and a re-run that
 * starts again from the pre-read.
 *
 * Logs carry only `{ category, deliveryId }`: never the body, review text,
 * reviewer names, tokens or Google responses.
 */

export type RunPublishResult = { state: PublishState; counted: boolean; reason?: PublishFailureReason };

type Outcome =
  | { kind: "published"; receipt: PublishReceipt }
  | { kind: "failed"; reason: PublishFailureReason }
  | { kind: "uncertain" };

type RunPublishRepository = Pick<ReturnType<typeof publishingRepository>, "finish" | "getDelivery">;

export type RunPublishDeps = {
  repository?: RunPublishRepository;
  fetchImpl?: typeof fetch;
  withToken?: typeof withGbpAccessToken;
};

/** A Google refusal that proves nothing was written, as its reason code; null when the code is not one. */
function definiteFailure(code: GbpError["code"]): PublishFailureReason | null {
  switch (code) {
    case "forbidden":
      return "provider_forbidden";
    case "rate_limited":
      return "provider_rate_limited";
    case "not_found":
      return "review_not_found";
    default:
      return null;
  }
}

const isUnauthorized = (error: unknown): boolean => error instanceof GbpError && error.code === "unauthorized";

export async function runPublish(
  input: { workspaceId: string; deliveryId: string; actorId: string; reviewName: string; body: string },
  deps: RunPublishDeps = {},
): Promise<RunPublishResult> {
  const repository = deps.repository ?? publishingRepository();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const withToken = deps.withToken ?? withGbpAccessToken;
  /** True from the moment a PUT is sent until Google refuses it outright. */
  let mayHaveWritten = false;

  const attempt = async (token: string): Promise<Outcome> => {
    // (a) Pre-read. Nothing has been written, so every failure is definite.
    let current: Awaited<ReturnType<typeof getReview>>;
    try {
      current = await getReview(token, input.reviewName, fetchImpl);
    } catch (error) {
      if (isUnauthorized(error) || !(error instanceof GbpError)) throw error;
      return { kind: "failed", reason: definiteFailure(error.code) ?? "provider_unavailable" };
    }
    if (current.replyComment) {
      return sameReply(current.replyComment, input.body)
        ? { kind: "published", receipt: { review_name: current.name, reply_update_time: current.replyUpdateTime } }
        : { kind: "failed", reason: "already_replied" };
    }

    // (b) The one write. Only a refusal Google states proves it did not land.
    mayHaveWritten = true;
    try {
      await putReply(token, input.reviewName, input.body, fetchImpl);
    } catch (error) {
      const definite = error instanceof GbpError ? definiteFailure(error.code) : null;
      if (isUnauthorized(error) || definite) mayHaveWritten = false;
      if (isUnauthorized(error)) throw error;
      return definite ? { kind: "failed", reason: definite } : { kind: "uncertain" };
    }

    // (c) Verify. Anything short of reading our own body back is uncertain.
    try {
      const after = await getReview(token, input.reviewName, fetchImpl);
      if (after.replyComment && sameReply(after.replyComment, input.body)) {
        return { kind: "published", receipt: { review_name: after.name, reply_update_time: after.replyUpdateTime } };
      }
    } catch {
      // fall through: uncertain
    }
    return { kind: "uncertain" };
  };

  let outcome: Outcome;
  try {
    outcome = await withToken(input.workspaceId, attempt);
  } catch (error) {
    if (error instanceof GbpConnectionError) {
      // Raised only before fn ran or after a 401 refusal: nothing was written.
      outcome = { kind: "failed", reason: "connection_expired" };
    } else {
      // An unreadable token or another fault. `attempt` never lets an error
      // escape once a write may have landed, but if one ever did, stay
      // uncertain rather than guess.
      outcome = mayHaveWritten ? { kind: "uncertain" } : { kind: "failed", reason: "provider_unavailable" };
    }
  }

  if (outcome.kind === "uncertain") {
    console.error("[publishing/run-publish] publish outcome uncertain", {
      category: "gbp_publish_uncertain",
      deliveryId: input.deliveryId,
    });
    return { state: "publishing", counted: false };
  }

  if (outcome.kind === "failed") {
    console.error("[publishing/run-publish] publish failed", {
      category: `gbp_publish_${outcome.reason}`,
      deliveryId: input.deliveryId,
    });
  }

  try {
    const finished = await repository.finish({
      deliveryId: input.deliveryId,
      actorId: input.actorId,
      outcome: outcome.kind,
      receipt: outcome.kind === "published" ? outcome.receipt : null,
      reason: outcome.kind === "failed" ? outcome.reason : null,
    });
    return {
      state: finished.state,
      counted: finished.counted,
      ...(finished.state === "failed" && outcome.kind === "failed" ? { reason: outcome.reason } : {}),
    };
  } catch {
    console.error("[publishing/run-publish] publish not finished", {
      category: "gbp_publish_finish_failed",
      deliveryId: input.deliveryId,
    });
    return storedState(repository, input.deliveryId);
  }
}

/** What the delivery holds now, when finishing it failed; `publishing` when even that cannot be read. */
async function storedState(repository: RunPublishRepository, deliveryId: string): Promise<RunPublishResult> {
  try {
    const delivery = await repository.getDelivery(deliveryId);
    if (delivery) {
      const reason = delivery.failureReason as PublishFailureReason | null;
      return { state: delivery.state, counted: delivery.counted, ...(reason ? { reason } : {}) };
    }
  } catch {
    // fall through
  }
  return { state: "publishing", counted: false };
}
