import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { startNeonDatabaseFixture } from '../test/integration/neon-database';
import { applyMigrations } from './neon/migrations';
export function parseSeedArgs(args:string[]):true {if(args.length!==1||args[0]!=='--owned-test')throw new Error('seed_requires_owned_test');return true;}
/** Always creates a labeled disposable database. Ambient database URLs are never read. */
export async function seedOwnedDemo() {
 const fixture=await startNeonDatabaseFixture('test');
 const db=new Pool({connectionString:fixture.databaseUrl});
 try {
  await db.query('CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
  await applyMigrations(db);
  const user=randomUUID(), workspace=randomUUID(), location=randomUUID();
  await db.query('BEGIN');
  await db.query('INSERT INTO public.app_users(id,email) VALUES ($1,$2)',[user,'owner@demo.test']);
  await db.query("INSERT INTO public.auth_identities(provider,subject,user_id) VALUES ('neon',$1,$2)",['demo-local-owner',user]);
  await db.query("INSERT INTO public.workspaces(id,business_name,market,slug,tier,timezone) VALUES ($1,'Local Demo','hk','local-demo','lite','Asia/Hong_Kong')",[workspace]);
  await db.query("INSERT INTO public.locations(id,workspace_id,slug,name,is_primary) VALUES ($1,$2,'primary','Demo Location',true)",[location,workspace]);
  await db.query("INSERT INTO public.workspace_members(workspace_id,email,role,location_scope) VALUES ($1,'owner@demo.test','owner',null)",[workspace]);
  await db.query('COMMIT');
  const result=await db.query('SELECT count(*)::int AS count FROM public.workspace_members WHERE workspace_id=$1',[workspace]);
  if(result.rows[0]?.count!==1)throw new Error('demo_seed_verification_failed');
  return {status:'seeded_and_verified',target:'owned_local_test',workspaces:1,members:1,disposable:true};
 }finally{await db.end();fixture.stop();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{parseSeedArgs(process.argv.slice(2));console.log(JSON.stringify(await seedOwnedDemo()));}catch{console.error('seed_requires_owned_test_or_fixture_unavailable');process.exitCode=1;}}
