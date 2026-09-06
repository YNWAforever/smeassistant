import { completionId } from "@/lib/workspace/completion-id";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalizedText } from "@/lib/domain";

/**
 * In-app notifications (CLAUDE.md Phase 6 item 4): one `workspace_notifications`
 * row per recipient. Upstream's `notification_events` stays the *email* log
 * (Resend digest via `notifyIfComparableRescan` in the legacy scheduler);
 * these rows feed the bell and the Notifications page only.
 *
 * Best-effort by contract: every caller has already committed the thing the
 * notification describes (a scan, an approval, an export), so a failed insert
 * is logged and never thrown.
 */
export const NOTIFICATION_KINDS = [
  "scan.completed",
  "scan.failed",
  "version.approved",
  "delivery.exported",
  "usage.allowance_80",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotifyWorkspaceInput {
  workspaceId: string;
  /** Terminal scan identity supplied only by the server-resolved completion hook. */
  completionJobId?: string;
  kind: NotificationKind;
  title: LocalizedText;
  body?: LocalizedText | null;
  href?: string | null;
  /** Recipients: every accepted member (default) or an explicit list of user ids. */
  userIds?: "all" | string[];
}

export interface NotifyOutcome {
  inserted: number;
  error: string | null;
}

export interface NotificationInsert {
  id?: string;
  workspace_id: string;
  user_id: string;
  kind: NotificationKind;
  title: LocalizedText;
  body: LocalizedText | null;
  href: string | null;
}
export interface NotificationRepository {
  acceptedMemberIds(workspaceId: string): Promise<string[]>;
  insert(rows: NotificationInsert[], dedupe: boolean): Promise<number>;
  hasSince(
    workspaceId: string,
    kind: NotificationKind,
    since: string,
  ): Promise<boolean>;
  workspaceSlug(workspaceId: string): Promise<string | null>;
}

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
export async function notifyWithRepository(
  db: NotificationRepository,
  input: NotifyWorkspaceInput,
): Promise<NotifyOutcome> {
  try {
    const recipients = [
      ...new Set(
        (input.userIds && input.userIds !== "all"
          ? input.userIds
          : await db.acceptedMemberIds(input.workspaceId)
        ).filter(Boolean),
      ),
    ];
    if (!recipients.length) return { inserted: 0, error: null };
    const rows = recipients.map((userId) => ({
      ...(input.completionJobId
        ? {
            id: completionId(
              "notification",
              input.workspaceId,
              input.completionJobId,
              input.kind,
              userId,
            ),
          }
        : {}),
      workspace_id: input.workspaceId,
      user_id: userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
    }));
    return {
      inserted: await db.insert(rows, Boolean(input.completionJobId)),
      error: null,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown";
    console.error("[workspace/notify] notification not recorded", {
      category: "notification_insert_failed",
      kind: input.kind,
      message,
    });
    return { inserted: 0, error: message };
  }
}
export async function hasSinceWithRepository(
  db: NotificationRepository,
  workspaceId: string,
  kind: NotificationKind,
  since: string,
): Promise<boolean> {
  try {
    return await db.hasSince(workspaceId, kind, since);
  } catch {
    return true;
  }
}
export async function homeHrefWithRepository(
  db: NotificationRepository,
  workspaceId: string,
): Promise<string | null> {
  try {
    const slug = await db.workspaceSlug(workspaceId);
    return slug ? `/owner/${slug}` : null;
  } catch {
    return null;
  }
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
