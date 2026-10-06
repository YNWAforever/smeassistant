import { describe, expect, it } from "vitest";
import { parseBulkActionUpdate, parseAssignmentPatch } from "./action-assignment";
import { actionBulkAssignEnabled } from "./bulk-flag";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const item = (n: number) => ({ actionId: id(n), expectedUpdatedAt: "2026-10-01T00:00:00.123456Z" });
const request = { mode: "preview", items: [item(1)], patch: { due_at: null } };
describe("assignment request boundary (T-13)", () => {
  it("retains exact immutable action timestamps and accepts explicit clears", () => {
    expect(parseBulkActionUpdate(request)).toEqual(request);
    expect(parseAssignmentPatch({ assignee_user_id: null, due_at: "2026-10-12T09:00:00+08:00" })).toEqual({ assignee_user_id: null, due_at: "2026-10-12T09:00:00+08:00" });
  });
  it.each([{}, { action_state: "completed" }, { approve: true }, { publish: true }, { generate: true }, { delete: true }, { due_at: "2026-10-12T09:00:00" }, { due_at: "2026-02-30T09:00:00Z" }, { assignee_user_id: "outside" }])("rejects empty, privileged and malformed patches %j", patch => {
    expect(() => parseAssignmentPatch(patch)).toThrow("invalid_assignment_patch");
  });
  it.each([{ ...request, items: [] }, { ...request, items: [item(1), item(1)] }, { ...request, items: Array.from({ length: 51 }, (_, i) => item(i + 1)) }, { ...request, mode: "approve" }, { ...request, extra: "ignore?" }, { ...request, items: [{ ...item(1), name: "foreign" }] }, { ...request, items: [{ actionId: id(1), expectedUpdatedAt: "yesterday" }] }])("rejects invalid selection %j", value => {
    expect(() => parseBulkActionUpdate(value)).toThrow("invalid_bulk_request");
  });
  it("ships the new flag off unless exactly true", () => {
    for (const value of [undefined, "false", "TRUE", "1"]) expect(actionBulkAssignEnabled({ ACTION_BULK_ASSIGN_ENABLED: value })).toBe(false);
    expect(actionBulkAssignEnabled({ ACTION_BULK_ASSIGN_ENABLED: "true" })).toBe(true);
  });
});
