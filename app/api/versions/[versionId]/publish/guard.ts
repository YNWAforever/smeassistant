import { json, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { authorizeWorkspaceRequest, type SessionUser } from "@/lib/auth";
import { GBP_SCOPE_REQUIRED } from "@/lib/oauth/google-connection";
import { GbpError } from "@/lib/oauth/google-reviews";
import { GbpConnectionError } from "@/lib/publishing/connection";
import { publishEligibility } from "@/lib/publishing/eligibility";
import { gbpReplyPublishEnabled } from "@/lib/publishing/flag";
import type { PublishLimitDecision } from "@/lib/publishing/limits";
import {
  publishingRepository,
  type PublishFailureReason,
  type PublishingRepository,
  type PublishSubject,
} from "@/lib/repositories/publishing";
import { rateLimitedResponse, rateLimitUnavailableResponse } from "@/lib/security/rate-limit";

/**
 * The shared front half of the two publish routes (P4.6 spec §3, §3.1, §3.2):
 * `UUID_RE` → flag (404 before any SQL) → `publishSubject` (404) → owner or
 * manager in the action's location (CLAUDE.md §3.9, the export rule) →
 * `publishEligibility` (409 with the reason).
 */
export type PublishGuard =
  | { ok: true; repository: PublishingRepository; subject: PublishSubject & { placeId: string }; user: SessionUser }
  | { ok: false; response: Response };

export async function guardPublishRequest(versionId: string, logRoute: string): Promise<PublishGuard> {
  if (!UUID_RE.test(versionId)) return { ok: false, response: json({ error: "versionId is invalid" }, 400) };
  if (!gbpReplyPublishEnabled()) return { ok: false, response: json({ error: "not_enabled" }, 404) };

  const repository = publishingRepository();
  let subject: PublishSubject | null;
  try {
    subject = await repository.publishSubject(versionId);
  } catch {
    return { ok: false, response: unavailable(logRoute, versionId) };
  }
  if (!subject) return { ok: false, response: json({ error: "not_found" }, 404) };

  const auth = await authorizeWorkspaceRequest(
    { id: subject.workspaceId },
    { minRole: "manager", locationId: subject.locationId ?? undefined },
  );
  if (!auth.ok) return { ok: false, response: json({ error: auth.code }, auth.status) };

  let connectionActive: boolean;
  try {
    const connection = await repository.activeGbpConnection(subject.workspaceId);
    connectionActive = connection !== null && connection.scopes.includes(GBP_SCOPE_REQUIRED);
  } catch {
    return { ok: false, response: unavailable(logRoute, versionId) };
  }
  const eligibility = publishEligibility({
    enabled: true,
    templateKey: subject.templateKey,
    approvalState: subject.approvalState,
    placeId: subject.placeId,
    connectionActive,
    body: subject.body,
  });
  if (!eligibility.ok || subject.placeId === null) {
    return { ok: false, response: json({ error: eligibility.ok ? "no_location_listing" : eligibility.reason }, 409) };
  }
  return { ok: true, repository, subject: { ...subject, placeId: subject.placeId }, user: auth.user };
}

/** A refused limiter as 429 with `Retry-After`, an unavailable one as 503; null when allowed. */
export function limitRefusal(decision: PublishLimitDecision): Response | null {
  if (decision.allowed) return null;
  if ("unavailable" in decision) return rateLimitUnavailableResponse();
  return rateLimitedResponse(decision.retryAfterSeconds);
}

/** A Google error code as the §5 reason code a route returns before any delivery exists. */
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
 * A failure of a Google call made before `begin`: a connection error is 409
 * with its code (the page shows reconnect), a Google error 502 with its reason
 * code, anything else (an unreadable token included) 503. Logs only a
 * category and the version id.
 */
export function googleFailureResponse(error: unknown, logRoute: string, versionId: string): Response {
  if (error instanceof GbpConnectionError) {
    console.error(`[${logRoute}] Google connection unusable`, { category: `gbp_publish_${error.code}`, versionId });
    return json({ error: error.code }, 409);
  }
  if (error instanceof GbpError) {
    const reason = gbpReason(error.code);
    console.error(`[${logRoute}] Google call failed`, { category: `gbp_publish_${reason}`, versionId });
    return json({ error: reason }, 502);
  }
  return unavailable(logRoute, versionId);
}

export function unavailable(logRoute: string, versionId: string): Response {
  console.error(`[${logRoute}] unavailable`, { category: "gbp_publish_unavailable", versionId });
  return json({ error: "unavailable" }, 503);
}
