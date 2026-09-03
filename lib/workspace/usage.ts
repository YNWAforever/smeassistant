import type { SupabaseClient } from "@supabase/supabase-js";
import { deliveryAllowanceForTier, type WorkspaceTier } from "@/lib/workspace/entitlement";
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

interface UsageRow {
  period: string;
  approved_deliveries: number | null;
  allowance: number | null;
}

export async function getUsage(db: SupabaseClient, workspaceId: string, timezone: string, tier: WorkspaceTier, now: Date = new Date()): Promise<Usage> {
  const period = currentPeriod(timezone, now);
  const read = async (): Promise<UsageRow | null> => {
    const { data, error } = await db
      .from("workspace_usage")
      .select("period, approved_deliveries, allowance")
      .eq("workspace_id", workspaceId)
      .eq("period", period)
      .maybeSingle<UsageRow>();
    if (error) throw new Error("usage lookup failed");
    return data ?? null;
  };
  let row = await read();
  if (!row) {
    const allowance = deliveryAllowanceForTier(tier);
    const { error } = await db.from("workspace_usage").insert({ workspace_id: workspaceId, period, allowance });
    // 23505: a concurrent request created the row first; re-read it.
    if (error && (error as { code?: string }).code !== "23505") throw new Error("usage insert failed");
    row = (await read()) ?? { period, approved_deliveries: 0, allowance };
  }
  return { period: row.period, approvedDeliveries: row.approved_deliveries ?? 0, allowance: row.allowance ?? null, tier };
}
