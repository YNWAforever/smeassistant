import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMResult } from "@/lib/llm";
import { runAgentForAction, RunError } from "./runs";

interface Query { table: string; op: "select" | "insert" | "update"; payload: unknown; filters: Record<string, unknown> }
type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  action: null as Row | null,
  asset: null as Row | null,
  rpc: vi.fn(),
  calls: [] as Query[],
}));

const action: Row = {
  id: "act-1", workspace_id: "ws-1", location_id: "loc-1", template_key: "review-response", source: "finding", source_finding_keys: ["gbp.owner_response_low"],
  source_snapshot_id: null, title: { en: "Reply", "zh-HK": "回覆", "zh-TW": "回覆" }, summary: { en: "", "zh-HK": "", "zh-TW": "" }, evidence: {},
  priority: "high", priority_score: 70, priority_factors: [], effort_minutes: 10, required_inputs: ["brand_voice"], provided_inputs: { brand_voice: "warm" },
  assignee_user_id: null, due_at: null, action_state: "recommended", measurement_state: "not_eligible", capability: "Live", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
};

const snapshotRow: Row = { id: "snap-1", job_id: "job-1", workspace_id: "ws-1", location_id: "loc-1", market: "hk", observed_at: "2026-09-01T10:00:00Z", scoring_version: "v", overall_score: 62, coverage: 0.8, module_states: {}, metrics: { "gbp.response_rate_pct": 18 }, website_checks: null, comparable_to: null, diff_id: null, created_at: "2026-09-01T10:00:00Z" };

function respond(q: Query): unknown {
  switch (q.table) {
    case "actions": return q.op === "select" ? state.action : null;
    case "workspaces": return { business_name: "Kam Man House", market: "hk", timezone: "Asia/Hong_Kong" };
    case "brand_profiles": return { voice: "warm", approved_claims: ["Family-run"], prohibited_terms: ["best in Hong Kong"], languages: ["zh-HK"], facts: {} };
    case "locations": return { id: "loc-1", slug: "yik-yam", name: "Yik Yam", address: null, district: "Yau Ma Tei" };
    case "scan_snapshots": return [snapshotRow];
    case "audit_jobs": return { raw_data: { gbp: { reviews: [{ rating: 2, text: "Slow service", time: "2026-08-30", owner_response: null }, { rating: 5, text: "Great", time: "2026-08-31", owner_response: "Thanks" }] } } };
    case "action_runs": return q.op === "insert" ? { id: "run-1" } : null;
    case "assets": return state.asset;
    default: return null;
  }
}

function client(): SupabaseClient {
  const from = (table: string) => {
    const q: Query = { table, op: "select", payload: null, filters: {} };
    let recorded = false;
    const record = () => { if (!recorded) { state.calls.push(q); recorded = true; } };
    const resolve = () => { record(); return Promise.resolve({ data: respond(q), error: null }); };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self, order: self, limit: self, is: self, in: self, not: self,
      eq: (column: string, value: unknown) => { q.filters[column] = value; return chain; },
      insert: (payload: unknown) => { q.op = "insert"; q.payload = payload; return chain; },
      update: (payload: unknown) => { q.op = "update"; q.payload = payload; return chain; },
      maybeSingle: resolve, single: resolve, returns: resolve,
      then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => resolve().then(onOk, onErr),
    });
    return chain;
  };
  return { from, rpc: state.rpc } as unknown as SupabaseClient;
}

const good = (over: Partial<Record<string, unknown>> = {}): LLMResult => ({
  text: JSON.stringify({ title: "Replies", body: "1. Thank you — we will speed up service. Please come back.", acceptance_criteria: ["check names"], warnings: [], facts_used: ["voice"], facts_needed: [], ...over }),
  usage: { inputTokens: 100, outputTokens: 50 },
});

const runsUpdates = () => state.calls.filter((c) => c.table === "action_runs" && c.op === "update").map((c) => c.payload as Row);
const actionUpdates = () => state.calls.filter((c) => c.table === "actions" && c.op === "update").map((c) => c.payload as Row);
const audits = () => state.calls.filter((c) => c.table === "audit_events").map((c) => (c.payload as Row).event);

beforeEach(() => {
  state.action = { ...action };
  state.asset = null;
  state.calls = [];
  state.rpc.mockReset();
  state.rpc.mockResolvedValue({ data: { kind: "created", version_id: "v-1", version_no: 1 }, error: null });
});

