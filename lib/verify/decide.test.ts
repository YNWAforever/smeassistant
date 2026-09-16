import { describe, expect, it } from "vitest";
import type { WebsiteChecks } from "@/lib/website/checks";
import { decideVerification } from "./decide";

function checks(entries: Record<string, boolean>): WebsiteChecks {
  const results = Object.entries(entries).map(([key, pass]) => ({ key: key as never, pass }));
  return { evaluated: results.length, passed: results.filter((r) => r.pass).length, results };
}

const THREE = ["title", "meta_description_50_160", "single_h1"] as const;

describe("decideVerification", () => {
  it("is not_applicable when the template declares nothing", () => {
    expect(decideVerification([], checks({ faq_schema: false }), checks({ faq_schema: true }))).toBe("not_applicable");
  });

  it("is not_applicable when there is no prior result at all", () => {
    expect(decideVerification(["faq_schema"], null, checks({ faq_schema: true }))).toBe("not_applicable");
  });

  it("is not_applicable when the prior snapshot never evaluated the key", () => {
    // Evaluated other checks but not this one -- we cannot say it was failing,
    // so we must not later claim it was fixed.
    expect(decideVerification(["faq_schema"], checks({ title: true }), checks({ faq_schema: true }))).toBe("not_applicable");
  });

  it("is not_applicable when nothing was wrong to begin with", () => {
    // Every declared check already passed, so there is nothing to confirm.
    // Without this, a site that always had FAQ schema would produce a
    // `verified` row for work nobody did.
    expect(decideVerification(["faq_schema"], checks({ faq_schema: true }), checks({ faq_schema: true }))).toBe("not_applicable");
  });

  it("is verified when the one failing check now passes", () => {
    expect(decideVerification(["faq_schema"], checks({ faq_schema: false }), checks({ faq_schema: true }))).toBe("verified");
  });

  it("is not_yet when the failing check still fails", () => {
    expect(decideVerification(["faq_schema"], checks({ faq_schema: false }), checks({ faq_schema: false }))).toBe("not_yet");
  });

  it("verifies on the relevant subset, ignoring checks that were never broken", () => {
    // website-basics declares three, but this action existed because only the
    // meta description was wrong. Requiring all three to have failed would make
    // it permanently unverifiable; requiring all three to pass now would
    // withhold verification over a check that was never the problem.
    const prior = checks({ title: true, meta_description_50_160: false, single_h1: true });
    const fresh = checks({ title: true, meta_description_50_160: true, single_h1: true });
    expect(decideVerification(THREE, prior, fresh)).toBe("verified");
  });

  it("is not_yet when only some of the relevant checks are fixed", () => {
    const prior = checks({ title: false, meta_description_50_160: false, single_h1: true });
    const fresh = checks({ title: true, meta_description_50_160: false, single_h1: true });
    expect(decideVerification(THREE, prior, fresh)).toBe("not_yet");
  });

  it("is not_yet when the fresh fetch never evaluated a relevant check", () => {
    // An unreachable site yields evaluated: 0. That is "we could not look",
    // not "it is fixed".
    expect(decideVerification(["faq_schema"], checks({ faq_schema: false }), { evaluated: 0, passed: 0, results: [] })).toBe("not_yet");
  });
});
