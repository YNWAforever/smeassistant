import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeWorkspaceRequest = vi.fn();
const workspaceUpdate = vi.fn();
const locationUpdate = vi.fn();
const auditInsert = vi.fn();

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/repositories/workspace-profile", () => ({ workspaceProfileRepository: () => ({ setInstagramHandle: (...args: unknown[]) => workspaceUpdate(...args), syncPrimaryInstagramHandle: (...args: unknown[]) => locationUpdate(...args) }) }));
vi.mock("@/lib/workspace/audit", () => ({ recordNeonEvent: (...args: unknown[]) => auditInsert(...args) }));

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

const OWNER_AUTH = {
  ok: true,
  user: { id: "user-1", email: "o@example.com", verified: true },
  membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "demo", userId: "user-1", email: "o@example.com", role: "owner", locationScope: null },
};

function post(body: unknown, workspaceId = WORKSPACE_ID) {
  return import("./route").then(({ POST }) =>
    POST(
      new Request(`https://app.test/api/workspaces/${workspaceId}/instagram-handle`, { method: "POST", body: JSON.stringify(body) }),
      { params: Promise.resolve({ workspaceId }) },
    ),
  );
}

function tables() {
 workspaceUpdate.mockResolvedValue(undefined);
 locationUpdate.mockResolvedValue(undefined);
 auditInsert.mockResolvedValue(undefined);
 return {workspaceUpdate,locationUpdate,auditInsert};
}

afterEach(() => vi.resetAllMocks());

describe("POST /api/workspaces/[workspaceId]/instagram-handle", () => {
  it("saves a normalised handle, syncs the primary location and records an audit event", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(OWNER_AUTH);
    const { workspaceUpdate, locationUpdate, auditInsert } = tables();

    const res = await post({ handle: "@KamManHouse.hk", locale: "zh-HK" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, handle: "kammanhouse.hk" });
    expect(authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "owner" });
    expect(workspaceUpdate).toHaveBeenCalledWith(WORKSPACE_ID, "kammanhouse.hk");
    expect(locationUpdate).toHaveBeenCalledWith(WORKSPACE_ID, "kammanhouse.hk");
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        actorType: "user",
        actorId: "user-1",
        event: "integration.updated",
        locale: "zh-HK",
        payload: expect.objectContaining({ integration: "instagram", handle: "kammanhouse.hk" }),
      }),
    );
  });

  it("accepts a profile URL and rejects a malformed handle without writing", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(OWNER_AUTH);
    const { workspaceUpdate } = tables();

    expect(await (await post({ handle: "https://www.instagram.com/kammanhouse.hk/" })).json()).toEqual({ ok: true, handle: "kammanhouse.hk" });
    expect((await post({ handle: "not a handle!" })).status).toBe(400);
    expect((await post({ handle: "https://instagram.com/p/Cabc123" })).status).toBe(400);
    expect(workspaceUpdate).toHaveBeenCalledTimes(1);
  });

  it("maps the authorization outcome straight to the response and never touches the database", async () => {
    tables();
    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    expect((await post({ handle: "kmh" })).status).toBe(401);

    // A manager is refused: integrations are an owner setting (§3.9).
    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    const forbidden = await post({ handle: "kmh" });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "forbidden" });

    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 404, code: "not_found" });
    expect((await post({ handle: "kmh" })).status).toBe(404);
    expect(workspaceUpdate).not.toHaveBeenCalled();
    expect(locationUpdate).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("400s a malformed workspace id before authorizing", async () => {
    expect((await post({ handle: "kmh" }, "not-a-uuid")).status).toBe(400);
    expect(authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("still succeeds when the location sync or the audit insert fails", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(OWNER_AUTH);
    tables();
    locationUpdate.mockRejectedValue(new Error("fixture location unavailable"));
    auditInsert.mockRejectedValue(new Error("fixture audit unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await post({ handle: "kmh" })).status).toBe(200);
    consoleError.mockRestore();
  });

  it("500s without detail when the workspace update fails", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(OWNER_AUTH);
    tables();
    workspaceUpdate.mockRejectedValue(new Error("db.internal"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post({ handle: "kmh" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/db\.internal/);
    consoleError.mockRestore();
  });
});
