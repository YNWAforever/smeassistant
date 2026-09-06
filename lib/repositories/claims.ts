import "server-only";
import { getPool } from "../db/client";
import { withTransaction } from "../db/transaction";
import { slugify, uniqueWorkspaceSlug, uniqueLocationSlug } from "../workspace/slug";

export interface ClaimJob {
 id:string; workspace_id:string|null; share_slug:string; business_name:string;
 industry:string|null; district:string|null; region:string; place_id:string|null;
 ig_handle:string|null; website_url:string|null; input_snapshot:Record<string,unknown>|null;
 module_results:Record<string,unknown>|null; status:string;
}
export interface OwnerWorkspaceInput {ownerUserId:string;ownerEmail:string;businessName:string|null;industry:string|null;district:string|null;market:string|null}
export interface GoogleConnectionInput {workspaceId:string;accountRef?:string|null;accessTokenEncrypted:string;refreshTokenEncrypted:string;scopes:string[];expiresAt:string|null}

/** App-owned claim stores. Provider calls and identity verification stay outside. */
export const claimsRepository = {
 async jobBySlug(slug:string):Promise<ClaimJob|null> {
  return (await getPool().query<ClaimJob>("SELECT id,workspace_id,share_slug,business_name,industry,district,region,place_id,ig_handle,website_url,input_snapshot,module_results,status FROM audit_jobs WHERE share_slug=$1",[slug])).rows[0]??null;
 },
 async hasActiveGoogleConnection(workspaceId:string):Promise<boolean> {
  return Boolean((await getPool().query("SELECT id FROM oauth_connections WHERE workspace_id=$1 AND provider='google_gbp' AND status='active' LIMIT 1",[workspaceId])).rows.length);
 },
 async jobById(id:string):Promise<ClaimJob|null> {
  return (await getPool().query<ClaimJob>("SELECT id,workspace_id,share_slug,business_name,industry,district,region,place_id,ig_handle,website_url,input_snapshot,module_results,status FROM audit_jobs WHERE id=$1",[id])).rows[0]??null;
 },
 async recordMerchantClaimEvent(input:{job_id:string;workspace_id:string;matched_location_id:string;claimed_by_user_id:string}):Promise<void> {
  try {await getPool().query("INSERT INTO workspace_claim_events(job_id,workspace_id,matched_location_id,claimed_by_user_id) VALUES($1,$2,$3,$4)",[input.job_id,input.workspace_id,input.matched_location_id,input.claimed_by_user_id]);}
  catch {console.error("[workspace/claim] claim event not recorded",{category:"claim_event_failed"});}
 },
 async createWorkspaceWithOwner(input:OwnerWorkspaceInput):Promise<{id:string;slug:string}> {
  return withTransaction(async db => {
   const base=slugify(input.businessName??"workspace");
   // Serialize the slug namespace; the persisted unique index is the final guard.
   await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`workspace-slug:${base}`]);
   const slug=await uniqueWorkspaceSlug(db,base);
   const row=(await db.query<{id:string;slug:string}>("INSERT INTO workspaces(business_name,industry,district,market,slug) VALUES($1,$2,$3,$4,$5) RETURNING id,slug",[input.businessName,input.industry,input.district,input.market==="tw"?"tw":"hk",slug])).rows[0];
   await db.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,$3,'owner',now())",[row.id,input.ownerUserId,input.ownerEmail]);
   return row;
  });
 },
 async attachJob(jobId:string,workspaceId:string):Promise<boolean> {
  return Boolean((await getPool().query("UPDATE audit_jobs SET workspace_id=$2 WHERE id=$1 AND workspace_id IS NULL RETURNING id",[jobId,workspaceId])).rows.length);
 },
 async firstLeadEmail(jobId:string):Promise<string|null> {
  return (await getPool().query<{email:string}>("SELECT email FROM leads WHERE job_id=$1 AND email IS NOT NULL ORDER BY created_at,id LIMIT 1",[jobId])).rows[0]?.email??null;
 },
 async isLeadRecipient(slug:string,email:string):Promise<boolean> {
  return Boolean((await getPool().query("SELECT l.id FROM leads l JOIN audit_jobs j ON j.id=l.job_id WHERE j.share_slug=$1 AND l.email=$2 LIMIT 1",[slug,email])).rows.length);
 },
 async recordAccessRequest(jobId:string,userId:string):Promise<void> {
  await getPool().query("INSERT INTO workspace_access_requests(job_id,user_id) VALUES($1,$2) ON CONFLICT (job_id,user_id) WHERE resolved_at IS NULL DO NOTHING",[jobId,userId]);
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
 async primaryLocation(workspaceId:string):Promise<{id:string}|null> {
  return (await getPool().query<{id:string}>("SELECT id FROM locations WHERE workspace_id=$1 AND is_primary=true",[workspaceId])).rows[0]??null;
 },
 async updateLocation(id:string,fields:LocationFields):Promise<void> {
  await getPool().query("UPDATE locations SET name=$2,address=$3,district=$4,place_id=$5,ig_handle=$6,website_url=$7 WHERE id=$1",[id,fields.name,fields.address,fields.district,fields.place_id,fields.ig_handle,fields.website_url]);
 },
 async insertLocation(fields:LocationFields & {workspace_id:string;slug:string;is_primary:true}):Promise<{id:string}> {
  return (await getPool().query<{id:string}>("INSERT INTO locations(workspace_id,slug,is_primary,name,address,district,place_id,ig_handle,website_url) VALUES($1,$2,true,$3,$4,$5,$6,$7,$8) RETURNING id",[fields.workspace_id,fields.slug,fields.name,fields.address,fields.district,fields.place_id,fields.ig_handle,fields.website_url])).rows[0];
 },
 async attachLocation(jobId:string,locationId:string):Promise<void> {await getPool().query("UPDATE audit_jobs SET location_id=$2 WHERE id=$1",[jobId,locationId]);},
 async ensureBrand(workspaceId:string):Promise<void> {await getPool().query("INSERT INTO brand_profiles(workspace_id) VALUES($1) ON CONFLICT(workspace_id) DO NOTHING",[workspaceId]);},
 async ensureUsage(input:{workspace_id:string;period:string;allowance:number|null}):Promise<void> {
  await getPool().query("INSERT INTO workspace_usage(workspace_id,period,allowance) VALUES($1,$2,$3) ON CONFLICT(workspace_id,period) DO NOTHING",[input.workspace_id,input.period,input.allowance]);
 },
 async hasClaimEvent(jobId:string):Promise<boolean> {return Boolean((await getPool().query("SELECT id FROM audit_events WHERE event='workspace.claimed' AND entity_id=$1 LIMIT 1",[jobId])).rows.length);},
 auditEvent: recordClaimAuditEvent,
};
export type ClaimCompletionStore = typeof claimCompletionStore;
