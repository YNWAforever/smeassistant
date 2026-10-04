import { localized, type LocalizedText } from "@/lib/domain";
import { notificationRepository } from "@/lib/repositories/notifications";
import {
  hasSinceWithRepository,
  homeHrefWithRepository,
  notifyWithRepository,
} from "@/lib/workspace/notify";
import { allowanceWarnAt, type Usage } from "@/lib/workspace/usage";

/**
 * The in-app notices that follow a delivery (Phase 6 item 4), shared by the
 * export route and the publish route (P4.6 spec §3.2):
 * - a delivery notice linking the action, with the period's usage;
 * - the allowance notice, once per period, when usage reaches the warning
 *   threshold (`allowanceWarnAt`).
 *
 * Best-effort by contract: the delivery is already committed, so nothing here
 * throws. Every insert is a `delivery.exported` / `usage.allowance_80` row.
 */
export type DeliveryNoticeKind = "export" | "copy" | "publish";

const DELIVERY_TITLES: Record<DeliveryNoticeKind, LocalizedText> = {
  export: localized("Approved version exported", "已匯出批准版本"),
  copy: localized("Approved version copied", "已複製批准版本"),
  publish: localized("Approved reply published to Google", "已將核准回覆發佈到 Google"),
};

export async function sendDeliveryNotices(input: {
  workspaceId: string;
  actionId: string;
  kind: DeliveryNoticeKind;
  usage: Usage;
}): Promise<void> {
  try {
    const repository = notificationRepository();
    const { usage } = input;
    const home = await homeHrefWithRepository(repository, input.workspaceId);
    await notifyWithRepository(repository, {
      workspaceId: input.workspaceId,
      kind: "delivery.exported",
      title: DELIVERY_TITLES[input.kind],
      body:
        usage.allowance === null
          ? localized(
              `${usage.approvedDeliveries} approved deliveries this period.`,
              `本期已批准交付 ${usage.approvedDeliveries} 項。`,
            )
          : localized(
              `${usage.approvedDeliveries} of ${usage.allowance} approved deliveries used this period.`,
              `本期已用 ${usage.approvedDeliveries} / ${usage.allowance} 項批准交付。`,
            ),
      href: home ? `${home}/actions/${input.actionId}` : null,
    });
  } catch {
    console.error("[workspace/delivery-notices] delivery notice not sent", {
      category: "delivery_notice_failed",
    });
  }
  await sendAllowanceNotice({ workspaceId: input.workspaceId, usage: input.usage });
}

/**
 * The allowance notice alone. The export route calls it for an idempotent
 * retry (no new delivery, so no delivery notice), exactly as it did before the
 * notices were extracted.
 */
export async function sendAllowanceNotice(input: { workspaceId: string; usage: Usage }): Promise<void> {
  try {
    const { usage } = input;
    const warnAt = allowanceWarnAt(usage.allowance);
    if (warnAt === null || usage.approvedDeliveries < warnAt) return;
    const repository = notificationRepository();
    const periodStart = `${usage.period}-01T00:00:00Z`;
    if (await hasSinceWithRepository(repository, input.workspaceId, "usage.allowance_80", periodStart)) return;
    const home = await homeHrefWithRepository(repository, input.workspaceId);
    // The old title said "80%" directly above a body reading "3 of 3", two
    // contradictory numbers in one notification. Report what is actually
    // left, which is the number the owner needs.
    const left = Math.max(0, (usage.allowance ?? 0) - usage.approvedDeliveries);
    await notifyWithRepository(repository, {
      workspaceId: input.workspaceId,
      kind: "usage.allowance_80",
      // Two arguments, as everywhere else here: 核准後交付 is the term both
      // Chinese locales already use for an approved delivery, so an explicit
      // zh-TW form would imply a variant that does not exist.
      title: localized(
        left === 1 ? "1 approved delivery left this period" : `${left} approved deliveries left this period`,
        `本期尚餘 ${left} 項核准後交付`,
      ),
      body: localized(
        `${usage.approvedDeliveries} of ${usage.allowance} approved deliveries used. Upgrade for unlimited deliveries.`,
        `已用 ${usage.approvedDeliveries} / ${usage.allowance} 項批准交付。升級即可無限交付。`,
      ),
      href: home ? `${home}/settings/billing` : null,
    });
  } catch {
    console.error("[workspace/delivery-notices] allowance notice not sent", {
      category: "allowance_notice_failed",
    });
  }
}
