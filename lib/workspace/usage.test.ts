import { describe, it, expect, vi } from "vitest";
import { getUsage } from "./usage";
describe("typed usage read/upsert", () => {
  it.each(["lite", "paid"] as const)(
    "uses %s allowance and timezone",
    async (tier) => {
      const usage = vi.fn(async () => ({
        period: "2026-10",
        approved_deliveries: 2,
        allowance: tier === "paid" ? null : 3,
      }));
      expect(
        await getUsage(
          { usage },
          "w",
          "Asia/Hong_Kong",
          tier,
          new Date("2026-09-30T20:00:00Z"),
        ),
      ).toEqual({
        period: "2026-10",
        approvedDeliveries: 2,
        allowance: tier === "paid" ? null : 3,
        tier,
      });
      expect(usage).toHaveBeenCalledWith(
        "w",
        "2026-10",
        tier === "paid" ? null : 3,
      );
    },
  );
  it("preserves stored allowance and concurrent winner", async () => {
    expect(
      await getUsage(
        {
          usage: async () => ({
            period: "2026-09",
            approved_deliveries: 1,
            allowance: 5,
          }),
        },
        "w",
        "Asia/Hong_Kong",
        "paid",
        new Date("2026-09-03Z"),
      ),
    ).toMatchObject({ approvedDeliveries: 1, allowance: 5 });
  });
});
