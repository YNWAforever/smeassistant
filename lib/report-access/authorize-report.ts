import { tokenHashMatches, type PresentedViewerToken } from "./token";
import { isAllowedStaffEmail } from "@/lib/auth/staff";

export type ReportMemberRole = "owner" | "manager" | "viewer";

/**
 * An accepted `workspace_members` row of the signed-in user on the workspace
 * the report's job is attached to. Resolved by the caller (Phase 2's
 * `lib/auth.ts`) and handed in; this module never reads the session itself.
 */
export interface ReportWorkspaceMembership {
  workspaceId: string;
  role: ReportMemberRole;
}

export type ReportAccess =
  | { kind: "public" }
  | { kind: "viewer"; grantId: string }
  | { kind: "member"; workspaceId: string; role: ReportMemberRole }
  | { kind: "staff"; userId: string; email: string };

export interface ReportJobForAuthorization {
  id: string;
  /** Legacy display field. It is deliberately ignored by this function. */
  unlocked?: boolean | null;
  /**
   * Workspace the job is attached to (`audit_jobs.workspace_id`), when the
   * caller loaded it. A supplied membership only counts when it names this
   * workspace; `null` (unattached job) can never be matched. Omit the field
   * to let the caller vouch for the membership's scope instead.
   */
  workspace_id?: string | null;
}

export interface StaffSessionUser {
  id: string;
  email: string | null;
}

export interface ViewerGrantRecord {
  id: string;
  job_id: string;
  token_hash: string;
  expires_at: string;
  redeemed_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  /** Test-only convenience; never read from or persisted by production code. */
  rawToken?: string;
}

export interface AuthorizeReportInput {
  job: ReportJobForAuthorization;
  viewerToken: PresentedViewerToken | null;
  staffUser: StaffSessionUser | null;
  /** Workspace membership of the signed-in user for this job, or null. */
  workspaceMembership?: ReportWorkspaceMembership | null;
  lookupGrant?: (grantId: string) => Promise<ViewerGrantRecord | null>;
  markUsed?: (grantId: string) => Promise<void>;
  now?: Date;
}

const MEMBER_ROLES: readonly ReportMemberRole[] = ["owner", "manager", "viewer"];

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validStaffSession(user: StaffSessionUser | null): user is StaffSessionUser & { email: string } {
  return Boolean(user?.id?.trim() && user.email?.trim() && isAllowedStaffEmail(user.email));
}

function validMembership(
  job: ReportJobForAuthorization,
  membership: ReportWorkspaceMembership | null | undefined,
): membership is ReportWorkspaceMembership {
  if (!membership) return false;
  if (typeof membership.workspaceId !== "string" || !membership.workspaceId.trim()) return false;
  if (!MEMBER_ROLES.includes(membership.role)) return false;
  // Fail closed on a wrong-workspace link (CLAUDE.md guardrail 9): when the job
  // row says which workspace it belongs to, the membership must name it.
  if (job.workspace_id !== undefined && job.workspace_id !== membership.workspaceId) return false;
  return true;
}

/**
 * Resolve the single report-access decision. `audit_jobs.unlocked` is legacy
 * display state and is never consulted as an authorization source.
 *
 * Order: staff session, then workspace membership, then viewer grant, else public.
 */
export async function authorizeReport({
  job,
  viewerToken,
  staffUser,
  workspaceMembership = null,
  lookupGrant,
  markUsed,
  now = new Date(),
}: AuthorizeReportInput): Promise<ReportAccess> {
  if (validStaffSession(staffUser)) {
    return {
      kind: "staff",
      userId: staffUser.id,
      email: normalizedEmail(staffUser.email),
    };
  }

  if (validMembership(job, workspaceMembership)) {
    return {
      kind: "member",
      workspaceId: workspaceMembership.workspaceId,
      role: workspaceMembership.role,
    };
  }

  if (!viewerToken || !lookupGrant) return { kind: "public" };

  let grant: ViewerGrantRecord | null = null;
  try {
    grant = await lookupGrant(viewerToken.grantId);
  } catch {
    return { kind: "public" };
  }

  if (
    !grant ||
    grant.id !== viewerToken.grantId ||
    grant.job_id !== job.id ||
    grant.revoked_at != null ||
    !Number.isFinite(Date.parse(grant.expires_at)) ||
    Date.parse(grant.expires_at) <= now.getTime() ||
    !tokenHashMatches(viewerToken.rawToken, grant.token_hash)
  ) {
    return { kind: "public" };
  }

  try {
    await markUsed?.(grant.id);
  } catch {
    // The authorization decision is still valid. A telemetry timestamp must
    // not turn a valid viewer into a public visitor or reveal report data.
  }
  return { kind: "viewer", grantId: grant.id };
}
