import { describe, expect, it } from "vitest";
import { anniversaryDayFrom, nextRunAfter } from "./next-run";

describe("anniversaryDayFrom", () => {
  it("uses the UTC day of month", () => {
    expect(anniversaryDayFrom("2026-08-15T10:00:00.000Z")).toBe(15);
  });

  it("clamps days past 28 so no month can skip the merchant", () => {
    expect(anniversaryDayFrom("2026-01-31T00:00:00.000Z")).toBe(28);
    expect(anniversaryDayFrom("2026-03-29T00:00:00.000Z")).toBe(28);
  });

  it("rejects an unparseable timestamp rather than inventing a day", () => {
    expect(() => anniversaryDayFrom("not-a-date")).toThrow(/timestamp/i);
  });
});

describe("nextRunAfter", () => {
  it("returns this month's anniversary when it is still ahead", () => {
    expect(nextRunAfter("2026-08-10T00:00:00.000Z", 15)).toBe("2026-08-15T00:00:00.000Z");
  });

  it("advances to next month when the anniversary already passed", () => {
    expect(nextRunAfter("2026-08-20T00:00:00.000Z", 15)).toBe("2026-09-15T00:00:00.000Z");
  });

  it("advances when the anniversary instant is exactly now", () => {
    // Strictly after, or a dispatcher run at the anniversary instant would
    // re-arm the schedule for the same moment and scan again on its next tick.
    expect(nextRunAfter("2026-08-15T00:00:00.000Z", 15)).toBe("2026-09-15T00:00:00.000Z");
  });

  it("rolls over the year", () => {
    expect(nextRunAfter("2026-12-20T00:00:00.000Z", 3)).toBe("2027-01-03T00:00:00.000Z");
  });

  it("lands on a real date in February", () => {
    expect(nextRunAfter("2027-02-01T00:00:00.000Z", 28)).toBe("2027-02-28T00:00:00.000Z");
  });

  it("rejects a day outside the stored check constraint", () => {
    expect(() => nextRunAfter("2026-08-10T00:00:00.000Z", 29)).toThrow(/anniversary/i);
    expect(() => nextRunAfter("2026-08-10T00:00:00.000Z", 0)).toThrow(/anniversary/i);
  });
});
