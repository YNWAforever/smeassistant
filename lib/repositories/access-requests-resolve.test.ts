import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above every top-level const, so the mocks they
// close over must be created with vi.hoisted -- the pattern assets.test.ts uses.
const mocks = vi.hoisted(() => ({
  createWorkspaceWithOwner: vi.fn(),
  attachJob: vi.fn(),
  client: { query: vi.fn() },
}));
vi.mock("./claims", () => ({
  claimsRepository: { createWorkspaceWithOwner: mocks.createWorkspaceWithOwner, attachJob: mocks.attachJob },
}));
vi.mock("../db/transaction", () => ({
  withTransaction: (run: (c: unknown) => Promise<unknown>) => run(mocks.client),
}));
vi.mock("../db/client", () => ({ getPool: () => ({ query: vi.fn() }) }));

const { createWorkspaceWithOwner, attachJob, client } = mocks;

import { resolveAccessRequest } from "./access-requests";

const REQUEST = {
  id: "33333333-3333-4333-8333-333333333333",
  job_id: "job-1",
  user_id: "u-1",
  requester_email: "owner@example.test",
  business_name: "Kam Man House",
  region: "hk",
  industry: null as string | null,
  district: null as string | null,
};

beforeEach(() => {
  vi.resetAllMocks();
  client.query.mockResolvedValue({ rows: [], rowCount: 1 });
  createWorkspaceWithOwner.mockResolvedValue({ id: "ws-1", slug: "kam-man-house" });
  attachJob.mockResolvedValue(true);
});

function approve(over: Record<string, unknown> = {}) {
  return resolveAccessRequest({
    request: REQUEST,
    decision: "approved",
    reason: "Registration checked",
    verification: { method: "BR12345678", verified_by: "Ada Wong" },
    operator: { userId: "op-1", email: "ada.wong@fimmick.com" },
    ...over,
  });
}

describe("resolveAccessRequest", () => {
  it("claims the idempotency key BEFORE creating anything", async () => {
    await approve();
    const firstSql = String(client.query.mock.calls[0][0]);
    expect(firstSql).toContain("INSERT INTO audit_events");
    expect(client.query.mock.calls[0][1]).toContain(`access_request:${REQUEST.id}:decision`);
    // Order is the guarantee: a concurrent approver must lose before a
    // workspace exists, not after.
    expect(createWorkspaceWithOwner.mock.invocationCallOrder[0]).toBeGreaterThan(
      client.query.mock.invocationCallOrder[0],
    );
  });

  it("creates the workspace and attaches the job on the SAME client", async () => {
    const result = await approve();
    expect(result).toEqual({ ok: true, workspaceId: "ws-1", slug: "kam-man-house" });
    expect(createWorkspaceWithOwner).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: "u-1", ownerEmail: "owner@example.test", market: "hk" }),
      client,
    );
    expect(attachJob).toHaveBeenCalledWith("job-1", "ws-1", client);
  });

  it("closes the row and emits workspace.assigned", async () => {
    await approve();
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((s) => /UPDATE workspace_access_requests/.test(s) && /resolved_at=now\(\)/.test(s))).toBe(true);
    expect(client.query.mock.calls.some(([, params]) => Array.isArray(params) && params.includes("workspace.assigned"))).toBe(true);
  });

  it("refuses when the job was claimed while the request sat in the queue", async () => {
    attachJob.mockResolvedValue(false);
    await expect(approve()).rejects.toThrow("already_claimed");
  });

  it("creates no workspace when rejecting, and still closes the row", async () => {
    const result = await resolveAccessRequest({
      request: REQUEST,
      decision: "rejected",
      reason: "Could not verify the registration",
      verification: { method: "BR lookup", verified_by: "Ada Wong" },
      operator: { userId: "op-1", email: "ada.wong@fimmick.com" },
    });
    expect(result).toEqual({ ok: true, workspaceId: null, slug: null });
    expect(createWorkspaceWithOwner).not.toHaveBeenCalled();
    expect(attachJob).not.toHaveBeenCalled();
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((s) => /UPDATE workspace_access_requests/.test(s))).toBe(true);
  });

  it("leaves the row open when only asking for information", async () => {
    const result = await resolveAccessRequest({
      request: REQUEST,
      decision: "needs_information",
      reason: "Please send the registration number",
      verification: null,
      operator: { userId: "op-1", email: "ada.wong@fimmick.com" },
    });
    expect(result).toEqual({ ok: true, workspaceId: null, slug: null });
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((s) => /UPDATE workspace_access_requests/.test(s))).toBe(false);
    // Non-terminal events carry no key, so the operator can ask twice.
    expect(client.query.mock.calls[0][1]).toContain(null);
  });
});
