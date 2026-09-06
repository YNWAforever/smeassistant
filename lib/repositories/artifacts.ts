import 'server-only';
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { getPool } from '../db/client';
import { workflowRepository, type CreateOutputVersionInput } from './workflow';
import type { ActionScope, VersionScope } from '../workspace/versions';

type Executor = Pick<Pool | PoolClient, 'query'>;
const EXPECTED_ERRORS = new Set(['version_conflict','not_approved','allowance_exceeded','version_closed','version_not_found','invalid_decision','invalid_mode','artifact_scope_mismatch']);
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
    WHERE a.id=$1 AND (a.location_id IS NULL OR EXISTS(SELECT 1 FROM locations l WHERE l.id=a.location_id AND l.workspace_id=a.workspace_id))
    AND (a.source_snapshot_id IS NULL OR EXISTS(SELECT 1 FROM scan_snapshots s JOIN audit_jobs j ON j.id=s.job_id
      WHERE s.id=a.source_snapshot_id AND s.workspace_id=a.workspace_id AND j.workspace_id=a.workspace_id
      AND s.location_id IS NOT DISTINCT FROM a.location_id AND j.location_id IS NOT DISTINCT FROM s.location_id))`,[actionId])).rows[0];
   return row ? {actionId:row.id,workspaceId:row.workspace_id,locationId:row.location_id} : null;
  });
 }
 async function versionScope(versionId: string): Promise<VersionScope | null> {
  return operation(async () => {
   const row=(await db().query<{id:string;action_id:string;workspace_id:string;location_id:string|null}>(`SELECT v.id,v.action_id,a.workspace_id,a.location_id FROM output_versions v
    JOIN actions a ON a.id=v.action_id AND a.workspace_id=v.workspace_id
    WHERE v.id=$1 AND (a.location_id IS NULL OR EXISTS(SELECT 1 FROM locations l WHERE l.id=a.location_id AND l.workspace_id=a.workspace_id))
    AND (v.action_run_id IS NULL OR EXISTS(SELECT 1 FROM action_runs r WHERE r.id=v.action_run_id AND r.action_id=a.id AND r.workspace_id=a.workspace_id))`,[versionId])).rows[0];
   return row ? {versionId:row.id,actionId:row.action_id,workspaceId:row.workspace_id,locationId:row.location_id} : null;
  });
 }
 async function requireVersion(versionId: string) {
  if (!await versionScope(versionId)) throw new Error('version_not_found');
 }
 return {
  actionScope,versionScope,
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
