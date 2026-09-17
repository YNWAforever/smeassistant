import { describe, expect, it } from "vitest";
import type { WebsiteChecks } from "@/lib/website/checks";
import { decideVerification } from "./decide";

function checks(entries: Record<string, boolean>): WebsiteChecks {
  const results = Object.entries(entries).map(([key, pass]) => ({ key: key as never, pass }));
  return { evaluated: results.length, passed: results.filter((r) => r.pass).length, results };
}

const THREE = ["title", "meta_description_50_160", "single_h1"] as const;

describe("decideVerification", () => {
  it("is not_verifiable when the template declares nothing", () => {
    const decision = decideVerification([], { prior: checks({ faq_schema: false }), fresh: checks({ faq_schema: true }) });
    expect(decision).toBe("not_verifiable");
  });

  it("is not_verifiable when there is no prior result at all", () => {
    const decision = decideVerification(["faq_schema"], { prior: null, fresh: checks({ faq_schema: true }) });
    expect(decision).toBe("not_verifiable");
  });

  it("is not_verifiable when the prior snapshot never evaluated the key", () => {
    // Evaluated other checks but not this one -- we cannot say it was failing,
    // so we must not later claim it was fixed.
    const decision = decideVerification(["faq_schema"], { prior: checks({ title: true }), fresh: checks({ faq_schema: true }) });
    expect(decision).toBe("not_verifiable");
  });

  it("is not_verifiable when nothing was wrong to begin with", () => {
    // Every declared check already passed, so there is nothing to confirm.
    // Without this, a site that always had FAQ schema would produce a
    // `verified` row for work nobody did.
    const decision = decideVerification(["faq_schema"], { prior: checks({ faq_schema: true }), fresh: checks({ faq_schema: true }) });
    expect(decision).toBe("not_verifiable");
  });

  it("is verified when the one failing check now passes", () => {
    const decision = decideVerification(["faq_schema"], { prior: checks({ faq_schema: false }), fresh: checks({ faq_schema: true }) });
    expect(decision).toBe("verified");
  });

  it("is not_yet when the failing check still fails", () => {
    const decision = decideVerification(["faq_schema"], { prior: checks({ faq_schema: false }), fresh: checks({ faq_schema: false }) });
    expect(decision).toBe("not_yet");
  });

  it("verifies on the relevant subset, ignoring checks that were never broken", () => {
    // website-basics declares three, but this action existed because only the
    // meta description was wrong. Requiring all three to have failed would make
    // it permanently unverifiable; requiring all three to pass now would
    // withhold verification over a check that was never the problem.
    const prior = checks({ title: true, meta_description_50_160: false, single_h1: true });
    const fresh = checks({ title: true, meta_description_50_160: true, single_h1: true });
    expect(decideVerification(THREE, { prior, fresh })).toBe("verified");
  });

  it("is not_yet when only some of the relevant checks are fixed", () => {
    const prior = checks({ title: false, meta_description_50_160: false, single_h1: true });
    const fresh = checks({ title: true, meta_description_50_160: false, single_h1: true });
    expect(decideVerification(THREE, { prior, fresh })).toBe("not_yet");
  });

  it("is not_yet when the fresh fetch evaluated only some of the relevant checks", () => {
    // A partial fetch is not a partial verification. This is the case a
    // refactor that special-cased `evaluated === 0` would break while every
    // other test stayed green -- the rule must stay a per-key lookup.
    const prior = checks({ title: false, meta_description_50_160: true, single_h1: false });
    const fresh = checks({ title: true });
    expect(decideVerification(THREE, { prior, fresh })).toBe("not_yet");
  });

  it("is not_yet when the fresh fetch never evaluated a relevant check", () => {
    // An unreachable site yields evaluated: 0. That is "we could not look",
    // not "it is fixed".
    const decision = decideVerification(["faq_schema"], { prior: checks({ faq_schema: false }), fresh: { evaluated: 0, passed: 0, results: [] } });
    expect(decision).toBe("not_yet");
  });
});
