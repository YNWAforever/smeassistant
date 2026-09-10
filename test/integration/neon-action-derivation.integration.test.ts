import { Pool } from 'pg';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { applyMigrations } from '../../scripts/neon/migrations';
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from './neon-database';
import { deriveActionsForSnapshot, deriveActionsForClaim, actionDerivationRepository } from '../../lib/repositories/action-derivation';
import { completeWorkspaceClaim } from '../../lib/workspace/claim';
import { claimCompletionStore } from '../../lib/repositories/claims';
import { buildSnapshot } from '../../lib/workspace/snapshots';
import { snapshotRepository } from '../../lib/repositories/snapshots';
const ports=vi.hoisted(()=>({pool:undefined as Pool|undefined}));
vi.mock('../../lib/db/client',()=>({getPool:()=>{if(!ports.pool)throw new Error('default_database_forbidden');return ports.pool;}}));
import { fixPackRepository } from '../../lib/repositories/fix-pack';

describe.runIf(process.env.NEON_INTEGRATION==='1')('Neon final action runtime',()=>{
 let fixture:NeonDatabaseFixture, owner:Pool, db:Pool, actor:string;
 beforeAll(async()=>{
  fixture=await startNeonDatabaseFixture('test');owner=new Pool({connectionString:fixture.databaseUrl});
  await owner.query('CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
  await applyMigrations(owner);await owner.query("CREATE ROLE final_runtime_login LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
  const url=new URL(fixture.databaseUrl);url.username='final_runtime_login';url.password='fixture-only';db=new Pool({connectionString:url.href});
  actor=(await db.query("INSERT INTO app_users(email) VALUES('final-runtime@example.test') RETURNING id")).rows[0].id;
 });
 afterAll(async()=>{await Promise.all([db?.end(),owner?.end()]);fixture?.stop();});
 async function setup(workspace?:string,location?:string,observed='2026-09-01',rawData:unknown=null) {
  const ws=workspace??(await db.query('INSERT INTO workspaces DEFAULT VALUES RETURNING id')).rows[0].id;
  const loc=location??(await db.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'fixture','Fixture') RETURNING id",[ws])).rows[0].id;
  const job=(await db.query("INSERT INTO audit_jobs(workspace_id,location_id,business_name,status,website_url,raw_data) VALUES($1,$2,'Fixture','done',NULL,$3) RETURNING id",[ws,loc,rawData?JSON.stringify(rawData):null])).rows[0].id;
  const snapshot=(await db.query("INSERT INTO scan_snapshots(workspace_id,location_id,job_id,market,observed_at,coverage,module_states,metrics) VALUES($1,$2,$3,'hk',$4,1,'{}','{}') RETURNING id",[ws,loc,job,observed])).rows[0].id;
  await db.query("INSERT INTO audit_findings(job_id,finding_key,module,severity,score_impact) VALUES($1,'gbp.owner_response_low','gbp','warning',-10)",[job]);
  return {ws,loc,job,snapshot};
 }
 it('derives atomically, keeps stable IDs/state/inputs and deduplicates audit on retry',async()=>{
  const f=await setup();
  await db.query("INSERT INTO oauth_connections(workspace_id,provider,access_token_encrypted,status,connected_at) VALUES($1,'google_gbp','fixture','active',now())",[f.ws]);
  const first=await deriveActionsForSnapshot(db,f.snapshot);expect(first.created).toBe(1);
  const before=(await db.query('SELECT * FROM actions WHERE workspace_id=$1',[f.ws])).rows;
  expect(before[0]).toMatchObject({action_state:'needs_input',dedupe_key:`${f.ws}:${f.loc}:review-response`});
  await db.query("UPDATE actions SET provided_inputs='{\"tone\":\"warm\"}',action_state='in_progress' WHERE workspace_id=$1",[f.ws]);
  expect(await deriveActionsForSnapshot(db,f.snapshot)).toMatchObject({created:0,updated:1});
  const after=(await db.query('SELECT * FROM actions WHERE workspace_id=$1',[f.ws])).rows;
  expect(after[0]).toMatchObject({id:before[0].id,action_state:'in_progress',provided_inputs:{tone:'warm'}});
  expect((await db.query("SELECT id FROM audit_events WHERE workspace_id=$1 AND event='action.derived'",[f.ws])).rows).toHaveLength(1);
 });
 it('does not ask the owner to retype reviews the scan collected, and asks again when it loses them',async()=>{
  const unanswered={gbp:{reviews:[{rating:2,text:'Slow service',time:'2026-08-30T00:00:00Z'},{rating:1,text:'Cold food',time:'2026-08-29T00:00:00Z'}]}};
  const f=await setup(undefined,undefined,'2026-09-01',unanswered);
  await db.query('INSERT INTO brand_profiles(workspace_id) VALUES($1)',[f.ws]);
  // Without an active connection the derivation also emits google-reconnect,
  // so seed one and assert on the review-response row by template key.
  await db.query("INSERT INTO oauth_connections(workspace_id,provider,access_token_encrypted,status,connected_at) VALUES($1,'google_gbp','fixture','active',now())",[f.ws]);
  expect((await deriveActionsForSnapshot(db,f.snapshot)).created).toBe(1);
  const review=()=>db.query("SELECT required_inputs,action_state FROM actions WHERE workspace_id=$1 AND template_key='review-response'",[f.ws]).then(r=>r.rows[0]);
  const derived=await review();
  expect(derived.required_inputs).not.toContain('reviews_without_response');

  // The scan stops retaining an unanswered review: the input comes back, and an
  // untouched action must go back to needs_input or the detail page would show
  // no form at all and Generate would burn a model call.
  await db.query("UPDATE actions SET action_state='recommended' WHERE workspace_id=$1",[f.ws]);
  await db.query("UPDATE audit_jobs SET raw_data=$2 WHERE id=$1",[f.job,JSON.stringify({gbp:{reviews:[{rating:5,text:'Great',time:'2026-08-30T00:00:00Z',owner_response:'Thank you'}]}})]);
  expect(await deriveActionsForSnapshot(db,f.snapshot)).toMatchObject({created:0,updated:1});
  const again=await review();
  expect(again.required_inputs).toContain('reviews_without_response');
  expect(again.action_state).toBe('needs_input');

  // Owner progress is never clobbered by that rule.
  await db.query("UPDATE actions SET action_state='in_progress' WHERE workspace_id=$1",[f.ws]);
  await deriveActionsForSnapshot(db,f.snapshot);
  expect((await review()).action_state).toBe('in_progress');
 });
 it('skips stale exact-location snapshots and rejects corrupted source parent scope',async()=>{
  const f=await setup();const newer=await setup(f.ws,f.loc,'2026-09-02');
  expect(await deriveActionsForSnapshot(db,f.snapshot)).toEqual({created:0,updated:0,completed:0,expired:0});
  expect((await db.query('SELECT id FROM actions WHERE workspace_id=$1',[f.ws])).rows).toHaveLength(0);
  const foreign=await setup();await db.query('UPDATE audit_jobs SET location_id=$1 WHERE id=$2',[foreign.loc,newer.job]);
  await expect(deriveActionsForSnapshot(db,newer.snapshot)).rejects.toThrow('scope');
  expect((await db.query('SELECT id FROM actions WHERE workspace_id=$1',[f.ws])).rows).toHaveLength(0);
 });
 it('rolls back all action writes when audit persistence fails',async()=>{
  const f=await setup();
  await owner.query("CREATE FUNCTION fixture_fail_derived() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event='action.derived' THEN RAISE EXCEPTION 'fixture derived failure'; END IF; RETURN NEW; END $$");
  await owner.query('CREATE TRIGGER fixture_fail_derived BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fixture_fail_derived()');
  try {await expect(deriveActionsForSnapshot(db,f.snapshot)).rejects.toThrow('fixture derived failure');
   expect((await db.query('SELECT id FROM actions WHERE workspace_id=$1',[f.ws])).rows).toHaveLength(0);
  } finally {await owner.query('DROP TRIGGER fixture_fail_derived ON audit_events');await owner.query('DROP FUNCTION fixture_fail_derived()');}
 });
 it('retained facade: retry after failed audit repairs once without partial actions',async()=>{
  const f=await setup();
  await owner.query("CREATE FUNCTION fixture_audit_retry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event='action.derived' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$");
  await owner.query('CREATE TRIGGER fixture_audit_retry BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fixture_audit_retry()');
  try {await expect(deriveActionsForSnapshot(db,f.snapshot)).rejects.toThrow('fixture audit failure');expect((await db.query('SELECT id FROM actions WHERE workspace_id=$1',[f.ws])).rows).toEqual([]);}
  finally {await owner.query('DROP TRIGGER fixture_audit_retry ON audit_events');await owner.query('DROP FUNCTION fixture_audit_retry()');}
  const first=await deriveActionsForSnapshot(db,f.snapshot);expect(first.created).toBeGreaterThan(0);
  await deriveActionsForSnapshot(db,f.snapshot);
  expect((await db.query('SELECT id FROM actions WHERE workspace_id=$1',[f.ws])).rows).toHaveLength(first.created);
  expect((await db.query("SELECT id FROM audit_events WHERE workspace_id=$1 AND event='action.derived'",[f.ws])).rows).toHaveLength(1);
 });
 it('retained facade: stale retry preserves newer evidence and action contents',async()=>{
  const old=await setup();await deriveActionsForSnapshot(db,old.snapshot);
  const newer=await setup(old.ws,old.loc,'2026-09-03');await deriveActionsForSnapshot(db,newer.snapshot);
  await db.query("UPDATE actions SET evidence='{\"value\":\"new evidence\"}' WHERE workspace_id=$1",[old.ws]);
  const before=(await db.query('SELECT * FROM actions WHERE workspace_id=$1 ORDER BY id',[old.ws])).rows;
  await db.query('DELETE FROM audit_findings WHERE job_id=$1',[old.job]);
  expect(await deriveActionsForSnapshot(db,old.snapshot)).toEqual({created:0,updated:0,completed:0,expired:0});
  expect((await db.query('SELECT * FROM actions WHERE workspace_id=$1 ORDER BY id',[old.ws])).rows).toEqual(before);
 });
 it('Fix Pack joins owned jobs, hides invalid locations, and allows only one conditional reviewer',async()=>{
  const f=await setup(),foreign=await setup(),repo=fixPackRepository(db);
  const run=(await db.query("INSERT INTO agent_runs(job_id,finding_key,agent_key,output) VALUES($1,'fixture','review_reply_agent','{}') RETURNING id",[f.job])).rows[0].id;
  expect(await repo.scope(run)).toEqual({workspaceId:f.ws,locationId:f.loc});
  expect(await repo.review(run,foreign.ws,f.loc,'approved',actor)).toBe(false);
  expect(await repo.review(run,f.ws,foreign.loc,'approved',actor)).toBe(false);
  const race=await Promise.all([repo.review(run,f.ws,f.loc,'approved',actor),repo.review(run,f.ws,f.loc,'rejected',actor)]);
  expect(race.filter(Boolean)).toHaveLength(1);
  expect((await db.query('SELECT reviewed_by FROM agent_runs WHERE id=$1',[run])).rows[0].reviewed_by).toBe(actor);
  await db.query("UPDATE agent_runs SET status='draft' WHERE id=$1",[run]);
  await db.query('UPDATE audit_jobs SET location_id=$1 WHERE id=$2',[foreign.loc,f.job]);
  expect(await repo.scope(run)).toBeNull();expect(await repo.list(f.ws)).toEqual([]);
  expect(await repo.review(run,f.ws,foreign.loc,'approved',actor)).toBe(false);
  expect((await db.query('SELECT status FROM agent_runs WHERE id=$1',[run])).rows[0].status).toBe('draft');
 });
 it('rejects an existing action with a foreign source snapshot before replacing its content',async()=>{
  const f=await setup(),foreign=await setup();await deriveActionsForSnapshot(db,f.snapshot);
  await db.query('UPDATE actions SET source_snapshot_id=$1 WHERE workspace_id=$2',[foreign.snapshot,f.ws]);
  const before=(await db.query('SELECT title,source_snapshot_id FROM actions WHERE workspace_id=$1 ORDER BY id',[f.ws])).rows;
  await expect(deriveActionsForSnapshot(db,f.snapshot)).rejects.toThrow('scope');
  expect((await db.query('SELECT title,source_snapshot_id FROM actions WHERE workspace_id=$1 ORDER BY id',[f.ws])).rows).toEqual(before);
 });
 it('uses the supplied transaction executor and rolls back without a default database',async()=>{
  const f=await setup(),client=await db.connect();
  try {await client.query('BEGIN');await actionDerivationRepository(client).derive(f.snapshot);
   expect((await db.query('SELECT id FROM actions WHERE workspace_id=$1',[f.ws])).rows).toHaveLength(0);
   await client.query('ROLLBACK');
   expect((await db.query('SELECT id FROM audit_events WHERE workspace_id=$1',[f.ws])).rows).toHaveLength(0);
  }finally{client.release();}
 });
 it('marks only comparable resolved findings measured and expires missing evidence at exact location',async()=>{
  const f=await setup();await deriveActionsForSnapshot(db,f.snapshot);
  await db.query("INSERT INTO actions(workspace_id,location_id,source_snapshot_id,template_key,source,source_finding_keys,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,action_state) VALUES($1,$2,$3,'visibility-content','finding',ARRAY['website.checks.faq_schema'],'{}','{}','{}','low',1,'{}',5,'Live',$4,'needs_input')",[f.ws,f.loc,f.snapshot,`${f.ws}:${f.loc}:visibility-content`]);
  const next=await setup(f.ws,f.loc,'2026-09-02');await db.query('DELETE FROM audit_findings WHERE job_id=$1',[next.job]);
  const linked=(await db.query("INSERT INTO scan_diffs(base_job_id,head_job_id,comparable,resolved_findings) VALUES($1,$2,true,ARRAY['gbp.owner_response_low']) RETURNING id",[f.job,next.job])).rows[0].id;
  await db.query('UPDATE scan_snapshots SET diff_id=$1,comparable_to=$2 WHERE id=$3',[linked,f.snapshot,next.snapshot]);
  expect(await deriveActionsForSnapshot(db,next.snapshot)).toMatchObject({completed:1,expired:0});
  expect((await db.query("SELECT measurement_state FROM actions WHERE workspace_id=$1 AND template_key='review-response'",[f.ws])).rows[0].measurement_state).toBe('measured');
  expect((await db.query("SELECT action_state FROM actions WHERE workspace_id=$1 AND template_key='visibility-content'",[f.ws])).rows[0].action_state).toBe('needs_input');
  const other=await setup();await deriveActionsForSnapshot(db,other.snapshot);
  const gap=await setup(other.ws,other.loc,'2026-09-02');await db.query('DELETE FROM audit_findings WHERE job_id=$1',[gap.job]);
  expect(await deriveActionsForSnapshot(db,gap.snapshot)).toMatchObject({completed:0,expired:1});
  expect((await db.query("SELECT measurement_state FROM actions WHERE workspace_id=$1 AND template_key='review-response'",[other.ws])).rows[0].measurement_state).toBe('not_eligible');
 });
 it('claim hook resolves job IDs, rejects stale/foreign scope, and converges full claim retries',async()=>{
  const f=await setup(),foreign=await setup();
  await expect(deriveActionsForClaim(f.job,foreign.ws,f.loc,db)).rejects.toThrow('scope');
  await expect(deriveActionsForClaim(f.job,f.ws,foreign.loc,db)).rejects.toThrow('scope');
  expect((await db.query('SELECT id FROM actions WHERE workspace_id=$1',[f.ws])).rows).toHaveLength(0);
  await setup(f.ws,f.loc,'2026-09-02');
  await expect(deriveActionsForClaim(f.job,f.ws,f.loc,db)).rejects.toThrow('stale_snapshot');
  const claim=await setup();await db.query('DELETE FROM scan_snapshots WHERE id=$1',[claim.snapshot]);
  await db.query("UPDATE locations SET is_primary=true WHERE id=$1",[claim.loc]);
  const slug='claim-'+claim.job;
  await db.query('UPDATE audit_jobs SET share_slug=$1 WHERE id=$2',[slug,claim.job]);
  await db.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,'final-runtime@example.test','owner',now())",[claim.ws,actor]);
  ports.pool=db;
  try {
   const input={claimSlug:slug,userId:actor,workspaceName:'Fixture',primaryLocation:{name:'Fixture',address:null},market:'hk' as const,timezone:'Asia/Hong_Kong',locale:'en'};
   const hooks={buildSnapshot:async(jobId:string)=>{await buildSnapshot(snapshotRepository(db),jobId);},deriveActions:(job:string,ws:string,loc:string)=>deriveActionsForClaim(job,ws,loc,db)};
   const first=await completeWorkspaceClaim(claimCompletionStore,input,hooks);expect(first.kind).toBe('completed');
   const ids=(await db.query('SELECT id FROM actions WHERE workspace_id=$1 ORDER BY id',[claim.ws])).rows;
   expect(await completeWorkspaceClaim(claimCompletionStore,input,hooks)).toEqual(first);
   expect((await db.query('SELECT id FROM actions WHERE workspace_id=$1 ORDER BY id',[claim.ws])).rows).toEqual(ids);
   expect(ids.length).toBeGreaterThan(0);
   expect((await db.query("SELECT id FROM audit_events WHERE workspace_id=$1 AND event='action.derived'",[claim.ws])).rows).toHaveLength(1);
   await db.query('UPDATE workspace_members SET accepted_at=NULL WHERE workspace_id=$1',[claim.ws]);
   expect((await completeWorkspaceClaim(claimCompletionStore,input,hooks)).kind).toBe('forbidden');
  }finally{ports.pool=undefined;}
 });

 it('Fix Pack lists newest50 pending/approved rows only from owned jobs',async()=>{
  const f=await setup(),foreign=await setup(),repo=fixPackRepository(db);
  await db.query("INSERT INTO agent_runs(job_id,finding_key,agent_key,status,output,created_at) SELECT $1,'fixture','review_reply_agent',CASE WHEN n%2=0 THEN 'approved' ELSE 'draft' END,'{}','2026-09-01'::timestamptz+n*interval '1 second' FROM generate_series(1,55) n",[f.job]);
  await db.query("INSERT INTO agent_runs(job_id,finding_key,agent_key,status,output) VALUES($1,'fixture','review_reply_agent','rejected','{}'),($2,'fixture','review_reply_agent','draft','{}')",[f.job,foreign.job]);
  const rows=await repo.list(f.ws);expect(rows).toHaveLength(50);
  expect(rows.every(row=>row.job_id===f.job&&['approved','draft'].includes(row.status))).toBe(true);
  expect(rows.map(row=>Date.parse(row.created_at))).toEqual([...rows.map(row=>Date.parse(row.created_at))].sort((a,b)=>b-a));
 });
 it('does not use foreign output version workspace identities as existing draft priority evidence',async()=>{
  const f=await setup(),foreign=await setup();await deriveActionsForSnapshot(db,f.snapshot);
  const action=(await db.query("SELECT id,priority_score FROM actions WHERE workspace_id=$1 AND template_key='review-response'",[f.ws])).rows[0];
  await db.query("INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type,approval_state) VALUES($1,$2,1,'Fixture','user','draft')",[foreign.ws,action.id]);
  await deriveActionsForSnapshot(db,f.snapshot);
  expect((await db.query('SELECT priority_score FROM actions WHERE id=$1',[action.id])).rows[0].priority_score).toBe(action.priority_score);
 });
 it('claim derivation write failure leaves no partial actions or derived audit',async()=>{
  const f=await setup();
  await owner.query("CREATE FUNCTION fixture_fail_claim_action() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.template_key='google-reconnect' THEN RAISE EXCEPTION 'fixture claim failure'; END IF; RETURN NEW; END $$");
  await owner.query('CREATE TRIGGER fixture_fail_claim_action BEFORE INSERT ON actions FOR EACH ROW EXECUTE FUNCTION fixture_fail_claim_action()');
  try {
   await expect(deriveActionsForClaim(f.job,f.ws,f.loc,db)).rejects.toThrow('fixture claim failure');
   expect((await db.query('SELECT id FROM actions WHERE workspace_id=$1',[f.ws])).rows).toHaveLength(0);
   expect((await db.query('SELECT id FROM audit_events WHERE workspace_id=$1',[f.ws])).rows).toHaveLength(0);
  }finally{await owner.query('DROP TRIGGER fixture_fail_claim_action ON actions');await owner.query('DROP FUNCTION fixture_fail_claim_action()');}
 });

 it.each([true,false])('consumes the pinned comparison for closure and priority when a newer comparison disagrees (%s)',async pinnedResolved=>{
  const base=await setup();await deriveActionsForSnapshot(db,base.snapshot);
  const otherBase=await setup(base.ws,base.loc,'2026-09-02');
  const head=await setup(base.ws,base.loc,'2026-09-03');
  await db.query("UPDATE audit_findings SET finding_key='ig.content_consistency',module='ig' WHERE job_id=$1",[head.job]);
  const pinned=(await db.query("INSERT INTO scan_diffs(base_job_id,head_job_id,comparable,resolved_findings,regressed_findings,created_at) VALUES($1,$2,true,$3,$4,'2026-09-03') RETURNING id",[base.job,head.job,pinnedResolved?['gbp.owner_response_low']:[],pinnedResolved?['ig.content_consistency']:[]])).rows[0].id;
  await db.query("INSERT INTO scan_diffs(base_job_id,head_job_id,comparable,resolved_findings,regressed_findings,created_at) VALUES($1,$2,true,$3,$4,'2026-09-04')",[otherBase.job,head.job,pinnedResolved?[]:['gbp.owner_response_low'],pinnedResolved?[]:['ig.content_consistency']]);
  await db.query('UPDATE scan_snapshots SET diff_id=$1,comparable_to=$2 WHERE id=$3',[pinned,base.snapshot,head.snapshot]);
  const result=await deriveActionsForSnapshot(db,head.snapshot,{now:new Date('2026-09-04')});
  expect(result).toMatchObject({completed:pinnedResolved?1:0,expired:pinnedResolved?0:1});
  const closed=(await db.query("SELECT action_state,measurement_state FROM actions WHERE workspace_id=$1 AND template_key='review-response'",[base.ws])).rows[0];
  expect(closed).toEqual({action_state:pinnedResolved?'completed':'expired',measurement_state:pinnedResolved?'measured':'not_eligible'});
  const social=(await db.query("SELECT priority_factors FROM actions WHERE workspace_id=$1 AND template_key='social-post'",[base.ws])).rows[0];
  expect(social.priority_factors).toContainEqual({key:'urgency',points:pinnedResolved?15:8});
 });
 it.each([false,true])('does not infer measured evidence without a linked base snapshot (diff linked %s)',async linkDiff=>{
  const base=await setup();await deriveActionsForSnapshot(db,base.snapshot);
  const head=await setup(base.ws,base.loc,'2026-09-02');await db.query('DELETE FROM audit_findings WHERE job_id=$1',[head.job]);
  const diff=(await db.query("INSERT INTO scan_diffs(base_job_id,head_job_id,comparable,resolved_findings) VALUES($1,$2,true,ARRAY['gbp.owner_response_low']) RETURNING id",[base.job,head.job])).rows[0].id;
  if(linkDiff)await db.query('UPDATE scan_snapshots SET diff_id=$1 WHERE id=$2',[diff,head.snapshot]);
  expect(await deriveActionsForSnapshot(db,head.snapshot)).toMatchObject({completed:0,expired:1});
  expect((await db.query("SELECT measurement_state FROM actions WHERE workspace_id=$1 AND template_key='review-response'",[base.ws])).rows[0].measurement_state).toBe('not_eligible');
 });
 it.each(['wrong-head','wrong-base-snapshot','foreign-base-job','foreign-base-snapshot','foreign-base-location','base-without-diff'])('rejects corrupt pinned comparison %s before writes',async corruption=>{
  const base=await setup();await deriveActionsForSnapshot(db,base.snapshot);
  const head=await setup(base.ws,base.loc,'2026-09-02'),foreign=await setup();
  const diff=(await db.query("INSERT INTO scan_diffs(base_job_id,head_job_id,comparable,resolved_findings) VALUES($1,$2,true,ARRAY['gbp.owner_response_low']) RETURNING id",[base.job,head.job])).rows[0].id;
  await db.query('UPDATE scan_snapshots SET diff_id=$1,comparable_to=$2 WHERE id=$3',[diff,base.snapshot,head.snapshot]);
  if(corruption==='wrong-head')await db.query('UPDATE scan_diffs SET head_job_id=$1 WHERE id=$2',[foreign.job,diff]);
  if(corruption==='wrong-base-snapshot')await db.query('UPDATE scan_snapshots SET comparable_to=$1 WHERE id=$2',[head.snapshot,head.snapshot]);
  if(corruption==='foreign-base-job')await db.query('UPDATE audit_jobs SET workspace_id=$1 WHERE id=$2',[foreign.ws,base.job]);
  if(corruption==='foreign-base-snapshot')await db.query('UPDATE scan_snapshots SET workspace_id=$1 WHERE id=$2',[foreign.ws,base.snapshot]);
  if(corruption==='foreign-base-location')await db.query('UPDATE audit_jobs SET location_id=$1 WHERE id=$2',[foreign.loc,base.job]);
  if(corruption==='base-without-diff')await db.query('UPDATE scan_snapshots SET diff_id=NULL WHERE id=$1',[head.snapshot]);
  const before=(await db.query('SELECT id,action_state,source_snapshot_id FROM actions WHERE workspace_id=$1 ORDER BY id',[base.ws])).rows;
  await expect(deriveActionsForSnapshot(db,head.snapshot)).rejects.toThrow('scope');
  expect((await db.query('SELECT id,action_state,source_snapshot_id FROM actions WHERE workspace_id=$1 ORDER BY id',[base.ws])).rows).toEqual(before);
  expect((await db.query("SELECT id FROM audit_events WHERE entity_id=$1 AND event='action.derived'",[head.snapshot])).rows).toHaveLength(0);
 });

});
