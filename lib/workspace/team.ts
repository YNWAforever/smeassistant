import { membershipRepository, type MembershipRepository } from "@/lib/repositories/membership";
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace";
import type { LocationSummary, WorkspaceContext } from "@/lib/workspace/queries";

/**
 * Team read model (CLAUDE.md Phase 6 item 5, §3.9): every `workspace_members`
 * row for the workspace — pending invites included, so the owner can see and
 * rescind them — plus the locations a manager's `location_scope` can name.
 * The caller has already been authorised; this only shapes rows.
 */
export interface TeamMember {
  id: string;
  email: string;
  role: WorkspaceRole;
  userId: string | null;
  acceptedAt: string | null;
  invitedAt: string | null;
  /** workspace_members.location_scope (uuid[]); null = all locations. */
  locationScope: string[] | null;
}

export interface TeamModel {
  members: TeamMember[];
  locations: LocationSummary[];
}

interface MemberRow {
  id: string;
  email: string;
  role: WorkspaceRole;
  user_id: string | null;
  accepted_at: string | null;
  invited_at: string | null;
  location_scope: string[] | null;
  created_at: string;
}

export function rowToTeamMember(row: MemberRow): TeamMember {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    userId: row.user_id,
    acceptedAt: row.accepted_at,
    invitedAt: row.invited_at,
    locationScope: Array.isArray(row.location_scope) ? row.location_scope : null,
  };
}

export async function getTeam(ctx: WorkspaceContext, db: MembershipRepository = membershipRepository): Promise<TeamModel> {
 const rows = await db.team(ctx.workspace.id);
 const members = rows.map(rowToTeamMember).sort((a,b) => Number(b.role === "owner") - Number(a.role === "owner"));
 return {members, locations: ctx.locations};
}

/** The workspace's location ids, for validating a manager's location_scope. */
export async function loadLocationIds(db: MembershipRepository, workspaceId: string): Promise<Set<string>> {
 return new Set(await db.locationIds(workspaceId));
}
