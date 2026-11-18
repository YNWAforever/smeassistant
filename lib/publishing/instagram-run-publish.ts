import "server-only";

import {
  createMediaContainer,
  getMediaContainerStatus,
  getPublishedMedia,
  publishMediaContainer,
  type InstagramContainerStatus,
  InstagramGraphError,
} from "@/lib/oauth/instagram-graph";
import {
  InstagramConnectionError,
  withInstagramAccessToken,
} from "@/lib/publishing/instagram-connection";
import {
  publishingRepository,
  type InstagramPublishReceipt,
  type PublishFailureReason,
  type PublishReceipt,
  type PublishState,
} from "@/lib/repositories/publishing";

/**
 * The Instagram half of one feed publish (P20.2b), run after
 * `beginInstagram` recorded the delivery as `publishing`:
 *
 * (a) create a media container (Meta fetches the image itself);
 * (b) read the container status until Meta reports FINISHED, bounded;
 * (c) publish the container exactly once;
 * (d) read the published media back for the receipt
 *     `{ media_id, permalink, published_at }`.
 *
 * Only a definite outcome is finished. A timeout, network error or
 * unrecognised provider answer on `media_publish`, or any failure on the
 * read-back, leaves the delivery `publishing` with exactly one publish write
 * sent; reconcile settles it and never publishes again. A container Meta
 * refuses or a container-status ERROR/EXPIRED/never-ready is definite: nothing
 * was posted, so the delivery fails and a later retry is a new attempt (a new
 * container). A 401 on any leg buys the token helper's one refresh and a retry.
 *
 * Logs carry only `{ category, deliveryId }`: never the caption, image URL,
 * tokens or provider bodies.
 */

export type RunInstagramPublishResult = { state: PublishState; counted: boolean; reason?: PublishFailureReason };

type Outcome =
  | { kind: "published"; receipt: InstagramPublishReceipt }
  | { kind: "failed"; reason: PublishFailureReason }
  | { kind: "uncertain" };

export type InstagramGraphClient = {
  createMediaContainer: typeof createMediaContainer;
  getMediaContainerStatus: typeof getMediaContainerStatus;
  publishMediaContainer: typeof publishMediaContainer;
  getPublishedMedia: typeof getPublishedMedia;
};

export type RunInstagramPublishRepository = Pick<ReturnType<typeof publishingRepository>, "finish" | "getDelivery">;

export type RunInstagramPublishDeps = {
  repository?: RunInstagramPublishRepository;
  withToken?: typeof withInstagramAccessToken;
  graph?: InstagramGraphClient;
  sleep?: (ms: number) => Promise<void>;
  /** Container status polling. Bounded: the caller's route ceiling must exceed this. */
  pollAttempts?: number;
  pollIntervalMs?: number;
};

const DEFAULT_POLL_ATTEMPTS = 5;
const DEFAULT_POLL_INTERVAL_MS = 4_000;

/** A Graph refusal that proves nothing was published, as its reason code; null when it does not. */
function definiteReason(code: InstagramGraphError["code"]): PublishFailureReason | null {
  switch (code) {
    case "forbidden":
      return "provider_forbidden";
    case "rate_limited":
      return "provider_rate_limited";
    case "media_url_unreachable":
      return "media_url_unreachable";
    case "invalid_request":
      return "provider_invalid_request";
    default:
      return null;
  }
}

const isUnauthorized = (error: unknown): boolean => error instanceof InstagramGraphError && error.code === "unauthorized";

