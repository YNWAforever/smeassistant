import "server-only";
import { getPool } from "../db/client";
import { withTransaction } from "../db/transaction";
import type { WorkspaceRole } from "../workspace/authorize-workspace";
import type { SessionUser } from "../auth";

export interface MemberRow {
 id: string; workspace_id: string; user_id: string | null; email: string;
 role: WorkspaceRole; location_scope: string[] | null;
 accepted_at: string | null; invited_at: string | null; created_at: string;
}
export interface AcceptedMemberRow extends MemberRow { user_id: string; workspace_slug: string | null }
const columns = "id,workspace_id,user_id,email,role,location_scope,accepted_at::text,invited_at::text,created_at::text";

/** Business data only. Callers authorize reads/writes; SQL errors always reject. */
export const membershipRepository = {
 async workspace(ref: { id?: string; slug?: string }): Promise<{ id: string; slug: string | null } | null> {
  if (!ref.id && !ref.slug) return null;
  return (await getPool().query<{ id: string; slug: string | null }>(
   ref.id ? "SELECT id,slug FROM workspaces WHERE id=$1" : "SELECT id,slug FROM workspaces WHERE slug=$1", [ref.id || ref.slug],
  )).rows[0] ?? null;
 },
 async accepted(userId: string, workspaceId: string): Promise<MemberRow | null> {
  return (await getPool().query<MemberRow>(`SELECT ${columns} FROM workspace_members WHERE user_id=$1 AND workspace_id=$2 AND accepted_at IS NOT NULL LIMIT 1`,[userId,workspaceId])).rows[0] ?? null;
 },
 async listAccepted(userId: string): Promise<AcceptedMemberRow[]> {
  return (await getPool().query<AcceptedMemberRow>("SELECT m.*, m.accepted_at::text,m.invited_at::text,m.created_at::text,w.slug AS workspace_slug FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 AND m.accepted_at IS NOT NULL ORDER BY m.created_at,m.id",[userId])).rows;
 },
 async ownedWorkspace(userId: string): Promise<{ workspaceId: string } | null> {
  const row=(await getPool().query<{workspace_id:string}>("SELECT workspace_id FROM workspace_members WHERE user_id=$1 AND role='owner' AND accepted_at IS NOT NULL ORDER BY created_at,id LIMIT 1",[userId])).rows[0];
  return row ? {workspaceId:row.workspace_id} : null;
 },
 async bindPending(user: SessionUser): Promise<string | null> {
  if (user.verified !== true || !user.id || !user.email?.trim()) throw new Error("invitation_identity_invalid");
  const email=user.email.trim().toLowerCase();
  return withTransaction(async client => {
   // Different provider subjects with the same email are different app users.
   // Serialize that recipient and bind once; never overwrite accepted rows.
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`invitation:${email}`]);
   const mapped=await client.query("SELECT u.id FROM app_users u WHERE u.id=$1 AND lower(u.email)=$2 AND EXISTS(SELECT 1 FROM auth_identities i WHERE i.user_id=u.id) FOR UPDATE",[user.id,email]);
   if (!mapped.rows.length) throw new Error("invitation_identity_invalid");
   const bound=await client.query<{workspace_id:string}>("WITH pending AS (SELECT id FROM workspace_members WHERE lower(email)=$2 AND user_id IS NULL AND accepted_at IS NULL ORDER BY created_at,id FOR UPDATE), bound AS (UPDATE workspace_members m SET user_id=$1,accepted_at=now() FROM pending p WHERE m.id=p.id RETURNING m.workspace_id,m.created_at,m.id) SELECT workspace_id FROM bound ORDER BY created_at,id",[user.id,email]);
   return bound.rows[0]?.workspace_id ?? null;
  });
 },
 async hasPendingInvitation(email: string): Promise<boolean> {
  return Boolean((await getPool().query("SELECT id FROM workspace_members WHERE lower(email)=lower($1) AND accepted_at IS NULL LIMIT 1",[email])).rows.length);
 },
 /** Mail eligibility only: never grants workspace access or rebinds a membership. */
 async hasSignInMembership(email: string): Promise<boolean> {
  return Boolean((await getPool().query(`SELECT m.id FROM workspace_members m
   LEFT JOIN app_users u ON u.id=m.user_id
   WHERE (m.user_id IS NULL AND m.accepted_at IS NULL AND lower(m.email)=lower($1))
      OR (m.accepted_at IS NOT NULL AND lower(u.email)=lower($1)
          AND EXISTS (SELECT 1 FROM auth_identities i WHERE i.user_id=u.id))
   LIMIT 1`,[email])).rows.length);
 },
 async team(workspaceId: string): Promise<MemberRow[]> {
  return (await getPool().query<MemberRow>(`SELECT ${columns} FROM workspace_members WHERE workspace_id=$1 ORDER BY created_at,id`,[workspaceId])).rows;
 },
 async locationIds(workspaceId: string): Promise<string[]> {
  return (await getPool().query<{id:string}>("SELECT id FROM locations WHERE workspace_id=$1",[workspaceId])).rows.map(row=>row.id);
 },
 async member(workspaceId: string, memberId: string): Promise<MemberRow | null> {
  // The route deliberately accepts non-UUID selectors; text comparison yields 404.
  return (await getPool().query<MemberRow>(`SELECT ${columns} FROM workspace_members WHERE workspace_id=$1 AND id::text=$2`,[workspaceId,memberId])).rows[0] ?? null;
 },
 async invite(input: {workspaceId:string;email:string;role:"manager"|"viewer";invitedBy:string|null}): Promise<string> {
  return (await getPool().query<{id:string}>("INSERT INTO workspace_members(workspace_id,email,role,invited_by,invited_at) VALUES($1,$2,$3,$4,now()) RETURNING id",[input.workspaceId,input.email,input.role,input.invitedBy])).rows[0].id;
 },
 async remove(workspaceId:string,memberId:string): Promise<boolean> {
  return Boolean((await getPool().query("DELETE FROM workspace_members WHERE workspace_id=$1 AND id::text=$2 RETURNING id",[workspaceId,memberId])).rows.length);
 },
 async update(workspaceId:string,memberId:string,updates:{role?:"manager"|"viewer";location_scope?:string[]|null}): Promise<boolean> {
  return Boolean((await getPool().query("UPDATE workspace_members SET role=coalesce($3,role),location_scope=CASE WHEN $4 THEN $5::uuid[] ELSE location_scope END WHERE workspace_id=$1 AND id::text=$2 AND role<>'owner' RETURNING id",[workspaceId,memberId,updates.role??null,updates.location_scope!==undefined,updates.location_scope??null])).rows.length);
 },
};
export type MembershipRepository = typeof membershipRepository;
