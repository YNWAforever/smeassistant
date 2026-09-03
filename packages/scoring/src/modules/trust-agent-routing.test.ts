import { describe, expect, it } from "vitest";
import { scoreTrust } from "./trust";
import type { GBPPayload, IGPayload } from "../types";

/**
 * Every trust finding must route to an agent that can actually act on it.
 *
 * All six used to inherit a single hardcoded "review_reply_agent" from the shared
 * findings.push() in the tier loop, so trust.social_proof — an Instagram follower
 * count — dispatched an agent that drafts Google review replies. Any routing table
 * built on top of that would have been wrong for five of six findings.
 */

/** Weak on every axis, so as many trust findings as possible fire at once. */
const weakGbp: GBPPayload = {
  available: true,
  name: "Test",
  rating: 2.9,
  reviews_count: 2,
  reviews: [{ rating: 3, text: "ok", time: "2020-01-01T00:00:00.000Z" }],
  categories: ["cafe"],
};

const weakIg: IGPayload = {
  available: true,
  username: "test",
  bio: "hi",
  followers: 12,
  following: 400,
  posts_count: 3,
  posts_last_12: [],
};

const EXPECTED: Record<string, string> = {
  "trust.review_volume": "gbp_optimization_agent",
  "trust.review_rating": "review_reply_agent",
  "trust.review_recency": "gbp_optimization_agent",
  "trust.owner_engagement": "review_reply_agent",
  "trust.social_proof": "ig_growth_agent",
  "trust.cross_signal": "gbp_optimization_agent",
};

describe("trust finding agent routing", () => {
  // Signature is (gbp, ig, industry) — both are structurally similar payload
  // objects, so a swapped call still typechecks and still returns findings.
  const result = scoreTrust(weakGbp, weakIg);
  const findings = result.findings;

  it("produces trust findings to route", () => {
    // Guards the fixture: if this payload stopped triggering anything, every
    // assertion below would pass vacuously.
    expect(findings.length).toBeGreaterThan(0);
  });

  it("gives every finding an agent hint", () => {
    const unrouted = findings.filter((f) => !f.v02_agent_hint).map((f) => f.finding_key);
    expect(unrouted).toEqual([]);
  });

  it("routes each finding to the agent that can act on it", () => {
    for (const finding of findings) {
      const expected = EXPECTED[finding.finding_key];
      expect(expected, `no expected route declared for ${finding.finding_key}`).toBeDefined();
      expect(finding.v02_agent_hint, finding.finding_key).toBe(expected);
    }
  });

  it("does not route an Instagram signal to the review-reply agent", () => {
    // The specific bug, named: this is what used to happen to all six.
    const social = findings.find((f) => f.finding_key === "trust.social_proof");
    if (social) expect(social.v02_agent_hint).not.toBe("review_reply_agent");
  });

  it("uses more than one distinct agent across the trust module", () => {
    const distinct = new Set(findings.map((f) => f.v02_agent_hint));
    expect(distinct.size).toBeGreaterThan(1);
  });
});
