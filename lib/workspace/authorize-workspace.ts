import { isAllowedStaffEmail } from "@/lib/auth/staff";

/**
 * The single workspace-access decision, mirroring `report-access/authorize-report.ts`.
 *
 * Pure and synchronous: the caller loads this session's own workspace_members
 * row (if any) and the session, so this stays testable without a database and
 * cannot itself widen access by querying with the service role.
 */
export type WorkspaceRole = "owner" | "manager" | "viewer";

export type WorkspaceAccess =
  | { kind: "none" }
  | { kind: "member"; workspaceId: string; userId: string; role: WorkspaceRole }
  | { kind: "staff"; userId: string; email: string };

export interface WorkspaceMembershipRecord {
  workspaceId: string;
  role: WorkspaceRole;
}

export interface WorkspaceSessionUser {
  id: string;
  email: string | null;
}

export interface AuthorizeWorkspaceInput {
  /** This session's own workspace_members row for the target workspace, or null. */
  membership: WorkspaceMembershipRecord | null;
  sessionUser: WorkspaceSessionUser | null;
  /** Injectable so tests need no env; production uses the staff allowlist. */
  isStaffEmail?: (email: string) => boolean;
}

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function authorizeWorkspace({
  membership,
  sessionUser,
  isStaffEmail = isAllowedStaffEmail,
}: AuthorizeWorkspaceInput): WorkspaceAccess {
  const userId = sessionUser?.id?.trim();
  if (!userId) return { kind: "none" };

  // Membership is checked before staff — the reverse of authorizeReport.
  // Membership is the more specific claim, and a staff member who is also a
  // bound member of a workspace is acting as a member, not as staff.
  if (membership) {
    return { kind: "member", workspaceId: membership.workspaceId, userId, role: membership.role };
  }

  const email = sessionUser?.email?.trim();
  if (email && isStaffEmail(email)) {
    return { kind: "staff", userId, email: normalizedEmail(email) };
  }

  return { kind: "none" };
}
