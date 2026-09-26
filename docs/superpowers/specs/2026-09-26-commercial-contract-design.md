# P3.3 — Commercial contract on safe defaults: design

**Date:** 2026-09-26 · **Branch:** `p33-commercial-contract` (stacked on `p35d-incident-runbook`, PR #23) · **Status:** approved in brainstorming, awaiting spec review

## Why

Master Plan §6 P3.3 ("Reconcile billing, allowance and seats atomically") asks for "one versioned commercial contract read by server policy and presentation … Avoid a third hard-coded pricing copy table", allowance updates on tier change that are safe against concurrent exports and duplicate billing events, seat limits only if the approved plan has them, and "Keep unconfigured billing unavailable, not falsely successful. Test the unsigned negative boundary and duplicate valid events separately." DEC-08/09 are open, so their safe defaults apply: preserve existing behaviour as the regression baseline, remove unsupported claims, leave checkout unavailable, no invented price.

Today:

- Commercial facts live in three places: `lib/workspace/entitlement.ts` (tiers, `deliveryAllowanceForTier`: lite 3, paid unlimited), `packages/region/src/config.ts` (`MARKETS[m].pricing`: HK$888 / NT$2,800 per location per month) and the hand-written plan copy in `components/public-pages.tsx` and `lib/copy.ts`.
- The workspace billing page always shows "Subscribe via Stripe" to owners (`components/workspace/billing-actions.tsx`), even with Stripe unconfigured; clicking yields a toast from a `500`. That is an unsupported claim.
- The Stripe webhook checks provider configuration **before** the signature, so an unsigned probe on an unconfigured deployment gets `500` instead of the required `400`; the unit test stubs Stripe as configured, so this path is untested.
- Already done: mid-period allowance reconciliation on tier change (`applyTier`, one locked transaction, idempotent by `stripe_event_id`) and owner-run rescan wording (PHASE-3-REPORT P3.1 items).
- No seat limit exists and none is claimed.

## Decisions (user, 2026-09-26)

| Question | Decision |
|---|---|
| How to continue Phase 3 | **Build P3.3 and P3.5c on safe defaults**; decisions configurable, off |
| Public Growth price while billing is closed | **Keep the baseline price, labelled "Subscriptions are not open yet — contact Fimmick"**; no Subscribe button anywhere until approved |
| Approach | **A — typed contract in code + approval env var** (`COMMERCIAL_CONTRACT_APPROVED` must equal the contract version) |

## 1. The contract — `lib/commercial/contract.ts`

```ts
export const COMMERCIAL_CONTRACT = {
  version: "2026-09-baseline",
  period: "calendar_month_workspace_timezone", // workspace_usage.period = 'YYYY-MM' in the workspace timezone
  tiers: {
    lite: { deliveryAllowance: 3, rescans: false, seats: null },
    paid: { deliveryAllowance: null, rescans: true, seats: null }, // null allowance = unlimited
  },
  prices: { hk: MARKETS.hk.pricing, tw: MARKETS.tw.pricing }, // HK$888 / NT$2,800 per location per month
} as const;
```

- `seats: null` = no seat limit; nothing claims one, and none is enforced.
- `rescans: true` covers owner "Rescan now" and the monthly schedule it creates (schedules are created on the paid rescan path).
- Only rights the code actually enforces appear in the contract.
- Prices are referenced from `MARKETS`, not copied, so there is one number per market (`packages/region` is unchanged).

**Server policy reads it:**
- `deliveryAllowanceForTier(tier)` returns `COMMERCIAL_CONTRACT.tiers[tier].deliveryAllowance`.
- `isWorkspacePaid` stays the fail-closed authorization boundary (`tier === "paid"`); a new helper `tierAllows(tier, "rescans")` reads the contract and is used by the rescan route instead of `isWorkspacePaid` directly (same behaviour today).
- `applyTier` keeps writing the allowance via `deliveryAllowanceForTier` (unchanged transaction).
- Existing entitlement, billing and rescan tests are the regression baseline and must pass unchanged.

## 2. Billing availability — `lib/commercial/availability.ts`

```ts
export type BillingAvailability =
  | { open: true }
  | { open: false; reason: "contract_unapproved" | "provider_unconfigured" };
export function billingAvailability(env = process.env): BillingAvailability;
```

- `contract_unapproved` unless `env.COMMERCIAL_CONTRACT_APPROVED === COMMERCIAL_CONTRACT.version` (the default). A set but different value logs `console.warn("[commercial] approval_mismatch", { expected: COMMERCIAL_CONTRACT.version })`; unset logs nothing.
- `provider_unconfigured` when the approval matches but `STRIPE_SECRET_KEY`, `STRIPE_HK_TIER_PRICE_ID`, `STRIPE_TW_TIER_PRICE_ID` or `APP_ORIGIN` is missing.
- `{ open: true }` otherwise.
- `.env.example` documents `COMMERCIAL_CONTRACT_APPROVED` (commented out) next to the Stripe block.
- A changed price or allowance is a reviewed code change with a new `version`; the old approval then no longer matches, so an approval never silently covers new terms.

**Routes:**
- `POST /api/workspaces/[id]/checkout-link` and `POST /api/workspaces/[id]/billing-portal`: after authentication and role checks, `billingAvailability()` first; closed → **`503 { error: "billing_unavailable" }`** before any Stripe call (today: `500`).
- `POST /api/webhooks/stripe`: read the raw body and the `stripe-signature` header and **verify the signature first**. Missing or invalid signature → **`400`** whether or not Stripe is configured (verification needs `STRIPE_WEBHOOK_SECRET`; if that is absent, an unsigned or malformed signature is still `400`, and only a request that carries a syntactically valid signature header reaches the `500` "not configured" answer). Signed-event handling, idempotency and duplicate-event behaviour are unchanged. The webhook does **not** check contract approval: a genuine signed event must always be recorded.

## 3. Presentation

- **Public pricing page and landing plans:** the Growth card reads its price and unit from the contract (by market, never by locale). While `billingAvailability().open` is false it shows the label **"Subscriptions are not open yet — contact Fimmick"** with the market's contact channel (`getMarketCtas(market)[0]`, text-only when none is configured) and no subscribe CTA; when open, the existing sign-in CTA returns. Free's allowance line ("3 approved deliveries a month") and Growth's "unlimited" wording are derived from the contract's allowances. Multi-location and Managed are unchanged ("Contact Fimmick").
- **Workspace billing page:** `Subscribe via Stripe` and `Manage billing` render only when billing is open, resolved on the server and passed as a prop. While closed: the same "not open yet" note and contact link, plus today's tier, usage and tier history.
- **Upgrade prompts:** the rescan tier note and the export allowance message keep their wording and link to the billing page, which now explains honestly; no prompt implies buying is possible while closed.
- **Copy:** a new `commercial` namespace in `lib/messages/{en,zh-HK,zh-TW}.json` (`notOpen`, `contactFimmick`, `allowanceLine`, `unlimitedLine`), added to `APP_NAMESPACES` in `tests/i18n.test.ts`.

## 4. Error handling

- Approval mismatch or absence → closed; never a false success.
- Closed billing routes answer `503 billing_unavailable`, not `500`.
- The webhook's unconfigured `500` is reachable only with a signature header present; unsigned probes are `400`.

## 5. Testing

- **Unit:** contract values equal today's behaviour (allowance lite 3 / paid null, rescans lite false / paid true, prices equal `MARKETS`); `billingAvailability` for unset, mismatched (logs), matching without Stripe, matching with each Stripe variable missing, and open; checkout and portal → `503 billing_unavailable` with no Stripe call when closed, and today's behaviour when open; webhook with the **real** (unstubbed) configuration check: missing signature → 400 and invalid signature → 400 with Stripe unconfigured; signed/duplicate tests unchanged; pricing page and landing plans in HK and TW (independent of locale) show the price and the "not open yet" label and no subscribe CTA, and the normal CTA when open; billing view has no Subscribe/Manage buttons when closed and both when open; `commercial` copy in all three locales.
- **Integration:** the existing billing integration test (`applyTier` writes the contract allowance; lite→paid mid-period) passes unchanged.
- **Mutation checks:** remove the approval comparison → the availability and route tests fail; move the webhook's configuration check back before the signature → the unconfigured-400 test fails.

## 6. Known limits (to record in the Phase 3 report)

- No seat limits (none exist or are claimed).
- No trial/pilot, upgrade, downgrade, rollover, top-up or over-limit rules beyond today's behaviour — they wait for DEC-08.
- No Stripe test-mode run — waits for DEC-09.
- Paid tier arrives only through the Stripe webhook; this app has no staff grant.
- Opening billing requires both the approval variable and a full Stripe configuration, then a redeploy.
- No migration. If implementation finds one is needed, stop and ask before adding it.
