import type { WorkspaceAgentKey, TemplateKey } from "@/lib/workspace/templates";
import type { ActionOverview } from "@/lib/workspace/overview";

/**
 * Browser-side helpers for the Phase 4 mutation routes (CLAUDE.md §3.2.3,
 * CONTRACT-4 "lib/workspace/client.ts"). Every helper returns a discriminated
 * result and never throws: a network failure, a non-JSON body or an offline
 * browser all come back as `{ ok: false }` so the editor can keep the local
 * text and show the right banner. The export helper mints one idempotency key
 * per (version, mode) and remembers it in sessionStorage, so a retry after a
 * dropped response can never count a second delivery (guardrail 7).
 */
export type ClientResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

export type RunActionResult = { runId: string; state: "succeeded" | "failed"; versionId?: string; versionNo?: number; factsNeeded?: string[]; error?: string };
export type SaveVersionResult = { versionId: string; versionNo: number };
export type ApproveVersionResult = { state: "approved"; delivery_state: "export_ready"; idempotent: boolean };
export type DecideVersionResult = { state: "changes_requested" | "rejected" };
export type ExportVersionResult = { deliveryId: string; counted: boolean; usage: { period: string; approved_deliveries: number; allowance: number | null } };
export type UpdateActionResult = { action: ActionOverview };
export type CreateObjectiveActionResult = { actionId: string; runId?: string; versionId?: string };
export type UploadAssetResult = { assetId: string; signedUrl: string | null };
export type SetAssetRightsResult = { ok: true; rights_status: "approved" | "rejected"; rights_confirmed_at: string | null };

export type ActionPatch = { action_state?: "dismissed" | "completed"; assignee_user_id?: string | null; due_at?: string | null; provided_inputs?: Record<string, unknown> };
export type ExportMode = "export" | "copy";

const JSON_HEADERS = { "Content-Type": "application/json" };

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function request<T>(url: string, init: RequestInit): Promise<ClientResult<T>> {
  if (isOffline()) return { ok: false, status: 0, error: "offline" };
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", ...init });
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : `http_${response.status}`;
    return { ok: false, status: response.status, error };
  }
  return { ok: true, data: body as T };
}

function post<T>(url: string, body: unknown): Promise<ClientResult<T>> {
  return request<T>(url, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body ?? {}) });
}

export function runAction(actionId: string, body: { agentKey?: WorkspaceAgentKey; inputs?: Record<string, unknown> } = {}): Promise<ClientResult<RunActionResult>> {
  return post(`/api/actions/${encodeURIComponent(actionId)}/run`, body);
}

export function saveVersion(actionId: string, body: { body: string; alt_text?: string; base_version_id?: string }): Promise<ClientResult<SaveVersionResult>> {
  return post(`/api/actions/${encodeURIComponent(actionId)}/versions`, body);
}

export function approveVersion(versionId: string, comment?: string): Promise<ClientResult<ApproveVersionResult>> {
  return post(`/api/versions/${encodeURIComponent(versionId)}/approve`, comment ? { comment } : {});
}

export function decideVersion(versionId: string, decision: "changes_requested" | "rejected", comment?: string): Promise<ClientResult<DecideVersionResult>> {
  const path = decision === "changes_requested" ? "request-changes" : "reject";
  return post(`/api/versions/${encodeURIComponent(versionId)}/${path}`, comment ? { comment } : {});
}

export function updateAction(actionId: string, patch: ActionPatch): Promise<ClientResult<UpdateActionResult>> {
  return request(`/api/actions/${encodeURIComponent(actionId)}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(patch) });
}

export function createObjectiveAction(body: { workspace_id: string; template_key: TemplateKey; location_id?: string | null; objective: string; inputs?: Record<string, unknown>; run?: boolean }): Promise<ClientResult<CreateObjectiveActionResult>> {
  return post("/api/actions", body);
}

export function uploadAsset(workspaceId: string, input: { file: File | Blob; kind: "image" | "document" | "menu"; location_id?: string | null; alt_text?: string; filename?: string }): Promise<ClientResult<UploadAssetResult>> {
  const form = new FormData();
  const filename = input.filename ?? (input.file instanceof File ? input.file.name : "asset");
  form.set("file", input.file, filename);
  form.set("kind", input.kind);
  if (input.location_id) form.set("location_id", input.location_id);
  if (input.alt_text) form.set("alt_text", input.alt_text);
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/assets`, { method: "POST", body: form });
}

export function setAssetRights(workspaceId: string, assetId: string, body: { rights_status: "approved" | "rejected"; alt_text?: string }): Promise<ClientResult<SetAssetRightsResult>> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/assets/${encodeURIComponent(assetId)}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) });
}

