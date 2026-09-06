import 'server-only';
import type { Pool } from 'pg';
import { getPool } from '../db/client';
import { completionId } from '../workspace/completion-id';
import { rowToSnapshot, type SnapshotRecord, type ScanDiffRow } from '../workspace/snapshots';
import type { MeasurableActionRow, ExportedVersionRow, MeasurementInsert, MeasurementFactType } from '../workspace/measurements';
import { snapshotRepository } from './snapshots';
export interface MeasurementRepository {
 base(head: SnapshotRecord, diff: ScanDiffRow): Promise<SnapshotRecord | null>;
 headJob(head: SnapshotRecord): Promise<{created_at:string} | null>;
 actions(head: SnapshotRecord, states: string[]): Promise<MeasurableActionRow[]>;
 existing(head: SnapshotRecord, ids: string[]): Promise<Array<{action_id:string;fact_type:MeasurementFactType}>>;
 exports(head: SnapshotRecord, ids: string[]): Promise<ExportedVersionRow[]>;
 insert(rows: MeasurementInsert[], head: SnapshotRecord): Promise<number>;
 latest(head: SnapshotRecord): Promise<{id:string} | null>;
 updateState(head: SnapshotRecord, ids: string[], state: 'measured' | 'insufficient_coverage', now: string): Promise<void>;
}
export function measurementRepository(client?: Pick<Pool,'query'>): MeasurementRepository {
 const db=()=>client ?? getPool();
 return {
  async base(head,diff) {
   const valid=await db().query(`SELECT b.id FROM scan_snapshots h
    JOIN scan_diffs d ON d.id=h.diff_id AND d.head_job_id=h.job_id AND d.comparable
    JOIN scan_snapshots b ON b.id=h.comparable_to AND b.job_id=d.base_job_id
    JOIN audit_jobs hj ON hj.id=h.job_id AND hj.workspace_id=h.workspace_id AND hj.location_id IS NOT DISTINCT FROM h.location_id
    JOIN audit_jobs bj ON bj.id=b.job_id AND bj.workspace_id=h.workspace_id AND bj.location_id IS NOT DISTINCT FROM h.location_id
    WHERE h.id=$1 AND b.id=$2 AND h.workspace_id=$3 AND b.workspace_id=$3
    AND h.location_id IS NOT DISTINCT FROM $4::uuid AND b.location_id IS NOT DISTINCT FROM $4::uuid
    AND h.job_id=$5 AND d.id=$6 AND d.base_job_id=$7 AND d.head_job_id=$5`,
   [head.id,head.comparableTo,head.workspaceId,head.locationId,head.jobId,diff.id,diff.base_job_id]);
   if(!valid.rows[0]) return null;
   const row=await snapshotRepository(db()).byId(valid.rows[0].id); return row ? rowToSnapshot(row) : null;
  },
  async headJob(head) { return (await db().query<{created_at:string}>('SELECT created_at::text FROM audit_jobs WHERE id=$1 AND workspace_id=$2 AND location_id IS NOT DISTINCT FROM $3::uuid',[head.jobId,head.workspaceId,head.locationId])).rows[0] ?? null; },
  async actions(head,states) { return (await db().query<MeasurableActionRow>('SELECT id,template_key,location_id FROM actions WHERE workspace_id=$1 AND (location_id=$2 OR location_id IS NULL) AND action_state=ANY($3::text[])',[head.workspaceId,head.locationId,states])).rows; },
  async existing(head,ids) { return (await db().query<{action_id:string;fact_type:MeasurementFactType}>(`SELECT m.action_id,m.fact_type FROM action_measurements m JOIN actions a ON a.id=m.action_id AND a.workspace_id=m.workspace_id
    WHERE m.workspace_id=$1 AND m.after_snapshot_id=$2 AND m.action_id=ANY($3::uuid[]) AND (a.location_id=$4 OR a.location_id IS NULL)`,[head.workspaceId,head.id,ids,head.locationId])).rows; },
  async exports(head,ids) { return (await db().query<ExportedVersionRow>(`SELECT v.action_id,v.first_exported_at::text FROM output_versions v JOIN actions a ON a.id=v.action_id AND a.workspace_id=v.workspace_id
    WHERE v.workspace_id=$1 AND v.action_id=ANY($2::uuid[]) AND v.first_exported_at IS NOT NULL AND (a.location_id=$3 OR a.location_id IS NULL)`,[head.workspaceId,ids,head.locationId])).rows; },
  async insert(rows,head) {
   let count=0;
   for(const row of rows) {
    const result=await db().query(`INSERT INTO action_measurements(id,workspace_id,action_id,before_snapshot_id,after_snapshot_id,metric_key,before_value,after_value,delta,fact_type,window_days)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
      WHERE EXISTS(SELECT 1 FROM actions a JOIN scan_snapshots h ON h.id=$5 AND h.workspace_id=a.workspace_id
       JOIN scan_snapshots b ON b.id=$4 AND b.workspace_id=h.workspace_id AND b.location_id IS NOT DISTINCT FROM h.location_id
       JOIN scan_diffs d ON d.id=h.diff_id AND d.head_job_id=h.job_id AND d.base_job_id=b.job_id AND d.comparable
       JOIN audit_jobs hj ON hj.id=h.job_id AND hj.workspace_id=h.workspace_id AND hj.location_id IS NOT DISTINCT FROM h.location_id
       JOIN audit_jobs bj ON bj.id=b.job_id AND bj.workspace_id=h.workspace_id AND bj.location_id IS NOT DISTINCT FROM h.location_id
       WHERE a.id=$3 AND a.workspace_id=$2 AND h.comparable_to=b.id AND h.job_id=$12 AND h.location_id IS NOT DISTINCT FROM $13::uuid AND (a.location_id=h.location_id OR a.location_id IS NULL))
      ON CONFLICT(id) DO NOTHING RETURNING id`,[completionId('measurement',row.action_id,head.id),row.workspace_id,row.action_id,row.before_snapshot_id,row.after_snapshot_id,row.metric_key,row.before_value,row.after_value,row.delta,row.fact_type,row.window_days,head.jobId,head.locationId]);
    count+=result.rows.length;
   }
   return count;
  },
  async latest(head) { return (await db().query<{id:string}>('SELECT id FROM scan_snapshots WHERE workspace_id=$1 AND location_id IS NOT DISTINCT FROM $2::uuid ORDER BY observed_at DESC,created_at DESC,id DESC LIMIT 1',[head.workspaceId,head.locationId])).rows[0] ?? null; },
  async updateState(head,ids,state,now) {
   await db().query(`UPDATE actions a SET measurement_state=$4,updated_at=$5
    WHERE a.workspace_id=$1 AND a.id=ANY($3::uuid[]) AND (a.location_id=$2 OR a.location_id IS NULL)
    AND EXISTS(SELECT 1 FROM scan_snapshots h WHERE h.id=$6 AND h.workspace_id=$1 AND h.location_id IS NOT DISTINCT FROM $2::uuid
     AND NOT EXISTS(SELECT 1 FROM scan_snapshots newer WHERE newer.workspace_id=h.workspace_id AND newer.location_id IS NOT DISTINCT FROM h.location_id
      AND (newer.observed_at,newer.created_at,newer.id)>(h.observed_at,h.created_at,h.id)))`,[head.workspaceId,head.locationId,ids,state,now,head.id]);
  },
 };
}
