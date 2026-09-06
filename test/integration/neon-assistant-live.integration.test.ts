import { Pool } from 'pg';
import { beforeAll,afterAll,beforeEach,describe,it,expect,vi } from 'vitest';
import { applyMigrations } from '../../scripts/neon/migrations';
import { startNeonDatabaseFixture,type NeonDatabaseFixture } from './neon-database';
import { artifactRepository } from '../../lib/repositories/artifacts';
import type { llmComplete } from '../../lib/llm';
import { runLiveAssistant } from '../../lib/assistant/live';
import { auth } from '../../app/api/actions/_shared/test-db';
vi.mock('../../lib/supabase/admin',()=>({supabaseServer:()=>{throw new Error('legacy_transport_forbidden');}}));
const output={title:'Fixture reply',body:'Thank you for telling us.',acceptance_criteria:[],warnings:[],facts_used:[],facts_needed:[]};
describe.runIf(process.env.NEON_INTEGRATION==='1')('Neon live assistant authority',()=>{
 let fixture:NeonDatabaseFixture,owner:Pool,runtime:Pool,workspace:string,foreign:string,locA:string,locB:string,snapshot:string,job:string,wide:string,scoped:string;
 beforeAll(async()=>{
  fixture=await startNeonDatabaseFixture('test');owner=new Pool({connectionString:fixture.databaseUrl});
  await owner.query('CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');await applyMigrations(owner);
  await owner.query("CREATE ROLE live_login LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");const url=new URL(fixture.databaseUrl);url.username='live_login';url.password='fixture-only';runtime=new Pool({connectionString:url.href});
 });
 afterAll(async()=>{await Promise.all([owner?.end(),runtime?.end()]);fixture?.stop();});
 beforeEach(async()=>{
  workspace=(await runtime.query("INSERT INTO workspaces(business_name,market) VALUES('Fixture','hk') RETURNING id")).rows[0].id;
  foreign=(await runtime.query('INSERT INTO workspaces DEFAULT VALUES RETURNING id')).rows[0].id;
  locA=(await runtime.query("INSERT INTO locations(workspace_id,slug,name,is_primary) VALUES($1,'a','Location A',true) RETURNING id",[workspace])).rows[0].id;
  locB=(await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'b','Location B') RETURNING id",[workspace])).rows[0].id;
  job=(await runtime.query("INSERT INTO audit_jobs(workspace_id,location_id,business_name,status,raw_data) VALUES($1,$2,'Fixture','done','{}') RETURNING id",[workspace,locB])).rows[0].id;
  snapshot=(await runtime.query("INSERT INTO scan_snapshots(workspace_id,location_id,job_id,market,observed_at,coverage,module_states,metrics) VALUES($1,$2,$3,'hk',now(),1,'{}','{}') RETURNING id",[workspace,locB,job])).rows[0].id;
  const action=async(location:string|null,key:string)=>(await runtime.query("INSERT INTO actions(workspace_id,location_id,source_snapshot_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key) VALUES($1,$2,$3,'review-response','{\"en\":\"Reply\",\"zh-HK\":\"Reply\",\"zh-TW\":\"Reply\"}','{}','{}','high',50,'[]',5,'Live',$4) RETURNING id",[workspace,location,snapshot,workspace+key])).rows[0].id as string;
  wide=await action(null,'wide');scoped=await action(locB,'scoped');
 });
 function request(role:'owner'|'manager'|'viewer'='owner',scope:string[]|null=null){
  const repository=artifactRepository(runtime),llm=vi.fn<typeof llmComplete>(async()=>({text:JSON.stringify(output),usage:{inputTokens:1,outputTokens:1}}));
  const persistence=vi.spyOn(repository,'createOutputVersion');
  return {repository,llm,persistence,intentId:'draft_review_reply' as const,surface:'action' as const,locale:'en' as const,membership:{...auth(role,scope).membership,workspaceId:workspace},context:{workspaceId:workspace,actionId:wide},llmReady:vi.fn(()=>true)};
 }
 async function noWrites(requested:Pick<ReturnType<typeof request>,'persistence'>){
  expect(requested.persistence).not.toHaveBeenCalled();
  for(const sql of ['SELECT id FROM action_runs WHERE workspace_id=$1','SELECT id FROM output_versions WHERE workspace_id=$1','SELECT id FROM audit_events WHERE workspace_id=$1'])expect((await runtime.query(sql,[workspace])).rows).toHaveLength(0);
 }
 it.each(['owner','manager'] as const)('allows %s workspace-wide drafting from owned in-scope source evidence',async(role)=>{
  const req=request(role,[locB]);const result=await runLiveAssistant(req);
  expect(result.output?.body).toBe(output.body);expect(req.llm).toHaveBeenCalledOnce();expect(req.llm.mock.calls[0][0]).toContain('Location B');await noWrites(req);
 });
 it.each(['viewer','manager'] as const)('preserves %s out-of-scope evidence reads',async(role)=>{
  const req={...request(role,[locA]),intentId:'explain_limits' as const};const result=await runLiveAssistant(req);
  expect(result.state).toBe('completed');expect(result.evidenceRefs.some(ref=>ref.scanId===job)).toBe(true);expect(req.llm).not.toHaveBeenCalled();await noWrites(req);
 });
 it.each(['viewer','omitted','spoofed','implicit'])('denies %s drafts before LLM or persistence',async(kind)=>{
  const req=request(kind==='viewer'?'viewer':'manager',[locA]);
  const context=kind==='implicit'?{workspaceId:workspace}:kind==='spoofed'?{workspaceId:workspace,actionId:scoped,locationId:locA}:{workspaceId:workspace,actionId:wide};
  await expect(runLiveAssistant({...req,context})).rejects.toMatchObject({code:'forbidden'});expect(req.llmReady).not.toHaveBeenCalled();expect(req.llm).not.toHaveBeenCalled();await noWrites(req);
 });
 it.each(['snapshot_workspace','job_workspace','job_location','foreign_location'])('rejects persisted %s corruption without model or artifacts',async(kind)=>{
  if(kind==='snapshot_workspace')await runtime.query('UPDATE scan_snapshots SET workspace_id=$1 WHERE id=$2',[foreign,snapshot]);
  if(kind==='job_workspace')await runtime.query('UPDATE audit_jobs SET workspace_id=$1 WHERE id=$2',[foreign,job]);
  if(kind==='job_location')await runtime.query('UPDATE audit_jobs SET location_id=$1 WHERE id=$2',[locA,job]);
  if(kind==='foreign_location')await runtime.query('UPDATE locations SET workspace_id=$1 WHERE id=$2',[foreign,locB]);
  const req=request();await expect(runLiveAssistant(req)).rejects.toMatchObject({code:'not_found'});expect(req.llm).not.toHaveBeenCalled();await noWrites(req);
 });
 it('withholds nonempty facts-needed output and performs no artifact persistence',async()=>{
  const req=request();req.llm.mockResolvedValue({text:JSON.stringify({...output,facts_needed:['capacity']}),usage:{inputTokens:1,outputTokens:1}});
  const result=await runLiveAssistant(req);expect(result.output).toBeUndefined();expect(result.requiresApproval).toBe(false);expect(req.llm).toHaveBeenCalledOnce();await noWrites(req);
 });

 it.each(['foreign_workspace','mismatched_action','foreign_run'])('denies supplied version with %s before model or persistence',async(kind)=>{
  const version=(await runtime.query("INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type) VALUES($1,$2,1,'Version fixture','user') RETURNING id",[kind==='foreign_workspace'?foreign:workspace,scoped])).rows[0].id;
  if(kind==='foreign_run'){
   const run=(await runtime.query("INSERT INTO action_runs(workspace_id,action_id,agent_key,state) VALUES($1,$2,'review_reply','succeeded') RETURNING id",[workspace,wide])).rows[0].id;
   await runtime.query('UPDATE output_versions SET action_run_id=$1 WHERE id=$2',[run,version]);
  }
  const req=request();
  await expect(runLiveAssistant({...req,context:{workspaceId:workspace,actionId:kind==='mismatched_action'?wide:scoped,versionId:version}})).rejects.toMatchObject({code:'not_found'});
  expect(req.llmReady).not.toHaveBeenCalled();expect(req.llm).not.toHaveBeenCalled();expect(req.persistence).not.toHaveBeenCalled();
  expect((await runtime.query('SELECT id FROM output_versions WHERE id=$1',[version])).rows).toHaveLength(1);
  expect((await runtime.query('SELECT id FROM audit_events WHERE workspace_id=$1',[workspace])).rows).toHaveLength(0);
 });
 it('resolves an omitted action from its supplied owned version',async()=>{
  await runtime.query(`UPDATE actions SET title='{"en":"Selected version action","zh-HK":"Selected version action","zh-TW":"Selected version action"}' WHERE id=$1`,[scoped]);
  const version=(await runtime.query("INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type) VALUES($1,$2,1,'Version fixture','user') RETURNING id",[workspace,scoped])).rows[0].id;
  const req=request('manager',[locB]);
  const result=await runLiveAssistant({...req,context:{workspaceId:workspace,versionId:version}});
  expect(result.requiresApproval).toBe(true);expect(req.llm.mock.calls[0][0]).toContain('Selected version action');expect(req.persistence).not.toHaveBeenCalled();
 });

 it('does not let an explicit owned snapshot conceal a corrupt persisted action source',async()=>{
  const cleanJob=(await runtime.query("INSERT INTO audit_jobs(workspace_id,location_id,business_name,status) VALUES($1,$2,'Clean','done') RETURNING id",[workspace,locB])).rows[0].id;
  const cleanSnapshot=(await runtime.query("INSERT INTO scan_snapshots(workspace_id,location_id,job_id,market,observed_at,coverage,module_states,metrics) VALUES($1,$2,$3,'hk',now(),1,'{}','{}') RETURNING id",[workspace,locB,cleanJob])).rows[0].id;
  await runtime.query('UPDATE scan_snapshots SET workspace_id=$1 WHERE id=$2',[foreign,snapshot]);
  const req=request();await expect(runLiveAssistant({...req,context:{workspaceId:workspace,actionId:wide,snapshotId:cleanSnapshot}})).rejects.toMatchObject({code:'not_found'});
  expect(req.llmReady).not.toHaveBeenCalled();expect(req.llm).not.toHaveBeenCalled();await noWrites(req);
 });

 it.each(['action','action_location','version','version_location'])('denies valid A snapshot override of B source via %s before model or writes',async(kind)=>{
  const selectedJob=(await runtime.query("INSERT INTO audit_jobs(workspace_id,location_id,business_name,status) VALUES($1,$2,'Selected A','done') RETURNING id",[workspace,locA])).rows[0].id;
  const selected=(await runtime.query("INSERT INTO scan_snapshots(workspace_id,location_id,job_id,market,observed_at,coverage,module_states,metrics) VALUES($1,$2,$3,'hk',now(),1,'{}','{}') RETURNING id",[workspace,locA,selectedJob])).rows[0].id;
  const version=kind.startsWith('version')?(await runtime.query("INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type) VALUES($1,$2,1,'Version fixture','user') RETURNING id",[workspace,wide])).rows[0].id:undefined;
  const context={workspaceId:workspace,snapshotId:selected,...(version?{versionId:version}:{actionId:wide}),...(kind.endsWith('location')?{locationId:locA}:{})};
  const before=(await runtime.query('SELECT * FROM actions WHERE id=$1',[wide])).rows;
  const req=request('manager',[locA]);
  await expect(runLiveAssistant({...req,context})).rejects.toMatchObject({code:'forbidden'});
  expect(req.llmReady).not.toHaveBeenCalled();expect(req.llm).not.toHaveBeenCalled();expect(req.persistence).not.toHaveBeenCalled();
  expect((await runtime.query('SELECT * FROM actions WHERE id=$1',[wide])).rows).toEqual(before);
  expect((await runtime.query('SELECT id FROM output_versions WHERE workspace_id=$1',[workspace])).rows).toHaveLength(version?1:0);
  for(const table of ['action_runs','audit_events'])expect((await runtime.query(`SELECT id FROM ${table} WHERE workspace_id=$1`,[workspace])).rows).toHaveLength(0);
  for(const allowed of [request('owner'),request('manager',[locA,locB])]){
   expect((await runLiveAssistant({...allowed,context})).output?.body).toBe(output.body);expect(allowed.llm).toHaveBeenCalledOnce();expect(allowed.persistence).not.toHaveBeenCalled();
  }
 });

 it('rejects a foreign comparable base instead of treating the filtered base as absent',async()=>{
  const baseJob=(await runtime.query("INSERT INTO audit_jobs(workspace_id,business_name,status) VALUES($1,'Foreign base','done') RETURNING id",[foreign])).rows[0].id;
  const base=(await runtime.query("INSERT INTO scan_snapshots(workspace_id,job_id,market,observed_at,coverage,module_states,metrics) VALUES($1,$2,'hk',now(),1,'{}','{}') RETURNING id",[foreign,baseJob])).rows[0].id;
  await runtime.query('UPDATE scan_snapshots SET comparable_to=$1 WHERE id=$2',[base,snapshot]);
  const req=request();await expect(runLiveAssistant(req)).rejects.toMatchObject({code:'not_found'});
  expect(req.llmReady).not.toHaveBeenCalled();expect(req.llm).not.toHaveBeenCalled();await noWrites(req);
 });

 async function comparisons(){
  const baseOne=(await runtime.query("INSERT INTO audit_jobs(workspace_id,location_id,business_name,status) VALUES($1,$2,'Base one','done') RETURNING id",[workspace,locB])).rows[0].id;
  const baseTwo=(await runtime.query("INSERT INTO audit_jobs(workspace_id,location_id,business_name,status) VALUES($1,$2,'Base two','done') RETURNING id",[workspace,locB])).rows[0].id;
  const baseSnapshot=(await runtime.query("INSERT INTO scan_snapshots(workspace_id,location_id,job_id,market,observed_at,coverage,module_states,metrics,overall_score) VALUES($1,$2,$3,'hk','2026-08-01',1,'{}','{}',66) RETURNING id",[workspace,locB,baseOne])).rows[0].id;
  const older=(await runtime.query("INSERT INTO scan_diffs(base_job_id,head_job_id,comparable,composite_base,composite_head,composite_delta,intersection_modules,created_at) VALUES($1,$2,true,66,62,-4,ARRAY['gbp'],'2026-08-02') RETURNING id",[baseOne,job])).rows[0].id;
  const newer=(await runtime.query("INSERT INTO scan_diffs(base_job_id,head_job_id,comparable,composite_base,composite_head,composite_delta,intersection_modules,created_at) VALUES($1,$2,true,50,62,12,ARRAY['gbp'],'2026-08-03') RETURNING id",[baseTwo,job])).rows[0].id;
  await runtime.query('UPDATE scan_snapshots SET comparable_to=$1,diff_id=$2,overall_score=62 WHERE id=$3',[baseSnapshot,older,snapshot]);
  return {baseOne,baseTwo,older,newer};
 }
 it('preserves the exact stored comparison when another valid diff for the same head is newer',async()=>{
  const {older,newer}=await comparisons(),req=request('viewer',[locA]);
  const result=await runLiveAssistant({...req,intentId:'explain_change'});
  expect(result.evidenceRefs.find(ref=>ref.evidenceId===`ev_${snapshot}_composite`)).toMatchObject({factType:'Observed',value:'66 → 62 (-4)'});
  expect(await req.repository.assistantDiff(older,workspace,job)).toMatchObject({id:older,composite_delta:'-4'});
  expect(await req.repository.assistantDiff(newer,workspace,job)).toMatchObject({id:newer,composite_delta:'12'});
  expect(req.llm).not.toHaveBeenCalled();await noWrites(req);
 });
 it.each(['viewer','manager','owner'] as const)('withholds inconsistent same-location base comparison for %s',async(role)=>{
  const {baseOne,baseTwo}=await comparisons();
  await runtime.query(`UPDATE scan_snapshots SET metrics='{"gbp.rating":4}' WHERE job_id=$1`,[baseOne]);
  const wrongBase=(await runtime.query(`INSERT INTO scan_snapshots(workspace_id,location_id,job_id,market,observed_at,coverage,module_states,metrics) VALUES($1,$2,$3,'hk',now(),1,'{}','{"gbp.rating":2}') RETURNING id`,[workspace,locB,baseTwo])).rows[0].id;
  await runtime.query(`UPDATE scan_snapshots SET comparable_to=$1,metrics='{"gbp.rating":3}' WHERE id=$2`,[wrongBase,snapshot]);
  const req=request(role,role==='owner'?null:[locA]);
  const result=await runLiveAssistant({...req,intentId:'explain_change'});
  expect(result.state).toBe('completed');
  expect(result.evidenceRefs.find(ref=>ref.evidenceId===`ev_${snapshot}_composite`)).toBeUndefined();
  expect(result.evidenceRefs.find(ref=>ref.evidenceId===`ev_${snapshot}_gbp.rating`)).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain('2.0 → 3.0');
  expect(req.llmReady).not.toHaveBeenCalled();expect(req.llm).not.toHaveBeenCalled();await noWrites(req);
 });
 it('preserves drafting with a pinned diff but legitimately missing base snapshot',async()=>{
  await comparisons();await runtime.query('UPDATE scan_snapshots SET comparable_to=NULL WHERE id=$1',[snapshot]);
  const req=request(),result=await runLiveAssistant(req);
  expect(result.output?.body).toBe(output.body);expect(req.llm).toHaveBeenCalledOnce();await noWrites(req);
 });
 it.each(['workspace','expected_head','foreign_base','foreign_head','different_location','foreign_location_owner'])('refuses exact diff with invalid %s scope',async(kind)=>{
  const {older,baseOne}=await comparisons(),repo=artifactRepository(runtime);
  if(kind==='foreign_base')await runtime.query('UPDATE audit_jobs SET workspace_id=$1 WHERE id=$2',[foreign,baseOne]);
  if(kind==='foreign_head')await runtime.query('UPDATE audit_jobs SET workspace_id=$1 WHERE id=$2',[foreign,job]);
  if(kind==='different_location')await runtime.query('UPDATE audit_jobs SET location_id=$1 WHERE id=$2',[locA,baseOne]);
  if(kind==='foreign_location_owner')await runtime.query('UPDATE locations SET workspace_id=$1 WHERE id=$2',[foreign,locB]);
  expect(await repo.assistantDiff(older,kind==='workspace'?foreign:workspace,kind==='expected_head'?baseOne:job)).toBeNull();
 });
});
