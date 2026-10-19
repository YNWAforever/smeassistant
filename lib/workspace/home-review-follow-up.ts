import { isLocalizedText, type ApprovalState, type DeliveryState, type LocalizedText } from "@/lib/domain";
import { ownerCheckHistory, type OwnerCheckRecord } from "./owner-review-check";
import type { WorkspaceRole } from "./authorize-workspace";

/** Metadata from existing versions, applications and audit; never a new task. */
export interface HomeReviewCandidate {
  workspace_id: string;
  action_id: string;
  location_id: string | null;
  title: unknown;
  action_state: string;
  version_id: string;
  version_no: number;
  approval_state: ApprovalState;
  delivery_state: DeliveryState;
  applied_at: string;
  latest_version_id: string;
  latest_version_no: number;
  latest_approval_state: ApprovalState;
  owner_check: Parameters<typeof ownerCheckHistory>[0][number] | null;
}
export interface HomeReviewFollowUp {
  workspaceId: string;
  actionId: string;
  locationId: string | null;
  title: LocalizedText;
  actionState: "completed";
  versionId: string;
  versionNo: number;
  approvalState: ApprovalState;
  deliveryState: DeliveryState;
  appliedAt: string;
  currentCheck: Pick<OwnerCheckRecord, "id" | "decision" | "recordedAt"> | null;
  canRecord: boolean;
  newerDraft: { id: string; versionNo: number } | null;
}
export function selectHomeReviewFollowUp(rows: HomeReviewCandidate[], scope: {
  workspaceId: string; locationId: string | null; allowedLocationIds: string[] | null; role: WorkspaceRole;
}): HomeReviewFollowUp | null {
  const candidates = rows.filter(row => row.workspace_id === scope.workspaceId && row.action_state === "completed"
    && (!scope.locationId || row.location_id === null || row.location_id === scope.locationId)
    && (!scope.allowedLocationIds || row.location_id === null || scope.allowedLocationIds.includes(row.location_id))
    && isLocalizedText(row.title) && Number.isFinite(Date.parse(row.applied_at))).map(row => {
    const check = ownerCheckHistory(row.owner_check ? [row.owner_check] : [], {
      workspaceId: scope.workspaceId, actionId: row.action_id, locationId: row.location_id,
    }).find(record => record.versionId === row.version_id);
    return {
      workspaceId: row.workspace_id, actionId: row.action_id, locationId: row.location_id,
      title: row.title as LocalizedText, actionState: "completed" as const,
      versionId: row.version_id, versionNo: row.version_no, approvalState: row.approval_state,
      deliveryState: row.delivery_state, appliedAt: row.applied_at,
      currentCheck: check ? { id: check.id, decision: check.decision, recordedAt: check.recordedAt } : null,
      canRecord: scope.role !== "viewer" && (scope.role !== "manager" || !scope.allowedLocationIds
        || row.location_id !== null && scope.allowedLocationIds.includes(row.location_id)),
      newerDraft: row.latest_version_no > row.version_no &&
        ["draft", "changes_requested"].includes(row.latest_approval_state)
        ? { id: row.latest_version_id, versionNo: row.latest_version_no } : null,
    };
  });
  // Prefer an unchecked item within this explicitly bounded recent selection.
  return candidates.find(row => row.currentCheck?.decision !== "checked") ?? candidates[0] ?? null;
}
