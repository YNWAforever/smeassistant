import type { Pool } from "pg";
import { getPool } from "@/lib/db/client";
import { invitationMailEnabled } from "@/lib/mail/feature-flags";
import { invitationDedupeKey } from "@/lib/mail/invitation";
import { findMailAttempt } from "@/lib/mail/ledger";
import type { MailSendStatus } from "@/lib/mail/transport";
import { INVITATION_TTL_DAYS } from "@/lib/workspace/invitation-expiry";
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
  /** Latest invitation mail attempt for this invite; set for pending members only when invitation mail is enabled. null = none recorded. */
  invitation?: { status: MailSendStatus; error: string | null } | null;
  /** Pending invite older than INVITATION_TTL_DAYS; set only when invitation mail is enabled. */
  expired?: boolean;
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

export interface GetTeamOptions {
  invitationMail?: boolean;
  mailDb?: Pick<Pool, "query">;
  now?: Date;
}

export async function getTeam(ctx: WorkspaceContext, db: MembershipRepository = membershipRepository, options: GetTeamOptions = {}): Promise<TeamModel> {
 const rows = await db.team(ctx.workspace.id);
 let members = rows.map(rowToTeamMember).sort((a,b) => Number(b.role === "owner") - Number(a.role === "owner"));
 if (options.invitationMail ?? invitationMailEnabled()) {
  const cutoff = (options.now ?? new Date()).getTime() - INVITATION_TTL_DAYS * 86_400_000;
  let mailDb: Pick<Pool, "query"> | null = null;
  try { mailDb = options.mailDb ?? getPool(); } catch { console.error("[workspace/team] invitation status unavailable", { category: "team_invitation_status_failed" }); }
  members = await Promise.all(members.map(async (member) => {
   if (member.acceptedAt || !member.invitedAt) return member;
   // Same boundary as pendingInvitationLiveSql: live only while invited_at > now - TTL.
   const expired = Date.parse(member.invitedAt) <= cutoff;
   let invitation: TeamMember["invitation"] = null;
   if (mailDb) {
    try {
     const attempt = await findMailAttempt(mailDb, invitationDedupeKey(member.id, member.invitedAt));
     invitation = attempt ? {status: attempt.status, error: attempt.error} : null;
    } catch { console.error("[workspace/team] invitation status unavailable", { category: "team_invitation_status_failed" }); }
   }
   return {...member, invitation, expired};
  }));
 }
 return {members, locations: ctx.locations};
}

/** The workspace's location ids, for validating a manager's location_scope. */
export async function loadLocationIds(db: MembershipRepository, workspaceId: string): Promise<Set<string>> {
 return new Set(await db.locationIds(workspaceId));
}
