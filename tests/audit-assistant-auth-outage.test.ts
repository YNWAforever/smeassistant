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
vi.mock("@/lib/llm", () => ({ llmConfigured: () => true, llmCompleteDetailed: async (...args: unknown[]) => { const result = await mocks.llmComplete(...args); return result ? { ok: true, result } : { ok: false, code: "no_model_output", retryable: false }; }, llmComplete: (...args: unknown[]) => mocks.llmComplete(...args) }));
vi.mock("@/lib/assistant/live", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/assistant/live")>()), runLiveAssistant: (...args: unknown[]) => mocks.runLiveAssistant(...args) }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
}));

const post = (body: unknown) => import("@/app/api/assistant/run/route").then(({ POST }) => POST(new Request("https://app.test/api/assistant/run", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) })));
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

it("AUDIT F-20261011-02: identity outage should return a retryable structured 503", async () => {
  mocks.authorizeWorkspaceRequest.mockRejectedValue(new Error("identity_provider_unavailable"));
  await expect(post({ mode:"live",surface:"home",intentId:"explain_priority",locale:"en",context:{workspaceId:WORKSPACE_ID} })).resolves.toHaveProperty("status",503);
});
