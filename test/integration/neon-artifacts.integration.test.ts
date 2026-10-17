import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { applyMigrations } from '../../scripts/neon/migrations';
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from './neon-database';
import { artifactRepository } from '../../lib/repositories/artifacts';
import * as artifactModule from '../../lib/repositories/artifacts';
import { withTransaction } from '../../lib/db/transaction';
import { createAssistantVersion } from '../../lib/workspace/versions';
import { workspaceReadRepository } from '../../lib/repositories/workspace-read';

describe.runIf(process.env.NEON_INTEGRATION === '1')('Neon artifact persistence and scope', () => {
 let fixture: NeonDatabaseFixture, owner: Pool, runtime: Pool, actor: string;
 beforeAll(async () => {
  fixture = await startNeonDatabaseFixture('test');
  owner = new Pool({ connectionString: fixture.databaseUrl });
  await owner.query('CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
  await applyMigrations(owner);
  await owner.query("CREATE ROLE artifact_login LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
  const url = new URL(fixture.databaseUrl); url.username='artifact_login'; url.password='fixture-only';
  runtime = new Pool({ connectionString:url.href });
  actor=(await runtime.query("INSERT INTO app_users(email) VALUES('artifact@example.test') RETURNING id")).rows[0].id;
 });
 afterAll(async () => { await Promise.all([owner?.end(),runtime?.end()]); fixture?.stop(); });
 async function setup() {
  const workspace=(await runtime.query('INSERT INTO workspaces DEFAULT VALUES RETURNING id')).rows[0].id as string;
  const action=(await runtime.query("INSERT INTO actions(workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key) VALUES($1,'fixture','{}','{}','[]','low',1,'{}',5,'Live',$2) RETURNING id",[workspace,randomUUID()])).rows[0].id as string;
  return { workspace,action };
 }
 const input=(actionId: string, body='Original fixture') => ({ actionId,actor,authorType:'user',actionRunId:null,body,alt:null,meta:{ fixture:true },baseVersionId:null });
 it('blocks a manual retry and shows pending usage after a partial provider report', async () => {
  const {workspace,action}=await setup(),runs=artifactModule.actionRunRepository(work=>withTransaction(work,runtime));
  const runId=await runs.queue({actionId:action,actorId:actor,agentKey:'fixture',input:{},promptVersion:'fixture',model:'fixture',now:new Date()});
  await runs.start({runId,actorId:actor,locale:'en'});
  const attribution={runId,actorId:actor,workspaceId:workspace,attemptId:randomUUID()};
  await runs.beginProviderAttempt({...attribution,model:'fixture',startedAt:new Date()});
  await runs.observeProviderAttempt({...attribution,observation:{state:'reported',usage:{inputTokens:17,outputTokens:null}},finishedAt:new Date()});
  expect(await runs.finish({runId,actorId:actor,locale:'en',usage:{inputTokens:17,outputTokens:null},costUsd:null,output:null,error:'Incomplete usage',finishedAt:new Date()})).toMatchObject({usagePending:true});
  expect((await workspaceReadRepository(runtime).runs(workspace,[action]))[0]).toMatchObject({usage_pending:true});
  await expect(runs.queue({actionId:action,actorId:actor,agentKey:'fixture',input:{},promptVersion:'fixture',model:'fixture',now:new Date()})).rejects.toThrow('provider_usage_pending');
 });
 it('records a provider reservation before work and late usage once without reviving failed output', async () => {
  const {workspace,action}=await setup(), runs=artifactModule.actionRunRepository(work=>withTransaction(work,runtime));
  const runId=await runs.queue({actionId:action,actorId:actor,agentKey:'fixture',input:{},promptVersion:'fixture',model:'fixture',now:new Date()});
  await runs.start({runId,actorId:actor,locale:'en'});
  const attemptId=randomUUID(), attribution={runId,actorId:actor,workspaceId:workspace,attemptId};
  await runs.beginProviderAttempt({...attribution,model:'fixture',startedAt:new Date()});
  expect((await runtime.query('SELECT input_tokens,output_tokens,input FROM action_runs WHERE id=$1',[runId])).rows[0]).toMatchObject({
   input_tokens:null,output_tokens:null,input:{provider_usage:{status:'pending'}},
  });
  await runs.finish({runId,actorId:actor,locale:'en',usage:{inputTokens:null,outputTokens:null},costUsd:null,output:null,error:'Timed out',finishedAt:new Date()});
  await expect(runs.queue({actionId:action,actorId:actor,agentKey:'fixture',input:{},promptVersion:'fixture',model:'fixture',now:new Date()})).rejects.toThrow();
  const observation={state:'reported' as const,usage:{inputTokens:17,outputTokens:9},providerRequestId:'fixture-provider-1',late:true};
  await runs.observeProviderAttempt({...attribution,observation,finishedAt:new Date()});
  await runs.observeProviderAttempt({...attribution,observation,finishedAt:new Date()});
  expect((await runtime.query('SELECT state,output,input_tokens,output_tokens,input FROM action_runs WHERE id=$1',[runId])).rows[0]).toMatchObject({
   state:'failed',output:null,input_tokens:17,output_tokens:9,input:{provider_usage:{status:'complete',knownInputTokens:17,knownOutputTokens:9}},
  });
  expect((await runtime.query('SELECT id FROM output_versions WHERE action_id=$1',[action])).rows).toHaveLength(0);
  expect((await runtime.query("SELECT id FROM audit_events WHERE entity_id=$1 AND event='run.usage_observed'",[runId])).rows).toHaveLength(1);
 });
 it('rejects foreign actor/workspace observations and unreserved attempts', async () => {
  const a=await setup(),b=await setup(),runs=artifactModule.actionRunRepository(work=>withTransaction(work,runtime));
  const runId=await runs.queue({actionId:a.action,actorId:actor,agentKey:'fixture',input:{},promptVersion:'fixture',model:'fixture',now:new Date()});
  await runs.start({runId,actorId:actor,locale:'en'});
  const attemptId=randomUUID();
  await expect(runs.beginProviderAttempt({runId,actorId:actor,workspaceId:b.workspace,attemptId,model:'fixture',startedAt:new Date()})).rejects.toThrow();
  await expect(runs.beginProviderAttempt({runId,actorId:randomUUID(),workspaceId:a.workspace,attemptId,model:'fixture',startedAt:new Date()})).rejects.toThrow();
  await expect(runs.observeProviderAttempt({runId,actorId:actor,workspaceId:a.workspace,attemptId,observation:{state:'reported',usage:{inputTokens:17,outputTokens:9}},finishedAt:new Date()})).rejects.toThrow();
  expect((await runtime.query('SELECT input FROM action_runs WHERE id=$1',[runId])).rows[0].input).toEqual({});
 });
 it('preserves a measured subtotal and refuses an unresolved retry instead of treating the other attempt as zero', async () => {
  const {workspace,action}=await setup(),runs=artifactModule.actionRunRepository(work=>withTransaction(work,runtime));
  const runId=await runs.queue({actionId:action,actorId:actor,agentKey:'fixture',input:{},promptVersion:'fixture',model:'fixture',now:new Date()});
  await runs.start({runId,actorId:actor,locale:'en'});
  for(const [index,usage] of [{inputTokens:17,outputTokens:9},{inputTokens:null,outputTokens:null}].entries()) {
   const attribution={runId,actorId:actor,workspaceId:workspace,attemptId:randomUUID()};
   await runs.beginProviderAttempt({...attribution,model:'fixture',startedAt:new Date()});
   await runs.observeProviderAttempt({...attribution,observation:{state:index===0?'reported':'unknown',usage},finishedAt:new Date()});
  }
  await runs.finish({runId,actorId:actor,locale:'en',usage:{inputTokens:null,outputTokens:null},costUsd:null,output:null,error:'Unknown provider outcome',finishedAt:new Date()});
  expect((await runtime.query('SELECT input_tokens,output_tokens,cost_usd,input FROM action_runs WHERE id=$1',[runId])).rows[0]).toMatchObject({
   input_tokens:null,output_tokens:null,cost_usd:null,input:{provider_usage:{status:'unknown',knownInputTokens:17,knownOutputTokens:9}},
  });
  expect(await artifactRepository(runtime).aiSpend24h(workspace)).toMatchObject({
   globalUsageUnknown:true,workspaceUsageUnknown:true,globalUsd:expect.any(Number),workspaceUsd:expect.any(Number),
  });
  await expect(runs.queue({actionId:action,actorId:actor,agentKey:'fixture',input:{},promptVersion:'fixture',model:'fixture',now:new Date()})).rejects.toThrow();
 });
 it('uses a restricted role and preserves two edits, selected approval, history, retry usage and audit', async () => {
  expect((await runtime.query('SELECT current_user AS name')).rows[0].name).toBe('artifact_login');
  const { workspace,action }=await setup(), repo=artifactRepository(runtime);
  const first=await repo.createOutputVersion(input(action));
  const second=await repo.createOutputVersion({ ...input(action,'First edit'),baseVersionId:first.version_id });
  const third=await repo.createOutputVersion({ ...input(action,'Second edit'),baseVersionId:second.version_id });
  expect([first.version_no,second.version_no,third.version_no]).toEqual([1,2,3]);
  await expect(repo.createOutputVersion({ ...input(action),baseVersionId:first.version_id })).rejects.toThrow('version_conflict');
  await expect(repo.approveOutputVersion(first.version_id,actor,null)).rejects.toThrow('version_closed');
  await expect(repo.exportOutputVersion(third.version_id,actor,'export','not-approved')).rejects.toThrow('not_approved');
  expect(await repo.approveOutputVersion(third.version_id,actor,'Approved selected edit')).toMatchObject({ kind:'approved',version_id:third.version_id });
  expect(await repo.approveOutputVersion(third.version_id,actor,null)).toMatchObject({ kind:'already-approved' });
  const delivery=await repo.exportOutputVersion(third.version_id,actor,'export','fixture-key');
  expect(delivery.counted).toBe(true);
  expect(await repo.exportOutputVersion(third.version_id,actor,'export','fixture-key')).toMatchObject({ kind:'existing',delivery_id:delivery.delivery_id,counted:false });
  expect((await repo.exportOutputVersion(third.version_id,actor,'copy','fixture-key')).counted).toBe(false);
  const history=(await runtime.query('SELECT body,author_user_id,version_no FROM output_versions WHERE action_id=$1 ORDER BY version_no',[action])).rows;
  expect(history).toEqual(['Original fixture','First edit','Second edit'].map((body,i)=>({body,author_user_id:actor,version_no:i+1})));
  expect(Buffer.from(history[2].body,'utf8').toString()).toBe('Second edit');
  expect((await runtime.query('SELECT approved_deliveries FROM workspace_usage WHERE workspace_id=$1',[workspace])).rows[0].approved_deliveries).toBe(1);
  expect((await runtime.query("SELECT count(*)::int AS n FROM audit_events WHERE workspace_id=$1 AND event='version.created'",[workspace])).rows[0].n).toBe(3);
  expect((await runtime.query("SELECT count(*)::int AS n FROM audit_events WHERE workspace_id=$1 AND event='version.approved'",[workspace])).rows[0].n).toBe(1);
  expect((await runtime.query("SELECT count(*)::int AS n FROM audit_events WHERE workspace_id=$1 AND event='delivery.exported'",[workspace])).rows[0].n).toBe(1);
 });
 it('deduplicates concurrent and response-lost manual saves without allowing a different stale first edit', async () => {
  const {workspace,action}=await setup(),repo=artifactRepository(runtime);
  const request=input(action,'First saved text');
  const results=await Promise.all([repo.createOutputVersion(request),repo.createOutputVersion(request)]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0]).toMatchObject({version_no:1});
  await expect(repo.createOutputVersion({...request,body:'Different stale first edit'})).rejects.toThrow('version_conflict');
  const edit={...request,body:'Second saved text',baseVersionId:results[0].version_id};
  const second=await repo.createOutputVersion(edit);
  expect(await repo.createOutputVersion(edit)).toEqual(second);
  expect(await repo.createOutputVersion(request)).toEqual(results[0]);
  expect((await runtime.query('SELECT body,approval_state FROM output_versions WHERE action_id=$1 ORDER BY version_no',[action])).rows).toEqual([
   {body:'First saved text',approval_state:'superseded'},{body:'Second saved text',approval_state:'draft'},
  ]);
  expect((await runtime.query("SELECT count(*)::int AS n FROM audit_events WHERE workspace_id=$1 AND event='version.created'",[workspace])).rows[0].n).toBe(2);
  expect((await runtime.query('SELECT * FROM workspace_usage WHERE workspace_id=$1',[workspace])).rows).toEqual([]);
 });
 it('serializes different first-tab saves against explicitly empty history', async () => {
  const {action}=await setup(),repo=artifactRepository(runtime);
  const outcomes=await Promise.allSettled([
   repo.createOutputVersion(input(action,'Tab one')),
   repo.createOutputVersion(input(action,'Tab two')),
  ]);
  expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  const refused=outcomes.find(result=>result.status==='rejected') as PromiseRejectedResult;
  expect(refused.reason).toMatchObject({message:'version_conflict'});
  expect((await runtime.query('SELECT id FROM output_versions WHERE action_id=$1',[action])).rows).toHaveLength(1);
 });
 async function savedAssistantRun(workspace:string,action:string,source:string|null) {
  return (await runtime.query<{id:string}>(`INSERT INTO action_runs
   (workspace_id,action_id,agent_key,state,input,output,prompt_version,requested_by,input_tokens,output_tokens,cost_usd,finished_at)
   VALUES($1,$2,'review_reply','succeeded',$3,$4,'fixture',$5,10,5,0.01,now()) RETURNING id`,
   [workspace,action,JSON.stringify({source:'assistant',intent:'friendlier_review_reply',context:{versionId:source}}),
    JSON.stringify({title:'Fixture',body:'Saved assistant revision',alt_text:null,acceptance_criteria:[],warnings:[],facts_used:[]}),actor])).rows[0].id;
 }
 it('redeems one assistant run once under concurrent and later response-lost retries, preserving human approval and usage',async()=>{
  const {workspace,action}=await setup(),repo=artifactRepository(runtime);
  const source=await repo.createOutputVersion(input(action));
  const runId=await savedAssistantRun(workspace,action,source.version_id);
  const request={workspaceId:workspace,actionId:action,actorId:actor,runId,baseVersionId:source.version_id};
  const [first,repeat]=await Promise.all([createAssistantVersion(repo,request),createAssistantVersion(repo,request)]);
  expect(first).toEqual(repeat);
  expect(first.versionNo).toBe(2);
  await repo.approveOutputVersion(first.versionId,actor,'Human approval');
  const next=await repo.createOutputVersion({...input(action,'Later manual edit'),baseVersionId:first.versionId});
  expect(await createAssistantVersion(repo,request)).toEqual(first);
  expect((await runtime.query('SELECT approval_state,approved_by,body FROM output_versions WHERE id=$1',[first.versionId])).rows[0]).toEqual({
   approval_state:'approved',approved_by:actor,body:'Saved assistant revision',
  });
  expect((await runtime.query('SELECT approval_state,approved_by FROM output_versions WHERE id=$1',[next.version_id])).rows[0]).toEqual({approval_state:'draft',approved_by:null});
  expect((await runtime.query('SELECT count(*)::int AS n FROM output_versions WHERE action_run_id=$1',[runId])).rows[0].n).toBe(1);
  expect((await runtime.query("SELECT count(*)::int AS n FROM audit_events WHERE workspace_id=$1 AND event='version.created'",[workspace])).rows[0].n).toBe(3);
  expect((await runtime.query('SELECT input_tokens,output_tokens,cost_usd::float8 AS cost FROM action_runs WHERE id=$1',[runId])).rows[0]).toEqual({input_tokens:10,output_tokens:5,cost:0.01});
  expect((await runtime.query('SELECT * FROM workspace_usage WHERE workspace_id=$1',[workspace])).rows).toEqual([]);
  expect((await runtime.query('SELECT * FROM deliveries WHERE workspace_id=$1',[workspace])).rows).toEqual([]);
 });
 it.each([false,true])('binds an assistant first draft to empty history even if another tab saved meanwhile=%s',async(changed)=>{
  const {workspace,action}=await setup(),repo=artifactRepository(runtime);
  const runId=await savedAssistantRun(workspace,action,null);
  const request={workspaceId:workspace,actionId:action,actorId:actor,runId,baseVersionId:null};
  if(changed) {
   await repo.createOutputVersion(input(action,'Another tab saved first'));
   await expect(createAssistantVersion(repo,request)).rejects.toThrow('version_conflict');
   expect((await runtime.query('SELECT id FROM output_versions WHERE action_run_id=$1',[runId])).rows).toEqual([]);
  } else {
   const [first,repeat]=await Promise.all([createAssistantVersion(repo,request),createAssistantVersion(repo,request)]);
   expect(first).toEqual(repeat);
   expect(first.versionNo).toBe(1);
  }
  expect((await runtime.query('SELECT id FROM output_versions WHERE action_id=$1',[action])).rows).toHaveLength(1);
 });
 it('refuses an unredeemed stale assistant revision and cannot rebase it by naming the current version',async()=>{
  const {workspace,action}=await setup(),repo=artifactRepository(runtime);
  const source=await repo.createOutputVersion(input(action));
  const runId=await savedAssistantRun(workspace,action,source.version_id);
  const current=await repo.createOutputVersion({...input(action,'Newer saved version'),baseVersionId:source.version_id});
  const request={workspaceId:workspace,actionId:action,actorId:actor,runId};
  await expect(createAssistantVersion(repo,{...request,baseVersionId:current.version_id})).rejects.toThrow('version_conflict');
  await expect(createAssistantVersion(repo,{...request,baseVersionId:source.version_id})).rejects.toThrow('version_conflict');
  await expect(createAssistantVersion(repo,request)).rejects.toThrow('version_conflict');
  // The SQL boundary also rejects bypassing the wrapper's source check.
  await expect(repo.createOutputVersion({...input(action,'Saved assistant revision'),authorType:'agent',actionRunId:runId,baseVersionId:current.version_id})).rejects.toThrow('version_conflict');
  expect((await runtime.query('SELECT id FROM output_versions WHERE action_run_id=$1',[runId])).rows).toEqual([]);
 });
 it('keeps ordinary non-assistant agent appends compatible with a null base',async()=>{
  const {workspace,action}=await setup(),repo=artifactRepository(runtime);
  await repo.createOutputVersion(input(action));
  const runId=(await runtime.query<{id:string}>("INSERT INTO action_runs(workspace_id,action_id,agent_key,state,input) VALUES($1,$2,'review_reply','running','{}') RETURNING id",[workspace,action])).rows[0].id;
  expect(await repo.createOutputVersion({...input(action,'Ordinary agent append'),authorType:'agent',actionRunId:runId})).toMatchObject({version_no:2});
 });
 it('serializes a new saved edit with exact-version approval without approving changed content or deadlocking',async()=>{
  const {workspace,action}=await setup(),repo=artifactRepository(runtime);
  const source=await repo.createOutputVersion(input(action));
  const outcomes=await Promise.allSettled([
   repo.approveOutputVersion(source.version_id,actor,'Approve exactly the text read'),
   repo.createOutputVersion({...input(action,'Changed content requires approval'),baseVersionId:source.version_id}),
  ]);
  expect(outcomes[1].status).toBe('fulfilled');
  if(outcomes[0].status==='rejected') expect(outcomes[0].reason).toMatchObject({message:'version_closed'});
  const rows=(await runtime.query('SELECT body,approval_state,approved_by FROM output_versions WHERE action_id=$1 ORDER BY version_no',[action])).rows;
  expect(rows[1]).toEqual({body:'Changed content requires approval',approval_state:'draft',approved_by:null});
  expect(['approved','superseded']).toContain(rows[0].approval_state);
  expect((await runtime.query('SELECT * FROM workspace_usage WHERE workspace_id=$1',[workspace])).rows).toEqual([]);
 });
 it('binds retry keys to selected version and mode across workspaces', async () => {
  const a=await setup(),b=await setup(),repo=artifactRepository(runtime);
  const one=await repo.createOutputVersion(input(a.action)),two=await repo.createOutputVersion(input(b.action));
  await repo.approveOutputVersion(one.version_id,actor,null); await repo.approveOutputVersion(two.version_id,actor,null);
  const first=await repo.exportOutputVersion(one.version_id,actor,'export','same-client-key');
  const second=await repo.exportOutputVersion(two.version_id,actor,'export','same-client-key');
  expect(second).toMatchObject({ version_id:two.version_id,counted:true });
  expect(second.delivery_id).not.toBe(first.delivery_id);
 });
 it('reads a revision source only for the matching action and workspace', async () => {
  const a=await setup(),b=await setup(),repo=artifactRepository(runtime);
  const source='Selected revision source '.repeat(600)+'Final qualification must survive revision.';
  const version=await repo.createOutputVersion(input(a.action,source));
  expect(await repo.assistantVersion(version.version_id,a.action,a.workspace)).toMatchObject({id:version.version_id,body:source});
  expect(await repo.assistantVersion(version.version_id,b.action,a.workspace)).toBeNull();
  expect(await repo.assistantVersion(version.version_id,a.action,b.workspace)).toBeNull();
  await runtime.query('UPDATE output_versions SET workspace_id=$1 WHERE id=$2',[b.workspace,version.version_id]);
  expect(await repo.assistantVersion(version.version_id,a.action,a.workspace)).toBeNull();
 });
 it('rejects foreign parent workspace, location and action-run references before artifact writes', async () => {
  const a=await setup(),b=await setup(),repo=artifactRepository(runtime);
  const foreignLocation=(await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'foreign','Foreign') RETURNING id",[b.workspace])).rows[0].id;
  const version=await repo.createOutputVersion(input(a.action));
  await runtime.query('UPDATE output_versions SET workspace_id=$1 WHERE id=$2',[b.workspace,version.version_id]);
  expect(await repo.versionScope(version.version_id)).toBeNull();
  await expect(repo.approveOutputVersion(version.version_id,actor,null)).rejects.toThrow('version_not_found');
  await expect(repo.exportOutputVersion(version.version_id,actor,'export','foreign')).rejects.toThrow('version_not_found');
  const run=(await runtime.query("INSERT INTO action_runs(workspace_id,action_id,agent_key,state) VALUES($1,$2,'fixture','queued') RETURNING id",[b.workspace,b.action])).rows[0].id;
  await expect(repo.createOutputVersion({ ...input(a.action),actionRunId:run })).rejects.toThrow('artifact_scope_mismatch');
  await runtime.query('UPDATE actions SET location_id=$1 WHERE id=$2',[foreignLocation,a.action]);
  expect(await repo.actionScope(a.action)).toBeNull();
  await expect(repo.createOutputVersion(input(a.action))).rejects.toThrow('artifact_scope_mismatch');
  expect((await runtime.query('SELECT id FROM output_versions WHERE action_id=$1',[a.action])).rows).toHaveLength(1);
 });
 it('rejects a foreign source snapshot and job before returning action authority', async () => {
  const a=await setup(),b=await setup(),repo=artifactRepository(runtime);
  const job=(await runtime.query("INSERT INTO audit_jobs(workspace_id,business_name,status) VALUES($1,'Foreign','done') RETURNING id",[b.workspace])).rows[0].id;
  const snapshot=(await runtime.query("INSERT INTO scan_snapshots(workspace_id,job_id,market,observed_at,coverage,module_states,metrics) VALUES($1,$2,'hk',now(),1,'{}','{}') RETURNING id",[b.workspace,job])).rows[0].id;
  await runtime.query('UPDATE actions SET source_snapshot_id=$1 WHERE id=$2',[snapshot,a.action]);
  expect(await repo.actionScope(a.action)).toBeNull();
  await expect(repo.createOutputVersion(input(a.action))).rejects.toThrow('artifact_scope_mismatch');
  expect((await runtime.query('SELECT id FROM output_versions WHERE action_id=$1',[a.action])).rows).toHaveLength(0);
 });
 it('rejects a base version whose workspace was changed independently of its action', async () => {
  const a=await setup(),b=await setup(),repo=artifactRepository(runtime);
  const base=await repo.createOutputVersion(input(a.action));
  await runtime.query('UPDATE output_versions SET workspace_id=$1 WHERE id=$2',[b.workspace,base.version_id]);
  await expect(repo.createOutputVersion({...input(a.action),baseVersionId:base.version_id})).rejects.toThrow('artifact_scope_mismatch');
  expect((await runtime.query('SELECT id FROM output_versions WHERE action_id=$1',[a.action])).rows).toHaveLength(1);
 });
 it('retains decision retries and uses the supplied transaction for artifact and audit rollback', async () => {
  const {action}=await setup(),client=await runtime.connect();
  try {
   await client.query('BEGIN'); const repo=artifactRepository(client);
   const draft=await repo.createOutputVersion(input(action));
   expect(await repo.decideOutputVersion(draft.version_id,actor,'changes_requested','Fix tone')).toMatchObject({kind:'decided'});
   expect(await repo.decideOutputVersion(draft.version_id,actor,'changes_requested','Fix tone')).toMatchObject({kind:'already-decided'});
   expect((await runtime.query('SELECT id FROM output_versions WHERE action_id=$1',[action])).rows).toHaveLength(0);
   await client.query('ROLLBACK');
   expect((await runtime.query('SELECT id FROM output_versions WHERE action_id=$1',[action])).rows).toHaveLength(0);
   expect((await runtime.query('SELECT id FROM audit_events WHERE entity_id=$1',[draft.version_id])).rows).toHaveLength(0);
  } finally { await client.query('ROLLBACK'); client.release(); }
 });
 async function evidence(workspace: string, location: string | null) {
  const job=(await runtime.query("INSERT INTO audit_jobs(workspace_id,location_id,business_name,status) VALUES($1,$2,'Fixture','done') RETURNING id",[workspace,location])).rows[0].id as string;
  const snapshot=(await runtime.query("INSERT INTO scan_snapshots(workspace_id,location_id,job_id,market,observed_at,coverage,module_states,metrics) VALUES($1,$2,$3,'hk',now(),1,'{}','{}') RETURNING id",[workspace,location,job])).rows[0].id as string;
  return {job,snapshot};
 }
 async function location(workspace: string) {
  return (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,$2,'Fixture') RETURNING id",[workspace,randomUUID()])).rows[0].id as string;
 }
 it.each([false,true])('permits workspace-wide actions and version operations with owned location evidence=%s',async (located) => {
  const a=await setup(),repo=artifactRepository(runtime),loc=located ? await location(a.workspace) : null;
  const source=await evidence(a.workspace,loc);
  await runtime.query('UPDATE actions SET source_snapshot_id=$1 WHERE id=$2',[source.snapshot,a.action]);
  // Scope returns the persisted action scope, never grants evidence-location permission.
  expect(await repo.actionScope(a.action)).toEqual({actionId:a.action,workspaceId:a.workspace,locationId:null});
  const version=await repo.createOutputVersion(input(a.action));
  expect(await repo.versionScope(version.version_id)).toEqual({actionId:a.action,workspaceId:a.workspace,locationId:null,versionId:version.version_id});
  expect(await repo.approveOutputVersion(version.version_id,actor,null)).toMatchObject({kind:'approved'});
  expect(await repo.exportOutputVersion(version.version_id,actor,'export','owned-source')).toMatchObject({counted:true,version_id:version.version_id});
 });
 it.each(['snapshot_workspace','job_workspace','foreign_location_owner','job_location','action_location'])('denies corrupt version-parent %s without state or accounting effects',async (corruption) => {
  const a=await setup(),b=await setup(),repo=artifactRepository(runtime);
  const loc=await location(a.workspace),otherLoc=await location(a.workspace),foreignLoc=await location(b.workspace);
  const source=await evidence(a.workspace,loc);
  const version=await repo.createOutputVersion(input(a.action));
  await repo.approveOutputVersion(version.version_id,actor,null);
  await runtime.query('UPDATE actions SET source_snapshot_id=$1 WHERE id=$2',[source.snapshot,a.action]);
  if(corruption==='snapshot_workspace') await runtime.query('UPDATE scan_snapshots SET workspace_id=$1 WHERE id=$2',[b.workspace,source.snapshot]);
  if(corruption==='job_workspace') await runtime.query('UPDATE audit_jobs SET workspace_id=$1 WHERE id=$2',[b.workspace,source.job]);
  if(corruption==='foreign_location_owner') {
   await runtime.query('UPDATE scan_snapshots SET location_id=$1 WHERE id=$2',[foreignLoc,source.snapshot]);
   await runtime.query('UPDATE audit_jobs SET location_id=$1 WHERE id=$2',[foreignLoc,source.job]);
  }
  if(corruption==='job_location') await runtime.query('UPDATE audit_jobs SET location_id=$1 WHERE id=$2',[otherLoc,source.job]);
  if(corruption==='action_location') await runtime.query('UPDATE actions SET location_id=$1 WHERE id=$2',[otherLoc,a.action]);
  const state=async () => ({
   version:(await runtime.query('SELECT approval_state,delivery_state,approved_by,approved_at FROM output_versions WHERE id=$1',[version.version_id])).rows,
   actions:(await runtime.query('SELECT action_state,measurement_state FROM actions WHERE id=$1',[a.action])).rows,
   usage:(await runtime.query('SELECT * FROM workspace_usage WHERE workspace_id=$1',[a.workspace])).rows,
   deliveries:(await runtime.query('SELECT * FROM deliveries WHERE version_id=$1',[version.version_id])).rows,
   audit:(await runtime.query('SELECT * FROM audit_events WHERE workspace_id=$1 ORDER BY id',[a.workspace])).rows,
  });
  const before=await state();
  expect(await repo.actionScope(a.action)).toBeNull();
  expect(await repo.versionScope(version.version_id)).toBeNull();
  await expect(repo.createOutputVersion(input(a.action))).rejects.toThrow('artifact_scope_mismatch');
  await expect(repo.approveOutputVersion(version.version_id,actor,null)).rejects.toThrow('version_not_found');
  await expect(repo.decideOutputVersion(version.version_id,actor,'rejected','denied')).rejects.toThrow('version_not_found');
  await expect(repo.exportOutputVersion(version.version_id,actor,'export','denied')).rejects.toThrow('version_not_found');
  expect(await state()).toEqual(before);
 });
 it('atomically completes a run with its version, action state and required audit on the supplied database',async () => {
  expect(artifactModule.actionRunRepository).toBeTypeOf('function');
  const {workspace,action}=await setup();
  const repo=artifactModule.actionRunRepository(run=>withTransaction(run,runtime));
  const runId=await repo.queue({actionId:action,actorId:actor,agentKey:'review_reply',input:{fixture:true},promptVersion:'fixture',model:null,now:new Date(),providedInputs:{voice:'warm'}});
  await repo.start({runId,actorId:actor,locale:'en'});
  const result=await repo.finish({runId,actorId:actor,locale:'en',usage:{inputTokens:150,outputTokens:75},costUsd:0.1,
   output:{title:'Fixture',body:'Safe draft',warnings:[],facts_used:[],facts_needed:[],acceptance_criteria:[]},finishedAt:new Date()});
  expect(result).toMatchObject({state:'succeeded',versionNo:1});
  expect((await runtime.query('SELECT state,input_tokens,output_tokens FROM action_runs WHERE id=$1',[runId])).rows[0]).toEqual({state:'succeeded',input_tokens:150,output_tokens:75});
  expect((await runtime.query('SELECT action_state,provided_inputs FROM actions WHERE id=$1',[action])).rows[0]).toEqual({action_state:'in_progress',provided_inputs:{voice:'warm'}});
  expect((await runtime.query('SELECT event FROM audit_events WHERE workspace_id=$1 ORDER BY created_at,id',[workspace])).rows.map(row=>row.event).sort()).toEqual(['run.started','run.succeeded','version.created']);
  expect((await runtime.query('SELECT * FROM workspace_usage WHERE workspace_id=$1',[workspace])).rows).toEqual([]);
 });
 it('rolls back the created version when required terminal audit fails, retaining the caller transaction',async () => {
  expect(artifactModule.actionRunRepository).toBeTypeOf('function');
  const {workspace,action}=await setup();
  const repo=artifactModule.actionRunRepository(run=>withTransaction(run,runtime));
  const runId=await repo.queue({actionId:action,actorId:actor,agentKey:'review_reply',input:{},promptVersion:'fixture',model:null,now:new Date()});
  await repo.start({runId,actorId:actor,locale:'en'});
  await owner.query(`CREATE OR REPLACE FUNCTION reject_fixture_terminal_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event='run.succeeded' THEN RAISE EXCEPTION 'fixture_audit_rejected'; END IF; RETURN NEW; END $$`);
  await owner.query('CREATE TRIGGER fixture_terminal_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_fixture_terminal_audit()');
  try {
   await expect(repo.finish({runId,actorId:actor,locale:'en',usage:{inputTokens:1,outputTokens:1},costUsd:0,
    output:{title:'Fixture',body:'Must roll back',warnings:[],facts_used:[],facts_needed:[],acceptance_criteria:[]},finishedAt:new Date()})).rejects.toThrow('artifact_run_operation_failed');
   expect((await runtime.query('SELECT * FROM output_versions WHERE action_id=$1',[action])).rows).toEqual([]);
   expect((await runtime.query('SELECT state FROM action_runs WHERE id=$1',[runId])).rows[0].state).toBe('running');
   expect((await runtime.query("SELECT * FROM audit_events WHERE workspace_id=$1 AND event='version.created'",[workspace])).rows).toEqual([]);
   const retained=await runtime.connect();
   try {
    await retained.query('BEGIN');
    await expect(artifactModule.actionRunRepository(run=>run(retained)).finish({runId,actorId:actor,locale:'en',usage:{inputTokens:1,outputTokens:1},costUsd:0,
     output:{title:'Fixture',body:'Still must roll back',warnings:[],facts_used:[],facts_needed:[],acceptance_criteria:[]},finishedAt:new Date()})).rejects.toThrow('artifact_run_operation_failed');
    // Catching a failed operation cannot accidentally commit its partial version.
    await retained.query('COMMIT');
    expect((await runtime.query('SELECT * FROM output_versions WHERE action_id=$1',[action])).rows).toEqual([]);
   } finally { await retained.query('ROLLBACK'); retained.release(); }
  } finally { await owner.query('DROP TRIGGER fixture_terminal_audit ON audit_events'); }
  const client=await runtime.connect();
  try {
   await client.query('BEGIN');
   const bound=artifactModule.actionRunRepository(run=>run(client));
   await bound.finish({runId,actorId:actor,locale:'en',usage:{inputTokens:1,outputTokens:1},costUsd:0,
    output:{title:'Fixture',body:'Uncommitted',warnings:[],facts_used:[],facts_needed:[],acceptance_criteria:[]},finishedAt:new Date()});
   expect((await runtime.query('SELECT * FROM output_versions WHERE action_id=$1',[action])).rows).toEqual([]);
   await client.query('ROLLBACK');
   expect((await runtime.query('SELECT state FROM action_runs WHERE id=$1',[runId])).rows[0].state).toBe('running');
  } finally { await client.query('ROLLBACK'); client.release(); }
 });
 it('retains facts-needed as a successful needs-input run without a usable version even with nonempty body',async () => {
  expect(artifactModule.actionRunRepository).toBeTypeOf('function');
  const {workspace,action}=await setup(),repo=artifactModule.actionRunRepository(run=>withTransaction(run,runtime));
  const runId=await repo.queue({actionId:action,actorId:actor,agentKey:'review_reply',input:{},promptVersion:'fixture',model:null,now:new Date()});
  await repo.start({runId,actorId:actor,locale:'en'});
  expect(await repo.finish({runId,actorId:actor,locale:'en',usage:{inputTokens:1,outputTokens:2},costUsd:0,
   output:{title:'Fixture',body:'Unsafe usable draft',warnings:[],facts_used:[],facts_needed:['opening_hours'],acceptance_criteria:[]},finishedAt:new Date()})).toEqual({runId,state:'succeeded',factsNeeded:['opening_hours']});
  expect((await runtime.query('SELECT * FROM output_versions WHERE action_id=$1',[action])).rows).toEqual([]);
  expect((await runtime.query('SELECT action_state FROM actions WHERE id=$1',[action])).rows[0].action_state).toBe('needs_input');
  expect((await runtime.query('SELECT * FROM workspace_usage WHERE workspace_id=$1',[workspace])).rows).toEqual([]);
 });

 it('checks run actor and transitions and propagates failed-state persistence errors',async () => {
  const {workspace,action}=await setup(),repo=artifactModule.actionRunRepository(run=>withTransaction(run,runtime));
  const runId=await repo.queue({actionId:action,actorId:actor,agentKey:'review_reply',input:{},promptVersion:'fixture',model:null,now:new Date()});
  await expect(repo.start({runId,actorId:randomUUID(),locale:'en'})).rejects.toThrow('artifact_run_operation_failed');
  expect((await runtime.query('SELECT state FROM action_runs WHERE id=$1',[runId])).rows[0].state).toBe('queued');
  await repo.start({runId,actorId:actor,locale:'en'});
  await expect(repo.start({runId,actorId:actor,locale:'en'})).rejects.toThrow('artifact_run_operation_failed');
  const failed={runId,actorId:actor,locale:'en',usage:{inputTokens:null,outputTokens:null},costUsd:null,output:null,error:'Please try again',reason:'invalid_output',finishedAt:new Date()};
  const client=await runtime.connect();
  try {
   // A query-only connection without an active transaction is not a substitute.
   await expect(artifactModule.actionRunRepository(run=>run(client)).finish(failed)).rejects.toThrow('artifact_run_operation_failed');
   expect((await runtime.query('SELECT state FROM action_runs WHERE id=$1',[runId])).rows[0].state).toBe('running');
  } finally { client.release(); }
  expect(await repo.finish(failed)).toEqual({runId,state:'failed',error:'Please try again'});
  await expect(repo.finish(failed)).rejects.toThrow('artifact_run_operation_failed');
  expect((await runtime.query("SELECT count(*)::int AS n FROM audit_events WHERE workspace_id=$1 AND event='run.failed'",[workspace])).rows[0].n).toBe(1);
  expect((await runtime.query('SELECT * FROM output_versions WHERE action_id=$1',[action])).rows).toEqual([]);
  expect((await runtime.query('SELECT action_state FROM actions WHERE id=$1',[action])).rows[0].action_state).toBe('recommended');
 });

 it('rolls back provided inputs when queue insertion fails',async () => {
  const {action}=await setup(),repo=artifactModule.actionRunRepository(run=>withTransaction(run,runtime));
  const before=(await runtime.query('SELECT provided_inputs FROM actions WHERE id=$1',[action])).rows[0];
  await expect(repo.queue({actionId:action,actorId:randomUUID(),agentKey:'review_reply',input:{},promptVersion:'fixture',model:null,now:new Date(),providedInputs:{must:'rollback'}})).rejects.toThrow('artifact_run_operation_failed');
  expect((await runtime.query('SELECT provided_inputs FROM actions WHERE id=$1',[action])).rows[0]).toEqual(before);
  expect((await runtime.query('SELECT * FROM action_runs WHERE action_id=$1',[action])).rows).toEqual([]);
 });

});
