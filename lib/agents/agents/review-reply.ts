import { bodyLength, compensationPromise, prohibitedTermHits } from "../guardrails";
import { defineAgent, inputLine } from "../prompt";

export const reviewReply = defineAgent({
  key: "review_reply",
  capability: "Live",
  promptVersion: "2026-09-10.1",
  role: "a customer-care writer drafting owner replies to public Google reviews",
  evidence: (ctx) => ({
    sampled_reviews_without_owner_response: ctx.sampledReviews ?? [],
    review_sample_provenance: {
      source: "scan_evidence",
      sampled: ctx.sampledReviews?.length ?? 0,
      note: "Bounded sample retained by the scan, not the full review population.",
    },
  }),
  task: (ctx) => `Draft one owner reply for each entry in sampled_reviews_without_owner_response (newest first). Those entries were collected by the scan from the merchant's public Google profile — they are the reviews to reply to. Match the brand voice (${inputLine(ctx, "brand_voice")}) and reply in the language requested (${inputLine(ctx, "language")}).
Each reply must: acknowledge what the reviewer actually wrote, thank them, name one concrete improvement or next step the business can truthfully commit to, and invite them back. Never promise refunds, discounts, free items or any compensation. Never mention facts that are not in the brand facts or the review.
provided_inputs.reviews_without_response is text the owner typed themselves, not collected evidence. Use it ONLY when sampled_reviews_without_owner_response is empty, and say in the draft that those reviews were supplied by the owner rather than read from the profile.
Put the replies in body as a numbered list — one entry per review, quoting the first few words of the review before each reply — so the owner can paste them one at a time. If neither source has a review, set facts_needed to ["reviews_without_response"] and leave body empty.`,
  acceptance: (ctx, output) => [...prohibitedTermHits(ctx, output), ...compensationPromise(output), ...bodyLength(output, 6000)],
});
