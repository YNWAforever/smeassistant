import { describe, expect, it } from "vitest";
import type { IGPayload } from "@sme-scanner/scoring";
import { resolveIgConfidence } from "./ig-confidence";

/**
 * RapidAPI is the sole IG source, so the source itself cannot vary — only how
 * much of the profile came back. `posts_last_12` is the discriminator because
 * three findings (ig.content_consistency, ig.content_mix, ig.engagement_low)
 * are assessed against it; `bio` is the secondary signal.
 */
function payload(overrides: Partial<IGPayload>): IGPayload {
  return { available: true, ...overrides };
}

describe("resolveIgConfidence", () => {
  it("grades high when posts and a non-empty bio are both present", () => {
    expect(
      resolveIgConfidence(
        payload({
          bio: "Coffee and pastries in Central.",
          posts_last_12: [{ id: "post-1" }],
        }),
        "picker_confirmed",
      ),
    ).toBe("high");
  });

  it("grades medium when posts are present but bio is absent", () => {
    expect(
      resolveIgConfidence(
        payload({
          posts_last_12: [{ id: "post-1" }],
        }),
        "picker_confirmed",
      ),
    ).toBe("medium");
  });

  it("grades medium when posts are present but bio is an empty string", () => {
    expect(
      resolveIgConfidence(
        payload({
          bio: "",
          posts_last_12: [{ id: "post-1" }],
        }),
        "picker_confirmed",
      ),
    ).toBe("medium");
  });

  it("grades low when posts_last_12 is absent, even with a bio", () => {
    expect(
      resolveIgConfidence(
        payload({
          bio: "Coffee and pastries in Central.",
        }),
        "picker_confirmed",
      ),
    ).toBe("low");
  });

  it("grades low when posts_last_12 is an empty array", () => {
    expect(
      resolveIgConfidence(
        payload({
          bio: "Coffee and pastries in Central.",
          posts_last_12: [],
        }),
        "picker_confirmed",
      ),
    ).toBe("low");
  });

  it("grades low when neither posts nor bio came back", () => {
    expect(resolveIgConfidence(payload({}), "picker_confirmed")).toBe("low");
  });

  it("treats a whitespace-only bio as absent", () => {
    // Boolean("   ") is true, so an untrimmed check would grade a blank
    // profile "high". Merchants do leave bios that are only spaces.
    expect(
      resolveIgConfidence(payload({ bio: "   ", posts_last_12: [{ id: "1" }] as never }), "picker_confirmed"),
    ).toBe("medium");
  });
});

describe("resolveIgConfidence provenance ceiling", () => {
  const complete = payload({ bio: "廣東菜 · 跑馬地", posts_last_12: [{ id: "1" }] as never });

  it("caps a hand-typed handle at medium however complete the payload is", () => {
    expect(resolveIgConfidence(complete, "manual_typed")).toBe("medium");
  });

  it("caps an unknown provenance at medium — legacy jobs were hand-typed", () => {
    expect(resolveIgConfidence(complete, null)).toBe("medium");
  });

  it("does not cap a picker-confirmed or GBP-cross-referenced handle", () => {
    expect(resolveIgConfidence(complete, "picker_confirmed")).toBe("high");
    expect(resolveIgConfidence(complete, "gbp_cross_referenced")).toBe("high");
  });

  it("never raises a thin payload — the ceiling is not a floor", () => {
    expect(resolveIgConfidence(payload({}), "gbp_cross_referenced")).toBe("low");
    expect(resolveIgConfidence(payload({ posts_last_12: [{ id: "1" }] as never }), "picker_confirmed")).toBe("medium");
  });
});
