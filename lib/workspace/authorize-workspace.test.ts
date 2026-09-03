import { describe, expect, it } from "vitest";
import { authorizeWorkspace } from "./authorize-workspace";

const SESSION_USER = { id: "user-1", email: "owner@example.com" };

describe("authorizeWorkspace", () => {
  it("grants owner access from a bound owner membership", () => {
    expect(
      authorizeWorkspace({
        membership: { workspaceId: "ws-1", role: "owner" },
        sessionUser: SESSION_USER,
      }),
    ).toEqual({ kind: "member", workspaceId: "ws-1", userId: "user-1", role: "owner" });
  });

  it("grants manager access from a bound manager membership", () => {
    expect(
      authorizeWorkspace({
        membership: { workspaceId: "ws-1", role: "manager" },
        sessionUser: SESSION_USER,
      }),
    ).toEqual({ kind: "member", workspaceId: "ws-1", userId: "user-1", role: "manager" });
  });

  it("grants viewer access from a bound viewer membership", () => {
    expect(
      authorizeWorkspace({
        membership: { workspaceId: "ws-1", role: "viewer" },
        sessionUser: SESSION_USER,
      }),
    ).toEqual({ kind: "member", workspaceId: "ws-1", userId: "user-1", role: "viewer" });
  });

  it("denies a signed-in user with no membership on this workspace", () => {
    expect(authorizeWorkspace({ membership: null, sessionUser: SESSION_USER })).toEqual({ kind: "none" });
  });

  it("denies an anonymous visitor", () => {
    expect(
      authorizeWorkspace({ membership: { workspaceId: "ws-1", role: "owner" }, sessionUser: null }),
    ).toEqual({ kind: "none" });
  });

  it("grants staff access when there is no membership", () => {
    // Staff already read any report via authorize-report; withholding the
    // workspace view would not protect anything, it would just make BD blind.
    expect(
      authorizeWorkspace({
        membership: null,
        sessionUser: { id: "staff-1", email: "staff@fimmick.com" },
        isStaffEmail: () => true,
      }),
    ).toEqual({ kind: "staff", userId: "staff-1", email: "staff@fimmick.com" });
  });

  it("prefers membership over staff when a staff member is also a bound member", () => {
    // Deliberately the reverse of authorizeReport's staff-first ordering. A
    // bound membership is the more specific claim, and a staff member looking
    // at a workspace they also belong to is acting as a member, not as staff.
    expect(
      authorizeWorkspace({
        membership: { workspaceId: "ws-1", role: "viewer" },
        sessionUser: { id: "user-1", email: "staff@fimmick.com" },
        isStaffEmail: () => true,
      }),
    ).toEqual({ kind: "member", workspaceId: "ws-1", userId: "user-1", role: "viewer" });
  });

  it("ignores a session with no id", () => {
    expect(
      authorizeWorkspace({
        membership: { workspaceId: "ws-1", role: "owner" },
        sessionUser: { id: "  ", email: "x@y.com" },
      }),
    ).toEqual({ kind: "none" });
  });

  it("normalises the staff email it reports", () => {
    expect(
      authorizeWorkspace({
        membership: null,
        sessionUser: { id: "staff-1", email: "  Staff@Fimmick.com " },
        isStaffEmail: () => true,
      }),
    ).toEqual({ kind: "staff", userId: "staff-1", email: "staff@fimmick.com" });
  });
});
