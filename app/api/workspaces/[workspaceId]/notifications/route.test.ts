import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeWorkspaceRequest = vi.fn();
const markRead = vi.fn();

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/repositories/notifications", () => ({ notificationRepository: () => ({ markRead }) }));

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const NOTIFICATION_ID = "33333333-3333-4333-8333-333333333333";

function auth(role: string, userId = "user-1") {
  return {
    ok: true,
    user: { id: userId, email: "u@example.test", verified: true },
    membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "demo", userId, email: "u@example.test", role, locationScope: null },
  };
}

function patch(body?: unknown, workspaceId = WORKSPACE_ID) {
  return import("./route").then(({ PATCH }) =>
    PATCH(
      new Request(`https://app.test/api/workspaces/${workspaceId}/notifications`, {
        method: "PATCH",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      { params: Promise.resolve({ workspaceId }) },
    ),
  );
}

afterEach(() => vi.resetAllMocks());

describe("PATCH /api/workspaces/[workspaceId]/notifications", () => {
  it("marks every unread notification when no ids are given", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    markRead.mockResolvedValue(3);
    const response = await patch({});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, marked: 3 });
    expect(markRead).toHaveBeenCalledWith(WORKSPACE_ID, "user-1", null);
  });

  it("treats an empty body as mark-all rather than a parse error", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    markRead.mockResolvedValue(1);
    expect((await patch()).status).toBe(200);
    expect(markRead).toHaveBeenCalledWith(WORKSPACE_ID, "user-1", null);
  });

  it("marks only the ids given", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    markRead.mockResolvedValue(1);
    expect((await patch({ ids: [NOTIFICATION_ID] })).status).toBe(200);
    expect(markRead).toHaveBeenCalledWith(WORKSPACE_ID, "user-1", [NOTIFICATION_ID]);
  });

  // The caller's own id comes from the verified session, never the body: a
  // member cannot mark another member's notifications read whatever they send.
  it("always passes the session's own user id, never one from the body", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("viewer", "user-real"));
    markRead.mockResolvedValue(0);
    await patch({ ids: [NOTIFICATION_ID], user_id: "user-someone-else" });
    expect(markRead).toHaveBeenCalledWith(WORKSPACE_ID, "user-real", [NOTIFICATION_ID]);
  });

  it("lets a viewer mark their own notifications read", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("viewer"));
    markRead.mockResolvedValue(2);
    expect((await patch({})).status).toBe(200);
    // No minRole: the notifications page is a member page (CLAUDE.md §3.1).
    expect(authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID });
  });

  it.each([
    ["a non-array", { ids: "all" }],
    ["a non-uuid entry", { ids: ["not-a-uuid"] }],
    ["more ids than a page holds", { ids: Array.from({ length: 51 }, () => NOTIFICATION_ID) }],
  ])("rejects %s", async (_label, body) => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    expect((await patch(body)).status).toBe(400);
    expect(markRead).not.toHaveBeenCalled();
  });

  it("rejects an invalid workspace id before authorizing", async () => {
    expect((await patch({}, "not-a-uuid")).status).toBe(400);
    expect(authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("refuses a caller who is not a member", async () => {
    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    expect((await patch({})).status).toBe(403);
    expect(markRead).not.toHaveBeenCalled();
  });

  it("answers 500 without leaking the repository error", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    markRead.mockRejectedValue(new Error("notification mark-read failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await patch({});
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("mark-read failed");
    consoleError.mockRestore();
  });
});
