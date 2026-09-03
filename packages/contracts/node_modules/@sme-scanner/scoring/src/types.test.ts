import { describe, it, expect } from "vitest";
import type { FindingKey } from "./types";

describe("FindingKey union", () => {
  const trustKeys = [
    "trust.review_volume",
    "trust.review_rating",
    "trust.review_recency",
    "trust.owner_engagement",
    "trust.social_proof",
    "trust.cross_signal",
  ] as const;

  it("accepts new trust finding keys", () => {
    for (const key of trustKeys) {
      const finding: { finding_key: FindingKey } = { finding_key: key };
      expect(finding.finding_key).toBe(key);
    }
  });

  it("no longer accepts removed keys", () => {
    // @ts-expect-error — "trust.review_count_below_peer" removed
    const _bad: FindingKey = "trust.review_count_below_peer";
    // @ts-expect-error — "trust.no_visible_social_proof" removed
    const _bad2: FindingKey = "trust.no_visible_social_proof";
  });
});
