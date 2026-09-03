import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Thin wrappers over the atomic RPCs in 20260903000001_workspace_rpcs.sql.
 * The RPCs own the state machine, the usage count and their audit rows; this
 * module only names the arguments and maps the raised `message` to a typed
 * error the routes turn into 409s.
 */
export type VersionErrorCode =
  | "version_conflict"
  | "not_approved"
  | "allowance_exceeded"
  | "version_closed"
  | "version_not_found"
  | "invalid_decision"
  | "invalid_mode";

const KNOWN_CODES: VersionErrorCode[] = ["version_conflict", "not_approved", "allowance_exceeded", "version_closed", "version_not_found", "invalid_decision", "invalid_mode"];

export class VersionError extends Error {
  constructor(public readonly code: VersionErrorCode) {
    super(code);
    this.name = "VersionError";
  }
}

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };

async function call<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = (await db.rpc(fn, args)) as RpcResult;
  if (error) {
    const message = error.message ?? "";
    const code = KNOWN_CODES.find((known) => message === known || message.includes(known));
    if (code) throw new VersionError(code);
    console.error(`[workspace/versions] ${fn} failed`, { category: "version_rpc_failed" });
    throw new Error(`${fn} failed`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error(`${fn} returned no row`);
  return row as T;
}

export interface CreateVersionInput {
  actionId: string;
  actorId: string;
  authorType: "user" | "agent";
  runId?: string | null;
  body: string;
  altText?: string | null;
  meta?: Record<string, unknown>;
  baseVersionId?: string | null;
}

export async function createVersion(db: SupabaseClient, input: CreateVersionInput): Promise<{ versionId: string; versionNo: number }> {
  const row = await call<{ version_id: string; version_no: number }>(db, "create_output_version", {
    p_action_id: input.actionId,
    p_actor: input.actorId,
    p_author_type: input.authorType,
    p_action_run_id: input.runId ?? null,
    p_body: input.body,
    p_alt: input.altText ?? null,
    p_meta: input.meta ?? {},
    p_base_version_id: input.baseVersionId ?? null,
  });
  return { versionId: row.version_id, versionNo: Number(row.version_no) };
}

export async function approveVersion(db: SupabaseClient, input: { versionId: string; actorId: string; comment?: string | null }) {
  const row = await call<{ kind: "approved" | "already-approved"; version_id: string; version_no: number }>(db, "approve_output_version", {
    p_version_id: input.versionId,
    p_actor: input.actorId,
    p_comment: input.comment ?? null,
  });
  return { kind: row.kind, versionId: row.version_id, versionNo: Number(row.version_no) };
}

export async function decideVersion(db: SupabaseClient, input: { versionId: string; actorId: string; decision: "changes_requested" | "rejected"; comment?: string | null }) {
  const row = await call<{ kind: "decided" | "already-decided"; version_id: string; version_no: number; decision: string }>(db, "decide_output_version", {
    p_version_id: input.versionId,
    p_actor: input.actorId,
    p_decision: input.decision,
    p_comment: input.comment ?? null,
  });
  return { kind: row.kind, versionId: row.version_id, versionNo: Number(row.version_no), decision: input.decision };
}

export async function exportVersion(db: SupabaseClient, input: { versionId: string; actorId: string; mode: "export" | "copy"; idempotencyKey: string }) {
  const row = await call<{ kind: "exported" | "existing"; delivery_id: string; version_id: string; counted: boolean }>(db, "export_output_version", {
    p_version_id: input.versionId,
    p_actor: input.actorId,
    p_mode: input.mode,
    p_idempotency_key: input.idempotencyKey,
  });
  return { kind: row.kind, deliveryId: row.delivery_id, versionId: row.version_id, counted: row.counted === true };
}

// ---------------------------------------------------------------------------
// Scope lookups the routes authorize against (workspace + location of the entity)
// ---------------------------------------------------------------------------

export interface ActionScope {
  actionId: string;
  workspaceId: string;
  locationId: string | null;
}

export interface VersionScope extends ActionScope {
  versionId: string;
}

export async function loadActionScope(db: SupabaseClient, actionId: string): Promise<ActionScope | null> {
  const { data, error } = await db.from("actions").select("id, workspace_id, location_id").eq("id", actionId).maybeSingle<{ id: string; workspace_id: string; location_id: string | null }>();
  if (error) throw new Error("action lookup failed");
  return data ? { actionId: data.id, workspaceId: data.workspace_id, locationId: data.location_id } : null;
}

export async function loadVersionScope(db: SupabaseClient, versionId: string): Promise<VersionScope | null> {
  const { data, error } = await db
    .from("output_versions")
    .select("id, action_id, workspace_id, actions(location_id)")
    .eq("id", versionId)
    .maybeSingle<{ id: string; action_id: string; workspace_id: string; actions: { location_id: string | null } | Array<{ location_id: string | null }> | null }>();
  if (error) throw new Error("version lookup failed");
  if (!data) return null;
  const rel = Array.isArray(data.actions) ? data.actions[0] : data.actions;
  return { versionId: data.id, actionId: data.action_id, workspaceId: data.workspace_id, locationId: rel?.location_id ?? null };
}
