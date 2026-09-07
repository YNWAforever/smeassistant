import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
import type { BrandRow } from "../workspace/brand";
const COLUMNS = "workspace_id,voice,approved_claims,prohibited_terms,languages,facts,updated_at::text";
export function brandRepository(client?: Pick<Pool, "query">) {
  const db = () => client ?? getPool();
  return {
    async get(workspaceId: string): Promise<BrandRow | null> {
      return (await db().query<BrandRow>(`SELECT ${COLUMNS} FROM brand_profiles WHERE workspace_id=$1`, [workspaceId])).rows[0] ?? null;
    },
    async put(row: BrandRow): Promise<BrandRow> {
      return (await db().query<BrandRow>(`INSERT INTO brand_profiles(workspace_id,voice,approved_claims,prohibited_terms,languages,facts,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(workspace_id) DO UPDATE SET voice=excluded.voice,approved_claims=excluded.approved_claims,prohibited_terms=excluded.prohibited_terms,languages=excluded.languages,facts=excluded.facts,updated_at=excluded.updated_at RETURNING ${COLUMNS}`,
      [row.workspace_id,row.voice,row.approved_claims,row.prohibited_terms,row.languages,row.facts,row.updated_at])).rows[0];
    },
  };
}
