import { describe, expect, it } from "vitest";
import { auditBelongsToAction } from "./audit-scope";

const actionId = "action-1";
const entityIds = new Set(["action-1", "version-1", "run-1"]);

describe("action audit scope", () => {
  it("keeps events whose entity is the action, a version, or a run", () => {
    expect(auditBelongsToAction({ entity_id: "version-1", payload: {} }, { actionId, entityIds })).toBe(true);
  });

  it("includes delivery events through their version and action payload", () => {
    expect(auditBelongsToAction({
      entity_id: "delivery-1",
      payload: { action_id: actionId, version_id: "version-1", counted: false },
    }, { actionId, entityIds })).toBe(true);
  });

  it("excludes delivery events from another action or version", () => {
    expect(auditBelongsToAction({
      entity_id: "delivery-foreign",
      payload: { action_id: "action-2", version_id: "version-1" },
    }, { actionId, entityIds })).toBe(false);
    expect(auditBelongsToAction({
      entity_id: "delivery-foreign",
      payload: { action_id: actionId, version_id: "version-2" },
    }, { actionId, entityIds })).toBe(false);
  });
});
