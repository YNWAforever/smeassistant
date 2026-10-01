// Deep import on purpose: reached by lib/workspace/runs.ts; see channels.ts.
import { MARKETS } from "@sme-scanner/region/src/config";
import { hasEnded } from "./dates";
import type { BindingStatus, OfferBinding, OfferRow, OfferUsability } from "./types";

export function marketCurrency(market: "hk" | "tw"): "HKD" | "TWD" {
  return MARKETS[market].merchantSearch.currency;
}

/**
 * Whether an action may draft from this offer now. Only "usable" satisfies the
 * offer_confirmed gate input; every other answer stops the run before the model.
 * The action's location must equal the offer's (both null allowed), so a
 * workspace-wide offer never lands on one location's drafts by accident and a
 * location's offer never reaches another location.
 */
export function offerUsability(
  offer: OfferRow | null,
  ctx: { workspaceId: string; actionLocationId: string | null; market: "hk" | "tw"; today: string },
): OfferUsability {
  if (!offer || offer.workspace_id !== ctx.workspaceId) return "missing";
  if (offer.status === "archived") return "archived";
  if (offer.status !== "confirmed") return "unconfirmed";
  if (hasEnded(offer, ctx.today)) return "ended";
  if ((offer.location_id ?? null) !== (ctx.actionLocationId ?? null)) return "wrong_location";
  if (offer.currency !== null && offer.currency !== marketCurrency(ctx.market)) return "wrong_currency";
  return "usable";
}

/**
 * Whether a version's recorded offer revision is still the confirmed, running
 * offer. Anything but "current" refuses approval and first export.
 */
export function bindingStatus(binding: OfferBinding | null, offer: OfferRow | null, today: string): BindingStatus {
  if (!binding || !offer || offer.id !== binding.id) return "unbound";
  if (offer.status === "archived") return "archived";
  if (offer.revision !== binding.revision) return "changed";
  if (offer.status !== "confirmed") return "unconfirmed";
  if (hasEnded(offer, today)) return "ended";
  return "current";
}
