import { describe, expect, it } from "vitest";

import { parseStudioUsageArgs } from "./studio-usage";

const NOW = new Date("2026-11-09T00:00:00.000Z");
const UUID = "11111111-1111-4111-8111-111111111111";

describe("parseStudioUsageArgs", () => {
  it("defaults to 30 days across all workspaces", () => {
    const { options, help } = parseStudioUsageArgs([], NOW);
    expect(help).toBe(false);
    expect(options.workspaceId).toBeUndefined();
    expect(options.since.toISOString()).toBe("2026-10-10T00:00:00.000Z");
  });

  it("accepts a bounded window and a workspace UUID", () => {
    const { options } = parseStudioUsageArgs(["--days", "7", "--workspace-id", UUID.toUpperCase()], NOW);
    expect(options.workspaceId).toBe(UUID);
    expect(options.since.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it("reports help and rejects malformed input", () => {
    expect(parseStudioUsageArgs(["--help"], NOW).help).toBe(true);
    for (const argv of [
      ["--days", "0"],
      ["--days", "366"],
      ["--days", "nope"],
      ["--workspace-id", "not-a-uuid"],
      ["--unknown"],
      ["--days"],
    ]) {
      expect(() => parseStudioUsageArgs(argv, NOW)).toThrow();
    }
  });
});
