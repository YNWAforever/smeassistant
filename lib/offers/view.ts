import { hasEnded, notStarted } from "./dates";
import { offerPriceDisplay, validityText } from "./format";
import type { OfferRow } from "./types";

export type OfferPhase = "running" | "upcoming" | "draft" | "ended" | "archived";

/** What a page or route shows; who confirmed or created it stays on the server. */
export type OfferView = Omit<OfferRow, "created_by" | "confirmed_by"> & {
  priceDisplay: string | null;
  validity: string;
  phase: OfferPhase;
  draftCount: number;
};

export function offerPhase(offer: Pick<OfferRow, "status" | "starts_on" | "ends_on">, today: string): OfferPhase {
  if (offer.status === "archived") return "archived";
  if (offer.status === "draft") return "draft";
  if (hasEnded(offer, today)) return "ended";
  return notStarted(offer, today) ? "upcoming" : "running";
}

export function toOfferView(offer: OfferRow, ctx: { today: string; locale: string; draftCount?: number }): OfferView {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { created_by, confirmed_by, ...rest } = offer;
  return { ...rest, priceDisplay: offerPriceDisplay(offer), validity: validityText(offer, ctx.locale), phase: offerPhase(offer, ctx.today), draftCount: ctx.draftCount ?? 0 };
}

/** The route-level market: anything but "tw" is Hong Kong, as runs.ts reads it. */
export function workspaceMarket(market: string | null | undefined): "hk" | "tw" {
  return market?.toLowerCase() === "tw" ? "tw" : "hk";
}
