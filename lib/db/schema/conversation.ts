import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, foreignKey, index, integer, jsonb, pgPolicy, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { assets, workspaces } from "./business";
export const conversationDocumentVersions=pgTable("conversation_document_versions",{
  id:uuid("id").notNull().default(sql`gen_random_uuid()`),
  workspaceId:uuid("workspace_id").notNull(),locationId:uuid("location_id"),documentId:uuid("document_id").notNull(),assetId:uuid("asset_id").notNull(),
  version:integer("version").notNull(),title:text("title").notNull(),extractedText:text("extracted_text").notNull(),truncated:boolean("truncated").notNull(),sha256:text("sha256").notNull(),uploadedBy:uuid("uploaded_by"),createdAt:timestamp("created_at",{withTimezone:true,mode:"string"}).notNull().default(sql`now()`),
},t=>[
  primaryKey({name:"conversation_document_versions_pkey",columns:[t.id]}),unique("conversation_document_versions_asset_id_key").on(t.assetId),unique("conversation_document_versions_document_id_version_key").on(t.documentId,t.version),
  check("conversation_document_versions_version_check",sql`${t.version}>0`),check("conversation_document_versions_title_check",sql`char_length(${t.title}) BETWEEN 1 AND 140`),check("conversation_document_versions_extracted_text_check",sql`char_length(${t.extractedText}) BETWEEN 1 AND 20000`),check("conversation_document_versions_sha256_check",sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
  foreignKey({name:"conversation_document_versions_workspace_id_fkey",columns:[t.workspaceId],foreignColumns:[workspaces.id]}).onDelete("cascade"),foreignKey({name:"conversation_document_versions_asset_id_fkey",columns:[t.assetId],foreignColumns:[assets.id]}),foreignKey({name:"conversation_document_versions_uploaded_by_fkey",columns:[t.uploadedBy],foreignColumns:[appUsers.id]}).onDelete("set null"),
  index("conversation_document_versions_scope_idx").on(t.workspaceId,t.locationId,t.documentId,t.version.desc()),
  pgPolicy("server_read_conversation_document_versions",{for:"select",to:"sme_app_runtime",using:sql`true`}),pgPolicy("server_append_conversation_document_versions",{for:"insert",to:"sme_app_runtime",withCheck:sql`true`}),
]).enableRLS();

export const conversationSearchBriefs = pgTable("conversation_search_briefs", {
  id: uuid("id").notNull().default(sql`gen_random_uuid()`), workspaceId: uuid("workspace_id").notNull(), locationId: uuid("location_id").notNull(),
  snapshotKey: text("snapshot_key").notNull(), gap: jsonb("gap").notNull(), brief: jsonb("brief"), createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }), approvedBy: uuid("approved_by"), actionId: uuid("action_id"),
}, t => [
  primaryKey({ name: "conversation_search_briefs_pkey", columns: [t.id] }), unique("conversation_search_briefs_action_id_key").on(t.actionId),
  unique("conversation_search_briefs_scope_snapshot_key").on(t.workspaceId, t.locationId, t.snapshotKey),
  check("conversation_search_briefs_snapshot_key_check", sql`${t.snapshotKey} ~ '^[a-f0-9]{64}$'`),
  foreignKey({ name: "conversation_search_briefs_workspace_id_fkey", columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("cascade"),
  foreignKey({ name: "conversation_search_briefs_approved_by_fkey", columns: [t.approvedBy], foreignColumns: [appUsers.id] }).onDelete("set null"),
  check("conversation_search_briefs_gap_check", sql`jsonb_typeof(${t.gap})='object' AND octet_length(${t.gap}::text)<=131072`),
  check("conversation_search_briefs_brief_check", sql`${t.brief} IS NULL OR (jsonb_typeof(${t.brief})='object' AND octet_length(${t.brief}::text)<=32768)`),
  check("conversation_search_briefs_check", sql`(${t.approvedAt} IS NULL)=(${t.actionId} IS NULL)`), check("conversation_search_briefs_check1", sql`${t.approvedAt} IS NOT NULL OR ${t.approvedBy} IS NULL`),
  index("conversation_search_briefs_scope_idx").on(t.workspaceId, t.locationId, t.createdAt.desc(), t.id.desc()),
  pgPolicy("server_read_conversation_search_briefs", { for: "select", to: "sme_app_runtime", using: sql`true` }),
  pgPolicy("server_append_conversation_search_briefs", { for: "insert", to: "sme_app_runtime", withCheck: sql`true` }),
  pgPolicy("server_confirm_conversation_search_briefs", { for: "update", to: "sme_app_runtime", using: sql`true`, withCheck: sql`true` }),
]).enableRLS();

export const conversationResearchAccounts=pgTable("conversation_research_accounts",{
  provider:text("provider").notNull(),accountKey:text("account_key").notNull(),blockedAt:timestamp("blocked_at",{withTimezone:true,mode:"string"}),blockReason:text("block_reason"),
},t=>[
  primaryKey({name:"conversation_research_accounts_pkey",columns:[t.provider,t.accountKey]}),check("conversation_research_accounts_provider_check",sql`${t.provider} IN ('firecrawl','dataforseo')`),check("conversation_research_accounts_account_key_check",sql`${t.accountKey} ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'`),check("conversation_research_accounts_block_reason_check",sql`${t.blockReason} IS NULL OR ${t.blockReason}='pricing_ceiling_exceeded'`),check("conversation_research_accounts_check",sql`(${t.blockedAt} IS NULL)=(${t.blockReason} IS NULL)`),
  pgPolicy("server_read_conversation_research_accounts",{for:"select",to:"sme_app_runtime",using:sql`true`}),pgPolicy("server_append_conversation_research_accounts",{for:"insert",to:"sme_app_runtime",withCheck:sql`true`}),pgPolicy("server_update_conversation_research_accounts",{for:"update",to:"sme_app_runtime",using:sql`true`,withCheck:sql`true`}),
]).enableRLS();
export const conversationResearchLedger=pgTable("conversation_research_ledger",{
  id:uuid("id").notNull(),workspaceId:uuid("workspace_id").notNull(),locationId:uuid("location_id"),provider:text("provider").notNull(),accountKey:text("account_key").notNull(),month:date("month",{mode:"string"}).notNull(),reservedMicrousd:bigint("reserved_microusd",{mode:"number"}).notNull(),chargedMicrousd:bigint("charged_microusd",{mode:"number"}).notNull(),reportedMicrousd:bigint("reported_microusd",{mode:"number"}),outcome:text("outcome").notNull().default("reserved"),createdAt:timestamp("created_at",{withTimezone:true,mode:"string"}).notNull().default(sql`now()`),completedAt:timestamp("completed_at",{withTimezone:true,mode:"string"}),
},t=>[
  primaryKey({name:"conversation_research_ledger_pkey",columns:[t.id]}),foreignKey({name:"conversation_research_ledger_provider_account_key_fkey",columns:[t.provider,t.accountKey],foreignColumns:[conversationResearchAccounts.provider,conversationResearchAccounts.accountKey]}),
  check("conversation_research_ledger_month_check",sql`EXTRACT(DAY FROM ${t.month})=1`),check("conversation_research_ledger_reserved_microusd_check",sql`${t.reservedMicrousd}>0`),check("conversation_research_ledger_charged_microusd_check",sql`${t.chargedMicrousd}>=${t.reservedMicrousd}`),check("conversation_research_ledger_reported_microusd_check",sql`${t.reportedMicrousd}>=0 AND ${t.reportedMicrousd}<=${t.chargedMicrousd}`),check("conversation_research_ledger_outcome_check",sql`${t.outcome} IN ('reserved','ready','partial','empty','failed')`),check("conversation_research_ledger_check",sql`(${t.outcome}='reserved')=(${t.completedAt} IS NULL)`),
  index("conversation_research_workspace_month_idx").on(t.workspaceId,t.month),index("conversation_research_account_month_idx").on(t.provider,t.accountKey,t.month),uniqueIndex("conversation_research_account_pending_idx").on(t.provider,t.accountKey).where(sql`${t.outcome}='reserved'`),
  pgPolicy("server_read_conversation_research_ledger",{for:"select",to:"sme_app_runtime",using:sql`true`}),pgPolicy("server_append_conversation_research_ledger",{for:"insert",to:"sme_app_runtime",withCheck:sql`true`}),pgPolicy("server_update_conversation_research_ledger",{for:"update",to:"sme_app_runtime",using:sql`true`,withCheck:sql`true`}),
]).enableRLS();
