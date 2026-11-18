// Instagram insights persistence (neon/migrations/0024_instagram_insights.sql).
// The migration is authoritative for defaults, checks, grants and RLS; this
// schema mirrors its columns, constraints, index and policy so db:types and
// the missing-columns report stay byte-consistent with the SQL.
import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  check,
  foreignKey,
  index,
  pgPolicy,
  primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { workspaces } from "./business";

export const instagramInsights = pgTable("instagram_insights", {
  id: uuid("id").notNull().default(sql.raw("gen_random_uuid()")),
  workspaceId: uuid("workspace_id").notNull(),
  accountRef: text("account_ref").notNull(),
  scope: text("scope").notNull(),
  mediaRef: text("media_ref"),
  metric: text("metric").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true, mode: "string" }),
  periodEnd: timestamp("period_end", { withTimezone: true, mode: "string" }),
  value: numeric("value"),
  factType: text("fact_type").notNull().default(sql.raw("'Observed'::text")),
  unavailableReason: text("unavailable_reason"),
  observedAt: timestamp("observed_at", { withTimezone: true, mode: "string" }).notNull().default(sql.raw("now()")),
}, t => [
  check("instagram_insights_scope_check", sql.raw("(scope = ANY (ARRAY['account'::text, 'media'::text]))")),
  check("instagram_insights_scope_media_check", sql.raw("(((scope = 'account'::text) AND (media_ref IS NULL)) OR ((scope = 'media'::text) AND (media_ref IS NOT NULL)))")),
  check("instagram_insights_period_check", sql.raw("((period_start IS NULL) = (period_end IS NULL))")),
  check("instagram_insights_period_order_check", sql.raw("((period_start IS NULL) OR (period_end >= period_start))")),
  check("instagram_insights_value_check", sql.raw("((value IS NOT NULL) OR (unavailable_reason IS NOT NULL))")),
  foreignKey({ name: "instagram_insights_workspace_id_fkey", columns: [t.workspaceId], foreignColumns: [((): AnyPgColumn => workspaces.id)()] }).onDelete("cascade"),
  primaryKey({ name: "instagram_insights_pkey", columns: [t.id] }),
  index("instagram_insights_latest_idx").using("btree", sql.raw("workspace_id, observed_at DESC, id DESC")),
  pgPolicy("server_application", { for: "all", to: "sme_app_runtime", using: sql`true`, withCheck: sql`true` }),
]).enableRLS();
