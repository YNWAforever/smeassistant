import { NextResponse } from "next/server";

import { GbpError } from "@/lib/oauth/google-reviews";
import { GbpConnectionError } from "@/lib/publishing/connection";
import type { PublishLimitDecision } from "@/lib/publishing/limits";
import type { PublishFailureReason } from "@/lib/repositories/publishing";
import { workspaceReadRepository } from "@/lib/repositories/workspace-read";
import { rateLimitedResponse, rateLimitUnavailableResponse } from "@/lib/security/rate-limit";
import { getUsage, type Usage } from "@/lib/workspace/usage";

/**
 * Response and usage helpers shared by the four P4.6 publishing routes
 * (spec §3, §5): the version routes (targets, publish) and the delivery
 * routes (reconcile, delete reply). Logs carry only a category and the one id
 * the route is about (`versionId` or `deliveryId`): never a body, review text,
 * reviewer name, token or Google response.
 */
export type LogContext = { versionId: string } | { deliveryId: string };

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status });

/** A refused limiter as 429 with `Retry-After`, an unavailable one as 503; null when allowed. */
export function limitRefusal(decision: PublishLimitDecision): Response | null {
  if (decision.allowed) return null;
  if ("unavailable" in decision) return rateLimitUnavailableResponse();
  return rateLimitedResponse(decision.retryAfterSeconds);
}

/** A Google error code as its §5 reason code; anything not a stated refusal is `provider_unavailable`. */
export function gbpReason(code: GbpError["code"]): PublishFailureReason {
  switch (code) {
    case "forbidden":
      return "provider_forbidden";
    case "rate_limited":
      return "provider_rate_limited";
    case "not_found":
      return "review_not_found";
    default:
      return "provider_unavailable";
  }
}

/**
 * A failed Google call that leaves nothing to record on a delivery: a
 * connection error is 409 with its code (the page shows reconnect), a Google
 * error 502 with its reason code, anything else (an unreadable token included)
 * 503.
 */
export function googleFailureResponse(error: unknown, logRoute: string, context: LogContext): Response {
  if (error instanceof GbpConnectionError) {
    console.error(`[${logRoute}] Google connection unusable`, { category: `gbp_publish_${error.code}`, ...context });
    return json({ error: error.code }, 409);
  }
  if (error instanceof GbpError) {
    const reason = gbpReason(error.code);
    console.error(`[${logRoute}] Google call failed`, { category: `gbp_publish_${reason}`, ...context });
    return json({ error: reason }, 502);
  }
  return unavailableResponse(logRoute, context);
}

export function unavailableResponse(logRoute: string, context: LogContext): Response {
  console.error(`[${logRoute}] unavailable`, { category: "gbp_publish_unavailable", ...context });
  return json({ error: "unavailable" }, 503);
}

/**
 * The period usage, read as the export route reads it. Best-effort: by the
 * time a route reads it the delivery is recorded (and maybe published), so a
 * failed read must not turn the answer into an error; it is null instead.
 */
export async function readPublishUsage(logRoute: string, workspaceId: string): Promise<Usage | null> {
  try {
    const read = workspaceReadRepository();
    const [workspace] = await read.workspaces([workspaceId]);
    return await getUsage(
      read,
      workspaceId,
      workspace?.timezone || "Asia/Hong_Kong",
      workspace?.tier === "paid" ? "paid" : "lite",
    );
  } catch {
    console.error(`[${logRoute}] usage not read`, { category: "gbp_publish_usage_unavailable" });
    return null;
  }
}
