import "server-only";
import type { Pool } from "pg";
import { getPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { COPY_FOLLOW_UP_EVENT, type CopyFollowUpDecision } from "@/lib/workspace/copy-follow-up";

/** Serialise answers with this exact action/version; retries never revive an answered reminder. */
export function copyFollowUpRepository(pool?: Pick<Pool, "connect">) {
  return {
    record(input: { workspaceId: string; actionId: string; versionId: string; actorId: string; locale: string; decision: CopyFollowUpDecision; expectedRecordId?: string }) {
      return withTransaction(async conn => {
        const version = (await conn.query<{ location_id: string | null }>(`SELECT a.location_id FROM actions a
          JOIN output_versions v ON v.workspace_id=a.workspace_id AND v.action_id=a.id
          WHERE a.workspace_id=$1 AND a.id=$2 AND v.id=$3 AND v.approval_state='approved'
          AND a.action_state NOT IN ('dismissed','cancelled','expired')
          AND EXISTS(SELECT 1 FROM deliveries d WHERE d.workspace_id=a.workspace_id AND d.version_id=v.id AND d.mode='copy' AND d.state='exported')
          FOR UPDATE OF a,v`, [input.workspaceId, input.actionId, input.versionId])).rows[0];
        if (!version) return { ok: false as const, error: "version_not_applicable" };
        const previous = (await conn.query<{ id: string; decision: CopyFollowUpDecision; can_answer: boolean }>(`SELECT id::text,payload->>'decision' AS decision,
          (payload->>'decision'='pending' OR payload->>'decision'='later' AND created_at<=now()-interval '24 hours') AS can_answer FROM audit_events
          WHERE workspace_id=$1 AND entity_type='action' AND entity_id=$2 AND event=$3
          AND location_id IS NOT DISTINCT FROM $4 AND payload->>'versionId'=$5 ORDER BY created_at DESC,id DESC LIMIT 1`,
        [input.workspaceId, input.actionId, COPY_FOLLOW_UP_EVENT, version.location_id, input.versionId])).rows[0];
        if (input.decision === "pending" && previous) return { ok: true as const, id: previous.id };
        if (input.decision !== "pending" && (!previous || previous.id !== input.expectedRecordId)) {
          if (previous?.decision === input.decision) return { ok: true as const, id: previous.id };
          return { ok: false as const, error: "follow_up_changed" };
        }
        if (input.decision !== "pending" && previous?.decision !== "pending" && !previous?.can_answer) return { ok: false as const, error: "follow_up_changed" };
        const row = (await conn.query<{ id: string }>(`INSERT INTO audit_events(workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload)
          VALUES($1,$2,'user',$3,$4,'action',$5,$6) RETURNING id::text`, [input.workspaceId, version.location_id, input.actorId,
          COPY_FOLLOW_UP_EVENT, input.actionId, JSON.stringify({ versionId: input.versionId, decision: input.decision, locale: input.locale })])).rows[0];
        if (!row) throw new Error("copy_follow_up_not_saved");
        return { ok: true as const, id: row.id };
      }, pool ?? getPool());
    },
  };
}
