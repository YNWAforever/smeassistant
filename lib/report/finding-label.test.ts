import { describe, expect, it } from "vitest";
import { readableFindingKey } from "./finding-label";

describe("readableFindingKey", () => {
  it("drops the module prefix and unslugs the rest", () => {
    expect(readableFindingKey("gbp.reviews_volume_low")).toBe("reviews volume low");
  });

  it("handles a key with no underscores", () => {
    expect(readableFindingKey("ig.reels_missing")).toBe("reels missing");
    expect(readableFindingKey("trust.cross_signal")).toBe("cross signal");
  });

  it("returns a bare key unchanged when there is no module prefix", () => {
    expect(readableFindingKey("orphan_key")).toBe("orphan key");
  });

  it("never returns a string containing a dot, which is what leaks a raw message path", () => {
    for (const key of ["aeo.website_no_faq_schema", "gbp.owner_response_low", "ig.profile_clarity"]) {
      expect(readableFindingKey(key)).not.toContain(".");
    }
  });
});
