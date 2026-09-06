import 'server-only';
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { getPool } from '../db/client';
import { workflowRepository, type CreateOutputVersionInput } from './workflow';
import { workspaceReadRepository, SNAPSHOT_COLUMNS, DIFF_COLUMNS } from './workspace-read';
import { rowToSnapshot, type ScanSnapshotRow, type ScanDiffRow } from '../workspace/snapshots';
import type { ActionState } from '../domain';
import type { ActionScope, VersionScope } from '../workspace/versions';

type Executor = Pick<Pool | PoolClient, 'query'>;
const EXPECTED_ERRORS = new Set(['version_conflict','not_approved','allowance_exceeded','version_closed','version_not_found','invalid_decision','invalid_mode','artifact_scope_mismatch']);
// Fixed SQL fragment for the actions alias `a`, shared by both scope entry points.
// A workspace-wide action can use location evidence; callers must separately
// authorize the evidence's persisted location before drafting.
const ACTION_SCOPE_PREDICATE = `(a.location_id IS NULL OR EXISTS(SELECT 1 FROM locations l WHERE l.id=a.location_id AND l.workspace_id=a.workspace_id))
 AND (a.source_snapshot_id IS NULL OR EXISTS(SELECT 1 FROM scan_snapshots s JOIN audit_jobs j ON j.id=s.job_id
  WHERE s.id=a.source_snapshot_id AND s.workspace_id=a.workspace_id AND j.workspace_id=a.workspace_id
  AND (a.location_id IS NULL OR s.location_id=a.location_id)
  AND j.location_id IS NOT DISTINCT FROM s.location_id
  AND (s.location_id IS NULL OR EXISTS(SELECT 1 FROM locations evidence_location WHERE evidence_location.id=s.location_id AND evidence_location.workspace_id=a.workspace_id))))`;
/** Preserve domain failures without exposing driver messages, SQL or connection details. */
async function operation<T>(run: () => Promise<T>): Promise<T> {
 try { return await run(); }
 catch (error) {
  if (error instanceof Error && EXPECTED_ERRORS.has(error.message)) throw new Error(error.message);
  throw new Error('artifact_operation_failed');
 }
}

/**
 * Artifact persistence uses the original atomic SQL operations. A supplied
 * transaction client is used for every scope check and workflow call.
 * Membership authority remains the caller's responsibility; these checks reject
 * inconsistent persisted parent/child references before returning scope or writing.
 */
