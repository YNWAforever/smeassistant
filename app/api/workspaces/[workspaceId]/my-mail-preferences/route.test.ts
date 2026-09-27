import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  setMemberSwitches: vi.fn(),
  getPool: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return { ...actual, enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args) };
});
vi.mock("@/lib/db/client", () => ({ getPool: (...args: unknown[]) => mocks.getPool(...args) }));
vi.mock("@/lib/repositories/mail-outbox", () => ({
  mailOutboxRepository: () => ({ setMemberSwitches: (...args: unknown[]) => mocks.setMemberSwitches(...args) }),
}));

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const URL_BASE = `https://app.test/api/workspaces/${WORKSPACE_ID}/my-mail-preferences`;
const PARAMS = { params: Promise.resolve({ workspaceId: WORKSPACE_ID }) };

function auth(role: "owner" | "manager" | "viewer", userId = "user-1") {
  return {
    ok: true,
    user: { id: userId, email: "member@example.com", verified: true },
    membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "demo", userId, email: "member@example.com", role, locationScope: null },
  };
}

function patch(body: unknown): Promise<Response> {
  return import("./route").then(({ PATCH }) => PATCH(new Request(URL_BASE, { method: "PATCH", body: JSON.stringify(body) }), PARAMS));
}

beforeEach(() => {
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.setMemberSwitches.mockResolvedValue(undefined);
});

afterEach(() => vi.resetAllMocks());

describe("PATCH /api/workspaces/[workspaceId]/my-mail-preferences", () => {
  it("lets any accepted member (a viewer here) set their own switches", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("viewer", "user-1"));
    const res = await patch({ rescanComplete: true, regressionAlert: false, locale: "en" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "action_mutation", identifiers: ["user-1"] }),
    );
  });

  it("writes for the caller's own user id from the auth decision, never a client-supplied one -- the body has no userId field to begin with", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("manager", "user-1"));
    await patch({ rescanComplete: true, locale: "zh-HK" });
    expect(mocks.setMemberSwitches).toHaveBeenCalledWith(WORKSPACE_ID, "user-1", { rescanComplete: true, regressionAlert: undefined, locale: "zh-HK" });
  });

  it("sends only the provided switches, leaving the other untouched", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner", "user-1"));
    await patch({ regressionAlert: false, locale: "zh-TW" });
    expect(mocks.setMemberSwitches).toHaveBeenCalledWith(WORKSPACE_ID, "user-1", { rescanComplete: undefined, regressionAlert: false, locale: "zh-TW" });
  });

  it("401s when unauthenticated, without writing", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    expect((await patch({ rescanComplete: true, locale: "en" })).status).toBe(401);
    expect(mocks.setMemberSwitches).not.toHaveBeenCalled();
  });

  it("403s when the caller has no accepted membership on this workspace, without writing", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    expect((await patch({ rescanComplete: true, locale: "en" })).status).toBe(403);
    expect(mocks.setMemberSwitches).not.toHaveBeenCalled();
  });

  it("400s a malformed workspace id before authorizing", async () => {
    const res = await import("./route").then(({ PATCH }) =>
      PATCH(new Request(URL_BASE, { method: "PATCH", body: JSON.stringify({ rescanComplete: true, locale: "en" }) }), {
        params: Promise.resolve({ workspaceId: "nope" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("400s invalid JSON", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("viewer"));
    const res = await import("./route").then(({ PATCH }) => PATCH(new Request(URL_BASE, { method: "PATCH", body: "{not json" }), PARAMS));
    expect(res.status).toBe(400);
    expect(mocks.setMemberSwitches).not.toHaveBeenCalled();
  });

  it("400s a missing or bad locale", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("viewer"));
    expect((await patch({ rescanComplete: true })).status).toBe(400);
    expect((await patch({ rescanComplete: true, locale: "fr" })).status).toBe(400);
    expect(mocks.setMemberSwitches).not.toHaveBeenCalled();
  });

  it("400s a non-boolean switch value", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("viewer"));
    expect((await patch({ rescanComplete: "yes", locale: "en" })).status).toBe(400);
    expect((await patch({ regressionAlert: 1, locale: "en" })).status).toBe(400);
    expect(mocks.setMemberSwitches).not.toHaveBeenCalled();
  });

  it("400s an unknown key in the body", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("viewer"));
    expect((await patch({ rescanComplete: true, locale: "en", monthlyDigest: true })).status).toBe(400);
    expect(mocks.setMemberSwitches).not.toHaveBeenCalled();
  });

  it("is rate-limited under the action_mutation scope, refusing before any write", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("viewer", "user-1"));
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const res = await patch({ rescanComplete: true, locale: "en" });
    expect(res.status).toBe(429);
    expect(mocks.setMemberSwitches).not.toHaveBeenCalled();
  });
});
