import "server-only";
import type { Pool } from "pg";
import { getPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { inLocationScope, roleAtLeast, type Membership } from "@/lib/auth";
import { artifactRepository } from "@/lib/repositories/artifacts";
import { resolveActionRunContext, RunError } from "@/lib/workspace/runs";
import { parseAssignmentPatch, parseBulkActionUpdate, type AssignmentPatch, type BulkActionItem, type BulkActionUpdate } from "./action-assignment";

export type AssignmentStatus = "updated" | "no_change" | "forbidden" | "not_found" | "conflict" | "failed";
export interface AssignmentValues { assignee_user_id: string | null; due_at: string | null }
export interface AssignmentResult {
  actionId: string; status: AssignmentStatus; eligible: boolean; reason?: string;
  before?: AssignmentValues; after?: AssignmentValues; expectedUpdatedAt?: string;
}
interface Actor { workspaceId: string; userId: string; locale: string; ipHash?: string | null }
interface Member { role: Membership["role"]; location_scope: string[] | null; email: string }
const stamp = `to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** Each item reauthorizes persisted membership and evidence inside its own atomic transaction. */
export function assignmentUpdateService(pool: Pick<Pool, "connect"> = getPool()) {
  async function item(actor: Actor, selection: BulkActionItem | { actionId: string }, patch: AssignmentPatch, mode: "preview" | "apply", additionalPatch: Record<string, unknown> = {}): Promise<AssignmentResult> {
    parseAssignmentPatch(patch);
    // Additional fields are available only to the existing single PATCH after its normal validation.
    if (Object.keys(additionalPatch).some(k => !["action_state", "provided_inputs"].includes(k))) throw new Error("invalid_assignment_patch");
    const result = (status: AssignmentStatus, reason?: string): AssignmentResult => ({ actionId: selection.actionId, status, eligible: false, ...(reason ? { reason } : {}) });
    try {
      return await withTransaction(async tx => {
        await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'");
        const member = (await tx.query<Member>("SELECT role,location_scope,email FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND accepted_at IS NOT NULL FOR SHARE", [actor.workspaceId, actor.userId])).rows[0];
        if (!member || !roleAtLeast(member.role, "manager")) return result("forbidden");
        const membership: Membership = { workspaceId: actor.workspaceId, workspaceSlug: "", userId: actor.userId, email: member.email, role: member.role, locationScope: member.location_scope };
        const row = (await tx.query<AssignmentValues & { updated_at: string; action_state: string; location_id: string | null }>(`SELECT assignee_user_id,due_at::text,${stamp} AS updated_at,action_state,location_id FROM actions WHERE workspace_id=$1 AND id=$2 FOR UPDATE`, [actor.workspaceId, selection.actionId])).rows[0];
        if (!row) return result("not_found"); // Foreign UUID and absent UUID are indistinguishable.
        try { await resolveActionRunContext(artifactRepository(tx), selection.actionId, membership, actor.userId); }
        catch (error) {
          if (!(error instanceof RunError)) throw error;
          return result(error.code === "forbidden" ? "forbidden" : "not_found");
        }
        if (["completed", "dismissed", "cancelled", "expired"].includes(row.action_state)) return result("forbidden", "action_closed");
        if (patch.assignee_user_id) {
          const target = (await tx.query<Member>("SELECT role,location_scope,email FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND accepted_at IS NOT NULL FOR SHARE", [actor.workspaceId, patch.assignee_user_id])).rows[0];
          if (!target || !roleAtLeast(target.role, "manager") || !inLocationScope({ ...membership, userId: patch.assignee_user_id, role: target.role, locationScope: target.location_scope }, row.location_id)) return result("forbidden", "assignee_ineligible");
          // A workspace-wide action can be bound to location evidence; the assignee must also be able to act on it.
          try { await resolveActionRunContext(artifactRepository(tx), selection.actionId, { ...membership, userId: patch.assignee_user_id, role: target.role, locationScope: target.location_scope }, patch.assignee_user_id); }
          catch (error) { if (!(error instanceof RunError)) throw error; return result("forbidden", "assignee_ineligible"); }
        }
        const before: AssignmentValues = { assignee_user_id: row.assignee_user_id, due_at: row.due_at };
        const after: AssignmentValues = { ...before, ...patch };
        // Equivalent instants compare in SQL without truncating PostgreSQL microseconds.
        const equal = (await tx.query<{ same: boolean }>("SELECT $1::uuid IS NOT DISTINCT FROM $2::uuid AND $3::timestamptz IS NOT DISTINCT FROM $4::timestamptz AS same", [before.assignee_user_id, after.assignee_user_id, before.due_at, after.due_at])).rows[0].same;
        if (equal && !Object.keys(additionalPatch).length) return { ...result("no_change"), eligible: true, before, after, expectedUpdatedAt: row.updated_at };
        if ("expectedUpdatedAt" in selection && !(await tx.query<{ same: boolean }>("SELECT $1::timestamptz=$2::timestamptz AS same", [selection.expectedUpdatedAt, row.updated_at])).rows[0].same) return result("conflict", "action_changed");
        if (mode === "preview") return { ...result("updated"), eligible: true, before, after, expectedUpdatedAt: row.updated_at };
        const extras = Object.entries(additionalPatch);
        const updated = await tx.query<{ updated_at: string }>(`UPDATE actions SET assignee_user_id=$3,due_at=$4,updated_at=clock_timestamp()${extras.map(([key], i) => `,${key}=$${i + 6}`).join("")} WHERE workspace_id=$1 AND id=$2 AND updated_at=$5::timestamptz RETURNING ${stamp} AS updated_at`, [actor.workspaceId, selection.actionId, after.assignee_user_id, after.due_at, row.updated_at, ...extras.map(([key, value]) => key === "provided_inputs" ? JSON.stringify(value) : value)]);
        if (!updated.rows.length) return result("conflict", "action_changed");
        await tx.query("INSERT INTO audit_events(workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload) VALUES($1,$2,'user',$3,$4,'action',$5,$6::jsonb)", [actor.workspaceId, row.location_id, actor.userId, additionalPatch.action_state === "dismissed" ? "action.dismissed" : "action.updated", selection.actionId, JSON.stringify({ ...patch, ...additionalPatch, locale: actor.locale, ip_hash: actor.ipHash ?? null, before, after })]);
        return { ...result("updated"), eligible: true, before, after, expectedUpdatedAt: updated.rows[0].updated_at };
      }, pool);
    } catch { return result("failed", "unavailable"); }
  }
  return {
    item,
    async bulk(actor: Actor, input: BulkActionUpdate): Promise<AssignmentResult[]> {
      input = parseBulkActionUpdate(input);
      const results: AssignmentResult[] = [];
      const deadline = performance.now() + 50_000;
      for (const selection of input.items) {
        if (performance.now() >= deadline) results.push({ actionId: selection.actionId, status: "failed", eligible: false, reason: "deferred" });
        else results.push(await item(actor, selection, input.patch, input.mode));
      }
      return results;
    },
  };
}
