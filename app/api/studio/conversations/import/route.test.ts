import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeLike, LOCATION_ID, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";

/**
 * POST /api/studio/conversations/import (convergence bridge). Auth, repository,
 * limiter and audit are mocks: these tests pin the route contract — both flags
 * fail closed before auth/SQL, validation happens before the repository, the
 * location scope is enforced, the import is audited with counts only, and no
 * note text reaches the audit payload.
 */

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  studioRepository: vi.fn(),
  importConversation: vi.fn(),
  enforceRateLimit: vi.fn(),
  recordNeonEvent: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args),
}));
vi.mock("@/lib/repositories/studio", () => ({
  STUDIO_IMPORT_MAX_NOTES: 40,
  StudioLocationNotFoundError: class StudioLocationNotFoundError extends Error {
    constructor() {
      super("studio_location_not_found");
      this.name = "StudioLocationNotFoundError";
    }
  },
  studioRepository: () => ({ importConversation: mocks.importConversation }),
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

const row = {
  id: "66666666-6666-4666-8666-666666666666",
  workspace_id: WORKSPACE_ID,
  location_id: LOCATION_ID,
  created_by: "user-1",
  title: "Local idea",
  status: "active",
  created_at: "2026-11-09T00:00:00Z",
  updated_at: "2026-11-09T00:00:00Z",
  last_message_at: "2026-11-09T00:00:00Z",
};

const post = (body: unknown) => import("./route").then(({ POST }) => POST(new Request("https://app.test/api/studio/conversations/import", { method: "POST", body: JSON.stringify(body) })));
const VALID = { workspaceId: WORKSPACE_ID, locationId: LOCATION_ID, title: "Local idea", notes: ["First note", "Second note"] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "true");
  vi.stubEnv("CONVERSATION_HOME_ENABLED", "true");
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
  mocks.importConversation.mockResolvedValue({ conversation: row, messageCount: 2 });
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/studio/conversations/import", () => {
  it.each([
    ["CONVERSATION_STUDIO_ENABLED", "false"],
    ["CONVERSATION_HOME_ENABLED", "false"],
  ])("is absent when %s is %j: 404 before auth, limiter or SQL", async (name, value) => {
    vi.stubEnv(name, value);
    const res = await post(VALID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.importConversation).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies before auth or SQL", async () => {
    const cases = [
      {},
      { workspaceId: WORKSPACE_ID, title: "x", notes: [] },
      { workspaceId: WORKSPACE_ID, title: "x", notes: ["ok", 42] },
      { workspaceId: WORKSPACE_ID, title: "x", notes: ["a".repeat(4001)] },
      { workspaceId: WORKSPACE_ID, title: "x", notes: Array.from({ length: 41 }, () => "note") },
      { workspaceId: "nope", title: "x", notes: ["note"] },
      { workspaceId: WORKSPACE_ID, title: "x".repeat(81), notes: ["note"] },
    ];
    for (const body of cases) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_input" });
    }
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.importConversation).not.toHaveBeenCalled();
  });

  it("passes membership failures through and never reads the repository", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    const res = await post(VALID);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(mocks.importConversation).not.toHaveBeenCalled();
  });

  it("rejects a location outside the caller's scope as 404", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({
      ok: true,
      user: { id: "user-1", email: "owner@example.test", verified: true },
      membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "shop", userId: "user-1", email: "owner@example.test", role: "manager", locationScope: ["99999999-9999-4999-8999-999999999999"] },
    });
    const res = await post(VALID);
    expect(res.status).toBe(404);
    expect(mocks.importConversation).not.toHaveBeenCalled();
  });

  it("imports the notes and audits counts only, never the note text", async () => {
    const res = await post(VALID);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ conversation: { id: row.id, title: "Local idea" } });
    expect(mocks.importConversation).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      actorId: "user-1",
      locationId: LOCATION_ID,
      title: "Local idea",
      notes: ["First note", "Second note"],
      documents: [],
    });
    expect(mocks.recordNeonEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "conversation.imported",
      entityType: "conversation",
      entityId: row.id,
      payload: { surface: "conversation", notes: 2 },
    }));
    expect(JSON.stringify(mocks.recordNeonEvent.mock.calls)).not.toContain("First note");
  });

  it("maps a foreign location to 404, a refused limiter to 429 and an unexpected failure to 503", async () => {
    const { StudioLocationNotFoundError } = await import("@/lib/repositories/studio");
    mocks.importConversation.mockRejectedValueOnce(new StudioLocationNotFoundError());
    expect((await post(VALID)).status).toBe(404);

    mocks.enforceRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 7 });
    expect((await post(VALID)).status).toBe(429);

    mocks.importConversation.mockRejectedValueOnce(new Error("unexpected"));
    expect((await post(VALID)).status).toBe(503);
  });
});
