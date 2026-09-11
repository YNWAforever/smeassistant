import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
import { withTransaction } from "../db/transaction";
import { slugify, uniqueWorkspaceSlug, uniqueLocationSlug } from "../workspace/slug";

export interface ClaimJob {
 id:string; workspace_id:string|null; location_id:string|null; share_slug:string; business_name:string;
 industry:string|null; district:string|null; region:string; place_id:string|null;
 ig_handle:string|null; website_url:string|null; input_snapshot:Record<string,unknown>|null;
 module_results:Record<string,unknown>|null; status:string;
}
export interface OwnerWorkspaceInput {ownerUserId:string;ownerEmail:string;businessName:string|null;industry:string|null;district:string|null;market:string|null}
export interface GoogleConnectionInput {workspaceId:string;accountRef?:string|null;accessTokenEncrypted:string;refreshTokenEncrypted:string;scopes:string[];expiresAt:string|null}

/** App-owned claim stores. Provider calls and identity verification stay outside. */
export const claimsRepository = {
 async jobBySlug(slug:string):Promise<ClaimJob|null> {
  return (await getPool().query<ClaimJob>("SELECT id,workspace_id,location_id,share_slug,business_name,industry,district,region,place_id,ig_handle,website_url,input_snapshot,module_results,status FROM audit_jobs WHERE share_slug=$1",[slug])).rows[0]??null;
 },
 async hasActiveGoogleConnection(workspaceId:string):Promise<boolean> {
  return Boolean((await getPool().query("SELECT id FROM oauth_connections WHERE workspace_id=$1 AND provider='google_gbp' AND status='active' LIMIT 1",[workspaceId])).rows.length);
 },
 async jobById(id:string):Promise<ClaimJob|null> {
  return (await getPool().query<ClaimJob>("SELECT id,workspace_id,location_id,share_slug,business_name,industry,district,region,place_id,ig_handle,website_url,input_snapshot,module_results,status FROM audit_jobs WHERE id=$1",[id])).rows[0]??null;
 },
 async recordMerchantClaimEvent(input:{job_id:string;workspace_id:string;matched_location_id:string;claimed_by_user_id:string}):Promise<void> {
  try {await getPool().query("INSERT INTO workspace_claim_events(job_id,workspace_id,matched_location_id,claimed_by_user_id) VALUES($1,$2,$3,$4)",[input.job_id,input.workspace_id,input.matched_location_id,input.claimed_by_user_id]);}
  catch {console.error("[workspace/claim] claim event not recorded",{category:"claim_event_failed"});}
 },
 /**
  * `db` lets a caller run this inside its own transaction (the operator
  * assignment path). Omitted, it opens its own, which is what the OAuth claim
  * callback and the sign-in completion port have always done.
  *
  * Nesting is safe and slightly stronger: pg_advisory_xact_lock is scoped to
  * the surrounding transaction, so when a caller supplies one the slug lock is
  * held until THEIR commit rather than released early.
  */
 async createWorkspaceWithOwner(input:OwnerWorkspaceInput,db?:Pick<Pool,"query">):Promise<{id:string;slug:string}> {
  const run = async (client:Pick<Pool,"query">) => {
   const base=slugify(input.businessName??"workspace");
   // Serialize the slug namespace; the persisted unique index is the final guard.
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`workspace-slug:${base}`]);
   const slug=await uniqueWorkspaceSlug(client,base);
   const row=(await client.query<{id:string;slug:string}>("INSERT INTO workspaces(business_name,industry,district,market,slug) VALUES($1,$2,$3,$4,$5) RETURNING id,slug",[input.businessName,input.industry,input.district,input.market==="tw"?"tw":"hk",slug])).rows[0];
   await client.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,$3,'owner',now())",[row.id,input.ownerUserId,input.ownerEmail]);
   return row;
  };
  return db ? run(db) : withTransaction(run);
 },
 async attachJob(jobId:string,workspaceId:string,db:Pick<Pool,"query">=getPool()):Promise<boolean> {
  return Boolean((await db.query("UPDATE audit_jobs SET workspace_id=$2 WHERE id=$1 AND workspace_id IS NULL RETURNING id",[jobId,workspaceId])).rows.length);
 },
 async firstLeadEmail(jobId:string):Promise<string|null> {
  return (await getPool().query<{email:string}>("SELECT email FROM leads WHERE job_id=$1 AND email IS NOT NULL ORDER BY created_at,id LIMIT 1",[jobId])).rows[0]?.email??null;
 },
 /**
  * Mail eligibility only: may this address be sent a sign-in link for this
  * report? It never grants workspace access or ownership -- that stays
  * Google-verified or staff-assigned (guardrail 15).
  *
  * The grant branch exists because POST /api/report-access/unlock only writes
  * leads.email when the chosen contact channel IS email; a merchant who
  * unlocked over WhatsApp, LINE or phone has their address on the viewer
  * grant's email_normalized instead. Matching only leads.email dead-ended
  * exactly those merchants when they later asked for a sign-in link from
  * another device -- the request returned the same uniform {ok:true} as an
  * unknown address, so nothing was ever sent and nothing explained why.
  */
 async isLeadRecipient(slug:string,email:string):Promise<boolean> {
  return Boolean((await getPool().query(`SELECT 1 FROM audit_jobs j WHERE j.share_slug=$1 AND (
    EXISTS (SELECT 1 FROM leads l WHERE l.job_id=j.id AND lower(l.email)=lower($2))
    OR EXISTS (SELECT 1 FROM report_access_grants g WHERE g.job_id=j.id AND g.email_normalized IS NOT NULL AND lower(g.email_normalized)=lower($2) AND g.revoked_at IS NULL)
  ) LIMIT 1`,[slug,email])).rows.length);
 },
 async recordAccessRequest(jobId:string,userId:string):Promise<void> {
  await getPool().query("INSERT INTO workspace_access_requests(job_id,user_id) VALUES($1,$2) ON CONFLICT (job_id,user_id) WHERE resolved_at IS NULL DO NOTHING",[jobId,userId]);
 },
 /**
  * Withdraws the workspace's Google Business Profile connection. Returns false
  * when there was no active one, so a double-click is a no-op rather than an
  * error.
  *
  * Takes the same workspace lock as `replaceGoogleConnection`, so a disconnect
  * racing a reconnect serialises instead of interleaving -- without it the two
  * could both believe they hold the `status='active'` slot that
  * `oauth_connections_active_provider_key` allows only one row to occupy.
  *
  * The ciphertext is overwritten rather than nulled because
  * `access_token_encrypted` is NOT NULL; either way the stored credential is
  * destroyed, and nothing reads it back (`decryptToken` has no production call
  * site -- these tokens are write-only today). The row itself is kept, not
  * deleted: it is the provenance of a connection that once existed, and
  * `status='revoked'` is what the reconnect prompt keys on.
  */
 async disconnectGoogleConnection(workspaceId:string):Promise<boolean> {
  return withTransaction(async db => {
   await db.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",[workspaceId]);
   const result=await db.query("UPDATE oauth_connections SET status='revoked',access_token_encrypted='',refresh_token_encrypted=NULL,updated_at=now() WHERE workspace_id=$1 AND provider='google_gbp' AND status='active'",[workspaceId]);
   return (result.rowCount??0)>0;
  });
 },
 async replaceGoogleConnection(input:GoogleConnectionInput):Promise<string> {
  return withTransaction(async db => {
   // The old credential survives any insert/revoke/promote failure.
   await db.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",[input.workspaceId]);
   const row=(await db.query<{id:string}>("INSERT INTO oauth_connections(workspace_id,provider,account_ref,access_token_encrypted,refresh_token_encrypted,scopes,expires_at,status) VALUES($1,'google_gbp',$2,$3,$4,$5,$6,'expired') RETURNING id",[input.workspaceId,input.accountRef??null,input.accessTokenEncrypted,input.refreshTokenEncrypted,input.scopes,input.expiresAt])).rows[0];
   await db.query("UPDATE oauth_connections SET status='revoked',updated_at=now() WHERE workspace_id=$1 AND provider='google_gbp' AND status='active'",[input.workspaceId]);
   await db.query("UPDATE oauth_connections SET status='active',updated_at=now() WHERE id=$1 AND status='expired'",[row.id]);
   return row.id;
  });
 },
};

