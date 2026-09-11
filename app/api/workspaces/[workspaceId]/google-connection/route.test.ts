import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeWorkspaceRequest = vi.fn();
const disconnect = vi.fn();
const auditInsert = vi.fn();

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/repositories/claims", () => ({ claimsRepository: { disconnectGoogleConnection: (...args: unknown[]) => disconnect(...args) } }));
vi.mock("@/lib/workspace/audit", () => ({ recordNeonEvent: (...args: unknown[]) => auditInsert(...args) }));

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

const OWNER_AUTH = {
  ok: true,
  user: { id: "user-1", email: "o@example.com", verified: true },
  membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "demo", userId: "user-1", email: "o@example.com", role: "owner", locationScope: null },
};

function del(body?: unknown, workspaceId = WORKSPACE_ID) {
  return import("./route").then(({ DELETE }) =>
    DELETE(
      new Request(`https://app.test/api/workspaces/${workspaceId}/google-connection`, {
        method: "DELETE",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      { params: Promise.resolve({ workspaceId }) },
    ),
  );
}

afterEach(() => vi.resetAllMocks());

describe("DELETE /api/workspaces/[workspaceId]/google-connection", () => {
  it("withdraws the connection and records an audit event", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(OWNER_AUTH);
    disconnect.mockResolvedValue(true);
    auditInsert.mockResolvedValue(undefined);

    const res = await del({ locale: "zh-HK" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, disconnected: true });
    expect(disconnect).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        actorType: "user",
        actorId: "user-1",
        event: "integration.updated",
        locale: "zh-HK",
        payload: expect.objectContaining({ integration: "google_gbp", status: "revoked" }),
      }),
    );
  });

  it("treats a second disconnect as success, and does not re-audit it", async () => {
    // The repository matches on status='active', so the second call changes
    // nothing. The owner asked for a disconnected connection and has one --
    // answering 409 would make a double-click look like a failure.
    authorizeWorkspaceRequest.mockResolvedValue(OWNER_AUTH);
    disconnect.mockResolvedValue(false);

    const res = await del();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, disconnected: false });
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("accepts a request with no body at all", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(OWNER_AUTH);
    disconnect.mockResolvedValue(true);
    auditInsert.mockResolvedValue(undefined);

    expect((await del()).status).toBe(200);
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ locale: null }));
  });

  it("maps the authorization outcome straight to the response and never touches the database", async () => {
    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    expect((await del()).status).toBe(401);

    // A manager is refused: integrations are an owner setting (§3.9), and a
    // manager must not be able to withdraw the owner's granted scope.
    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    const forbidden = await del();
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "forbidden" });

    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 404, code: "not_found" });
    expect((await del()).status).toBe(404);
    expect(disconnect).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("400s a malformed workspace id before authorizing", async () => {
    expect((await del(undefined, "not-a-uuid")).status).toBe(400);
    expect(authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("still reports success when only the audit insert fails", async () => {
    // The credential is already destroyed; telling the owner it failed would
    // invite a retry against a connection that is already gone.
    authorizeWorkspaceRequest.mockResolvedValue(OWNER_AUTH);
    disconnect.mockResolvedValue(true);
    auditInsert.mockRejectedValue(new Error("fixture audit unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await del()).status).toBe(200);
    consoleError.mockRestore();
  });

  it("500s without detail when the disconnect itself fails", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(OWNER_AUTH);
    disconnect.mockRejectedValue(new Error("db.internal"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await del();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/db\.internal/);
    expect(auditInsert).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
