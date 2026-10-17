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
