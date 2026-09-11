import { recordClaimAuditEvent } from "@/lib/repositories/claims";
import { requestFingerprint } from "@/lib/security/request-fingerprint";

/**
 * Audit events (CLAUDE.md §3.11). One writer for every route and job so the
 * payload always carries `{ locale, ip_hash? }` and an unknown event name is
 * a type error rather than a typo in the Activity page. The RPCs in
 * 20260903000001_workspace_rpcs.sql write their own rows (version.*,
 * delivery.*); routes only record what happens outside them.
 */
export const AUDIT_EVENTS = [
  "scan.queued", "scan.completed", "scan.failed", "snapshot.created", "action.derived", "action.updated", "action.dismissed",
  "run.started", "run.succeeded", "run.failed", "run.timed_out", "version.created", "version.approved", "version.changes_requested", "version.rejected",
  "delivery.exported", "delivery.copied", "workspace.claimed", "member.invited", "member.role_changed", "integration.updated",
  "brand.updated", "asset.uploaded", "asset.rights_confirmed", "assistant.run", "consent.public_evidence",
  "fix_pack.reviewed",
  "access_request.submitted", "access_request.reviewed", "access_request.information_requested",
  "access_request.approved", "access_request.rejected", "workspace.assigned",
] as const;

export type AuditEvent = (typeof AUDIT_EVENTS)[number];

/**
 * The reaper in lib/repositories/action-run-reaper.ts writes its audit row from
 * raw SQL rather than through `recordNeonEvent`, so the event name would
 * otherwise be an unchecked string literal inside a template. Exporting it as a
 * constant and interpolating it into that statement is what actually ties the
 * SQL to the `AUDIT_EVENTS` tuple: remove the tuple member and this line stops
 * compiling.
 */
export const RUN_TIMED_OUT_EVENT = "run.timed_out" satisfies AuditEvent;
export type AuditActorType = "user" | "agent" | "system" | "scanner";

export interface AuditEventInput {
  /**
   * Null before assignment: a workspace_access_request exists before any
   * workspace does. The SQL column has always been nullable; only this type
   * required one. Widening is source-compatible -- every existing caller
   * passes a string.
   */
  workspaceId: string | null;
  locationId?: string | null;
  actorType: AuditActorType;
  actorId?: string | null;
  event: AuditEvent;
  entityType?: string | null;
  entityId?: string | null;
  locale?: string | null;
  ipHash?: string | null;
  payload?: Record<string, unknown>;
}

/** HMAC of the caller's IP (never the raw address); null when the limiter secret is not configured. */
export function ipHashFor(req: Request): string | null {
  try {
    return requestFingerprint(req);
  } catch {
    return null;
  }
}

/** Best-effort: a failed audit insert is logged, never thrown, so it cannot undo the mutation it describes. */
export async function recordNeonEvent(input: AuditEventInput): Promise<void> {
  const payload: Record<string, unknown> = { locale: input.locale ?? null, ...(input.ipHash ? { ip_hash: input.ipHash } : {}), ...(input.payload ?? {}) };
  try {
    const row = {
      workspace_id: input.workspaceId,
      location_id: input.locationId ?? null,
      actor_type: input.actorType,
      actor_id: input.actorId ?? null,
      event: input.event,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      payload,
    };
    await recordClaimAuditEvent(row);
  } catch {
    console.error("[workspace/audit] event not recorded", { category: "audit_insert_failed", event: input.event });
  }
}
