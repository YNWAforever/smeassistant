import type { workspaceReadRepository } from "@/lib/repositories/workspace-read";
import {
  deliveryAllowanceForTier,
  type WorkspaceTier,
} from "@/lib/workspace/entitlement";
import { currentPeriod } from "@/lib/workspace/queries";

/**
 * Usage read model (CLAUDE.md §3.10): one `workspace_usage` row per
 * (workspace, 'YYYY-MM' in the workspace timezone). The row is created lazily
 * with the tier's allowance at creation time; `export_output_version` is the
 * only writer of `approved_deliveries`.
 */
export interface Usage {
  period: string;
  approvedDeliveries: number;
  allowance: number | null;
  tier: WorkspaceTier;
}

/**
 * How many approved deliveries must be used before the owner is warned that
 * the period's allowance is running out. `null` for an unlimited allowance.
 *
 * A plain 80% cannot warn anyone on the lite tier: 0.8 x 3 is 2.4, so the
 * notice fired at 3 of 3 -- on the export that consumed the last delivery,
 * when the next one is already refused with `allowance_exceeded`. The warning
 * has to land while the owner can still act on it, so it is capped at one
 * delivery before exhaustion and otherwise stays near 80%: 3 warns at 2,
 * 12 warns at 10. An allowance of 1 can only warn as it is spent.
 */
export function allowanceWarnAt(allowance: number | null): number | null {
  if (allowance === null) return null;
  return Math.max(1, Math.min(Math.ceil(0.8 * allowance), allowance - 1));
}

export async function getUsage(
  db: Pick<ReturnType<typeof workspaceReadRepository>, "usage">,
  workspaceId: string,
  timezone: string,
  tier: WorkspaceTier,
  now: Date = new Date(),
): Promise<Usage> {
  const period = currentPeriod(timezone, now);
  const row = await db.usage(
    workspaceId,
    period,
    deliveryAllowanceForTier(tier),
  );
  return {
    period: row.period,
    approvedDeliveries: row.approved_deliveries ?? 0,
    allowance: row.allowance ?? null,
    tier,
  };
}