describe("runAgentForAction", () => {
  it("runs the template's agent, creates v1 through the RPC and persists tokens", async () => {
    const llm = vi.fn(async (prompt: string) => { expect(prompt).toContain("Slow service"); expect(prompt).not.toContain("Great"); return good(); });
    const result = await runAgentForAction(client(), { actionId: "act-1", actorId: "user-1", locale: "zh-HK", llm });
    expect(result).toEqual({ runId: "run-1", state: "succeeded", versionId: "v-1", versionNo: 1 });
    expect(llm).toHaveBeenCalledWith(expect.any(String), { jsonMode: true, temperature: 0.4, maxTokens: 1200, timeoutMs: 45_000 });
    expect(state.rpc).toHaveBeenCalledWith("create_output_version", expect.objectContaining({ p_action_id: "act-1", p_author_type: "agent", p_action_run_id: "run-1", p_base_version_id: null }));
    expect(runsUpdates().map((u) => u.state)).toEqual(["running", "succeeded"]);
    expect(runsUpdates()[1]).toMatchObject({ input_tokens: 100, output_tokens: 50, cost_usd: 0.00006 });
    expect(actionUpdates().at(-1)).toMatchObject({ action_state: "in_progress" });
    expect(audits()).toEqual(["run.started", "run.succeeded"]);
  });

  it("retries once on invalid output, then fails without touching versions", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const llm = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ text: "not json", usage: { inputTokens: 10, outputTokens: 1 } });
    const result = await runAgentForAction(client(), { actionId: "act-1", actorId: "user-1", locale: "en", llm });
    expect(result.state).toBe("failed");
    expect(result.error).toMatch(/existing draft is unchanged/);
    expect(llm).toHaveBeenCalledTimes(2);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(runsUpdates().at(-1)).toMatchObject({ state: "failed", input_tokens: 10, output_tokens: 1 });
    expect(actionUpdates()).toEqual([]);
    expect(audits()).toEqual(["run.started", "run.failed"]);
    consoleError.mockRestore();
  });

  it("facts_needed → action needs_input, run succeeded, no version", async () => {
    const llm = vi.fn(async () => good({ body: "", facts_needed: ["language"] }));
    const result = await runAgentForAction(client(), { actionId: "act-1", actorId: "user-1", locale: "en", llm, inputs: { language: "" } });
    expect(result).toEqual({ runId: "run-1", state: "succeeded", factsNeeded: ["language"] });
    expect(state.rpc).not.toHaveBeenCalled();
    expect(actionUpdates()[0]).toMatchObject({ provided_inputs: { brand_voice: "warm", language: "" } });
    expect(actionUpdates().at(-1)).toMatchObject({ action_state: "needs_input" });
  });

  it("merges acceptance warnings into the stored output", async () => {
    const llm = vi.fn(async () => good({ body: "We are the best in Hong Kong, refund guaranteed." }));
    await runAgentForAction(client(), { actionId: "act-1", actorId: "user-1", locale: "en", llm });
    expect(state.rpc).toHaveBeenCalledWith("create_output_version", expect.objectContaining({ p_meta: expect.objectContaining({ warnings: ["prohibited_term:best in Hong Kong", "compensation_promise"] }) }));
  });

  it("social_post without an approved asset or text_only asks for asset_or_text_only before calling the model", async () => {
    state.action = { ...action, template_key: "social-post", provided_inputs: { asset_id: "asset-1" } };
    state.asset = { id: "asset-1", rights_status: "needs_review" };
    const llm = vi.fn();
    const result = await runAgentForAction(client(), { actionId: "act-1", actorId: "user-1", locale: "en", llm });
    expect(result).toEqual({ runId: "run-1", state: "succeeded", factsNeeded: ["asset_or_text_only"] });
    expect(llm).not.toHaveBeenCalled();

    state.calls = [];
    state.asset = { id: "asset-1", rights_status: "approved" };
    llm.mockResolvedValue(good({ alt_text: "Roast goose on a plate" }));
    expect((await runAgentForAction(client(), { actionId: "act-1", actorId: "user-1", locale: "en", llm })).versionId).toBe("v-1");
  });

  it("honours an explicit agentKey and refuses unknown or template-less agents", async () => {
    const llm = vi.fn(async () => good());
    await runAgentForAction(client(), { actionId: "act-1", actorId: "user-1", locale: "en", llm, agentKey: "validation_plan" });
    expect(state.calls.find((c) => c.table === "action_runs" && c.op === "insert")?.payload).toMatchObject({ agent_key: "validation_plan" });
    await expect(runAgentForAction(client(), { actionId: "act-1", actorId: "user-1", locale: "en", llm, agentKey: "nope" })).rejects.toMatchObject({ code: "agent_unavailable" });
    state.action = { ...action, template_key: "gbp-profile-fix" };
    await expect(runAgentForAction(client(), { actionId: "act-1", actorId: "user-1", locale: "en", llm })).rejects.toBeInstanceOf(RunError);
    state.action = null;
    await expect(runAgentForAction(client(), { actionId: "missing", actorId: "user-1", locale: "en", llm })).rejects.toMatchObject({ code: "action_not_found" });
  });

  it("marks the run failed when the version RPC throws (draft never overwritten)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    state.rpc.mockResolvedValue({ data: null, error: { message: "connection reset" } });
    const result = await runAgentForAction(client(), { actionId: "act-1", actorId: "user-1", locale: "zh-TW", llm: vi.fn(async () => good()) });
    expect(result.state).toBe("failed");
    expect(runsUpdates().at(-1)).toMatchObject({ state: "failed" });
    consoleError.mockRestore();
  });
});
