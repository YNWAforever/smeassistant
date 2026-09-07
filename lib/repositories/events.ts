import "server-only";
import type { Pool, PoolClient } from "pg";
import type { AnalyticsEventRow } from "@sme-scanner/scan-engine";
import { getPool } from "../db/client";

/** Own the connection until completion; abort discards it instead of returning live SQL to the pool. */
export function eventRepository(pool?: Pick<Pool, "connect">) {
  return {
    async insert(
      row: AnalyticsEventRow,
      signal: AbortSignal,
    ): Promise<{ inserted: boolean }> {
      signal.throwIfAborted();
      const acquiring = (pool ?? getPool()).connect();
      return new Promise((resolve, reject) => {
        let client: PoolClient | undefined;
        let released = false;
        const release = (destroy = false) => {
          if (client && !released) {
            released = true;
            client.release(destroy);
          }
        };
        const abort = () => {
          release(true);
          reject(signal.reason);
        };
        signal.addEventListener("abort", abort, { once: true });
        // pg cannot remove a queued connect request. Keep ownership of the late
        // result and return it unused if cancellation wins during acquisition.
        void acquiring
          .then(async (connection) => {
            client = connection;
            if (signal.aborted) {
              release();
              return;
            }
            try {
              await client.query(
                "BEGIN; SET LOCAL statement_timeout = '1000ms'",
              );
              // The transaction prevents delayed autocommit; its statement
              // deadline also bounds a disconnected backend still waiting on a lock.
              signal.throwIfAborted();
              const result = await client.query(
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
              signal.throwIfAborted();
              await client.query("COMMIT");
              resolve({ inserted: result.rows.length > 0 });
              release();
            } catch (error) {
              // Closing an uncommitted connection rolls back without waiting for
              // another query on a possibly blocked connection.
              release(true);
              reject(error);
            }
          })
          .catch(reject)
          .finally(() => signal.removeEventListener("abort", abort));
      });
    },
  };
}
