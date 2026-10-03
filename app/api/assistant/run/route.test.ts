import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth, authorizeLike, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";
import { AiBudgetRefusal } from "@/lib/budgets/ai";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  runLiveAssistant: vi.fn(),
  llmComplete: vi.fn(),
  recordNeonEvent: vi.fn(),
}));

// Mocked rather than left real: it keeps the audit assertions below honest, and
// it keeps lib/db/client out of this file's module graph -- the first test here
// is already the slowest in the suite and was tripping the 5s timeout under
// load before the route imported the audit module at all.
vi.mock("@/lib/workspace/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace/audit")>()),
  recordNeonEvent: (...args: unknown[]) => mocks.recordNeonEvent(...args),
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
  // P4.3 Ruling R7: no test depends on the ambient flag; tests that need it on stub "true".
  vi.stubEnv("CONTEXTUAL_ASSISTANT_ENABLED", "");
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
  mocks.runLiveAssistant.mockResolvedValue(live);
});

afterEach(() => {
  vi.unstubAllEnvs();
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

  it("records an assistant.run audit event for a live run, and none for demo", async () => {
    // `assistant.run` was in the audit vocabulary from Phase 4 but nothing ever
    // emitted it, so Activity -- sold as an append-only owner audit -- omitted
    // every Visibility Operator run. An owner saw a version appear with no
    // trace that a model produced the text.
    await post({ mode: "live", surface: "home", intentId: "explain_priority", locale: "en", context: { workspaceId: WORKSPACE_ID } });

    expect(mocks.recordNeonEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        actorType: "user",
        event: "assistant.run",
        locale: "en",
        payload: expect.objectContaining({ intent: "explain_priority", surface: "home" }),
      }),
    );

    // Demo mode returns before any workspace exists to audit.
    mocks.recordNeonEvent.mockClear();
    await post({ mode: "demo", surface: "sample", intentId: "explain_priority", locale: "en" });
    expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
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
    expect(mocks.runLiveAssistant).toHaveBeenCalledWith({ membership: auth("viewer").membership, intentId: "explain_priority", surface: "home", locale: "zh-HK", contextual: false, context: { workspaceId: WORKSPACE_ID, locationId: "22222222-2222-4222-8222-222222222222", snapshotId: undefined, actionId: undefined, versionId: undefined } });
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

describe("POST /api/assistant/run AI budget", () => {
  it("answers 429 ai_budget_reached when the live draft was refused, and records no run event", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
    mocks.runLiveAssistant.mockRejectedValueOnce(new AiBudgetRefusal("ai_global"));
    const res = await post({ mode: "live", surface: "action", intentId: "draft_review_reply", locale: "en", context: { workspaceId: WORKSPACE_ID } });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "ai_budget_reached" });
    expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
  });

  it("answers 503 ai_paused when the live draft was refused because AI is paused, and records no run event", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
    mocks.runLiveAssistant.mockRejectedValueOnce(new AiBudgetRefusal("ai_paused"));
    const res = await post({ mode: "live", surface: "action", intentId: "draft_review_reply", locale: "en", context: { workspaceId: WORKSPACE_ID } });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "ai_paused" });
    expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
  });

  it("answers 503 ai_paused before the limiter for a draft intent, so a paused request never burns the assistant_run rate limit (P3.5d)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
    vi.stubEnv("AI_DRAFTS_PAUSED", "true");
    try {
      const res = await post({ mode: "live", surface: "action", intentId: "draft_review_reply", locale: "en", context: { workspaceId: WORKSPACE_ID } });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "ai_paused" });
      expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
      expect(mocks.runLiveAssistant).not.toHaveBeenCalled();
      expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      warn.mockRestore();
    }
  });

  it("still runs an explain intent (no LLM call) while AI drafting is paused (P3.5d)", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
    vi.stubEnv("AI_DRAFTS_PAUSED", "true");
    try {
      const res = await post({ mode: "live", surface: "home", intentId: "explain_priority", locale: "en", context: { workspaceId: WORKSPACE_ID } });
      expect(res.status).toBe(200);
      expect(mocks.runLiveAssistant).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("POST /api/assistant/run: contextual assistant (P4.3)", () => {
  const body = (intentId: string, extra: Record<string, unknown> = {}) => ({ mode: "live", surface: "action", intentId, locale: "en", context: { workspaceId: WORKSPACE_ID }, ...extra });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["explain_missing_inputs", "where_to_continue"])("404s %s with the flag off, before auth, the limiter and the runner", async (intentId) => {
    for (const value of ["", "false", "TRUE"]) {
      vi.stubEnv("CONTEXTUAL_ASSISTANT_ENABLED", value);
      const res = await post(body(intentId));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_enabled" });
    }
    vi.unstubAllEnvs();
    delete process.env.CONTEXTUAL_ASSISTANT_ENABLED;
    expect((await post(body(intentId))).status).toBe(404);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.runLiveAssistant).not.toHaveBeenCalled();
  });

  it("with the flag on a viewer gets 200 for where_to_continue, with no manager floor", async () => {
    vi.stubEnv("CONTEXTUAL_ASSISTANT_ENABLED", "true");
    const res = await post(body("where_to_continue"));
    expect(res.status).toBe(200);
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID });
    expect(mocks.runLiveAssistant).toHaveBeenCalledWith(expect.objectContaining({ intentId: "where_to_continue", contextual: true }));
  });

  it("with the flag on and AI paused, explain_missing_inputs still returns 200 without a model call", async () => {
    vi.stubEnv("CONTEXTUAL_ASSISTANT_ENABLED", "true");
    vi.stubEnv("AI_DRAFTS_PAUSED", "true");
    const res = await post(body("explain_missing_inputs"));
    expect(res.status).toBe(200);
    expect(mocks.llmComplete).not.toHaveBeenCalled();
  });

  it("passes contextual=false to the runner when the flag is off", async () => {
    await post(body("explain_priority"));
    expect(mocks.runLiveAssistant).toHaveBeenCalledWith(expect.objectContaining({ contextual: false }));
  });

  it("400s an unknown origin before auth, and accepts suggested, fixed and none", async () => {
    vi.stubEnv("CONTEXTUAL_ASSISTANT_ENABLED", "true");
    for (const origin of ["bogus", "", 1, null, "Suggested"]) {
      const res = await post(body("explain_priority", { origin }));
      expect(res.status, String(origin)).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_origin" });
    }
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    for (const origin of ["suggested", "fixed"]) expect((await post(body("explain_priority", { origin }))).status).toBe(200);
    expect((await post(body("explain_priority"))).status).toBe(200);
  });

  it("with the flag off ignores a bogus origin: no 400, and nothing about it in the audit (R7)", async () => {
    for (const origin of ["bogus", "", 1, null, "Suggested"]) {
      const res = await post(body("explain_priority", { origin }));
      expect(res.status, String(origin)).toBe(200);
    }
    expect((await post({ mode: "demo", surface: "sample", intentId: "explain_change", locale: "en", origin: "bogus" })).status).toBe(200);
    for (const call of mocks.recordNeonEvent.mock.calls) {
      expect(call[0].payload).toEqual({ intent: "explain_priority", surface: "action", artifact: false });
    }
    expect(mocks.recordNeonEvent).toHaveBeenCalledTimes(5);
  });

  it("with the flag off a valid origin is not written to the audit (R7)", async () => {
    await post(body("explain_priority", { origin: "suggested" }));
    expect(mocks.recordNeonEvent.mock.calls[0][0].payload).toEqual({ intent: "explain_priority", surface: "action", artifact: false });
  });

  it("audits origin and next_step_kind and nothing from the answer", async () => {
    vi.stubEnv("CONTEXTUAL_ASSISTANT_ENABLED", "true");
    mocks.runLiveAssistant.mockResolvedValue({ ...live, answer: "SECRET ANSWER TEXT", nextStep: { kind: "review_version", actionId: "a", versionId: "v" } });
    await post(body("where_to_continue", { origin: "suggested" }));
    expect(mocks.recordNeonEvent).toHaveBeenCalledTimes(1);
    const payload = mocks.recordNeonEvent.mock.calls[0][0].payload;
    expect(payload).toEqual({ intent: "where_to_continue", surface: "action", artifact: false, origin: "suggested", next_step_kind: "review_version" });
    expect(JSON.stringify(payload)).not.toContain("SECRET");
    expect(payload).not.toHaveProperty("answer");
  });

  it("keeps the audit payload unchanged when there is no origin and no nextStep", async () => {
    await post(body("explain_priority"));
    expect(mocks.recordNeonEvent.mock.calls[0][0].payload).toEqual({ intent: "explain_priority", surface: "action", artifact: false });
  });

  it("returns 404 not_found, with no audit row, when the runner refuses a foreign location", async () => {
    vi.stubEnv("CONTEXTUAL_ASSISTANT_ENABLED", "true");
    const { AssistantAccessError } = await import("@/lib/assistant/errors");
    mocks.runLiveAssistant.mockRejectedValue(new AssistantAccessError("not_found"));
    const res = await post(body("where_to_continue"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
  });
});
