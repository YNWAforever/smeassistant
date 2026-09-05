import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth, authorizeLike, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  runLiveAssistant: vi.fn(),
  llmComplete: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/llm", () => ({ llmComplete: (...args: unknown[]) => mocks.llmComplete(...args), llmConfigured: () => true }));
vi.mock("@/lib/assistant/live", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/assistant/live")>()), runLiveAssistant: (...args: unknown[]) => mocks.runLiveAssistant(...args) }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
}));

const post = (body: unknown) => import("./route").then(({ POST }) => POST(new Request("https://app.test/api/assistant/run", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) })));
const live = { runId: "live_run_x", state: "completed", answer: "a", nextAction: "n", evidenceRefs: [], warnings: [], requiresApproval: false, demoBoundary: "b" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
  mocks.runLiveAssistant.mockResolvedValue(live);
});

describe("POST /api/assistant/run", () => {
  it("demo mode returns createDemoAssistantRun output with no auth and ignores context", async () => {
    const res = await post({ mode: "demo", surface: "sample", intentId: "explain_change", locale: "en", context: { workspaceId: WORKSPACE_ID } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await res.json();
    expect(body.runId).toMatch(/^demo_run_/);
    expect(body.answer).toContain("22% to 31%");
    expect(body.demoBoundary).toContain("Sanitised Kam Man House demo data only");
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.runLiveAssistant).not.toHaveBeenCalled();
  });

  it("live mode requires membership of context.workspaceId", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    const res = await post({ mode: "live", surface: "home", intentId: "explain_priority", locale: "zh-HK", context: { workspaceId: WORKSPACE_ID } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID });
    expect(mocks.runLiveAssistant).not.toHaveBeenCalled();

    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    expect((await post({ mode: "live", surface: "home", intentId: "explain_priority", locale: "zh-HK", context: { workspaceId: WORKSPACE_ID } })).status).toBe(401);
  });

  it("live explain intent runs the live module for any role, rate-limited per user, without an LLM call", async () => {
    const res = await post({ mode: "live", surface: "home", intentId: "explain_priority", locale: "zh-HK", context: { workspaceId: WORKSPACE_ID, locationId: "22222222-2222-4222-8222-222222222222", versionId: "" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(live);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: "assistant_run", identifiers: ["user-1"], failClosed: true }));
    expect(mocks.runLiveAssistant).toHaveBeenCalledWith({ membership: auth("viewer").membership, intentId: "explain_priority", surface: "home", locale: "zh-HK", context: { workspaceId: WORKSPACE_ID, locationId: "22222222-2222-4222-8222-222222222222", snapshotId: undefined, actionId: undefined, versionId: undefined } });
    expect(mocks.llmComplete).not.toHaveBeenCalled();
  });

  it("429s when the budget is spent and 503s when the live module throws", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    expect((await post({ mode: "live", surface: "home", intentId: "explain_priority", locale: "en", context: { workspaceId: WORKSPACE_ID } })).status).toBe(429);
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.runLiveAssistant.mockRejectedValue(new Error("boom"));
    expect((await post({ mode: "live", surface: "home", intentId: "explain_priority", locale: "en", context: { workspaceId: WORKSPACE_ID } })).status).toBe(503);
    consoleError.mockRestore();
  });

  it("400s invalid bodies", async () => {
    const cases: Array<[unknown, string]> = [
      ["{not json", "invalid_json"],
      [[], "invalid_request"],
      [{ mode: "sample", surface: "home", intentId: "explain_priority", locale: "en" }, "invalid_mode"],
      [{ mode: "demo", surface: "nowhere", intentId: "explain_priority", locale: "en" }, "invalid_surface"],
      [{ mode: "demo", surface: "home", intentId: "explain_everything", locale: "en" }, "invalid_intent"],
      [{ mode: "demo", surface: "home", intentId: "explain_priority", locale: "fr" }, "unsupported_locale"],
      [{ mode: "live", surface: "home", intentId: "explain_priority", locale: "en" }, "workspaceId is required"],
      [{ mode: "live", surface: "home", intentId: "explain_priority", locale: "en", context: { workspaceId: "ws-1" } }, "workspaceId is required"],
      [{ mode: "live", surface: "home", intentId: "explain_priority", locale: "en", context: { workspaceId: WORKSPACE_ID, actionId: "nope" } }, "invalid_context"],
    ];
    for (const [body, error] of cases) {
      const res = await post(body);
      expect(res.status, error).toBe(400);
      expect(await res.json()).toEqual({ error });
    }
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });
});

