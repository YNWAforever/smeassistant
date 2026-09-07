import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
import type { AssetRow, UpdateRightsInput } from "../workspace/assets";
const COLUMNS = "id,workspace_id,location_id,kind,storage_path,filename,alt_text,rights_status,rights_confirmed_at::text,uploaded_by,created_at::text";
export function assetRepository(client?: Pick<Pool, "query">) {
  const db = () => client ?? getPool();
  return {
    async list(workspaceId: string): Promise<AssetRow[]> { return (await db().query<AssetRow>(`SELECT ${COLUMNS} FROM assets WHERE workspace_id=$1 ORDER BY created_at DESC`, [workspaceId])).rows; },
    async get(workspaceId: string, id: string): Promise<AssetRow | null> { return (await db().query<AssetRow>(`SELECT ${COLUMNS} FROM assets WHERE workspace_id=$1 AND id=$2`, [workspaceId, id])).rows[0] ?? null; },
    async insert(row: Omit<AssetRow, "created_at">): Promise<AssetRow> {
      const result = await db().query<AssetRow>(`INSERT INTO assets(id,workspace_id,location_id,kind,storage_path,filename,alt_text,rights_status,rights_confirmed_at,uploaded_by)
        SELECT $1,$2,$3,$4,$5,$6,$7,'needs_review',NULL,$8 WHERE $3::uuid IS NULL OR EXISTS(SELECT 1 FROM locations WHERE id=$3 AND workspace_id=$2) RETURNING ${COLUMNS}`,
      [row.id,row.workspace_id,row.location_id,row.kind,row.storage_path,row.filename,row.alt_text,row.uploaded_by]);
      if (!result.rows[0]) throw new Error("asset_location_invalid");
      return result.rows[0];
    },
    async updateRights(input: UpdateRightsInput, now: string): Promise<AssetRow | null> {
      return (await db().query<AssetRow>(`UPDATE assets SET rights_status=$3,rights_confirmed_at=$4,alt_text=CASE WHEN $5 THEN $6 ELSE alt_text END WHERE workspace_id=$1 AND id=$2 RETURNING ${COLUMNS}`, [input.workspaceId,input.assetId,input.rightsStatus,now,input.altText !== undefined,input.altText ?? null])).rows[0] ?? null;
    },
  };
}
