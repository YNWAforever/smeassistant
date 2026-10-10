import { describe, expect, it } from "vitest";
import { INVITATION_TTL_DAYS, pendingInvitationLiveSql } from "./invitation-expiry";

describe("pendingInvitationLiveSql", () => {
  it("is a no-op when not enforced", () => {
    expect(pendingInvitationLiveSql("m", false)).toBe("TRUE");
  });
  it("bounds invited_at by the TTL when enforced", () => {
    expect(INVITATION_TTL_DAYS).toBe(14);
    expect(pendingInvitationLiveSql("m", true)).toBe("m.invited_at > now() - interval '14 days'");
    expect(pendingInvitationLiveSql("workspace_members", true)).toBe("workspace_members.invited_at > now() - interval '14 days'");
  });
  it.each(["", "m; DROP", "M", "m1", "a.b"])("rejects alias %j", alias => {
    expect(() => pendingInvitationLiveSql(alias, true)).toThrow();
  });
});
