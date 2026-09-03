import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUsage } from "./usage";

function db(rows: Array<Record<string, unknown> | null>, insert: () => Promise<{ error: unknown }> = vi.fn(async () => ({ error: null }))) {
  const reads = [...rows];
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: reads.shift() ?? null, error: null }),
    insert,
  };
  return { client: { from: () => chain } as unknown as SupabaseClient, insert };
}

const now = new Date("2026-09-03T12:00:00Z");

describe("getUsage", () => {
  it("returns the existing period row", async () => {
    const { client, insert } = db([{ period: "2026-09", approved_deliveries: 2, allowance: 3 }]);
    expect(await getUsage(client, "ws-1", "Asia/Hong_Kong", "lite", now)).toEqual({ period: "2026-09", approvedDeliveries: 2, allowance: 3, tier: "lite" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates the row lazily with the tier allowance (lite 3, paid unlimited)", async () => {
    const { client, insert } = db([null, { period: "2026-09", approved_deliveries: 0, allowance: null }]);
    expect(await getUsage(client, "ws-1", "Asia/Taipei", "paid", now)).toEqual({ period: "2026-09", approvedDeliveries: 0, allowance: null, tier: "paid" });
    expect(insert).toHaveBeenCalledWith({ workspace_id: "ws-1", period: "2026-09", allowance: null });
  });

  it("tolerates losing the insert race (23505) and re-reads", async () => {
    const { client } = db([null, { period: "2026-09", approved_deliveries: 1, allowance: 3 }], vi.fn(async () => ({ error: { code: "23505" } })));
    expect((await getUsage(client, "ws-1", "Asia/Hong_Kong", "lite", now)).approvedDeliveries).toBe(1);
  });

  it("uses the workspace timezone for the period boundary", async () => {
    const { client, insert } = db([null, null]);
    // 2026-09-30T20:00Z is already October 1st in Hong Kong.
    const usage = await getUsage(client, "ws-1", "Asia/Hong_Kong", "lite", new Date("2026-09-30T20:00:00Z"));
    expect(usage.period).toBe("2026-10");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ period: "2026-10", allowance: 3 }));
  });
});
