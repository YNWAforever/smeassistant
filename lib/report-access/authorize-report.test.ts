import { describe, expect, it, vi } from "vitest";
import { authorizeReport, type ViewerGrantRecord } from "./authorize-report";
import { createViewerToken } from "./token";

const now = new Date("2026-07-14T00:00:00.000Z");

function grantRecord(overrides: Partial<ViewerGrantRecord> = {}): ViewerGrantRecord {
  const token = createViewerToken();
  return {
    id: "grant-1",
    job_id: "job-1",
    token_hash: token.tokenHash,
    expires_at: "2026-07-15T00:00:00.000Z",
    redeemed_at: null,
    revoked_at: null,
    last_used_at: null,
    rawToken: token.rawToken,
    ...overrides,
  };
}

describe("report authorization", () => {
  it("does not treat audit_jobs.unlocked as authorization", async () => {
    const access = await authorizeReport({
      job: { id: "job-1", unlocked: true },
      viewerToken: null,
      staffUser: null,
      now,
    });

    expect(access).toEqual({ kind: "public" });
  });

  it("authorizes only an unexpired unrevoked grant bound to the same job", async () => {
    const grant = grantRecord();
    const markUsed = vi.fn(async () => undefined);

    const access = await authorizeReport({
      job: { id: "job-1", unlocked: false },
      viewerToken: { grantId: grant.id, rawToken: grant.rawToken! },
      staffUser: null,
      lookupGrant: async () => grant,
      markUsed,
      now,
    });

    expect(access).toEqual({ kind: "viewer", grantId: grant.id });
    expect(markUsed).toHaveBeenCalledWith(grant.id);
  });

  it.each([
    ["wrong job", { job_id: "job-2" }],
    ["expired", { expires_at: "2026-07-13T23:59:59.000Z" }],
    ["revoked", { revoked_at: "2026-07-13T00:00:00.000Z" }],
  ])("rejects a %s grant", async (_label, overrides) => {
    const grant = grantRecord(overrides);
    const markUsed = vi.fn(async () => undefined);

    const access = await authorizeReport({
      job: { id: "job-1", unlocked: true },
      viewerToken: { grantId: grant.id, rawToken: grant.rawToken! },
      staffUser: null,
      lookupGrant: async () => grant,
      markUsed,
      now,
    });

    expect(access).toEqual({ kind: "public" });
    expect(markUsed).not.toHaveBeenCalled();
  });

  it("rejects a token whose hash does not match the stored grant", async () => {
    const grant = grantRecord();
    const different = createViewerToken();
    const markUsed = vi.fn(async () => undefined);

    const access = await authorizeReport({
      job: { id: "job-1" },
      viewerToken: { grantId: grant.id, rawToken: different.rawToken },
      staffUser: null,
      lookupGrant: async () => grant,
      markUsed,
      now,
    });

    expect(access).toEqual({ kind: "public" });
    expect(markUsed).not.toHaveBeenCalled();
  });

  // Upstream grants `staff` access to an allowlisted Supabase session here. The
  // staff console stays in the legacy deployment (CLAUDE.md 1.2 "Not reused"),
  // so lib/auth/staff.ts fails closed and a staff-looking session is public.
  it("never grants staff access in this app, even for an allowlisted-looking session", async () => {
    const previous = process.env.FIMMICK_STAFF_EMAILS;
    process.env.FIMMICK_STAFF_EMAILS = "staff@fimmick.com";
    try {
      const access = await authorizeReport({
        job: { id: "job-1", unlocked: false },
        viewerToken: null,
        staffUser: { id: "staff-1", email: "Staff@Fimmick.com" },
        now,
      });

      expect(access).toEqual({ kind: "public" });
    } finally {
      if (previous === undefined) delete process.env.FIMMICK_STAFF_EMAILS;
      else process.env.FIMMICK_STAFF_EMAILS = previous;
    }
  });
});

describe("workspace member access", () => {
  it("grants member access from an accepted membership on the job's workspace", async () => {
    const access = await authorizeReport({
      job: { id: "job-1", unlocked: false, workspace_id: "ws-1" },
      viewerToken: null,
      staffUser: null,
      workspaceMembership: { workspaceId: "ws-1", role: "manager" },
      now,
    });

    expect(access).toEqual({ kind: "member", workspaceId: "ws-1", role: "manager" });
  });

  it("prefers membership over a valid viewer grant and never touches the grant", async () => {
    const grant = grantRecord();
    const lookupGrant = vi.fn(async () => grant);
    const markUsed = vi.fn(async () => undefined);

    const access = await authorizeReport({
      job: { id: "job-1", workspace_id: "ws-1" },
      viewerToken: { grantId: grant.id, rawToken: grant.rawToken! },
      staffUser: null,
      workspaceMembership: { workspaceId: "ws-1", role: "viewer" },
      lookupGrant,
      markUsed,
      now,
    });

    expect(access).toEqual({ kind: "member", workspaceId: "ws-1", role: "viewer" });
    expect(lookupGrant).not.toHaveBeenCalled();
    expect(markUsed).not.toHaveBeenCalled();
  });

  it.each([
    ["a membership on a different workspace", { id: "job-1", workspace_id: "ws-1" }, { workspaceId: "ws-2", role: "owner" as const }],
    ["a job that is not attached to any workspace", { id: "job-1", workspace_id: null }, { workspaceId: "ws-1", role: "owner" as const }],
    ["an unknown role", { id: "job-1", workspace_id: "ws-1" }, { workspaceId: "ws-1", role: "admin" as never }],
    ["a blank workspace id", { id: "job-1", workspace_id: "" }, { workspaceId: "", role: "owner" as const }],
  ])("fails closed for %s", async (_label, job, workspaceMembership) => {
    const access = await authorizeReport({
      job,
      viewerToken: null,
      staffUser: null,
      workspaceMembership,
      now,
    });

    expect(access).toEqual({ kind: "public" });
  });

  it("falls through to the viewer grant when the membership is rejected", async () => {
    const grant = grantRecord();

    const access = await authorizeReport({
      job: { id: "job-1", workspace_id: "ws-1" },
      viewerToken: { grantId: grant.id, rawToken: grant.rawToken! },
      staffUser: null,
      workspaceMembership: { workspaceId: "ws-2", role: "owner" },
      lookupGrant: async () => grant,
      now,
    });

    expect(access).toEqual({ kind: "viewer", grantId: grant.id });
  });

  it("trusts the caller's scoping when the job row carries no workspace_id", async () => {
    const access = await authorizeReport({
      job: { id: "job-1" },
      viewerToken: null,
      staffUser: null,
      workspaceMembership: { workspaceId: "ws-1", role: "owner" },
      now,
    });

    expect(access).toEqual({ kind: "member", workspaceId: "ws-1", role: "owner" });
  });
});
