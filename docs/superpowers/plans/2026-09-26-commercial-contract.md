# P3.3 Commercial Contract on Safe Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One versioned commercial contract in code, read by the server's allowance/rescan policy and by every price and plan surface, with billing closed (and saying so honestly) until an approval variable matches the contract version and Stripe is fully configured.

**Architecture:** `lib/commercial/contract.ts` holds the typed contract (allowances, rescan right, prices referenced from `MARKETS`). `lib/commercial/availability.ts` decides open/closed from env. Checkout and portal routes answer `503 billing_unavailable` when closed; the Stripe webhook verifies the signature before any configuration check. Server components resolve availability and contact links and pass them as props to the pricing, landing and billing views.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Vitest 4 + `react-dom/server` markup tests, `stripe` 22 (static `Stripe.webhooks`), `lib/messages/*.json` via `t()` from `lib/i18n.ts`.

**Spec:** `docs/superpowers/specs/2026-09-26-commercial-contract-design.md` (approved by the user 2026-09-26).

**Branch:** `claude/commercial-contract-design-3b8561` (session worktree; same base as `p33-commercial-contract`), stacked on `p35d-incident-runbook` (`aeb8513`). Diff base for "unchanged" checks: `aeb8513`.

## Global Constraints

- Contract version string: `"2026-09-baseline"`. Approval variable: `COMMERCIAL_CONTRACT_APPROVED`; billing is open only when it equals the version exactly (after trimming) **and** `STRIPE_SECRET_KEY`, `STRIPE_HK_TIER_PRICE_ID`, `STRIPE_TW_TIER_PRICE_ID`, `APP_ORIGIN` are all non-blank.
- Allowances: lite `3`, paid `null` (unlimited). Rescans: lite `false`, paid `true`. `seats: null` for both. Prices are `MARKETS.hk.pricing` / `MARKETS.tw.pricing` by reference; `packages/region` is not modified.
- `isWorkspacePaid` keeps its exact behaviour and stays the fail-closed boundary.
- Closed checkout/portal → `503 { error: "billing_unavailable" }`, returned after auth/role checks and before any Stripe call.
- Webhook: missing or malformed/invalid signature → `400` regardless of configuration; it never checks contract approval.
- Label copy (en) exactly: **"Subscriptions are not open yet — contact Fimmick"**. Price shown follows the market, never the locale.
- No migration. If one looks necessary, stop and ask.
- **Do not write the strings `seat limit`, `seat_limit`, `max_members`, `member_limit`, `pooled_allowance` or `seats_included` anywhere under `app/` or `lib/` (comments included).** `tests/unhonoured-promises.test.ts` treats any match as "a seat cap is implemented" and fails. `seats: null` is safe.
- New strings live in a new `commercial` namespace in `lib/messages/{en,zh-HK,zh-TW}.json`; zh-HK uses 香港書面中文, zh-TW 台灣用語.
- Every commit: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test` green for the touched area; end messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push.

## Review Focus

1. `COMMERCIAL_CONTRACT_APPROVED=""` or whitespace-only → treated as unset: closed, `contract_unapproved`, **no** warning log. A value equal to the version with surrounding spaces → accepted. (Task 2 test.)
2. Approval matches but a Stripe variable or `APP_ORIGIN` is whitespace-only → `provider_unconfigured`, not open. (Task 2 test.)
3. A manager/viewer (or unauthenticated caller) hitting checkout or portal while billing is closed still gets the auth error (`403`/`401`), not `503` — availability must not be checked before authorization. (Task 2 test.)
4. Webhook with no `STRIPE_WEBHOOK_SECRET` and a header like `t=123` (no `v1`) or `t=123,v1=zz` (non-hex) → `400`, not `500`. (Task 3 test.)
5. Market with no configured contact channel (all `NEXT_PUBLIC_*` contact vars empty) → the "not open" label renders as plain text with no `<a>` and no empty `href`. (Task 4 and Task 5 tests.)

## Where this plan departs from the spec, and why

1. **Two existing webhook tests change.** The mock of `@/lib/stripe` gains `constructWebhookEvent` (verification moves off the API-key client so it can run when Stripe is unconfigured), and "refuses to run without STRIPE_WEBHOOK_SECRET" sends a well-formed header (`t=1,v1=abc123`), because the spec makes a malformed header `400`. Assertions are otherwise unchanged.
2. **The checkout route test opens billing in `beforeEach`** by stubbing the approval and Stripe env; without that every existing case would get `503`. Assertions unchanged.
3. **Pricing footnote.** `funnel.pricing.planNote` says "Growth Workspace is billed via Stripe" — an unsupported claim while closed. When closed the pricing page shows `funnel.landing.planNote` instead (existing string, no new copy).
4. **"Free's allowance line"** is added as a feature line on the pricing page's Free card, worded as the free *workspace* allowance (`commercial.allowanceLine`: "Free workspace: {count} approved deliveries a month"), since that card is the free scan.

## File map

| File | Responsibility |
|---|---|
| `lib/commercial/contract.ts` (new) | `COMMERCIAL_CONTRACT`, `tierAllows` |
| `lib/commercial/availability.ts` (new) | `billingAvailability` |
| `lib/commercial/presentation.ts` (new) | `allowanceText`, `contactHrefFor`, `publicBilling` |
| `lib/workspace/entitlement.ts` | `deliveryAllowanceForTier` reads the contract |
| `app/api/workspaces/[workspaceId]/rescan/route.ts` | uses `tierAllows(tier, "rescans")` |
| `app/api/workspaces/[workspaceId]/{checkout-link,billing-portal}/route.ts` | `503` when closed |
| `lib/stripe.ts` | `constructWebhookEvent`, `isWellFormedStripeSignature` |
| `app/api/webhooks/stripe/route.ts` | signature first |
| `lib/messages/*.json`, `tests/i18n.test.ts` | `commercial` namespace |
| `components/public-pages.tsx`, `app/[locale]/pricing/page.tsx` | pricing Growth card closed/open |
| `components/landing-page.tsx`, `app/[locale]/page.tsx` | landing Growth card closed/open |
| `components/workspace/billing-view.tsx`, `app/[locale]/owner/[workspaceSlug]/settings/billing/page.tsx` | billing buttons only when open |
| `.env.example` | documents `COMMERCIAL_CONTRACT_APPROVED` |
| `docs/implementation/owner-platform-v1/PHASE-3-{REPORT,TEST-RESULTS}.md` | phase record |

---

### Task 1: The contract and the server policy that reads it

**Files:**
- Create: `lib/commercial/contract.ts`, `lib/commercial/contract.test.ts`
- Modify: `lib/workspace/entitlement.ts` (`deliveryAllowanceForTier`), `app/api/workspaces/[workspaceId]/rescan/route.ts:8,77`

**Interfaces:**
- Produces: `COMMERCIAL_CONTRACT` (shape exactly as spec §1, declared `as const satisfies { version: string; period: string; tiers: Record<WorkspaceTier, { deliveryAllowance: number | null; rescans: boolean; seats: null }>; prices: Record<Market, MarketPricing> }`); `type CommercialRight = "rescans"`; `tierAllows(tier: string | null | undefined, right: CommercialRight): boolean` — `false` unless `isWorkspaceTier(tier)`.

- [ ] **Step 1: Write the failing test** `lib/commercial/contract.test.ts`:

```ts
it("pins today's behaviour as the baseline contract", () => {
  expect(COMMERCIAL_CONTRACT.version).toBe("2026-09-baseline");
  expect(COMMERCIAL_CONTRACT.tiers.lite).toEqual({ deliveryAllowance: 3, rescans: false, seats: null });
  expect(COMMERCIAL_CONTRACT.tiers.paid).toEqual({ deliveryAllowance: null, rescans: true, seats: null });
  expect(COMMERCIAL_CONTRACT.prices.hk).toBe(MARKETS.hk.pricing); // same object, not a copy
  expect(COMMERCIAL_CONTRACT.prices.tw).toBe(MARKETS.tw.pricing);
});
it("deliveryAllowanceForTier reads the contract", () => {
  expect(deliveryAllowanceForTier("lite")).toBe(COMMERCIAL_CONTRACT.tiers.lite.deliveryAllowance);
  expect(deliveryAllowanceForTier("paid")).toBeNull();
});
it("tierAllows fails closed", () => {
  expect(tierAllows("paid", "rescans")).toBe(true);
  expect(tierAllows("lite", "rescans")).toBe(false);
  for (const bad of [null, undefined, "", "growth", "PAID", "toString", "__proto__"]) expect(tierAllows(bad, "rescans")).toBe(false);
});
```

- [ ] **Step 2: Run** `corepack pnpm exec vitest run lib/commercial/contract.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `lib/commercial/contract.ts`; change `deliveryAllowanceForTier` body to `return COMMERCIAL_CONTRACT.tiers[tier].deliveryAllowance;` (update its doc comment to point at the contract); in the rescan route replace `isWorkspacePaid(tier)` with `tierAllows(tier, "rescans")` and its import. Import type-only from `entitlement.ts` inside `contract.ts` to avoid a runtime cycle.
- [ ] **Step 4: Run** `corepack pnpm exec vitest run lib/commercial lib/workspace "app/api/workspaces/[workspaceId]/rescan"` — Expected: PASS, existing entitlement and rescan tests untouched.
- [ ] **Step 5: Commit** `feat(P3.3): one versioned commercial contract read by allowance and rescan policy`

### Task 2: Billing availability, and closed checkout/portal routes

**Files:**
- Create: `lib/commercial/availability.ts`, `lib/commercial/availability.test.ts`, `app/api/workspaces/[workspaceId]/billing-portal/route.test.ts`
- Modify: `app/api/workspaces/[workspaceId]/checkout-link/route.ts`, `.../checkout-link/route.test.ts`, `.../billing-portal/route.ts`, `.env.example`

**Interfaces:**
- Consumes: `COMMERCIAL_CONTRACT.version` (Task 1).
- Produces: `type BillingAvailability = { open: true } | { open: false; reason: "contract_unapproved" | "provider_unconfigured" }`; `billingAvailability(env: Record<string, string | undefined> = process.env): BillingAvailability`.

- [ ] **Step 1: Write the failing tests.** `availability.test.ts` (pass an explicit env object; spy on `console.warn`):
  - `{}` → `{ open: false, reason: "contract_unapproved" }`, warn not called.
  - `{ COMMERCIAL_CONTRACT_APPROVED: "" }` and `"   "` → `contract_unapproved`, warn not called.
  - `"2026-08-old"` → `contract_unapproved`, warn called once with `("[commercial] approval_mismatch", { expected: "2026-09-baseline" })`.
  - `" 2026-09-baseline "` with full Stripe env → `{ open: true }`.
  - Matching approval with no Stripe env → `provider_unconfigured`; then `it.each(["STRIPE_SECRET_KEY","STRIPE_HK_TIER_PRICE_ID","STRIPE_TW_TIER_PRICE_ID","APP_ORIGIN"])` each set to `"  "` with the rest full → `provider_unconfigured`.
  - Full env → `{ open: true }`.

  In `checkout-link/route.test.ts`: add to `beforeEach` `vi.stubEnv` for `COMMERCIAL_CONTRACT_APPROVED="2026-09-baseline"`, `STRIPE_SECRET_KEY="sk_test_fixture"`, `STRIPE_HK_TIER_PRICE_ID="price_hk"`, `STRIPE_TW_TIER_PRICE_ID="price_tw"`. New cases:
  - `vi.stubEnv("COMMERCIAL_CONTRACT_APPROVED", "")` → status `503`, body `{ error: "billing_unavailable" }`, `state.customer` and `state.checkout` not called.
  - closed **and** `state.load` resolves `{ access: { ok: false, code: "forbidden", status: 403 }, workspace: null }` → `403` (Review Focus 3).

  New `billing-portal/route.test.ts` with the same mocking style (mock `@/lib/owner/billing-authorization` and `@/lib/stripe` with `billingPortal.sessions.create`): open + customer → `200 { url }`; closed → `503 billing_unavailable`, portal create not called; closed + auth refused → `403`; open + no `stripe_customer_id` → `409 no_subscription` (today's behaviour).

- [ ] **Step 2: Run** `corepack pnpm exec vitest run lib/commercial "app/api/workspaces/[workspaceId]/checkout-link" "app/api/workspaces/[workspaceId]/billing-portal"` — Expected: FAIL.
- [ ] **Step 3: Implement.** `billingAvailability` trims every value. In both routes insert, immediately after the `if (!workspace) … 403` block, `if (!billingAvailability().open) return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });`. Leave the existing `stripeConfigured`/`APP_ORIGIN`/price checks after it. In `.env.example`, after `STRIPE_TW_TIER_PRICE_ID=`, add a commented line `# COMMERCIAL_CONTRACT_APPROVED=2026-09-baseline` with a one-line comment: billing stays closed unless this equals the contract version in `lib/commercial/contract.ts` and all Stripe variables plus `APP_ORIGIN` are set.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS, including every pre-existing checkout case.
- [ ] **Step 5: Commit** `feat(P3.3): billing stays closed until the contract is approved and Stripe is configured`

### Task 3: The webhook verifies the signature first

**Files:**
- Create: `app/api/webhooks/stripe/route.unconfigured.test.ts`
- Modify: `lib/stripe.ts`, `app/api/webhooks/stripe/route.ts:120-155`, `app/api/webhooks/stripe/route.test.ts` (mock + one test, see departure 1)

**Interfaces:**
- Produces (in `lib/stripe.ts`): `constructWebhookEvent(rawBody: string, signature: string, secret: string): unknown` — wraps static `Stripe.webhooks.constructEvent` (confirmed present in the installed `stripe`), needs no API key; `isWellFormedStripeSignature(header: string): boolean` — true iff comma-separated parts include `t=<digits>` and at least one `v1=<[0-9a-f]+>`.

- [ ] **Step 1: Write the failing tests** in `route.unconfigured.test.ts` — **no** `vi.mock("@/lib/stripe")`; mock only `@/lib/repositories/billing` (throwing if called). Use `Stripe.webhooks.generateTestHeaderString({ payload: "{}", secret })` from `stripe`.
  - Key and webhook secret both `""`: no header → `400`; `"bad"` → `400`; `"t=123"` → `400`; `"t=123,v1=zz"` → `400`; `"t=1,v1=abc123"` → `500` `{ error: "STRIPE_WEBHOOK_SECRET is not configured" }`.
  - Key `""`, secret `whsec_real`: header signed with `whsec_other` → `400`; header signed with `whsec_real` → `500` `{ error: "Stripe is not configured" }`.
  - `isWellFormedStripeSignature` unit cases for the four headers above plus `"t=1,v0=aa,v1=bb"` → true.

  In `route.test.ts`: add `constructWebhookEvent: constructEvent` to the `@/lib/stripe` mock; change the no-secret test to `webhookRequest("t=1,v1=abc123")`.
- [ ] **Step 2: Run** `corepack pnpm exec vitest run app/api/webhooks/stripe` — Expected: new file FAILS.
- [ ] **Step 3: Implement** the handler order in `route.ts`: (1) missing header → 400; (2) secret blank: malformed header → 400 `Invalid signature`, else 500 `STRIPE_WEBHOOK_SECRET is not configured`; (3) `constructWebhookEvent(rawBody, signature, secret)` throws → 400 `Invalid signature` (keep the `console.error`); (4) `!stripeConfigured()` → 500 `Stripe is not configured`; (5) `getStripeClient()` and the unchanged event handling. Update the file's doc comment with one sentence on the order.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS, all signed/duplicate cases unchanged.
- [ ] **Step 5: Commit** `fix(P3.3): the Stripe webhook rejects unsigned probes with 400 before any configuration check`

### Task 4: Copy namespace and the public price surfaces

**Files:**
- Create: `lib/commercial/presentation.ts`, `lib/commercial/presentation.test.ts`, `components/pricing-page.test.tsx`
- Modify: `lib/messages/{en,zh-HK,zh-TW}.json`, `tests/i18n.test.ts:27`, `components/public-pages.tsx` (`PricingPage`), `app/[locale]/pricing/page.tsx`, `components/landing-page.tsx` (props + Growth card, lines ~60 and ~519), `app/[locale]/page.tsx`, `components/landing-page.test.tsx`

**Interfaces:**
- Consumes: `COMMERCIAL_CONTRACT`, `billingAvailability` (Tasks 1–2).
- Produces: `allowanceText(locale: string, tier: WorkspaceTier): string` — `t(locale,"commercial.unlimitedLine")` when the tier's allowance is null, else `t(locale,"commercial.allowanceLine",{ count })`; `contactHrefFor(market: Market): string | null` = `getMarketCtas(market)[0]?.href ?? null`; `interface PublicBilling { open: boolean; contactHref: Record<Market, string | null> }` and `publicBilling(): PublicBilling`.
- Component props: `PricingPage({ locale, market, billing }: { …; billing: PublicBilling })`, `LandingPage({ locale, market, billing })`.

Messages (exact):

| key | en | zh-HK | zh-TW |
|---|---|---|---|
| `commercial.notOpen` | Subscriptions are not open yet — contact Fimmick | 訂閱暫未開放 — 請聯絡 Fimmick | 訂閱尚未開放 — 請聯絡 Fimmick |
| `commercial.contactFimmick` | Contact Fimmick | 聯絡 Fimmick | 聯絡 Fimmick |
| `commercial.allowanceLine` | Free workspace: {count} approved deliveries a month | 免費工作台：每月 {count} 次核准後交付 | 免費工作台：每月 {count} 次核准後交付 |
| `commercial.unlimitedLine` | Unlimited approved deliveries a month | 每月不限核准後交付次數 | 每月不限核准後交付次數 |

- [ ] **Step 1: Write the failing tests.**
  - `tests/i18n.test.ts`: add `"commercial"` to `APP_NAMESPACES`.
  - `presentation.test.ts`: `allowanceText("en","lite")` = `"Free workspace: 3 approved deliveries a month"`; `allowanceText("zh-HK","paid")` = `"每月不限核准後交付次數"`; `contactHrefFor("hk")` null with no env, and `https://wa.me/85291234567` with `NEXT_PUBLIC_HK_WHATSAPP_NUMBER=+85291234567` stubbed.
  - `components/pricing-page.test.tsx` (render with `renderToStaticMarkup` into a jsdom node like `landing-page.test.tsx`): for each `market` in `hk`,`tw` × locale `en`,`zh-HK`: closed → Growth card contains `formatMarketPrice(MARKETS[market].pricing)` (HK$888 for hk regardless of locale; NT$2,800 for tw even with `en`), contains `t(locale,"commercial.notOpen")`, has no link to `/owner/sign-in?plan=growth`, and the page does not contain "billed via Stripe"/"透過 Stripe 訂閱"; with `contactHref.hk = "https://wa.me/85291234567"` the label wraps an `<a href="https://wa.me/85291234567">`; with `null` there is no `<a>` inside the label (Review Focus 5). Open → the `/owner/sign-in?plan=growth` link is present and the label absent. Free card lists `allowanceText(locale,"lite")`; Growth features include `allowanceText(locale,"paid")`.
  - `landing-page.test.tsx`: update the render helper to pass `billing={{ open: false, contactHref: { hk: null, tw: null } }}`; add: closed → Growth article contains `commercial.notOpen` and `commercial.unlimitedLine`; open → no `notOpen`.
- [ ] **Step 2: Run** `corepack pnpm exec vitest run tests/i18n.test.ts lib/commercial components/pricing-page.test.tsx components/landing-page.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** Add the messages. `PricingPage`: Growth `features[0]` → `allowanceText(locale,"paid")`; Free `features` gains `allowanceText(locale,"lite")` last; when `!billing.open` the Growth card replaces its button with `<p className="limitation-note">` holding the label (anchor to `contactHref[market]` when non-null, plain text otherwise) and the footnote uses `copy[locale].funnel.landing.planNote`. Landing Growth card: replace the hard-coded "unlimited approved deliveries" segment with `allowanceText(locale,"paid")` and, when closed, append the same label for the currently selected market. Route files call `publicBilling()` and pass it; the landing route stays static (value fixed at build — recorded as a known limit).
- [ ] **Step 4: Run** the Step 2 command, then `corepack pnpm exec vitest run tests/unhonoured-promises.test.ts tests/workspace-copy.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(P3.3): public prices read the contract and say subscriptions are not open yet`

### Task 5: Workspace billing page shows buttons only when billing is open

**Files:**
- Create: `components/workspace/billing-view.test.tsx`
- Modify: `components/workspace/billing-view.tsx`, `app/[locale]/owner/[workspaceSlug]/settings/billing/page.tsx`

**Interfaces:**
- Consumes: `billingAvailability`, `contactHrefFor` (Tasks 2, 4).
- Produces: `BillingViewProps` gains `billingOpen: boolean; contactHref: string | null`.

- [ ] **Step 1: Write the failing test** `billing-view.test.tsx` (markup render). Fixture model: lite, usage `{ period: "2026-09", approvedDeliveries: 1, allowance: 3 }`, one tier event, `stripeCustomer: false`, `marketPrice: MARKETS.hk.pricing`.
  - owner + closed → no button text "Subscribe via Stripe"/"Manage billing"/"透過 Stripe 訂閱"/"管理帳單"; contains `t(locale,"commercial.notOpen")`; still shows `1 / 3` and the tier-history row; heading "Subscribe to unlock the Growth Workspace" absent.
  - owner + open → "Subscribe via Stripe" present, label absent; paid + customer + open → "Manage billing".
  - manager + closed → no Subscribe/Manage buttons (enabled or disabled), label present.
  - `contactHref: null` → label has no `<a>`; `"mailto:hello@example.com"` → `<a href="mailto:hello@example.com">`.
- [ ] **Step 2: Run** `corepack pnpm exec vitest run components/workspace/billing-view.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** When `billingOpen`: today's markup exactly. When closed: in place of the `plan-actions` block render the label note (all roles); the payment-lifecycle `h2` for a lite workspace shows `t(locale,"commercial.notOpen")` instead of "Subscribe to unlock…". The page resolves `billingOpen = billingAvailability().open` and `contactHref = contactHrefFor(market)` from `page.ctx.workspace.market` (fall back to `null` when not `hk|tw`).
- [ ] **Step 4: Run** the Step 2 command plus `corepack pnpm exec vitest run components/workspace` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(P3.3): the billing page offers Stripe only when billing is open`

### Task 6: Gates, mutation checks and the phase record

**Files:**
- Modify: `docs/implementation/owner-platform-v1/PHASE-3-REPORT.md`, `docs/implementation/owner-platform-v1/PHASE-3-TEST-RESULTS.md` (append `## P3.3 — commercial contract on safe defaults`)

- [ ] **Step 1: Confirm nothing forbidden changed.** `git diff --stat aeb8513 -- packages neon/migrations lib/repositories/billing.ts` — Expected: empty.
- [ ] **Step 2: Gates, one at a time:** `corepack pnpm typecheck`, `lint`, `test`, `test:integration`, `db:verify`, `build`. Expected: all exit 0 except `build`, which may be **blocked** by the standing Turbopack/radix-ui cascade on this Windows machine — record as blocked and run `npx next build --webpack` as a labelled diagnostic. Record counts and explain the unit-test delta file by file against the P3.5d record's numbers. `e2e` not run locally (needs a production build); CI runs it.
- [ ] **Step 3: Mutation checks** (scratch script; apply by exact pattern that must match once, run the named file, restore bytes, compare): (a) in `availability.ts` make the approval comparison always true → `availability.test.ts` and the checkout/portal closed cases fail; (b) in the webhook move the `stripeConfigured()` check before the header check → `route.unconfigured.test.ts` fails; (c) `tierAllows` returns `true` for any string → `contract.test.ts` fails; (d) Growth card ignores `billing.open` → `pricing-page.test.tsx` fails. Record killed/survived.
- [ ] **Step 4: Append the phase record** matching the P3.5a/P3.5d section structure: header (branch, HEAD, base `aeb8513`, links to spec and plan, bold **Implemented and locally verified. Nothing here is hosted-verified.**), what this closes (Master Plan §6 P3.3), commits table, the departures above, verification table, and the spec's §6 known limits plus: the landing page's availability is fixed at build time; opening billing = set `COMMERCIAL_CONTRACT_APPROVED=2026-09-baseline` and full Stripe config, then redeploy; P3.5d (PR #23) was merged into `p35b-failure-view` after that branch reached `main`, so neither P3.5d nor this branch is on `main` yet.
- [ ] **Step 5: Commit** `docs(P3.3): record the commercial contract and its evidence`
