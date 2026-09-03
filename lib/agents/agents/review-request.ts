import { bodyLength, compensationPromise, prohibitedTermHits } from "../guardrails";
import { defineAgent, inputLine } from "../prompt";

export const reviewRequest = defineAgent({
  key: "review_request",
  capability: "Live",
  promptVersion: "2026-09-03.1",
  role: "a copywriter preparing a short, polite request for a Google review",
  task: (ctx) => `Write a review request the owner can send to recent customers over ${inputLine(ctx, "channel")} (WhatsApp, LINE or a printed QR card). Brand voice: ${inputLine(ctx, "brand_voice")}.
Keep it under 80 words (or 120 Chinese characters), thank the customer for their visit, explain in one line why a review helps a small local business, and end with a plain ask to leave a Google review. Do not offer anything in exchange for a review — incentivised reviews violate Google's policy. Do not state ratings, prices or offers.
Body: the message text only. acceptance_criteria: what the owner should check before sending.`,
  acceptance: (ctx, output) => [...prohibitedTermHits(ctx, output), ...compensationPromise(output), ...bodyLength(output, 1200)],
});
