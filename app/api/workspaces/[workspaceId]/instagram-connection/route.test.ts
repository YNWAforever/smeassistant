import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  disconnect: vi.fn(),
  recordNeonEvent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authorizeWorkspaceRequest: mocks.authorizeWorkspaceRequest,
  getUser: vi.fn(),
}));
vi.mock("@/lib/repositories/instagram-connection", () => ({ instagramConnectionRepository: () => ({ disconnect: mocks.disconnect }) }));
vi.mock("@/lib/workspace/audit", () => ({ recordNeonEvent: mocks.recordNeonEvent }));

import { DELETE } from "./route";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

function request(body?: unknown): Request {
  return new Request(`https://scanner.test/api/workspaces/${WORKSPACE_ID}/instagram-connection`, {
    method: "DELETE",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}

function params(workspaceId = WORKSPACE_ID) {
  return { params: Promise.resolve({ workspaceId }) };
}

function authorised() {
  mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: true, user: { id: "user-1" }, membership: { role: "owner" } });
}

describe("DELETE /api/workspaces/[workspaceId]/instagram-connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorised();
    mocks.disconnect.mockResolvedValue(true);
    mocks.recordNeonEvent.mockResolvedValue(undefined);
  });

  it("rejects a malformed workspace id before authorisation", async () => {
    const response = await DELETE(request(), params("not-a-uuid"));
    expect(response.status).toBe(400);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("relays the authorisation failure status", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    const response = await DELETE(request(), params());
    expect(response.status).toBe(403);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it("revokes the credential and records the audit event", async () => {
    const response = await DELETE(request({ locale: "zh-HK" }), params());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, disconnected: true });
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "owner" });
    expect(mocks.disconnect).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(mocks.recordNeonEvent).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: WORKSPACE_ID,
      actorType: "user",
      actorId: "user-1",
      event: "integration.updated",
      locale: "zh-HK",
      payload: { integration: "instagram", status: "revoked" },
    }));
  });

  it("is idempotent: nothing to withdraw is a success with no audit row", async () => {
    mocks.disconnect.mockResolvedValue(false);
    const response = await DELETE(request(), params());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, disconnected: false });
    expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
  });

  it("does not claim success when the stored credential could not be revoked", async () => {
    mocks.disconnect.mockRejectedValue(new Error("db down"));
    const response = await DELETE(request(), params());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });

  it("keeps the disconnect when the audit write fails", async () => {
    mocks.recordNeonEvent.mockRejectedValue(new Error("audit down"));
    const response = await DELETE(request(), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, disconnected: true });
  });
});
