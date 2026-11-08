import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeLike, LOCATION_ID, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";

/**
 * Conversation member sharing (v1.1 P1.3). Auth, repository, limiter and audit
 * are mocks; these tests pin the route contract: flag-off before auth/SQL,
 * input validation, owner-only management, candidate listing and audit payloads
 * that carry ids/roles only.
 */

const CONVERSATION_ID = "55555555-5555-4555-8555-555555555555";
const MEMBER_ID = "77777777-7777-4777-8777-777777777777";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  studioRepository: vi.fn(),
  getConversation: vi.fn(),
  listConversationMembers: vi.fn(),
  listShareCandidates: vi.fn(),
  addConversationMember: vi.fn(),
  removeConversationMember: vi.fn(),
  enforceRateLimit: vi.fn(),
  recordNeonEvent: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args),
}));
vi.mock("@/lib/repositories/studio", () => ({
  studioRepository: () => ({
    getConversation: mocks.getConversation,
    listConversationMembers: mocks.listConversationMembers,
    listShareCandidates: mocks.listShareCandidates,
    addConversationMember: mocks.addConversationMember,
    removeConversationMember: mocks.removeConversationMember,
  }),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
  rateLimitedResponse: (retryAfter: number) => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "retry-after": String(retryAfter) } }),
}));
vi.mock("@/lib/workspace/audit", () => ({
  recordNeonEvent: (...args: unknown[]) => mocks.recordNeonEvent(...args),
  ipHashFor: () => "ip-hash",
}));

const row = (accessRole: "owner" | "editor" | "viewer") => ({
  id: CONVERSATION_ID,
  workspace_id: WORKSPACE_ID,
  location_id: LOCATION_ID,
  created_by: "user-1",
  title: "Shared plan",
  status: "active",
  created_at: "2026-11-09T00:00:00Z",
  updated_at: "2026-11-09T00:00:00Z",
  last_message_at: "2026-11-09T00:00:00Z",
  access_role: accessRole,
});

const member = { conversation_id: CONVERSATION_ID, workspace_id: WORKSPACE_ID, user_id: MEMBER_ID, role: "editor", added_by: "user-1", created_at: "2026-11-09T00:00:00Z", user_email: "teammate@example.test" };

const get = (query = `workspaceId=${WORKSPACE_ID}`) => import("./route").then(({ GET }) => GET(new Request(`https://app.test/api/studio/conversations/${CONVERSATION_ID}/members?${query}`), { params: Promise.resolve({ conversationId: CONVERSATION_ID }) }));
const post = (body: unknown) => import("./route").then(({ POST }) => POST(new Request("https://app.test/api/studio/conversations/members", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ conversationId: CONVERSATION_ID }) }));
const remove = (query = `workspaceId=${WORKSPACE_ID}&userId=${MEMBER_ID}`) => import("./route").then(({ DELETE }) => DELETE(new Request(`https://app.test/api/studio/conversations/${CONVERSATION_ID}/members?${query}`, { method: "DELETE" }), { params: Promise.resolve({ conversationId: CONVERSATION_ID }) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "true");
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
  mocks.getConversation.mockResolvedValue(row("owner"));
  mocks.listConversationMembers.mockResolvedValue([member]);
  mocks.listShareCandidates.mockResolvedValue([{ userId: "88888888-8888-4888-8888-888888888888", email: "other@example.test", workspaceRole: "manager" }]);
  mocks.addConversationMember.mockResolvedValue(member);
  mocks.removeConversationMember.mockResolvedValue(true);
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
});

afterEach(() => vi.unstubAllEnvs());

describe("conversation members", () => {
  it.each([
    ["GET", get],
    ["POST", () => post({ workspaceId: WORKSPACE_ID, userId: MEMBER_ID, role: "editor" })],
    ["DELETE", remove],
  ] as const)("is a 404 when %s runs with the flag off, before auth", async (_name, run) => {
    vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "false");
    const res = await run();
    expect(res.status).toBe(404);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("GET lists members, candidates and whether the caller owns the conversation", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ members: [member], candidates: [{ userId: "88888888-8888-4888-8888-888888888888", email: "other@example.test", workspaceRole: "manager" }], canManage: true, accessRole: "owner" });
  });

  it("GET hides candidates from a non-owner and returns 404 for a foreign conversation", async () => {
    mocks.getConversation.mockResolvedValueOnce(row("editor"));
    const editor = await get();
    expect(await editor.json()).toMatchObject({ canManage: false, candidates: [] });
    expect(mocks.listShareCandidates).not.toHaveBeenCalled();

    mocks.getConversation.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(404);
  });

  it("POST validates ids/role before auth and shares as owner with an audit row", async () => {
    for (const body of [{}, { workspaceId: WORKSPACE_ID, userId: "nope", role: "editor" }, { workspaceId: WORKSPACE_ID, userId: MEMBER_ID, role: "owner" }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
    }
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();

    const res = await post({ workspaceId: WORKSPACE_ID, userId: MEMBER_ID, role: "editor" });
    expect(res.status).toBe(201);
    expect(mocks.addConversationMember).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, actorId: "user-1", conversationId: CONVERSATION_ID, userId: MEMBER_ID, role: "editor" });
    expect(mocks.recordNeonEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "conversation.shared", payload: { role: "editor", memberId: MEMBER_ID } }));
  });

  it("POST maps a non-member target to 400 and a foreign conversation to 404", async () => {
    mocks.addConversationMember.mockRejectedValueOnce(Object.assign(new Error("studio_share_target_not_member"), { name: "Error" }));
    expect((await post({ workspaceId: WORKSPACE_ID, userId: MEMBER_ID, role: "editor" })).status).toBe(400);

    mocks.addConversationMember.mockRejectedValueOnce(Object.assign(new Error("studio_conversation_not_found"), { name: "StudioConversationNotFoundError" }));
    expect((await post({ workspaceId: WORKSPACE_ID, userId: MEMBER_ID, role: "editor" })).status).toBe(404);
  });

  it("DELETE removes a member and audits it, or 404s when nothing matched", async () => {
    const res = await remove();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: true });
    expect(mocks.recordNeonEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "conversation.member_removed", payload: { memberId: MEMBER_ID } }));

    mocks.removeConversationMember.mockResolvedValueOnce(false);
    expect((await remove()).status).toBe(404);
  });
});
