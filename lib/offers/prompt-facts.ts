import type { AgentContext } from "@/lib/agents/schema";
import { offerPriceDisplay, validityText } from "./format";
import type { OfferChannel, OfferRow } from "./types";

export type OfferPromptFacts = NonNullable<AgentContext["offer"]>;

/**
 * The only offer shape that reaches the model. Prices and dates arrive already
 * formatted, so the model copies them rather than computing them. Prohibited
 * wording is merged into the brand's prohibited terms by the run, and ids,
 * authors and asset ids never leave the server.
 */
export function offerPromptFacts(
  offer: OfferRow,
  ctx: { locale: string; channel: OfferChannel; hasAsset: boolean },
): OfferPromptFacts {
  return {
    id: offer.id,
    revision: offer.revision,
    title: offer.title,
    details: offer.details,
    terms: offer.terms,
    priceDisplay: offerPriceDisplay(offer),
    validityDisplay: validityText(offer, ctx.locale),
    endsOn: offer.ends_on,
    openEnded: offer.open_ended,
    approvedClaims: [...offer.approved_claims],
    channel: ctx.channel,
    hasAsset: ctx.hasAsset,
  };
}
