import 'server-only';
import type { Pool } from 'pg';
import { getPool } from '../db/client';
import { completionId } from '../workspace/completion-id';
import type { ScanSnapshotRow, ScanDiffRow, SnapshotJobRow, SnapshotRecord } from '../workspace/snapshots';
export type SnapshotInsert = Omit<ScanSnapshotRow, 'id' | 'created_at'>;
export interface SnapshotRepository {
 /** Rejects a workspace-linked job whose non-null location belongs elsewhere. */
 job(id: string): Promise<SnapshotJobRow | null>;
 findings(jobId: string): Promise<Array<{ finding_key: string; evidence: Record<string, unknown> | null }>>;
 aeo(jobId: string): Promise<Array<{ surface: string; cited: boolean; rank: number | null }>>;
 forJob(jobId: string): Promise<ScanSnapshotRow | null>;
 byId(id: string): Promise<ScanSnapshotRow | null>;
 diff(jobId: string): Promise<ScanDiffRow | null>;
 save(row: SnapshotInsert): Promise<ScanSnapshotRow>;
 ensureAudit(snapshot: SnapshotRecord): Promise<void>;
}
const SNAPSHOT_COLUMNS = 'id,job_id,workspace_id,location_id,market,observed_at::text,scoring_version,overall_score,coverage,module_states,metrics,website_checks,comparable_to,diff_id,created_at::text';
const JOB_COLUMNS = 'id,workspace_id,location_id,region,status,completed_at::text,created_at::text,scoring_version,overall_score,score_coverage,module_results,module_scores,raw_data,input_snapshot,website_url';
const DIFF_COLUMNS = 'd.id,d.base_job_id,d.head_job_id,d.comparable,d.incomparable_reason,d.composite_withheld_reason,d.intersection_modules,d.composite_base,d.composite_head,d.composite_delta,d.resolved_findings,d.regressed_findings,d.decayed_findings,d.lost_coverage,d.gained_coverage,d.created_at::text';
/** Pass the completion transaction client here; never opens a second connection when supplied. */
export function snapshotRepository(client?: Pick<Pool, 'query'>): SnapshotRepository {
 const db = () => client ?? getPool();
 return {
  async job(id) {
   const row = (await db().query<SnapshotJobRow & { location_owned: boolean }>(`SELECT ${JOB_COLUMNS},
    (workspace_id IS NULL OR location_id IS NULL OR EXISTS(SELECT 1 FROM locations l WHERE l.id=audit_jobs.location_id AND l.workspace_id=audit_jobs.workspace_id)) AS location_owned
    FROM audit_jobs WHERE id=$1`, [id])).rows[0];
   if (!row) return null;
   if (!row.location_owned) throw new Error('snapshot_scope_mismatch');
   return row;
  },
  async findings(jobId) { return (await db().query('SELECT finding_key,evidence FROM audit_findings WHERE job_id=$1', [jobId])).rows; },
  async aeo(jobId) { return (await db().query('SELECT surface,cited,rank FROM aeo_surface_snapshots WHERE job_id=$1', [jobId])).rows; },
  async forJob(jobId) { return (await db().query<ScanSnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM scan_snapshots WHERE job_id=$1`, [jobId])).rows[0] ?? null; },
  async byId(id) { return (await db().query<ScanSnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM scan_snapshots WHERE id=$1`, [id])).rows[0] ?? null; },
  async diff(jobId) {
   return (await db().query<ScanDiffRow>(`SELECT ${DIFF_COLUMNS} FROM scan_diffs d
    JOIN audit_jobs h ON h.id=d.head_job_id JOIN audit_jobs b ON b.id=d.base_job_id
    WHERE d.head_job_id=$1 AND h.workspace_id IS NOT NULL AND b.workspace_id=h.workspace_id
    AND b.location_id IS NOT DISTINCT FROM h.location_id ORDER BY d.created_at DESC LIMIT 1`, [jobId])).rows[0] ?? null;
  },
  async save(row) {
   const result = await db().query<ScanSnapshotRow>(`INSERT INTO scan_snapshots(job_id,workspace_id,location_id,market,observed_at,scoring_version,overall_score,coverage,module_states,metrics,website_checks,comparable_to,diff_id)
    SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
    WHERE EXISTS(SELECT 1 FROM audit_jobs WHERE id=$1 AND workspace_id=$2 AND location_id IS NOT DISTINCT FROM $3::uuid)
    AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM locations WHERE id=$3 AND workspace_id=$2))
    AND ($12::uuid IS NULL OR EXISTS(SELECT 1 FROM scan_snapshots b JOIN scan_diffs d ON d.id=$13 AND d.base_job_id=b.job_id AND d.head_job_id=$1 AND d.comparable JOIN audit_jobs j ON j.id=b.job_id AND j.workspace_id=$2 AND j.location_id IS NOT DISTINCT FROM $3::uuid WHERE b.id=$12 AND b.workspace_id=$2 AND b.location_id IS NOT DISTINCT FROM $3::uuid))
    AND ($13::uuid IS NULL OR EXISTS(SELECT 1 FROM scan_diffs d JOIN audit_jobs b ON b.id=d.base_job_id WHERE d.id=$13 AND d.head_job_id=$1 AND b.workspace_id=$2 AND b.location_id IS NOT DISTINCT FROM $3::uuid))
    ON CONFLICT(job_id) DO UPDATE SET market=EXCLUDED.market,observed_at=EXCLUDED.observed_at,scoring_version=EXCLUDED.scoring_version,overall_score=EXCLUDED.overall_score,coverage=EXCLUDED.coverage,module_states=EXCLUDED.module_states,metrics=EXCLUDED.metrics,website_checks=EXCLUDED.website_checks,comparable_to=EXCLUDED.comparable_to,diff_id=EXCLUDED.diff_id
    WHERE scan_snapshots.workspace_id=EXCLUDED.workspace_id AND scan_snapshots.location_id IS NOT DISTINCT FROM EXCLUDED.location_id
    RETURNING ${SNAPSHOT_COLUMNS}`,
   [row.job_id,row.workspace_id,row.location_id,row.market,row.observed_at,row.scoring_version,row.overall_score,row.coverage,JSON.stringify(row.module_states),JSON.stringify(row.metrics),row.website_checks == null ? null : JSON.stringify(row.website_checks),row.comparable_to,row.diff_id]);
   if (!result.rows[0]) throw new Error('snapshot_scope_mismatch');
   return result.rows[0];
  },
  async ensureAudit(snapshot) {
   await db().query(`INSERT INTO audit_events(idempotency_key,workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload)
    SELECT $1,$2,$3,'scanner',NULL,'snapshot.created','scan_snapshot',$4,$5
    WHERE NOT EXISTS(SELECT 1 FROM audit_events WHERE event='snapshot.created' AND entity_id=$4 AND workspace_id=$2)
    ON CONFLICT(idempotency_key) DO NOTHING`,
   [completionId('snapshot.created',snapshot.id),snapshot.workspaceId,snapshot.locationId,snapshot.id,JSON.stringify({ locale:null,coverage:snapshot.coverage,overall_score:snapshot.overallScore,job_id:snapshot.jobId })]);
  },
 };
}
