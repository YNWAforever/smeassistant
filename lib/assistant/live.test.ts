import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDb, type Query } from "@/app/api/actions/_shared/test-db";
import { ACTION_ID, LOCATION_ID, SNAPSHOT_ID, WORKSPACE_ID, actionRow, base, diff, socialRow, snapshot } from "./__fixtures__";
import { LIVE_BOUNDARY, runLiveAssistant } from "./live";

const mocks = vi.hoisted(() => ({ db: null as ReturnType<typeof import("@/app/api/actions/_shared/test-db").makeDb> | null }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => mocks.db }));

type Llm = (prompt: string, opts?: unknown) => Promise<typeof good | null>;
const state = { actions: [actionRow, socialRow] as Array<typeof actionRow>, snapshots: [snapshot, base] as Array<typeof snapshot> };

function snapshotRow(s: typeof snapshot) {
  return { id: s.id, job_id: s.jobId, workspace_id: s.workspaceId, location_id: s.locationId, market: s.market, observed_at: s.observedAt, scoring_version: s.scoringVersion, overall_score: s.overallScore, coverage: s.coverage, module_states: s.moduleStates, metrics: s.metrics, website_checks: null, comparable_to: s.comparableTo, diff_id: s.diffId, created_at: s.createdAt };
}

function respond(q: Query): unknown {
  switch (q.table) {
    case "workspaces": return { business_name: "Kam Man House", market: "hk", timezone: "Asia/Hong_Kong" };
    case "locations": return [{ id: LOCATION_ID, slug: "yik-yam", name: "Yik Yam", address: null, district: "Happy Valley", is_primary: true }];
    case "actions": return q.filters.id ? state.actions.find((a) => a.id === q.filters.id) ?? null : state.actions;
    case "scan_snapshots": {
      const byId = q.filters.id ? state.snapshots.find((s) => s.id === q.filters.id) ?? null : state.snapshots[0] ?? null;
      return q.filters.id ? (byId ? snapshotRow(byId) : null) : byId ? [snapshotRow(byId)] : [];
    }
    case "scan_diffs": return q.filters.id === diff.id ? diff : null;
    case "brand_profiles": return { voice: "warm", approved_claims: ["Family-run since 1988"], prohibited_terms: ["best in Hong Kong"], languages: ["zh-HK"], facts: {} };
    case "audit_jobs": return { raw_data: { gbp: { reviews: [{ rating: 3, text: "Waited 25 minutes on Friday", time: "2026-08-22", owner_response: null }] } } };
    default: return null;
  }
}

const good: { text: string; usage: { inputTokens: number; outputTokens: number } } = { text: JSON.stringify({ title: "Reply draft", body: "1. “Waited 25…” — Thank you for telling us; we are adding a host at Friday lunch. Please come back.", acceptance_criteria: ["no compensation"], warnings: [], facts_used: ["voice"], facts_needed: [] }), usage: { inputTokens: 10, outputTokens: 5 } };
const run = (over: Partial<Parameters<typeof runLiveAssistant>[0]> = {}) =>
  runLiveAssistant({ intentId: "explain_priority", surface: "home", locale: "en", context: { workspaceId: WORKSPACE_ID, locationId: LOCATION_ID }, llmReady: () => true, ...over });
const writes = () => mocks.db!.calls.filter((c) => c.op !== "select");

beforeEach(() => {
  const db = makeDb(respond);
  const from = db.from;
  // loadActionRows uses `.or(...)`, which the shared stand-in does not chain.
  db.from = (table: string) => { const chain = from(table); (chain as Record<string, unknown>).or = () => chain; return chain; };
  mocks.db = db;
  state.actions = [actionRow, socialRow];
  state.snapshots = [snapshot, base];
});

