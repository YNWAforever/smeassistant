import { bodyLength, compensationPromise } from "../guardrails";
import { defineAgent, inputLine } from "../prompt";
import type { AgentContext } from "../schema";

/** Ruling R4 (P4.5): a visitor-pasted review is never described as scan evidence. */
function visitorPasted(ctx: AgentContext): boolean {
  return ctx.sampledReviewsSource === "visitor_pasted";
}

const SCAN_SOURCE_SENTENCE = "Those entries were collected by the scan from the merchant's public Google profile — they are the reviews to reply to.";
const VISITOR_SOURCE_SENTENCE =
  "That entry was pasted by a visitor and has not been verified as coming from the merchant's public Google profile — treat it only as the review to reply to.";

export const reviewReply = defineAgent({
  key: "review_reply",
  capability: "Live",
  promptVersion: "2026-10-15.1",
  role: "a customer-care writer drafting owner replies to public Google reviews",
  evidence: (ctx) => ({
    sampled_reviews_without_owner_response: ctx.sampledReviews ?? [],
    review_sample_provenance: visitorPasted(ctx)
      ? {
          source: "visitor_supplied",
          sampled: ctx.sampledReviews?.length ?? 0,
          note: "Pasted by a visitor; not verified as coming from the merchant's public profile.",
        }
      : {
          source: "scan_evidence",
          sampled: ctx.sampledReviews?.length ?? 0,
          note: "Bounded sample retained by the scan, not the full review population.",
        },
  }),
  task: (ctx) => `Draft one owner reply for each entry in sampled_reviews_without_owner_response (newest first). ${visitorPasted(ctx) ? VISITOR_SOURCE_SENTENCE : SCAN_SOURCE_SENTENCE} Match the brand voice (${inputLine(ctx, "brand_voice")}) and reply in the language requested (${inputLine(ctx, "language")}).
Each reply must acknowledge what the reviewer actually wrote and thank them. Any concrete improvement, operational promise or next step needs current owner confirmation; do not invent one to complete the reply. If no next step is confirmed, use a contact-only next step inviting further feedback in the review thread. Do not add a physical return-visit invitation unless it is explicitly confirmed and permitted by the business fact grounding policy. Never promise refunds, discounts, free items or any compensation. A review describes the reviewer's words, not confirmation of current business facts or policies.
For a rating-only review, thank the reviewer for the rating; do not infer a visit, purchase or customer experience, admit an unreported service failure, or promise future operational changes. Do not carry forward unsupported claims or invitations from an older draft. Apply the same factual limits to the title and any image description. For text-only review replies, omit alt_text.
provided_inputs.reviews_without_response is text the owner typed themselves, not collected evidence. Use it ONLY when sampled_reviews_without_owner_response is empty, and say in the draft that those reviews were supplied by the owner rather than read from the profile.
Put the replies in body as a numbered list — one entry per review, quoting the first few words of the review before each reply — so the owner can paste them one at a time. If neither source has a review, set facts_needed to ["reviews_without_response"] and leave body empty.${ctx.toneInstruction ? `\nTone: ${ctx.toneInstruction}` : ""}`,
  acceptance: (ctx, output) => [...compensationPromise(output), ...bodyLength(output, 6000)],
});
