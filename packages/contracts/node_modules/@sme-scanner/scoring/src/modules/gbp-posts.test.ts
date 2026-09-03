import { describe, expect, it } from "vitest";
import { scoreGBP } from "./gbp";
import type { GBPPayload } from "../types";

const basePayload = (): GBPPayload => ({
  available: true,
  rating: 4.5,
  reviews_count: 60,
  reviews: [
    { rating: 5, text: "great", time: new Date().toISOString(), owner_response: "thanks" },
  ],
  photos_count: 10,
  hours_complete: true,
  categories: ["restaurant"],
});

describe("scoreGBP posts activity penalty", () => {
  it("does not dock posts_inactive when recent_posts_count is unmeasured (undefined)", () => {
    const payload = basePayload();
    // recent_posts_count intentionally left undefined — the Places API never reports posts.
    const result = scoreGBP(payload);

    expect(result.findings.some((f) => f.finding_key === "gbp.posts_inactive")).toBe(false);
  });

  it("docks posts_inactive on a measured zero (recent_posts_count === 0)", () => {
    const payload: GBPPayload = { ...basePayload(), recent_posts_count: 0 };
    const result = scoreGBP(payload);

    expect(result.findings.some((f) => f.finding_key === "gbp.posts_inactive")).toBe(true);
  });
});
