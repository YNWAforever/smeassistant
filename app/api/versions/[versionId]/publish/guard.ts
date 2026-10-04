import { json, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { authorizeWorkspaceRequest, type SessionUser } from "@/lib/auth";
import { GBP_SCOPE_REQUIRED } from "@/lib/oauth/google-connection";
import { publishEligibility } from "@/lib/publishing/eligibility";
import { gbpReplyPublishEnabled } from "@/lib/publishing/flag";
import { googleFailureResponse as googleFailure, unavailableResponse } from "@/lib/publishing/route-support";
import { publishingRepository, type PublishingRepository, type PublishSubject } from "@/lib/repositories/publishing";

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

/** The version routes' spelling of the shared helpers: they log the version id. */
export { limitRefusal } from "@/lib/publishing/route-support";

export function googleFailureResponse(error: unknown, logRoute: string, versionId: string): Response {
  return googleFailure(error, logRoute, { versionId });
}

export function unavailable(logRoute: string, versionId: string): Response {
  return unavailableResponse(logRoute, { versionId });
}
