import type { AgentContext, AgentOutput } from "./schema";

/** Presence is derived from the authorized context, never from model claims. */
export function reviewSource(ctx: AgentContext) {
  const sampled = (ctx.sampledReviews ?? []).filter(review =>
    Boolean(review.text.trim()) || (typeof review.rating === "number" && Number.isFinite(review.rating) && review.rating >= 1 && review.rating <= 5));
  const owner = ctx.providedInputs.reviews_without_response;
  return {
    sampled,
    kind: sampled.length ? (ctx.sampledReviewsSource === "visitor_pasted" ? "visitor_supplied" : "scan_evidence")
      : typeof owner === "string" && owner.trim() ? "owner_supplied" : "missing",
  } as const;
}

const REVIEW_QUESTION = /^(?:reviews_without_response|review text|評論內容|评论内容)$/iu;
export const isReviewQuestion = (value: string) => REVIEW_QUESTION.test(value.normalize("NFKC").trim());

/** Only discard the supplied review, preserving other genuinely missing inputs. */
export function withoutSuppliedReviewQuestion(value: string): string {
  return value.normalize("NFKC").split(/\s*(?:[,，、;；]|\band\b|[及與和])\s*/iu)
    .filter(part => !isReviewQuestion(part)).join(" and ").trim();
}

const normalizeReview = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\S\n]+/g, " ");
export function stripReviewQuotes(ctx: AgentContext, text: string): string {
  const source = reviewSource(ctx);
  const reviews = source.sampled.map(review => normalizeReview(review.text));
  const owner = ctx.providedInputs.reviews_without_response;
  if (!reviews.length && typeof owner === "string") reviews.push(normalizeReview(owner));
  return text.replace(/["“「]([^"”」\n]+)["”」]/gu, (quote, content: string) => {
    const excerpt = normalizeReview(content).replace(/(?:\.{3}|…)+$/u, "").trim();
    return excerpt && reviews.some(review => review.includes(excerpt)) ? "" : quote;
  });
}

const REVIEW_REQUEST = /\b(?:please\s+)?(?:provide|paste|send|share)\b.{0,45}\b(?:review text|review content|(?:the|your|original|full|actual) review|reviews_without_response)\b|(?:請|请|麻煩|麻烦|需要).{0,25}(?:評論內容|评论内容|評論文字|评论文字|完整評論|完整评论|評論原文|评论原文)/iu;
export function withoutReviewRequests(text: string): string {
  return text.replace(/[^.!?。！？\n]+[.!?。！？]?/gu,
    sentence => REVIEW_REQUEST.test(sentence) ? "" : sentence).trim();
}

/** Existing input cannot become either a repeated owner task or a fake draft. */
export function unusableExistingReviewQuestion(ctx: AgentContext, output: AgentOutput): boolean {
  const body = withoutReviewRequests(stripReviewQuotes(ctx, output.body));
  return ctx.action.templateKey === "review-response" && Boolean(ctx.draftGrounding)
    && reviewSource(ctx).kind !== "missing" && !/\p{L}/u.test(body);
}
