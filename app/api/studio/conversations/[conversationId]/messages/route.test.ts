import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth, authorizeLike, LOCATION_ID, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";
import type { StudioConversation, StudioMessage, StudioStreamEvent } from "@/lib/studio/types";

/**
 * POST /api/studio/conversations/[id]/messages (design §7, §9).
 *
 * The orchestrator is a mock here: these tests are about the route's ordering —
 * flag → body → membership → scope → limiter → budget → conversation → turn
 * lock → briefing → SSE — and about the two failure shapes (pre-stream JSON vs
 * in-stream `error` + `done`). Audit payloads must never carry owner text.
 */

const CONVERSATION_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_LOCATION_ID = "77777777-7777-4777-8777-777777777777";
const SECRET_TEXT = "SECRET_QUESTION_TEXT do not audit me";

class StudioRepositoryError extends Error {
  constructor() {
    super("studio_fixture");
    this.name = "StudioRepositoryError";
  }
}
void StudioRepositoryError;

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  checkAiBudget: vi.fn(),
  aiSpend24h: vi.fn(),
  getConversation: vi.fn(),
  studioRepository: vi.fn(),
  buildStudioBriefing: vi.fn(),
  runStudioTurn: vi.fn(),
  acquireStudioTurnLock: vi.fn(),
  recordNeonEvent: vi.fn(),
  listConversationDocuments: vi.fn(),
  findSearchBrief: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args),
}));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
}));
vi.mock("@/lib/budgets/ai", () => ({ checkAiBudget: (...args: unknown[]) => mocks.checkAiBudget(...args) }));
vi.mock("@/lib/repositories/artifacts", () => ({
  artifactRepository: () => ({ aiSpend24h: (...args: unknown[]) => mocks.aiSpend24h(...args) }),
}));
vi.mock("@/lib/repositories/studio", () => ({
  studioRepository: (...args: unknown[]) => mocks.studioRepository(...args),
  toStudioConversation: (row: { id: string; status: string }) => ({ id: row.id, status: row.status, title: "", locationId: null, createdAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T00:00:00Z", lastMessageAt: "2026-11-08T00:00:00Z" }),
  toStudioMessage: (row: unknown) => row,
}));
vi.mock("@/lib/studio/context", () => ({ buildStudioBriefing: (...args: unknown[]) => mocks.buildStudioBriefing(...args) }));
vi.mock("@/lib/studio/orchestrator", () => ({ runStudioTurn: (...args: unknown[]) => mocks.runStudioTurn(...args) }));
vi.mock("@/lib/studio/turn-lock", () => ({ acquireStudioTurnLock: (...args: unknown[]) => mocks.acquireStudioTurnLock(...args) }));
vi.mock("@/lib/workspace/audit", () => ({
  recordNeonEvent: (...args: unknown[]) => mocks.recordNeonEvent(...args),
  ipHashFor: () => "ip-hash-fixture",
}));
vi.mock("@/lib/workspace/conversation-documents", () => ({
  ConversationDocumentError: class ConversationDocumentError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  listConversationDocuments: (...args: unknown[]) => mocks.listConversationDocuments(...args),
}));
vi.mock("@/lib/repositories/conversation-search", () => ({
  conversationSearchRepository: () => ({ find: (...args: unknown[]) => mocks.findSearchBrief(...args) }),
}));

const row = {
  id: CONVERSATION_ID,
  workspace_id: WORKSPACE_ID,
  location_id: LOCATION_ID,
  created_by: "user-1",
  title: "",
  status: "active",
  created_at: "2026-11-08T00:00:00Z",
  updated_at: "2026-11-08T00:00:00Z",
  last_message_at: "2026-11-08T00:00:00Z",
};

const conversation: StudioConversation = { id: CONVERSATION_ID, title: "", status: "active", locationId: LOCATION_ID, createdAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T00:00:00Z", lastMessageAt: "2026-11-08T00:00:00Z" };
const userMessage: StudioMessage = { id: "message-1", conversationId: CONVERSATION_ID, seq: 1, role: "user", content: SECRET_TEXT, parts: [{ kind: "text", text: SECRET_TEXT }], intent: null, createdAt: "2026-11-08T00:00:00Z" };
const assistantMessage: StudioMessage = { id: "message-2", conversationId: CONVERSATION_ID, seq: 2, role: "assistant", content: "Grounded answer", parts: [{ kind: "text", text: "Grounded answer" }], intent: "explain_priority", createdAt: "2026-11-08T00:00:01Z" };

const briefingStub = { briefing: {}, systemBriefing: "BRIEFING", contextSummary: {}, promptChips: [], evidenceCatalogue: [], chips: [] };

const body = (overrides: Record<string, unknown> = {}) => ({ workspaceId: WORKSPACE_ID, text: "What should I do first?", ...overrides });

async function send(payload: unknown, query = "locale=en"): Promise<Response> {
  const { POST } = await import("./route");
  return POST(
    new Request(`https://app.test/api/studio/conversations/${CONVERSATION_ID}/messages?${query}`, { method: "POST", body: JSON.stringify(payload) }),
    { params: Promise.resolve({ conversationId: CONVERSATION_ID }) },
  );
}

async function frames(res: Response): Promise<StudioStreamEvent[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((frame) => frame.trim().length > 0)
    .map((frame) => JSON.parse(frame.replace(/^data: /, "")) as StudioStreamEvent);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "true");
  vi.stubEnv("LLM_MODEL", "deepseek-v4.1-flash");
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.checkAiBudget.mockResolvedValue({ allowed: true });
  mocks.aiSpend24h.mockResolvedValue({ globalUsd: 0, workspaceUsd: 0 });
  mocks.getConversation.mockResolvedValue(row);
  mocks.studioRepository.mockReturnValue({ getConversation: mocks.getConversation });
  mocks.buildStudioBriefing.mockResolvedValue(briefingStub);
  mocks.acquireStudioTurnLock.mockResolvedValue(async () => {});
  mocks.recordNeonEvent.mockResolvedValue(undefined);
  mocks.listConversationDocuments.mockResolvedValue([]);
  mocks.findSearchBrief.mockResolvedValue(null);
  mocks.runStudioTurn.mockImplementation(async (input: { emit: (event: StudioStreamEvent) => Promise<void> | void }) => {
    await input.emit({ type: "status", stage: "reading" });
    await input.emit({ type: "user", message: userMessage });
    await input.emit({ type: "status", stage: "finishing" });
    await input.emit({ type: "message", message: assistantMessage, conversation });
    await input.emit({ type: "done" });
    return { ok: true, intent: "explain_priority", turn: "explain", artifact: false };
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("flag and request shape", () => {
  it("is a 404 with the flag off: no auth, no limiter, no budget, no SQL", async () => {
    for (const value of ["", "false", "TRUE", "1", " true"]) {
      vi.stubEnv("CONVERSATION_STUDIO_ENABLED", value);
      const res = await send(body());
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(await res.json()).toEqual({ error: "not_found" });
    }
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.checkAiBudget).not.toHaveBeenCalled();
    expect(mocks.studioRepository).not.toHaveBeenCalled();
    expect(mocks.acquireStudioTurnLock).not.toHaveBeenCalled();
  });

  it.each([
    ["broken json", "{broken"],
    ["null", null],
    ["missing workspace", { text: "hello" }],
    ["malformed workspace", { workspaceId: "nope", text: "hello" }],
    ["missing text", { workspaceId: WORKSPACE_ID }],
    ["blank text", { workspaceId: WORKSPACE_ID, text: "   " }],
    ["too long", { workspaceId: WORKSPACE_ID, text: "x".repeat(4001) }],
    ["malformed location", { workspaceId: WORKSPACE_ID, text: "hello", locationId: "../x" }],
    ["malformed document id", { workspaceId: WORKSPACE_ID, text: "hello", documentVersionIds: ["nope"] }],
    ["too many documents", { workspaceId: WORKSPACE_ID, text: "hello", documentVersionIds: Array.from({ length: 6 }, (_, index) => `0000000${index}-0000-4000-8000-000000000000`) }],
    ["malformed brief id", { workspaceId: WORKSPACE_ID, text: "hello", searchBriefIds: ["nope"] }],
    ["too many briefs", { workspaceId: WORKSPACE_ID, text: "hello", searchBriefIds: ["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"] }],
    ["more than five combined", { workspaceId: WORKSPACE_ID, text: "hello", documentVersionIds: ["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"], searchBriefIds: ["44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555","66666666-6666-4666-8666-666666666666"] }],
  ])("rejects %s with 400 before auth", async (_label, payload) => {
    const request = new Request(`https://app.test/api/studio/conversations/${CONVERSATION_ID}/messages?locale=en`, {
      method: "POST",
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
    const { POST } = await import("./route");
    const res = await POST(request, { params: Promise.resolve({ conversationId: CONVERSATION_ID }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_input" });
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("rejects a malformed conversation id and an unsupported locale", async () => {
    const { POST } = await import("./route");
    const badId = await POST(new Request("https://app.test/x?locale=en", { method: "POST", body: JSON.stringify(body()) }), { params: Promise.resolve({ conversationId: "nope" }) });
    expect(badId.status).toBe(400);
    const badLocale = await send(body(), "locale=fr");
    expect(badLocale.status).toBe(400);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });
});

describe("attached workbench evidence", () => {
  const DOCUMENT_ID = "88888888-8888-4888-8888-888888888888";
  const BRIEF_ID = "99999999-9999-4999-8999-999999999999";

  it("re-reads a document in scope and passes only its refs and text to the turn", async () => {
    mocks.listConversationDocuments.mockResolvedValue([{
      id: DOCUMENT_ID,
      title: "Shop facts.pdf",
      text: "Opening hours: 09:00-18:00",
      truncated: false,
    }]);
    const res = await send(body({ documentVersionIds: [DOCUMENT_ID] }));
    expect(res.status).toBe(200);
    await frames(res);
    expect(mocks.listConversationDocuments).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE_ID, locationId: LOCATION_ID },
      [DOCUMENT_ID],
    );
    const input = mocks.runStudioTurn.mock.calls[0][0] as {
      evidenceRefs: unknown;
      loadEvidence: (refs: unknown[]) => Promise<unknown>;
    };
    expect(input.evidenceRefs).toEqual([{ source: "document", documentVersionId: DOCUMENT_ID, title: "Shop facts.pdf", truncated: false }]);
    await expect(input.loadEvidence([{ source: "document", documentVersionId: DOCUMENT_ID, title: "Shop facts.pdf", truncated: false }])).resolves.toEqual([{
      source: "document",
      id: DOCUMENT_ID,
      title: "Shop facts.pdf",
      text: "Opening hours: 09:00-18:00",
      truncated: false,
    }]);
  });

  it("loads an approved search brief and grounds the turn with its localized text", async () => {
    mocks.findSearchBrief.mockResolvedValue({
      id: BRIEF_ID,
      approvedAt: "2026-11-09T00:00:00Z",
      brief: {
        en: { title: "Review queries", missing: "Review queries", why: "Trust", steps: ["Ask for reviews"], citation: "GSC" },
        "zh-HK": { title: "評論查詢", missing: "評論查詢", why: "信任", steps: ["邀請評論"], citation: "GSC" },
        "zh-TW": { title: "評論查詢", missing: "評論查詢", why: "信任", steps: ["邀請評論"], citation: "GSC" },
      },
    });
    const res = await send(body({ searchBriefIds: [BRIEF_ID] }));
    expect(res.status).toBe(200);
    await frames(res);
    expect(mocks.findSearchBrief).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, locationId: LOCATION_ID }, BRIEF_ID);
    const input = mocks.runStudioTurn.mock.calls[0][0] as { evidenceRefs: unknown[] };
    expect(input.evidenceRefs).toEqual([{ source: "search_brief", searchBriefId: BRIEF_ID, title: "Review queries", truncated: false }]);
  });

  it("rejects a missing document or unapproved/foreign brief before the stream", async () => {
    const { ConversationDocumentError } = await import("@/lib/workspace/conversation-documents");
    mocks.listConversationDocuments.mockRejectedValueOnce(new ConversationDocumentError("document_not_found"));
    expect((await send(body({ documentVersionIds: [DOCUMENT_ID] }))).status).toBe(404);

    mocks.findSearchBrief.mockResolvedValueOnce(null);
    expect((await send(body({ searchBriefIds: [BRIEF_ID] }))).status).toBe(404);

    mocks.findSearchBrief.mockResolvedValueOnce({ id: BRIEF_ID, approvedAt: null, brief: null });
    expect((await send(body({ searchBriefIds: [BRIEF_ID] }))).status).toBe(404);
    expect(mocks.runStudioTurn).not.toHaveBeenCalled();
  });
});

describe("pre-stream failures are JSON with the assistant route's status mapping", () => {
  it("passes 401/403 through", async () => {
    for (const [status, code] of [[401, "unauthenticated"], [403, "forbidden"]] as const) {
      mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status, code });
      const res = await send(body());
      expect(res.status).toBe(status);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(await res.json()).toEqual({ error: code });
    }
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it("refuses a location outside a scoped manager's scope with 404 before the limiter", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [OTHER_LOCATION_ID]));
    const res = await send(body({ locationId: LOCATION_ID }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it("rate-limits per user under studio_message, fail-closed, before the budget", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const res = await send(body());
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(res.headers.get("retry-after")).toBe("42");
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: "studio_message", identifiers: ["user-1"], failClosed: true }));
    expect(mocks.checkAiBudget).not.toHaveBeenCalled();
  });

  it("maps a budget refusal to 429 and a pause to 503 before any conversation read", async () => {
    mocks.checkAiBudget.mockResolvedValue({ allowed: false, scope: "ai_workspace" });
    const budget = await send(body());
    expect(budget.status).toBe(429);
    expect(await budget.json()).toEqual({ error: "ai_budget_reached" });

    mocks.checkAiBudget.mockResolvedValue({ allowed: false, scope: "ai_paused" });
    const paused = await send(body());
    expect(paused.status).toBe(503);
    expect(await paused.json()).toEqual({ error: "ai_paused" });
    expect(mocks.studioRepository).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing or foreign conversation", async () => {
    mocks.getConversation.mockResolvedValue(null);
    const res = await send(body());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.acquireStudioTurnLock).not.toHaveBeenCalled();
  });

  it("returns 409 archived for an archived conversation", async () => {
    mocks.getConversation.mockResolvedValue({ ...row, status: "archived" });
    const res = await send(body());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "archived" });
    expect(mocks.acquireStudioTurnLock).not.toHaveBeenCalled();
  });

  it("returns 409 conversation_busy when the turn lock is already held", async () => {
    mocks.acquireStudioTurnLock.mockResolvedValue(null);
    const res = await send(body());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "conversation_busy" });
    expect(mocks.buildStudioBriefing).not.toHaveBeenCalled();
    expect(mocks.runStudioTurn).not.toHaveBeenCalled();
  });

  it("returns 503 when the lock or the briefing cannot be read, releasing nothing twice", async () => {
    mocks.acquireStudioTurnLock.mockRejectedValue(new Error("pool exhausted"));
    const noLock = await send(body());
    expect(noLock.status).toBe(503);
    expect(await noLock.json()).toEqual({ error: "unavailable" });

    const release = vi.fn(async () => {});
    mocks.acquireStudioTurnLock.mockResolvedValue(release);
    mocks.buildStudioBriefing.mockRejectedValue(new Error("db down"));
    const noBriefing = await send(body());
    expect(noBriefing.status).toBe(503);
    expect(release).toHaveBeenCalledTimes(1);
    expect(mocks.runStudioTurn).not.toHaveBeenCalled();
  });

  it("maps a briefing scope refusal to its status", async () => {
    const { AssistantAccessError } = await import("@/lib/assistant/errors");
    mocks.buildStudioBriefing.mockRejectedValue(new AssistantAccessError("forbidden"));
    const res = await send(body());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });
});

