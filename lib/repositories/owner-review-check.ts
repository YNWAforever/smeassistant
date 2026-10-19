import "server-only";
import type { Pool } from "pg";
import { getPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { ownerCheckHistory, OWNER_REVIEW_CHECK_EVENT, type OwnerCheckCommand, type OwnerCheckContext, type OwnerCheckRecord } from "@/lib/workspace/owner-review-check";
import type { AuditEventRow } from "@/lib/workspace/queries-pages";

type Scope = { workspaceId: string; actionId: string; locationId: string | null };
type Input = Scope & { actorId: string; locale: string; ipHash: string | null; command: OwnerCheckCommand };
type Result = { ok: true; record: OwnerCheckRecord; duplicate: boolean } | { ok: false; error: string };
const columns = `id,workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload,
  to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;
const predicate = `workspace_id=$1 AND entity_type='action' AND entity_id=$2
  AND location_id IS NOT DISTINCT FROM $3::uuid AND event=$4`;

/** Existing append-only audit is the record. No new schema, usage, versions or application mutation. */
export function ownerReviewCheckRepository(client?: Pool) {
  const db = () => client ?? getPool();
  return {
    async load(scope: Scope): Promise<OwnerCheckContext> {
      const values = [scope.workspaceId, scope.actionId, scope.locationId, OWNER_REVIEW_CHECK_EVENT];
      const [history, heads, applied] = await Promise.all([
        db().query<AuditEventRow>(`SELECT ${columns} FROM audit_events WHERE ${predicate}
          ORDER BY created_at DESC,id DESC LIMIT 100`, values),
        // Scope before LIMIT and retain each version's head even if newer
        // versions have filled the recent-history window.
        db().query<AuditEventRow>(`SELECT DISTINCT ON (payload#>>'{owner_check,versionId}') ${columns}
          FROM audit_events WHERE ${predicate}
          ORDER BY payload#>>'{owner_check,versionId}',created_at DESC,id DESC`, values),
        db().query<{ output_version_id: string }>(`SELECT p.output_version_id FROM action_applications p
          JOIN actions a ON a.id=p.action_id AND a.workspace_id=p.workspace_id
          WHERE p.workspace_id=$1 AND p.action_id=$2 AND a.location_id IS NOT DISTINCT FROM $3::uuid
           AND p.source='owner_asserted' AND p.retracted_at IS NULL AND p.output_version_id IS NOT NULL`,
        [scope.workspaceId, scope.actionId, scope.locationId]),
      ]);
      const rows = [...new Map([...history.rows, ...heads.rows].map(row => [row.id, row])).values()];
      return { records: ownerCheckHistory(rows, scope), appliedVersionIds: applied.rows.map(r => r.output_version_id) };
    },
    async record(input: Input): Promise<Result> {
      return withTransaction(async conn => {
        const { workspaceId, actionId, locationId, command } = input;
        // The same action lock fences a concurrent draft insert/claim withdrawal.
        // No network, Auth provider, file or model request runs inside this transaction.
        const action = (await conn.query(`SELECT id,workspace_id,location_id,template_key,action_state FROM actions
          WHERE workspace_id=$1 AND id=$2 FOR UPDATE`, [workspaceId, actionId])).rows[0];
        if (!action || action.workspace_id !== workspaceId || action.location_id !== locationId) return { ok: false, error: "not_found" };
        if (action.template_key !== "review-response") return { ok: false, error: "unsupported_action" };

        const duplicate = (await conn.query<AuditEventRow>(`SELECT ${columns} FROM audit_events
          WHERE workspace_id=$1 AND entity_type='action' AND entity_id=$2
           AND location_id IS NOT DISTINCT FROM $3::uuid AND actor_id=$4
           AND payload#>>'{owner_check,requestId}'=$5 AND event=$6 LIMIT 1`,
        [workspaceId, actionId, locationId, input.actorId, command.requestId, OWNER_REVIEW_CHECK_EVENT])).rows[0];
        if (duplicate) {
          const stored = duplicate.payload?.owner_check as Record<string, unknown> | undefined;
          if (!stored || Object.entries(command).some(([key, value]) => stored[key] !== value)) return { ok: false, error: "idempotency_conflict" };
          const record = ownerCheckHistory([duplicate], input)[0];
          if (!record) throw new Error("invalid_owner_check_receipt");
          return { ok: true, record, duplicate: true };
        }
        const latest = (await conn.query(`SELECT id FROM output_versions WHERE workspace_id=$1 AND action_id=$2 ORDER BY version_no DESC LIMIT 1`, [workspaceId, actionId])).rows[0];
        if (latest?.id !== command.latestVersionId) return { ok: false, error: "stale_version" };
        const version = (await conn.query(`SELECT id FROM output_versions WHERE workspace_id=$1 AND action_id=$2 AND id=$3`, [workspaceId, actionId, command.versionId])).rows[0];
        if (!version) return { ok: false, error: "stale_version" };
        const previous = (await conn.query(`SELECT id FROM audit_events WHERE ${predicate}
          AND payload#>>'{owner_check,versionId}'=$5 ORDER BY created_at DESC,id DESC LIMIT 1`,
        [workspaceId, actionId, locationId, OWNER_REVIEW_CHECK_EVENT, command.versionId])).rows[0];
        if ((previous ? String(previous.id) : null) !== command.expectedRecordId) return { ok: false, error: "stale_check" };
        const applied = (await conn.query(`SELECT output_version_id FROM action_applications
          WHERE workspace_id=$1 AND action_id=$2 AND output_version_id=$3
           AND source='owner_asserted' AND retracted_at IS NULL LIMIT 1`, [workspaceId, actionId, command.versionId])).rows[0];
        // Withdrawing a historical check never reinstates the application or
        // completion. It must remain possible after that claim was withdrawn.
        if (command.decision !== "retracted" && (!applied || action.action_state !== "completed")) return { ok: false, error: "not_applied" };
        let evidenceLabel: string | null = null;
        if (command.evidenceAssetId) {
          const asset = (await conn.query(`SELECT filename FROM assets WHERE workspace_id=$1 AND id=$2
            AND kind='image' AND rights_status='approved'
            AND (location_id IS NULL OR location_id=$3::uuid)
            AND (location_id IS NULL OR EXISTS(SELECT 1 FROM locations l WHERE l.id=assets.location_id AND l.workspace_id=assets.workspace_id))`,
          [workspaceId, command.evidenceAssetId, locationId])).rows[0];
          if (!asset) return { ok: false, error: "invalid_evidence" };
          evidenceLabel = asset.filename;
        }
        const payload = { locale: input.locale, output_version_id: command.versionId, ...(input.ipHash ? { ip_hash: input.ipHash } : {}),
          owner_check: { ...command, evidenceLabel } };
        const row = (await conn.query<AuditEventRow>(`INSERT INTO audit_events
          (workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload,created_at)
          VALUES($1,$2,'user',$3,$4,'action',$5,$6::jsonb,clock_timestamp()) RETURNING ${columns}`,
        [workspaceId, locationId, input.actorId, OWNER_REVIEW_CHECK_EVENT, actionId, JSON.stringify(payload)])).rows[0];
        const record = row && ownerCheckHistory([row], input)[0];
        if (!record) throw new Error("owner_check_not_saved");
        return { ok: true, record, duplicate: false };
      }, db());
    },
  };
}
