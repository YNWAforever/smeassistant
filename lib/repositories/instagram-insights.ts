import "server-only";
import type { Pool } from "pg";

import { getPool } from "@/lib/db/client";

/**
 * Storage for the Instagram insights the owner pulls on demand (Phase 20
 * P20.3). Rows are platform-reported observations: one metric over one window
 * (account scope) or one media item (media scope). A metric Meta could not
 * return is stored with `value: null` and an explicit `unavailable_reason`, so
 * readers never turn "unavailable" into zero.
 *
 * The table is append-only by application policy: each pull writes a new
 * observation set and `listLatest` takes the newest row per
 * (scope, media_ref, metric). Reads are always scoped by workspace_id.
 */
export type InstagramInsightScope = "account" | "media";

export type InstagramInsightInsert = {
  accountRef: string;
  scope: InstagramInsightScope;
  mediaRef: string | null;
  metric: string;
  periodStart: string | null;
  periodEnd: string | null;
  value: number | null;
  unavailableReason: string | null;
};

export type InstagramInsightRow = InstagramInsightInsert & {
  id: string;
  workspaceId: string;
  observedAt: string;
};

type Executor = Pick<Pool, "query">;

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function instagramInsightsRepository(pool?: Executor) {
  const db = (): Executor => pool ?? getPool();
  return {
    /** Writes one observation set; returns how many rows landed. */
    async insertMany(workspaceId: string, rows: InstagramInsightInsert[]): Promise<number> {
      if (rows.length === 0) return 0;
      let inserted = 0;
      for (const row of rows) {
        await db().query(
          `INSERT INTO public.instagram_insights
             (workspace_id, account_ref, scope, media_ref, metric, period_start, period_end, value, unavailable_reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [workspaceId, row.accountRef, row.scope, row.mediaRef, row.metric, row.periodStart, row.periodEnd, row.value, row.unavailableReason],
        );
        inserted += 1;
      }
      return inserted;
    },

    /** The newest observation per (scope, media_ref, metric) for one workspace. */
    async listLatest(workspaceId: string): Promise<InstagramInsightRow[]> {
      const rows = (
        await db().query<{
          id: string;
          workspace_id: string;
          account_ref: string;
          scope: string;
          media_ref: string | null;
          metric: string;
          period_start: string | null;
          period_end: string | null;
          value: string | null;
          unavailable_reason: string | null;
          observed_at: string;
        }>(
          `SELECT id, workspace_id, account_ref, scope, media_ref, metric,
                  period_start::text AS period_start, period_end::text AS period_end,
                  value::text AS value, unavailable_reason, observed_at::text AS observed_at
             FROM (
               SELECT DISTINCT ON (scope, media_ref, metric) *
                 FROM public.instagram_insights
                WHERE workspace_id = $1
                ORDER BY scope, media_ref, metric, observed_at DESC, id DESC
             ) latest
            ORDER BY scope, media_ref, metric`,
          [workspaceId],
        )
      ).rows;
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        accountRef: row.account_ref,
        scope: row.scope === "media" ? "media" : "account",
        mediaRef: row.media_ref,
        metric: row.metric,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        value: num(row.value),
        unavailableReason: row.unavailable_reason,
        observedAt: row.observed_at,
      }));
    },
  };
}
