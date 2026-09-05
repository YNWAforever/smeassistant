import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth, makeDb, type Query } from "@/app/api/actions/_shared/test-db";
import { ACTION_ID, LOCATION_ID, SNAPSHOT_ID, WORKSPACE_ID, actionRow, base, diff, socialRow, snapshot } from "./__fixtures__";
import { LIVE_BOUNDARY, runLiveAssistant } from "./live";

const mocks = vi.hoisted(() => ({ db: null as ReturnType<typeof import("@/app/api/actions/_shared/test-db").makeDb> | null }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => mocks.db }));

type Llm = (prompt: string, opts?: unknown) => Promise<typeof good | null>;
const LOCATION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACTION_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SNAPSHOT_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const state = { actions: [actionRow, socialRow] as Array<typeof actionRow>, snapshots: [snapshot, base] as Array<typeof snapshot> };

function snapshotRow(s: typeof snapshot) {
  return { id: s.id, job_id: s.jobId, workspace_id: s.workspaceId, location_id: s.locationId, market: s.market, observed_at: s.observedAt, scoring_version: s.scoringVersion, overall_score: s.overallScore, coverage: s.coverage, module_states: s.moduleStates, metrics: s.metrics, website_checks: null, comparable_to: s.comparableTo, diff_id: s.diffId, created_at: s.createdAt };
}

