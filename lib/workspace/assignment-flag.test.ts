import { afterEach, describe, expect, it, vi } from "vitest";
import { assistedAssignmentEnabled } from "./assignment-flag";

afterEach(() => vi.unstubAllEnvs());

describe("assistedAssignmentEnabled", () => {
  it('is on only for exactly "true"', () => {
    vi.stubEnv("ASSISTED_ASSIGNMENT_ENABLED", "true");
    expect(assistedAssignmentEnabled()).toBe(true);
  });

  // Same shape as WORKSPACE_CLAIM_VIA_OAUTH_ENABLED: anything else is off, so a
  // typo or a truthy-looking value cannot enable real ownership assignment.
  it.each([
    ["empty", ""],
    ["1", "1"],
    ["yes", "yes"],
    ["TRUE", "TRUE"],
    ["true with padding", "true "],
  ])("is off when %s", (_label, value) => {
    vi.stubEnv("ASSISTED_ASSIGNMENT_ENABLED", value);
    expect(assistedAssignmentEnabled()).toBe(false);
  });
});
