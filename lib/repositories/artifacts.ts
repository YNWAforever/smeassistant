import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { getPool } from '../db/client';
import { withTransaction } from '../db/transaction';
import type { AgentOutput } from '../agents';
import type { LLMUsage } from '../llm';
import type { Json } from './workflow';
import { workflowRepository, type CreateOutputVersionInput } from './workflow';
import { workspaceReadRepository, SNAPSHOT_COLUMNS, DIFF_COLUMNS } from './workspace-read';
import { rowToSnapshot, type ScanSnapshotRow, type ScanDiffRow } from '../workspace/snapshots';
import type { ActionState } from '../domain';
import type { ActionScope, VersionScope } from '../workspace/versions';

type Executor = Pick<Pool | PoolClient, 'query'>;
const EXPECTED_ERRORS = new Set(['version_conflict','not_approved','allowance_exceeded','version_closed','version_not_found','invalid_decision','invalid_mode','artifact_scope_mismatch']);
// Fixed SQL fragment for the actions alias `a`, shared by both scope entry points.
// A workspace-wide action can use location evidence; callers must separately
// authorize the evidence's persisted location before drafting.
const ACTION_SCOPE_PREDICATE = `(a.location_id IS NULL OR EXISTS(SELECT 1 FROM locations l WHERE l.id=a.location_id AND l.workspace_id=a.workspace_id))
 AND (a.source_snapshot_id IS NULL OR EXISTS(SELECT 1 FROM scan_snapshots s JOIN audit_jobs j ON j.id=s.job_id
  WHERE s.id=a.source_snapshot_id AND s.workspace_id=a.workspace_id AND j.workspace_id=a.workspace_id
  AND (a.location_id IS NULL OR s.location_id=a.location_id)
  AND j.location_id IS NOT DISTINCT FROM s.location_id
  AND (s.location_id IS NULL OR EXISTS(SELECT 1 FROM locations evidence_location WHERE evidence_location.id=s.location_id AND evidence_location.workspace_id=a.workspace_id))))`;
/** Preserve domain failures without exposing driver messages, SQL or connection details. */
async function operation<T>(run: () => Promise<T>): Promise<T> {
 try { return await run(); }
 catch (error) {
  if (error instanceof Error && EXPECTED_ERRORS.has(error.message)) throw new Error(error.message);
  throw new Error('artifact_operation_failed');
 }
}

/** What the assistant produced, stored verbatim so the version is built from the server's copy. */
export interface AssistantDraftOutput {
 title: string;
 body: string;
 alt_text: string | null;
 acceptance_criteria: string[];
 warnings: string[];
 facts_used: string[];
}

export interface RecordAssistantDraftInput {
 actionId: string;
 workspaceId: string;
 actorId: string;
 agentKey: string;
 promptVersion: string;
 intentId: string;
 surface: string;
 locale: string;
 model: string | null;
 output: AssistantDraftOutput;
 usage: LLMUsage;
 /** Null when the gateway reported no usage; never a guessed zero. */
 costUsd: number | null;
 /** ISO-8601; the run is recorded already finished because it is. */
 finishedAt: string;
}

export interface AssistantDraftRow {
 output: unknown;
 agent_key: string;
 prompt_version: string | null;
 input: unknown;
}

/**
 * Artifact persistence uses the original atomic SQL operations. A supplied
 * transaction client is used for every scope check and workflow call.
 * Membership authority remains the caller's responsibility; these checks reject
 * inconsistent persisted parent/child references before returning scope or writing.
 */
