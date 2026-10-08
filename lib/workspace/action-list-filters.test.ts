import { describe, expect, it } from "vitest";
import { actionListFilters } from "./action-list-filters";
describe("trusted workspace due window (T-13)", () => {
  it.each([["Asia/Hong_Kong", "2026-10-01", "2026-10-08"], ["Asia/Taipei", "2026-10-01", "2026-10-08"], ["UTC", "2026-09-30", "2026-10-07"], ["America/New_York", "2026-09-30", "2026-10-07"]])("uses %s local date and seven exclusive days", (timezone, today, next7) => {
    expect(actionListFilters({ q: "  100%_literal  ", due: "next_7_days" }, timezone, new Date("2026-09-30T16:15:00Z"))).toMatchObject({ q: "100%_literal", today, next7, timezone });
  });
  it("validates filters and keeps literal query text", () => {
    expect(actionListFilters({ assignee: "ABCDEF01-0000-4000-8000-000000000001" }, "UTC").assignee).toBe("abcdef01-0000-4000-8000-000000000001");
    expect(actionListFilters({ q: "' OR 1=1 --" }, "UTC").q).toBe("' OR 1=1 --");
    for (const input of [{ q: "x".repeat(201) }, { assignee: "fake" }, { due: "tomorrow" }]) expect(() => actionListFilters(input as never, "UTC")).toThrow("invalid_action_filter");
  });
});
