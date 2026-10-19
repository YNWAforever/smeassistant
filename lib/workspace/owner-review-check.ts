import { safeGoogleMapsUrl } from "@/lib/report/sanitize-proof";
import type { AuditEventRow } from "./queries-pages";
import type { AuditEvent } from "./audit";
import { localized, type LocalizedText } from "@/lib/domain";

export const OWNER_REVIEW_CHECK_EVENT = "action.owner_review_check_recorded" satisfies AuditEvent;
export type OwnerCheckDecision = "checked" | "not_found" | "later" | "retracted";
export interface OwnerCheckCommand {
  versionId: string;
  latestVersionId: string;
  expectedRecordId: string | null;
  requestId: string;
  decision: OwnerCheckDecision;
  reviewReference: string;
  note: string;
  evidenceAssetId: string | null;
  confirmBusiness: boolean;
  confirmReview: boolean;
  confirmReply: boolean;
}
export interface OwnerCheckRecord {
  id: string;
  versionId: string;
  decision: OwnerCheckDecision;
  reviewReference: string;
  note: string;
  evidenceAssetId: string | null;
  evidenceLabel: string | null;
  previousId: string | null;
  recordedAt: string;
  /** A member statement and any attached screenshot never establish independent verification. */
  independent: false;
}
export interface OwnerCheckContext {
  records: OwnerCheckRecord[];
  appliedVersionIds: string[];
  unavailable?: boolean;
}
export const EMPTY_OWNER_CHECK: OwnerCheckContext = { records: [], appliedVersionIds: [], unavailable: true };
export function ownerCheckNextStep(decision: OwnerCheckDecision | "not_applied"): LocalizedText {
  if (decision === "checked") return localized("Await independent confirmation", "等待獨立來源核實");
  if (decision === "not_found") return localized("Locate the correct review and resolve the mismatch", "定位正確評論並處理不符之處");
  if (decision === "not_applied") return localized("Select the applied version to check", "選擇已套用版本進行核對");
  return localized("Return to the three manual checks when ready", "準備好後返回這三項人工核對");
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// audit_events uses a bigint sequence. Keep its ID opaque to avoid integer rounding.
const auditId = /^[1-9][0-9]{0,18}$/;
const fields = ["versionId", "latestVersionId", "expectedRecordId", "requestId", "decision", "reviewReference", "note", "evidenceAssetId", "confirmBusiness", "confirmReview", "confirmReply"] as const;
const decisions: readonly string[] = ["checked", "not_found", "later", "retracted"];

export function parseOwnerCheck(value: unknown): { ok: true; command: OwnerCheckCommand } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("invalid_check");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => ![...fields, "locale"].includes(key as typeof fields[number]))) return fail("invalid_check");
  if (!["versionId", "latestVersionId", "requestId"].every(key => typeof body[key] === "string" && uuid.test(body[key] as string))) return fail("invalid_check");
  if (body.expectedRecordId !== null && (typeof body.expectedRecordId !== "string" || !auditId.test(body.expectedRecordId))) return fail("invalid_check");
  if (body.evidenceAssetId !== null && (typeof body.evidenceAssetId !== "string" || !uuid.test(body.evidenceAssetId))) return fail("invalid_check");
  if (typeof body.decision !== "string" || !decisions.includes(body.decision)) return fail("invalid_check");
  if (typeof body.note !== "string" || body.note.length > 2000 ||
    typeof body.reviewReference !== "string" || body.reviewReference.length > 500) return fail("invalid_check");
  if (!["confirmBusiness", "confirmReview", "confirmReply"].every(key => typeof body[key] === "boolean")) return fail("invalid_check");
  const note = body.note.trim(), reviewReference = body.reviewReference.trim();
  if (body.decision === "checked") {
    if (!body.confirmBusiness || !body.confirmReview || !body.confirmReply) return fail("confirm_all");
    if (!reviewReference) return fail("review_reference_required");
  }
  if ((body.decision === "not_found" || body.decision === "retracted") && !note) return fail("note_required");
  if (body.decision === "retracted" && !body.expectedRecordId) return fail("previous_check_required");
  return { ok: true, command: {
    versionId: body.versionId as string, latestVersionId: body.latestVersionId as string,
    expectedRecordId: body.expectedRecordId as string | null, requestId: body.requestId as string,
    decision: body.decision as OwnerCheckDecision, reviewReference, note,
    evidenceAssetId: body.evidenceAssetId as string | null,
    confirmBusiness: body.confirmBusiness as boolean, confirmReview: body.confirmReview as boolean, confirmReply: body.confirmReply as boolean,
  } };
}

/** The event itself is owner provenance. Never accept a payload's "verified" flag. */
export function ownerCheckHistory(
  rows: readonly (Omit<AuditEventRow, "id"> & { id: string | number })[],
  scope: { workspaceId: string; actionId: string; locationId: string | null },
): OwnerCheckRecord[] {
  return rows.flatMap(row => {
    if (row.workspace_id !== scope.workspaceId || row.location_id !== scope.locationId ||
      row.entity_type !== "action" || row.entity_id !== scope.actionId || row.event !== OWNER_REVIEW_CHECK_EVENT ||
      typeof row.id === "number" && !Number.isSafeInteger(row.id) ||
      !auditId.test(String(row.id)) || !Number.isFinite(Date.parse(row.created_at))) return [];
    const value = row.payload?.owner_check;
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const data = value as Record<string, unknown>;
    const parsed = parseOwnerCheck(Object.fromEntries(fields.map(key => [key, data[key]])));
    if (!parsed.ok) return [];
    const command = parsed.command;
    return [{
      id: String(row.id), versionId: command.versionId, decision: command.decision,
      reviewReference: command.reviewReference, note: command.note,
      evidenceAssetId: command.evidenceAssetId,
      evidenceLabel: typeof data.evidenceLabel === "string" ? data.evidenceLabel.slice(0, 255) : null,
      previousId: command.expectedRecordId, recordedAt: row.created_at, independent: false as const,
    }];
  }).sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt) || b.recordedAt.localeCompare(a.recordedAt) || b.id.length - a.id.length || b.id.localeCompare(a.id));
}

/** Only a business Maps page. The retained evidence has no exact review URL. No fetch or resolution. */
export function ownerCheckBusinessLink(value: unknown): string | null {
  const safe = safeGoogleMapsUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  return url.hostname === "maps.app.goo.gl" || /^\/maps(?:\/|$)/.test(url.pathname) ||
    /^maps\.google\./.test(url.hostname) && url.pathname === "/" ? safe : null;
}
