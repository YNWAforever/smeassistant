import { describe, expect, it } from "vitest";
import { lastCompleteWeek, parseIsoWeek, weekContaining } from "../scripts/report/week";

const iso = (w: { start: Date; end: Date }) => ({ start: w.start.toISOString(), end: w.end.toISOString() });

describe("reporting weeks (Asia/Hong_Kong, half-open)", () => {
  it("maps an ISO week to Monday 00:00 HKT expressed in UTC", () => {
    expect(parseIsoWeek("2026-W38")).toMatchObject({ label: "2026-W38" });
    expect(iso(parseIsoWeek("2026-W38"))).toEqual({ start: "2026-09-13T16:00:00.000Z", end: "2026-09-20T16:00:00.000Z" });
  });

  it("puts an instant at exactly Monday midnight HKT in the new week only", () => {
    expect(weekContaining(new Date("2026-09-20T16:00:00.000Z")).label).toBe("2026-W39");
    expect(weekContaining(new Date("2026-09-20T15:59:59.999Z")).label).toBe("2026-W38");
  });

  it("defaults to the last complete week, never the current partial one", () => {
    // Thursday 24 Sep 2026, noon HKT, is inside W39.
    expect(lastCompleteWeek(new Date("2026-09-24T04:00:00.000Z")).label).toBe("2026-W38");
  });

  it("assigns early January to the previous ISO year when the week began in December", () => {
    // 1 Jan 2027 is a Friday: its week's Thursday is 31 Dec 2026.
    expect(weekContaining(new Date("2027-01-01T04:00:00.000Z")).label).toBe("2026-W53");
  });

  it("accepts week 53 only in years that have one", () => {
    expect(parseIsoWeek("2026-W53").label).toBe("2026-W53"); // 2026 begins on a Thursday
    expect(() => parseIsoWeek("2025-W53")).toThrow("configuration");
  });

  it.each(["2026-38", "2026-W00", "2026-W5", "W38", ""])("rejects malformed %j", (value) => {
    expect(() => parseIsoWeek(value)).toThrow("configuration");
  });

  it("agrees with itself across every day of 2024-2028 (both function directions)", () => {
    const start = Date.UTC(2024, 0, 1);
    const end = Date.UTC(2029, 0, 1);
    for (let day = start; day < end; day += 86_400_000) {
      // Noon HKT for this calendar day (day is UTC midnight; +12h HKT = +4h UTC).
      const instant = new Date(day + 4 * 60 * 60 * 1000);
      const week = weekContaining(instant);
      expect(week.start.getTime()).toBeLessThanOrEqual(instant.getTime());
      expect(instant.getTime()).toBeLessThan(week.end.getTime());

      const reparsed = parseIsoWeek(week.label);
      expect(reparsed.start.toISOString()).toBe(week.start.toISOString());
      expect(reparsed.end.toISOString()).toBe(week.end.toISOString());
    }
  });
});