describe("the SSE turn", () => {
  it("sends text/event-stream headers and the documented frame order", async () => {
    const res = await send(body());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    const events = await frames(res);
    expect(events.map((event) => (event.type === "status" ? `status:${event.stage}` : event.type))).toEqual([
      "status:reading",
      "user",
      "status:finishing",
      "message",
      "done",
    ]);
    // The orchestrator receives the trusted membership, the stored conversation id and the locale.
    expect(mocks.runStudioTurn).toHaveBeenCalledWith(expect.objectContaining({
      membership: auth("owner").membership,
      conversationId: CONVERSATION_ID,
      text: "What should I do first?",
      locale: "en",
      locationId: LOCATION_ID,
      model: "deepseek-v4.1-flash",
    }));
    expect(mocks.buildStudioBriefing).toHaveBeenCalledWith({ membership: auth("owner").membership, locale: "en", locationId: LOCATION_ID });
  });

  it("writes one assistant.run audit row with enumerated fields only — never the text", async () => {
    await frames(await send(body({ text: SECRET_TEXT })));
    expect(mocks.recordNeonEvent).toHaveBeenCalledTimes(1);
    const input = mocks.recordNeonEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(input).toMatchObject({
      workspaceId: WORKSPACE_ID,
      locationId: LOCATION_ID,
      actorType: "user",
      actorId: "user-1",
      event: "assistant.run",
      entityType: "conversation",
      entityId: CONVERSATION_ID,
      locale: "en",
    });
    expect(input.payload).toEqual({ surface: "studio", intent: "explain_priority", artifact: false, turn: "explain" });
    const serialized = JSON.stringify(mocks.recordNeonEvent.mock.calls);
    expect(serialized).not.toContain("SECRET_QUESTION_TEXT");
    expect(serialized).not.toContain("Grounded answer");
  });

  it("emits error + done in-stream when the orchestrator fails before writing anything", async () => {
    mocks.runStudioTurn.mockResolvedValue({ ok: false, code: "not_found", persisted: false });
    const res = await send(body());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = await frames(res);
    expect(events.map((event) => event.type)).toEqual(["error", "done"]);
    expect(events[0]).toMatchObject({ type: "error", code: "not_found", retryable: false });
    expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
  });

  it("does not add a second error frame when the orchestrator already stored a warning message", async () => {
    mocks.runStudioTurn.mockImplementation(async (input: { emit: (event: StudioStreamEvent) => Promise<void> | void }) => {
      await input.emit({ type: "message", message: assistantMessage, conversation });
      await input.emit({ type: "done" });
      return { ok: false, code: "ai_unavailable", persisted: true, turn: "chat" };
    });
    const events = await frames(await send(body()));
    expect(events.map((event) => event.type)).toEqual(["message", "done"]);
    expect(mocks.recordNeonEvent).toHaveBeenCalledTimes(1);
  });

  it("emits error + done when the orchestrator throws and still releases the turn lock", async () => {
    const release = vi.fn(async () => {});
    mocks.acquireStudioTurnLock.mockResolvedValue(release);
    mocks.runStudioTurn.mockRejectedValue(new Error("unexpected"));
    const events = await frames(await send(body()));
    expect(events.map((event) => event.type)).toEqual(["error", "done"]);
    expect(events[0]).toMatchObject({ type: "error", code: "unavailable", retryable: true });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases the turn lock after a successful turn exactly once", async () => {
    const release = vi.fn(async () => {});
    mocks.acquireStudioTurnLock.mockResolvedValue(release);
    await frames(await send(body()));
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("pins the studio_message rate-limit policy at 60 turns an hour", async () => {
    const actual = await vi.importActual<typeof import("@/lib/security/rate-limit")>("@/lib/security/rate-limit");
    expect(actual.RATE_LIMITS.studio_message).toEqual({ limit: 60, windowSeconds: 3600 });
  });

  it("exposes the 60s route budget", async () => {
    const route = await import("./route");
    expect(route.maxDuration).toBe(60);
  });
});
