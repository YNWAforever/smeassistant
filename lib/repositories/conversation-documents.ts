import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { getPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { assetRepository } from "@/lib/repositories/assets";
import type { AssetRow } from "@/lib/workspace/assets";
import type { AuditEvent } from "@/lib/workspace/audit";
import type { DocumentScope, DocumentVersion } from "@/lib/workspace/conversation-documents";

type AppendInput = DocumentScope & { documentId?: string; uploadedBy: string; title: string; text: string; truncated: boolean; sha256: string; asset: Omit<AssetRow, "created_at">; locale?: string | null; ipHash?: string | null };
const columns = `v.id,v.document_id AS "documentId",v.asset_id AS "assetId",v.version,v.title,v.extracted_text AS text,v.truncated,v.sha256,
  to_char(v.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"`;
const ownedAssetJoin = `JOIN assets a ON a.id=v.asset_id AND a.workspace_id=v.workspace_id
  AND a.location_id IS NOT DISTINCT FROM v.location_id AND a.kind='document'`;
const scopePredicate = `v.workspace_id=$1 AND v.location_id IS NOT DISTINCT FROM $2::uuid
  AND (v.location_id IS NULL OR EXISTS(SELECT 1 FROM locations l WHERE l.id=v.location_id AND l.workspace_id=v.workspace_id))`;
const uploadEvent = "asset.uploaded" satisfies AuditEvent;

/** Membership is checked by the API; every SQL lookup still constrains workspace and exact location. */
export function conversationDocumentRepository(pool?: Pool) {
  const db = () => pool ?? getPool();
  return {
    async locationExists(scope: DocumentScope): Promise<boolean> {
      if (scope.locationId === null) return true;
      return Boolean((await db().query("SELECT id FROM locations WHERE workspace_id=$1 AND id=$2", [scope.workspaceId, scope.locationId])).rows.length);
    },
    async list(scope: DocumentScope, ids?: readonly string[]): Promise<DocumentVersion[]> {
      if (ids && (!ids.length || ids.length > 50)) throw new Error("invalid_ids");
      const values = ids ? [scope.workspaceId, scope.locationId, ids] : [scope.workspaceId, scope.locationId];
      const sql = ids
        ? `SELECT ${columns} FROM conversation_document_versions v ${ownedAssetJoin} WHERE ${scopePredicate} AND v.id=ANY($3::uuid[]) ORDER BY v.created_at DESC,v.id DESC LIMIT 50`
        : `SELECT * FROM (SELECT DISTINCT ON (v.document_id) ${columns} FROM conversation_document_versions v ${ownedAssetJoin}
            WHERE ${scopePredicate} ORDER BY v.document_id,v.version DESC) latest ORDER BY "createdAt" DESC,id DESC LIMIT 50`;
      return (await db().query<DocumentVersion>(sql, values)).rows;
    },
    async append(input: AppendInput): Promise<DocumentVersion> {
      return withTransaction(async conn => {
        const documentId = input.documentId ?? randomUUID();
        // Lock the immutable group before reading MAX(version), including simultaneous initial inserts.
        await conn.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`conversation-document:${documentId}`]);
        let version = 1;
        if (input.documentId) {
          const existing = (await conn.query<{ version: number }>(`SELECT version FROM conversation_document_versions
            WHERE workspace_id=$1 AND location_id IS NOT DISTINCT FROM $2::uuid AND document_id=$3 ORDER BY version DESC LIMIT 1`,
          [input.workspaceId, input.locationId, documentId])).rows[0];
          if (!existing) throw new Error("document_not_found");
          version = existing.version + 1;
        }
        if (input.locationId !== null && !(await conn.query("SELECT id FROM locations WHERE workspace_id=$1 AND id=$2 FOR KEY SHARE", [input.workspaceId, input.locationId])).rows.length) throw new Error("invalid_location");
        // Reuse the asset library writer with this transaction's client, never insertAsset's separate commit.
        const asset = await assetRepository(conn).insert(input.asset);
        const saved = (await conn.query<DocumentVersion>(`INSERT INTO conversation_document_versions AS v
          (id,workspace_id,location_id,document_id,asset_id,version,title,extracted_text,truncated,sha256,uploaded_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${columns}`,
        [randomUUID(), input.workspaceId, input.locationId, documentId, asset.id, version, input.title, input.text, input.truncated, input.sha256, input.uploadedBy])).rows[0];
        if (!saved) throw new Error("document_insert_failed");
        await conn.query(`INSERT INTO audit_events(workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload)
          VALUES($1,$2,'user',$3,$4,'asset',$5,$6::jsonb)`, [input.workspaceId, input.locationId, input.uploadedBy, uploadEvent, asset.id,
          JSON.stringify({ locale: input.locale ?? null, ...(input.ipHash ? { ip_hash: input.ipHash } : {}), kind: "document", filename: input.title, document_id: documentId, document_version_id: saved.id, version_no: version, sha256: input.sha256, truncated: input.truncated })]);
        return saved;
      }, db());
    },
  };
}
