import "server-only";
import type { Pool } from "pg";
import type { AnalyticsEventRow } from "@sme-scanner/scan-engine";
import { getPool } from "../db/client";
/** Analytics insertion returns whether it won dedupe before any provider capture. */
export function eventRepository(client?: Pick<Pool, "query">) {
  return {
    async insert(row: AnalyticsEventRow, signal: AbortSignal) {
      signal.throwIfAborted();
      const result = await (client ?? getPool()).query(
        `INSERT INTO scan_events(job_id,anonymous_session_id,event_name,properties,dedupe_key)
     VALUES($1,$2,$3,$4::jsonb,$5) ON CONFLICT(job_id,anonymous_session_id,event_name,dedupe_key) DO NOTHING RETURNING id`,
        [
          row.job_id,
          row.anonymous_session_id,
          row.event_name,
          JSON.stringify(row.properties),
          row.dedupe_key,
        ],
      );
      return { inserted: result.rows.length > 0 };
    },
  };
}
