import Stripe from "stripe";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/** True iff `header` is comma-separated parts that include a `t=<digits>`
 * timestamp and at least one `v1=<hex>` signature -- shaped like a real
 * Stripe signature header, whether or not it actually verifies. Used to
 * distinguish a malformed probe (400, no configuration check) from a
 * well-formed one that still fails verification. */
export function isWellFormedStripeSignature(header: string): boolean {
  const parts = header.split(",").map((part) => part.trim());
  const hasTimestamp = parts.some((part) => /^t=\d+$/.test(part));
  const hasSignature = parts.some((part) => /^v1=[0-9a-f]+$/i.test(part));
  return hasTimestamp && hasSignature;
}

/** Verifies a webhook payload against `secret` using the static
 * `Stripe.webhooks` helper, which needs no API key and is available even
 * when Stripe is otherwise unconfigured -- so signature verification can run
 * (and reject bad signatures with 400) before any "is Stripe configured"
 * check. Throws on a missing/invalid signature, exactly like the instance
 * method it replaces. */
export function constructWebhookEvent(
  rawBody: string,
  signature: string,
  secret: string,
): unknown {
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
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
