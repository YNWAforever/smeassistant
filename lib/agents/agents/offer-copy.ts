import { CHANNEL_LIMITS } from "@/lib/offers/channels";
import type { AgentContext } from "../schema";
import { bodyLength, hashtagsPresent, healthClaim, unconfirmedDiscount, urgencyClaim, wrongMarketCurrency } from "../guardrails";
import { defineAgent, inputLine } from "../prompt";

/**
 * P4.1 promotion copy (docs/superpowers/specs/2026-10-01-offer-promotion-copy-design.md §4):
 * one channel-specific text draft from one owner-confirmed offer. The offer
 * arrives in the fenced evidence block (it is owner free text), with the price
 * and validity already formatted so the model copies rather than computes them.
 * gbp_post and social_post are untouched: their tasks forbid prices and offer
 * dates, which is right for them.
 */
const CHANNEL_DESCRIPTION: Record<NonNullable<AgentContext["offer"]>["channel"], string> = {
  google_post: "Google Business Profile post",
  instagram_post: "Instagram caption",
  whatsapp_message: "WhatsApp message",
  line_message: "LINE message",
};

const URGENCY_RULE = `The offer has no end date, so do not use urgency or scarcity wording ("limited time", "last chance", "while stocks last", "限時", "最後機會", "售完即止", or similar).`;

function channelTask(offer: NonNullable<AgentContext["offer"]>, ctx: AgentContext): string {
  switch (offer.channel) {
    case "google_post":
      return "A Google Business Profile post: under 300 characters for the opening line, the whole post under 1,500 characters, no hashtags, end with one plain call to action (visit, call or book).";
    case "instagram_post":
      return [
        offer.hasAsset
          ? `An approved photo is attached (alt text: ${inputLine(ctx, "alt_text")}). Describe only what the alt text says is in it and return alt_text — a plain, factual description under 125 characters.`
          : "This is a text-only post: do not describe a photo.",
        "Under 2,200 characters. At most five hashtags, relevant to the district and category.",
      ].join(" ");
    case "whatsapp_message":
    case "line_message": {
      const app = offer.channel === "line_message" ? "LINE" : "WhatsApp";
      return `A short message the owner will paste into ${app} themselves: under 500 characters, plain text, no hashtags, at most one emoji, no links unless one is in the brand facts. Do not say it was sent, and do not address a named person.`;
    }
  }
}

export const offerCopy = defineAgent({
  key: "offer_copy",
  capability: "Beta",
  promptVersion: "2026-10-01.1",
  role: "a copywriter promoting one owner-confirmed offer",
  evidence: (ctx) =>
    ctx.offer
      ? {
          offer: {
            title: ctx.offer.title,
            details: ctx.offer.details,
            terms: ctx.offer.terms,
            price_display: ctx.offer.priceDisplay,
            validity_display: ctx.offer.validityDisplay,
            approved_claims: ctx.offer.approvedClaims,
            channel: ctx.offer.channel,
            has_asset: ctx.offer.hasAsset,
          },
        }
      : { offer: null },
  task: (ctx) => {
    const offer = ctx.offer;
    // The run gate never lets an offer action reach here without a usable offer;
    // this branch only keeps the prompt total.
    if (!offer) return `There is no confirmed offer in the evidence. Return facts_needed: ["offer_confirmed"] and an empty body.`;
    return [
      `Write one ${CHANNEL_DESCRIPTION[offer.channel]} promoting the single confirmed offer in evidence.offer, in the brand voice (${inputLine(ctx, "brand_voice")}). Assert only facts that appear in evidence.offer or the brand facts.`,
      `Write the price exactly as offer.price_display, or state no price if it is null. Never calculate or state a discount, percentage, "original price", saving or free item unless those exact words appear in offer.details or offer.terms. State the validity only as offer.validity_display.`,
      ...(offer.openEnded ? [URGENCY_RULE] : []),
      `Never mention stock levels, ingredients, allergens, health or medical effects, or awards unless they appear in evidence.offer or the brand facts. If offer.terms is present, keep every condition it lists; you may shorten the wording but not change its meaning. If something you would need is missing, do not guess: name it in facts_needed.`,
      channelTask(offer, ctx),
      `Body: the ${CHANNEL_DESCRIPTION[offer.channel]} text only. acceptance_criteria: what the owner must check against the offer (price, dates, conditions${offer.channel === "instagram_post" && offer.hasAsset ? ", photo rights" : ""}) before using it.`,
    ].join("\n");
  },
  acceptance: (ctx, output) => {
    const channel = ctx.offer?.channel;
    if (!channel) return [];
    const limits = CHANNEL_LIMITS[channel];
    const warnings = [...bodyLength(output, limits.maxChars)];
    if (limits.maxHashtags === 0) warnings.push(...hashtagsPresent(output));
    else if ((output.body.match(/#[\p{L}\p{N}_]/gu) ?? []).length > limits.maxHashtags) warnings.push("too_many_hashtags");
    if (channel === "instagram_post" && ctx.offer?.hasAsset && !output.alt_text) warnings.push("alt_text_missing");
    return [...warnings, ...wrongMarketCurrency(ctx, output), ...unconfirmedDiscount(ctx, output), ...urgencyClaim(ctx, output), ...healthClaim(ctx, output)];
  },
});
