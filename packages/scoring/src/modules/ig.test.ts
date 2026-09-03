import { describe, expect, it } from "vitest";
import { scoreIG } from "./ig";
import type { IGPayload } from "../types";

describe("scoreIG owner_action coverage", () => {
  it("emits non-empty owner_action_zh for every finding on a weak profile", () => {
    const payload: IGPayload = {
      available: true,
      followers: 50,
      bio: "test",
      posts_last_12: [],
      highlights_count: 0,
      reels_count: 0,
    };
    const result = scoreIG(payload, "餐飲");
    expect(result.findings.length).toBeGreaterThan(0);
    const missing = result.findings.filter(
      (f) => !f.owner_action_zh || f.owner_action_zh.trim().length === 0,
    );
    expect(missing.map((f) => f.finding_key)).toEqual([]);
  });

  it("reports unavailable data with a nullable score", () => {
    const result = scoreIG({ available: false }, "餐飲");
    expect(result).toMatchObject({
      status: "unavailable",
      score: null,
      confidence: "none",
      evidenceCollectedAt: null,
      limitationCode: "IG_NOT_MEASURED",
    });
    expect(result.findings).toEqual([]);
  });
});
