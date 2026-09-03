import { describe, expect, it, vi } from "vitest";
import { recordAccessRequest, shouldRecordAccessRequest } from "./access-request";

describe("shouldRecordAccessRequest", () => {
  it("records when a signed-in user owns no workspace and named a report", () => {
    expect(shouldRecordAccessRequest({ hasWorkspace: false, slug: "abc123" })).toBe(true);
  });

  it("does not record when the user already owns a workspace", () => {
    expect(shouldRecordAccessRequest({ hasWorkspace: true, slug: "abc123" })).toBe(false);
  });

  it("does not record without a slug — a request must name a report", () => {
    expect(shouldRecordAccessRequest({ hasWorkspace: false, slug: null })).toBe(false);
    expect(shouldRecordAccessRequest({ hasWorkspace: false, slug: "   " })).toBe(false);
  });

  it("does not record for a returning owner whose bind matched zero rows", () => {
    // The regression this signature exists for. bindByEmail updates WHERE
    // owner_email = <email> AND owner_user_id IS NULL, so an already-bound owner
    // gets BindOutcome "none" on every later sign-in despite owning a workspace.
    // Deciding from the bind outcome would file a request every time they log in.
    expect(shouldRecordAccessRequest({ hasWorkspace: true, slug: "abc123" })).toBe(false);
  });
});

describe("recordAccessRequest", () => {
  it("writes the account and the report, and no contact details", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    await recordAccessRequest({ jobId: "job-1", userId: "user-1" }, { insert });

    expect(insert).toHaveBeenCalledWith({ job_id: "job-1", user_id: "user-1" });
    // No email, no name, no phone: the row names the account, and the verified
    // address is read from auth.users when staff assign.
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(["job_id", "user_id"]);
  });

  it("throws when the insert fails, leaving the policy to the caller", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    await expect(
      recordAccessRequest({ jobId: "job-1", userId: "user-1" }, { insert }),
    ).rejects.toThrow("Failed to record workspace access request");
  });
});
