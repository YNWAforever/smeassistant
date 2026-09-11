import { describe, it, expect, vi } from "vitest";
import { allowanceWarnAt, getUsage } from "./usage";

describe("allowanceWarnAt", () => {
  it("warns the lite owner while a delivery is still left", () => {
    // The whole point of the finding: 0.8 x 3 = 2.4 warned at 3 of 3, i.e. on
    // the export that spent the last one, when the next is already refused.
    expect(allowanceWarnAt(3)).toBe(2);
  });

  it("still approximates 80% for larger allowances", () => {
    expect(allowanceWarnAt(12)).toBe(10);
    expect(allowanceWarnAt(10)).toBe(8);
    expect(allowanceWarnAt(100)).toBe(80);
  });

  it("never warns before the first delivery, and never after the last", () => {
    // An allowance of 1 has nowhere earlier to warn; it must still not warn at 0.
    expect(allowanceWarnAt(1)).toBe(1);
    expect(allowanceWarnAt(2)).toBe(1);
    for (const allowance of [1, 2, 3, 5, 12, 100]) {
      const warnAt = allowanceWarnAt(allowance) as number;
      expect(warnAt).toBeGreaterThanOrEqual(1);
      expect(warnAt).toBeLessThanOrEqual(allowance);
    }
  });

  it("never warns on an unlimited allowance", () => {
    expect(allowanceWarnAt(null)).toBeNull();
  });
});
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
