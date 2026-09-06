import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
const WRITE_COLUMNS = ["job_id","provider","evidence_type","source_id","source_url","captured_at","published_at","text_content","metadata","storage_bucket","storage_path","content_sha256","mime_type","byte_size","width","height","collection_status","limitation_code"] as const;
const READ_COLUMNS = "id,provider,evidence_type,source_url,captured_at::text,published_at::text,text_content,metadata,storage_path,collection_status,limitation_code";
/** The caller must authorize the report first. This repository never grants access. */
export function evidenceRepository(client?: Pick<Pool, "query">) {
  const db = () => client ?? getPool();
  return {
    async list(jobId: string): Promise<Record<string, unknown>[]> {
      return (await db().query(`SELECT ${READ_COLUMNS} FROM report_evidence WHERE job_id=$1 ORDER BY captured_at DESC`, [jobId])).rows;
    },
    async upsert(row: Record<string, unknown>): Promise<void> {
      await db().query(`INSERT INTO report_evidence(${WRITE_COLUMNS.join(",")}) VALUES(${WRITE_COLUMNS.map((_, i) => `$${i+1}`).join(",")})
        ON CONFLICT(job_id,provider,evidence_type,source_id) DO UPDATE SET ${WRITE_COLUMNS.slice(4).map(column => `${column}=excluded.${column}`).join(",")}`,
      WRITE_COLUMNS.map(column => row[column] ?? null));
    },
    async listPaths(jobId: string): Promise<Array<{ storage_path: string | null }>> {
      return (await db().query<{ storage_path: string | null }>("SELECT storage_path FROM report_evidence WHERE job_id=$1", [jobId])).rows;
    },
    async delete(jobId: string): Promise<void> { await db().query("DELETE FROM report_evidence WHERE job_id=$1", [jobId]); },
  };
}