export function artifactRepository(client?: Executor) {
 const db = () => client ?? getPool();
 async function actionScope(actionId: string): Promise<ActionScope | null> {
  return operation(async () => {
   const row=(await db().query<{id:string;workspace_id:string;location_id:string|null}>(`SELECT a.id,a.workspace_id,a.location_id FROM actions a
    WHERE a.id=$1 AND ${ACTION_SCOPE_PREDICATE}`,[actionId])).rows[0];
   return row ? {actionId:row.id,workspaceId:row.workspace_id,locationId:row.location_id} : null;
  });
 }
 async function versionScope(versionId: string): Promise<VersionScope | null> {
  return operation(async () => {
   const row=(await db().query<{id:string;action_id:string;workspace_id:string;location_id:string|null}>(`SELECT v.id,v.action_id,a.workspace_id,a.location_id FROM output_versions v
    JOIN actions a ON a.id=v.action_id AND a.workspace_id=v.workspace_id
    WHERE v.id=$1 AND ${ACTION_SCOPE_PREDICATE}
    AND (v.action_run_id IS NULL OR EXISTS(SELECT 1 FROM action_runs r WHERE r.id=v.action_run_id AND r.action_id=a.id AND r.workspace_id=a.workspace_id))`,[versionId])).rows[0];
   return row ? {versionId:row.id,actionId:row.action_id,workspaceId:row.workspace_id,locationId:row.location_id} : null;
  });
 }
 async function requireVersion(versionId: string) {
  if (!await versionScope(versionId)) throw new Error('version_not_found');
 }
 async function assistantSnapshot(workspaceId: string, snapshotId: string | null, locationId: string | null) {
  return operation(async () => {
   const row=(await db().query<ScanSnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM scan_snapshots s
    WHERE workspace_id=$1 AND ($2::uuid IS NULL OR id=$2) AND ($3::uuid IS NULL OR location_id=$3)
    AND EXISTS(SELECT 1 FROM audit_jobs j WHERE j.id=s.job_id AND j.workspace_id=s.workspace_id AND j.location_id IS NOT DISTINCT FROM s.location_id)
    AND (location_id IS NULL OR EXISTS(SELECT 1 FROM locations l WHERE l.id=s.location_id AND l.workspace_id=s.workspace_id))
    ORDER BY observed_at DESC,created_at DESC,id DESC LIMIT 1`,[workspaceId,snapshotId,locationId])).rows[0];
   return row ? rowToSnapshot(row) : null;
  });
 }
 return {
  actionScope,versionScope,
  async assistantWorkspace(workspaceId: string) { return (await workspaceReadRepository(client).workspaces([workspaceId]))[0] ?? null; },
  assistantLocations(workspaceId: string) { return workspaceReadRepository(client).locations([workspaceId]); },
  assistantActions(workspaceId: string, opts: {locationId?: string|null;states?: ActionState[];ids?:string[]} = {}) { return workspaceReadRepository(client).actions(workspaceId,opts); },
  assistantSnapshot(workspaceId: string, snapshotId: string) { return assistantSnapshot(workspaceId,snapshotId,null); },
  assistantLatestSnapshot(workspaceId: string, locationId: string|null) { return assistantSnapshot(workspaceId,null,locationId); },
  async assistantDiff(id: string|null, workspaceId: string, headJobId: string|null) {
   return operation(async () => {
   if(!id || !headJobId) return null;
   // A snapshot pins one comparison; another base may have a newer diff for this head.
   const row=(await db().query<ScanDiffRow>(`SELECT ${DIFF_COLUMNS} FROM scan_diffs d
    WHERE id=$1 AND head_job_id=$3
    AND EXISTS(SELECT 1 FROM audit_jobs h JOIN audit_jobs b ON b.id=d.base_job_id
      AND b.workspace_id=h.workspace_id AND b.location_id IS NOT DISTINCT FROM h.location_id
      WHERE h.id=d.head_job_id AND h.workspace_id=$2
      AND (h.location_id IS NULL OR EXISTS(SELECT 1 FROM locations l WHERE l.id=h.location_id AND l.workspace_id=h.workspace_id)))`,[id,workspaceId,headJobId])).rows[0];
   return row ?? null;
   });
  },
  assistantBrand(workspaceId: string) {
   return operation(async ()=>(await db().query<{voice:string|null;approved_claims:unknown;prohibited_terms:unknown;languages:unknown;facts:unknown}>('SELECT voice,approved_claims,prohibited_terms,languages,facts FROM brand_profiles WHERE workspace_id=$1',[workspaceId])).rows[0] ?? null);
  },
  assistantReviewData(workspaceId: string, jobId: string) {
   return operation(async ()=>(await db().query<{raw_data:unknown}>(`SELECT raw_data FROM audit_jobs j WHERE id=$1 AND workspace_id=$2
    AND (location_id IS NULL OR EXISTS(SELECT 1 FROM locations l WHERE l.id=j.location_id AND l.workspace_id=j.workspace_id))`,[jobId,workspaceId])).rows[0]?.raw_data ?? null);
  },
  createOutputVersion(input: CreateOutputVersionInput) {
   return operation(async () => {
    const scope=await actionScope(input.actionId);
    if (!scope) throw new Error('artifact_scope_mismatch');
    if (input.baseVersionId) {
     const base=(await db().query<{action_id:string}>('SELECT action_id FROM output_versions WHERE id=$1',[input.baseVersionId])).rows[0];
     // Missing/foreign-action/stale bases keep the atomic function's conflict result.
     if (base?.action_id === input.actionId && !await versionScope(input.baseVersionId)) throw new Error('artifact_scope_mismatch');
    }
    if(input.actionRunId) {
     const run=await db().query('SELECT id FROM action_runs WHERE id=$1 AND action_id=$2 AND workspace_id=$3',[input.actionRunId,input.actionId,scope.workspaceId]);
     if(!run.rows.length) throw new Error('artifact_scope_mismatch');
    }
    return workflowRepository(db()).createOutputVersion(input);
   });
  },
  approveOutputVersion(versionId: string, actor: string, comment: string | null) {
   return operation(async () => { await requireVersion(versionId); return workflowRepository(db()).approveOutputVersion(versionId,actor,comment); });
  },
  decideOutputVersion(versionId: string, actor: string, decision: string, comment: string | null) {
   return operation(async () => { await requireVersion(versionId); return workflowRepository(db()).decideOutputVersion(versionId,actor,decision,comment); });
  },
  exportOutputVersion(versionId: string, actor: string, mode: string, clientKey: string) {
   return operation(async () => {
    await requireVersion(versionId);
    // The SQL idempotency lookup is global and precedes its target lookup.
    // Bind the untrusted retry token to the authorized target and delivery mode.
    const key=createHash('sha256').update(JSON.stringify(['artifact-export',versionId,mode,clientKey])).digest('hex');
    return workflowRepository(db()).exportOutputVersion(versionId,actor,mode,key);
   });
  },
 };
}
export type ArtifactRepository = ReturnType<typeof artifactRepository>;

/** Live drafting has a read-only repository capability; saving is an explicit separate action. */
export type LiveAssistantRepository = Pick<ArtifactRepository,'actionScope'|'assistantWorkspace'|'assistantLocations'|'assistantActions'|'assistantSnapshot'|'assistantLatestSnapshot'|'assistantDiff'|'assistantBrand'|'assistantReviewData'|'versionScope'>;
