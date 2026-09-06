import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {applyMigrations} from '../../scripts/neon/migrations';
import {workflowRepository} from '../../lib/repositories/workflow';
describe('workspace layer on owned PostgreSQL',()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 const workflows=workflowRepository(pool);
 const ws=randomUUID(),actor=randomUUID();let loc:string,job:string,action:string,v1:string,v2:string;
 const row=async(sql:string,values:unknown[]=[]) => (await pool.query(sql,values)).rows[0];
 const draft=(body:string,base:string|null,authorType='user')=>workflows.createOutputVersion({actionId:action,actor,authorType,actionRunId:null,body,alt:null,meta:{},baseVersionId:base});
 beforeAll(async()=>{
  await pool.query('INSERT INTO app_users(id,email) VALUES($1,$2)',[actor,`owner-${actor}@acceptance.test`]);
  await pool.query("INSERT INTO workspaces(id,business_name,market,tier,slug) VALUES($1,'錦汶館 Kam Man House!','hk','lite',$2)",[ws,`kam-man-house-${ws.slice(0,8)}`]);
  loc=(await row("INSERT INTO locations(workspace_id,slug,name,is_primary) VALUES($1,'primary','Primary',true) RETURNING id",[ws])).id;
  job=(await row("INSERT INTO audit_jobs(workspace_id,location_id,business_name,region,status) VALUES($1,$2,'錦汶館','hk','done') RETURNING id",[ws,loc])).id;
  const snap=(await row("INSERT INTO scan_snapshots(job_id,workspace_id,location_id,market,observed_at,scoring_version,overall_score,coverage,module_states,metrics) VALUES($1,$2,$3,'hk',now(),'2026-08-16',62,78,'{}','{}') RETURNING id",[job,ws,loc])).id;
  action=(await row("INSERT INTO actions(workspace_id,location_id,source_snapshot_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key) VALUES($1,$2,$3,'review_response','{}','{}','{}','urgent',91,'{}',10,'Demo',$4) RETURNING id",[ws,loc,snap,`it-${ws}`])).id;
 });
 afterAll(()=>pool.end());
 it('replays immutable migration journal without changing imported slug or workspace defaults',async()=>{
  expect(await applyMigrations(pool)).toEqual([]);
  expect(await row('SELECT slug,timezone,is_demo FROM workspaces WHERE id=$1',[ws])).toEqual({slug:`kam-man-house-${ws.slice(0,8)}`,timezone:'Asia/Hong_Kong',is_demo:false});
 });
 it('sets job location to null when deleting a location and preserves the job',async()=>{
  const extra=(await row("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'extra','Extra') RETURNING id",[ws])).id;
  await pool.query('UPDATE audit_jobs SET location_id=$1 WHERE id=$2',[extra,job]);await pool.query('DELETE FROM locations WHERE id=$1',[extra]);
  expect(await row('SELECT id,location_id FROM audit_jobs WHERE id=$1',[job])).toEqual({id:job,location_id:null});
 });
 it('numbers versions max+1, supersedes drafts and rejects stale bases with actor audit',async()=>{
  const first=await draft('多謝你的寶貴意見。',null,'agent');expect(first).toMatchObject({kind:'created',version_no:1});v1=first.version_id!;
  const second=await draft('多謝你再次到訪錦汶館。',v1);expect(second).toMatchObject({kind:'created',version_no:2});v2=second.version_id!;
  expect(await row('SELECT approval_state,author_user_id FROM output_versions WHERE id=$1',[v1])).toEqual({approval_state:'superseded',author_user_id:null});
  await expect(draft('stale',v1)).rejects.toThrow('version_conflict');
  const events=(await pool.query("SELECT event,actor_type,actor_id FROM audit_events WHERE workspace_id=$1 AND event='version.created'",[ws])).rows;
  expect(events).toHaveLength(2);expect(events[0]).toMatchObject({actor_type:'user',actor_id:actor});
 });
 it('approves exactly once with reviewer audit and rejects closed versions',async()=>{
  expect(await workflows.approveOutputVersion(v2,actor,'ship it')).toMatchObject({kind:'approved',version_no:2});
  expect(await workflows.approveOutputVersion(v2,actor,null)).toMatchObject({kind:'already-approved',version_no:2});
  expect(await row('SELECT approval_state,delivery_state,approved_by,reviewer_comment FROM output_versions WHERE id=$1',[v2])).toEqual({approval_state:'approved',delivery_state:'export_ready',approved_by:actor,reviewer_comment:'ship it'});
  expect(await row('SELECT action_state FROM actions WHERE id=$1',[action])).toEqual({action_state:'in_progress'});
  expect((await pool.query("SELECT id FROM audit_events WHERE workspace_id=$1 AND event='version.approved'",[ws])).rows).toHaveLength(1);
  await expect(workflows.approveOutputVersion(v1,actor,null)).rejects.toThrow('version_closed');
 });
 it('refuses unapproved export',async()=>{await expect(workflows.exportOutputVersion(v1,actor,'export',randomUUID())).rejects.toThrow('not_approved');});
 it('charges once, replays idempotency, allows copy, and rejects allowance overrun',async()=>{
  const key=randomUUID();const first=await workflows.exportOutputVersion(v2,actor,'export',key);expect(first).toMatchObject({kind:'exported',counted:true});
  expect(await workflows.exportOutputVersion(v2,actor,'export',key)).toMatchObject({kind:'existing',counted:false,delivery_id:first.delivery_id});
  expect(await workflows.exportOutputVersion(v2,actor,'copy',randomUUID())).toMatchObject({kind:'exported',counted:false});
  const usage=await row('SELECT period,approved_deliveries,allowance FROM workspace_usage WHERE workspace_id=$1',[ws]);expect(usage).toMatchObject({approved_deliveries:1,allowance:3});expect(usage.period).toMatch(/^\d{4}-\d{2}$/);
  expect(await row('SELECT delivery_state,first_exported_at FROM output_versions WHERE id=$1',[v2])).toMatchObject({delivery_state:'exported',first_exported_at:expect.any(Date)});
  expect((await pool.query('SELECT mode,counted FROM deliveries WHERE version_id=$1 ORDER BY created_at',[v2])).rows).toEqual([{mode:'export',counted:true},{mode:'copy',counted:false}]);
  await pool.query('UPDATE workspace_usage SET approved_deliveries=3 WHERE workspace_id=$1',[ws]);
  const third=await draft('third',v2);await workflows.approveOutputVersion(third.version_id!,actor,null);
  expect(await row('SELECT approval_state FROM output_versions WHERE id=$1',[v2])).toEqual({approval_state:'superseded'});
  await expect(workflows.exportOutputVersion(third.version_id!,actor,'export',randomUUID())).rejects.toThrow('allowance_exceeded');
  expect(await row('SELECT approved_deliveries FROM workspace_usage WHERE workspace_id=$1',[ws])).toEqual({approved_deliveries:3});
  expect((await pool.query("SELECT event FROM audit_events WHERE workspace_id=$1 AND event IN ('delivery.exported','delivery.copied') ORDER BY id",[ws])).rows.map(r=>r.event)).toEqual(['delivery.exported','delivery.copied']);
 });
 it('cascades workspace-owned layer but retains detached scan',async()=>{
  await pool.query('DELETE FROM workspaces WHERE id=$1',[ws]);
  for(const table of ['locations','scan_snapshots','actions','output_versions','deliveries','workspace_usage','audit_events'])expect((await pool.query(`SELECT workspace_id FROM ${table} WHERE workspace_id=$1`,[ws])).rows,table).toEqual([]);
  expect(await row('SELECT id,workspace_id FROM audit_jobs WHERE id=$1',[job])).toEqual({id:job,workspace_id:null});
 });
});
