import { describe, expect, it } from "vitest";
import { hasEnded, localDate, notStarted } from "./dates";

describe("localDate", () => {
  it("ends at local midnight in the workspace timezone", () => {
    expect(localDate("Asia/Hong_Kong", new Date("2026-10-31T15:30:00Z"))).toBe("2026-10-31");
    expect(localDate("Asia/Hong_Kong", new Date("2026-10-31T16:05:00Z"))).toBe("2026-11-01");
    expect(localDate("Asia/Taipei", new Date("2026-10-31T15:30:00Z"))).toBe("2026-10-31");
    expect(localDate("Asia/Taipei", new Date("2026-10-31T16:05:00Z"))).toBe("2026-11-01");
  });
  it("falls back to UTC for an unknown timezone instead of throwing", () => {
    expect(localDate("Mars/Olympus", new Date("2026-10-31T23:30:00Z"))).toBe("2026-10-31");
    expect(localDate("", new Date("2026-10-31T23:30:00Z"))).toBe("2026-10-31");
  });
});

describe("hasEnded / notStarted", () => {
  it("treats the end date as the last valid day", () => {
    expect(hasEnded({ ends_on: "2026-10-31" }, "2026-10-31")).toBe(false);
    expect(hasEnded({ ends_on: "2026-10-31" }, "2026-11-01")).toBe(true);
    expect(hasEnded({ ends_on: null }, "2099-01-01")).toBe(false);
  });
  it("reports an offer that starts later", () => {
    expect(notStarted({ starts_on: "2026-10-05" }, "2026-10-04")).toBe(true);
    expect(notStarted({ starts_on: "2026-10-05" }, "2026-10-05")).toBe(false);
  });
});
