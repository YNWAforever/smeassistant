import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
import type { BrandRow } from "../workspace/brand";
const COLUMNS = "workspace_id,voice,approved_claims,prohibited_terms,languages,facts,current_revision_id,updated_at::text";
export function brandRepository(client?: Pick<Pool, "query">) {
  const db = () => client ?? getPool();
  return {
    async saveBrandRevision(input:{workspaceId:string;actorId:string;profile:Record<string,unknown>;expectedRevisionId:string|null}):Promise<{profile:BrandRow;revisionId:string}> {
      try{return (await db().query<{result:{profile:BrandRow;revisionId:string}}>('SELECT public.save_brand_revision($1,$2,$3::jsonb,$4) AS result',[input.workspaceId,input.actorId,JSON.stringify(input.profile),input.expectedRevisionId])).rows[0].result;}
      catch(error){const message=error instanceof Error?error.message:'';if(['brand_revision_conflict','brand_revision_forbidden'].includes(message))throw new Error(message);throw new Error('brand_revision_save_failed');}
    },
    async history(workspaceId:string):Promise<Array<{id:string;profile:Record<string,unknown>;actor_id:string|null;created_at:string;source:string}>> {
      return (await db().query('SELECT id,profile,actor_id,created_at::text,source FROM brand_revisions WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[workspaceId])).rows;
    },
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
