import { bodyLength, compensationPromise, prohibitedTermHits } from "../guardrails";
import { defineAgent, inputLine } from "../prompt";

export const reviewReply = defineAgent({
  key: "review_reply",
  capability: "Live",
  promptVersion: "2026-09-03.1",
  role: "a customer-care writer drafting owner replies to public Google reviews",
  evidence: (ctx) => ({ sampled_reviews_without_owner_response: ctx.sampledReviews ?? [] }),
  task: (ctx) => `Draft one owner reply for each sampled review that has no owner response (newest first). Match the brand voice (${inputLine(ctx, "brand_voice")}) and reply in the language requested (${inputLine(ctx, "language")}).
Each reply must: acknowledge what the reviewer actually wrote, thank them, name one concrete improvement or next step the business can truthfully commit to, and invite them back. Never promise refunds, discounts, free items or any compensation. Never mention facts that are not in the brand facts or the review.
Put the replies in body as a numbered list — one entry per review, quoting the first few words of the review before each reply — so the owner can paste them one at a time. If no reviews are supplied, set facts_needed to ["reviews_without_response"] and leave body empty.`,
  acceptance: (ctx, output) => [...prohibitedTermHits(ctx, output), ...compensationPromise(output), ...bodyLength(output, 6000)],
});
