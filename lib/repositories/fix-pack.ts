import 'server-only';
import type { Pool } from 'pg';
import { getPool } from '../db/client';
export interface FixPackDraft {
 id:string; job_id:string; finding_key:string; agent_key:string; status:string;
 output:Record<string,unknown>|null; created_at:string;
 audit_jobs:{workspace_id:string;business_name:string|null};
}
export interface FixPackRepository {
 list(workspaceId:string):Promise<FixPackDraft[]>;
 scope(runId:string):Promise<{workspaceId:string;locationId:string|null}|null>;
 review(runId:string,workspaceId:string,locationId:string|null,status:string,actor:string):Promise<boolean>;
}
const OWNED_LOCATION = '(j.location_id IS NULL OR EXISTS(SELECT 1 FROM locations l WHERE l.id=j.location_id AND l.workspace_id=j.workspace_id))';
export function fixPackRepository(client?:Pick<Pool,'query'>):FixPackRepository {
 const db=()=>client??getPool();
 return {
  async list(workspaceId) {
   return (await db().query<FixPackDraft>(`SELECT r.id,r.job_id,r.finding_key,r.agent_key,r.status,r.output,r.created_at::text,
    jsonb_build_object('workspace_id',j.workspace_id,'business_name',j.business_name) AS audit_jobs
    FROM agent_runs r JOIN audit_jobs j ON j.id=r.job_id WHERE j.workspace_id=$1 AND ${OWNED_LOCATION}
    AND r.status IN ('draft','approved') ORDER BY r.created_at DESC,r.id DESC LIMIT 50`,[workspaceId])).rows;
  },
  async scope(runId) {
   return (await db().query<{workspaceId:string;locationId:string|null}>(`SELECT j.workspace_id AS "workspaceId",j.location_id AS "locationId"
    FROM agent_runs r JOIN audit_jobs j ON j.id=r.job_id WHERE r.id=$1 AND j.workspace_id IS NOT NULL AND ${OWNED_LOCATION}`,[runId])).rows[0]??null;
  },
  async review(runId,workspaceId,locationId,status,actor) {
   const result=await db().query(`UPDATE agent_runs r SET status=$4,reviewed_by=$5,reviewed_at=now()
    FROM audit_jobs j WHERE r.id=$1 AND r.job_id=j.id AND j.workspace_id=$2
    AND j.location_id IS NOT DISTINCT FROM $3::uuid AND ${OWNED_LOCATION} AND r.status='draft'
    AND $4 IN ('approved','rejected') RETURNING r.id`,[runId,workspaceId,locationId,status,actor]);
   return result.rows.length>0;
  },
 };
}
