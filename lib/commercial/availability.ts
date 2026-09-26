import { COMMERCIAL_CONTRACT } from "./contract";

/**
 * Billing (checkout + portal) stays closed until someone has explicitly
 * approved the current commercial contract *and* Stripe is fully configured
 * for both markets -- see docs/superpowers/specs/2026-09-26-commercial-
 * contract-design.md §2/§4. `contract_unapproved` and `provider_unconfigured`
 * are both "closed"; only the caller needs to know it can't offer billing,
 * so routes collapse either reason to the same 503.
 */
export type BillingAvailability =
  | { open: true }
  | { open: false; reason: "contract_unapproved" | "provider_unconfigured" };

const STRIPE_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_HK_TIER_PRICE_ID",
  "STRIPE_TW_TIER_PRICE_ID",
  "APP_ORIGIN",
] as const;

/**
 * Reads `COMMERCIAL_CONTRACT_APPROVED` and the Stripe/APP_ORIGIN variables
 * from the given env (defaults to `process.env` so callers don't have to
 * thread it through). Every value is trimmed before comparison, so a blank
 * or whitespace-only value reads as unset rather than as a mismatch --
 * unset is the ordinary "not approved yet" state and never warns; a
 * *present but wrong* value is a configuration mistake worth a warning.
 */
export function billingAvailability(
  env: Record<string, string | undefined> = process.env,
): BillingAvailability {
  const approved = env.COMMERCIAL_CONTRACT_APPROVED?.trim();
  if (!approved) {
    return { open: false, reason: "contract_unapproved" };
  }
  if (approved !== COMMERCIAL_CONTRACT.version) {
    console.warn("[commercial] approval_mismatch", {
      expected: COMMERCIAL_CONTRACT.version,
    });
    return { open: false, reason: "contract_unapproved" };
  }

  const providerConfigured = STRIPE_ENV_KEYS.every((key) => Boolean(env[key]?.trim()));
  if (!providerConfigured) {
    return { open: false, reason: "provider_unconfigured" };
  }

  return { open: true };
}
