import { describe, expect, it } from "vitest";
import { ownerCheckHistory, parseOwnerCheck, ownerCheckBusinessLink, OWNER_REVIEW_CHECK_EVENT } from "./owner-review-check";

const ids = { workspace: "11111111-1111-4111-8111-111111111111", action: "22222222-2222-4222-8222-222222222222", version: "33333333-3333-4333-8333-333333333333", request: "44444444-4444-4444-8444-444444444444" };
const command = () => ({
  versionId: ids.version, latestVersionId: ids.version, expectedRecordId: null, requestId: ids.request,
  decision: "checked", reviewReference: "Customer A · 2026-10-01 · helpful service", note: "Reply matches.",
  evidenceAssetId: null, confirmBusiness: true, confirmReview: true, confirmReply: true,
});

describe("owner review check commands", () => {
  it("requires the merchant, review and saved reply to be confirmed before an owner check", () => {
    expect(parseOwnerCheck(command()).ok).toBe(true);
    for (const key of ["confirmBusiness", "confirmReview", "confirmReply"]) {
      expect(parseOwnerCheck({ ...command(), [key]: false })).toEqual({ ok: false, error: "confirm_all" });
    }
    expect(parseOwnerCheck({ ...command(), reviewReference: "" })).toEqual({ ok: false, error: "review_reference_required" });
  });
  it("records an unsuccessful check or deferral without making a positive claim", () => {
    expect(parseOwnerCheck({ ...command(), decision: "not_found", confirmReview: false }).ok).toBe(true);
    expect(parseOwnerCheck({ ...command(), decision: "later", note: "", reviewReference: "", confirmReview: false }).ok).toBe(true);
    expect(parseOwnerCheck({ ...command(), decision: "not_found", note: "" }).ok).toBe(false);
  });
  it("requires an existing record and an explanation for an append-only retraction", () => {
    expect(parseOwnerCheck({ ...command(), decision: "retracted" }).ok).toBe(false);
    expect(parseOwnerCheck({ ...command(), decision: "retracted", expectedRecordId: "1" }).ok).toBe(true);
    expect(parseOwnerCheck({ ...command(), decision: "retracted", expectedRecordId: "1", note: "" }).ok).toBe(false);
  });
  it("rejects forged independent verification, malformed version bindings and oversize notes", () => {
    expect(parseOwnerCheck({ ...command(), verified: true }).ok).toBe(false);
    expect(parseOwnerCheck({ ...command(), versionId: "wrong" }).ok).toBe(false);
    expect(parseOwnerCheck({ ...command(), note: "x".repeat(2001) }).ok).toBe(false);
  });
});

describe("version and tenant scoped owner history", () => {
  const scope = { workspaceId: ids.workspace, actionId: ids.action, locationId: null };
  const row = {
    id: 1, workspace_id: ids.workspace, location_id: null, actor_type: "user" as const, actor_id: ids.workspace,
    event: OWNER_REVIEW_CHECK_EVENT, entity_type: "action", entity_id: ids.action, created_at: "2026-10-19T01:00:00.000Z",
    payload: { owner_check: { ...command(), evidenceLabel: null } },
  };
  it("retains owner provenance even when the audit payload forges verified=true", () => {
    const history = ownerCheckHistory([{ ...row, payload: { owner_check: { ...command(), verified: true } } }], scope);
    expect(history[0]).toMatchObject({ versionId: ids.version, decision: "checked", independent: false });
  });
  it("does not read another workspace, action or location's history", () => {
    for (const changed of [{ workspace_id: ids.action }, { entity_id: ids.workspace }, { location_id: ids.version }]) {
      expect(ownerCheckHistory([{ ...row, ...changed }], scope)).toEqual([]);
    }
    expect(ownerCheckHistory([{ ...row, event: "action.verified" }], scope)).toEqual([]);
  });
  it("keeps corrections and older versions in history rather than rewriting them", () => {
    const newer = { ...row, id: 2, created_at: "2026-10-19T02:00:00Z",
      payload: { owner_check: { ...command(), versionId: ids.action, decision: "later", expectedRecordId: null } } };
    const history = ownerCheckHistory([row, newer], scope);
    expect(history.map(r => [r.versionId, r.decision])).toEqual([[ids.action, "later"], [ids.version, "checked"]]);
  });
  it("keeps bigint audit IDs as exact decimal tokens and rejects rounded numeric IDs", () => {
    const value = "9007199254740993";
    const rows = ownerCheckHistory([{ ...row, id: value }], scope);
    expect(rows[0].id).toBe(value);
    expect(parseOwnerCheck({ ...command(), expectedRecordId: value }).ok).toBe(true);
    expect(ownerCheckHistory([{ ...row, id: Number(value) }], scope)).toEqual([]);
  });
});

describe("manual business location links", () => {
  it("reuses the existing Google URL sanitizer without inventing a specific review link", () => {
    expect(ownerCheckBusinessLink("https://www.google.com/maps/place/Example")).toBe("https://www.google.com/maps/place/Example");
    for (const bad of ["https://google.com.evil.test/maps", "javascript:alert(1)", "https://u:p@www.google.com/maps", "https://www.google.com/url?q=https://outside.invalid", "https://www.google.com/maps?token=secret"]) {
      expect(ownerCheckBusinessLink(bad)).toBeNull();
    }
  });
});
