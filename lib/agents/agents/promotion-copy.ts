import { bodyLength } from "../guardrails";
import { offerDatesMissing, offerPriceMismatch, offerProhibitedHits, promotionChannel, type OfferEvidence } from "../offer-checks";
import { defineAgent, inputLine } from "../prompt";
import type { AgentContext } from "../schema";

/**
 * The confirmed offer the run read, as the evidence block carries it
 * (`ctx.evidence.offer`). Absent when the context was built without one, in
 * which case only the generic checks run -- the run gate blocks an offer
 * action with no usable offer before any model call.
 */
function offerOf(ctx: AgentContext): OfferEvidence | null {
  const offer = ctx.evidence.offer;
  if (typeof offer !== "object" || offer === null) return null;
  const candidate = offer as Partial<OfferEvidence>;
  return typeof candidate.valid_from === "string" && typeof candidate.valid_until === "string" ? (candidate as OfferEvidence) : null;
}

/** The rules both channels share (spec §2.3 "Both"). */
function offerRules(offer: OfferEvidence | null): string {
  const price = offer && offer.price === null
    ? "The offer has no price: state no price at all."
    : "State the price exactly once, with its currency, as given in the offer block.";
  return [
    "The offer block is the only allowed source of price, currency, dates and terms.",
    price,
    "State the validity dates (valid_from and valid_until) in the draft.",
    "Mention the terms only as written in the offer block. Add no \"limited\", stock, ingredient, allergen or eligibility claims that are not in the offer block or the brand facts.",
  ].join("\n");
}

export const promotionCopy = defineAgent({
  key: "promotion_copy",
  capability: "Beta",
  promptVersion: "2026-10-01.1",
  role: "a copywriter drafting one promotion for a confirmed offer",
  task: (ctx) => {
    const offer = offerOf(ctx);
    if (promotionChannel(ctx.action.templateKey) === "instagram") {
      const photo = offer?.photo_alt_text
        ? "A photo is attached; its alt text is offer.photo_alt_text in the evidence. Describe only what that alt text says is in it and return alt_text: a plain, factual description under 125 characters."
        : "This is a text-only post: do not describe a photo.";
      return `Write one Instagram caption announcing the offer in the offer block of the evidence (under 220 words, or 300 Chinese characters). Brand voice: ${inputLine(ctx, "brand_voice")}. Use at most five hashtags.
${offerRules(offer)}
${photo}
Body: the caption. acceptance_criteria: what the owner must confirm (the price, the dates, the terms, the photo rights) before posting.`;
    }
    return `Write one Google Business post announcing the offer in the offer block of the evidence (keep the summary under 300 characters; the hard limit is 1,500). Brand voice: ${inputLine(ctx, "brand_voice")}. End with one plain call to action (visit, call, book).
${offerRules(offer)}
Body: the post text. acceptance_criteria: what the owner must confirm (the price, the dates, the terms, the button type) before publishing.`;
  },
  acceptance: (ctx, output) => {
    const instagram = promotionChannel(ctx.action.templateKey) === "instagram";
    const warnings = [...bodyLength(output, instagram ? 2500 : 1500)];
    if (instagram && (output.body.match(/#/g) ?? []).length > 5) warnings.push("too_many_hashtags");
    const offer = offerOf(ctx);
    if (offer) {
      const text = `${output.title}\n${output.body}\n${output.alt_text ?? ""}`;
      if (offerPriceMismatch(text, offer)) warnings.push("offer_price_mismatch");
      if (offerDatesMissing(output.body, offer)) warnings.push("offer_dates_missing");
      // The run merges the offer's prohibited terms into the brand's, so the brand list is the merged list.
      if (offerProhibitedHits(text, ctx.brand.prohibitedTerms).length > 0) warnings.push("offer_prohibited_term");
    }
    return warnings;
  },
});
