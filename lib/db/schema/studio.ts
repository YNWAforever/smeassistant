// Conversation Studio persistence (neon/migrations/0021_studio_conversations.sql).
// The migration is authoritative for defaults, checks, grants and RLS; this
// schema mirrors its columns, constraints, indexes and policy so db:types and
// the missing-columns report stay byte-consistent with the SQL.
import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  primaryKey,
  unique,
  foreignKey,
  check,
  index,
  pgPolicy,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { locations, workspaces } from "./business";

export const studioConversations = pgTable("studio_conversations", {
  id: uuid("id").notNull().default(sql.raw("gen_random_uuid()")),
  workspaceId: uuid("workspace_id").notNull(),
  locationId: uuid("location_id"),
  createdBy: uuid("created_by").notNull(),
  title: text("title").notNull().default(sql.raw("''::text")),
  status: text("status").notNull().default(sql.raw("'active'::text")),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql.raw("now()")),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql.raw("now()")),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: "string" }).notNull().default(sql.raw("now()")),
}, t => [
  check("studio_conversations_title_check", sql.raw("(char_length(title) <= 80)")),
  check("studio_conversations_status_check", sql.raw("(status = ANY (ARRAY['active'::text, 'archived'::text]))")),
  foreignKey({ name: "studio_conversations_workspace_id_fkey", columns: [t.workspaceId], foreignColumns: [((): AnyPgColumn => workspaces.id)()] }).onDelete("cascade"),
  foreignKey({ name: "studio_conversations_location_id_fkey", columns: [t.locationId], foreignColumns: [((): AnyPgColumn => locations.id)()] }).onDelete("set null"),
  foreignKey({ name: "studio_conversations_created_by_fkey", columns: [t.createdBy], foreignColumns: [((): AnyPgColumn => appUsers.id)()] }).onDelete("cascade"),
  primaryKey({ name: "studio_conversations_pkey", columns: [t.id] }),
  index("studio_conversations_owner_recent_idx").using("btree", sql.raw("workspace_id, created_by, last_message_at DESC, id DESC")),
  pgPolicy("server_application", { for: "all", to: "sme_app_runtime", using: sql`true`, withCheck: sql`true` }),
]).enableRLS();

export const studioMessages = pgTable("studio_messages", {
  id: uuid("id").notNull().default(sql.raw("gen_random_uuid()")),
  conversationId: uuid("conversation_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  seq: integer("seq").notNull(),
  role: text("role").notNull(),
  authorId: uuid("author_id"),
  content: text("content").notNull().default(sql.raw("''::text")),
  parts: jsonb("parts").notNull().default(sql.raw("'[]'::jsonb")),
  intent: text("intent"),
  model: text("model"),
  promptVersion: text("prompt_version"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql.raw("now()")),
}, t => [
  check("studio_messages_seq_check", sql.raw("(seq > 0)")),
  check("studio_messages_role_check", sql.raw("(role = ANY (ARRAY['user'::text, 'assistant'::text]))")),
  check("studio_messages_parts_check", sql.raw("(jsonb_typeof(parts) = 'array'::text)")),
  check("studio_messages_input_tokens_check", sql.raw("((input_tokens IS NULL) OR (input_tokens >= 0))")),
  check("studio_messages_output_tokens_check", sql.raw("((output_tokens IS NULL) OR (output_tokens >= 0))")),
  check("studio_messages_cost_usd_check", sql.raw("((cost_usd IS NULL) OR (cost_usd >= (0)::numeric))")),
  foreignKey({ name: "studio_messages_conversation_id_fkey", columns: [t.conversationId], foreignColumns: [((): AnyPgColumn => studioConversations.id)()] }).onDelete("cascade"),
  foreignKey({ name: "studio_messages_workspace_id_fkey", columns: [t.workspaceId], foreignColumns: [((): AnyPgColumn => workspaces.id)()] }).onDelete("cascade"),
  foreignKey({ name: "studio_messages_author_id_fkey", columns: [t.authorId], foreignColumns: [((): AnyPgColumn => appUsers.id)()] }).onDelete("set null"),
  primaryKey({ name: "studio_messages_pkey", columns: [t.id] }),
  unique("studio_messages_conversation_id_seq_key").on(t.conversationId, t.seq),
  index("studio_messages_conversation_seq_idx").using("btree", sql.raw("conversation_id, seq")),
  pgPolicy("server_application", { for: "all", to: "sme_app_runtime", using: sql`true`, withCheck: sql`true` }),
]).enableRLS();
