import { completionId } from "@/lib/workspace/completion-id";
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
