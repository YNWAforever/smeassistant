import {Pool} from 'pg';
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {applyMigrations,loadMigrations} from '../../scripts/neon/migrations';
import {startNeonDatabaseFixture,type NeonDatabaseFixture} from './neon-database';
import {artifactRepository} from '../../lib/repositories/artifacts';
import {brandRepository} from '../../lib/repositories/brand';

let fixture:NeonDatabaseFixture,owner:Pool,runtime:Pool;
beforeAll(async()=>{
 fixture=await startNeonDatabaseFixture('test');owner=new Pool({connectionString:fixture.databaseUrl});
 await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
 const migrations=await loadMigrations();await applyMigrations(owner,migrations.slice(0,16));
 const interimWorkspace=(await owner.query('INSERT INTO workspaces DEFAULT VALUES RETURNING id')).rows[0].id;
 await owner.query("INSERT INTO brand_profiles(workspace_id,facts) VALUES($1,'{\"known\":\"between migrations\"}')",[interimWorkspace]);
 expect((await owner.query('SELECT current_revision_id FROM brand_profiles WHERE workspace_id=$1',[interimWorkspace])).rows[0].current_revision_id).toBeNull();
 expect(await applyMigrations(owner)).toEqual(['0017_brand_profile_revision_capture.sql','0018_content_version_retry_boundaries.sql']);
 expect((await owner.query('SELECT p.current_revision_id,r.profile,r.actor_id,r.source FROM brand_profiles p JOIN brand_revisions r ON r.id=p.current_revision_id WHERE p.workspace_id=$1',[interimWorkspace])).rows).toMatchObject([{current_revision_id:expect.any(String),profile:{facts:{known:'between migrations'}},actor_id:null,source:'baseline'}]);
 expect(await applyMigrations(owner)).toEqual([]);
 const url=new URL(fixture.databaseUrl);url.username='fixture_runtime';url.password='fixture-only';runtime=new Pool({connectionString:url.href});
});
// Reset only this owned database. Runtime never gains immutable-history deletion.
beforeEach(async()=>{await owner.query('TRUNCATE app_users,workspaces CASCADE')});
afterAll(async()=>{await Promise.allSettled([owner?.end(),runtime?.end()]);fixture?.stop()});
async function member(role='owner'){
 const actor=(await runtime.query("INSERT INTO app_users(email) VALUES('brand-capture@example.test') RETURNING id")).rows[0].id;
 const workspace=(await runtime.query('INSERT INTO workspaces DEFAULT VALUES RETURNING id')).rows[0].id;
 await runtime.query('INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,$3,$4,now())',[workspace,actor,'brand-capture@example.test',role]);
 return {workspace,actor};
}
it('T21: a newly initialized manager generation gets one immutable default snapshot',async()=>{
 const {workspace,actor}=await member('manager');const repo=artifactRepository(runtime);
 const first=await repo.assistantBrand(workspace,actor);
 expect(first?.current_revision_id).toEqual(expect.any(String));
 const again=await Promise.all(Array.from({length:5},()=>repo.assistantBrand(workspace,actor)));expect(again.every(row=>row?.current_revision_id===first!.current_revision_id)).toBe(true);
 expect((await runtime.query('SELECT profile,actor_id,source FROM brand_revisions WHERE workspace_id=$1',[workspace])).rows).toEqual([{profile:{voice:'warm',approved_claims:[],prohibited_terms:[],languages:['zh-HK'],facts:{}},actor_id:null,source:'baseline'}]);
 expect((await runtime.query('SELECT id FROM action_runs WHERE workspace_id=$1',[workspace])).rows).toEqual([]);
});
it('T21: legacy claim writes retain old content and advance the generation snapshot without inventing an actor',async()=>{
 const {workspace,actor}=await member();const repo=brandRepository(runtime),reader=artifactRepository(runtime);
 const base={workspace_id:workspace,voice:'warm',approved_claims:[],prohibited_terms:[],languages:['zh-TW'],facts:{currency:'TWD'},updated_at:'2026-10-12T00:00:00Z'};
 await repo.put(base);const first=(await repo.get(workspace))!;expect(first.current_revision_id).toEqual(expect.any(String));
 await repo.put({...base,voice:'professional'});const second=(await repo.get(workspace))!;expect(second.current_revision_id).not.toBe(first.current_revision_id);
 expect(await reader.assistantBrand(workspace,actor)).toMatchObject({voice:'professional',current_revision_id:second.current_revision_id,facts:{currency:'TWD'}});
 expect((await runtime.query('SELECT profile,actor_id,source FROM brand_revisions WHERE id=$1',[first.current_revision_id])).rows[0]).toMatchObject({profile:{voice:'warm'},actor_id:null,source:'baseline'});
 await repo.put({...base,voice:'professional'});expect((await repo.get(workspace))?.current_revision_id).toBe(second.current_revision_id);
 await repo.saveBrandRevision({workspaceId:workspace,actorId:actor,expectedRevisionId:second.current_revision_id!,profile:{...base,voice:'direct'}});
 expect((await runtime.query('SELECT count(*)::int AS n FROM brand_revisions WHERE workspace_id=$1',[workspace])).rows[0].n).toBe(3);
});
it('T21: a viewer or foreign actor cannot initialize a brand snapshot',async()=>{
 const {workspace,actor}=await member('viewer');const reader=artifactRepository(runtime);
 await expect(reader.assistantBrand(workspace,actor)).rejects.toThrow('artifact_operation_failed');
 const foreign=(await runtime.query("INSERT INTO app_users(email) VALUES('foreign@example.test') RETURNING id")).rows[0].id;
 await expect(reader.assistantBrand(workspace,foreign)).rejects.toThrow('artifact_operation_failed');
 expect((await runtime.query('SELECT workspace_id FROM brand_profiles WHERE workspace_id=$1',[workspace])).rows).toEqual([]);
 expect((await runtime.query('SELECT id FROM brand_revisions WHERE workspace_id=$1',[workspace])).rows).toEqual([]);
});
