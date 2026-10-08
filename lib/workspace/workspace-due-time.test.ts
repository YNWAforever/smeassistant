import { describe, expect, it } from "vitest";
import { workspaceDueTimestamp } from "./workspace-due-time";
describe("assignment workspace-local due input", () => {
  it.each(["Asia/Hong_Kong", "Asia/Taipei"])("uses %s rather than browser timezone", timezone => { expect(workspaceDueTimestamp("2026-10-12T09:00", timezone)).toBe("2026-10-12T01:00:00.000Z"); });
  it("handles DST and refuses ambiguous or nonexistent local times", () => {
    expect(workspaceDueTimestamp("2026-11-01T03:00", "America/New_York")).toBe("2026-11-01T08:00:00.000Z");
    expect(() => workspaceDueTimestamp("2026-11-01T01:30", "America/New_York")).toThrow();
    expect(() => workspaceDueTimestamp("2026-03-08T02:30", "America/New_York")).toThrow();
    expect(() => workspaceDueTimestamp("2026-02-30T09:00", "UTC")).toThrow();
  });
});
