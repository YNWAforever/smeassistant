import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth, authorizeLike, LOCATION_ID, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";

/**
 * GET/POST /api/studio/conversations (design §4, §7). The repository, auth and
 * audit are mocks: these tests are about the route's contract — flag-off does no
 * auth or SQL, membership failures map to their statuses, the envelope is stable
 * and scope is enforced before a read.
 */

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  studioRepository: vi.fn(),
  listConversations: vi.fn(),
  createConversation: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args),
}));
vi.mock("@/lib/repositories/studio", () => ({
  StudioLocationNotFoundError: class StudioLocationNotFoundError extends Error {
    constructor() {
      super("studio_location_not_found");
      this.name = "StudioLocationNotFoundError";
    }
  },
  studioRepository: (...args: unknown[]) => mocks.studioRepository(...args),
  toStudioConversation: (row: { id: string; title: string; status: string; location_id: string | null; created_at: string; updated_at: string; last_message_at: string }) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    locationId: row.location_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  }),
  toStudioMessage: (row: unknown) => row,
}));
vi.mock("@/lib/workspace/audit", () => ({ recordNeonEvent: vi.fn(), ipHashFor: () => "ip-hash", RUN_TIMED_OUT_EVENT: "run.timed_out" }));

const row = {
  id: "55555555-5555-4555-8555-555555555555",
  workspace_id: WORKSPACE_ID,
  location_id: LOCATION_ID,
  created_by: "user-1",
  title: "What changed?",
  status: "active",
  created_at: "2026-11-08T00:00:00Z",
  updated_at: "2026-11-08T00:00:00Z",
  last_message_at: "2026-11-08T00:00:00Z",
};

const list = (query: string) => import("./route").then(({ GET }) => GET(new Request(`https://app.test/api/studio/conversations?${query}`)));
const create = (body: unknown) => import("./route").then(({ POST }) => POST(new Request("https://app.test/api/studio/conversations", { method: "POST", body: JSON.stringify(body) })));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "true");
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
  mocks.listConversations.mockResolvedValue([row]);
  mocks.createConversation.mockResolvedValue(row);
  mocks.studioRepository.mockReturnValue({ listConversations: mocks.listConversations, createConversation: mocks.createConversation });
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/studio/conversations", () => {
  it.each(["", "false", "TRUE", "1", " true"])("is absent with the flag %j: 404 before auth or SQL", async (value) => {
    vi.stubEnv("CONVERSATION_STUDIO_ENABLED", value);
    const res = await list(`workspaceId=${WORKSPACE_ID}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.studioRepository).not.toHaveBeenCalled();
  });

  it("rejects a malformed workspace or location id with 400 before auth", async () => {
    for (const query of ["", "workspaceId=", "workspaceId=nope", `workspaceId=${WORKSPACE_ID}&locationId=../x`]) {
      const res = await list(query);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_input" });
      expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    }
  });

  it("passes 401/403/404 through without reading conversations", async () => {
    for (const [status, code] of [[401, "unauthenticated"], [403, "forbidden"], [404, "not_found"]] as const) {
      mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status, code });
      const res = await list(`workspaceId=${WORKSPACE_ID}`);
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error: code });
    }
    expect(mocks.studioRepository).not.toHaveBeenCalled();
  });

  it("returns 503 when authorization itself is unavailable", async () => {
    mocks.authorizeWorkspaceRequest.mockRejectedValue(new Error("membership_dependency_unavailable"));
    const res = await list(`workspaceId=${WORKSPACE_ID}`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });

  it("refuses a location outside a scoped manager's scope before reading rows", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", ["33333333-3333-4333-8333-333333333333"]));
    const res = await list(`workspaceId=${WORKSPACE_ID}&locationId=${LOCATION_ID}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.studioRepository).not.toHaveBeenCalled();
  });

  it("returns the caller's conversations with no-store and the trusted actor id", async () => {
    const res = await list(`workspaceId=${WORKSPACE_ID.toUpperCase()}&locationId=${LOCATION_ID}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const body = (await res.json()) as { conversations: Array<{ id: string; locationId: string | null }> };
    expect(body.conversations).toEqual([expect.objectContaining({ id: row.id, locationId: LOCATION_ID })]);
    expect(mocks.listConversations).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      actorId: auth("owner").membership.userId,
      locationId: LOCATION_ID,
      limit: 40,
    });
  });

  it("treats an empty locationId as absent", async () => {
    await list(`workspaceId=${WORKSPACE_ID}&locationId=`);
    expect(mocks.listConversations).toHaveBeenCalledWith(expect.objectContaining({ locationId: null }));
  });

  it("logs only a category and returns 503 when the read fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.listConversations.mockRejectedValue(new Error("relation studio_conversations does not exist"));
    const res = await list(`workspaceId=${WORKSPACE_ID}`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("does not exist");
    consoleError.mockRestore();
  });
});

describe("POST /api/studio/conversations", () => {
  it("is absent with the flag off", async () => {
    vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "");
    const res = await create({ workspaceId: WORKSPACE_ID });
    expect(res.status).toBe(404);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.createConversation).not.toHaveBeenCalled();
  });

  it.each([
    ["not json", "{broken"],
    ["null", null],
    ["array", []],
    ["missing workspace", {}],
    ["bad workspace", { workspaceId: "nope" }],
    ["bad location", { workspaceId: WORKSPACE_ID, locationId: "nope" }],
    ["bad title type", { workspaceId: WORKSPACE_ID, title: 5 }],
    ["title too long", { workspaceId: WORKSPACE_ID, title: "x".repeat(81) }],
  ])("rejects %s with 400 before auth", async (_label, body) => {
    const request = new Request("https://app.test/api/studio/conversations", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
    const { POST } = await import("./route");
    const res = await POST(request);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_input" });
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("creates a conversation and returns 201 with the wire envelope", async () => {
    const res = await create({ workspaceId: WORKSPACE_ID, locationId: LOCATION_ID, title: "  What changed?  " });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ conversation: expect.objectContaining({ id: row.id, title: "What changed?" }) });
    expect(mocks.createConversation).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      actorId: "user-1",
      locationId: LOCATION_ID,
      title: "What changed?",
    });
  });

  it("passes membership failures through", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    const res = await create({ workspaceId: WORKSPACE_ID });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(mocks.createConversation).not.toHaveBeenCalled();
  });

  it("refuses a location outside a scoped manager's scope", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", ["33333333-3333-4333-8333-333333333333"]));
    const res = await create({ workspaceId: WORKSPACE_ID, locationId: LOCATION_ID });
    expect(res.status).toBe(404);
    expect(mocks.createConversation).not.toHaveBeenCalled();
  });

  it("maps a foreign location to 404 and any other failure to 503", async () => {
    const { StudioLocationNotFoundError: LocationError } = await import("@/lib/repositories/studio");
    mocks.createConversation.mockRejectedValueOnce(new LocationError());
    const foreign = await create({ workspaceId: WORKSPACE_ID, locationId: LOCATION_ID });
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual({ error: "not_found" });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createConversation.mockRejectedValueOnce(new Error("insert failed"));
    const failed = await create({ workspaceId: WORKSPACE_ID });
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "unavailable" });
    consoleError.mockRestore();
  });
});
