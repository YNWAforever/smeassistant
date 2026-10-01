# P4.1 — Confirmed offers and a promotion-copy workflow: design

**Date:** 2026-10-01 · **Branch:** `p4-1-offers` (from `origin/main` at `dc55e02`, PR #27) · **Status:** approved by Willy on 2026-10-01 as written. Q1–Q3 were not answered separately, so the proposed decisions D1–D10 are what this branch builds.

## Why

Master Plan §7 P4.1 (`docs/implementation/owner-platform-v1/MASTER-IMPLEMENTATION-PLAN.md`, "P4.1 — Add confirmed offers and a promotion-copy workflow · NEW", sources E1 and Capability Matrix §§3–4) says:

> * Add an `offers` model only after inspecting whether newer code already has one. Store workspace/location scope, owner-confirmed title/details, price/currency where applicable, validity period, terms, approved claims, prohibited wording, source/confirmation status and optional rights-cleared asset references.
> * Keep offer facts distinct from generated variants. Do not infer price, expiry, stock, ingredients, allergens or claims from an image or an incomplete description.
> * Reuse existing `social-post`, `gbp-post` or other appropriate copy capabilities through the authorized action/run/version model. Capability labels alone do not prove a publishing API exists.
> * Generate channel-specific **text drafts**, using one confirmed offer and brand context. No built-in image generation is assumed; offer owner-uploaded rights-cleared assets or an explicitly labelled human photo brief.
> * Decide and show the delivery unit before generation/export: several separately approved versions may create several qualifying deliveries under existing rules. Do not quietly count a whole campaign as one delivery or charge multiple deliveries for repeated export of one version.
> * Test expired/unconfirmed offers, wrong-market currency, prohibited claims, location access, changed offer facts and a reused historical approved output. A changed source offer never mutates an immutable prior output.

The Phase 4 acceptance gate (§7.2) asks for "a confirmed offer produces reusable, correctly scoped promotion drafts", and the Phase 4 exit demonstration (§3) is "Confirm one offer → create channel-specific drafts → review exact versions → export under the existing ledger; re-use context in the next work cycle."

This is the second Phase 4 slice. The user chose the order on 2026-09-30 (`PHASE-4-REPORT.md`, "Slice order"): **P4.4 contract → P4.1 offers and promotion copy → P4.2 work packs → P4.3 contextual assistant.** P4.4 is merged (PR #27, `dc55e02`). P4.5 (preview) and P4.6 (publishing) stay unbuilt and off: DEC-12 and DEC-13 are not authorized.

### What exists at `dc55e02`

* **No offers model.** `grep -rni "offer"` over `lib/`, `app/`, `components/`, `neon/` finds only prompt text that *forbids* offers (`lib/agents/agents/gbp-post.ts:9`, `social-post.ts:13`, `review-request.ts:10`, guardrail line 1 in `lib/agents/guardrails.ts:22`), demo copy (`lib/demo-data.ts:181`) and the Capability Matrix's "Offers | **No** | Proposed" row (`sources/AGENT-TOOL-CAPABILITY-MATRIX.md` §4). The Master Plan's precondition ("only after inspecting whether newer code already has one") is satisfied: there is none.
* **The workflow contract** is `WorkflowDefinition` in `lib/workspace/templates.ts:69-105`, one row per template in `TEMPLATES` (`:123-409`), enforced by `lib/workspace/templates.contract.test.ts`. Inputs are typed `confirmed_fact | evidence | preference`; the pre-model gate is `gateBlockingInputs` (`lib/workspace/workflow-inputs.ts:53`), with `asset_or_text_only` the only server-satisfied key (`SERVER_SATISFIED_INPUT_KEYS`, `:43`).
* **The run path** is `runAgentForAction` (`lib/workspace/runs.ts:266-488`): budget check → workspace/brand/location reads → `AgentContext` → `satisfiedInputs` (`:205`) → gate (`:387-399`) → `persistence.queue/start/finish`. `finish` (`lib/repositories/artifacts.ts:367-389`) creates the version with a fixed `meta` (`title`, `acceptance_criteria`, `warnings`, `facts_used`, `agent_key`, `prompt_version`).
* **Approval and delivery** are the SQL RPCs `approve_output_version` and `export_output_version` (`neon/migrations/0004_atomic_operations.sql`), wrapped by `lib/workspace/versions.ts` and called from `app/api/versions/[versionId]/{approve,export}/route.ts`. The first export of an approved version counts one delivery against `workspace_usage`; the lite allowance is 3 (`lib/commercial/contract.ts`).
* **Assets** have rights review (`assets.rights_status`), and `socialAssetSatisfied` (`runs.ts:182`) plus `assetUsableByAction` (`lib/workspace/assets.ts:97`) decide whether an asset may be used by an action.
* **Market facts** live in the vendored region package: `MARKETS[market].merchantSearch.currency` (`HKD` / `TWD`) and `MARKETS[market].contact.channel` (`whatsapp` / `line`) in `packages/region/src/config.ts`.
* **Owner objectives** become actions through `POST /api/actions` (`app/api/actions/route.ts`) with `source = 'owner_objective'` and a dedupe key from `objectiveDedupeKey` (`app/api/actions/_shared/mutation.ts:174`). Calendar shows open actions with a `due_at` (`lib/workspace/queries-pages.ts:927`).

## Scope and non-goals

**In scope:** an owner-confirmed, workspace/location-scoped offer record; three channel-specific promotion-copy workflows defined as rows of the P4.4 contract; a pre-model gate that refuses unconfirmed, expired or wrong-market offers; an immutable binding from each draft version to the exact offer revision it was written from; the delivery-unit notice before generation; offer screens; tests for every case the Master Plan lists.

**Not in scope (and why):**

* **No sending or publishing.** Delivery stays `export_copy` (guardrail 6, the contract's "never publishes" test). WhatsApp and LINE drafts are text the owner copies; the Capability Matrix §3 says "Ship only with copy that never implies sending is connected — there is no sender." P4.6 is separately gated (DEC-13).
* **No image generation and no image reading.** No model ever sees asset pixels; an asset contributes only its owner-written alt text. The "explicitly labelled human photo brief" is the existing Beta `gbp-photo-pack` workflow (`photo_brief` agent), linked from the offer screen, not a new generator.
* **No work packs.** An offer's channel drafts are ordinary actions that share an `offer_id`. There is no pack table, no "approve all", no pack-level retry ledger; that is P4.2 (Master Plan §7 P4.2: "Define a pack as a grouping of ordinary evidence-linked actions…").
* **No assistant changes.** `DRAFT_AGENTS` (`lib/assistant/live.ts:75`) is unchanged; the assistant cannot create, confirm or edit an offer. Suggesting "promote your offer" is P4.3.
* **No delivery-counting change.** `deliveryUnit` stays `"approved_version"`; DEC-14 is open and its safe default applies.
* **No change to existing prompts.** The 11 existing entries in `lib/agents/__snapshots__/agents.test.ts.snap` stay byte-identical; only new entries are added.
* **No recurring/scheduled promotions** ("weekly promotion" automation needs DEC-10 and a scheduler decision). Re-use in the next cycle is "start a new offer from this one", by hand.
* **No real-model evaluation run** (DEC-04). New corpus cases run with canned outputs only.

## Decisions proposed for review (2026-10-01)

| # | Question | Proposed decision | Why |
| --- | --- | --- | --- |
| D1 | Where offers live | New table `offers` (migration `0011_offers.sql`) plus `actions.offer_id`. Offer facts are never written into `brand_profiles` or `provided_inputs`. | Master Plan: "Keep offer facts distinct from generated variants." A separate table gives revisions, confirmation and scope their own columns and checks. |
| D2 | Which agent writes the copy | One new Beta agent, `offer_copy`, whose task text is chosen per channel. It reuses the shared prompt skeleton (`composePrompt`), the shared acceptance checks and the channel limits of `gbp_post` / `social_post`, but not their task text. | The existing `gbp_post` and `social_post` tasks explicitly forbid prices and offer dates, which is right for them; changing them would change two working prompts and their snapshots. Reuse is of the action/run/version model, the guardrails and the channel rules. **Open question Q1.** |
| D3 | Channels | Three templates: `offer-gbp-post` (Google Business post), `offer-social-post` (Instagram caption), `offer-chat-message` (WhatsApp in `hk`, LINE in `tw`, from `MARKETS[market].contact.channel`). | The two copy channels the product already drafts for, plus the market's customer-chat channel named in CLAUDE.md ("Hong Kong (HKD, WhatsApp) and Taiwan (TWD, LINE)"). |
| D4 | Delivery unit | One approved version = one delivery, exactly as today. Preparing three channel drafts can lead to at most three counted deliveries; re-copying one exported version never counts again. The screen says so, with this period's usage, **before** "Prepare drafts". | DEC-14 safe default ("Keep existing per-approved-version export semantics. No bundle counting change."). **Open question Q3.** |
| D5 | Changed or expired offer | Each version records `meta.offer = { id, revision }`. Approval and *first* export of an offer-bound version are refused (409) when the offer is no longer confirmed at that revision, has ended, or is archived. Re-copying an already-exported version is allowed (it counts nothing) with a banner. Nothing in SQL changes and no prior version is mutated. | Guardrail 14: an old draft would otherwise put an unconfirmed price in front of customers. Prior approvals are not revoked (Master Plan §2.2.2). **Open question Q2.** |
| D6 | Offer lifecycle | `draft → confirmed → archived`. Editing any fact of a confirmed offer returns it to `draft` and increments `revision`; the owner must confirm again. Archive is terminal; "Start a new offer from this one" pre-fills a new draft (dates cleared). | Keeps "confirmed" meaning "the owner confirmed exactly these facts", and supports the "re-use context in the next work cycle" demonstration without mutating history. |
| D7 | End date | Confirmation requires either an `ends_on` date or an explicit "no fixed end date" choice (`open_ended = true`). With no end date the copy may not use urgency or scarcity wording. | Master Plan: "Do not infer … expiry". Silence about the end date must be a deliberate owner choice, not a gap the model fills. |
| D8 | Who may manage offers | Owners, and managers in location scope (same as "Generate drafts, edit, save version, provide inputs" in CLAUDE.md §3.9). A manager with a non-null `location_scope` may only create or confirm offers for a location in that scope, never a workspace-wide offer. Viewers read only. | `inLocationScope(m, null)` returns true for scoped managers (`lib/auth.ts:50`), which is acceptable for an objective but would let a scoped manager put facts on every location's drafts. |
| D9 | Tier gating | None beyond today's: offers and generation are available on every tier, generation is free, and the delivery allowance applies at export. | CLAUDE.md §3.10: `isWorkspacePaid` gates rescans, schedules and Fix Pack generation only; the commercial contract lists no promotion right. Adding a paywall would be a commercial decision nobody has made. |
| D10 | Activation | `OFFERS_ENABLED === "true"` (exact string, like `ASSISTED_ASSIGNMENT_ENABLED`) gates every offer route, page and entry link. Default off. | Master Plan §2.3: keep new features off by default. Migration 0011 must be applied before the code deploys (see Rollout). |

## 1. Data — migration `neon/migrations/0011_offers.sql`

Additive, in the 0009/0010 style: no `BEGIN/COMMIT`, `IF NOT EXISTS`, RLS enabled, `REVOKE ALL … FROM PUBLIC`, `GRANT SELECT, INSERT, UPDATE, DELETE … TO sme_app_runtime`, `DROP POLICY IF EXISTS` + `CREATE POLICY server_application`. Matching Drizzle table `offers` in `lib/db/schema/business.ts` (`pgTable(…).enableRLS()` pattern), and `offerId` on the `actions` table.

### Table `offers`

| column | type / constraint | notes |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` |  |
| `workspace_id` | `uuid not null` → `workspaces(id) on delete cascade` |  |
| `location_id` | `uuid` → `locations(id) on delete cascade` | null = workspace-wide. Cascade, not set null: a location's offer must never silently widen to every location. |
| `title` | `text not null` | 1–120 chars (app-validated) |
| `details` | `text not null` | what is included, 1–1,000 chars |
| `terms` | `text` | conditions, ≤ 1,000 chars |
| `price_amount` | `numeric(12,2)` | check `>= 0` |
| `currency` | `text` | check `currency is null or currency in ('HKD','TWD')`; check `(price_amount is null) = (currency is null)` |
| `starts_on` | `date not null` |  |
| `ends_on` | `date` | check `ends_on is null or ends_on >= starts_on` |
| `open_ended` | `boolean not null default false` | check `not (open_ended and ends_on is not null)` |
| `approved_claims` | `text[] not null default '{}'` | claims the owner approves for this offer only |
| `prohibited_wording` | `text[] not null default '{}'` | merged with the brand's prohibited terms at run time |
| `asset_ids` | `uuid[] not null default '{}'` | ≤ 4; each must be an `approved` asset usable at the offer's location (validated on write and again at run time; no FK, the same as `provided_inputs.asset_id` today) |
| `source` | `text not null default 'owner_form'` | check `source in ('owner_form')`. The only source today; a later assisted or imported source needs its own decision. |
| `status` | `text not null default 'draft'` | check `status in ('draft','confirmed','archived')` |
| `revision` | `integer not null default 1` | check `revision >= 1`; +1 on every fact edit |
| `confirmed_by` | `uuid` → `app_users(id) on delete set null` |  |
| `confirmed_at` | `timestamptz` | check `status <> 'confirmed' or (confirmed_at is not null and (ends_on is not null or open_ended))` |
| `created_by` | `uuid` → `app_users(id) on delete set null` |  |
| `created_at`, `updated_at` | `timestamptz not null default now()` |  |
| `archived_at` | `timestamptz` | check `(status = 'archived') = (archived_at is not null)` |

Index: `offers_workspace_idx (workspace_id, status, starts_on desc)`.

### Column `actions.offer_id`

`alter table public.actions add column if not exists offer_id uuid references public.offers(id) on delete set null;` plus `actions_offer_idx (offer_id) where offer_id is not null`. Set null rather than cascade: deleting an offer (only possible through a workspace or location deletion) must not delete versions or delivery history. An offer action whose `offer_id` became null is blocked by the gate (§3) and can never be drafted again.

There is no offer delete route. Archive is the only removal.

### What the migration does not touch

`actions_source_check` is unchanged: offer actions use `source = 'owner_objective'`, which the action-derivation sweep ignores (it only reads `source='finding'`, `lib/repositories/action-derivation.ts:111`). No change to `output_versions`, `deliveries`, `workspace_usage` or any SQL function. The binding to an offer revision lives in `output_versions.meta` (jsonb), which already exists.

## 2. Contracts and types — `lib/offers/`

All new modules are pure unless named a repository. Modules reached by `runs.ts` import the region package through the deep subpath `@sme-scanner/region/src/config`, as `lib/workspace/evidence-inputs.ts:5` does, so `eval:workflows --check-load` still loads.

```
// lib/offers/types.ts
export type OfferStatus = "draft" | "confirmed" | "archived";
export interface OfferRow {
  id: string; workspace_id: string; location_id: string | null;
  title: string; details: string; terms: string | null;
  price_amount: string | null; currency: "HKD" | "TWD" | null;
  starts_on: string; ends_on: string | null; open_ended: boolean;
  approved_claims: string[]; prohibited_wording: string[]; asset_ids: string[];
  source: "owner_form"; status: OfferStatus; revision: number;
  confirmed_by: string | null; confirmed_at: string | null;
  created_by: string | null; created_at: string; updated_at: string; archived_at: string | null;
}
/** What a version records about the offer it was written from. */
export interface OfferBinding { id: string; revision: number }
export type OfferUsability = "usable" | "missing" | "unconfirmed" | "ended" | "archived" | "wrong_location" | "wrong_currency";
export type BindingStatus = "current" | "changed" | "ended" | "unconfirmed" | "archived" | "unbound";
```

| Module | Exports |
| --- | --- |
| `lib/offers/validate.ts` | `parseOfferBody(raw, { market, today }): { ok: true; offer: OfferInput } \| { ok: false; error: OfferInputError }` (zod). Errors: `title_invalid`, `details_invalid`, `terms_invalid`, `price_invalid`, `currency_market_mismatch`, `dates_invalid`, `claims_invalid`, `wording_invalid`, `assets_invalid`. The server sets `currency` from the workspace market; a body that sends a different currency is refused, never coerced. `confirmable(offer, today): OfferInputError \| null` adds `end_date_required` and `offer_ended`. |
| `lib/offers/dates.ts` | `localDate(timezone, now): string` (`YYYY-MM-DD` via `Intl.DateTimeFormat("en-CA")`, same technique as `currentPeriod` in `lib/workspace/queries.ts:109`); `hasEnded(offer, today)` (`ends_on < today`). |
| `lib/offers/format.ts` | `formatOfferPrice(amount, currency)` → `HK$88` / `NT$350` (two decimals only when non-zero); `validityText(offer, locale)` → e.g. `2026-10-05 – 2026-10-31` / `由 2026-10-05 起，未設結束日期` / `自 2026-10-05 起，未設結束日期` / `From 2026-10-05, no fixed end date`. Deterministic, never model-written. |
| `lib/offers/channels.ts` | `OFFER_TEMPLATE_KEYS = ["offer-gbp-post","offer-social-post","offer-chat-message"] as const`; `isOfferWorkflow(t)` (= `t.inputs` contains `offer_confirmed`); `offerChannel(templateKey, market): "google_post" \| "instagram_post" \| "whatsapp_message" \| "line_message"`; `CHANNEL_LIMITS` (`google_post` 1,500 chars, 0 hashtags; `instagram_post` 2,200 chars, ≤ 5 hashtags; chat 500 chars, 0 hashtags). |
| `lib/offers/usability.ts` | `offerUsability(offer \| null, { workspaceId, actionLocationId, market, today }): OfferUsability` and `bindingStatus(binding \| null, offer \| null, today): BindingStatus`. |
| `lib/offers/prompt-facts.ts` | `offerPromptFacts(offer, { market, locale, channel, hasAsset }): OfferPromptFacts` — the only shape that reaches the model. |
| `lib/offers/flag.ts` | `offersEnabled(): boolean` (`process.env.OFFERS_ENABLED === "true"`). |
| `lib/repositories/offers.ts` | `offerRepository(client?)`: `list(workspaceId, { locationIds? })`, `get(workspaceId, id)`, `create(input)`, `update(id, workspaceId, expectedRevision, patch)` (bumps `revision`, resets to `draft`, `offer_conflict` on a stale `expectedRevision`), `confirm(id, workspaceId, expectedRevision, actorId)`, `archive(id, workspaceId, actorId)`. Parameterised SQL only, the `lib/repositories/brand.ts` style. |
| `lib/offers/service.ts` | `createOffer`, `updateOffer`, `confirmOffer`, `archiveOffer` (validate → scope → repository → audit), and `prepareOfferDrafts` (§5). |

`AgentContext` (`lib/agents/schema.ts:29`) gains one optional field, set only by `runs.ts` for an offer action:

```
offer?: {
  id: string; revision: number;
  title: string; details: string; terms: string | null;
  priceDisplay: string | null;          // formatOfferPrice, already in the market currency
  validityDisplay: string;              // validityText, in the run locale
  endsOn: string | null; openEnded: boolean;
  approvedClaims: string[];
  channel: "google_post" | "instagram_post" | "whatsapp_message" | "line_message";
  hasAsset: boolean;
};
```

`FinishActionRunInput` (`lib/repositories/artifacts.ts:286`) gains `versionMeta?: Record<string, unknown>`, merged into the version `meta` after the fixed keys (so it cannot overwrite `warnings` or `agent_key`). `ActionRow` (`lib/workspace/overview.ts:79`) gains `offer_id?: string | null`, selected by `ACTION_COLUMNS` (`lib/repositories/workspace-read.ts:15`). `VersionMeta` (`lib/workspace/version-meta.ts`) gains `offer: OfferBinding | null`.

## 3. The workflow definitions (P4.4 format)

Three new rows at the end of `TEMPLATES` in `lib/workspace/templates.ts`. `TemplateKey` gains the three keys; `WorkspaceAgentKey` gains `offer_copy`; `channel` gains `"messaging"` (the actions-page filter, `lib/workspace/queries-pages.ts:98`, gains it too). No other change to the `WorkflowDefinition` shape.

| Field | `offer-gbp-post` | `offer-social-post` | `offer-chat-message` |
| --- | --- | --- | --- |
| `triggerFindingKeys` | `[]` | `[]` | `[]` |
| `capability` | `Beta` | `Beta` | `Beta` |
| `agentKey` | `offer_copy` | `offer_copy` | `offer_copy` |
| `inputs` | `offer_confirmed` (confirmed\_fact), `brand_voice` (preference) | `offer_confirmed` (confirmed\_fact), `asset_or_text_only` (confirmed\_fact), `alt_text` (preference), `brand_voice` (preference) | `offer_confirmed` (confirmed\_fact), `brand_voice` (preference) |
| `requiredInputs` | `["offer_confirmed","brand_voice"]` | `["offer_confirmed","asset_or_text_only","alt_text","brand_voice"]` | `["offer_confirmed","brand_voice"]` |
| `effortMinutes` | 8 | 8 | 5 |
| `delivery` | `export_copy` | `export_copy` | `export_copy` |
| `deliveryUnit` | `approved_version` | `approved_version` | `approved_version` |
| `measurement` | `null` | `ig.days_since_last_post` | `null` |
| `failure` | `DEFAULT_FAILURE` | `DEFAULT_FAILURE` | `DEFAULT_FAILURE` |
| `externalFacing` | `true` | `true` | `true` |
| `channel` | `google` | `instagram` | `messaging` |
| `outcome` (en / zh-HK) | "A Google Business post about your offer, ready to copy" / "一則介紹你優惠的 Google 商戶帖文，可直接複製" | "An Instagram caption about your offer, with alt text when a photo is attached" / "一段介紹你優惠的 Instagram 文案，附相片時連替代文字" | "A short offer message you can paste into WhatsApp or LINE yourself" / "一段可自行貼到 WhatsApp 或 LINE 的優惠訊息" |
| `title` | "Promote your offer on Google" / "在 Google 推廣你的優惠" | "Promote your offer on Instagram" / "在 Instagram 推廣你的優惠" | "Write an offer message for your customers" / "為顧客寫一段優惠訊息" |
| `workflow` | "Offer post for Google" / "Google 優惠帖文" | "Offer post for Instagram" / "Instagram 優惠帖文" | "Offer chat message" / "優惠訊息" |

`measurement` is `null` for the Google post (a post does not move any metric the scan measures; the same open question as `gbp-post`'s `gbp.days_since_last_review`) and for the chat message (a private channel the scan cannot observe). The Instagram row uses the same metric as `social-post`: it measures posting activity, never the offer's success.

### The `offer_confirmed` input

* It is a `confirmed_fact`, added to `ACTION_INPUT_KEYS` (`lib/copy-workspace.ts:108`) with a label in each locale ("Confirmed offer" / "已確認優惠" / "已確認優惠"), so the existing contract rule "every confirmed\_fact has an owner entry point" holds without changing the contract test's logic. Its entry point is the offer screen; the action-detail input form renders a link there instead of a text box (the same special-casing `asset_or_text_only` already gets at `components/workspace/action-detail-client.tsx:674`).
* It joins `SERVER_SATISFIED_INPUT_KEYS` (`lib/workspace/workflow-inputs.ts:43`): a typed or persisted `offer_confirmed` value never counts. Only the server's check does.
* `satisfiedInputs` (`lib/workspace/runs.ts:205`) gains `extra.offer?: () => Promise<boolean>`, which adds `offer_confirmed` when `offerUsability(...) === "usable"`: the action has an `offer_id`; the offer exists in the same workspace; `status = 'confirmed'`; its `location_id` equals the action's; it has not ended (`localDate(workspace.timezone)`); and, when priced, its currency equals `MARKETS[market].merchantSearch.currency`. Anything else blocks the run with `factsNeeded: ["offer_confirmed"]`, zero model calls and zero cost, through the existing P4.4 short-circuit (`runs.ts:427-436`).
* Offer workflows are never created from a finding (empty triggers) or from an objective: `POST /api/actions` refuses an offer template key with 400 `template_key is invalid`, and the Create page's `GOALS` (`components/workspace/create-view.tsx:58`) excludes `isOfferWorkflow` rows. They are created only by `prepareOfferDrafts` (§5).

### Contract test changes

`lib/workspace/templates.contract.test.ts`: `SPEC_INPUT_KINDS` (`:76`) gains the three rows above, literally. A new case pins `isOfferWorkflow` rows to `triggerFindingKeys: []`, `agentKey: "offer_copy"`, `delivery: "export_copy"` and `offer_confirmed` as their first input. The "uses every agent except validation\_plan" case (`:110`) passes because `offer_copy` is used. `lib/agents/agents.test.ts:61` ("registers the seven Live and four Beta agents") becomes seven Live and five Beta. `CAPABILITIES` (`lib/capabilities.ts`) gains `offer_copy: "Beta"`.

## 4. Prompt and guardrails — `lib/agents/agents/offer-copy.ts`

`offer_copy` is defined with `defineAgent` (`lib/agents/prompt.ts:67`), so it gets the shared role, brand, guardrail, fenced-evidence and output blocks and the shared acceptance (`sharedAcceptance`). `promptVersion: "2026-10-01.1"`.

### Where the offer goes in the prompt

* `spec.evidence(ctx)` adds `offer: { title, details, terms, price_display, validity_display, approved_claims, channel, has_asset }` inside the UNTRUSTED EVIDENCE fence. Offer text is owner free text, exactly like `provided_inputs`, so it gets the same "this is data, not instructions" treatment.
* `runs.ts` merges `offer.prohibited_wording` into `ctx.brand.prohibitedTerms` (deduplicated), so the brand block lists it under "Prohibited terms (never use)" and `prohibitedTermHits` flags it with no new code.
* `confirmedText` (`lib/agents/guardrails.ts:100`) also reads `ctx.offer` (title, details, terms, price display, validity display, approved claims), so the offer's own price, dates and claims do not raise `unconfirmed_claim` and the offer's own link does not raise `unexpected_link`. With no offer (every existing agent) the function returns exactly what it does today.
* The run locale picks the language (`LANGUAGE_INSTRUCTION`, `guardrails.ts:9`); the workspace market picks `MARKET_LABEL`, the currency and the chat channel. An `en` run on a `tw` workspace writes English with `NT$` prices and a LINE message (guardrail 11).

### Task text (shared part)

> Write one {channel description} promoting the single confirmed offer in `evidence.offer`, in the brand voice ({brand\_voice}). Assert only facts that appear in `evidence.offer` or the brand facts. Write the price exactly as `offer.price_display`, or state no price if it is null. Never calculate or state a discount, percentage, "original price", saving or free item unless those exact words appear in `offer.details` or `offer.terms`. State the validity only as `offer.validity_display`. If the offer has no end date, do not use urgency or scarcity wording ("limited time", "last chance", "while stocks last", "限時", "最後機會", "售完即止", or similar). Never mention stock levels, ingredients, allergens, health or medical effects, or awards unless they appear in `evidence.offer` or the brand facts. If `offer.terms` is present, keep every condition it lists; you may shorten the wording but not change its meaning. If something you would need is missing, do not guess: name it in facts\_needed.

### Channel part

| `offer.channel` | Task addition | Agent acceptance |
| --- | --- | --- |
| `google_post` | "A Google Business Profile post: under 300 characters for the opening line, the whole post under 1,500 characters, no hashtags, end with one plain call to action (visit, call or book)." | `bodyLength(output, 1500)`, `hashtags_present` if any `#tag` |
| `instagram_post` | With `has_asset`: the `social_post` asset rule ("Describe only what the alt text says is in it and return alt\_text — a plain, factual description under 125 characters"). Without: "This is a text-only post: do not describe a photo." At most five relevant hashtags. | `bodyLength(output, 2200)`, `too_many_hashtags` (> 5), `alt_text_missing` (asset but no alt text) |
| `whatsapp_message` / `line_message` | "A short message the owner will paste into {WhatsApp | LINE} themselves: under 500 characters, plain text, no hashtags, at most one emoji, no links unless one is in the brand facts. Do not say it was sent, and do not address a named person." | `bodyLength(output, 500)`, `hashtags_present` |

### Offer-specific acceptance checks (warnings, not blocks)

Added in `offer-copy.ts`'s `acceptance`, each a pure function in `lib/agents/guardrails.ts` so the corpus and unit tests reach them:

| Code | Flags when | Notes |
| --- | --- | --- |
| `wrong_market_currency` | an `hk` draft contains `NT$`, `TWD`, `新台幣`, `台幣` or `元` after a digit; a `tw` draft contains `HK$`, `HKD`, `港幣`, `港元` or `蚊` after a digit | Master Plan: "wrong-market currency". `元` is only flagged in `hk` because `tw` copy uses it. |
| `unconfirmed_discount` | `\d+\s?%`, `\d+\s?折`, `半價`, `half price`, `save`, `off` next to a number, `買一送一`, `buy one get one`, `free` — when that text does not appear in the offer's details/terms | Discounts are the claim most likely to be invented from a price. |
| `urgency_claim` | urgency/scarcity wording (list above, both scripts) while `offer.openEnded` is true, unless the wording appears in `offer.terms` | D7. |
| `health_claim` | `治療`, `療效`, `減肥`, `瘦身`, `排毒`, `預防`, `抗癌`, `cure`, `treat`, `detox`, `weight loss`, `slimming` absent from offer and brand text | Health and efficacy claims in food or beauty promotions are the highest-risk wording in both markets (HK: Undesirable Medical Advertisements Ordinance, Cap. 231; TW: 食品安全衛生管理法 Art. 28). The check is a reminder for the owner, not legal advice. |
| `hashtags_present` | `#\p{L}` in a Google post or chat message | Channel norm. |

Each new code is added to `GuardrailCode` and `classify` (`lib/workspace/version-meta.ts:20`, `:80`) and to `guardrailText` (`components/workspace/action-detail-client.tsx:117`) in zh-HK (審批), zh-TW (核准) and en, as P4.4 did for `unexpected_link`.

### Deterministic compliance notes (never model-written)

The action detail page for an offer action shows a fixed checklist from `lib/copy-workspace.ts` (a new `offerChecklist` keyed by channel) beside the approval panel, in all three locales:

* every channel: "Check the price, dates and conditions against your offer." "Nothing has been posted or sent."
* `offer-chat-message`: "Send only to customers who agreed to hear from you, and stop when they ask." with a market note: HK "Personal Data (Privacy) Ordinance direct-marketing rules apply"; TW "個人資料保護法 applies to customer contact lists".
* `offer-gbp-post`: "Google may reject posts that break its content policies."

The model's own `acceptance_criteria` still render below it, as for every agent.

## 5. Owner flows and server steps

### 5.1 Enter and confirm an offer

1. **Offers** is reached from a card on Create ("Promote an offer") and a row on More (`components/workspace/more-view.tsx:21`), both shown only when `offersEnabled()`. No new primary-nav item (screen budget).
2. `/{locale}/owner/{workspaceSlug}/offers` lists offers in four groups: **Running** (confirmed, started, not ended), **Upcoming** (confirmed, not started), **Drafts**, **Ended or archived**. Each row shows title, price, validity, location and how many channel drafts exist.
3. **New offer** form (`components/workspace/offer-form.tsx`): title; "What's included"; price (optional, with a fixed `HK$` or `NT$` prefix from the market, no currency picker); starts on; ends on or "No fixed end date"; terms and conditions; "Claims you approve for this offer"; "Words to avoid"; photos (picker over approved Assets at that location, with a link to Assets to upload and confirm rights); location (`LocationSelect`). A fixed note: "We only use what you type here. Nothing is read from photos, and prices, dates, stock, ingredients or allergens are never guessed."
4. **Confirm** shows a read-only summary titled "This is what drafts may say", with the checkbox "These facts are correct and I may promote them". `POST …/offers/[offerId]/confirm` with `expected_revision`. A viewer sees the summary with no controls.
5. Editing a confirmed offer warns first: "Editing returns this offer to draft. Drafts written from the current version can no longer be approved or exported."

### 5.2 Prepare channel drafts

1. On a confirmed, current offer the **Prepare drafts** panel lists the three channels with checkboxes. The chat channel is labelled by market: "WhatsApp message" (`hk`) or "LINE message" (`tw`). Channels that already have an open draft for this offer show "Draft exists — open it".
2. **Delivery notice, before the button** (D4), from `GET /api/workspaces/[workspaceId]/usage`:
   * en: "This prepares {n} separate drafts. Nothing is posted or sent. Each draft you approve and export counts as one approved delivery, up to {n}. Copying the same approved version again never counts again. This month: {used} of {allowance} used." (paid: "…This month: {used} approved deliveries, no limit on your plan.")
   * zh-HK: "會準備 {n} 份獨立草稿，不會發佈或發送任何內容。每份經你批准並匯出的草稿計為一項核准後交付，最多 {n} 項。再次複製同一個已批准版本不會再計算。本月已用 {used} / {allowance} 項。"
   * zh-TW: "將準備 {n} 份獨立草稿，不會發布或傳送任何內容。每份經你核准並匯出的草稿計為一項核准後交付，最多 {n} 項。再次複製同一個已核准版本不會重複計算。本月已用 {used} / {allowance} 項。"
3. **Prepare drafts** calls `POST /api/workspaces/[workspaceId]/offers/[offerId]/drafts { template_keys, locale }`. `prepareOfferDrafts`:
   * authorizes `minRole: "manager"` with the offer's location;
   * refuses unless `offerUsability(...) === "usable"` (409 with the usability code);
   * for each requested key creates or reuses one action via a new `actionMutationRepository().createOfferAction(row)`, beside `createObjective` (`lib/repositories/action-mutations.ts:46`). The row has `template_key`, `source: 'owner_objective'`, `offer_id`, `location_id = offer.location_id`, `title/summary` from the template, and `evidence = { factType: "Recommended", source: "Owner-confirmed offer", value: priceDisplay ?? "", detail: localized(offer.title), observedAt: confirmed_at }`. It also sets `required_inputs` from the template, `action_state` (`needs_input` when the gate would block, else `recommended`), `due_at = starts_on` when the offer starts in the future (so it appears in Calendar with no Calendar change), and `dedupe_key = ${workspaceId}:${locationId ?? "all"}:${templateKey}:offer:${offerId}`;
   * for `offer-social-post`, when the offer has an approved asset usable at its location, pre-fills `provided_inputs.asset_id` (first such asset) and `alt_text` from that asset; otherwise the action waits at `needs_input` for the existing asset picker or the text-only choice;
   * writes `action.updated` `{ change: "created", source: "offer", template_key, offer_id }` for each new action;
   * returns `{ actions: [{ templateKey, actionId, created }] }`. A retry returns the same ids: the existing partial unique index `actions_open_dedupe_idx` makes it idempotent, even under concurrent requests.
4. The client then calls the existing `POST /api/actions/[actionId]/run` once per action, one after another (each run is inline under its own 60 s `maxDuration`; three in one request would not fit). Each row shows **Drafting**, **Ready to review**, **Needs input** (with the missing key), **Failed — Try again** or **AI budget reached**. Retrying one channel re-runs only that action; finished channels are not regenerated or recounted.

### 5.3 What the run adds for an offer action

In `runAgentForAction`, after the brand reads and before the gate, when `row.offer_id` is set:

* load the offer via a new `ArtifactRepository.assistantOffer(workspaceId, offerId)` (scoped by workspace in SQL);
* compute `today = localDate(workspace.timezone, now)` and `offerUsability`;
* when usable, set `ctx.offer = offerPromptFacts(...)` and merge `prohibited_wording` into `ctx.brand.prohibitedTerms`;
* pass `extra.offer` to `satisfiedInputs`;
* add `offer: { id, revision }` to the `queue` input payload (only for offer actions, so non-offer payloads stay byte-identical);
* pass `versionMeta: { offer: { id, revision } }` to the success `finish`.

The P3.5a budget check stays first. A blocked offer run reads the budget total and the offer, then ends `needs_input` with no model call.

### 5.4 Review, approve and export

* Offer actions open in the existing action detail page. A new **Offer** card shows the facts as they were at the version's `meta.offer.revision`, read from the run's stored `input` (the offer row may since have changed), plus a status banner from `bindingStatus`:
  + `current`: nothing;
  + `changed`: "This draft was written from an earlier version of the offer. Prepare a new draft to approve it.";
  + `ended`: "This offer ended on {date}.";
  + `unconfirmed` / `archived` / `unbound`: matching text.
    Approve and Export are disabled unless `current`, or unless the version is already exported (then Copy stays enabled and the banner stays).
* `POST /api/versions/[versionId]/approve` and `…/export` call a new `assertOfferBinding(repository, scope, versionId, { firstExportOnly })` before the RPC when the version's action has an `offer_id`:
  + approve: `bindingStatus !== "current"` → 409 `offer_changed | offer_ended | offer_unconfirmed | offer_archived | offer_unbound`;
  + export: the same, but only when `output_versions.first_exported_at is null`. A version already exported may be copied again; it counts nothing, as today.
  + The RPCs are unchanged. **Known limit:** the check and the RPC are separate statements, so an offer edited in the gap between them is not caught for that one request. It is recorded rather than closed with a SQL change, because the SQL functions are the authority and this slice adds no migration functions.
* Owner edits (`POST /api/actions/[actionId]/versions`) on an offer action write `meta.offer`. It is the base version's binding when `base_version_id` is given (read on the server, never from the client), otherwise the offer's current `{ id, revision }` when the offer is usable. When the offer is not usable, the edit is saved with no binding, so it is `unbound` and cannot be approved. The client never supplies the binding.

### 5.5 Next cycle

On an ended or archived offer, **Start a new offer from this one** opens the form pre-filled with title, details, terms, price, claims, wording and photos, with dates cleared and status `draft`. Nothing is copied from generated variants: drafts for the new offer are written fresh, and old approved versions stay attached to the old offer.

## 6. Routes

All under `app/api/workspaces/[workspaceId]/offers/`. All return 404 when `offersEnabled()` is false. All mutations use `authorizeWorkspaceRequest` with `minRole: "manager"` plus the D8 location rule, the existing `action_mutation` rate-limit scope (`lib/security/rate-limit.ts:28`), and write audit events.

| Route | Body → result | Errors |
| --- | --- | --- |
| `GET …/offers?location=` | → `{ offers: OfferView[] }` (any member; scoped managers see in-scope and workspace-wide offers) | 401/403/404 |
| `POST …/offers` | `{ title, details, terms?, price_amount?, currency?, starts_on, ends_on?, open_ended?, approved_claims?, prohibited_wording?, asset_ids?, location_id?, locale }` → 201 `{ offer }` (status `draft`) | 400 with the `OfferInputError` code; 403 scope |
| `PATCH …/offers/[offerId]` | `{ expected_revision, …fields }` → `{ offer }` (revision +1, status `draft`) or `{ archive: true }` → `{ offer }` (status `archived`) | 409 `offer_conflict`, 409 `offer_archived` |
| `POST …/offers/[offerId]/confirm` | `{ expected_revision, locale }` → `{ offer }` | 409 `offer_conflict`, `end_date_required`, `offer_ended`, `assets_invalid` |
| `POST …/offers/[offerId]/drafts` | `{ template_keys: OfferTemplateKey[], locale }` → `{ actions }` | 400 unknown key; 409 usability code |

Audit events added to `AUDIT_EVENTS` (`lib/workspace/audit.ts:11`) and `AUDIT_EVENT_LABELS` (`lib/workspace/audit-labels.ts`): `offer.created`, `offer.updated`, `offer.confirmed`, `offer.archived`. Payload `{ locale, ip_hash?, offer_id, revision, location_id }`: no offer text, price or claims in the audit log.

## 7. UI surfaces

| Surface | File | Change |
| --- | --- | --- |
| Offers list + form | `app/[locale]/owner/[workspaceSlug]/offers/page.tsx`, `components/workspace/offers-view.tsx`, `components/workspace/offer-form.tsx` | New. Server page uses `loadOwnerPage` (`lib/workspace/page-context.ts:34`); `notFound()` when the flag is off. |
| Offer detail | `app/[locale]/owner/[workspaceSlug]/offers/[offerId]/page.tsx`, `components/workspace/offer-detail.tsx` | New: facts, confirm, edit, archive, Prepare drafts panel with delivery notice, per-channel status, link to the `gbp-photo-pack` workflow labelled "Photo brief for you or your staff to shoot (nothing is generated)". |
| Create | `components/workspace/create-view.tsx` | `GOALS` excludes offer workflows; `ICONS` (`:41`) gains the three keys; one "Promote an offer" card when enabled. |
| More | `components/workspace/more-view.tsx` | One "Offers" link when enabled. |
| Action detail | `components/workspace/action-detail-client.tsx`, `lib/workspace/queries-pages.ts` | Offer card, binding banner, approve/export disabled per §5.4, `offer_confirmed` input renders a link, `offerChecklist`, new guardrail texts. |
| Actions filter | `components/workspace/action-filters.tsx` | A "Messaging" channel option. |
| Copy | `lib/copy-workspace.ts` (`templates` for the three keys, input label, `offerChecklist`), `lib/messages/{en,zh-HK,zh-TW}.json` (new `offers` namespace) | zh-HK in Hong Kong written Chinese, zh-TW in Taiwan usage (e.g. 相片/照片, 發佈/發布, 批准/核准, 訊息 in both). `tests/i18n.test.ts` keeps the three key sets equal. |

Reused classes only (`section-card`, `limitation-note`, `CapabilityBadge`, `goal-card-grid`); no new CSS. Every offer surface shows the `Beta` capability badge.

## 8. Telemetry

* **Audit:** the four `offer.*` events; `action.updated` with `source: "offer"`; the existing `run.*`, `version.*` and `delivery.*` events cover the rest. The Activity page labels the new events.
* **Value report:** `corepack pnpm report:value` already counts `deliveries.counted` through `output_versions → actions` (`scripts/report/value-queries.ts`), so offer deliveries are included with no change. Offer actions are distinguishable by `actions.offer_id is not null` for later analysis; this slice adds no new report line.
* **Logs:** an approval or export refused by the binding check logs `{ category: "offer_binding_refused", status }`, with no ids beyond the version id and no offer text.
* **No PostHog events** for workspace actions; the PostHog transport is used for scan events only today, and adding workspace analytics would need its own consent decision.

## 9. Error handling

* **Offer read fails during a run** (I/O): the error propagates like the asset satisfier's, so the route returns 503 and no run row exists, because the read happens before `persistence.queue`. It never falls open to calling the model.
* **Offer deleted under an action** (workspace or location erasure): `offer_id` becomes null, `offerUsability` returns `missing`, and the run blocks. The binding check returns `unbound` and approval is refused.
* **Workspace market changed after confirmation** (not possible through the UI today): the satisfier returns `wrong_currency` and runs block until the offer is edited and re-confirmed.
* **Two tabs edit one offer:** `expected_revision` makes the second save 409 `offer_conflict`; the UI reloads and shows the newer facts.
* **Flag turned off with offer actions open:** creation surfaces disappear; existing offer actions still render and run, because the data and gate do not depend on the flag. Turning the flag off is a visibility switch, not a data rollback.

## 10. Testing strategy

Deterministic tests only; no paid provider is called (CLAUDE.md §0.1).

| Layer | What is proved |
| --- | --- |
| Unit — `lib/offers/*.test.ts` | Validation (blank and whitespace fields; price with 3 decimals; negative price; `currency: "TWD"` on an `hk` workspace → `currency_market_mismatch`; `ends_on < starts_on`; `open_ended` with an end date; > 4 assets); `confirmable` (`end_date_required`, `offer_ended` on the day after `ends_on` in `Asia/Hong_Kong` and `Asia/Taipei`); price formatting; validity text in three locales; `offerUsability` for every code; `bindingStatus` for every status. |
| Contract — `templates.contract.test.ts` | The three rows, literally; offer rows never triggered by findings; `offer_copy` capability agreement; `requiredInputs` equals `inputs`. |
| Agent — `lib/agents/agents.test.ts` | Two new snapshots (`hk`/zh-HK priced offer with an end date; `tw`/zh-TW open-ended offer, LINE message), the 11 existing snapshots unchanged; the prompt contains `NT$`/`HK$` per market and never the other; every new acceptance check positive and negative, in both scripts; `confirmedText` includes offer text only when `ctx.offer` is set. |
| Run — `lib/workspace/runs.test.ts` | Unconfirmed, ended, archived, wrong-location, wrong-currency and missing offers each give `factsNeeded: ["offer_confirmed"]` with zero `llm` calls and zero cost; a usable offer calls the model once with `price_display` in the prompt; `prohibited_wording` appears under prohibited terms; the version meta carries `{ offer: { id, revision } }`; a persisted `offer_confirmed: true` in `provided_inputs` does not satisfy the gate; non-offer `queue` payloads are byte-identical. |
| Routes | Offers CRUD/confirm/drafts: owner, in-scope manager, out-of-scope manager (403), scoped manager on a workspace-wide offer (403), viewer (403), other workspace (403/404), flag off (404); drafts idempotent on retry (same action ids); `POST /api/actions` refuses offer keys. Approve and export: changed revision → 409 `offer_changed`; ended → 409 `offer_ended`; already-exported version re-copied after a change → 200 with `counted: false`; non-offer versions unaffected. Versions route: an owner edit inherits the base binding; a client-sent `meta` is ignored. |
| Version meta — `lib/workspace/version-meta.test.ts` | New codes classified; `offer` binding parsed; a malformed binding reads as `null`. |
| Corpus — `test/corpus/workflows/` | The case schema gains an optional `offer` fixture. New cases: `missing_facts` (unconfirmed offer, 0 calls), `fabricated_claim` (canned output with a 20% discount absent from the offer → `unconfirmed_discount`; HK draft with `NT$` → `wrong_market_currency`), `locale_market` (en on `tw` → prompt has "Taiwan" and `NT$`, excludes `HK$`), and an open-ended offer whose canned output says "限時優惠" → `urgency_claim`. No injection case for offer text: it is the owner's own confirmed input, which `confirmedText` deliberately trusts; untrusted review or page text never reaches an offer prompt. `CATEGORY_MINIMUMS` unchanged. |
| Guard — `tests/unhonoured-promises.test.ts` | A new `PROMISES` entry bans copy claiming we send or post the offer ("we'll send it to your customers", "sent on WhatsApp", "已發送到 WhatsApp", "已傳送到 LINE", "posted to Google", "已發佈到 Google"), with a detector that trips if any backend source calls a WhatsApp or LINE messaging API (`graph.facebook.com/…/messages`, `api.line.me/v2/bot/message`). |
| Integration — Docker Neon | Migration 0011 applies and replays; catalog counts; FK behaviour (location delete cascades its offers and nulls `actions.offer_id`); `update` with a stale `expected_revision` changes nothing; concurrent `prepareOfferDrafts` for the same offer yield one action per channel. |
| E2E acceptance — `e2e/acceptance/offer-promotion.spec.ts` | With `OFFERS_ENABLED=true` and the fake LLM: create → confirm → prepare three drafts → approve and export one (usage +1) → copy it again (usage unchanged) → edit the offer → the other drafts show "changed" and cannot be approved → existing review-reply flow still passes. |

## 11. Rollout and rollback (owner actions)

1. Apply migration `0011_offers.sql` to Neon by the rehearsed hand-applied procedure, after `db:verify` (DEC-11). It is additive and safe for the currently deployed code.
2. Deploy. The code selects `actions.offer_id`, so it must not deploy before step 1.
3. Set `OFFERS_ENABLED=true` when Willy wants the surfaces visible.

Rollback: unset `OFFERS_ENABLED`; data stays. No down-migration (additive, and committed migrations are never edited).

## 12. What this slice does not prove

* No real model has written offer copy (DEC-04); canned-output tests prove the pipeline flags what it should, not that a model behaves.
* Nothing is hosted-verified.
* The acceptance checks are reminders with known gaps (regex coverage of discounts, health terms and urgency wording is finite), and the owner's review remains the control.

## Open questions for Willy

* **Q1 — Agent reuse (D2).** The Master Plan says "Reuse existing `social-post`, `gbp-post` or other appropriate copy capabilities". This design adds one `offer_copy` agent and leaves both existing prompts untouched. The alternative is offer-aware branches inside `gbp_post` and `social_post`, which bumps their `promptVersion` and changes two live snapshots. Which do you prefer?
* **Q2 — Changed or expired offers (D5).** This design refuses approval and first export of a draft whose offer has changed or ended. Do you want a hard refusal, or a warning the approver can override?
* **Q3 — Delivery unit for a three-channel offer (D4, DEC-14).** Under today's rules one offer can produce up to three counted deliveries, which is a lite workspace's whole monthly allowance. This is the DEC-14 safe default and the screen discloses it before generation. Confirm it, or record a DEC-14 decision before this ships.
