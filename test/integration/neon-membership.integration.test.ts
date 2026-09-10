import { Pool } from "pg";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { resolveApplicationUser } from "../../lib/identity/users";
import { completeWorkspaceClaim } from "../../lib/workspace/claim";
import { claimsRepository as claims, claimCompletionStore } from "../../lib/repositories/claims";
import { membershipRepository as members } from "../../lib/repositories/membership";
const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool }));
const identity = (subject = "member", email = "member@example.test") => ({ provider: "neon" as const, subject, email, verified: true as const });
describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon membership boundaries", () => {
 let fixture: NeonDatabaseFixture;
 let owner: Pool;
 let runtime: Pool;
 beforeAll(async () => {
  fixture = await startNeonDatabaseFixture("test");
  owner = new Pool({ connectionString: fixture.databaseUrl });
  await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
  await applyMigrations(owner);
  const url = new URL(fixture.databaseUrl); url.username = "fixture_runtime"; url.password = "fixture-only";
  runtime = new Pool({ connectionString: url.href, max: 10 }); ports.pool = runtime;
 });
 beforeEach(async () => { await runtime.query("DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM app_users"); });
 afterAll(async () => { await Promise.all([owner?.end(), runtime?.end()]); fixture?.stop(); });
 const workspace = async (slug = "shop") => (await runtime.query("INSERT INTO workspaces(slug) VALUES($1) RETURNING id", [slug])).rows[0].id as string;
 it("reads only accepted membership for the mapped application UUID and workspace", async () => {
  const user = await resolveApplicationUser(identity()); const ws = await workspace(); const other = await workspace("other");
  await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role) VALUES($1,$2,$3,'viewer')", [ws,user.id,user.email]);
  expect(await members.accepted(user.id, ws)).toBeNull();
  await runtime.query("UPDATE workspace_members SET accepted_at=now() WHERE workspace_id=$1",[ws]);
  expect(await members.accepted(user.id,ws)).toMatchObject({role:"viewer",workspace_id:ws});
  expect(await members.accepted(user.id,other)).toBeNull();
  await members.remove(ws, (await members.team(ws))[0].id);
  expect(await members.accepted(user.id,ws)).toBeNull();
 });
 it("binds all matching pending invitations once and preserves their role and scope", async () => {
  const user=await resolveApplicationUser(identity()); const a=await workspace(); const b=await workspace("b");
  const locationScope=["00000000-0000-4000-8000-000000000001"];
  await runtime.query("INSERT INTO workspace_members(workspace_id,email,role,location_scope,invited_at,created_at) VALUES($1,'MEMBER@example.test','manager',$3::uuid[],'2000-01-01','2000-01-01'),($2,'member@example.test','viewer',null,now(),now())",[a,b,locationScope]);
  expect(await members.bindPending(user)).toBe(a);
  expect(await members.listAccepted(user.id)).toHaveLength(2);
  expect((await members.accepted(user.id,a))?.role).toBe("manager");
  expect((await members.accepted(user.id,a))?.location_scope).toEqual(locationScope);
  expect(await members.bindPending(user)).toBeNull();
 });
 it("does not bind an unverified, mismatched, or unknown application identity", async () => {
  const user=await resolveApplicationUser(identity()); const ws=await workspace();
  await runtime.query("INSERT INTO workspace_members(workspace_id,email,role) VALUES($1,'victim@example.test','owner')",[ws]);
  await expect(members.bindPending({...user,verified:false})).rejects.toThrow("identity");
  await expect(members.bindPending({...user,email:"victim@example.test"})).rejects.toThrow("identity");
  expect(await members.bindPending(user)).toBeNull();
  expect(await members.listAccepted(user.id)).toEqual([]);
 });
 it("serializes competing verified identities for the same recipient without overwriting the winner", async () => {
  const a=await resolveApplicationUser(identity("a")); const b=await resolveApplicationUser(identity("b")); const ws=await workspace();
  await runtime.query("INSERT INTO workspace_members(workspace_id,email,role) VALUES($1,$2,'viewer')",[ws,a.email]);
  const results=await Promise.all(Array.from({length:8},(_,i)=>members.bindPending(i%2?a:b)));
  expect(results.filter(Boolean)).toEqual([ws]);
  const rows=(await runtime.query("SELECT user_id,accepted_at FROM workspace_members")).rows;
  expect(rows).toHaveLength(1); expect([a.id,b.id]).toContain(rows[0].user_id); expect(rows[0].accepted_at).not.toBeNull();
 });
 it("rolls back every invitation when a user-workspace conflict occurs", async () => {
  const user=await resolveApplicationUser(identity()); const a=await workspace(); const b=await workspace("b");
  await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,'old@example.test','viewer',now())",[a,user.id]);
  await runtime.query("INSERT INTO workspace_members(workspace_id,email,role) VALUES($1,$3,'manager'),($2,$3,'viewer')",[a,b,user.email]);
  await expect(members.bindPending(user)).rejects.toThrow();
  expect((await runtime.query("SELECT count(*)::int n FROM workspace_members WHERE user_id IS NULL")).rows[0].n).toBe(2);
 });
 it("returns ordered accepted memberships, owner lookup excludes pending owners", async () => {
  const user=await resolveApplicationUser(identity()); const ws=await workspace();
  await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role) VALUES($1,$2,$3,'owner')",[ws,user.id,user.email]);
  expect(await members.ownedWorkspace(user.id)).toBeNull();
  await runtime.query("UPDATE workspace_members SET accepted_at=now()");
  expect(await members.ownedWorkspace(user.id)).toEqual({workspaceId:ws});
  expect(await members.listAccepted(user.id)).toMatchObject([{workspace_id:ws,workspace_slug:"shop",role:"owner"}]);
 });
 it.each(["manager", "viewer"])("allows %s sign-in mail before and after invitation acceptance without changing authority", async role => {
  const user=await resolveApplicationUser(identity()); const ws=await workspace();
  await runtime.query("INSERT INTO workspace_members(workspace_id,email,role) VALUES($1,$2,$3)",[ws,user.email,role]);
  expect(await members.hasSignInMembership("MEMBER@example.test")).toBe(true);
  expect(await members.accepted(user.id,ws)).toBeNull();
  await members.bindPending(user);
  expect(await members.hasPendingInvitation(user.email)).toBe(false);
  const before=await members.team(ws);
  expect(await members.hasSignInMembership("MEMBER@example.test")).toBe(true);
  expect(await members.team(ws)).toEqual(before);
  expect(await members.hasSignInMembership("unknown@example.test")).toBe(false);
  await members.remove(ws,before[0].id);
  expect(await members.hasSignInMembership(user.email)).toBe(false);
 });
 it("blocks direct removal of the sole owner, including a concurrent double attempt, and preserves the row", async () => {
  const user=await resolveApplicationUser(identity()); const ws=await workspace();
  await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,$3,'owner',now())",[ws,user.id,user.email]);
  const ownerId=(await members.team(ws))[0].id;
  await expect(members.remove(ws,ownerId)).rejects.toMatchObject({code:"23514"});
  expect(await members.hasSignInMembership(user.email)).toBe(true);
  expect((await members.team(ws)).map(row=>row.id)).toEqual([ownerId]);
  const results=await Promise.allSettled([members.remove(ws,ownerId),members.remove(ws,ownerId)]);
  expect(results.every(result=>result.status==="rejected")).toBe(true);
  expect((await members.team(ws)).map(row=>row.id)).toEqual([ownerId]);
  expect((await runtime.query("SELECT id FROM workspaces WHERE id=$1",[ws])).rows).toHaveLength(1);
 });
 it("uses the mapped identity's current email rather than a stale accepted invitation address", async () => {
  const user=await resolveApplicationUser(identity()); const ws=await workspace();
  await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,'stale@example.test','owner',now())",[ws,user.id]);
  expect(await members.hasSignInMembership("stale@example.test")).toBe(false);
  expect(await members.hasSignInMembership(user.email)).toBe(true);
  await runtime.query("DELETE FROM auth_identities WHERE user_id=$1",[user.id]);
  expect(await members.hasSignInMembership(user.email)).toBe(false);
 });
 it("pending mail recipients exclude already accepted rows", async () => {
  const ws=await workspace();
  await members.invite({workspaceId:ws,email:"member@example.test",role:"viewer",invitedBy:null});
  expect(await members.hasPendingInvitation("MEMBER@example.test")).toBe(true);
  const user=await resolveApplicationUser(identity()); await members.bindPending(user);
  expect(await members.hasPendingInvitation(user.email)).toBe(false);
 });
 it("tenant-scopes member mutations and never changes the owner through role patch", async () => {
  const ws=await workspace();const other=await workspace("other");
  const id=await members.invite({workspaceId:ws,email:"member@example.test",role:"manager",invitedBy:null});
  expect(await members.member(other,id)).toBeNull(); expect(await members.remove(other,id)).toBe(false);
  expect(await members.update(other,id,{role:"viewer"})).toBe(false);
  await runtime.query("UPDATE workspace_members SET role='owner' WHERE id=$1",[id]);
  expect(await members.update(ws,id,{role:"viewer"})).toBe(false);
  expect((await members.member(ws,id))?.role).toBe("owner");
 });
 it("surfaces database failures rather than claiming membership absence", async () => {
  const user=await resolveApplicationUser(identity()); const ws=await workspace();
  const query=vi.spyOn(runtime,"query").mockRejectedValueOnce(new Error("fixture failure"));
  await expect(members.accepted(user.id,ws)).rejects.toThrow("fixture failure"); query.mockRestore();
 });
 it("creates workspace and accepted owner atomically, and rolls back a missing identity", async () => {
  const user=await resolveApplicationUser(identity());
  const input={ownerUserId:user.id,ownerEmail:user.email,businessName:"Shop",industry:null,district:null,market:"hk"};
  const created=await claims.createWorkspaceWithOwner(input);
  expect(created.slug).toBe("shop"); expect((await members.accepted(user.id,created.id))?.role).toBe("owner");
  await expect(claims.createWorkspaceWithOwner({...input,ownerUserId:"00000000-0000-0000-0000-000000000000"})).rejects.toThrow();
  expect((await runtime.query("SELECT count(*)::int n FROM workspaces")).rows[0].n).toBe(1);
 });
 it("conditional attachment has one winner and cannot steal or replay a claim", async () => {
  const a=await workspace(); const b=await workspace("b");
  const id=(await runtime.query("INSERT INTO audit_jobs(business_name,share_slug) VALUES('Shop','claim-1') RETURNING id")).rows[0].id;
  const result=await Promise.all([claims.attachJob(id,a),claims.attachJob(id,b)]);
  expect(result.sort()).toEqual([false,true]);
  expect(await claims.attachJob(id,a)).toBe(false);
  expect([a,b]).toContain((await claims.jobBySlug("claim-1"))?.workspace_id);
 });
 it("chooses earliest non-null lead and deduplicates open access requests", async () => {
  const user=await resolveApplicationUser(identity());
  const id=(await runtime.query("INSERT INTO audit_jobs(business_name,share_slug) VALUES('Shop','claim-1') RETURNING id")).rows[0].id;
  await runtime.query("INSERT INTO leads(job_id,email,created_at) VALUES($1,NULL,'2000-01-01'),($1,'first@example.test','2001-01-01'),($1,'later@example.test','2002-01-01')",[id]);
  expect(await claims.firstLeadEmail(id)).toBe("first@example.test");
  expect(await claims.isLeadRecipient("claim-1","later@example.test")).toBe(true);
  expect(await claims.isLeadRecipient("claim-1","LATER@Example.test")).toBe(true);
  expect(await claims.isLeadRecipient("claim-1","stranger@example.test")).toBe(false);
  await Promise.all([claims.recordAccessRequest(id,user.id),claims.recordAccessRequest(id,user.id)]);
  expect((await runtime.query("SELECT count(*)::int n FROM workspace_access_requests")).rows[0].n).toBe(1);
 });
 it("lets a WhatsApp/LINE unlocker's recovery email receive a sign-in link without granting ownership", async () => {
  // POST /api/report-access/unlock only writes leads.email for the "email"
  // channel; a WhatsApp/LINE/phone unlocker's recovery address lands on the
  // viewer grant instead. Mail eligibility has to see both, or those
  // merchants silently dead-end on a new device.
  const id=(await runtime.query("INSERT INTO audit_jobs(business_name,share_slug) VALUES('Shop','claim-wa') RETURNING id")).rows[0].id;
  await runtime.query("INSERT INTO leads(job_id,email,preferred_contact_channel,contact_identifier) VALUES($1,NULL,'whatsapp','+85290000000')",[id]);
  await runtime.query("INSERT INTO report_access_grants(job_id,token_hash,idempotency_key,purpose,email_normalized,expires_at) VALUES($1,repeat('a',64),'idem-wa','report_delivery','owner@example.test',now()+interval '30 days')",[id]);

  expect(await claims.isLeadRecipient("claim-wa","owner@example.test")).toBe(true);
  expect(await claims.isLeadRecipient("claim-wa","OWNER@Example.test")).toBe(true);
  expect(await claims.isLeadRecipient("claim-wa","stranger@example.test")).toBe(false);
  // Eligibility is mail-only: it must not have created any membership.
  expect((await runtime.query("SELECT count(*)::int n FROM workspace_members")).rows[0].n).toBe(0);

  // A revoked grant stops being a mail recipient.
  await runtime.query("UPDATE report_access_grants SET revoked_at=now() WHERE job_id=$1",[id]);
  expect(await claims.isLeadRecipient("claim-wa","owner@example.test")).toBe(false);
 });
 it("rolls back OAuth replacement failure and keeps the predecessor active", async () => {
  const ws=await workspace();
  const token={workspaceId:ws,accessTokenEncrypted:"fixture-access",refreshTokenEncrypted:"fixture-refresh",scopes:["business.manage"],expiresAt:null};
  const first=await claims.replaceGoogleConnection(token);
  await owner.query("CREATE FUNCTION public.fixture_reject_connection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='active' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_reject_connection BEFORE UPDATE ON oauth_connections FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_connection()");
  try {await expect(claims.replaceGoogleConnection(token)).rejects.toThrow();}
  finally {await owner.query("DROP TRIGGER fixture_reject_connection ON oauth_connections; DROP FUNCTION public.fixture_reject_connection()");}
  expect((await runtime.query("SELECT id,status FROM oauth_connections WHERE workspace_id=$1",[ws])).rows).toEqual([{id:first,status:"active"}]);
 });

 it("disconnects a Google connection, destroys the credential and still allows a reconnect", async () => {
  // Only a real database proves this SQL is legal: access_token_encrypted is
  // NOT NULL (so the ciphertext is overwritten, not nulled), 'revoked' has to
  // satisfy oauth_connections_status_check, and the reconnect afterwards has to
  // get past oauth_connections_active_provider_key -- the partial unique index
  // on (workspace_id, provider) WHERE status='active'.
  const ws=await workspace();
  const token={workspaceId:ws,accessTokenEncrypted:"fixture-access",refreshTokenEncrypted:"fixture-refresh",scopes:["business.manage"],expiresAt:null};
  const first=await claims.replaceGoogleConnection(token);
  expect(await claims.hasActiveGoogleConnection(ws)).toBe(true);

  expect(await claims.disconnectGoogleConnection(ws)).toBe(true);
  expect(await claims.hasActiveGoogleConnection(ws)).toBe(false);
  expect((await runtime.query("SELECT status,access_token_encrypted,refresh_token_encrypted FROM oauth_connections WHERE id=$1",[first])).rows[0])
   .toEqual({status:"revoked",access_token_encrypted:"",refresh_token_encrypted:null});

  // Idempotent: nothing is active, so a second disconnect reports no change.
  expect(await claims.disconnectGoogleConnection(ws)).toBe(false);

  // Disconnecting must never cost the owner their workspace -- ownership is
  // workspace_members, never a connection (guardrail 15).
  expect((await runtime.query("SELECT count(*)::int n FROM workspaces WHERE id=$1",[ws])).rows[0].n).toBe(1);

  const second=await claims.replaceGoogleConnection(token);
  expect(second).not.toBe(first);
  expect(await claims.hasActiveGoogleConnection(ws)).toBe(true);
  // The revoked row is kept as provenance rather than deleted.
  expect((await runtime.query("SELECT count(*)::int n FROM oauth_connections WHERE workspace_id=$1",[ws])).rows[0].n).toBe(2);
 });

 it("requires an already attached job and accepted owner before completion writes", async () => {
  const user=await resolveApplicationUser(identity()); const ws=await workspace();
  const id=(await runtime.query("INSERT INTO audit_jobs(business_name,share_slug) VALUES('Shop','claim-1') RETURNING id")).rows[0].id;
  const input={claimSlug:"claim-1",workspaceName:"Updated",primaryLocation:{name:"Central"},market:"hk" as const,userId:user.id,locale:"en"};
  expect(await completeWorkspaceClaim(claimCompletionStore,input)).toEqual({kind:"not_attached"});
  await claims.attachJob(id,ws);
  expect(await completeWorkspaceClaim(claimCompletionStore,input)).toEqual({kind:"forbidden"});
  await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role) VALUES($1,$2,$3,'viewer')",[ws,user.id,user.email]);
  for(const role of ["viewer","manager","owner"]) {
   await runtime.query("UPDATE workspace_members SET role=$2,accepted_at=$3 WHERE workspace_id=$1",[ws,role,role==='owner'?null:new Date()]);
   expect(await completeWorkspaceClaim(claimCompletionStore,input)).toEqual({kind:"forbidden"});
  }
  expect((await runtime.query("SELECT count(*)::int n FROM locations")).rows[0].n).toBe(0);
  expect((await runtime.query("SELECT business_name FROM workspaces WHERE id=$1",[ws])).rows[0].business_name).toBeNull();
 });
 it("completes a claim idempotently and preserves prior brand and usage values", async () => {
  const user=await resolveApplicationUser(identity());
  const ws=await claims.createWorkspaceWithOwner({ownerUserId:user.id,ownerEmail:user.email,businessName:"Shop",industry:null,district:null,market:"hk"});
  await runtime.query("INSERT INTO audit_jobs(business_name,share_slug,workspace_id,input_snapshot) VALUES('Shop','claim-1',$1,$2)",[ws.id,{instagramHandle:"@shop",address:"Fixture address"}]);
  const input={claimSlug:"claim-1",workspaceName:"Updated",primaryLocation:{name:"Central"},market:"hk" as const,userId:user.id,locale:"en"};
  const hooks={now:()=>new Date("2026-09-01T00:00:00Z")};
  const first=await completeWorkspaceClaim(claimCompletionStore,input,hooks);
  expect(first).toMatchObject({kind:"completed",workspaceId:ws.id,workspaceSlug:"shop"});
  await runtime.query("UPDATE workspace_usage SET approved_deliveries=2 WHERE workspace_id=$1;",[ws.id]);
  await runtime.query("UPDATE brand_profiles SET voice='formal' WHERE workspace_id=$1",[ws.id]);
  expect(await completeWorkspaceClaim(claimCompletionStore,input,hooks)).toEqual(first);
  expect((await runtime.query("SELECT count(*)::int n FROM locations WHERE workspace_id=$1",[ws.id])).rows[0].n).toBe(1);
  expect((await runtime.query("SELECT ig_handle,address FROM locations WHERE workspace_id=$1",[ws.id])).rows[0]).toEqual({ig_handle:"shop",address:"Fixture address"});
  expect((await runtime.query("SELECT approved_deliveries FROM workspace_usage WHERE workspace_id=$1",[ws.id])).rows[0].approved_deliveries).toBe(2);
  expect((await runtime.query("SELECT voice FROM brand_profiles WHERE workspace_id=$1",[ws.id])).rows[0].voice).toBe("formal");
  expect((await runtime.query("SELECT count(*)::int n FROM audit_events WHERE workspace_id=$1 AND event='workspace.claimed'",[ws.id])).rows[0].n).toBe(1);
 });

 it("mints an absent empty slug once and preserves it on later completion updates",async()=>{
  const ws=await workspace("");
  await claimCompletionStore.updateWorkspace(ws,{business_name:"Shop",timezone:"Asia/Hong_Kong",market:"hk",slug:"new-shop"});
  expect((await members.workspace({id:ws}))?.slug).toBe("new-shop");
  await claimCompletionStore.updateWorkspace(ws,{business_name:"Renamed",timezone:"Asia/Hong_Kong",market:"hk"});
  expect((await members.workspace({id:ws}))?.slug).toBe("new-shop");
 });

});
