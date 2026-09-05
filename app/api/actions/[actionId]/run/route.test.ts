import { POST } from "./route";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ID, LOCATION_ID, WORKSPACE_ID, authorizeLike, makeDb, type Query } from "@/app/api/actions/_shared/test-db";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  llmComplete: vi.fn(),
  enforceRateLimit: vi.fn(),
  db: null as ReturnType<typeof import("@/app/api/actions/_shared/test-db").makeDb> | null,
}));

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => mocks.db }));
vi.mock("@/lib/llm", () => ({ llmComplete: (...args: unknown[]) => mocks.llmComplete(...args) }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
}));

const action = {
  id: ACTION_ID, workspace_id: WORKSPACE_ID, location_id: LOCATION_ID, template_key: "review-request", source: "finding", source_finding_keys: [], source_snapshot_id: null,
  title: { en: "Ask", "zh-HK": "邀請", "zh-TW": "邀請" }, summary: { en: "", "zh-HK": "", "zh-TW": "" }, evidence: {}, priority: "high", priority_score: 60, priority_factors: [], effort_minutes: 8,
  required_inputs: [], provided_inputs: { brand_voice: "warm", channel: "WhatsApp" }, assignee_user_id: null, due_at: null, action_state: "recommended", measurement_state: "not_eligible", capability: "Live",
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
};

let actionRow: Record<string, unknown> | null = action;

function respond(q: Query): unknown {
  switch (q.table) {
    case "actions": return q.op === "select" ? actionRow : null;
    case "workspaces": return { business_name: "Shop", market: "hk", timezone: "Asia/Hong_Kong" };
    case "brand_profiles": return null;
    case "locations": return { id: LOCATION_ID, slug: "main", name: "Main", address: null, district: null };
    case "scan_snapshots": return [];
    case "action_runs": return q.op === "insert" ? { id: "run-1" } : null;
    default: return null;
  }
}

const PARAMS = { params: Promise.resolve({ actionId: ACTION_ID }) };
const post = (body: unknown = {}) => POST(new Request(`https://app.test/api/actions/${ACTION_ID}/run`, { method: "POST", body: JSON.stringify(body) }), PARAMS);

beforeEach(() => {
  vi.clearAllMocks();
  actionRow = action;
  mocks.db = makeDb(respond);
  mocks.db.rpc.mockResolvedValue({ data: { kind: "created", version_id: "v-1", version_no: 1 }, error: null });
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
  mocks.llmComplete.mockResolvedValue({ text: JSON.stringify({ title: "Ask", body: "Thanks for visiting — would you leave us a Google review?", acceptance_criteria: [], warnings: [], facts_used: [], facts_needed: [] }), usage: { inputTokens: 50, outputTokens: 20 } });
});

describe("POST /api/actions/[actionId]/run", () => {
  it("runs the agent and creates v1 for an owner", async () => {
    const res = await post({ inputs: { channel: "LINE" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runId: "run-1", state: "succeeded", versionId: "v-1", versionNo: 1 });
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "manager", locationId: LOCATION_ID });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: "action_run", identifiers: ["user-1"], failClosed: true }));
    expect(mocks.llmComplete).toHaveBeenCalledWith(expect.stringContaining("LINE"), { jsonMode: true, temperature: 0.4, maxTokens: 1200, timeoutMs: 45_000 });
    expect(mocks.db!.rpc).toHaveBeenCalledWith("create_output_version", expect.objectContaining({ p_author_type: "agent", p_action_run_id: "run-1" }));
    expect(mocks.db!.calls.filter((c) => c.table === "audit_events").map((c) => (c.payload as { event: string }).event)).toEqual(["run.started", "run.succeeded"]);
  });

  it("reports a failed run (no version) when the model never returns valid JSON", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.llmComplete.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ runId: "run-1", state: "failed" });
    expect(mocks.llmComplete).toHaveBeenCalledTimes(2);
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("403s a viewer and a manager outside the action's location scope", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
    expect((await post()).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", ["some-other-location"]));
    expect((await post()).status).toBe(403);
    expect(mocks.llmComplete).not.toHaveBeenCalled();
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [LOCATION_ID]));
    expect((await post()).status).toBe(200);
  });

  it("404s an unknown action, 409s a template without an agent, 429s over the limit", async () => {
    actionRow = null;
    expect((await post()).status).toBe(404);
    actionRow = { ...action, template_key: "gbp-profile-fix" };
    const res = await post();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "agent_unavailable" });
    actionRow = action;
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 });
    expect((await post()).status).toBe(429);
  });
});
