import { describe, expect, it } from "vitest";
import { localized } from "@/lib/domain";
import { selectHomeReviewFollowUp, type HomeReviewCandidate } from "./home-review-follow-up";
import { OWNER_REVIEW_CHECK_EVENT } from "./owner-review-check";
const id = (n: number) => `${n}`.repeat(8) + "-1111-4111-8111-111111111111";
const scope = { workspaceId: id(1), locationId: id(2), allowedLocationIds: null, role: "owner" as const };
const candidate = (): HomeReviewCandidate => ({
  workspace_id: id(1), location_id: id(2), action_id: id(3), action_state: "completed",
  title: localized("Synthetic applied reply", "合成已套用回覆"), version_id: id(4), version_no: 2,
  approval_state: "approved", delivery_state: "exported", applied_at: "2026-10-01T00:00:00Z",
  latest_version_id: id(5), latest_version_no: 3, latest_approval_state: "draft", owner_check: null,
});
const audit = (versionId = id(4)): NonNullable<HomeReviewCandidate["owner_check"]> => ({
  id: "7", workspace_id: id(1), location_id: id(2), actor_type: "user", actor_id: id(6),
  event: OWNER_REVIEW_CHECK_EVENT, entity_type: "action", entity_id: id(3),
  payload: { owner_check: {
    versionId, latestVersionId: id(5), expectedRecordId: null, requestId: id(7),
    decision: "checked", reviewReference: "Synthetic reviewer · date", note: "Private owner note",
    evidenceAssetId: null, confirmBusiness: true, confirmReview: true, confirmReply: true,
  } }, created_at: "2026-10-19T03:00:00Z",
});
describe("home review follow-up projection (offline metadata)", () => {
  it("uses the applied V2 and never inherits a V3 or foreign check; does not serialize private notes", () => {
    expect(selectHomeReviewFollowUp([{ ...candidate(), owner_check: audit(id(5)) }], scope))
      .toMatchObject({ versionId: id(4), versionNo: 2, currentCheck: null, newerDraft: { id: id(5), versionNo: 3 } });
    expect(selectHomeReviewFollowUp([{ ...candidate(), owner_check: { ...audit(), workspace_id: id(8) } }], scope)?.currentCheck).toBeNull();
    const selected = selectHomeReviewFollowUp([{ ...candidate(), owner_check: audit() }], scope);
    expect(selected?.currentCheck).toEqual({ id: "7", decision: "checked", recordedAt: "2026-10-19T03:00:00Z" });
    expect(JSON.stringify(selected)).not.toContain("Private owner note");
  });
  it("fails closed on workspace/location scope, retains Completed and makes viewers read-only", () => {
    const row = candidate();
    expect(selectHomeReviewFollowUp([], scope)).toBeNull();
    expect(selectHomeReviewFollowUp([{ ...row, workspace_id: id(8) }], scope)).toBeNull();
    expect(selectHomeReviewFollowUp([{ ...row, location_id: id(8) }], scope)).toBeNull();
    expect(selectHomeReviewFollowUp([row], { ...scope, role: "manager", allowedLocationIds: [] })).toBeNull();
    expect(selectHomeReviewFollowUp([row], { ...scope, role: "viewer" })).toMatchObject({ actionState: "completed", canRecord: false });
    expect(row.action_state).toBe("completed");
    expect(selectHomeReviewFollowUp([{ ...row, action_state: "in_progress" }], scope)).toBeNull();
  });
  it("prefers an unchecked recent item without dropping the completed check history", () => {
    const checked = { ...candidate(), owner_check: audit() };
    const pending = { ...candidate(), action_id: id(8), owner_check: null };
    expect(selectHomeReviewFollowUp([checked, pending], scope)?.actionId).toBe(id(8));
    expect(selectHomeReviewFollowUp([checked], scope)?.currentCheck?.decision).toBe("checked");
    expect(checked.owner_check).toEqual(audit());
  });
});
