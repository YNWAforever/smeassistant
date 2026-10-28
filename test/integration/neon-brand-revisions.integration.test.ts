import {Pool} from 'pg';
import {beforeAll,afterAll,it,expect,describe} from 'vitest';
import {startNeonDatabaseFixture,type NeonDatabaseFixture} from './neon-database';
import {applyMigrations,loadMigrations} from '../../scripts/neon/migrations';
import {brandRepository} from '../../lib/repositories/brand';
describe.runIf(process.env.NEON_INTEGRATION==='1')('T21 immutable brand revision SQL',()=>{
 let fixture:NeonDatabaseFixture,owner:Pool,runtime:Pool;
 beforeAll(async()=>{
  fixture=await startNeonDatabaseFixture('test');owner=new Pool({connectionString:fixture.databaseUrl});
  await owner.query('CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
  const migrations=await loadMigrations();await applyMigrations(owner,migrations.slice(0,15));
  const oldWorkspace=(await owner.query('INSERT INTO workspaces DEFAULT VALUES RETURNING id')).rows[0].id;
  await owner.query("INSERT INTO brand_profiles(workspace_id,facts) VALUES($1,'{\"known\":\"current only\"}')",[oldWorkspace]);
  expect(await applyMigrations(owner)).toEqual(['0016_brand_revisions.sql','0017_brand_profile_revision_capture.sql','0018_content_version_retry_boundaries.sql','0019_conversation_resources.sql','0020_conversation_search.sql']);
  expect((await owner.query('SELECT source,actor_id,profile FROM brand_revisions WHERE workspace_id=$1',[oldWorkspace])).rows).toMatchObject([{source:'baseline',actor_id:null,profile:{facts:{known:'current only'}}}]);
  await owner.query("CREATE ROLE brand_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
  const url=new URL(fixture.databaseUrl);url.username='brand_runtime';url.password='fixture-only';runtime=new Pool({connectionString:url.href});
 });
 afterAll(async()=>{await Promise.allSettled([owner?.end(),runtime?.end()]);fixture?.stop();});
 async function setup(){
  const workspaceId=(await runtime.query('INSERT INTO workspaces DEFAULT VALUES RETURNING id')).rows[0].id;
  const actorId=(await runtime.query('INSERT INTO app_users(email) VALUES($1) RETURNING id',[`${crypto.randomUUID()}@example.test`])).rows[0].id;
  await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,'owner@example.test','owner',now())",[workspaceId,actorId]);
  return {workspaceId,actorId,profile:{voice:'warm',approved_claims:[],prohibited_terms:[],languages:['en'],facts:{confirmed:'A'}},expectedRevisionId:null};
 }
 it('stores A→B immutably and rejects stale concurrent CAS without partial writes',async()=>{
  const input=await setup(),repo=brandRepository(runtime);
  const a=await repo.saveBrandRevision(input);
  const outcomes=await Promise.allSettled([repo.saveBrandRevision({...input,expectedRevisionId:a.revisionId,profile:{...input.profile,facts:{confirmed:'B'}}}),repo.saveBrandRevision({...input,expectedRevisionId:a.revisionId,profile:{...input.profile,facts:{confirmed:'C'}}})]);
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((outcomes.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.message).toBe('brand_revision_conflict');
  const rows=await repo.history(input.workspaceId);expect(rows).toHaveLength(2);
  expect(rows.find(r=>r.id===a.revisionId)?.profile).toMatchObject({facts:{confirmed:'A'}});
  await expect(runtime.query("UPDATE brand_revisions SET profile='{}' WHERE id=$1",[a.revisionId])).rejects.toMatchObject({code:'42501'});
  await expect(owner.query("UPDATE brand_revisions SET profile='{}' WHERE id=$1",[a.revisionId])).rejects.toThrow('brand_revision_immutable');
  await expect(owner.query('DELETE FROM brand_revisions WHERE id=$1',[a.revisionId])).rejects.toThrow('brand_revision_immutable');
 });
 it('rejects foreign/non-owner writes and rolls back a failed profile atomically',async()=>{
  const input=await setup(),other=await setup(),repo=brandRepository(runtime);
  await expect(repo.saveBrandRevision({...input,actorId:other.actorId})).rejects.toThrow('brand_revision_forbidden');
  await expect(repo.saveBrandRevision({...input,profile:{...input.profile,voice:null as unknown as string}})).rejects.toThrow();
  expect(await repo.history(input.workspaceId)).toEqual([]);
  expect(await repo.get(input.workspaceId)).toBeNull();
  expect(await applyMigrations(owner)).toEqual([]);
 });
});
