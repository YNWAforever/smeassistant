import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth, authorizeLike, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";

/**
 * GET/PATCH /api/studio/conversations/[conversationId] (design §4, §7).
 * Scope is the repository's job (workspace AND created_by); the route proves the
 * envelope, validation, hasMore window and the 404-not-403 rule.
 */

const CONVERSATION_ID = "55555555-5555-4555-8555-555555555555";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  studioRepository: vi.fn(),
  getConversation: vi.fn(),
  listMessages: vi.fn(),
  renameConversation: vi.fn(),
  archiveConversation: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args),
}));
vi.mock("@/lib/repositories/studio", () => ({
  studioRepository: (...args: unknown[]) => mocks.studioRepository(...args),
  toStudioConversation: (row: { id: string; title: string; status: string }) => ({ id: row.id, title: row.title, status: row.status, locationId: null, createdAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T00:00:00Z", lastMessageAt: "2026-11-08T00:00:00Z" }),
  toStudioMessage: (row: { id: string; seq: number; content: string }) => ({ id: row.id, seq: row.seq, content: row.content, role: "user", conversationId: CONVERSATION_ID, parts: [], intent: null, createdAt: "2026-11-08T00:00:00Z" }),
}));

const row = {
  id: CONVERSATION_ID,
  workspace_id: WORKSPACE_ID,
  location_id: null,
  created_by: "user-1",
  title: "What changed?",
  status: "active",
  created_at: "2026-11-08T00:00:00Z",
  updated_at: "2026-11-08T00:00:00Z",
  last_message_at: "2026-11-08T00:00:00Z",
};

function message(seq: number) {
  return { id: `message-${seq}`, conversation_id: CONVERSATION_ID, workspace_id: WORKSPACE_ID, seq, role: "user", author_id: "user-1", content: `turn ${seq}`, parts: [], intent: null, model: null, prompt_version: null, input_tokens: null, output_tokens: null, cost_usd: null, created_at: "2026-11-08T00:00:00Z" };
}

const detail = (query: string) => import("./route").then(({ GET }) => GET(
  new Request(`https://app.test/api/studio/conversations/${CONVERSATION_ID}?${query}`),
  { params: Promise.resolve({ conversationId: CONVERSATION_ID }) },
));

const patch = (body: unknown, conversationId = CONVERSATION_ID) => import("./route").then(({ PATCH }) => PATCH(
  new Request(`https://app.test/api/studio/conversations/${conversationId}`, { method: "PATCH", body: JSON.stringify(body) }),
  { params: Promise.resolve({ conversationId }) },
));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "true");
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
  mocks.getConversation.mockResolvedValue(row);
  mocks.listMessages.mockResolvedValue([message(1), message(2)]);
  mocks.renameConversation.mockResolvedValue({ ...row, title: "Renamed" });
  mocks.archiveConversation.mockResolvedValue({ ...row, status: "archived" });
  mocks.studioRepository.mockReturnValue({
    getConversation: mocks.getConversation,
    listMessages: mocks.listMessages,
    renameConversation: mocks.renameConversation,
    archiveConversation: mocks.archiveConversation,
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/studio/conversations/[id]", () => {
  it("is absent with the flag off, before auth or SQL", async () => {
    vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "");
    const res = await detail(`workspaceId=${WORKSPACE_ID}`);
    expect(res.status).toBe(404);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.studioRepository).not.toHaveBeenCalled();
  });

  it("rejects a malformed id or query with 400 before auth", async () => {
    for (const query of ["", `workspaceId=${WORKSPACE_ID}&beforeSeq=0`, `workspaceId=${WORKSPACE_ID}&beforeSeq=abc`, `workspaceId=${WORKSPACE_ID}&limit=999`]) {
      const res = await detail(query);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_input" });
      expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    }
    const badId = await import("./route").then(({ GET }) => GET(new Request("https://app.test/x?workspaceId=" + WORKSPACE_ID), { params: Promise.resolve({ conversationId: "nope" }) }));
    expect(badId.status).toBe(400);
  });

  it("passes 401/403/404 through", async () => {
    for (const [status, code] of [[401, "unauthenticated"], [403, "forbidden"], [404, "not_found"]] as const) {
      mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status, code });
      const res = await detail(`workspaceId=${WORKSPACE_ID}`);
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error: code });
    }
    expect(mocks.studioRepository).not.toHaveBeenCalled();
  });

  it("returns 404 for a conversation the caller does not own", async () => {
    mocks.getConversation.mockResolvedValue(null);
    const res = await detail(`workspaceId=${WORKSPACE_ID}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.listMessages).not.toHaveBeenCalled();
  });

  it("returns the conversation, messages and hasMore with no-store", async () => {
    const res = await detail(`workspaceId=${WORKSPACE_ID}&limit=2`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { conversation: { id: string }; messages: Array<{ seq: number }>; hasMore: boolean };
    expect(body.conversation.id).toBe(CONVERSATION_ID);
    expect(body.messages.map((entry) => entry.seq)).toEqual([1, 2]);
    expect(body.hasMore).toBe(false);
    // The reader asked for one extra row to decide hasMore.
    expect(mocks.listMessages).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      actorId: auth("owner").membership.userId,
      conversationId: CONVERSATION_ID,
      limit: 3,
    });
  });

  it("reports hasMore and keeps the newest page when the window is exceeded", async () => {
    mocks.listMessages.mockResolvedValue([message(1), message(2), message(3)]);
    const res = await detail(`workspaceId=${WORKSPACE_ID}&limit=2&beforeSeq=9`);
    const body = (await res.json()) as { messages: Array<{ seq: number }>; hasMore: boolean };
    expect(body.hasMore).toBe(true);
    expect(body.messages.map((entry) => entry.seq)).toEqual([2, 3]);
    expect(mocks.listMessages).toHaveBeenCalledWith(expect.objectContaining({ beforeSeq: 9, limit: 3 }));
  });

  it("serves an archived conversation read-only", async () => {
    mocks.getConversation.mockResolvedValue({ ...row, status: "archived" });
    const res = await detail(`workspaceId=${WORKSPACE_ID}&workspaceId=${WORKSPACE_ID}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { conversation: { status: string } };
    expect(body.conversation.status).toBe("archived");
  });

  it("returns 503 when the read fails", async () => {
    mocks.getConversation.mockRejectedValue(new Error("db down"));
    const res = await detail(`workspaceId=${WORKSPACE_ID}`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});

describe("PATCH /api/studio/conversations/[id]", () => {
  it("is absent with the flag off", async () => {
    vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "");
    const res = await patch({ workspaceId: WORKSPACE_ID, title: "New name" });
    expect(res.status).toBe(404);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.renameConversation).not.toHaveBeenCalled();
  });

  it.each([
    ["not json", "{broken"],
    ["null", null],
    ["missing workspace", {}],
    ["empty title", { workspaceId: WORKSPACE_ID, title: "   " }],
    ["title too long", { workspaceId: WORKSPACE_ID, title: "x".repeat(81) }],
    ["bad status", { workspaceId: WORKSPACE_ID, status: "deleted" }],
    ["nothing to change", { workspaceId: WORKSPACE_ID }],
  ])("rejects %s with 400 before auth", async (_label, body) => {
    const request = new Request(`https://app.test/api/studio/conversations/${CONVERSATION_ID}`, { method: "PATCH", body: typeof body === "string" ? body : JSON.stringify(body) });
    const { PATCH } = await import("./route");
    const res = await PATCH(request, { params: Promise.resolve({ conversationId: CONVERSATION_ID }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_input" });
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("renames the caller's own conversation", async () => {
    const res = await patch({ workspaceId: WORKSPACE_ID, title: "  New name  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversation: expect.objectContaining({ title: "Renamed" }) });
    expect(mocks.renameConversation).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      actorId: auth("owner").membership.userId,
      conversationId: CONVERSATION_ID,
      title: "New name",
    });
  });

  it("archives the caller's own conversation", async () => {
    const res = await patch({ workspaceId: WORKSPACE_ID, status: "archived" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { conversation: { status: string } }).toMatchObject({ conversation: { status: "archived" } });
    expect(mocks.archiveConversation).toHaveBeenCalledWith(expect.objectContaining({ conversationId: CONVERSATION_ID }));
  });

  it("answers 404 for another member's conversation and never reveals it", async () => {
    mocks.getConversation.mockResolvedValue(null);
    const res = await patch({ workspaceId: WORKSPACE_ID, title: "New name" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.renameConversation).not.toHaveBeenCalled();
  });

  it("returns 503 on an unexpected repository failure", async () => {
    mocks.renameConversation.mockRejectedValue(new Error("update failed"));
    const res = await patch({ workspaceId: WORKSPACE_ID, title: "New name" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});
