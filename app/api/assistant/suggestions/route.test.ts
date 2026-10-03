import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth, authorizeLike, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";
import { AssistantAccessError } from "@/lib/assistant/errors";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  loadSuggestions: vi.fn(),
  artifactRepository: vi.fn(),
  recordNeonEvent: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
}));
vi.mock("@/lib/assistant/suggestions", () => ({ loadSuggestions: (...args: unknown[]) => mocks.loadSuggestions(...args) }));
vi.mock("@/lib/repositories/artifacts", () => ({ artifactRepository: (...args: unknown[]) => mocks.artifactRepository(...args) }));
vi.mock("@/lib/workspace/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace/audit")>()),
  recordNeonEvent: (...args: unknown[]) => mocks.recordNeonEvent(...args),
}));

const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const ACTION_ID = "33333333-3333-4333-8333-333333333333";
const VERSION_ID = "44444444-4444-4444-8444-444444444444";
const repo = { tag: "repository" };

const get = (query: string) => import("./route").then(({ GET }) => GET(new Request(`https://app.test/api/assistant/suggestions?${query}`)));
const suggestion = { id: "s1", kind: "google", intentId: "where_to_continue", label: {}, context: { workspaceId: WORKSPACE_ID } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CONTEXTUAL_ASSISTANT_ENABLED", "true");
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.artifactRepository.mockReturnValue(repo);
  mocks.loadSuggestions.mockResolvedValue([suggestion]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/assistant/suggestions", () => {
  it.each(["", "false", "TRUE", "1", " true"])("returns [] with the flag %j and calls nothing", async (value) => {
    vi.stubEnv("CONTEXTUAL_ASSISTANT_ENABLED", value);
    const res = await get(`workspaceId=${WORKSPACE_ID}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [] });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.artifactRepository).not.toHaveBeenCalled();
    expect(mocks.loadSuggestions).not.toHaveBeenCalled();
  });

  it("returns [] with the flag unset, even when the ids are malformed", async () => {
    vi.unstubAllEnvs();
    delete process.env.CONTEXTUAL_ASSISTANT_ENABLED;
    const res = await get("workspaceId=nope");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [] });
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it.each(["", "workspaceId=", "workspaceId=abc", "workspaceId=../x", `workspaceId=${WORKSPACE_ID}&locationId=nope`, `workspaceId=${WORKSPACE_ID}&actionId=1`, `workspaceId=${WORKSPACE_ID}&versionId=x%2F`])(
    "rejects %j with 400 invalid_context before auth",
    async (query) => {
      const res = await get(query);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_context" });
      expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
      expect(mocks.loadSuggestions).not.toHaveBeenCalled();
    },
  );

  it("passes 401/403/404 from authorization through", async () => {
    for (const [status, code] of [[401, "unauthenticated"], [403, "forbidden"], [404, "not_found"]] as const) {
      mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status, code });
      const res = await get(`workspaceId=${WORKSPACE_ID}`);
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error: code });
    }
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.loadSuggestions).not.toHaveBeenCalled();
  });

  it("returns 429 when the limiter refuses, before reading anything", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    const res = await get(`workspaceId=${WORKSPACE_ID}`);
    expect(res.status).toBe(429);
    expect(mocks.loadSuggestions).not.toHaveBeenCalled();
    expect(mocks.artifactRepository).not.toHaveBeenCalled();
  });

  it("rate-limits per user under assistant_suggestions, fail-closed", async () => {
    await get(`workspaceId=${WORKSPACE_ID}`);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: "assistant_suggestions", identifiers: ["user-1"], failClosed: true }));
  });

  it("returns 404 for a version of another action", async () => {
    mocks.loadSuggestions.mockRejectedValue(new AssistantAccessError("not_found"));
    const res = await get(`workspaceId=${WORKSPACE_ID}&actionId=${ACTION_ID}&versionId=${VERSION_ID}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("returns 403 when the loader refuses a foreign membership", async () => {
    mocks.loadSuggestions.mockRejectedValue(new AssistantAccessError("forbidden"));
    const res = await get(`workspaceId=${WORKSPACE_ID}`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("logs only a category and returns 503 for any other failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.loadSuggestions.mockRejectedValue(new Error("secret db detail"));
    const res = await get(`workspaceId=${WORKSPACE_ID}`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), { category: "assistant_suggestions_failed" });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("secret db detail");
    consoleError.mockRestore();
  });

  it("returns suggestions with no-store, passing the trusted membership and lowercased ids to the loader", async () => {
    const res = await get(`workspaceId=${WORKSPACE_ID.toUpperCase()}&locationId=${LOCATION_ID}&actionId=${ACTION_ID}&versionId=${VERSION_ID}&membership=viewer`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [suggestion] });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.loadSuggestions).toHaveBeenCalledWith({
      db: repo,
      membership: auth("owner").membership,
      context: { workspaceId: WORKSPACE_ID, locationId: LOCATION_ID, actionId: ACTION_ID, versionId: VERSION_ID },
    });
  });

  it("treats empty optional ids as absent", async () => {
    await get(`workspaceId=${WORKSPACE_ID}&locationId=&actionId=&versionId=`);
    expect(mocks.loadSuggestions).toHaveBeenCalledWith(expect.objectContaining({ context: { workspaceId: WORKSPACE_ID, locationId: undefined, actionId: undefined, versionId: undefined } }));
  });

  it("writes no audit row", async () => {
    await get(`workspaceId=${WORKSPACE_ID}`);
    mocks.loadSuggestions.mockRejectedValue(new AssistantAccessError("not_found"));
    await get(`workspaceId=${WORKSPACE_ID}`);
    expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
  });
});
