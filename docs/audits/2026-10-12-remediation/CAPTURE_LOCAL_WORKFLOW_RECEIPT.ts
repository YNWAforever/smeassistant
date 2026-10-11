// Opt-in local evidence only. Reuses the owned acceptance environment and guard.
import '../../../test/e2e/transport-guard.cjs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium,type BrowserContext,type Page} from '@playwright/test';
import {startEnvironment,sql} from '../../../test/e2e/environment';
import {seedMerchant} from '../../../test/e2e/seed';
import {signIn,waitForHydration} from '../../../test/e2e/fixtures';

const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
const environment=await startEnvironment();
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
const receipts:unknown[]=[];
interface WorkflowResponse {state?:string;draftRunId?:string;versionId?:string;versionNo?:number;counted?:boolean;deliveryId?:string;applicationId?:string}
try {
 browser=await chromium.launch({args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1;[::1]']});
 for(const market of ['hk','tw'] as const){
  const merchant=await seedMerchant(environment,market);
  const context:BrowserContext=await browser.newContext({baseURL:environment.app});
  await context.route('**/*',route=>['localhost','127.0.0.1','[::1]'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort('blockedbyclient'));
  const page:Page=await context.newPage();
  const goto=page.goto.bind(page);
  page.goto=(async(url:string,options?:Parameters<Page['goto']>[1])=>{const response=await goto(url,options);if(response?.headers()['content-type']?.includes('text/html'))await waitForHydration(page);return response}) as Page['goto'];
  await signIn(page,environment,merchant);
  const request=async(path:string,data:object,status:number):Promise<WorkflowResponse>=>{
   const response=await page.request.post(path,{data});assert.equal(response.status(),status,path);return response.json() as Promise<WorkflowResponse>;
  };
  const preview=await request('/api/assistant/run',{mode:'live',intentId:'draft_review_reply',surface:'action',locale:'en',context:{workspaceId:merchant.workspaceId,actionId:merchant.actionId}},200);
  assert.equal(preview.state,'needs_approval');assert.match(preview.draftRunId??'',/^[a-f0-9-]{36}$/);
  assert.equal(sql(environment.db,`SELECT count(*) FROM output_versions WHERE action_id='${merchant.actionId}'`),'0');
  const v1=await request(`/api/actions/${merchant.actionId}/versions`,{assistant_run_id:preview.draftRunId},201);assert.equal(v1.versionNo,1);
  const v2=await request(`/api/actions/${merchant.actionId}/versions`,{body:'Local synthetic edit requiring exact version approval.',base_version_id:v1.versionId},201);assert.equal(v2.versionNo,2);
  await request(`/api/versions/${v2.versionId}/approve`,{},200);
  const key=randomUUID();
  const first=await request(`/api/versions/${v2.versionId}/export`,{mode:'copy',idempotency_key:key},200);assert.equal(first.counted,true);
  const repeat=await request(`/api/versions/${v2.versionId}/export`,{mode:'copy',idempotency_key:key},200);assert.equal(repeat.counted,false);assert.equal(repeat.deliveryId,first.deliveryId);
  const applied=await request(`/api/actions/${merchant.actionId}/applied`,{output_version_id:v2.versionId,note:'Owned local fixture only; no external publication'},201);
  const v3=await request(`/api/actions/${merchant.actionId}/versions`,{body:'Another local edit must return to draft.',base_version_id:v2.versionId},201);assert.equal(v3.versionNo,3);
  await request(`/api/versions/${v3.versionId}/export`,{mode:'copy',idempotency_key:randomUUID()},409);
  assert.equal(sql(environment.db,`SELECT approved_deliveries FROM workspace_usage WHERE workspace_id='${merchant.workspaceId}'`),'1');
  const state=JSON.parse(sql(environment.db,`SELECT json_build_object(
   'run', (SELECT json_build_object('id',id,'state',state,'brand_revision_id',input->>'brand_revision_id','requested_by',requested_by,'cost_usd',cost_usd) FROM action_runs WHERE id='${preview.draftRunId}'),
   'versions',(SELECT json_agg(json_build_object('id',id,'version_no',version_no,'action_run_id',action_run_id,'approval_state',approval_state,'delivery_state',delivery_state) ORDER BY version_no) FROM output_versions WHERE action_id='${merchant.actionId}'),
   'events',(SELECT json_agg(json_build_object('id',id,'event',event,'entity_id',entity_id,'actor_id',actor_id) ORDER BY created_at,id) FROM audit_events WHERE workspace_id='${merchant.workspaceId}'),
   'usage',(SELECT approved_deliveries FROM workspace_usage WHERE workspace_id='${merchant.workspaceId}'))`));
  assert.match(state.run.brand_revision_id,/^[a-f0-9-]{36}$/);
  assert.equal(state.versions[0].action_run_id,preview.draftRunId);
  assert.equal(state.versions[1].id,v2.versionId);assert.equal(state.versions[1].approval_state,'approved');
  assert.equal(state.versions[2].approval_state,'draft');
  assert.ok(state.events.some((event:{event:string})=>event.event==='version.approved'));
  receipts.push({source_sha:sourceSha,market,environment:'owned loopback Auth/mail/LLM/PostgreSQL; model canned; no hosted calls',workspace_id:merchant.workspaceId,action_id:merchant.actionId,preview_versions_before_redemption:0,version_ids:[v1.versionId,v2.versionId,v3.versionId],delivery_id:first.deliveryId,application_id:applied.applicationId,first_export_counted:true,repeat_export_counted:false,new_edit_export_status:409,rescan_measurement:'separate integration/acceptance evidence; not exercised by this receipt',...state});
  await context.close();
 }
 writeFileSync(new URL('./evidence/B6-workflow-receipts.json',import.meta.url),JSON.stringify({observed_at:new Date().toISOString(),source_sha:sourceSha,receipts},null,2));
 console.log(JSON.stringify({result:'PASS',source_sha:sourceSha,samples:receipts.length,artifact:'evidence/B6-workflow-receipts.json'}));
} finally {await browser?.close();await environment.stop()}
