import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeWorkspaceRequest = vi.fn();
const from = vi.fn();

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({ from }) }));

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
  const workspaceUpdate = vi.fn(() => ({ eq: async () => ({ error: null }) }));
  const locationUpdate = vi.fn(() => ({ eq: () => ({ eq: async () => ({ error: null }) }) }));
  const auditInsert = vi.fn(async () => ({ error: null }));
  from.mockImplementation((table: string) => {
    if (table === "workspaces") return { update: workspaceUpdate };
    if (table === "locations") return { update: locationUpdate };
    if (table === "audit_events") return { insert: auditInsert };
    throw new Error(`unexpected table ${table}`);
  });
  return { workspaceUpdate, locationUpdate, auditInsert };
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
    expect(workspaceUpdate).toHaveBeenCalledWith({ instagram_handle: "kammanhouse.hk" });
    expect(locationUpdate).toHaveBeenCalledWith({ ig_handle: "kammanhouse.hk" });
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WORKSPACE_ID,
        actor_type: "user",
        actor_id: "user-1",
        event: "integration.updated",
        payload: expect.objectContaining({ locale: "zh-HK", integration: "instagram", handle: "kammanhouse.hk" }),
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
    expect(from).not.toHaveBeenCalled();
  });

  it("400s a malformed workspace id before authorizing", async () => {
    expect((await post({ handle: "kmh" }, "not-a-uuid")).status).toBe(400);
    expect(authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("still succeeds when the location sync or the audit insert fails", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(OWNER_AUTH);
    from.mockImplementation((table: string) => {
      if (table === "workspaces") return { update: () => ({ eq: async () => ({ error: null }) }) };
      if (table === "locations") return { update: () => ({ eq: () => ({ eq: async () => ({ error: { message: "boom" } }) }) }) };
      return { insert: async () => ({ error: { message: "boom" } }) };
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await post({ handle: "kmh" })).status).toBe(200);
    consoleError.mockRestore();
  });

  it("500s without detail when the workspace update fails", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(OWNER_AUTH);
    from.mockImplementation(() => ({ update: () => ({ eq: async () => ({ error: { message: "db.internal" } }) }) }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post({ handle: "kmh" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/db\.internal/);
    consoleError.mockRestore();
  });
});