export async function runInstagramPublish(
  input: { workspaceId: string; deliveryId: string; actorId: string; imageUrl: string; caption: string },
  deps: RunInstagramPublishDeps = {},
): Promise<RunInstagramPublishResult> {
  const repository = deps.repository ?? publishingRepository();
  const withToken = deps.withToken ?? withInstagramAccessToken;
  const graph: InstagramGraphClient = deps.graph ?? {
    createMediaContainer,
    getMediaContainerStatus,
    publishMediaContainer,
    getPublishedMedia,
  };
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const pollAttempts = deps.pollAttempts ?? DEFAULT_POLL_ATTEMPTS;
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  /** True from the moment `media_publish` is sent until Instagram refuses it outright. */
  let mayHaveWritten = false;

  const attempt = async (token: string, account: { id: string }): Promise<Outcome> => {
    // (a) Container. Nothing is published yet, so every answer is definite.
    let containerId: string;
    try {
      containerId = await graph.createMediaContainer(token, account.id, { imageUrl: input.imageUrl, caption: input.caption });
    } catch (error) {
      if (isUnauthorized(error) || !(error instanceof InstagramGraphError)) throw error;
      return { kind: "failed", reason: definiteReason(error.code) ?? "provider_unavailable" };
    }

    // (b) Bounded status read. A not-ready container was never published.
    let status: InstagramContainerStatus = "in_progress";
    for (let attemptNo = 0; attemptNo < pollAttempts; attemptNo += 1) {
      if (attemptNo > 0) await sleep(pollIntervalMs);
      try {
        status = await graph.getMediaContainerStatus(token, containerId);
      } catch (error) {
        if (isUnauthorized(error) || !(error instanceof InstagramGraphError)) throw error;
        return { kind: "failed", reason: definiteReason(error.code) ?? "provider_unavailable" };
      }
      if (status !== "in_progress") break;
    }
    if (status === "error") return { kind: "failed", reason: "media_url_unreachable" };
    if (status !== "finished") return { kind: "failed", reason: "provider_unavailable" };

    // (c) The one write. Only a refusal Instagram states proves it did not land.
    mayHaveWritten = true;
    let mediaId: string;
    try {
      mediaId = await graph.publishMediaContainer(token, account.id, containerId);
    } catch (error) {
      if (!(error instanceof InstagramGraphError)) return { kind: "uncertain" };
      if (isUnauthorized(error)) throw error;
      const definite = definiteReason(error.code);
      if (definite) mayHaveWritten = false;
      return definite ? { kind: "failed", reason: definite } : { kind: "uncertain" };
    }

    // (d) Verify. Anything short of reading the published media back is uncertain.
    try {
      const media = await graph.getPublishedMedia(token, mediaId);
      return {
        kind: "published",
        receipt: { media_id: media.id, permalink: media.permalink, published_at: media.timestamp },
      };
    } catch {
      return { kind: "uncertain" };
    }
  };

  let outcome: Outcome;
  try {
    outcome = await withToken(input.workspaceId, attempt);
  } catch (error) {
    if (error instanceof InstagramConnectionError) {
      // Raised only before fn ran or after an unauthorized refusal: nothing was written.
      outcome = { kind: "failed", reason: error.code === "connection_missing" ? "connection_missing" : "connection_expired" };
    } else if (mayHaveWritten) {
      outcome = { kind: "uncertain" };
    } else {
      outcome = { kind: "failed", reason: "provider_unavailable" };
    }
  }

  if (outcome.kind === "uncertain") {
    console.error("[publishing/instagram-run-publish] publish outcome uncertain", {
      category: "instagram_publish_uncertain",
      deliveryId: input.deliveryId,
    });
    return { state: "publishing", counted: false };
  }

  if (outcome.kind === "failed") {
    console.error("[publishing/instagram-run-publish] publish failed", {
      category: `instagram_publish_${outcome.reason}`,
      deliveryId: input.deliveryId,
    });
  }

  try {
    const receipt: PublishReceipt | null = outcome.kind === "published" ? outcome.receipt : null;
    const finished = await repository.finish({
      deliveryId: input.deliveryId,
      actorId: input.actorId,
      outcome: outcome.kind,
      receipt,
      reason: outcome.kind === "failed" ? outcome.reason : null,
    });
    return {
      state: finished.state,
      counted: finished.counted,
      ...(finished.state === "failed" && outcome.kind === "failed" ? { reason: outcome.reason } : {}),
    };
  } catch {
    console.error("[publishing/instagram-run-publish] publish not finished", {
      category: "instagram_publish_finish_failed",
      deliveryId: input.deliveryId,
    });
    return storedState(repository, input.deliveryId);
  }
}

/** What the delivery holds now when finishing it failed; shared with reconcile. */
export async function storedState(repository: RunInstagramPublishRepository, deliveryId: string): Promise<RunInstagramPublishResult> {
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