function respond(q: Query): unknown {
  switch (q.table) {
    case "workspaces": return { business_name: "Kam Man House", market: "hk", timezone: "Asia/Hong_Kong" };
    case "locations": return [{ id: LOCATION_ID, slug: "yik-yam", name: "Yik Yam", address: null, district: "Happy Valley", is_primary: true }, { id: LOCATION_B, slug: "branch-b", name: "Branch B", address: null, district: null, is_primary: false }];
    case "actions": { const rows = state.actions.filter((a) => a.workspace_id === q.filters.workspace_id && (!q.filters.location_id || a.location_id === q.filters.location_id || a.location_id === null)); return q.filters.id ? rows.find((a) => a.id === q.filters.id) ?? null : rows; }
    case "scan_snapshots": {
      const byId = q.filters.id ? state.snapshots.find((s) => s.id === q.filters.id) ?? null : state.snapshots.find((s) => s.workspaceId === q.filters.workspace_id && (!q.filters.location_id || s.locationId === q.filters.location_id)) ?? null;
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
  runLiveAssistant({ intentId: "explain_priority", surface: "home", locale: "en", membership: auth("owner").membership, context: { workspaceId: WORKSPACE_ID, locationId: LOCATION_ID }, llmReady: () => true, ...over });
const writes = () => mocks.db!.calls.filter((c) => c.op !== "select");

beforeEach(() => {
  const db = makeDb(respond);
  const from = db.from;
  // loadActionRows uses `.or(...)`, which the shared stand-in does not chain.
  db.from = (table: string) => { const chain = from(table); (chain as Record<string, unknown>).or = (filter: string) => { (chain.eq as (key: string, value: string) => unknown)("location_id", filter.split(",")[0].slice("location_id.eq.".length)); return chain; }; return chain; };
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

describe("draft authority from persisted context", () => {
  beforeEach(() => {
    state.actions.push({ ...actionRow, id: ACTION_B, location_id: LOCATION_B, source_snapshot_id: SNAPSHOT_B });
    state.snapshots.push({ ...snapshot, id: SNAPSHOT_B, locationId: LOCATION_B, comparableTo: null, diffId: null });
  });

  async function denied(context: Parameters<typeof runLiveAssistant>[0]["context"], membership = auth("manager", [LOCATION_ID]).membership, status = 403) {
    const llm = vi.fn<Llm>(async () => good);
    const llmReady = vi.fn(() => true);
    await expect(run({ intentId: "draft_review_reply", context, membership, llm, llmReady })).rejects.toMatchObject({ status, code: status === 403 ? "forbidden" : "not_found" });
    expect(llmReady).not.toHaveBeenCalled();
    expect(llm).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  }

  it.each([undefined, LOCATION_B, LOCATION_ID])("denies location-B action with supplied location %s", async (locationId) => {
    await denied({ workspaceId: WORKSPACE_ID, actionId: ACTION_B, locationId });
  });

  it.each(["draft_review_reply", "friendlier_review_reply", "generate_social", "generate_faq", "generate_menu"] as const)("denies viewer %s before model readiness", async (intentId) => {
    const llm = vi.fn<Llm>(async () => good);
    const llmReady = vi.fn(() => false);
    await expect(run({ intentId, membership: auth("viewer").membership, llm, llmReady })).rejects.toMatchObject({ status: 403 });
    expect(llmReady).not.toHaveBeenCalled();
    expect(llm).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it("denies implicit drafts at an out-of-scope location and with entirely omitted context", async () => {
    await denied({ workspaceId: WORKSPACE_ID, locationId: LOCATION_B });
    await denied({ workspaceId: WORKSPACE_ID }, auth("manager", [LOCATION_B]).membership);
  });

  it.each(["missing", "foreign"])("does not substitute another action for an explicit %s action", async (kind) => {
    if (kind === "foreign") state.actions.push({ ...actionRow, id: "foreign-action", workspace_id: "foreign-workspace" });
    await denied({ workspaceId: WORKSPACE_ID, actionId: `${kind}-action` }, auth("owner").membership, 404);
  });

  it.each(["missing", "foreign", "other-location"])("rejects an explicit %s snapshot instead of silently replacing or mixing it", async (kind) => {
    const snapshotId = kind === "other-location" ? SNAPSHOT_B : `${kind}-snapshot`;
    if (kind === "foreign") state.snapshots.push({ ...snapshot, id: snapshotId, workspaceId: "foreign-workspace" });
    await denied({ workspaceId: WORKSPACE_ID, actionId: ACTION_ID, snapshotId }, auth("owner").membership, 404);
  });

  it("rejects spoofed location for an owner too", async () => {
    await denied({ workspaceId: WORKSPACE_ID, actionId: ACTION_B, locationId: LOCATION_ID }, auth("owner").membership, 404);
  });

  it("rejects missing and foreign location context", async () => {
    await denied({ workspaceId: WORKSPACE_ID, locationId: "non-workspace-location" }, auth("owner").membership, 404);
  });

  it("rejects membership for another workspace", async () => {
    await denied({ workspaceId: WORKSPACE_ID }, { ...auth("owner").membership, workspaceId: "other" });
  });

  it("checks evidence scope for a workspace-wide action", async () => {
    state.actions[0] = { ...actionRow, location_id: null, source_snapshot_id: SNAPSHOT_B };
    await denied({ workspaceId: WORKSPACE_ID, actionId: ACTION_ID });
  });

  it.each(["owner", "manager"] as const)("allows %s to draft the persisted in-scope action", async (role) => {
    const llm = vi.fn<Llm>(async () => good);
    const result = await run({ intentId: "draft_review_reply", membership: auth(role, [LOCATION_B]).membership, context: { workspaceId: WORKSPACE_ID, actionId: ACTION_B }, llm });
    expect(result.requiresApproval).toBe(true);
    expect(llm).toHaveBeenCalledTimes(1);
    expect(llm.mock.calls[0][0]).toContain("Branch B");
    expect(result.evidenceRefs.every((ref) => ref.evidenceId.includes(SNAPSHOT_B))).toBe(true);
    expect(writes()).toEqual([]);
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it.each(["viewer", "manager"] as const)("preserves %s reads of location-B evidence", async (role) => {
    const llm = vi.fn();
    const result = await run({ intentId: "explain_limits", membership: auth(role, [LOCATION_ID]).membership, context: { workspaceId: WORKSPACE_ID, actionId: ACTION_B }, llm });
    expect(result.state).toBe("completed");
    expect(result.evidenceRefs[0].evidenceId).toContain(SNAPSHOT_B);
    expect(llm).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });
});

it("requires a trusted membership even for a direct runner call", async () => {
  const llm = vi.fn<Llm>(async () => good);
  await expect(run({ intentId: "draft_review_reply", membership: undefined, llm })).rejects.toMatchObject({ status: 403 });
  expect(llm).not.toHaveBeenCalled();
  expect(writes()).toEqual([]);
});

it.each([null, [LOCATION_ID]] as Array<string[] | null>)("allows manager scope %j to draft an implicit action", async (locationScope) => {
  const llm = vi.fn<Llm>(async () => good);
  const result = await run({ intentId: "draft_review_reply", membership: auth("manager", locationScope).membership, context: { workspaceId: WORKSPACE_ID }, llm });
  expect(result.requiresApproval).toBe(true);
  expect(llm).toHaveBeenCalledTimes(1);
  expect(writes()).toEqual([]);
  expect(mocks.db!.rpc).not.toHaveBeenCalled();
});

it("uses the implicitly selected action's source snapshot instead of the location's latest", async () => {
  state.actions = [{ ...actionRow, source_snapshot_id: base.id }];
  const llm = vi.fn<Llm>(async () => good);
  const result = await run({ intentId: "draft_review_reply", llm });
  expect(result.evidenceRefs.every((ref) => ref.scanId === base.jobId)).toBe(true);
  expect(llm).toHaveBeenCalledTimes(1);
});

it("allows workspace-wide action drafting with in-scope evidence", async () => {
  state.actions = [{ ...actionRow, location_id: null }];
  const llm = vi.fn<Llm>(async () => good);
  const result = await run({ intentId: "draft_review_reply", membership: auth("manager", [LOCATION_ID]).membership, llm });
  expect(result.requiresApproval).toBe(true);
  expect(llm).toHaveBeenCalledTimes(1);
  expect(writes()).toEqual([]);
});

it("rejects a persisted action/source-snapshot location mismatch", async () => {
  state.snapshots.push({ ...snapshot, id: SNAPSHOT_B, locationId: LOCATION_B });
  state.actions = [{ ...actionRow, source_snapshot_id: SNAPSHOT_B }];
  const llm = vi.fn<Llm>(async () => good);
  await expect(run({ intentId: "draft_review_reply", context: { workspaceId: WORKSPACE_ID, actionId: ACTION_ID }, llm })).rejects.toMatchObject({ status: 404, code: "not_found" });
  expect(llm).not.toHaveBeenCalled();
  expect(writes()).toEqual([]);
  expect(mocks.db!.rpc).not.toHaveBeenCalled();
});

it("denies implicit workspace-wide action using out-of-scope source evidence", async () => {
  state.snapshots.push({ ...snapshot, id: SNAPSHOT_B, locationId: LOCATION_B });
  state.actions = [{ ...actionRow, location_id: null, source_snapshot_id: SNAPSHOT_B }];
  const llm = vi.fn<Llm>(async () => good);
  await expect(run({ intentId: "draft_review_reply", context: { workspaceId: WORKSPACE_ID }, membership: auth("manager", [LOCATION_ID]).membership, llm })).rejects.toMatchObject({ status: 403, code: "forbidden" });
  expect(llm).not.toHaveBeenCalled();
  expect(writes()).toEqual([]);
  expect(mocks.db!.rpc).not.toHaveBeenCalled();
});

it.each(["en", "zh-HK", "zh-TW"] as const)("withholds a nonempty draft when required facts are missing (%s)", async (locale) => {
  const llm = vi.fn<Llm>(async () => ({
    ...good,
    text: JSON.stringify({ title: "Reply draft", body: "Thank you for your question.", acceptance_criteria: [], warnings: ["Confirm the capacity with the owner"], facts_used: [], facts_needed: ["capacity"] }),
  }));
  const result = await run({ intentId: "draft_review_reply", surface: "action", locale, context: { workspaceId: WORKSPACE_ID, actionId: ACTION_ID }, llm });
  expect(result.output).toBeUndefined();
  expect(result.requiresApproval).toBe(false);
  expect(result.state).toBe("completed");
  expect(result.answer).toBe(locale === "en" ? "The agent still needs: capacity." : "Agent 仍需要：capacity。");
  expect(result.warnings).toContain("Confirm the capacity with the owner");
  expect(result.evidenceRefs.length).toBeGreaterThan(0);
  expect(llm).toHaveBeenCalledTimes(1);
  expect(writes()).toEqual([]);
  expect(mocks.db!.rpc).not.toHaveBeenCalled();
});