// ---------------------------------------------------------------------------
// Export with a remembered idempotency key
// ---------------------------------------------------------------------------

const KEY_PREFIX = "sme.export-key.";
/** In-memory fallback for browsers where sessionStorage throws (private mode, blocked storage) or on the server. */
const memoryKeys = new Map<string, string>();

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    const probe = `${KEY_PREFIX}probe`;
    window.sessionStorage.setItem(probe, "1");
    window.sessionStorage.removeItem(probe);
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 22-char base64url token (16 random bytes); matches the route's 16–64 char rule. */
export function mintIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return toBase64Url(bytes);
}

/** The key for (versionId, mode): minted once, then re-used for every retry in this tab. */
export function idempotencyKeyFor(versionId: string, mode: ExportMode): string {
  const name = `${KEY_PREFIX}${versionId}.${mode}`;
  const store = storage();
  const existing = store ? store.getItem(name) : memoryKeys.get(name) ?? null;
  if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
  const key = mintIdempotencyKey();
  if (store) {
    try {
      store.setItem(name, key);
    } catch {
      memoryKeys.set(name, key);
    }
  } else {
    memoryKeys.set(name, key);
  }
  return key;
}

/** Test/reset hook: drop the remembered key for a version + mode. */
export function forgetIdempotencyKey(versionId: string, mode: ExportMode): void {
  const name = `${KEY_PREFIX}${versionId}.${mode}`;
  memoryKeys.delete(name);
  const store = storage();
  if (store) store.removeItem(name);
}

export function exportVersion(versionId: string, mode: ExportMode): Promise<ClientResult<ExportVersionResult>> {
  const idempotency_key = idempotencyKeyFor(versionId, mode);
  return post(`/api/versions/${encodeURIComponent(versionId)}/export`, { mode, idempotency_key });
}

// ---------------------------------------------------------------------------
// Phase 6: rescan, notification preferences, team, brand, Instagram handle
// (CONTRACT-6 "UI contracts"). Same never-throw result shape as above.
// ---------------------------------------------------------------------------

export type RescanResult = { jobId: string };
export type NotificationPreferences = { notifyRescanComplete?: boolean; notifyRegressionAlert?: boolean; notifyMonthlyDigest?: boolean };
export type InviteMemberResult = { memberId: string };
export type MemberPatch = { role?: "manager" | "viewer"; location_scope?: string[] | null };
export type BrandInput = { voice: string; approved_claims: string[]; prohibited_terms: string[]; languages: string[]; facts: Record<string, string> };
export type ConfirmInstagramHandleResult = { ok: true; handle: string };

function patch<T>(url: string, body: unknown): Promise<ClientResult<T>> {
  return request<T>(url, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body ?? {}) });
}

/**
 * Enqueues a rescan for one location, then asks the process route to start
 * it (the same two-step the scan funnel uses). A failed process call still
 * returns the jobId: the job is queued and the scanning page polls it.
 */
export async function rescanLocation(workspaceId: string, locationId: string): Promise<ClientResult<RescanResult>> {
  const queued = await post<RescanResult>(`/api/workspaces/${encodeURIComponent(workspaceId)}/rescan`, { locationId });
  if (!queued.ok) return queued;
  await post("/api/scan/process", { jobId: queued.data.jobId });
  return queued;
}

export function saveNotificationPreferences(workspaceId: string, prefs: NotificationPreferences): Promise<ClientResult<{ ok: true }>> {
  return patch(`/api/workspaces/${encodeURIComponent(workspaceId)}/notification-preferences`, prefs);
}

export function inviteMember(workspaceId: string, body: { email: string; role: "manager" | "viewer"; locale?: string }): Promise<ClientResult<InviteMemberResult>> {
  return post(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`, body);
}

export function removeMember(workspaceId: string, memberId: string): Promise<ClientResult<{ ok: true }>> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/members?memberId=${encodeURIComponent(memberId)}`, { method: "DELETE" });
}

export function updateMember(workspaceId: string, memberId: string, body: MemberPatch): Promise<ClientResult<{ ok: true }>> {
  return patch(`/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(memberId)}`, body);
}

export function saveBrand(workspaceId: string, brand: BrandInput): Promise<ClientResult<{ ok: true }>> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/brand`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(brand) });
}

export function confirmInstagramHandle(workspaceId: string, handle: string, locale?: string): Promise<ClientResult<ConfirmInstagramHandleResult>> {
  return post(`/api/workspaces/${encodeURIComponent(workspaceId)}/instagram-handle`, locale ? { handle, locale } : { handle });
}
