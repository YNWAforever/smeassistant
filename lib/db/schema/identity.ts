import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, primaryKey, check, pgPolicy } from "drizzle-orm/pg-core";
export const appUsers = pgTable("app_users", {
 id: uuid("id").defaultRandom().primaryKey(),
 email: text("email").notNull(),
 createdAt: timestamp("created_at", {withTimezone:true, mode:"string"}).defaultNow().notNull(),
}, () => [pgPolicy("server_application", { for:"all", to:"sme_app_runtime", using:sql`true`, withCheck:sql`true` })]).enableRLS();
export const authIdentities = pgTable("auth_identities", {
 provider: text("provider").notNull(),
 subject: text("subject").notNull(),
 userId: uuid("user_id").notNull().references(() => appUsers.id, {onDelete:"cascade"}),
}, t => [primaryKey({columns:[t.provider,t.subject]}), check("auth_identities_provider_check", sql`provider = 'neon'`), pgPolicy("server_application", {for:"all", to:"sme_app_runtime", using:sql`true`, withCheck:sql`true`})]).enableRLS();
