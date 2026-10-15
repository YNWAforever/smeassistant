import { describe, expect, it } from "vitest";
import { unconfirmedDraftBusinessFacts } from "./draft-grounding";
import { overview } from "@/lib/assistant/__fixtures__";
import type { AgentContext, AgentOutput } from "./schema";

const context: AgentContext = { locale: "zh-HK", market: "hk", brand: { voice: "warm", approvedClaims: [], prohibitedTerms: [], languages: ["zh-HK"], facts: {} }, location: { name: "Example" }, action: overview(), evidence: {}, providedInputs: {}, draftGrounding: { businessName: "Example", asOf: "2026-10-15T00:00:00Z", revisionSource: null } };
const check = (body: string, ctx = context) => unconfirmedDraftBusinessFacts(ctx, { title: "Greeting", body, warnings: [], acceptance_criteria: [], facts_used: [], facts_needed: [] });

describe("assistant business fact guard", () => {
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
});
