import 'server-only';
import type { Pool } from 'pg';
import { getPool } from '../db/client';
import { withTransaction } from '../db/transaction';
import { snapshotRepository } from './snapshots';
import { loadSnapshotById, loadSnapshotForJob, type ScanDiffRow } from '../workspace/snapshots';
import { deriveActions, type FindingRow } from '../workspace/actions';
import { resolveEvidenceInputs } from '../workspace/evidence-inputs';
import { completionId } from '../workspace/completion-id';
import { WEBSITE_FAQ_TRIGGER, type TemplateKey } from '../workspace/templates';
import { OPEN_ACTION_STATES } from '../domain';

export interface DerivationResult {created:number;updated:number;completed:number;expired:number}
export interface ActionDerivationRepository {
 derive(snapshotId:string,opts?:{now?:Date;rejectStale?:boolean}):Promise<DerivationResult>;
}
/** Transaction-scoped repository. The caller owns BEGIN/COMMIT; every statement uses this executor. */
export function actionDerivationRepository(db:Pick<Pool,'query'>):ActionDerivationRepository {
 return {async derive(snapshotId,opts={}) {
  const snapshots=snapshotRepository(db);
  const snapshot=await loadSnapshotById(snapshots,snapshotId);
  if(!snapshot) throw new Error('snapshot_not_found');
  if(!snapshot.workspaceId) throw new Error('snapshot_requires_workspace');
  const ws=snapshot.workspaceId,loc=snapshot.locationId;
  const job=await snapshots.job(snapshot.jobId);
  if(!job || job.workspace_id!==ws || job.location_id!==loc) throw new Error('derivation_scope_mismatch');
  // Serializes derivation for this exact workspace/location, without a second connection.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${ws}:${loc??'all'}:derive`]);
  const latest=(await db.query<{id:string}>(`SELECT id FROM scan_snapshots WHERE workspace_id=$1 AND location_id IS NOT DISTINCT FROM $2::uuid
   ORDER BY observed_at DESC,created_at DESC,id DESC LIMIT 1`,[ws,loc])).rows[0];
  if(!latest)throw new Error('latest snapshot lookup failed');
  if(latest.id!==snapshotId) {
   if(opts.rejectStale)throw new Error('stale_snapshot');
   return {created:0,updated:0,completed:0,expired:0};
  }
  // Consume only the comparison pinned by this snapshot. Another comparison
  // for the same head may be valid yet establish a different measured outcome.
  let diff:ScanDiffRow|null=null;
  if(snapshot.diffId) {
   diff=(await db.query<ScanDiffRow>(`SELECT d.*,d.created_at::text AS created_at FROM scan_diffs d
    JOIN audit_jobs h ON h.id=d.head_job_id JOIN audit_jobs b ON b.id=d.base_job_id
    WHERE d.id=$1 AND d.head_job_id=$2 AND h.workspace_id=$3 AND b.workspace_id=$3
    AND h.location_id IS NOT DISTINCT FROM $4::uuid AND b.location_id IS NOT DISTINCT FROM $4::uuid
    AND ($5::uuid IS NULL OR (d.comparable AND EXISTS(
     SELECT 1 FROM scan_snapshots s WHERE s.id=$5 AND s.job_id=d.base_job_id
     AND s.workspace_id=$3 AND s.location_id IS NOT DISTINCT FROM $4::uuid)))`,
   [snapshot.diffId,snapshot.jobId,ws,loc,snapshot.comparableTo])).rows[0]??null;
   if(!diff)throw new Error('derivation_scope_mismatch');
   // Snapshot building can retain a diff before a base snapshot is available.
   // Keep that identity, but do not infer measured or regressed evidence from it.
   if(!snapshot.comparableTo && diff.comparable)diff={...diff,comparable:false};
  } else if(snapshot.comparableTo) {
   throw new Error('derivation_scope_mismatch');
  }
  const invalidActions=(await db.query(`SELECT a.id FROM actions a WHERE a.workspace_id=$1 AND a.location_id IS NOT DISTINCT FROM $2::uuid
   AND a.action_state=ANY($3::text[]) AND a.source_snapshot_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM scan_snapshots s JOIN audit_jobs j ON j.id=s.job_id AND j.workspace_id=s.workspace_id AND j.location_id IS NOT DISTINCT FROM s.location_id
    WHERE s.id=a.source_snapshot_id AND s.workspace_id=a.workspace_id AND s.location_id IS NOT DISTINCT FROM a.location_id) FOR UPDATE OF a`,[ws,loc,OPEN_ACTION_STATES])).rows;
  if(invalidActions.length)throw new Error('derivation_scope_mismatch');
  const findings=(await db.query<FindingRow>(`SELECT finding_key,module,severity,score_impact,owner_message_zh,owner_message_en,owner_action_zh,owner_action_en,evidence FROM audit_findings WHERE job_id=$1`,[snapshot.jobId])).rows;
  const brand=(await db.query('SELECT workspace_id FROM brand_profiles WHERE workspace_id=$1',[ws])).rows[0];
  const google=(await db.query<{status:string}>("SELECT status FROM oauth_connections WHERE workspace_id=$1 AND provider='google_gbp' ORDER BY connected_at DESC,id DESC LIMIT 1",[ws])).rows[0]??null;
  const workspace=(await db.query<{industry:string|null}>('SELECT industry FROM workspaces WHERE id=$1',[ws])).rows[0];
  const drafts=(await db.query<{template_key:TemplateKey}>(`SELECT DISTINCT a.template_key FROM output_versions v JOIN actions a ON a.id=v.action_id AND a.workspace_id=v.workspace_id
   WHERE a.workspace_id=$1 AND v.workspace_id=$1 AND a.location_id IS NOT DISTINCT FROM $2::uuid AND v.approval_state='draft' AND a.action_state=ANY($3::text[])`,[ws,loc,OPEN_ACTION_STATES])).rows;
  // The scan already collected the merchant's unanswered reviews; asking the
  // owner to retype them was the bug. `job` is the row this derivation already
  // loaded, and JOB_COLUMNS includes raw_data, so this costs no extra read.
  const resolvedInputs=resolveEvidenceInputs({rawData:job.raw_data});
  const derived=deriveActions({snapshot,findings,latestDiff:diff,brandProfileExists:Boolean(brand),googleConnection:google,industry:workspace?.industry??null,existingDrafts:new Set(drafts.map(row=>row.template_key)),resolvedInputs,now:opts.now});
  const result:DerivationResult={created:0,updated:0,completed:0,expired:0};
  const now=(opts.now??new Date()).toISOString();
  for(const action of derived) {
   const row=(await db.query<{created:boolean}>(`INSERT INTO actions(workspace_id,location_id,template_key,source,source_finding_keys,source_snapshot_id,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,required_inputs,capability,dedupe_key,action_state,measurement_state,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'not_eligible',$18)
    ON CONFLICT(dedupe_key) WHERE action_state NOT IN ('completed','dismissed','cancelled','expired') DO UPDATE SET
     source_finding_keys=EXCLUDED.source_finding_keys,source_snapshot_id=EXCLUDED.source_snapshot_id,title=EXCLUDED.title,summary=EXCLUDED.summary,evidence=EXCLUDED.evidence,
     priority=EXCLUDED.priority,priority_score=EXCLUDED.priority_score,priority_factors=EXCLUDED.priority_factors,effort_minutes=EXCLUDED.effort_minutes,
     required_inputs=EXCLUDED.required_inputs,capability=EXCLUDED.capability,updated_at=EXCLUDED.updated_at,
     -- An action that LOSES its evidence (the scan no longer retains an
     -- unanswered review) gets the input back, so it must also go back to
     -- needs_input -- otherwise the detail page, which gates its input form on
     -- action_state, shows nothing and Generate burns a model call.
     --
     -- The test is whether a required key is genuinely UNANSWERED, not whether
     -- the template declares any. The first version of this asked whether
     -- EXCLUDED.required_inputs was non-empty, which is true for almost every
     -- template on every re-derivation -- so an owner who had supplied brand
     -- voice and language watched a ready action flip back to needs_input after
     -- each scan, beside a provenance row still reading "Inputs ready". Absent,
     -- null and empty-string all count as unanswered, mirroring missingInputs
     -- in lib/workspace/overview.ts exactly: two rules for one question is what
     -- let the badge and the read model disagree. An empty required list still
     -- never downgrades, since EXISTS over an empty array is false.
     action_state=CASE WHEN actions.action_state IN ('recommended','ready')
       AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(EXCLUDED.required_inputs) AS k(key)
                   WHERE COALESCE(actions.provided_inputs->>k.key,'')='')
      THEN 'needs_input' ELSE actions.action_state END
    WHERE actions.workspace_id=EXCLUDED.workspace_id AND actions.location_id IS NOT DISTINCT FROM EXCLUDED.location_id AND actions.template_key=EXCLUDED.template_key
    RETURNING (xmax=0) AS created`,[ws,loc,action.templateKey,action.source,action.sourceFindingKeys,snapshotId,JSON.stringify(action.title),JSON.stringify(action.summary),JSON.stringify(action.evidence),action.priority,action.priorityScore,JSON.stringify(action.priorityFactors),action.effortMinutes,JSON.stringify(action.requiredInputs),action.capability,action.dedupeKey,action.requiredInputs.length?'needs_input':'recommended',now])).rows[0];
   if(!row)throw new Error('derivation_scope_mismatch');
   if(row.created)result.created++;else result.updated++;
  }
  const current=new Set(findings.filter(row=>Number(row.score_impact)<0).map(row=>row.finding_key));
  const resolved=new Set(diff?.comparable?diff.resolved_findings:[]);
  const open=(await db.query<{id:string;source_finding_keys:string[]}>(`SELECT id,source_finding_keys FROM actions WHERE workspace_id=$1 AND location_id IS NOT DISTINCT FROM $2::uuid AND source='finding' AND action_state=ANY($3::text[]) FOR UPDATE`,[ws,loc,OPEN_ACTION_STATES])).rows;
  for(const action of open) {
   const keys=action.source_finding_keys.filter(key=>key!==WEBSITE_FAQ_TRIGGER);
   if(!keys.length||keys.some(key=>current.has(key)))continue;
   const measured=keys.every(key=>resolved.has(key));
   await db.query(`UPDATE actions SET action_state=$2,updated_at=$3,measurement_state=CASE WHEN $4 THEN 'measured' ELSE measurement_state END,
    completed_at=CASE WHEN $4 THEN $3::timestamptz ELSE completed_at END WHERE id=$1`,[action.id,measured?'completed':'expired',now,measured]);
   if(measured)result.completed++;else result.expired++;
  }
  await db.query(`INSERT INTO audit_events(idempotency_key,workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload)
   VALUES($1,$2,$3,'system',NULL,'action.derived','scan_snapshot',$4,$5) ON CONFLICT(idempotency_key) DO NOTHING`,[completionId('action.derived',snapshotId),ws,loc,snapshotId,JSON.stringify({locale:null,...result})]);
  return result;
 }};
}
/** Explicit pool entrypoint; a supplied pool is never replaced with the default database. */
export async function deriveActionsForSnapshot(pool:Pick<Pool,'connect'>,snapshotId:string,opts:{now?:Date}={}):Promise<DerivationResult> {
 return withTransaction(client=>actionDerivationRepository(client).derive(snapshotId,opts),pool);
}
/** Claim hooks receive a job ID, not a snapshot ID. Resolve and validate it in the same transaction. */
export async function deriveActionsForClaim(jobId:string,workspaceId:string,locationId:string,pool:Pick<Pool,'connect'>=getPool()):Promise<void> {
 await withTransaction(async client=>{
  const snapshot=await loadSnapshotForJob(snapshotRepository(client),jobId);
  if(!snapshot)throw new Error('snapshot_not_found');
  if(snapshot.workspaceId!==workspaceId||snapshot.locationId!==locationId)throw new Error('derivation_scope_mismatch');
  await actionDerivationRepository(client).derive(snapshot.id,{rejectStale:true});
 },pool);
}
