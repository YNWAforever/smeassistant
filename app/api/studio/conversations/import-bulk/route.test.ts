import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeLike, LOCATION_ID, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";

/**
 * POST /api/studio/conversations/import-bulk. Auth, repository, limiter and
 * audit are mocks: the route contract is pinned — both flags fail closed before
 * auth/SQL, the whole batch is validated before the repository, scope is
 * enforced, the limiter applies, and the audit carries counts only.
 */

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  importConversations: vi.fn(),
  enforceRateLimit: vi.fn(),
  recordNeonEvent: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args),
}));
vi.mock("@/lib/repositories/studio", () => ({
  STUDIO_IMPORT_MAX_THREADS: 25,
  STUDIO_IMPORT_MAX_TOTAL_NOTES: 400,
  StudioLocationNotFoundError: class StudioLocationNotFoundError extends Error {
    constructor() {
      super("studio_location_not_found");
      this.name = "StudioLocationNotFoundError";
    }
  },
  studioRepository: () => ({ importConversations: mocks.importConversations }),
  toStudioConversation: (row: Record<string, unknown>) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    locationId: row.location_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
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

const row = (id: string, title: string) => ({
  id,
  workspace_id: WORKSPACE_ID,
  location_id: LOCATION_ID,
  created_by: "user-1",
  title,
  status: "active",
  created_at: "2026-11-09T00:00:00Z",
  updated_at: "2026-11-09T00:00:00Z",
  last_message_at: "2026-11-09T00:00:00Z",
});

const post = (body: unknown) => import("./route").then(({ POST }) => POST(new Request("https://app.test/api/studio/conversations/import-bulk", { method: "POST", body: JSON.stringify(body) })));
const VALID = {
  workspaceId: WORKSPACE_ID,
  locationId: LOCATION_ID,
  threads: [
    { title: "First idea", notes: ["one", "two"] },
    { title: "Second idea", notes: ["three"] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "true");
  vi.stubEnv("CONVERSATION_HOME_ENABLED", "true");
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
  mocks.importConversations.mockResolvedValue({
    conversations: [row("11111111-1111-4111-8111-111111111111", "First idea"), row("22222222-2222-4222-8222-222222222222", "Second idea")],
    messageCount: 3,
  });
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/studio/conversations/import-bulk", () => {
  it.each([
    ["CONVERSATION_STUDIO_ENABLED", "false"],
    ["CONVERSATION_HOME_ENABLED", "false"],
  ])("is absent when %s is %j: 404 before auth, limiter or SQL", async (name, value) => {
    vi.stubEnv(name, value);
    const res = await post(VALID);
    expect(res.status).toBe(404);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.importConversations).not.toHaveBeenCalled();
  });

  it("rejects a malformed batch before auth or SQL", async () => {
    const cases: unknown[] = [
      {},
      { workspaceId: WORKSPACE_ID, threads: [] },
      { workspaceId: WORKSPACE_ID, threads: [{ title: "x", notes: [] }] },
      { workspaceId: WORKSPACE_ID, threads: [{ title: "x", notes: ["ok", 42] }] },
      { workspaceId: WORKSPACE_ID, threads: [{ title: "x", notes: ["a".repeat(4001)] }] },
      { workspaceId: WORKSPACE_ID, threads: Array.from({ length: 26 }, () => ({ title: "x", notes: ["note"] })) },
      { workspaceId: WORKSPACE_ID, threads: Array.from({ length: 25 }, () => ({ title: "x", notes: Array.from({ length: 40 }, () => "note") })) },
      { workspaceId: WORKSPACE_ID, threads: [{ title: "x".repeat(81), notes: ["note"] }] },
    ];
    for (const body of cases) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_input" });
    }
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.importConversations).not.toHaveBeenCalled();
  });

  it("passes membership failures through and never writes", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    expect((await post(VALID)).status).toBe(403);
    expect(mocks.importConversations).not.toHaveBeenCalled();
  });

  it("rejects a location outside the caller's scope as 404", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({
      ok: true,
      user: { id: "user-1", email: "owner@example.test", verified: true },
      membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "shop", userId: "user-1", email: "owner@example.test", role: "manager", locationScope: ["99999999-9999-4999-8999-999999999999"] },
    });
    expect((await post(VALID)).status).toBe(404);
    expect(mocks.importConversations).not.toHaveBeenCalled();
  });

  it("imports every thread and audits counts only", async () => {
    const res = await post(VALID);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ messageCount: 3, conversations: [{ title: "First idea" }, { title: "Second idea" }] });
    expect(mocks.importConversations).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      actorId: "user-1",
      locationId: LOCATION_ID,
      threads: VALID.threads.map((thread) => ({ ...thread, documents: [] })),
    });
    expect(mocks.recordNeonEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "conversation.imported",
      payload: { surface: "conversation", threads: 2, notes: 3 },
    }));
    expect(JSON.stringify(mocks.recordNeonEvent.mock.calls)).not.toContain("three");
  });

  it("maps the limiter to 429 and an unexpected failure to 503", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 10 });
    expect((await post(VALID)).status).toBe(429);

    mocks.importConversations.mockRejectedValueOnce(new Error("unexpected"));
    expect((await post(VALID)).status).toBe(503);
  });
});
