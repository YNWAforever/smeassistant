import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeWorkspaceRequest = vi.fn();
const from = vi.fn();

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({ from }) }));

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

function auth(role: "owner" | "manager" | "viewer") {
  return {
    ok: true,
    user: { id: "user-1", email: "o@example.com", verified: true },
    membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "demo", userId: "user-1", email: "o@example.com", role, locationScope: null },
  };
}

function patch(body: unknown, workspaceId = WORKSPACE_ID): Promise<Response> {
  return import("./route").then(({ PATCH }) =>
    PATCH(
      new Request(`https://app.test/api/workspaces/${workspaceId}/notification-preferences`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ workspaceId }) },
    ),
  );
}

afterEach(() => vi.resetAllMocks());

describe("PATCH /api/workspaces/[workspaceId]/notification-preferences", () => {
  it("lets an owner update preferences, writing the snake_case columns", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
    from.mockImplementation(() => ({ update }));

    const res = await patch({ notifyRescanComplete: false, notifyMonthlyDigest: true, notifyRegressionAlert: "yes" });

    expect(res.status).toBe(200);
    // Any accepted member: no minRole is passed (§3.1 marks notifications a member page).
    expect(authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID });
    expect(update).toHaveBeenCalledWith({ notify_rescan_complete: false, notify_monthly_digest: true });
  });

  it("lets a manager and a viewer update preferences", async () => {
    from.mockImplementation(() => ({ update: () => ({ eq: async () => ({ error: null }) }) }));

    authorizeWorkspaceRequest.mockResolvedValue(auth("manager"));
    expect((await patch({ notifyRescanComplete: false })).status).toBe(200);

    authorizeWorkspaceRequest.mockResolvedValue(auth("viewer"));
    expect((await patch({ notifyRescanComplete: false })).status).toBe(200);
  });

  it("refuses someone with no membership on this workspace, and an unknown workspace, without writing", async () => {
    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    expect((await patch({ notifyRescanComplete: false })).status).toBe(403);

    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 404, code: "not_found" });
    expect((await patch({ notifyRescanComplete: false })).status).toBe(404);

    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    expect((await patch({ notifyRescanComplete: false })).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("400s a body with no boolean preference fields and a malformed workspace id", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    expect((await patch({ notifyRescanComplete: "no" })).status).toBe(400);
    expect((await patch({ notifyRescanComplete: false }, "nope")).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
});