describe("runLiveAssistant", () => {
  it("answers explain intents from the template with real evidence ids and no model call", async () => {
    const llm = vi.fn();
    const result = await run({ intentId: "explain_change", llm });
    expect(llm).not.toHaveBeenCalled();
    expect(result).toMatchObject({ state: "completed", requiresApproval: false, demoBoundary: LIVE_BOUNDARY.en });
    expect(result.runId).toMatch(/^live_run_[0-9a-f-]{36}$/);
    expect(result.output).toBeUndefined();
    expect(result.answer).toContain("from 66 to 62 (-4 points");
    expect(result.evidenceRefs.map((r) => r.evidenceId)).toContain(`ev_${SNAPSHOT_ID}_composite`);
    expect(result.evidenceRefs.every((r) => r.scanId === "job-head")).toBe(true);
    expect(writes()).toEqual([]);
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it("resolves the snapshot from snapshotId, then the action's source snapshot, then the location's latest", async () => {
    const byId = await run({ intentId: "explain_limits", context: { workspaceId: WORKSPACE_ID, snapshotId: base.id } });
    expect(byId.evidenceRefs[0].evidenceId).toBe(`ev_${base.id}_score`);
    const byAction = await run({ intentId: "explain_limits", context: { workspaceId: WORKSPACE_ID, actionId: ACTION_ID } });
    expect(byAction.evidenceRefs[0].evidenceId).toBe(`ev_${SNAPSHOT_ID}_score`);
    const latest = await run({ intentId: "explain_limits", context: { workspaceId: WORKSPACE_ID } });
    expect(latest.evidenceRefs[0].evidenceId).toBe(`ev_${SNAPSHOT_ID}_score`);
    const foreign = await run({ intentId: "explain_limits", context: { workspaceId: WORKSPACE_ID, snapshotId: "99999999-9999-4999-8999-999999999999" } });
    expect(foreign.evidenceRefs[0].evidenceId).toBe(`ev_${SNAPSHOT_ID}_score`);
  });

  it("says so when the workspace has no snapshot yet", async () => {
    state.snapshots = [];
    const result = await run({ intentId: "explain_priority" });
    expect(result.answer).toContain("There is no finished scan for Yik Yam yet");
    expect(result.evidenceRefs).toEqual([]);
  });

  it("runs the matching agent once for a draft intent and returns an approval-gated artifact without writing", async () => {
    const llm = vi.fn<Llm>(async () => good);
    const result = await run({ intentId: "draft_review_reply", surface: "action", locale: "zh-HK", context: { workspaceId: WORKSPACE_ID, actionId: ACTION_ID }, llm });
    expect(llm).toHaveBeenCalledTimes(1);
    expect(llm).toHaveBeenCalledWith(expect.stringContaining("Waited 25 minutes"), { jsonMode: true, temperature: 0.4, maxTokens: 1200, timeoutMs: 45_000 });
    expect(llm.mock.calls[0][0]).toContain("Family-run since 1988");
    expect(result).toMatchObject({ state: "needs_approval", requiresApproval: true, demoBoundary: LIVE_BOUNDARY["zh-HK"] });
    expect(result.output).toMatchObject({ type: "review_reply", version: 1, title: "Reply draft", acceptanceCriteria: ["no compensation"] });
    expect(result.output!.artifactId).toMatch(/^art_[0-9a-f-]{36}$/);
    expect(result.output!.body).toContain("adding a host");
    expect(result.answer).toContain("「回覆未回覆的 Google 評論」的草稿已準備好");
    expect(writes()).toEqual([]);
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it("adds the warmer instruction for friendlier_review_reply and picks the matching open action when none is focused", async () => {
    const llm = vi.fn<Llm>(async () => good);
    await run({ intentId: "friendlier_review_reply", llm });
    expect(llm.mock.calls[0][0]).toContain("warmer, friendlier tone");
    const social = vi.fn<Llm>(async () => ({ ...good, text: JSON.stringify({ title: "Post", body: "Lunch is on.", acceptance_criteria: [], warnings: [], facts_used: [], facts_needed: [] }) }));
    const result = await run({ intentId: "generate_social", surface: "create", llm: social });
    expect(social.mock.calls[0][0]).toContain("Fill the Instagram gap");
    expect(result.output).toMatchObject({ type: "social_post", body: "Lunch is on." });
  });

  it("degrades to the template answer with a warning when the model is not configured or returns nothing", async () => {
    const llm = vi.fn(async () => null);
    const notConfigured = await run({ intentId: "draft_review_reply", llm, llmReady: () => false });
    expect(llm).not.toHaveBeenCalled();
    expect(notConfigured).toMatchObject({ state: "completed", requiresApproval: false });
    expect(notConfigured.output).toBeUndefined();
    expect(notConfigured.warnings[0]).toBe("AI drafting unavailable right now");
    expect(notConfigured.answer).toContain("is the top priority");

    const empty = await run({ intentId: "generate_menu", locale: "zh-TW", llm });
    expect(llm).toHaveBeenCalledTimes(1);
    expect(empty.output).toBeUndefined();
    expect(empty.warnings[0]).toBe("AI 草稿功能暫時無法使用");
    expect(writes()).toEqual([]);
  });

  it("falls back to explain_limits when there is no action to draft from", async () => {
    state.actions = [];
    const llm = vi.fn();
    const result = await run({ intentId: "generate_faq", llm });
    expect(llm).not.toHaveBeenCalled();
    expect(result.warnings[0]).toMatch(/No open action matches this request/);
    expect(result.answer).toContain("measured 3 of 4 sources");
  });

  it("relays facts_needed instead of an empty draft", async () => {
    const llm = vi.fn(async () => ({ ...good, text: JSON.stringify({ title: "", body: "", acceptance_criteria: [], warnings: [], facts_used: [], facts_needed: ["capacity", "lead_time"] }) }));
    const result = await run({ intentId: "generate_faq", llm });
    expect(result.output).toBeUndefined();
    expect(result.answer).toBe("The agent still needs: capacity, lead_time.");
    expect(result.requiresApproval).toBe(false);
  });
});
