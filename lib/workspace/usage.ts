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