export interface LocationFields {name:string;address:string|null;district:string|null;place_id:string|null;ig_handle:string|null;website_url:string|null}
export interface ClaimAuditEvent {workspace_id:string;location_id?:string|null;actor_type:string;actor_id?:string|null;event:string;entity_type?:string|null;entity_id?:string|null;payload:Record<string,unknown>}

/** Best-effort audit persistence after the business mutation has succeeded. */
export async function recordClaimAuditEvent(input:ClaimAuditEvent):Promise<void> {
 try {
  await getPool().query("INSERT INTO audit_events(workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[input.workspace_id,input.location_id??null,input.actor_type,input.actor_id??null,input.event,input.entity_type??null,input.entity_id??null,input.payload]);
 } catch { console.error("[workspace/audit] event not recorded",{category:"audit_insert_failed",event:input.event}); }
}

/** Idempotent completion writes; never attaches a job or grants membership. */
export const claimCompletionStore = {
 job: claimsRepository.jobBySlug,
 async membership(userId:string,workspaceId:string):Promise<{role:string}|null> {
  return (await getPool().query<{role:string}>("SELECT role FROM workspace_members WHERE user_id=$1 AND workspace_id=$2 AND accepted_at IS NOT NULL LIMIT 1",[userId,workspaceId])).rows[0]??null;
 },
 async workspace(workspaceId:string):Promise<{id:string;slug:string|null;tier:"lite"|"paid";timezone:string}|null> {
  return (await getPool().query<{id:string;slug:string|null;tier:"lite"|"paid";timezone:string}>("SELECT id,slug,tier,timezone FROM workspaces WHERE id=$1",[workspaceId])).rows[0]??null;
 },
 async workspaceSlug(base:string):Promise<string> {
  return uniqueWorkspaceSlug(getPool(),base);
 },
 async locationSlug(workspaceId:string,base:string):Promise<string> {
  return uniqueLocationSlug(getPool(),workspaceId,base);
 },
 async updateWorkspace(id:string,fields:{business_name:string;timezone:string;market:string;slug?:string}):Promise<void> {
  await getPool().query("UPDATE workspaces SET business_name=$2,timezone=$3,market=$4,slug=coalesce(nullif(slug,''),$5) WHERE id=$1",[id,fields.business_name,fields.timezone,fields.market,fields.slug??null]);
 },
 /**
  * `place_id` comes back with the row because the claim must decide whether the
  * job it is completing describes THIS location or a different shop. It used to
  * take the primary row unconditionally and rewrite its identity.
  */
 async primaryLocation(workspaceId:string):Promise<{id:string;place_id:string|null}|null> {
  return (await getPool().query<{id:string;place_id:string|null}>("SELECT id,place_id FROM locations WHERE workspace_id=$1 AND is_primary=true",[workspaceId])).rows[0]??null;
 },
 /** Workspace-scoped on purpose: a job's location_id is only usable while that location is still this workspace's. */
 async location(workspaceId:string,locationId:string):Promise<{id:string;place_id:string|null;is_primary:boolean}|null> {
  return (await getPool().query<{id:string;place_id:string|null;is_primary:boolean}>("SELECT id,place_id,is_primary FROM locations WHERE id=$1 AND workspace_id=$2",[locationId,workspaceId])).rows[0]??null;
 },
 async updateLocation(id:string,fields:LocationFields):Promise<void> {
  await getPool().query("UPDATE locations SET name=$2,address=$3,district=$4,place_id=$5,ig_handle=$6,website_url=$7 WHERE id=$1",[id,fields.name,fields.address,fields.district,fields.place_id,fields.ig_handle,fields.website_url]);
 },
 /** `is_primary` is a parameter now: a workspace's second location is a real, non-primary row, not a rewrite of the first. */
 async insertLocation(fields:LocationFields & {workspace_id:string;slug:string;is_primary:boolean}):Promise<{id:string}> {
  return (await getPool().query<{id:string}>("INSERT INTO locations(workspace_id,slug,is_primary,name,address,district,place_id,ig_handle,website_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",[fields.workspace_id,fields.slug,fields.is_primary,fields.name,fields.address,fields.district,fields.place_id,fields.ig_handle,fields.website_url])).rows[0];
 },
 async attachLocation(jobId:string,locationId:string):Promise<void> {await getPool().query("UPDATE audit_jobs SET location_id=$2 WHERE id=$1",[jobId,locationId]);},
 /**
  * Seeds the brand profile at claim time. `brand` carries what the owner
  * actually typed in onboarding step 4 -- previously those fields were POSTed
  * and silently discarded, leaving an empty default row, so the owner filled in
  * a voice and approved claims that went nowhere. ON CONFLICT DO NOTHING still
  * means a re-run never overwrites a brand the owner has since edited.
  */
 async ensureBrand(workspaceId:string,brand?:{voice?:string|null;approvedClaims?:string[]|null}):Promise<void> {
  await getPool().query(
   "INSERT INTO brand_profiles(workspace_id,voice,approved_claims) VALUES($1,coalesce($2,'warm'),coalesce($3::text[],'{}'::text[])) ON CONFLICT(workspace_id) DO NOTHING",
   [workspaceId,brand?.voice??null,brand?.approvedClaims?.length?brand.approvedClaims:null],
  );
 },
 async ensureUsage(input:{workspace_id:string;period:string;allowance:number|null}):Promise<void> {
  await getPool().query("INSERT INTO workspace_usage(workspace_id,period,allowance) VALUES($1,$2,$3) ON CONFLICT(workspace_id,period) DO NOTHING",[input.workspace_id,input.period,input.allowance]);
 },
 async hasClaimEvent(jobId:string):Promise<boolean> {return Boolean((await getPool().query("SELECT id FROM audit_events WHERE event='workspace.claimed' AND entity_id=$1 LIMIT 1",[jobId])).rows.length);},
 auditEvent: recordClaimAuditEvent,
};
export type ClaimCompletionStore = typeof claimCompletionStore;