it("forbids viewer draft generation before the live runner", async () => {
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
  const res = await post({ mode: "live", surface: "action", intentId: "draft_review_reply", locale: "en", context: { workspaceId: WORKSPACE_ID, actionId: "33333333-3333-4333-8333-333333333333" } });
  expect(res.status).toBe(403);
  expect(mocks.runLiveAssistant).not.toHaveBeenCalled();
  expect(mocks.llmComplete).not.toHaveBeenCalled();
});

it.each(["draft_review_reply", "friendlier_review_reply", "generate_social", "generate_faq", "generate_menu"])("rejects viewer %s even with forged owner membership", async (intentId) => {
  const res = await post({ mode: "live", surface: "action", intentId, locale: "en", membership: auth("owner").membership, context: { workspaceId: WORKSPACE_ID, membership: auth("owner").membership } });
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: "forbidden" });
  expect(mocks.runLiveAssistant).not.toHaveBeenCalled();
  expect(mocks.llmComplete).not.toHaveBeenCalled();
});

it("passes only trusted membership to the runner", async () => {
  const trusted = auth("manager", ["22222222-2222-4222-8222-222222222222"]);
  mocks.authorizeWorkspaceRequest.mockResolvedValue(trusted);
  const res = await post({ mode: "live", surface: "action", intentId: "draft_review_reply", locale: "en", membership: auth("owner").membership, context: { workspaceId: WORKSPACE_ID, role: "owner", locationScope: null } });
  expect(res.status).toBe(200);
  expect(mocks.runLiveAssistant).toHaveBeenCalledWith(expect.objectContaining({ membership: trusted.membership }));
});

it("preserves out-of-scope manager explanations", async () => {
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", []));
  const res = await post({ mode: "live", surface: "action", intentId: "explain_limits", locale: "en", context: { workspaceId: WORKSPACE_ID, locationId: "22222222-2222-4222-8222-222222222222" } });
  expect(res.status).toBe(200);
  expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID });
});

it.each([["forbidden", 403], ["not_found", 404]] as const)("maps resolved context %s to %s", async (code, status) => {
  const { AssistantAccessError } = await import("@/lib/assistant/live");
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager"));
  mocks.runLiveAssistant.mockRejectedValue(new AssistantAccessError(code));
  const res = await post({ mode: "live", surface: "action", intentId: "draft_review_reply", locale: "en", context: { workspaceId: WORKSPACE_ID } });
  expect(res.status).toBe(status);
  expect(await res.json()).toEqual({ error: code });
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(mocks.llmComplete).not.toHaveBeenCalled();
});

it("canonicalizes UUID context before authorization and forwarding", async () => {
  const workspaceId = "abcdefab-cdef-4abc-8def-abcdefabcdef";
  const locationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const actionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const snapshotId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const versionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  mocks.authorizeWorkspaceRequest.mockResolvedValue({ ...auth("viewer"), membership: { ...auth("viewer").membership, workspaceId } });
  const res = await post({ mode: "live", surface: "action", intentId: "explain_limits", locale: "en", context: { workspaceId: workspaceId.toUpperCase(), locationId: locationId.toUpperCase(), actionId: actionId.toUpperCase(), snapshotId: snapshotId.toUpperCase(), versionId: versionId.toUpperCase() } });
  expect(res.status).toBe(200);
  expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: workspaceId });
  expect(mocks.runLiveAssistant).toHaveBeenCalledWith(expect.objectContaining({ context: { workspaceId, locationId, actionId, snapshotId, versionId } }));
});