export function artifactRepository(client?: Executor) {
 const db = () => client ?? getPool();
 async function actionScope(actionId: string): Promise<ActionScope | null> {
  return operation(async () => {
   const row=(await db().query<{id:string;workspace_id:string;location_id:string|null}>(`SELECT a.id,a.workspace_id,a.location_id FROM actions a
    WHERE a.id=$1 AND ${ACTION_SCOPE_PREDICATE}`,[actionId])).rows[0];
   return row ? {actionId:row.id,workspaceId:row.workspace_id,locationId:row.location_id} : null;
  });
 }
 async function versionScope(versionId: string): Promise<VersionScope | null> {
  return operation(async () => {
   const row=(await db().query<{id:string;action_id:string;workspace_id:string;location_id:string|null}>(`SELECT v.id,v.action_id,a.workspace_id,a.location_id FROM output_versions v
    JOIN actions a ON a.id=v.action_id AND a.workspace_id=v.workspace_id
    WHERE v.id=$1 AND ${ACTION_SCOPE_PREDICATE}
    AND (v.action_run_id IS NULL OR EXISTS(SELECT 1 FROM action_runs r WHERE r.id=v.action_run_id AND r.action_id=a.id AND r.workspace_id=a.workspace_id))`,[versionId])).rows[0];
   return row ? {versionId:row.id,actionId:row.action_id,workspaceId:row.workspace_id,locationId:row.location_id} : null;
  });
 }
 async function requireVersion(versionId: string) {
  if (!await versionScope(versionId)) throw new Error('version_not_found');
 }
 async function assistantSnapshot(workspaceId: string, snapshotId: string | null, locationId: string | null) {
  return operation(async () => {
   const row=(await db().query<ScanSnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM scan_snapshots s
    WHERE workspace_id=$1 AND ($2::uuid IS NULL OR id=$2) AND ($3::uuid IS NULL OR location_id=$3)
    AND EXISTS(SELECT 1 FROM audit_jobs j WHERE j.id=s.job_id AND j.workspace_id=s.workspace_id AND j.location_id IS NOT DISTINCT FROM s.location_id)
    AND (location_id IS NULL OR EXISTS(SELECT 1 FROM locations l WHERE l.id=s.location_id AND l.workspace_id=s.workspace_id))
    ORDER BY observed_at DESC,created_at DESC,id DESC LIMIT 1`,[workspaceId,snapshotId,locationId])).rows[0];
   return row ? rowToSnapshot(row) : null;
  });
 }
 return {
  actionScope,versionScope,
  async assistantWorkspace(workspaceId: string) { return (await workspaceReadRepository(client).workspaces([workspaceId]))[0] ?? null; },
  assistantLocations(workspaceId: string) { return workspaceReadRepository(client).locations([workspaceId]); },
  assistantActions(workspaceId: string, opts: {locationId?: string|null;states?: ActionState[];ids?:string[]} = {}) { return workspaceReadRepository(client).actions(workspaceId,opts); },
  assistantSnapshot(workspaceId: string, snapshotId: string) { return assistantSnapshot(workspaceId,snapshotId,null); },
  assistantLatestSnapshot(workspaceId: string, locationId: string|null) { return assistantSnapshot(workspaceId,null,locationId); },
  async assistantDiff(id: string|null, workspaceId: string, headJobId: string|null) {
   return operation(async () => {
   if(!id || !headJobId) return null;
   // A snapshot pins one comparison; another base may have a newer diff for this head.
   const row=(await db().query<ScanDiffRow>(`SELECT ${DIFF_COLUMNS} FROM scan_diffs d
    WHERE id=$1 AND head_job_id=$3
    AND EXISTS(SELECT 1 FROM audit_jobs h JOIN audit_jobs b ON b.id=d.base_job_id
      AND b.workspace_id=h.workspace_id AND b.location_id IS NOT DISTINCT FROM h.location_id
      WHERE h.id=d.head_job_id AND h.workspace_id=$2
      AND (h.location_id IS NULL OR EXISTS(SELECT 1 FROM locations l WHERE l.id=h.location_id AND l.workspace_id=h.workspace_id)))`,[id,workspaceId,headJobId])).rows[0];
   return row ?? null;
   });
  },
  assistantBrand(workspaceId: string) {
   return operation(async ()=>(await db().query<{voice:string|null;approved_claims:unknown;prohibited_terms:unknown;languages:unknown;facts:unknown}>('SELECT voice,approved_claims,prohibited_terms,languages,facts FROM brand_profiles WHERE workspace_id=$1',[workspaceId])).rows[0] ?? null);
  },
  assistantReviewData(workspaceId: string, jobId: string) {
   return operation(async ()=>(await db().query<{raw_data:unknown}>(`SELECT raw_data FROM audit_jobs j WHERE id=$1 AND workspace_id=$2
    AND (location_id IS NULL OR EXISTS(SELECT 1 FROM locations l WHERE l.id=j.location_id AND l.workspace_id=j.workspace_id))`,[jobId,workspaceId])).rows[0]?.raw_data ?? null);
  },
  /**
   * Persist a finished assistant draft as a terminal `action_runs` row and
   * return its id.
   *
   * The point is custody of the TEXT. Before this, the operator sheet handed
   * the model's body to the browser and the browser posted it back to
   * `/versions`, where `author_type` was hard-coded `'user'`: the append-only
   * log then asserted a member wrote what a model produced, no `action_runs`
   * row existed so `output_versions.action_run_id` was null, and the
   * `llmComplete` usage was never costed. A marker travelling beside the body
   * could not have fixed that -- anything the client carries, the client can
   * drop or swap. Only a body the server already holds can be attributed.
   *
   * The action row itself is untouched: the assistant is read-only in
   * authority (CLAUDE.md §3.8), so this records that a model ran, never that
   * the owner acted on it.
   */
  recordAssistantDraft(input: RecordAssistantDraftInput) {
   return operation(async () => {
    const scope=await actionScope(input.actionId);
    if(!scope || scope.workspaceId!==input.workspaceId) throw new Error('artifact_scope_mismatch');
    const row=(await db().query<{id:string}>(`INSERT INTO action_runs(workspace_id,action_id,agent_key,state,input,output,model,prompt_version,input_tokens,output_tokens,cost_usd,requested_by,started_at,finished_at)
     VALUES($1,$2,$3,'succeeded',$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz,$12::timestamptz) RETURNING id`,
     [scope.workspaceId,input.actionId,input.agentKey,JSON.stringify({source:'assistant',intent:input.intentId,surface:input.surface,locale:input.locale}),
      JSON.stringify(input.output),input.model,input.promptVersion,input.usage.inputTokens,input.usage.outputTokens,input.costUsd,input.actorId,input.finishedAt])).rows[0];
    return row.id;
   });
  },
  /**
   * The server's own copy of an assistant draft, for redeeming into a version.
   * `input->>'source'` keeps this to assistant drafts: an ordinary agent run
   * already produced its version through `finish()` and must not be redeemable
   * a second time by id.
   */
  assistantDraft(runId: string, actionId: string, workspaceId: string) {
   return operation(async ()=>(await db().query<AssistantDraftRow>(`SELECT output,agent_key,prompt_version,input FROM action_runs
    WHERE id=$1 AND action_id=$2 AND workspace_id=$3 AND state='succeeded' AND input->>'source'='assistant'`,[runId,actionId,workspaceId])).rows[0] ?? null);
  },
  createOutputVersion(input: CreateOutputVersionInput) {
   return operation(async () => {
    const scope=await actionScope(input.actionId);
    if (!scope) throw new Error('artifact_scope_mismatch');
    if (input.baseVersionId) {
     const base=(await db().query<{action_id:string}>('SELECT action_id FROM output_versions WHERE id=$1',[input.baseVersionId])).rows[0];
     // Missing/foreign-action/stale bases keep the atomic function's conflict result.
     if (base?.action_id === input.actionId && !await versionScope(input.baseVersionId)) throw new Error('artifact_scope_mismatch');
    }
    if(input.actionRunId) {
     const run=await db().query('SELECT id FROM action_runs WHERE id=$1 AND action_id=$2 AND workspace_id=$3',[input.actionRunId,input.actionId,scope.workspaceId]);
     if(!run.rows.length) throw new Error('artifact_scope_mismatch');
    }
    return workflowRepository(db()).createOutputVersion(input);
   });
  },
  approveOutputVersion(versionId: string, actor: string, comment: string | null) {
   return operation(async () => { await requireVersion(versionId); return workflowRepository(db()).approveOutputVersion(versionId,actor,comment); });
  },
  decideOutputVersion(versionId: string, actor: string, decision: string, comment: string | null) {
   return operation(async () => { await requireVersion(versionId); return workflowRepository(db()).decideOutputVersion(versionId,actor,decision,comment); });
  },
  exportOutputVersion(versionId: string, actor: string, mode: string, clientKey: string) {
   return operation(async () => {
    await requireVersion(versionId);
    // The SQL idempotency lookup is global and precedes its target lookup.
    // Bind the untrusted retry token to the authorized target and delivery mode.
    const key=createHash('sha256').update(JSON.stringify(['artifact-export',versionId,mode,clientKey])).digest('hex');
    return workflowRepository(db()).exportOutputVersion(versionId,actor,mode,key);
   });
  },
 };
}
export type ArtifactRepository = ReturnType<typeof artifactRepository>;

/** Live drafting has a read-only repository capability; saving is an explicit separate action. */
export type LiveAssistantRepository = Pick<ArtifactRepository,'actionScope'|'assistantWorkspace'|'assistantLocations'|'assistantActions'|'assistantSnapshot'|'assistantLatestSnapshot'|'assistantDiff'|'assistantBrand'|'assistantReviewData'|'versionScope'>;


export interface QueueActionRunInput {
 actionId: string;
 actorId: string;
 agentKey: string;
 input: Record<string, unknown>;
 promptVersion: string;
 model: string | null;
 now: Date;
 providedInputs?: Record<string, unknown>;
}
export interface RunAttribution { runId: string; actorId: string; locale: string; ipHash?: string | null }
export interface FinishActionRunInput extends RunAttribution {
 usage: LLMUsage;
 costUsd: number | null;
 output: AgentOutput | null;
 factsNeeded?: string[];
 error?: string;
 reason?: string;
 finishedAt: Date;
}
export type ActionRunCompletion = {runId:string;state:'succeeded';versionId?:string;versionNo?:number;factsNeeded?:string[]}
 | {runId:string;state:'failed';error:string};
type RunTransaction = <T>(run: (client: PoolClient) => Promise<T>) => Promise<T>;
type PersistedRun = { id:string;action_id:string;workspace_id:string;location_id:string|null;agent_key:string;prompt_version:string;requested_by:string|null;state:string };

/**
 * All run writes require an explicit transaction capability. Its callback owns
 * the connection; injected callers keep their pool or existing transaction.
 * Calls are short and never enclose model/provider work. Savepoints keep each
 * operation atomic even when a caller catches an error in a larger transaction.
 * Membership and evidence-location authorization must precede queue().
 */
export function actionRunRepository(transaction: RunTransaction = withTransaction) {
 async function atomic<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  try {
   return await transaction(async client => {
    const savepoint=`artifact_run_${randomUUID().replaceAll('-','')}`;
    await client.query(`SAVEPOINT ${savepoint}`);
    try {
     const result=await run(client);
     await client.query(`RELEASE SAVEPOINT ${savepoint}`);
     return result;
    } catch(error) {
     await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
     await client.query(`RELEASE SAVEPOINT ${savepoint}`);
     throw error;
    }
   });
  } catch { throw new Error('artifact_run_operation_failed'); }
 }
 /**
  * The state precondition here is the fence for lib/repositories/action-run-reaper.ts,
  * which has no lease token by design. A worker whose handler was killed and whose
  * run was later reaped to 'timed_out' cannot come back and overwrite it: the
  * `row.state !== state` check makes finish() throw `invalid_run_transition`
  * (surfaced as `artifact_run_operation_failed`), so no output_version is created,
  * `actions.action_state` is not moved and no audit row is written. Relaxing this
  * precondition — for example an "upsert the terminal state" refactor — would
  * silently re-open that overwrite hole.
  */
 async function loadRun(client: PoolClient, input: RunAttribution, state: string): Promise<PersistedRun> {
  const row=(await client.query<PersistedRun>(`SELECT r.id,r.action_id,r.workspace_id,a.location_id,r.agent_key,r.prompt_version,r.requested_by,r.state
   FROM action_runs r JOIN actions a ON a.id=r.action_id AND a.workspace_id=r.workspace_id
   WHERE r.id=$1 FOR UPDATE OF r,a`,[input.runId])).rows[0];
  if(!row || row.state!==state || row.requested_by!==input.actorId || !await artifactRepository(client).actionScope(row.action_id)) throw new Error('invalid_run_transition');
  return row;
 }
 async function audit(client:PoolClient,row:PersistedRun,input:RunAttribution,event:string,payload:Record<string,unknown>) {
  await client.query(`INSERT INTO audit_events(workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload)
   VALUES($1,$2,'user',$3,$4,'action_run',$5,$6)`,[row.workspace_id,row.location_id,input.actorId,event,row.id,
   JSON.stringify({locale:input.locale,...(input.ipHash?{ip_hash:input.ipHash}:{}),agent_key:row.agent_key,action_id:row.action_id,...payload})]);
 }
 return {
  queue(input:QueueActionRunInput):Promise<string> {
   return atomic(async client => {
    await client.query('SELECT id FROM actions WHERE id=$1 FOR UPDATE',[input.actionId]);
    const scope=await artifactRepository(client).actionScope(input.actionId);
    if(!scope) throw new Error('artifact_scope_mismatch');
    if(input.providedInputs) await client.query('UPDATE actions SET provided_inputs=$2,updated_at=$3 WHERE id=$1',[input.actionId,JSON.stringify(input.providedInputs),input.now]);
    const row=(await client.query<{id:string}>(`INSERT INTO action_runs(workspace_id,action_id,agent_key,state,input,prompt_version,model,requested_by,created_at)
     VALUES($1,$2,$3,'queued',$4,$5,$6,$7,$8) RETURNING id`,[scope.workspaceId,input.actionId,input.agentKey,JSON.stringify(input.input),input.promptVersion,input.model,input.actorId,input.now])).rows[0];
    if(!row) throw new Error('run_insert_failed');
    return row.id;
   });
  },
  start(input:RunAttribution):Promise<void> {
   return atomic(async client => {
    const row=await loadRun(client,input,'queued');
    await client.query("UPDATE action_runs SET state='running',started_at=now() WHERE id=$1",[row.id]);
    await audit(client,row,input,'run.started',{});
   });
  },
  finish(input:FinishActionRunInput):Promise<ActionRunCompletion> {
   return atomic(async client => {
    const row=await loadRun(client,input,'running');
    const factsNeeded=input.output?.facts_needed.length ? input.output.facts_needed : input.factsNeeded ?? [];
    if(!input.error && !input.output && !factsNeeded.length) throw new Error('missing_run_output');
    let version: {version_id:string;version_no:number} | undefined;
    if(!input.error && !factsNeeded.length && input.output) {
     const output=input.output;
     version=await artifactRepository(client).createOutputVersion({actionId:row.action_id,actor:input.actorId,authorType:'agent',actionRunId:row.id,
      body:output.body,alt:output.alt_text ?? null,meta:{title:output.title,acceptance_criteria:output.acceptance_criteria,warnings:output.warnings,facts_used:output.facts_used,agent_key:row.agent_key,prompt_version:row.prompt_version} as Json,baseVersionId:null});
    }
    const state=input.error?'failed':'succeeded';
    await client.query('UPDATE action_runs SET state=$2,output=$3,error=$4,input_tokens=$5,output_tokens=$6,cost_usd=$7,finished_at=$8 WHERE id=$1',
     [row.id,state,JSON.stringify(input.output ?? (factsNeeded.length?{facts_needed:factsNeeded}:null)),input.error ?? null,input.usage.inputTokens,input.usage.outputTokens,input.costUsd,input.finishedAt]);
    if(!input.error) await client.query('UPDATE actions SET action_state=$2,updated_at=$3 WHERE id=$1',[row.action_id,factsNeeded.length?'needs_input':'in_progress',input.finishedAt]);
    await audit(client,row,input,input.error?'run.failed':'run.succeeded',input.error?{reason:input.reason ?? 'unknown'}:version?{version_id:version.version_id,version_no:version.version_no,warnings:input.output?.warnings ?? []}:{facts_needed:factsNeeded});
    if(input.error) return {runId:row.id,state:'failed',error:input.error};
    return version?{runId:row.id,state:'succeeded',versionId:version.version_id,versionNo:version.version_no}:{runId:row.id,state:'succeeded',factsNeeded};
   });
  },
 };
}
export type ActionRunRepository=ReturnType<typeof actionRunRepository>;
