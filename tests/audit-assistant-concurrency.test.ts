import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/app/api/actions/_shared/test-db";
import { ACTION_ID, LOCATION_ID, SNAPSHOT_ID, WORKSPACE_ID, actionRow, base, diff, socialRow, snapshot } from "@/lib/assistant/__fixtures__";
import { DRAFT_AGENTS, LIVE_BOUNDARY, runLiveAssistant } from "@/lib/assistant/live";
import { AiBudgetRefusal } from "@/lib/budgets/ai";
import { templateByKey } from "@/lib/workspace/templates";

const asProvided = (row: { provided_inputs: unknown }) => (row.provided_inputs ?? {}) as Record<string, unknown>;

const repository = vi.hoisted(() => ({ actionScope:vi.fn(),assistantWorkspace:vi.fn(),assistantLocations:vi.fn(),assistantActions:vi.fn(),assistantSnapshot:vi.fn(),assistantLatestSnapshot:vi.fn(),assistantDiff:vi.fn(),assistantBrand:vi.fn(),assistantReviewData:vi.fn(),versionScope:vi.fn(),createOutputVersion:vi.fn(),recordAssistantDraft:vi.fn(),recordAssistantDraftFailure:vi.fn(),aiSpend24h:vi.fn(),assistantWaitingVersions:vi.fn(),assistantGoogleConnection:vi.fn() }));
const runPersistence = vi.hoisted(() => ({ queue:vi.fn(),start:vi.fn(),finishAssistantDraft:vi.fn() }));
vi.mock("@/lib/repositories/artifacts",async original=>({...(await original<typeof import("@/lib/repositories/artifacts")>()),artifactRepository:()=>repository,actionRunRepository:()=>runPersistence}));
const DRAFT_RUN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type Llm = (prompt: string, opts?: unknown) => Promise<typeof good | null>;
const LOCATION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACTION_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SNAPSHOT_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FAQ_FACTS = { owner_fact_1: "Seats 40", owner_fact_2: "Book by WhatsApp", owner_fact_3: "Vegetarian options daily" };
const faqRow: typeof actionRow = { ...actionRow, id: "55555555-5555-4555-8555-555555555555", template_key: "visibility-content", required_inputs: ["owner_fact_1", "owner_fact_2", "owner_fact_3"], provided_inputs: {} };
const menuRow: typeof actionRow = { ...actionRow, id: "66666666-6666-4666-8666-666666666666", template_key: "menu-translation", required_inputs: ["menu_items"], provided_inputs: {} };
const state = { actions: [actionRow, socialRow] as Array<typeof actionRow>, snapshots: [snapshot, base] as Array<typeof snapshot> };


const good: { text: string; usage: { inputTokens: number; outputTokens: number } } = { text: JSON.stringify({ title: "Reply draft", body: "1. “Waited 25…” — Thank you for telling us; we are adding a host at Friday lunch. Please come back.", acceptance_criteria: ["no compensation"], warnings: [], facts_used: ["voice"], facts_needed: [] }), usage: { inputTokens: 10, outputTokens: 5 } };
const run = (over: Partial<Parameters<typeof runLiveAssistant>[0]> = {}) =>
  runLiveAssistant({ intentId: "explain_priority", surface: "home", locale: "en", membership: auth("owner").membership, context: { workspaceId: WORKSPACE_ID, locationId: LOCATION_ID }, llmReady: () => true, ...over });
const writes = () => repository.createOutputVersion.mock.calls;

beforeEach(() => {
  vi.clearAllMocks();
  runPersistence.queue.mockResolvedValue(DRAFT_RUN_ID);
  runPersistence.start.mockResolvedValue(undefined);
  runPersistence.finishAssistantDraft.mockImplementation(async ({runId,result})=>{ if(result.ok) await repository.recordAssistantDraft(result.draft); else await repository.recordAssistantDraftFailure(result.failure); return {draftRunId:runId,state:result.ok?"succeeded":"failed"}; });
  repository.actionScope.mockImplementation(async(id)=>{const row=state.actions.find(a=>a.id===id);return row?{actionId:row.id,workspaceId:row.workspace_id,locationId:row.location_id}:null;});
  repository.assistantWorkspace.mockResolvedValue({business_name:"Kam Man House",market:"hk",timezone:"Asia/Hong_Kong"});
  repository.assistantLocations.mockResolvedValue([{id:LOCATION_ID,slug:"yik-yam",name:"Yik Yam",address:null,district:"Happy Valley",is_primary:true},{id:LOCATION_B,slug:"branch-b",name:"Branch B",address:null,district:null,is_primary:false}]);
  repository.assistantSnapshot.mockImplementation(async(workspaceId,id)=>state.snapshots.find(s=>s.id===id && s.workspaceId===workspaceId) ?? null);
  repository.assistantLatestSnapshot.mockImplementation(async(workspaceId,locationId)=>state.snapshots.find(s=>s.workspaceId===workspaceId && (!locationId || s.locationId===locationId)) ?? null);
  repository.assistantBrand.mockResolvedValue({voice:"warm",approved_claims:["Family-run since 1988"],prohibited_terms:["best in Hong Kong"],languages:["zh-HK"],facts:{}});
  repository.assistantReviewData.mockResolvedValue({gbp:{reviews:[{rating:3,text:"Waited 25 minutes on Friday",time:"2026-08-22",owner_response:null}]}});
  repository.versionScope.mockResolvedValue(null);
  repository.recordAssistantDraft.mockResolvedValue(DRAFT_RUN_ID);
  repository.recordAssistantDraftFailure.mockResolvedValue("failed-run-id");
  repository.aiSpend24h.mockResolvedValue({ globalUsd: 0, workspaceUsd: 0 });
  repository.assistantWaitingVersions.mockResolvedValue([]);
  repository.assistantGoogleConnection.mockResolvedValue({ status: "active" });
  repository.assistantDiff.mockImplementation(async (id) => id === diff.id ? diff : null);
  repository.assistantActions.mockImplementation(async (workspaceId, opts = {}) => state.actions.filter(a =>
    a.workspace_id === workspaceId && (!opts.locationId || a.location_id === opts.locationId || a.location_id === null) &&
    (!opts.states || opts.states.includes(a.action_state)) && (!opts.ids || opts.ids.includes(a.id))));
  state.actions = [actionRow, socialRow];
  state.snapshots = [snapshot, base];
});

it("AUDIT F-20261011-01: identical concurrent draft requests must call the model at most once, contextual flag off", async () => {
  const {ActionRunInFlightError}=await import("@/lib/repositories/artifacts");
  let live=false;
  runPersistence.queue.mockImplementation(async()=>{if(live)throw new ActionRunInFlightError();live=true;return DRAFT_RUN_ID;});
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const llm = vi.fn(async () => { await gate; return good; });
  const input = { intentId: "draft_review_reply" as const, surface: "action" as const, contextual: false, context: { workspaceId: WORKSPACE_ID, actionId: ACTION_ID }, llm };
  const pending = [run(input), run(input)];
  const outcomes=Promise.allSettled(pending);
  await vi.waitFor(() => expect(llm.mock.calls.length).toBeGreaterThanOrEqual(1));
  release();
  const results = await outcomes;
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const conflict=results.find(r=>r.status==='rejected') as PromiseRejectedResult;
  expect(conflict.reason).toBeInstanceOf(ActionRunInFlightError);
  expect(repository.recordAssistantDraft).toHaveBeenCalledTimes(1);
  expect(llm).toHaveBeenCalledTimes(1);
});
