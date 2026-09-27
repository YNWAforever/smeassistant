import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeWorkspaceRequest = vi.fn();
const updatePreferences = vi.fn();

vi.mock("@/lib/auth", () => ({
  authorizeWorkspaceRequest: (...args: unknown[]) =>
    authorizeWorkspaceRequest(...args),
}));
vi.mock("@/lib/repositories/notifications", () => ({
  notificationRepository: () => ({ updatePreferences }),
}));

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

function auth(role: "owner" | "manager" | "viewer") {
  return {
    ok: true,
    user: { id: "user-1", email: "o@example.com", verified: true },
    membership: {
      workspaceId: WORKSPACE_ID,
      workspaceSlug: "demo",
      userId: "user-1",
      email: "o@example.com",
      role,
      locationScope: null,
    },
  };
}

function patch(body: unknown, workspaceId = WORKSPACE_ID): Promise<Response> {
  return import("./route").then(({ PATCH }) =>
    PATCH(
      new Request(
        `https://app.test/api/workspaces/${workspaceId}/notification-preferences`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      ),
      { params: Promise.resolve({ workspaceId }) },
    ),
  );
}

afterEach(() => vi.resetAllMocks());

describe("PATCH /api/workspaces/[workspaceId]/notification-preferences", () => {
  it("lets an owner update preferences, writing the snake_case columns", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    updatePreferences.mockResolvedValue(undefined);

    const res = await patch({
      notifyRescanComplete: false,
      notifyMonthlyDigest: true,
      notifyRegressionAlert: "yes",
    });

    expect(res.status).toBe(200);
    // Workspace switches are an owner-only gate now (global-constraints.md
    // departure 2): the workspace switches decide what an email may be sent
    // for at all, so only the owner may change them.
    expect(authorizeWorkspaceRequest).toHaveBeenCalledWith(
      { id: WORKSPACE_ID },
      { minRole: "owner" },
    );
    expect(updatePreferences).toHaveBeenCalledWith(WORKSPACE_ID, {
      notify_rescan_complete: false,
      notify_monthly_digest: true,
    });
  });

  it("refuses a manager and a viewer (the auth helper's 403, since minRole is owner), without writing", async () => {
    authorizeWorkspaceRequest.mockResolvedValue({
      ok: false,
      status: 403,
      code: "forbidden",
    });
    expect((await patch({ notifyRescanComplete: false })).status).toBe(403);
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("refuses someone with no membership on this workspace, and an unknown workspace, without writing", async () => {
    authorizeWorkspaceRequest.mockResolvedValue({
      ok: false,
      status: 403,
      code: "forbidden",
    });
    expect((await patch({ notifyRescanComplete: false })).status).toBe(403);

    authorizeWorkspaceRequest.mockResolvedValue({
      ok: false,
      status: 404,
      code: "not_found",
    });
    expect((await patch({ notifyRescanComplete: false })).status).toBe(404);

    authorizeWorkspaceRequest.mockResolvedValue({
      ok: false,
      status: 401,
      code: "unauthenticated",
    });
    expect((await patch({ notifyRescanComplete: false })).status).toBe(401);
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("400s a body with no boolean preference fields and a malformed workspace id", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    expect((await patch({ notifyRescanComplete: "no" })).status).toBe(400);
    expect((await patch({ notifyRescanComplete: false }, "nope")).status).toBe(
      400,
    );
    expect(updatePreferences).not.toHaveBeenCalled();
  });
});
