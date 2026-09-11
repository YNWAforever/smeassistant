import { measurementRepository } from '../../lib/repositories/measurements';
import { recordMeasurements } from '../../lib/workspace/measurements';
import { Pool } from 'pg';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMigrations } from '../../scripts/neon/migrations';
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from './neon-database';
import { snapshotRepository } from '../../lib/repositories/snapshots';
import { buildSnapshot, loadSnapshotById } from '../../lib/workspace/snapshots';
vi.mock('../../lib/website/checks', () => ({ runWebsiteChecks: () => { throw new Error('fixture forbids website transport'); } }));
describe.runIf(process.env.NEON_INTEGRATION === '1')('Neon snapshot persistence', () => {
 let fixture: NeonDatabaseFixture; let owner: Pool; let runtime: Pool;
 beforeAll(async () => {
  fixture = await startNeonDatabaseFixture('test'); owner = new Pool({ connectionString: fixture.databaseUrl });
  await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
  await applyMigrations(owner);
  const url = new URL(fixture.databaseUrl); url.username = 'fixture_runtime'; url.password = 'fixture-only'; runtime = new Pool({ connectionString: url.href });
 });
 beforeEach(async () => { await runtime.query('DELETE FROM audit_jobs; DELETE FROM workspaces'); });
 afterAll(async () => { await Promise.all([owner?.end(), runtime?.end()]); fixture?.stop(); });
 async function workspace(slug: string) { return (await runtime.query("INSERT INTO workspaces(slug,market) VALUES($1,'tw') RETURNING id", [slug])).rows[0].id as string; }
 async function job(ws: string | null) { return (await runtime.query("INSERT INTO audit_jobs(business_name,workspace_id,region,status,raw_data) VALUES('Fixture',$1,'tw','done','{\"ig\":{\"followers\":42}}') RETURNING id", [ws])).rows[0].id as string; }
 it('builds TW metrics and repairs audit on replay without fetching a stored website', async () => {
  const ws = await workspace('one'), id = await job(ws), repo = snapshotRepository(runtime);
  await runtime.query("UPDATE audit_jobs SET website_url='https://example.test' WHERE id=$1", [id]);
  const fetchWebsite = vi.fn(async () => ({ evaluated: 0, passed: 0, results: [] }));
  const snapshot = await buildSnapshot(repo, id, { fetchWebsite });
  expect(snapshot).toMatchObject({ workspaceId: ws, market: 'tw', metrics: { 'ig.followers': 42 } });
  await runtime.query('DELETE FROM audit_events WHERE entity_id=$1', [snapshot.id]);
  expect((await buildSnapshot(repo, id, { fetchWebsite })).id).toBe(snapshot.id);
  expect(fetchWebsite).toHaveBeenCalledTimes(1);
  expect((await runtime.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1 AND event='snapshot.created'", [snapshot.id])).rows[0].n).toBe(1);
 });
 it('rejects replay of a persisted snapshot and job pointing to a foreign location before website or audit', async () => {
  const ws = await workspace('replay-scope'), foreign = await workspace('replay-foreign'), id = await job(ws);
  const repo = snapshotRepository(runtime), saved = await buildSnapshot(repo, id);
  const loc = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'foreign','Foreign') RETURNING id",[foreign])).rows[0].id;
  await runtime.query('UPDATE audit_jobs SET location_id=$1 WHERE id=$2',[loc,id]);
  await runtime.query('UPDATE scan_snapshots SET location_id=$1 WHERE id=$2',[loc,saved.id]);
  await runtime.query('DELETE FROM audit_events WHERE entity_id=$1',[saved.id]);
  const fetchWebsite = vi.fn(async () => ({ evaluated:0, passed:0, results:[] }));
  await expect(buildSnapshot(repo,id,{fetchWebsite})).rejects.toThrow('snapshot_scope_mismatch');
  expect(fetchWebsite).not.toHaveBeenCalled();
  expect((await runtime.query('SELECT id FROM audit_events WHERE entity_id=$1',[saved.id])).rows).toHaveLength(0);
 });
 it('replays an owned location snapshot and repairs its audit without fetching', async () => {
  const ws=await workspace('owned-replay'), id=await job(ws), repo=snapshotRepository(runtime);
  const loc=(await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'owned','Owned') RETURNING id",[ws])).rows[0].id;
  await runtime.query('UPDATE audit_jobs SET location_id=$1 WHERE id=$2',[loc,id]);
  const saved=await buildSnapshot(repo,id);
  await runtime.query('DELETE FROM audit_events WHERE entity_id=$1',[saved.id]);
  const fetchWebsite=vi.fn(async () => ({evaluated:0,passed:0,results:[]}));
  expect((await buildSnapshot(repo,id,{fetchWebsite})).id).toBe(saved.id);
  expect(fetchWebsite).not.toHaveBeenCalled();
  expect((await runtime.query('SELECT id FROM audit_events WHERE entity_id=$1',[saved.id])).rows).toHaveLength(1);
 });
 it('uses the supplied connection, including rollback of snapshot and audit', async () => {
  const ws = await workspace('connection'), id = await job(ws), client = await runtime.connect();
  try {
   await client.query('BEGIN');
   const snapshot = await buildSnapshot(snapshotRepository(client), id);
   expect((await client.query('SELECT id FROM scan_snapshots WHERE id=$1', [snapshot.id])).rows).toHaveLength(1);
   expect((await runtime.query('SELECT id FROM scan_snapshots WHERE id=$1', [snapshot.id])).rows).toHaveLength(0);
   await client.query('ROLLBACK');
   expect(await snapshotRepository(runtime).forJob(id)).toBeNull();
  } finally { client.release(); }
 });
 it('distinguishes absent rows, unattached jobs, and SQL failures', async () => {
  const repo = snapshotRepository(runtime);
  expect(await loadSnapshotById(repo, crypto.randomUUID())).toBeNull();
  await expect(buildSnapshot(repo, await job(null))).rejects.toThrow('snapshot_requires_workspace');
  await expect(buildSnapshot(repo, crypto.randomUUID())).rejects.toThrow('snapshot_job_not_found');
  const closed = new Pool({ connectionString: fixture.databaseUrl }); await closed.end();
  await expect(snapshotRepository(closed).forJob(crypto.randomUUID())).rejects.toThrow();
 });
 it('never replays a foreign comparable snapshot through independently valid foreign keys', async () => {
  const ws = await workspace('head'), other = await workspace('other'), repo = snapshotRepository(runtime);
  const baseJob = await job(ws), headJob = await job(ws), foreignJob = await job(other);
  const base = await buildSnapshot(repo, baseJob), foreign = await buildSnapshot(repo, foreignJob);
  await runtime.query('INSERT INTO scan_diffs(base_job_id,head_job_id,comparable) VALUES($1,$2,true)', [baseJob,headJob]);
  const head = await buildSnapshot(repo, headJob);
  await runtime.query('UPDATE scan_snapshots SET comparable_to=$1 WHERE id=$2', [foreign.id,head.id]);
  expect((await buildSnapshot(repo, headJob)).comparableTo).toBe(base.id);
 });
 it('ignores a foreign diff base and rejects forged snapshot workspace and comparable links', async () => {
  const ws = await workspace('scope'), other = await workspace('foreign-scope'), repo = snapshotRepository(runtime);
  const id = await job(ws), foreignJob = await job(other);
  const foreign = await buildSnapshot(repo, foreignJob);
  await runtime.query('INSERT INTO scan_diffs(base_job_id,head_job_id,comparable) VALUES($1,$2,true)', [foreignJob,id]);
  expect(await repo.diff(id)).toBeNull();
  const head = await buildSnapshot(repo,id), row = (await repo.forJob(id))!;
  await expect(repo.save({ ...row, workspace_id: other })).rejects.toThrow('snapshot_scope_mismatch');
  await expect(repo.save({ ...row, comparable_to: foreign.id })).rejects.toThrow('snapshot_scope_mismatch');
  expect(head.comparableTo).toBeNull();
 });

 it('records immutable measurements and repairs state only for the latest same-location snapshot', async () => {
  const ws = await workspace('measure'), repo = snapshotRepository(runtime);
  const baseJob = await job(ws), headJob = await job(ws);
  await runtime.query("UPDATE audit_jobs SET created_at='2026-08-01',completed_at='2026-08-01' WHERE id=$1", [baseJob]);
  await runtime.query("UPDATE audit_jobs SET created_at='2026-09-01',completed_at='2026-09-01',raw_data=jsonb_build_object('ig',jsonb_build_object('followers',64)) WHERE id=$1", [headJob]);
  await buildSnapshot(repo,baseJob);
  await runtime.query('INSERT INTO scan_diffs(base_job_id,head_job_id,comparable) VALUES($1,$2,true)', [baseJob,headJob]);
  const head = await buildSnapshot(repo,headJob), diff = await repo.diff(headJob);
  // Completed by the owner, so the action genuinely entered the loop --
  // measurement_state is only written for actions someone worked on, and this
  // case is about the repair and latest-snapshot rules rather than that gate.
  //
  // Completed rather than exported-before-head ON PURPOSE. The other arm of the
  // same gate also makes the fact type `Attributed`, and this case asserts an
  // `Observed` measurement: the metric moved and nobody claimed credit for it.
  // Satisfying the gate with an export row is exactly what broke this test.
  const action = (await runtime.query(`INSERT INTO actions(workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,action_state)
    VALUES($1,'ig-bio','{}','{}','{}','urgent',1,'[]',10,'Live',gen_random_uuid()::text,'completed') RETURNING id`,[ws])).rows[0].id;
  const measurements = measurementRepository(runtime);
  const transaction = await runtime.connect();
  try {
   await transaction.query('BEGIN');
   expect((await recordMeasurements(measurementRepository(transaction),{headSnapshot:head,diff})).recorded).toBe(1);
   expect((await runtime.query('SELECT id FROM action_measurements WHERE action_id=$1',[action])).rows).toHaveLength(0);
   await transaction.query('ROLLBACK');
  } finally { transaction.release(); }

  expect(await recordMeasurements(measurements,{headSnapshot:head,diff})).toEqual({comparable:true,recorded:1,skipped:0});
  expect((await runtime.query('SELECT fact_type,before_value::float,after_value::float FROM action_measurements WHERE action_id=$1',[action])).rows).toEqual([{fact_type:'Observed',before_value:42,after_value:64}]);
  const otherLocation=(await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'other','Other') RETURNING id",[ws])).rows[0].id;
  const otherLocationJob=await job(ws);
  await runtime.query("UPDATE audit_jobs SET location_id=$1,completed_at='2027-01-01' WHERE id=$2",[otherLocation,otherLocationJob]);
  await buildSnapshot(repo,otherLocationJob);
  await runtime.query("UPDATE actions SET measurement_state='not_eligible' WHERE id=$1",[action]);
  expect(await recordMeasurements(measurements,{headSnapshot:head,diff})).toEqual({comparable:true,recorded:0,skipped:1});
  expect((await runtime.query('SELECT measurement_state FROM actions WHERE id=$1',[action])).rows[0].measurement_state).toBe('measured');
  const newerJob = await job(ws); await runtime.query("UPDATE audit_jobs SET completed_at='2026-09-05' WHERE id=$1",[newerJob]); await buildSnapshot(repo,newerJob);
  await runtime.query("UPDATE actions SET measurement_state='insufficient_coverage' WHERE id=$1",[action]);
  await recordMeasurements(measurements,{headSnapshot:head,diff});
  expect((await runtime.query('SELECT measurement_state FROM actions WHERE id=$1',[action])).rows[0].measurement_state).toBe('insufficient_coverage');
  expect((await runtime.query('SELECT count(*)::int AS n FROM action_measurements WHERE action_id=$1',[action])).rows[0].n).toBe(1);
 });

 async function pair(slug: string) {
  const ws=await workspace(slug), repo=snapshotRepository(runtime), baseJob=await job(ws), headJob=await job(ws);
  const base=await buildSnapshot(repo,baseJob);
  await runtime.query('INSERT INTO scan_diffs(base_job_id,head_job_id,comparable) VALUES($1,$2,true)',[baseJob,headJob]);
  const head=await buildSnapshot(repo,headJob), diff=(await repo.diff(headJob))!;
  return {ws,repo,base,head,diff};
 }
 it('rejects a same-workspace comparable snapshot that is not the diff base', async () => {
  const {ws,repo,head}=await pair('wrong-base');
  const wrong=await buildSnapshot(repo,await job(ws));
  await expect(repo.save({... (await repo.forJob(head.jobId))!,comparable_to:wrong.id})).rejects.toThrow('snapshot_scope_mismatch');
 });
 it('denies forged and persisted cross-workspace measurement pairs and wrong diff heads', async () => {
  const {head,diff,base}=await pair('pair-scope'), measurements=measurementRepository(runtime);
  const foreign=await buildSnapshot(snapshotRepository(runtime),await job(await workspace('pair-foreign')));
  expect(await measurements.base({...head,comparableTo:foreign.id},diff)).toBeNull();
  expect(await measurements.base(head,{...diff,id:crypto.randomUUID()})).toBeNull();
  const location=(await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'scoped','Scoped') RETURNING id",[head.workspaceId])).rows[0].id;
  await runtime.query('UPDATE scan_snapshots SET location_id=$1 WHERE id=$2',[location,base.id]);
  expect(await measurements.base(head,diff)).toBeNull();
  await runtime.query('UPDATE scan_snapshots SET location_id=NULL WHERE id=$1',[base.id]);

  expect(await recordMeasurements(measurements,{headSnapshot:head,diff:{...diff,head_job_id:foreign.jobId}})).toEqual({comparable:false,recorded:0,skipped:0});
  await runtime.query('UPDATE scan_snapshots SET workspace_id=$1 WHERE id=$2',[foreign.workspaceId,base.id]);
  expect(await measurements.base(head,diff)).toBeNull();
  await runtime.query('UPDATE scan_snapshots SET workspace_id=$1 WHERE id=$2',[head.workspaceId,base.id]);
  await runtime.query('UPDATE audit_jobs SET workspace_id=$1 WHERE id=$2',[foreign.workspaceId,head.jobId]);
  expect(await measurements.base(head,diff)).toBeNull();
 });
 it('excludes mismatched child workspace exports and measurements even with valid independent foreign keys', async () => {
  const {ws,head,base}=await pair('child-scope'), other=await workspace('child-other'), repo=measurementRepository(runtime);
  const action=(await runtime.query(`INSERT INTO actions(workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key)
   VALUES($1,'ig-bio','{}','{}','{}','urgent',1,'[]',10,'Live',gen_random_uuid()::text) RETURNING id`,[ws])).rows[0].id;
  await runtime.query("INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type,first_exported_at) VALUES($1,$2,1,'fixture','agent','2026-01-01')",[other,action]);
  await runtime.query("INSERT INTO action_measurements(workspace_id,action_id,before_snapshot_id,after_snapshot_id,metric_key,fact_type) VALUES($1,$2,$3,$4,'ig.followers','Attributed')",[other,action,base.id,head.id]);
  expect(await repo.exports(head,[action])).toEqual([]);
  expect(await repo.existing(head,[action])).toEqual([]);
  const closed=new Pool({connectionString:fixture.databaseUrl});await closed.end();
  await expect(measurementRepository(closed).latest(head)).rejects.toThrow();
 });

});
