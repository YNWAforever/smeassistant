import Stripe from "stripe";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/** Throws if unconfigured -- callers are server-only staff/webhook routes that
 * should fail loudly, not degrade silently like the public-facing lib/llm.ts. */
export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Stripe is not configured");
  return new Stripe(key, { apiVersion: "2026-08-26.dahlia" });
}

/** Market-keyed price id for the owner-facing self-serve checkout routes,
 * separate from STRIPE_PLACEHOLDER_TIER_PRICE_ID (the staff-only route's
 * single global price) -- self-serve checkout must charge the workspace's
 * own market's price, not one shared price across both currencies. */
export function getWorkspacePriceId(market: "hk" | "tw"): string | null {
  const envVar = market === "hk" ? "STRIPE_HK_TIER_PRICE_ID" : "STRIPE_TW_TIER_PRICE_ID";
  return process.env[envVar]?.trim() || null;
}
