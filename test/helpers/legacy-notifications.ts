import type { SupabaseClient } from "@supabase/supabase-js";
import {notifyWithRepository,hasSinceWithRepository,homeHrefWithRepository,type NotificationRepository,type NotifyWorkspaceInput,type NotificationKind} from "@/lib/workspace/notify";
/** Explicit legacy adapter retains the ORIGINAL client for deferred consumers. */
export function legacyNotificationRepository(
  db: SupabaseClient,
): NotificationRepository {
  return {
    async acceptedMemberIds(workspaceId) {
      const { data, error } = await db
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .not("accepted_at", "is", null)
        .not("user_id", "is", null)
        .returns<Array<{ user_id: string | null }>>();
      if (error) throw new Error("members lookup failed");
      return (data ?? [])
        .map((r) => r.user_id)
        .filter((id): id is string => Boolean(id));
    },
    async insert(rows, dedupe) {
      if (dedupe) {
        const { data, error } = await db
          .from("workspace_notifications")
          .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
          .select("id");
        if (error) throw new Error("notification insert failed");
        return data?.length ?? 0;
      }
      const { error } = await db.from("workspace_notifications").insert(rows);
      if (error) throw new Error("notification insert failed");
      return rows.length;
    },
    async hasSince(workspaceId, kind, since) {
      const { data, error } = await db
        .from("workspace_notifications")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("kind", kind)
        .gte("created_at", since)
        .limit(1)
        .returns<Array<{ id: string }>>();
      if (error) throw new Error("notification lookup failed");
      return Boolean(data?.length);
    },
    async workspaceSlug(workspaceId) {
      const { data } = await db
        .from("workspaces")
        .select("slug")
        .eq("id", workspaceId)
        .maybeSingle<{ slug: string | null }>();
      return data?.slug ?? null;
    },
  };
}
export const notifyWorkspace = (
  db: SupabaseClient,
  input: NotifyWorkspaceInput,
) => notifyWithRepository(legacyNotificationRepository(db), input);
export const hasNotificationSince = (
  db: SupabaseClient,
  workspaceId: string,
  kind: NotificationKind,
  since: string,
) =>
  hasSinceWithRepository(
    legacyNotificationRepository(db),
    workspaceId,
    kind,
    since,
  );
export const workspaceHomeHref = (db: SupabaseClient, workspaceId: string) =>
  homeHrefWithRepository(legacyNotificationRepository(db), workspaceId);
