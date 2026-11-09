import { describe, expect, it } from "vitest";

import { ensureStudioStarter } from "./chips";

const STARTERS = [
  { id: "starter_priorities", label: "What should I do first?", message: "What should I do first?" },
  { id: "starter_ig", label: "Plan this week's IG post", message: "Plan it without inventing facts." },
];

describe("ensureStudioStarter", () => {
  it("prepends the requested starter when the briefing did not provide it", () => {
    const result = ensureStudioStarter([{ id: "briefing", label: "Briefing chip", message: "Briefing" }], STARTERS, "starter_ig");
    expect(result.map((chip) => chip.id)).toEqual(["starter_ig", "briefing"]);
    expect(result[0]).toEqual(STARTERS[1]);
  });

  it("leaves an existing starter in place and never duplicates it", () => {
    const existing = [{ id: "starter_ig", label: "Already here", message: "Existing" }];
    expect(ensureStudioStarter(existing, STARTERS, "starter_ig")).toEqual(existing);
  });

  it("returns a copy unchanged when the starter id does not exist", () => {
    const chips = [{ id: "briefing", label: "Briefing chip", message: "Briefing" }];
    const result = ensureStudioStarter(chips, STARTERS, "starter_missing_id");
    expect(result).toEqual(chips);
    expect(result).not.toBe(chips);
  });
});
