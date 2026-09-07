import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
import type { RescanSourceJob } from "../workspace/rescan";
import type { ScheduleInsert } from "../scheduler/create-schedule";
export interface RescanRepository {
 tier(workspaceId: string): Promise<string | null>;
 latestFinishedJob(workspaceId: string, locationId: string): Promise<RescanSourceJob | null>;
 scheduleExists(placeId: string): Promise<boolean>;
 insertSchedule(row: ScheduleInsert): Promise<void>;
}
/** Authorized rescan persistence only; dispatch remains owned by scan execution. */
export function rescanRepository(client?: Pick<Pool, "query">): RescanRepository {
 const db = () => client ?? getPool();
 return {
  async tier(workspaceId) { return (await db().query<{tier:string|null}>("SELECT tier FROM workspaces WHERE id=$1",[workspaceId])).rows[0]?.tier ?? null; },
  async latestFinishedJob(workspaceId, locationId) {
   return (await db().query<RescanSourceJob>(`SELECT j.id,j.status,j.place_id,j.created_at::text,j.input_snapshot,j.workspace_id,j.location_id
    FROM audit_jobs j JOIN locations l ON l.id=j.location_id AND l.workspace_id=j.workspace_id
    WHERE j.workspace_id=$1 AND j.location_id=$2 AND j.status IN ('done','partial') ORDER BY j.created_at DESC,j.id DESC LIMIT 1`,[workspaceId,locationId])).rows[0] ?? null;
  },
  async scheduleExists(placeId) { return (await db().query("SELECT id FROM scan_schedules WHERE place_id=$1 LIMIT 1",[placeId])).rows.length>0; },
  async insertSchedule(row) {
   await db().query(`INSERT INTO scan_schedules(place_id,input_snapshot,cadence,anniversary_day,last_job_id,next_run_at,created_by,workspace_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[row.place_id,JSON.stringify(row.input_snapshot),row.cadence,row.anniversary_day,row.last_job_id,row.next_run_at,row.created_by,row.workspace_id]);
  },
 };
}
