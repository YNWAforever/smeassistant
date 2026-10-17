import { describe, expect, it } from "vitest";
import { reviewReply } from "./review-reply";
import { normalizeMerchantReviewOutput } from "../draft-grounding";
import type { AgentContext } from "../schema";
import { overview } from "@/lib/assistant/__fixtures__";

const merchant: AgentContext = {
  locale: "en",
  market: "hk",
  brand: { voice: "warm", approvedClaims: [], prohibitedTerms: [], languages: ["en"], facts: {} },
  location: { name: "Example" },
  action: overview(),
  evidence: {},
  providedInputs: {},
  draftGrounding: { businessName: "Example", asOf: "2026-10-17T00:00:00Z", revisionSource: null },
};

const reply = (facts_needed: string[], body = "Thank you for your feedback. Please leave further comments in this review thread.") => ({
  title: "Review reply",
  body,
  acceptance_criteria: [],
  warnings: [],
  facts_used: [],
  facts_needed,
});

describe("review reply optional facts", () => {
  it("removes only the already supplied review part of a mixed question", () => {
    const ctx = { ...merchant, providedInputs: { reviews_without_response: "Helpful staff." } };
    expect(normalizeMerchantReviewOutput(ctx, reply(["reviews_without_response and language", "capacity及評論內容"])).facts_needed)
      .toEqual(["language", "capacity"]);
  });
  it("retains a real reply while removing a redundant request sentence", () => {
    const ctx = { ...merchant, providedInputs: { reviews_without_response: "Helpful staff." } };
    const output = normalizeMerchantReviewOutput(ctx, reply(["reviews_without_response"], "Thank you for your feedback. Please provide the review text."));
    expect(output.body).toBe("Thank you for your feedback.");
    expect(output.facts_needed).toEqual([]);
  });
  it.each([
    { name: "saved owner review", ctx: { ...merchant, providedInputs: { reviews_without_response: "Clear explanation, thank you." } } },
    { name: "selected scan review", ctx: { ...merchant, sampledReviews: [{ rating: 4, text: "Clear explanation.", time: null }] } },
    { name: "rating-only scan review", ctx: { ...merchant, sampledReviews: [{ rating: 5, text: "", time: null }] } },
  ])("does not ask again for the already available $name when a reply exists", ({ ctx }) => {
    const output = reply(["reviews_without_response", "language"]);
    const result = normalizeMerchantReviewOutput(ctx, output);
    expect(result.facts_needed).toEqual(["language"]);
    expect(result.body).toBe(output.body);
  });
  it("does not describe an empty scan as collected review evidence when owner text is available", () => {
    const prompt = reviewReply.buildPrompt({ ...merchant, providedInputs: { reviews_without_response: "Clear explanation.", brand_voice: "professional", language: "en" } });
    expect(prompt).toContain("REVIEW INPUT AVAILABLE: owner_supplied");
    expect(prompt).toContain("Do not request reviews_without_response again");
    expect(prompt).not.toContain("Those entries were collected by the scan");
    expect(prompt).toContain("Clear explanation.");
  });
  it.each(["", "   "])("retains a required review question when owner input is blank (%j)", text => {
    expect(normalizeMerchantReviewOutput({ ...merchant, providedInputs: { reviews_without_response: text } }, reply(["reviews_without_response"])).facts_needed).toEqual(["reviews_without_response"]);
  });
  it("does not treat an empty/unrated scan item as an available review", () => {
    expect(normalizeMerchantReviewOutput({ ...merchant, sampledReviews: [{ rating: null, text: "", time: null }] }, reply(["reviews_without_response"])).facts_needed).toEqual(["reviews_without_response"]);
  });
  it("does not clear a repeated review question when the body itself is only a clarification", () => {
    const ctx = { ...merchant, providedInputs: { reviews_without_response: "Helpful staff." } };
    expect(normalizeMerchantReviewOutput(ctx, reply(["reviews_without_response"], "Please provide the review text so I can write a reply.")).facts_needed)
      .toEqual(["reviews_without_response"]);
  });
  it("keeps facts_needed unchanged at the shared parser boundary used by public previews", () => {
    const parsed = reviewReply.outputSchema.parse(reply(["opening_hours"]));
    expect(parsed.facts_needed).toEqual(["opening_hours"]);
  });
  it.each(["address", "opening_hours", "phone_number", "contact details", "reviewer_name", "地址", "營業時間", "聯絡方式"])("omits optional %s when a safe contact-only reply exists", fact => {
    const result = normalizeMerchantReviewOutput(merchant, reviewReply.outputSchema.parse(reply([fact])));
    expect(result.facts_needed).toEqual([]);
    expect(result.body).toContain("review thread");
    expect(result.warnings).toContain(fact);
  });

  it.each(["reviews_without_response", "review text", "address and review text", "地址及評論內容"])("retains required or mixed missing input: %s", fact => {
    expect(normalizeMerchantReviewOutput(merchant, reviewReply.outputSchema.parse(reply([fact]))).facts_needed).toEqual([fact]);
  });

  it("does not turn an empty completion into a usable reply by dropping optional facts", () => {
    expect(normalizeMerchantReviewOutput(merchant, reviewReply.outputSchema.parse(reply(["address"], ""))).facts_needed).toEqual(["address"]);
  });
});
