import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeLike, LOCATION_ID, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";

/**
 * GET /api/studio/conversations/[id]/transcript (P3, read-only). Auth, repo,
 * limiter and audit are mocks; the contract is: flag-off before auth/SQL, 404
 * for foreign conversations, Markdown attachment for owner/member/viewer, and
 * an audit row with counts only.
 */

const CONVERSATION_ID = "55555555-5555-4555-8555-555555555555";
const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  getConversation: vi.fn(),
  listConversationTranscript: vi.fn(),
  enforceRateLimit: vi.fn(),
  recordNeonEvent: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args),
}));
vi.mock("@/lib/repositories/studio", () => ({
  studioRepository: () => ({ getConversation: mocks.getConversation, listConversationTranscript: mocks.listConversationTranscript }),
  toStudioConversation: (row: Record<string, unknown>) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    locationId: row.location_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    accessRole: row.access_role ?? "owner",
    shared: (row.access_role ?? "owner") !== "owner",
  }),
  toStudioMessage: (row: Record<string, unknown>) => ({
    id: row.id,
    conversationId: row.conversation_id,
    seq: row.seq,
    role: row.role,
    content: row.content,
    parts: row.parts,
    intent: null,
    createdAt: row.created_at,
  }),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
  rateLimitedResponse: (retryAfter: number) => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "retry-after": String(retryAfter) } }),
}));
vi.mock("@/lib/workspace/audit", () => ({ recordNeonEvent: (...args: unknown[]) => mocks.recordNeonEvent(...args), ipHashFor: () => "ip-hash" }));

const row = {
  id: CONVERSATION_ID,
  workspace_id: WORKSPACE_ID,
  location_id: LOCATION_ID,
  created_by: "user-1",
  title: "Review replies first",
  status: "active",
  created_at: "2026-11-09T00:00:00Z",
  updated_at: "2026-11-09T00:00:00Z",
  last_message_at: "2026-11-09T00:05:00Z",
  access_role: "owner",
};
const messages = [
  { id: "m1", conversation_id: CONVERSATION_ID, seq: 1, role: "user", content: "What should I do first?", parts: [], created_at: "2026-11-09T00:00:00Z" },
  { id: "m2", conversation_id: CONVERSATION_ID, seq: 2, role: "assistant", content: "Start with reviews.", parts: [], created_at: "2026-11-09T00:00:02Z" },
];

const get = (query = `workspaceId=${WORKSPACE_ID}`) =>
  import("./route").then(({ GET }) => GET(
    new Request(`https://app.test/api/studio/conversations/${CONVERSATION_ID}/transcript?${query}`, { method: "GET" }),
    { params: Promise.resolve({ conversationId: CONVERSATION_ID }) },
  ));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "true");
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
  mocks.getConversation.mockResolvedValue(row);
  mocks.listConversationTranscript.mockResolvedValue(messages);
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
});

afterEach(() => vi.unstubAllEnvs());

describe("conversation transcript export", () => {
  it("is a 404 with the flag off, before auth or SQL", async () => {
    vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "false");
    const response = await get();
    expect(response.status).toBe(404);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.listConversationTranscript).not.toHaveBeenCalled();
  });

  it("rejects missing or malformed scope before auth", async () => {
    for (const query of ["", `workspaceId=nope`]) {
      const response = await get(query);
      expect(response.status).toBe(400);
    }
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("returns a Markdown attachment and audits counts only", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain(`studio-${CONVERSATION_ID}.md`);
    const markdown = await response.text();
    expect(markdown).toContain("# Review replies first");
    expect(markdown).toContain("What should I do first?");
    expect(markdown).toContain("Start with reviews.");
    expect(mocks.recordNeonEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "conversation.exported",
      entityId: CONVERSATION_ID,
      payload: { surface: "conversation", messages: 2 },
    }));
    expect(JSON.stringify(mocks.recordNeonEvent.mock.calls)).not.toContain("Start with reviews.");
  });

  it("allows a shared viewer and returns 404 for a foreign conversation", async () => {
    mocks.getConversation.mockResolvedValueOnce({ ...row, access_role: "viewer" });
    expect((await get()).status).toBe(200);

    mocks.getConversation.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(404);
    expect(mocks.listConversationTranscript).toHaveBeenCalledTimes(1);
  });

  it("maps a limiter refusal to 429 and an unexpected failure to 503", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 10 });
    expect((await get()).status).toBe(429);
    mocks.listConversationTranscript.mockRejectedValueOnce(new Error("unexpected"));
    expect((await get()).status).toBe(503);
  });
});
