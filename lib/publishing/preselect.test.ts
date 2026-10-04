import { describe, expect, it } from "vitest";
import type { GbpReviewTarget } from "@/lib/oauth/google-reviews";
import { preselectTarget } from "./preselect";

function target(reviewName: string, excerpt: string): GbpReviewTarget {
  return { reviewName, reviewer: "A reviewer", starRating: 4, createTime: "2026-10-01T00:00:00Z", excerpt };
}

describe("preselectTarget", () => {
  const targets = [
    target("accounts/1/locations/2/reviews/newest", "Lovely brunch, but the coffee arrived cold."),
    target(
      "accounts/1/locations/2/reviews/older",
      "The   Staff were SO friendly and\nthe milk tea was perfect, will come back for sure",
    ),
    target("accounts/1/locations/2/reviews/oldest", "Too noisy at lunch."),
  ];

  it("matches a candidate by 40-code-point prefix ignoring case and whitespace", () => {
    const candidate = "  the staff were so friendly and the milk tea -- an entirely different ending";
    expect(preselectTarget(targets, ["nothing like any review", candidate]))
      .toBe("accounts/1/locations/2/reviews/older");
  });

  it("counts code points, so an astral character counts once", () => {
    const emoji = "\u{1F600}".repeat(40);
    const list = [target("r/newest", "something else"), target("r/emoji", `${emoji}tail A`)];
    expect(preselectTarget(list, [`${emoji}tail B`])).toBe("r/emoji");
  });

  it("falls back to the newest", () => {
    expect(preselectTarget(targets, ["no matching text at all"]))
      .toBe("accounts/1/locations/2/reviews/newest");
    expect(preselectTarget(targets, [])).toBe("accounts/1/locations/2/reviews/newest");
  });

  it("never matches on empty text", () => {
    const list = [target("r/newest", "real review"), target("r/blank", "   ")];
    expect(preselectTarget(list, [""])).toBe("r/newest");
  });

  it("null for no targets", () => {
    expect(preselectTarget([], ["anything"])).toBeNull();
  });
});
