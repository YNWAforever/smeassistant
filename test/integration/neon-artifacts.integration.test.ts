import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { applyMigrations } from '../../scripts/neon/migrations';
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from './neon-database';
import { artifactRepository } from '../../lib/repositories/artifacts';

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
 it('binds retry keys to selected version and mode across workspaces', async () => {
  const a=await setup(),b=await setup(),repo=artifactRepository(runtime);
  const one=await repo.createOutputVersion(input(a.action)),two=await repo.createOutputVersion(input(b.action));
  await repo.approveOutputVersion(one.version_id,actor,null); await repo.approveOutputVersion(two.version_id,actor,null);
  const first=await repo.exportOutputVersion(one.version_id,actor,'export','same-client-key');
  const second=await repo.exportOutputVersion(two.version_id,actor,'export','same-client-key');
  expect(second).toMatchObject({ version_id:two.version_id,counted:true });
  expect(second.delivery_id).not.toBe(first.delivery_id);
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
});
