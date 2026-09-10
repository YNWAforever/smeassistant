import { describe, expect, it } from "vitest";
import { templateByKey } from "./templates";
import { applyResolvedInputs, resolveEvidenceInputs, selectScannedReviews } from "./evidence-inputs";

const review = (over: Record<string, unknown> = {}) => ({ rating: 3, text: "Fine", time: "2026-08-01T00:00:00Z", ...over });
const rawData = (reviews: unknown[]) => ({ gbp: { reviews } });

describe("selectScannedReviews", () => {
  it("keeps only unanswered reviews with text, newest first", () => {
    const selection = selectScannedReviews(rawData([
      review({ rating: 2, text: "Slow service", time: "2026-08-30T00:00:00Z" }),
      review({ rating: 5, text: "Great", time: "2026-08-31T00:00:00Z", owner_response: "Thank you" }),
      review({ rating: 4, text: "Good", time: "2026-08-31T00:00:00Z" }),
    ]));
    expect(selection.sampled.map((r) => r.text)).toEqual(["Good", "Slow service"]);
    // `inspected` is what the scan RETAINED, not what it replied to.
    expect(selection.inspected).toBe(3);
  });

  it("caps each excerpt so a long review cannot dominate the prompt", () => {
    const selection = selectScannedReviews(rawData([review({ text: "x".repeat(900) })]));
    expect(selection.sampled[0].text).toHaveLength(500);
  });

  it("reports nothing to draft from when there is no usable review", () => {
    expect(selectScannedReviews(null)).toEqual({ sampled: [], inspected: 0 });
    expect(selectScannedReviews({})).toEqual({ sampled: [], inspected: 0 });
    expect(selectScannedReviews(rawData([]))).toEqual({ sampled: [], inspected: 0 });
    const answered = selectScannedReviews(rawData([review({ owner_response: "Thanks" })]));
    expect(answered.sampled).toEqual([]);
    expect(answered.inspected).toBe(1);
  });
});

describe("resolveEvidenceInputs", () => {
  it("answers the review input from stored evidence, and nothing else", () => {
    expect([...resolveEvidenceInputs({ rawData: rawData([review({ text: "Slow service" })]) })]).toEqual(["reviews_without_response"]);
  });

  it("resolves nothing when the scan retained no unanswered review", () => {
    expect(resolveEvidenceInputs({ rawData: rawData([review({ owner_response: "Thanks" })]) }).size).toBe(0);
    expect(resolveEvidenceInputs({ rawData: null }).size).toBe(0);
  });

  it("never claims to answer owner knowledge", () => {
    const resolved = resolveEvidenceInputs({ rawData: rawData([review({ text: "Slow service" })]) });
    // brand_voice and language are read through ctx.providedInputs, so removing
    // them from required_inputs would blank the prompt AND hide the input form.
    for (const key of ["brand_voice", "language", "approved_claim", "cta_link", "channel", "owner_fact_1", "menu_items"]) {
      expect(resolved.has(key)).toBe(false);
    }
  });
});

describe("applyResolvedInputs", () => {
  it("leaves the owner only what the evidence cannot answer", () => {
    const required = templateByKey("review-response").requiredInputs;
    expect(required).toContain("reviews_without_response");
    expect(applyResolvedInputs(required, new Set(["reviews_without_response"]))).toEqual(
      required.filter((key) => key !== "reviews_without_response"),
    );
    expect(applyResolvedInputs(required, new Set())).toEqual([...required]);
  });
});
