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

async function acceptedMemberIds(db: SupabaseClient, workspaceId: string): Promise<string[]> {
  const { data, error } = await db
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .not("accepted_at", "is", null)
    .not("user_id", "is", null)
    .returns<Array<{ user_id: string | null }>>();
  if (error) throw new Error("members lookup failed");
  return [...new Set((data ?? []).map((row) => row.user_id).filter((id): id is string => Boolean(id)))];
}

export async function notifyWorkspace(db: SupabaseClient, input: NotifyWorkspaceInput): Promise<NotifyOutcome> {
  try {
    const recipients = input.userIds && input.userIds !== "all"
      ? [...new Set(input.userIds.filter(Boolean))]
      : await acceptedMemberIds(db, input.workspaceId);
    if (!recipients.length) return { inserted: 0, error: null };

    const rows = recipients.map((userId) => ({
      ...(input.completionJobId ? { id: completionId("notification", input.workspaceId, input.completionJobId, input.kind, userId) } : {}),
      workspace_id: input.workspaceId,
      user_id: userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
    }));
    if (input.completionJobId) {
      const { data, error } = await db.from("workspace_notifications")
        .upsert(rows, { onConflict: "id", ignoreDuplicates: true }).select("id");
      if (error) throw new Error("notification insert failed");
      return { inserted: data?.length ?? 0, error: null };
    }
    const { error } = await db.from("workspace_notifications").insert(rows);
    if (error) throw new Error("notification insert failed");
    return { inserted: rows.length, error: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown";
    console.error("[workspace/notify] notification not recorded", { category: "notification_insert_failed", kind: input.kind, message });
    return { inserted: 0, error: message };
  }
}

/**
 * Whether a notification of this kind already exists since `sinceIso` — the
 * export route uses it to send `usage.allowance_80` once per usage period.
 * Never throws; an unreadable table reads as "already sent" so a blip cannot
 * spam the team.
 */
export async function hasNotificationSince(db: SupabaseClient, workspaceId: string, kind: NotificationKind, sinceIso: string): Promise<boolean> {
  try {
    const { data, error } = await db
      .from("workspace_notifications")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("kind", kind)
      .gte("created_at", sinceIso)
      .limit(1)
      .returns<Array<{ id: string }>>();
    if (error) return true;
    return (data?.length ?? 0) > 0;
  } catch {
    return true;
  }
}

/** `/owner/<slug>` (locale is prefixed by the proxy / the link renderer), or null when the slug is unknown. */
export async function workspaceHomeHref(db: SupabaseClient, workspaceId: string): Promise<string | null> {
  try {
    const { data } = await db.from("workspaces").select("slug").eq("id", workspaceId).maybeSingle<{ slug: string | null }>();
    return data?.slug ? `/owner/${data.slug}` : null;
  } catch {
    return null;
  }
}
