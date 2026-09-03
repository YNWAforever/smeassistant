import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  workspaceMaybeSingle: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseServer: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.workspaceMaybeSingle }),
      }),
    }),
  }),
}));

import { loadWorkspaceBillingContext } from "./billing-authorization";

const OWNER = {
  ok: true,
  user: { id: "user-1", email: "u@example.com", verified: true },
  membership: { workspaceId: "ws-1", workspaceSlug: "demo", userId: "user-1", email: "u@example.com", role: "owner", locationScope: null },
};

describe("loadWorkspaceBillingContext", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("asks for owner access -- billing is an owner setting (§3.9)", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(OWNER);
    mocks.workspaceMaybeSingle.mockResolvedValue({ data: null, error: null });
    await loadWorkspaceBillingContext("ws-1");
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: "ws-1" }, { minRole: "owner" });
  });

  it("returns the 401 decision and no workspace when there is no session", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    const result = await loadWorkspaceBillingContext("ws-1");
    expect(result.access).toEqual({ ok: false, status: 401, code: "unauthenticated" });
    expect(result.workspace).toBeNull();
    // Must not attempt the workspace lookup at all without a resolved owner.
    expect(mocks.workspaceMaybeSingle).not.toHaveBeenCalled();
  });

  it("refuses a manager or viewer without reading the workspace", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    const result = await loadWorkspaceBillingContext("ws-1");
    expect(result.access).toEqual({ ok: false, status: 403, code: "forbidden" });
    expect(result.workspace).toBeNull();
    expect(mocks.workspaceMaybeSingle).not.toHaveBeenCalled();
  });

  it("loads the workspace's billing columns for an owner", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(OWNER);
    mocks.workspaceMaybeSingle.mockResolvedValue({
      data: { id: "ws-1", slug: "demo", market: "hk", tier: "lite", stripe_customer_id: null },
      error: null,
    });
    const result = await loadWorkspaceBillingContext("ws-1");
    expect(result.access.ok).toBe(true);
    expect(result.workspace).toEqual({ id: "ws-1", slug: "demo", market: "hk", tier: "lite", stripe_customer_id: null });
  });

  it("returns a null workspace when the row is gone", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(OWNER);
    mocks.workspaceMaybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await loadWorkspaceBillingContext("ws-1");
    expect(result.workspace).toBeNull();
  });
});
