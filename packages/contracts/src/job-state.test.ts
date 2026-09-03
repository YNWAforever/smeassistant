import { describe, expect, it } from "vitest";
import { canTransitionJob } from "./job-state";

describe("canTransitionJob", () => {
  it.each([
    ["queued", "collecting"],
    ["collecting", "scoring"],
    ["scoring", "persisting"],
    ["persisting", "done"],
    ["persisting", "partial"],
    ["collecting", "failed"],
    ["persisting", "failed"],
  ] as const)("allows %s to %s", (from, to) => {
    expect(canTransitionJob(from, to)).toBe(true);
  });

  it.each([
    ["done", "collecting"],
    ["partial", "scoring"],
    ["failed", "done"],
    ["queued", "done"],
  ] as const)("rejects %s to %s", (from, to) => {
    expect(canTransitionJob(from, to)).toBe(false);
  });
});
