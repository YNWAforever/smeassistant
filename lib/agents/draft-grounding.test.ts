import { describe, expect, it } from "vitest";
import { scopeReviewReplyFacts, unconfirmedDraftBusinessFacts } from "./draft-grounding";
import { overview } from "@/lib/assistant/__fixtures__";
import type { AgentContext, AgentOutput } from "./schema";

const context: AgentContext = { locale: "zh-HK", market: "hk", brand: { voice: "warm", approvedClaims: [], prohibitedTerms: [], languages: ["zh-HK"], facts: {} }, location: { name: "Example" }, action: overview(), evidence: {}, providedInputs: {}, draftGrounding: { businessName: "Example", asOf: "2026-10-15T00:00:00Z", revisionSource: null } };
const check = (body: string, ctx = context) => unconfirmedDraftBusinessFacts(ctx, { title: "Greeting", body, warnings: [], acceptance_criteria: [], facts_used: [], facts_needed: [] });

describe("assistant business fact guard", () => {
  it("uses the authorized source location for a workspace-wide review action", () => {
    const facts = { location_id: "branch-b", confirmed: "Confirmed branch B fact" };
    const ctx: AgentContext = {
      ...context,
      action: { ...context.action, location: { ...context.action.location, id: null } },
      brand: { ...context.brand, facts, approvedClaims: ["Confirmed branch B claim"] },
      draftGrounding: { ...context.draftGrounding!, sourceLocation: { id: "branch-b", name: "Branch B" } },
    };
    const scoped = scopeReviewReplyFacts(ctx, true);
    expect(scoped.brand.facts).toEqual(facts);
    expect(scoped.brand.approvedClaims).toEqual(["Confirmed branch B claim"]);
  });
  it("does not replace a non-null action location with another source location", () => {
    const ctx: AgentContext = {
      ...context,
      action: { ...context.action, location: { ...context.action.location, id: "branch-b" } },
      brand: { ...context.brand, facts: { location_id: "branch-a", confirmed: "Wrong branch A fact" } },
      draftGrounding: { ...context.draftGrounding!, sourceLocation: { id: "branch-a", name: "Branch A" } },
    };
    expect(scopeReviewReplyFacts(ctx, true).brand.facts).toEqual({});
  });
  it.each([false, true])("withholds unscoped facts without any resolved location authority, multiple=%s", multiple => {
    const ctx: AgentContext = {
      ...context,
      action: { ...context.action, location: { ...context.action.location, id: null } },
      brand: { ...context.brand, facts: { address: "12 Unscoped Street" } },
      draftGrounding: { ...context.draftGrounding!, sourceLocation: { id: null, name: "Workspace" } },
    };
    expect(scopeReviewReplyFacts(ctx, multiple).brand.facts).toEqual({});
  });
  it("still withholds multi-branch unscoped facts when a source location is resolved", () => {
    const ctx: AgentContext = {
      ...context,
      action: { ...context.action, location: { ...context.action.location, id: null } },
      brand: { ...context.brand, facts: { address: "12 Unscoped Street" } },
      draftGrounding: { ...context.draftGrounding!, sourceLocation: { id: "branch-b", name: "Branch B" } },
    };
    expect(scopeReviewReplyFacts(ctx, true).brand.facts).toEqual({});
  });
  it("does not restore an address row removed from the current saved brand revision", () => {
    const ctx = { ...context, brand: { ...context.brand, revisionId: "current-saved-revision", facts: {} }, providedInputs: { address: "12 Old Street" } };
    expect(check("Address: 12 Old Street.", ctx)).toContain("unconfirmed_address");
  });
  it("does not restore a price row removed from the current saved brand revision", () => {
    const ctx = { ...context, brand: { ...context.brand, revisionId: "current-saved-revision", facts: {} }, providedInputs: { price: "HK$88" } };
    expect(check("HK$88", ctx)).toContain("unconfirmed_operational_fact");
  });
  it("retains confirmed legacy action address and price inputs when no current brand revision exists", () => {
    const ctx = { ...context, providedInputs: { address: "12 Legacy Street", price: "HK$88" } };
    expect(check("Address: 12 Legacy Street.", ctx)).toEqual([]);
    expect(check("HK$88", ctx)).toEqual([]);
  });
  it.each([
    ["single branch", false, {}, []],
    ["matched branch", true, { location_id: context.action.location.id }, []],
    ["updated single branch", false, {}, ["Current approved claim"]],
    ["updated matched branch", true, { location_id: context.action.location.id }, ["Current approved claim"]],
  ] as const)("rebuilds approved_claim from the current brand for %s", (_label, multipleLocations, facts, claims) => {
    const scoped = scopeReviewReplyFacts({
      ...context,
      brand: { ...context.brand, facts, approvedClaims: [...claims] },
      providedInputs: { approved_claim: "Old removed claim" },
    }, multipleLocations);
    expect(scoped.providedInputs.approved_claim).toBe(claims[0]);
    expect(JSON.stringify(scoped)).not.toContain("Old removed claim");
  });
  it.each(["We have added a host.", "We've added a host.", "We have already added a host.", "We have now added a host."])("withholds an unconfirmed completed operating change: %s", body => {
    expect(check(body)).toContain("unconfirmed_operational_fact");
  });
  it.each([
    "Our opening hours are 9am to 10pm daily.",
    "Enjoy our HK$88 offer this Friday.",
    "Bookings increased by 25% after our improvements.",
    "We will add a host at Friday lunch.",
    "本店每日營業至晚上十時。",
    "今日推出八折優惠。",
  ])("withholds unconfirmed operational review claims: %s", body => {
    expect(check(body)).not.toEqual([]);
  });
  it("allows a current confirmed operating statement, without trusting historical evidence", () => {
    const body = "Our opening hours are 9am to 10pm daily.";
    expect(check(body, { ...context, brand: { ...context.brand, facts: { hours: body } } })).toEqual([]);
    expect(check(body, { ...context, evidence: { hours: body } })).not.toEqual([]);
  });
  it("allows a literal price quoted from a retained review without treating it as the current price", () => {
    const ctx = { ...context, sampledReviews: [{ rating: 3, text: "The HK$300 meal was disappointing", time: null }] };
    expect(check('1. "The HK$300 meal was disappointing" - Thank you for your feedback. Please comment here.', ctx)).toEqual([]);
    expect(check("Our meal costs HK$300.", ctx)).not.toEqual([]);
  });
  it("checks operational assertions in the title and image description too", () => {
    const base: AgentOutput = { title: "Open daily until 10pm", body: "Thank you for your feedback.", warnings: [], acceptance_criteria: [], facts_used: [], facts_needed: [] };
    expect(unconfirmedDraftBusinessFacts(context, base)).not.toEqual([]);
    expect(unconfirmedDraftBusinessFacts(context, { ...base, title: "Reply", alt_text: "20% discount today" })).not.toEqual([]);
  });
  it("does not restore a removed current address from older saved action inputs", () => {
    const ctx = { ...context, brand: { ...context.brand, facts: { address: "" } }, providedInputs: { address: "12 Old Street" } };
    expect(check("Address: 12 Old Street.", ctx)).toContain("unconfirmed_address");
  });
  it("does not confirm an old action price after the latest brand price changes", () => {
    const ctx = { ...context, brand: { ...context.brand, facts: { price: "HK$99" } }, providedInputs: { price: "HK$88" } };
    expect(check("HK$88", ctx)).toContain("unconfirmed_operational_fact");
    expect(check("HK$99", ctx)).toEqual([]);
  });
  it.each(["多謝街坊一路支持！有問題歡迎留言聯絡我哋。", "Say hello in the comments or contact us online.", "期待下次再同大家見面。", "Please visit our website for information."])("allows ordinary greetings and contact-only next steps: %s", body => {
    expect(check(body)).toEqual([]);
  });
  it("does not accept a scanned or previously generated address as confirmation", () => {
    expect(check("94-96 How Ming Street", { ...context, evidence: { address: "94-96 How Ming Street" } })).toContain("unconfirmed_address");
  });
  it("allows only the verbatim owner-approved visit invitation", () => {
    const ctx = { ...context, brand: { ...context.brand, facts: { approved_visit_invitation: "Visit us by appointment." } } };
    expect(check("Visit us by appointment.", ctx)).toEqual([]);
    expect(check("Visit us anytime, no appointment needed.", ctx)).toContain("unconfirmed_visit_invitation");
  });
  it("cannot approve a visit just because an address is confirmed", () => {
    const ctx = { ...context, providedInputs: { address: "12 Example Street" } };
    expect(check("12 Example Street. Come visit us anytime.", ctx)).toContain("unconfirmed_visit_invitation");
  });
  it("does not alter the original output or confirmation data", () => {
    const output: AgentOutput = { title: "Greeting", body: "Come visit us anytime.", warnings: [], acceptance_criteria: [], facts_used: [], facts_needed: [] };
    const before = JSON.stringify({ output, context });
    unconfirmedDraftBusinessFacts(context, output);
    expect(JSON.stringify({ output, context })).toBe(before);
  });
  it.each(["Walk-ins are welcome.", "You are welcome to visit the shop anytime.", "Pick up your order at our office.", "有興趣可以過嚟參觀吓。", "Please do not visit us, but drop by after 5."])("withholds common unconfirmed physical invitations: %s", body => {
    expect(check(body)).toContain("unconfirmed_visit_invitation");
  });
  it.each(["歡迎隨時嚟電查詢。", "歡迎隨時來信聯絡我們。", "Please do not visit us or drop by.", "Visit us online."])("allows safe contact or explicit no-visit statements: %s", body => {
    expect(check(body)).toEqual([]);
  });
  it("does not accept a confirmed address embedded inside a changed floor", () => {
    const ctx = { ...context, brand: { ...context.brand, facts: { address: "1/F, Hung To Centre, 94-96 How Ming St, Kwun Tong" } } };
    expect(check("Find us at 21/F, Hung To Centre, 94-96 How Ming St, Kwun Tong.", ctx)).toContain("unconfirmed_address");
  });
  it("current brand facts override conflicting older action inputs", () => {
    const ctx = { ...context, brand: { ...context.brand, facts: { address: "22 New Road", visits: "No walk-ins." } }, providedInputs: { address: "12 Old Street", approved_visit_invitation: "Visit us anytime." } };
    expect(check("Address: 22 New Road.", ctx)).toEqual([]);
    expect(check("Address: 12 Old Street. Visit us anytime.", ctx)).toEqual(["unconfirmed_address", "unconfirmed_visit_invitation"]);
  });
  it("an explicit current restriction also overrides an approved invitation field", () => {
    const ctx = { ...context, brand: { ...context.brand, facts: { visits: "No walk-ins.", approved_visit_invitation: "Visit us anytime." } } };
    expect(check("Visit us anytime.", ctx)).toContain("unconfirmed_visit_invitation");
  });
  it.each(["United by our love of local culture.", "We make room for local stories.", "A roomy space for your imagination."])("does not mistake ordinary words for address identifiers: %s", body => {
    expect(check(body)).toEqual([]);
  });
  it("allows a confirmed address on its own line before contact text", () => {
    const address = "觀塘巧明街94-96號鴻圖中心1樓";
    const ctx = { ...context, brand: { ...context.brand, facts: { 地址: address } } };
    expect(check(`地址：${address}\n\n有問題歡迎留言聯絡我哋。`, ctx)).toEqual([]);
  });
  it.each(["Find us at Fake Plaza, 12 Example Street", "Address: 12 Example Street, Wrong District"])("withholds invented qualifiers around a confirmed address: %s", body => {
    const ctx = { ...context, brand: { ...context.brand, facts: { address: "12 Example Street" } } };
    expect(check(body, ctx)).toContain("unconfirmed_address");
  });
  it("allows a complete confirmed address clause", () => {
    const ctx = { ...context, brand: { ...context.brand, facts: { address: "12 Example Street" } } };
    expect(check("Find us at 12 Example Street. Please contact us with questions.", ctx)).toEqual([]);
  });
  it.each(["1 easy way to improve your visibility", "Please do not visit our shop.", "You cannot visit our office.", "請勿到店自取。"])("allows numbered prose and explicit prohibitions: %s", body => {
    expect(check(body)).toEqual([]);
  });
  it("still withholds a Way address introduced as an address", () => {
    expect(check("Address: 12 Heritage Way")).toContain("unconfirmed_address");
  });
  it.each(["Our email address: hello@example.com.", "電郵地址：hello@example.com。"])("allows an email address label: %s", body => {
    expect(check(body, { ...context, brand: { ...context.brand, facts: { email: "hello@example.com" } } })).toEqual([]);
  });
  it("visit approval cannot exempt a stale embedded address", () => {
    const ctx = { ...context, brand: { ...context.brand, facts: { address: "22 New Road" } }, providedInputs: { approved_visit_invitation: "Visit us at 12 Old Street." } };
    expect(check("Visit us at 12 Old Street.", ctx)).toContain("unconfirmed_address");
  });
  it("allows an exact approved invitation at the confirmed current address", () => {
    const invitation = "Visit us at 22 New Road.";
    const ctx = { ...context, brand: { ...context.brand, facts: { address: "22 New Road", approved_visit_invitation: invitation } } };
    expect(check(invitation, ctx)).toEqual([]);
  });
});
