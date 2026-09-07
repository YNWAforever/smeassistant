import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
import type { NotificationRepository } from "../workspace/notify";
export type NotificationPreferences = Partial<
  Record<
    | "notify_rescan_complete"
    | "notify_regression_alert"
    | "notify_monthly_digest",
    boolean
  >
>;
export function notificationRepository(
  client?: Pick<Pool, "query">,
): NotificationRepository & {
  updatePreferences(
    workspaceId: string,
    updates: NotificationPreferences,
  ): Promise<void>;
} {
  const db = () => client ?? getPool();
  return {
    async updatePreferences(workspaceId, updates) {
      const keys = [
        "notify_rescan_complete",
        "notify_regression_alert",
        "notify_monthly_digest",
      ] as const;
      if (
        !Object.keys(updates).length ||
        Object.keys(updates).some(
          (key) =>
            !keys.includes(key as (typeof keys)[number]) ||
            typeof updates[key as (typeof keys)[number]] !== "boolean",
        )
      )
        throw new Error("invalid_notification_preferences");
      const result = await db().query(
        "UPDATE workspaces SET notify_rescan_complete=COALESCE($2,notify_rescan_complete), notify_regression_alert=COALESCE($3,notify_regression_alert), notify_monthly_digest=COALESCE($4,notify_monthly_digest) WHERE id=$1 RETURNING id",
        [workspaceId, ...keys.map((key) => updates[key] ?? null)],
      );
      if (!result.rows.length)
        throw new Error("notification_workspace_not_found");
    },
    async acceptedMemberIds(workspaceId) {
      try {
        return (
          await db().query<{ user_id: string }>(
            "SELECT DISTINCT user_id FROM workspace_members WHERE workspace_id=$1 AND accepted_at IS NOT NULL AND user_id IS NOT NULL",
            [workspaceId],
          )
        ).rows.map((r) => r.user_id);
      } catch {
        throw new Error("members lookup failed");
      }
    },
    async insert(rows, dedupe) {
      try {
        const result = await db().query(
          `INSERT INTO workspace_notifications(id,workspace_id,user_id,kind,title,body,href)
    SELECT COALESCE(x.id,gen_random_uuid()),x.workspace_id,x.user_id,x.kind,x.title,x.body,x.href
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,workspace_id uuid,user_id uuid,kind text,title jsonb,body jsonb,href text)
    ${dedupe ? "ON CONFLICT(id) DO NOTHING" : ""} RETURNING id`,
          [JSON.stringify(rows)],
        );
        return result.rows.length;
      } catch {
        throw new Error("notification insert failed");
      }
    },
    async hasSince(workspaceId, kind, since) {
      try {
        return Boolean(
          (
            await db().query(
              "SELECT id FROM workspace_notifications WHERE workspace_id=$1 AND kind=$2 AND created_at >= $3 LIMIT 1",
              [workspaceId, kind, since],
            )
          ).rows.length,
        );
      } catch {
        throw new Error("notification lookup failed");
      }
    },
    async workspaceSlug(workspaceId) {
      try {
        return (
          (
            await db().query<{ slug: string | null }>(
              "SELECT slug FROM workspaces WHERE id=$1",
              [workspaceId],
            )
          ).rows[0]?.slug ?? null
        );
      } catch {
        throw new Error("workspace lookup failed");
      }
    },
  };
}
