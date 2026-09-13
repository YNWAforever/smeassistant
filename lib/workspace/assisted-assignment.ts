import type { AuditEvent } from "./audit";

/**
 * Assisted ownership assignment (Phase 2 backlog items 19-23), the path for a
 * merchant whose business cannot be verified through Google.
 *
 * Pure: no database, no environment, no session. The boundary is deliberate and
 * matches lib/workspace/access-request.ts -- a module that cannot reach the
 * database cannot widen its own reach.
 */
export const ASSISTED_DECISIONS = ["approved", "rejected", "needs_information"] as const;
export type AssistedDecision = (typeof ASSISTED_DECISIONS)[number];

export function isAssistedDecision(value: unknown): value is AssistedDecision {
  return typeof value === "string" && (ASSISTED_DECISIONS as readonly string[]).includes(value);
}

/**
 * Only approved and rejected close a request. "Needs information" deliberately
 * leaves resolved_at null, so the request stays in the queue and stays
 * answerable -- which is the honest reading of asking someone a question.
 */
export function decisionIsTerminal(decision: AssistedDecision): boolean {
  return decision === "approved" || decision === "rejected";
}

export function decisionEvent(decision: AssistedDecision): AuditEvent {
  if (decision === "approved") return "access_request.approved";
  if (decision === "rejected") return "access_request.rejected";
  return "access_request.information_requested";
}

/**
 * ONE key for either terminal outcome, so at most one terminal decision per
 * request can ever exist: a second approve, or a reject after an approve,
 * collides on audit_events_idempotency_key_idx and loses.
 *
 * That index is table-wide and is NOT declared NULLS NOT DISTINCT, so a null
 * key is always insertable -- which is why non-terminal events carry none and
 * can be repeated.
 */
export function decisionIdempotencyKey(requestId: string, decision: AssistedDecision): string | null {
  return decisionIsTerminal(decision) ? `access_request:${requestId}:decision` : null;
}

export interface Verification {
  method: string;
  verified_by: string;
}

const MAX_FIELD = 500;

/**
 * What the reviewer records: what independent control or authority they
 * verified, and who verified it. Free text on purpose -- enumerating accepted
 * methods would make this repository assert a verification policy that DEC-06
 * says does not exist yet. The operator names what they actually checked.
 */
export function parseVerification(input: unknown): Verification | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const method = typeof record.method === "string" ? record.method.trim() : "";
  const verifiedBy = typeof record.verified_by === "string" ? record.verified_by.trim() : "";
  if (!method || !verifiedBy) return null;
  if (method.length > MAX_FIELD || verifiedBy.length > MAX_FIELD) return null;
  return { method, verified_by: verifiedBy };
}
