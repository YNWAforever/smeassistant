import { Pool } from "pg";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { resolveApplicationUser } from "../../lib/identity/users";
import type { VerifiedIdentity } from "../../lib/identity/contracts";
const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({getPool:()=>ports.pool}));
const identity = (subject="opaque|non-uuid",email="same@example.test"): VerifiedIdentity => ({provider:"neon",subject,email,verified:true});
describe.runIf(process.env.NEON_INTEGRATION === "1")("application identity mapping",()=>{
 let fixture: NeonDatabaseFixture;
 let owner: Pool;
 let runtime: Pool;
 beforeAll(async()=>{
  fixture=await startNeonDatabaseFixture("test");
  owner=new Pool({connectionString:fixture.databaseUrl});
  await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
  await applyMigrations(owner);
  const url=new URL(fixture.databaseUrl); url.username="fixture_runtime"; url.password="fixture-only";
  runtime=new Pool({connectionString:url.href,max:10}); ports.pool=runtime;
 });
 beforeEach(async()=> {await runtime.query("DELETE FROM app_users");});
 afterAll(async()=> {await Promise.all([owner?.end(),runtime?.end()]);fixture?.stop();});
 it("maps an opaque subject to an application UUID through restricted runtime",async()=>{
  const role=(await runtime.query("SELECT current_user AS name, rolsuper, rolbypassrls, pg_has_role(current_user,'sme_app_runtime','member') AS member FROM pg_roles WHERE rolname=current_user")).rows[0];
  expect(role).toEqual({name:"fixture_runtime",rolsuper:false,rolbypassrls:false,member:true});
  const user=await resolveApplicationUser(identity());
  expect(user).toEqual({id:expect.stringMatching(/^[0-9a-f-]{36}$/),email:"same@example.test",verified:true});
  expect(await resolveApplicationUser(identity())).toEqual(user);
  expect((await runtime.query("SELECT count(*)::int AS n FROM workspace_members")).rows[0].n).toBe(0);
 });
 it("updates verified email without changing identity or merging a different subject",async()=>{
  const a=await resolveApplicationUser(identity("subject-a"));
  const b=await resolveApplicationUser(identity("subject-b")); expect(b.id).not.toBe(a.id);
  expect(await resolveApplicationUser(identity("subject-a","new@example.test"))).toEqual({...a,email:"new@example.test"});
  expect((await runtime.query("SELECT id,email FROM app_users ORDER BY email")).rows).toEqual([{id:a.id,email:"new@example.test"},{id:b.id,email:"same@example.test"}]);
 });
 it("serializes simultaneous first logins across eight distinct connections without orphans or memberships",async()=>{
  const clients=await Promise.all(Array.from({length:8},()=>runtime.connect()));
  const pids=await Promise.all(clients.map(async c=>(await c.query("SELECT pg_backend_pid() AS pid")).rows[0].pid));
  expect(new Set(pids).size).toBe(8);
  const blocker=await owner.connect();
  await blocker.query("BEGIN");
  await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify(["neon","concurrent"])]);
  let index=0;
  const connect=vi.spyOn(runtime,"connect").mockImplementation((()=>Promise.resolve(clients[index++])) as typeof runtime.connect);
  let results;
  const pending=Promise.all(Array.from({length:8},()=>resolveApplicationUser(identity("concurrent"))));
  // Observe all eight runtime clients waiting on the same transaction lock.
  let waiting=0;
  try {
   for(let attempt=0;attempt<100 && waiting<8;attempt++) {
    waiting=(await owner.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock' AND wait_event='advisory'",[pids])).rows[0].n;
    if(waiting<8) await new Promise(resolve=>setTimeout(resolve,10));
   }
  } finally {await blocker.query("ROLLBACK");blocker.release();}
  try {results=await pending;expect(waiting).toBe(8);}
  finally {connect.mockRestore(); if(index===0) clients.forEach(c=>c.release());}
  expect(index).toBe(8); expect(new Set(results.map(u=>u.id)).size).toBe(1);
  expect((await runtime.query("SELECT (SELECT count(*)::int FROM app_users) AS users,(SELECT count(*)::int FROM auth_identities) AS identities,(SELECT count(*)::int FROM workspace_members) AS memberships")).rows[0]).toEqual({users:1,identities:1,memberships:0});
 });
 it("rolls back the candidate user if identity insertion fails",async()=>{
  await owner.query("CREATE FUNCTION public.fixture_reject_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture secret'; END $$; CREATE TRIGGER fixture_reject_identity BEFORE INSERT ON auth_identities FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_identity()");
  try {await expect(resolveApplicationUser(identity())).rejects.toThrow(/^identity_resolution_failed$/);}
  finally {await owner.query("DROP TRIGGER fixture_reject_identity ON auth_identities; DROP FUNCTION public.fixture_reject_identity()");}
  expect((await runtime.query("SELECT count(*)::int AS n FROM app_users")).rows[0].n).toBe(0);
 });
 it("rejects invalid identities before a connection or any writes",async()=>{
  const connect=vi.spyOn(runtime,"connect");
  for(const value of [{...identity(),verified:false},{...identity(),provider:"other"},{...identity(),subject:""},{...identity(),email:"invalid"}]) {
   await expect(resolveApplicationUser(value as VerifiedIdentity)).rejects.toThrow(/^identity_invalid$/);
  }
  expect(connect).not.toHaveBeenCalled();connect.mockRestore();
 });
});
