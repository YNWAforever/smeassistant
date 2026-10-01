# P4.1 Confirmed Offers and Promotion-Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner confirms one scoped offer (facts, price in the market currency, validity, terms, claims, wording to avoid, optional rights-cleared photos). From it they prepare separate Google, Instagram and WhatsApp/LINE text drafts through the ordinary action/run/version model. Each draft is approved and exported per exact version under the existing delivery ledger. A run with an unconfirmed, ended or wrong-market offer stops before the model, and a draft whose offer has since changed can no longer be approved or first-exported.

**Architecture:**
- **Data:** migration 0011 adds `offers` and `actions.offer_id`.
- **Logic:** pure modules in `lib/offers/` (validation, dates, formatting, channels, usability, prompt facts) and a parameterised-SQL repository.
- **Contract:** three new rows in the P4.4 `TEMPLATES` contract share one new Beta agent, `offer_copy`. A server-satisfied `offer_confirmed` input joins the existing pre-model gate.
- **Binding:** `runAgentForAction` binds each version to `{ offer id, revision }` in `output_versions.meta`. A pre-RPC check on approve and first export refuses stale bindings.
- **Surfaces:** offer pages, the action-detail additions and the delivery notice. Everything is behind `OFFERS_ENABLED`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Neon Postgres (`pg` repositories), Drizzle schema, zod, Vitest 4 (unit) + Docker Postgres integration harness, Playwright acceptance with the fake LLM server. pnpm 9.12.0 via `corepack pnpm`.

**Spec:** `docs/superpowers/specs/2026-10-01-offer-promotion-copy-design.md`

**Branch:** `p4-1-offers` from `origin/main` at `dc55e02` (PR #27). Diff base for "unchanged" checks: `dc55e02`.

## Global Constraints

* **Scope limits:** one migration, `neon/migrations/0011_offers.sql`. Never edit `0001`–`0010`. No change under `packages/`. No change to any SQL function (`approve_output_version`, `export_output_version`, `create_output_version`).
* **Prompts:** the 11 existing entries in `lib/agents/__snapshots__/agents.test.ts.snap` stay byte-identical; only `offer_copy` entries are added. No change to `gbp_post`, `social_post` or any other existing agent's task text or `promptVersion`.
* **Delivery unit:** `deliveryUnit` stays `"approved_version"` on every row (DEC-14 safe default). No bundle counting, no change to `workspace_usage`.
* **No sending:** `delivery` is `export_copy` for all three offer rows. No code calls a WhatsApp, LINE, Google or Instagram write API. No owner copy says the offer was sent, posted or published.
* **No images:** no model receives asset bytes. An asset contributes only its owner-written `alt_text`.
* **Authority:** the template rows carry no role/scope/tier fields (the existing contract test). Offer mutations use `authorizeWorkspaceRequest` with `minRole: "manager"`. A manager with non-null `location_scope` may not create, edit or confirm a workspace-wide offer, or one outside their scope.
* **Gate:** `offer_confirmed` is in `SERVER_SATISFIED_INPUT_KEYS`; only `offerUsability(...) === "usable"` satisfies it. A blocked offer run makes zero `llmComplete` calls and records zero cost. The P3.5a budget check stays first in `runAgentForAction`.
* **Flag:** `offersEnabled()` is `process.env.OFFERS_ENABLED === "true"` exactly. Every offer route returns 404 and every offer page `notFound()` when it is false.
* **Region imports:** modules reached by `lib/workspace/runs.ts` import `MARKETS` from `@sme-scanner/region/src/config` (deep subpath, as `lib/workspace/evidence-inputs.ts:5` does) so `eval:workflows -- --check-load` still loads.
* **Copy:** new strings in all three locales; zh-HK in Hong Kong written Chinese (批准, 相片, 發佈), zh-TW in Taiwan usage (核准, 照片, 發布). `tests/i18n.test.ts` keeps the key sets equal.
* **Tests:** never call a paid provider (LLM, SerpApi, Places, RapidAPI, Stripe, Resend). The fake LLM is always injected.
* **Commits:** conventional messages ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `--no-verify`, never push. Never commit line-ending-only changes to `lib/agents/__snapshots__/agents.test.ts.snap` or `lib/pocket-assistant/__snapshots__/demo.test.ts.snap`.
* **Per-task gate:** before each commit run `corepack pnpm typecheck` and the task's focused tests. The full inventory runs in Task 13.

## Review Focus

1. **A persisted `offer_confirmed: true` (or `"yes"`) in `actions.provided_inputs` must never satisfy the gate.** Only the server's usability check can. *Test: Task 7, `a persisted offer_confirmed value does not satisfy the gate`.*
2. **The offer's end date is judged in the workspace timezone,** not UTC. An offer ending `2026-10-31` is usable at 23:30 on 31 October in `Asia/Hong_Kong` and ended at 00:05 on 1 November. *Test: Task 2, `ends at local midnight in the workspace timezone`.*
3. **An already-exported version of an offer that has since changed can still be copied, and the copy counts nothing.** A never-exported version of the same changed offer is refused with 409. *Test: Task 9, `re-copy of an exported version after an offer edit is allowed and not counted` and `first export after an offer edit is refused`.*
4. **An owner edit cannot launder a stale draft.** `POST /api/actions/[id]/versions` with `base_version_id` of a revision-1 draft, after the offer moved to revision 2, produces a version bound to revision 1, which cannot be approved. A `meta` field sent by the client is ignored. *Test: Task 9, `an owner edit inherits the base version's binding`.*
5. **Concurrent "Prepare drafts" for the same offer creates exactly one action per channel.** *Test: Task 8 integration, `concurrent prepareOfferDrafts yields one action per channel`.*
6. **A scoped manager cannot reach outside their locations through an offer:** not by creating a workspace-wide offer, not by confirming another location's offer, not by preparing drafts for it. *Test: Task 4 and Task 8 route tests.*

## Where this plan departs from the spec, and why

None at the time of writing. Any departure found while building is recorded here and in the phase report, with its reason, before the task that needs it is committed.

## File map

| File | Responsibility |
| --- | --- |
| `neon/migrations/0011_offers.sql`, `lib/db/schema/business.ts`, `lib/db/database.types.ts` | schema |
| `test/integration/fixtures/legacy-final-catalog.json`, `test/integration/neon-schema.integration.test.ts` | schema baselines |
| `lib/offers/{types,validate,dates,format,channels,usability,prompt-facts,flag,service}.ts` | offer domain (pure except `service.ts`) |
| `lib/repositories/offers.ts` | all offer SQL |
| `lib/repositories/action-mutations.ts` | `createOfferAction` |
| `lib/repositories/artifacts.ts` | `assistantOffer`, `FinishActionRunInput.versionMeta` |
| `lib/repositories/workspace-read.ts`, `lib/workspace/overview.ts` | `offer_id` on `ActionRow` |
| `lib/workspace/templates.ts`, `lib/workspace/workflow-inputs.ts`, `lib/capabilities.ts`, `lib/copy-workspace.ts` | the three workflow definitions, the server-satisfied key, labels |
| `lib/agents/agents/offer-copy.ts`, `lib/agents/index.ts`, `lib/agents/schema.ts`, `lib/agents/guardrails.ts` | the agent, `AgentContext.offer`, offer acceptance checks |
| `lib/workspace/runs.ts` | offer context, satisfier, binding |
| `lib/workspace/version-meta.ts`, `lib/offers/binding-guard.ts` | binding parse and pre-RPC guard |
| `app/api/workspaces/[workspaceId]/offers/route.ts`, `…/[offerId]/route.ts`, `…/[offerId]/confirm/route.ts`, `…/[offerId]/drafts/route.ts` | offer routes |
| `app/api/versions/[versionId]/{approve,export}/route.ts`, `app/api/actions/[actionId]/versions/route.ts`, `app/api/actions/route.ts` | guard, binding inheritance, objective refusal |
| `app/[locale]/owner/[workspaceSlug]/offers/page.tsx`, `…/offers/[offerId]/page.tsx`, `components/workspace/{offers-view,offer-form,offer-detail}.tsx` | offer screens |
| `components/workspace/{create-view,more-view,action-detail-client,action-filters}.tsx`, `lib/workspace/queries-pages.ts` | entry points, offer card, banner, checklist |
| `lib/workspace/audit.ts`, `lib/workspace/audit-labels.ts` | `offer.*` events |
| `lib/messages/{en,zh-HK,zh-TW}.json` | `offers` namespace |
| `test/corpus/workflows/harness.ts`, `test/corpus/workflows/cases/*.json` | offer fixture and cases |
| `tests/unhonoured-promises.test.ts`, `tests/i18n.test.ts` | guards |
| `e2e/acceptance/offer-promotion.spec.ts`, `test/e2e/environment.ts` | acceptance journey |
| `.env.example` | `OFFERS_ENABLED` |

---

### Task 1: Migration 0011 and every schema baseline

**Files:**
- Create: `neon/migrations/0011_offers.sql`
- Modify: `lib/db/schema/business.ts` (new `offers` export; `offerId` on `actions`, ~`:85-125`), `test/integration/fixtures/legacy-final-catalog.json`, `test/integration/neon-schema.integration.test.ts` (`:26-27`, `:36`, `:42`, `:64`), `lib/db/database.types.ts` (regenerated)

**Interfaces:**
- Produces: table `offers` with exactly the columns, defaults and checks in spec §1:
- `id`, `workspace_id` (cascade), `location_id` (cascade), `title`, `details`, `terms`;
- `price_amount numeric(12,2)`, `currency`, `starts_on`, `ends_on`, `open_ended`;
- `approved_claims`, `prohibited_wording`, `asset_ids`;
- `source`, `status`, `revision`;
- `confirmed_by` (set null), `confirmed_at`, `created_by` (set null), `created_at`, `updated_at`, `archived_at`.
- Constraint names: `offers_status_check`, `offers_source_check`, `offers_currency_check`, `offers_price_currency_check`, `offers_price_nonnegative_check`, `offers_dates_check`, `offers_open_ended_check`, `offers_confirmed_check`, `offers_archived_check`, `offers_revision_check`.
- Indexes: `offers_workspace_idx (workspace_id, status, starts_on desc)`.
- `actions` gains `offer_id uuid references offers(id) on delete set null`, with index `actions_offer_idx (offer_id) where offer_id is not null`.
- Drizzle exports `offers` and `actions.offerId`.

* **Step 1: Update the failing baseline test.** In `neon-schema.integration.test.ts`:
  + add `"0011_offers.sql"` to the expected applied list;
  + set the journal counts at `:36` and `:42` to `toBe(11)`;
  + set the Drizzle `tables.length` to `toBe(40)`;
  + set `verifyCatalog` `tables: 38`, `columns: 468`. The arithmetic is 444 + 23 offers columns + 1 `actions.offer_id`.
    Leave constraints and indexes for Step 4.
* **Step 2: Run** `NEON_INTEGRATION=1 corepack pnpm test:integration -- test/integration/neon-schema.integration.test.ts`. Expected: FAIL (migration missing).
* **Step 3: Implement.**
  + **Migration:** follow the `0010_mail_outbox.sql` style. A header comment cites the spec and explains the two `on delete` choices (location cascade: an offer never widens; `actions.offer_id` set null: history is never deleted). No `BEGIN/COMMIT`, `IF NOT EXISTS` throughout, then the RLS block: `ENABLE ROW LEVEL SECURITY`, `REVOKE ALL … FROM PUBLIC`, `GRANT SELECT, INSERT, UPDATE, DELETE … TO sme_app_runtime`, `DROP POLICY IF EXISTS server_application`, `CREATE POLICY server_application … TO sme_app_runtime USING (true) WITH CHECK (true)`.
  + **Drizzle:** add the `pgTable("offers", …).enableRLS()` table in alphabetical position, with matching `check(...)`, `foreignKey(...)` and `index(...)` entries.
  + **Catalog fixture:** add entries in query order.
* **Step 4: Run** the Step 2 command.
  + Set the remaining `verifyCatalog` counts (constraints, indexes) to what the catalog reports, and write each delta's arithmetic in the commit body, e.g. `constraints 172 + 10 checks + 4 FKs + 1 PK + 1 actions FK = 188`.
  + Then run `corepack pnpm db:verify` (applied 11, replay empty) and `corepack pnpm db:types`, and commit the regenerated `lib/db/database.types.ts`.
* **Step 5: Commit** `feat(P4.1): migration 0011 — offers and actions.offer_id`

---

### Task 2: Pure offer modules

**Files:**
- Create: `lib/offers/types.ts`, `lib/offers/validate.ts`, `lib/offers/dates.ts`, `lib/offers/format.ts`, `lib/offers/channels.ts`, `lib/offers/usability.ts`, `lib/offers/prompt-facts.ts`, `lib/offers/flag.ts`, and a `.test.ts` beside each of the last seven
- Modify: `.env.example` (commented `# OFFERS_ENABLED=` line with a one-line comment: offer pages and routes stay off unless exactly `true`)

**Interfaces:**
- Produces (types as in spec §2):
- `parseOfferBody(raw: unknown, ctx: { market: "hk" | "tw" }): { ok: true; offer: OfferInput } | { ok: false; error: OfferInputError }`
- `confirmable(offer: Pick<OfferRow, "ends_on" | "open_ended" | "starts_on">, today: string): "end_date_required" | "offer_ended" | null`
- `localDate(timezone: string, now: Date): string` and `hasEnded(offer: Pick<OfferRow, "ends_on">, today: string): boolean`
- `formatOfferPrice(amount: string | number, currency: "HKD" | "TWD"): string` and `validityText(offer, locale: "en" | "zh-HK" | "zh-TW"): string`
- `OFFER_TEMPLATE_KEYS`, `type OfferTemplateKey`, `isOfferWorkflow(t: Pick<WorkflowDefinition, "inputs">): boolean`, `offerChannel(key: OfferTemplateKey, market): OfferChannel`, `CHANNEL_LIMITS: Record<OfferChannel, { maxChars: number; maxHashtags: number }>`
- `offerUsability(offer: OfferRow | null, ctx: { workspaceId: string; actionLocationId: string | null; market: "hk" | "tw"; today: string }): OfferUsability`
- `bindingStatus(binding: OfferBinding | null, offer: OfferRow | null, today: string): BindingStatus`
- `offerPromptFacts(offer: OfferRow, ctx: { market; locale; channel: OfferChannel; hasAsset: boolean }): NonNullable<AgentContext["offer"]>`
- `offersEnabled(): boolean`
- `validate.ts` and `usability.ts` take the market currency from `MARKETS[market].merchantSearch.currency` via `@sme-scanner/region/src/config`. `channels.ts` takes the chat channel from `MARKETS[market].contact.channel`.

* **Step 1: Write failing tests.**
  + `validate.test.ts`:
    - `" "` title → `title_invalid`; a 121-char title → `title_invalid`; a missing `details` → `details_invalid`;
    - `price_amount: 12.345` → `price_invalid`; `-1` → `price_invalid`;
    - `{ price_amount: 88, currency: "TWD" }` with `market: "hk"` → `currency_market_mismatch`;
    - `{ price_amount: 88 }` with `market: "tw"` → `offer.currency === "TWD"`;
    - `ends_on < starts_on` → `dates_invalid`; `open_ended: true` with `ends_on` → `dates_invalid`;
    - 5 asset ids → `assets_invalid`; 11 claims → `claims_invalid`;
    - a claim over 200 chars → `claims_invalid`; blank claims are dropped, not stored.
  + `confirmable`: neither `ends_on` nor `open_ended` → `end_date_required`; `ends_on: "2026-10-31"` with `today: "2026-11-01"` → `offer_ended`; with `today: "2026-10-31"` → `null`.
  + `dates.test.ts` (Review Focus 2), `ends at local midnight in the workspace timezone`:
    - `localDate("Asia/Hong_Kong", new Date("2026-10-31T15:30:00Z"))` → `"2026-10-31"`;
    - `new Date("2026-10-31T16:05:00Z")` → `"2026-11-01"`;
    - the same two instants in `Asia/Taipei`;
    - an invalid timezone falls back to UTC, not a throw.
  + `format.test.ts`:
    - `formatOfferPrice("88.00","HKD")` → `"HK$88"`, `("88.50","HKD")` → `"HK$88.50"`, `(350,"TWD")` → `"NT$350"`, `(1200,"TWD")` → `"NT$1,200"`;
    - `validityText` for a dated and an open-ended offer in each of the three locales matches the spec strings.
  + `channels.test.ts`: `offerChannel("offer-chat-message","hk")` → `"whatsapp_message"`, `("…","tw")` → `"line_message"`; `isOfferWorkflow` is true only for the three keys (checked against `TEMPLATES` after Task 5; here against inline rows).
  + `usability.test.ts`: one case per `OfferUsability` code:
    - `null` → `missing`; a `draft` → `unconfirmed`; `archived`; ended;
    - `location_id: "L1"` with action location `"L2"` → `wrong_location`;
    - workspace-wide offer on a location action → `wrong_location` (action location must equal offer location, both null allowed);
    - `currency: "HKD"` on `tw` → `wrong_currency`;
    - an unpriced offer on either market → `usable`;
    - a workspace mismatch → `missing`.
  + `bindingStatus`: `null` binding → `unbound`; revision 1 vs offer revision 2 → `changed`; confirmed same revision → `current`; same revision but ended → `ended`; `archived` → `archived`; offer back in `draft` at the same revision → `unconfirmed`.
  + `prompt-facts.test.ts`:
    - `priceDisplay` uses `formatOfferPrice`;
    - `validityDisplay` follows locale;
    - `openEnded` and `endsOn` copied;
    - no `prohibited_wording`, `asset_ids`, `created_by` or `workspace_id` in the result (only what the prompt needs).
  + `flag.test.ts`: `"true"` → true; `"1"`, `"TRUE"`, `" true"`, unset → false.
* **Step 2: Run** `corepack pnpm vitest run lib/offers/`. Expected: FAIL (modules missing).
* **Step 3: Implement** the eight modules. No I/O and no clock reads. `today` and `now` are always parameters.
* **Step 4: Run** Step 2 command and `corepack pnpm typecheck`. Expected: PASS.
* **Step 5: Commit** `feat(P4.1): pure offer validation, dates, formatting and usability`

---

### Task 3: Offer repository, service and audit events

**Files:**
- Create: `lib/repositories/offers.ts`, `lib/offers/service.ts`, `lib/offers/service.test.ts`, `test/integration/neon-offers.integration.test.ts`
- Modify: `lib/workspace/audit.ts` (`AUDIT_EVENTS` at `:11`), `lib/workspace/audit-labels.ts`

**Interfaces:**
- Consumes: Task 2 modules; `recordNeonEvent` (`lib/workspace/audit.ts:69`); `assetRepository` and `assetUsableByAction` (`lib/workspace/assets.ts:97`).
- Produces:
- `offerRepository(client?: Pick<Pool,"query">)`, with:
- `list(workspaceId, opts: { locationIds?: readonly string[] | null }): Promise<OfferRow[]>`
- `get(workspaceId, id): Promise<OfferRow | null>`
- `create(input: OfferInput & { workspaceId; locationId; createdBy }): Promise<OfferRow>`
- `update(workspaceId, id, expectedRevision, patch: OfferInput): Promise<OfferRow | "conflict" | "archived" | null>`: `revision = revision + 1`, `status = 'draft'`, `confirmed_by/at = null`, a single `UPDATE … WHERE id=$1 AND workspace_id=$2 AND revision=$3 AND status <> 'archived' RETURNING …`.
- `confirm(workspaceId, id, expectedRevision, actorId): Promise<OfferRow | "conflict" | null>`
- `archive(workspaceId, id, actorId): Promise<OfferRow | null>`
- `AUDIT_EVENTS` gains `"offer.created"`, `"offer.updated"`, `"offer.confirmed"`, `"offer.archived"`, with labels `{ en: "Offer created", zh: "已建立優惠" }`, `{ en: "Offer edited", zh: "優惠已修改" }`, `{ en: "Offer confirmed", zh: "優惠已確認" }` and `{ en: "Offer archived", zh: "優惠已封存" }`.
- `service.ts`: `createOffer`, `updateOffer`, `confirmOffer`, `archiveOffer`. Each takes `{ repo, assets, audit, membership, workspace: { id, market, timezone }, now, locale, ipHash }` (all injected).
- Each returns `{ ok: true; offer } | { ok: false; status: 400 | 403 | 404 | 409; error: string }`.
- The D8 scope rule lives in one helper, `canManageOfferAt(membership, locationId)`: false for a manager with non-null `locationScope` when `locationId` is null or outside the scope; otherwise `roleAtLeast(role, "manager")`.

* **Step 1: Write failing tests.**
  + `service.test.ts` (fake repo, assets, audit):
    - an owner creates a workspace-wide offer → `offer.created` audited with payload keys exactly `locale, ip_hash, offer_id, revision, location_id`, with no title, price or claims;
    - a manager scoped to `L1` creating a workspace-wide offer → 403, and creating at `L2` → 403;
    - a viewer → 403;
    - an asset that is `needs_review` → 400 `assets_invalid`; an approved asset of another location → 400 `assets_invalid`;
    - `confirmOffer` without an end-date choice → 409 `end_date_required`; with an ended date → 409 `offer_ended`;
    - `updateOffer` on a confirmed offer returns status `draft` with revision 2 and audits `offer.updated`; a repo `"conflict"` → 409 `offer_conflict`;
    - `archiveOffer` then `updateOffer` → 409 `offer_archived`.
  + `neon-offers.integration.test.ts` (Docker harness as in `neon-mail-outbox.integration.test.ts`):
    - create → update with `expectedRevision: 1` → revision 2; update again with `expectedRevision: 1` returns `"conflict"` and the row is unchanged;
    - `confirm` sets `confirmed_at` and `status`;
    - inserting `status='confirmed'` with neither `ends_on` nor `open_ended` violates `offers_confirmed_check`;
    - `currency` without `price_amount` violates `offers_price_currency_check`;
    - deleting the location deletes its offer, and `actions.offer_id` of an action pointing at it becomes null;
    - `list` with `locationIds: ["L1"]` returns `L1` and workspace-wide offers only.
* **Step 2: Run** `corepack pnpm vitest run lib/offers/service.test.ts` and `NEON_INTEGRATION=1 corepack pnpm test:integration -- test/integration/neon-offers.integration.test.ts`. Expected: FAIL.
* **Step 3: Implement.** Parameterised SQL only. `RETURNING` casts dates and timestamps with `::text` as `lib/repositories/workspace-read.ts` does.
* **Step 4: Run** Step 2 commands plus `corepack pnpm vitest run lib/workspace/audit`. Expected: PASS.
* **Step 5: Commit** `feat(P4.1): offer repository, service and audit events`

---

### Task 4: Offer routes (list, create, edit, archive, confirm)

**Files:**
- Create: `app/api/workspaces/[workspaceId]/offers/route.ts` (+ `route.test.ts`), `app/api/workspaces/[workspaceId]/offers/[offerId]/route.ts` (+ test), `app/api/workspaces/[workspaceId]/offers/[offerId]/confirm/route.ts` (+ test)

**Interfaces:**
- Consumes: Task 3 service; `authorizeWorkspaceRequest` (`lib/auth.ts:140`); `enforceRateLimit` with scope `"action_mutation"`; `ipHashFor`; `offersEnabled`.
- Produces: the contracts in spec §6. `OfferView` is `OfferRow` minus `created_by` and `confirmed_by`, plus `priceDisplay`, `validity` (localized), `phase: "running" | "upcoming" | "draft" | "ended" | "archived"` and `draftCount`.

* **Step 1: Write failing route tests** in the style of `app/api/workspaces/[workspaceId]/brand/route.test.ts` (mocked auth and service):
  + flag unset → 404 on every method;
  + a non-UUID `workspaceId` or `offerId` → 400;
  + unauthenticated → 401;
  + viewer POST → 403; viewer GET → 200;
  + scoped manager GET with `?location=` of an out-of-scope location → 403;
  + POST with `currency: "TWD"` on an `hk` workspace → 400 `currency_market_mismatch`;
  + PATCH without `expected_revision` → 400; PATCH `{ archive: true }` → 200 with status `archived`;
  + confirm with a stale revision → 409 `offer_conflict`;
  + the rate limiter refusing → 429;
  + a service throw → 503 `unavailable`, logged with a `category`, never the body.
* **Step 2: Run** `corepack pnpm vitest run "app/api/workspaces/[workspaceId]/offers"`. Expected: FAIL.
* **Step 3: Implement** thin handlers: parse → flag → auth → rate limit → service → JSON. The locale comes from the body or `x-sme-locale`, as the brand route does.
* **Step 4: Run** Step 2 command and `corepack pnpm typecheck`. Expected: PASS.
* **Step 5: Commit** `feat(P4.1): owner offer routes behind OFFERS_ENABLED`

---

### Task 5: The three workflow definitions on the P4.4 contract

**Files:**
- Modify:
- `lib/workspace/templates.ts`: `TemplateKey` `:16`, `WorkspaceAgentKey` `:31`, the `channel` union `:87`, three rows appended to `TEMPLATES` before `:409`;
- `lib/workspace/workflow-inputs.ts:43`;
- `lib/capabilities.ts`;
- `lib/copy-workspace.ts`: `templates` in all three copies, `ACTION_INPUT_KEYS` `:108` plus the three `inputs([...])` label arrays;
- `lib/workspace/queries-pages.ts:98` (`ActionFilters["channel"]`);
- `components/workspace/action-filters.tsx`;
- `components/workspace/create-view.tsx` (`ICONS` `:41`, `GOALS` `:58`);
- `app/api/actions/route.ts` (`:32-46`);
- `lib/workspace/templates.contract.test.ts` (`SPEC_INPUT_KINDS` `:76`, a new describe);
- `components/workspace/create-view.test.tsx`;
- `app/api/actions/route.test.ts`.
- Note: `lib/agents/index.ts` must register `offer_copy` for typecheck. This task adds a placeholder `defineAgent` in `lib/agents/agents/offer-copy.ts` with the final `key`, `capability: "Beta"` and `promptVersion`, and a minimal task. Task 6 replaces its task text and acceptance. The `agents.test.ts` count update happens here.

**Interfaces:**
- Produces:
- `TemplateKey` gains `"offer-gbp-post" | "offer-social-post" | "offer-chat-message"`.
- `WorkspaceAgentKey` gains `"offer_copy"`.
- `WorkflowDefinition["channel"]` gains `"messaging"`.
- The rows are exactly spec §3's table.
- `SERVER_SATISFIED_INPUT_KEYS` = `{"asset_or_text_only","offer_confirmed"}`.
- `CAPABILITIES.offer_copy = "Beta"`.
- `ACTION_INPUT_KEYS` gains `"offer_confirmed"` (appended last, with labels "Confirmed offer" / "已確認優惠" / "已確認優惠").

* **Step 1: Write failing tests.**
  + `templates.contract.test.ts`:
    - add the three rows to `SPEC_INPUT_KINDS`, literally: `{ offer_confirmed: "confirmed_fact", brand_voice: "preference" }` for the Google and chat rows, and `{ offer_confirmed: "confirmed_fact", asset_or_text_only: "confirmed_fact", alt_text: "preference", brand_voice: "preference" }` for the Instagram row;
    - add `describe("offer workflows")`: for every `isOfferWorkflow` row, `triggerFindingKeys` is `[]`, `agentKey === "offer_copy"`, `delivery === "export_copy"`, `inputs[0]` is `{ key: "offer_confirmed", kind: "confirmed_fact" }`, `capability === "Beta"`, and exactly the three `OFFER_TEMPLATE_KEYS` match;
    - add `offer_confirmed is server-satisfied`: `gateBlockingInputs(templateByKey("offer-gbp-post"), { offer_confirmed: true }, new Set())` equals `["offer_confirmed"]`.
  + `lib/agents/agents.test.ts:61`: expect Beta `["gbp_post","local_seo_brief","menu_translation","offer_copy","photo_brief"]`.
  + `create-view.test.tsx`: no goal card renders for any offer template key.
  + `app/api/actions/route.test.ts`: `template_key: "offer-gbp-post"` → 400 `template_key is invalid`.
* **Step 2: Run** `corepack pnpm vitest run lib/workspace/templates.contract.test.ts lib/workspace/workflow-inputs.test.ts lib/agents/agents.test.ts components/workspace/create-view.test.tsx app/api/actions/route.test.ts`. Expected: FAIL.
* **Step 3: Implement.**
  + Rows use `localized(en, zhHK, zhTW)`, with zh-TW only where wording differs.
  + `measurement`: `null` for Google and chat, `"ig.days_since_last_post"` for Instagram.
  + `GOALS = TEMPLATES.filter((t) => t.agentKey !== null && !isOfferWorkflow(t))`.
  + In `app/api/actions/route.ts`, `TEMPLATE_KEYS` excludes `isOfferWorkflow` rows.
  + `ICONS` maps the Google and Instagram keys to `Newspaper`/`FileImage` and the chat key to `MessageSquareText`.
  + The filter option label is "Messaging" / "訊息" / "訊息".
* **Step 4: Run** Step 2 command, `corepack pnpm vitest run lib/workspace/ lib/agents/ tests/`, and `corepack pnpm typecheck`. Expected: PASS, with the 11 existing snapshot entries unchanged. `git diff dc55e02 -- lib/agents/__snapshots__` shows only additions.
* **Step 5: Commit** `feat(P4.1): three offer workflow definitions on the workflow contract`

---

### Task 6: The `offer_copy` agent and offer acceptance checks

**Files:**
- Modify: `lib/agents/agents/offer-copy.ts` (final), `lib/agents/schema.ts` (`AgentContext` `:29` gains `offer?`), `lib/agents/guardrails.ts` (`confirmedText` `:100`; new checks after `sharedAcceptance` `:165`), `lib/workspace/version-meta.ts` (`GuardrailCode` `:20`, `classify` `:80`), `components/workspace/action-detail-client.tsx` (`guardrailText` `:117`), `lib/agents/agents.test.ts`, `lib/workspace/version-meta.test.ts`

**Interfaces:**
- Consumes: `CHANNEL_LIMITS`, `OfferChannel` (Task 2); `defineAgent`, `inputLine`, `bodyLength`.
- Produces:
- `AgentContext.offer?` as in spec §2.
- `export function wrongMarketCurrency(ctx, output): string[]`, `unconfirmedDiscount(ctx, output)`, `urgencyClaim(ctx, output)`, `healthClaim(ctx, output)` and `hashtagsPresent(output)`. Each returns `[]` or `[code]`.
- `GuardrailCode` gains `"wrong_market_currency" | "unconfirmed_discount" | "urgency_claim" | "health_claim" | "hashtags_present"`.
- `offerCopy` agent with `promptVersion: "2026-10-01.1"`, `role: "a copywriter promoting one owner-confirmed offer"`, `evidence(ctx)` → `{ offer: { title, details, terms, price_display, validity_display, approved_claims, channel, has_asset } }`, and the task text of spec §4 (shared part + channel part chosen by `ctx.offer?.channel`). With `ctx.offer` absent, the task tells the model to return `facts_needed: ["offer_confirmed"]` and an empty body. The gate prevents that path at run time; it exists only so the prompt is total.

* **Step 1: Write failing tests** in `agents.test.ts`:
  + `describe("offer_copy (P4.1)")` with two fixed contexts derived from `fixedCtx`:
    - `hkOffer`: zh-HK, `hk`, `priceDisplay: "HK$88"`, `validityDisplay: "2026-10-05 – 2026-10-31"`, channel `whatsapp_message`;
    - `twOffer`: zh-TW, `tw`, unpriced, open-ended, channel `line_message`.
  + `prompt matches its snapshot` for each, which adds two new snapshot entries.
  + `prompt names the market currency and chat channel`: `hkOffer` contains `HK$88` and `WhatsApp`, no `NT$`, no `LINE`; `twOffer` contains `LINE`, no `WhatsApp`, no `HK$`.
  + `offer text sits inside the untrusted fence`: the index of `"details"` is between the fence markers.
  + `open-ended offers forbid urgency wording` (task text contains the urgency rule only when `openEnded`).
  + Acceptance, positive and negative for each:
    - `wrong_market_currency`: `hk` body `"只需 NT$88"` → flagged; `"只需 HK$88"` → none; `tw` body `"只要 HK$88"` → flagged; `tw` body `"350元"` → none; `hk` body `"350元"` → flagged.
    - `unconfirmed_discount`: `"8折優惠"` with details lacking `8折` → flagged; details `"全單8折"` → none; `"20% off"` → flagged.
    - `urgency_claim`: `openEnded` + `"限時優惠"` → flagged; with `ends_on` set → none; `openEnded` + terms containing `"售完即止"` + body `"售完即止"` → none.
    - `health_claim`: `"排毒養顏"` → flagged; `"detox"` → flagged; details containing `"detox juice"` → none.
    - `hashtags_present`: chat body `"#優惠"` → flagged; Instagram channel never raises it.
    - The channel limits: Google `body_over_1500_chars`; Instagram over 2,200 and `too_many_hashtags` at 6; chat `body_over_500_chars`.
  + `confirmedText includes offer facts`: with `ctx.offer.priceDisplay = "HK$88"`, a body `"HK$88"` raises no `unconfirmed_claim`; without `ctx.offer`, the same body does.
  + `version-meta.test.ts`: each new code classifies to its `GuardrailCode`.
* **Step 2: Run** `corepack pnpm vitest run lib/agents/ lib/workspace/version-meta.test.ts`. Expected: FAIL.
* **Step 3: Implement.**
  + The checks live in `guardrails.ts` so the corpus reaches them. `offer-copy.ts`'s `acceptance` composes `bodyLength(output, CHANNEL_LIMITS[ch].maxChars)` with the hashtag rule per channel, `alt_text_missing` (Instagram with `hasAsset`) and the five offer checks.
  + `confirmedText` appends `ctx.offer`'s title, details, terms, price display, validity display and approved claims when present.
  + `guardrailText` strings use zh-HK 審批 and zh-TW 核准, e.g.:
    - en "The price is in the other market's currency.";
    - zh-HK "價錢用了另一個市場的貨幣。";
    - zh-TW "價格使用了另一個市場的幣別。".
* **Step 4: Run** Step 2 command and `corepack pnpm typecheck`. Expected: PASS. `git diff dc55e02 -- lib/agents/__snapshots__/agents.test.ts.snap` shows only added `offer_copy` entries.
* **Step 5: Commit** `feat(P4.1): offer_copy agent with market-currency, discount, urgency and health checks`

---

### Task 7: Offer context, gate and binding in `runAgentForAction`

**Files:**
- Modify:
- `lib/workspace/runs.ts`: `satisfiedInputs` `:205`; context build `:291-376`; gate `:387-399`; queue `:402-419`; success `finish` `:480-487`;
- `lib/repositories/artifacts.ts`: new `assistantOffer` near `:152`; `FinishActionRunInput` `:286`; `finish` meta `:376`;
- `lib/repositories/workspace-read.ts:15` (`ACTION_COLUMNS` gains `offer_id`);
- `lib/workspace/overview.ts:79` (`ActionRow.offer_id?`);
- `lib/workspace/runs.test.ts`.

**Interfaces:**
- Consumes: `offerUsability`, `offerPromptFacts`, `offerChannel`, `localDate` (Task 2); `offerRepository.get` via `assistantOffer`.
- Produces:
- `ArtifactRepository.assistantOffer(workspaceId: string, offerId: string): Promise<OfferRow | null>`
- `satisfiedInputs(ctx, extra: { asset?: () => Promise<boolean>; offer?: () => Promise<boolean> })`
- `FinishActionRunInput.versionMeta?: Record<string, unknown>`: merged as `{ ...fixedMeta, ...versionMeta }` with the fixed keys spread last, so `versionMeta` cannot replace `warnings`, `agent_key` or `prompt_version`.

* **Step 1: Write failing tests** in `runs.test.ts`, reusing its fake repository with an `assistantOffer` stub:
  + `an unconfirmed offer blocks before the model`: template `offer-gbp-post`, `offer_id: "O1"`, offer `status: "draft"`. Expect `llm` not called, `finish` with `output: null`, `factsNeeded: ["offer_confirmed"]` and `costUsd === computeCostUsd({inputTokens:null,outputTokens:null})`.
  + The same for `archived`; ended (`ends_on: "2026-09-30"`, `now: 2026-10-01T02:00:00Z`, timezone `Asia/Hong_Kong`); a wrong-location offer; `currency: "TWD"` on an `hk` workspace; an action with `offer_id: null`; and `assistantOffer` returning `null`.
  + `a persisted offer_confirmed value does not satisfy the gate` (Review Focus 1): `provided_inputs: { offer_confirmed: true }` on a draft offer → blocked, `llm` not called.
  + `a usable offer reaches the model once with the price display`: the prompt contains `HK$88` and the offer title.
  + `offer prohibited wording joins the brand's prohibited terms`: brand `["cheapest"]` plus offer `["最平"]` → the prompt's prohibited list contains both; a canned body with `最平` yields `prohibited_term:最平`.
  + `the version is bound to the offer revision`: `finish` receives `versionMeta: { offer: { id: "O1", revision: 3 } }`; the queue `input` includes `offer: { id: "O1", revision: 3 }`.
  + `non-offer queue payloads are unchanged`: a `review-response` run's `queue` input deep-equals the pre-change shape (no `offer` key).
  + `an offer read failure surfaces before any run row`: `assistantOffer` throws → the call rejects and `queue` is not called.
  + `the budget check still runs first`: with the budget refusing, `assistantOffer` is not called.
  + Plus a repository unit or integration assertion that `finish` with `versionMeta: { offer: {…}, warnings: ["x"] }` keeps the output's own `warnings`.
* **Step 2: Run** `corepack pnpm vitest run lib/workspace/runs.test.ts`. Expected: FAIL.
* **Step 3: Implement** per spec §5.3. The offer read happens after the brand reads and before `satisfiedInputs`, so it is above `persistence.queue`. The timezone is `workspace?.timezone || "Asia/Hong_Kong"`, as the export route uses.
* **Step 4: Run** `corepack pnpm vitest run lib/workspace/ lib/assistant/ app/api/actions/ test/corpus/workflows/` and `corepack pnpm typecheck`. Expected: PASS (the existing corpus is unchanged).
* **Step 5: Commit** `feat(P4.1): runs read the confirmed offer, gate on it and bind the version to its revision`

---

### Task 8: Prepare channel drafts

**Files:**
- Modify: `lib/repositories/action-mutations.ts` (`createOfferAction` beside `createObjective` at `:46`), `lib/offers/service.ts` (`prepareOfferDrafts`)
- Create: `app/api/workspaces/[workspaceId]/offers/[offerId]/drafts/route.ts` (+ `route.test.ts`)
- Modify: `lib/offers/service.test.ts`, `test/integration/neon-offers.integration.test.ts`

**Interfaces:**
- Produces:
- `createOfferAction(row: OfferActionRow): Promise<{ id: string; created: boolean }>`, the same `ON CONFLICT` upsert-by-dedupe pattern as `createObjective`, with the extra columns `offer_id` and `due_at`.
- `prepareOfferDrafts(deps, { workspace, membership, offerId, templateKeys, locale, now }): Promise<{ ok: true; actions: Array<{ templateKey: OfferTemplateKey; actionId: string; created: boolean }> } | { ok: false; status; error }>`
- Dedupe key: `${workspaceId}:${locationId ?? "all"}:${templateKey}:offer:${offerId}`.

* **Step 1: Write failing tests.**
  + `service.test.ts`:
    - a confirmed, current offer with `["offer-gbp-post","offer-chat-message"]` → two `createOfferAction` calls with `source: "owner_objective"`, `offer_id`, the offer's `location_id`, template `title/summary/effort/capability`, `evidence.factType: "Recommended"`, `evidence.source: "Owner-confirmed offer"`, and `action.updated` audited with `source: "offer"` for each `created: true` only;
    - a draft offer → 409 `unconfirmed`; an ended offer → 409 `ended`;
    - an unknown key → 400;
    - `offer-social-post` on an offer with an approved, usable asset → `provided_inputs: { asset_id, alt_text }`; with none → `provided_inputs: {}` and `action_state: "needs_input"`;
    - `due_at` equals `starts_on` only when `starts_on > today`;
    - a scoped manager on another location's offer → 403.
  + Route test: flag off → 404; viewer → 403; a retry returns the same ids with `created: false`.
  + Integration (Review Focus 5): `concurrent prepareOfferDrafts yields one action per channel`. `Promise.all` of 5 calls for three keys produces exactly 3 open actions with distinct templates, all with `offer_id`.
* **Step 2: Run** `corepack pnpm vitest run lib/offers/ "app/api/workspaces/[workspaceId]/offers"` and `NEON_INTEGRATION=1 corepack pnpm test:integration -- test/integration/neon-offers.integration.test.ts`. Expected: FAIL.
* **Step 3: Implement.** The route only creates actions; it never calls the model (each run is the client's separate `POST /api/actions/[id]/run`).
* **Step 4: Run** Step 2 commands. Expected: PASS.
* **Step 5: Commit** `feat(P4.1): prepare one idempotent action per offer channel`

---

### Task 9: Binding guard on approve and first export; owner edits inherit the binding

**Files:**
- Create: `lib/offers/binding-guard.ts`, `lib/offers/binding-guard.test.ts`
- Modify: `lib/workspace/version-meta.ts` (`VersionMeta.offer`), `app/api/versions/[versionId]/approve/route.ts`, `app/api/versions/[versionId]/export/route.ts`, `app/api/actions/[actionId]/versions/route.ts`, `app/api/versions/[versionId]/versions.test.ts`, `app/api/actions/[actionId]/versions` tests, `lib/repositories/artifacts.ts` (a `versionBindingContext(versionId)` read: version `meta`, `first_exported_at`, action `offer_id`, workspace timezone)

**Interfaces:**
- Produces:
- `assertOfferBinding(repo, versionId, opts: { firstExportOnly: boolean; now: Date }): Promise<null | { status: 409; error: "offer_changed" | "offer_ended" | "offer_unconfirmed" | "offer_archived" | "offer_unbound" }>`. It returns `null` for non-offer actions and, with `firstExportOnly`, for versions whose `first_exported_at` is set.
- `parseVersionMeta(...).offer: OfferBinding | null`. A binding with a non-UUID id or a non-positive-integer revision reads as `null`.
- `offerBindingForEdit(repo, actionId, baseVersionId | null, now): Promise<OfferBinding | null>`.

* **Step 1: Write failing tests.**
  + `binding-guard.test.ts`: one case per status; a non-offer action → `null`; an exported version with a changed offer and `firstExportOnly` → `null`.
  + Route tests (`versions.test.ts`):
    - `approve refuses a changed offer`: binding revision 1, offer revision 2 → 409 `offer_changed`, and `approveOutputVersion` not called;
    - `approve refuses an ended offer` → 409 `offer_ended`;
    - `first export after an offer edit is refused` → 409, and `exportOutputVersion` not called;
    - `re-copy of an exported version after an offer edit is allowed and not counted` (Review Focus 3): `first_exported_at` set → `exportOutputVersion` called, and the response `counted: false` comes from the RPC mock;
    - `non-offer versions are unaffected`: the existing approve/export cases still pass unchanged.
  + Versions route:
    - `an owner edit inherits the base version's binding` (Review Focus 4): with `base_version_id` bound to revision 1, `createVersion` receives `meta: { offer: { id, revision: 1 } }` even though the offer is at revision 2;
    - without a base on a usable offer → the current revision;
    - on an unusable offer → `meta: {}`;
    - a client body containing `meta` is ignored.
* **Step 2: Run** `corepack pnpm vitest run lib/offers/binding-guard.test.ts app/api/versions app/api/actions lib/workspace/version-meta.test.ts`. Expected: FAIL.
* **Step 3: Implement.**
  + The guard runs after `authorizeVersionMutation` and before `approveVersion` / `exportVersion`.
  + A refusal logs `{ category: "offer_binding_refused", status }` only.
  + `createVersion` gains an optional `meta` pass-through. It already accepts `meta`, so only the route supplies it.
  + Add a comment at the guard call naming the known limit: separate statements, no SQL change (spec §5.4).
* **Step 4: Run** Step 2 command and `corepack pnpm typecheck`. Expected: PASS.
* **Step 5: Commit** `feat(P4.1): stale offer drafts cannot be approved or first-exported`

---

### Task 10: Offer screens and action-detail additions

**Files:**
- Create: `app/[locale]/owner/[workspaceSlug]/offers/page.tsx`, `app/[locale]/owner/[workspaceSlug]/offers/[offerId]/page.tsx`, `components/workspace/offers-view.tsx`, `components/workspace/offer-form.tsx`, `components/workspace/offer-detail.tsx`, and `components/workspace/offers-view.test.tsx`, `offer-form.test.tsx`, `offer-detail.test.tsx`
- Modify:
- `components/workspace/more-view.tsx` (`:21-22` area);
- `components/workspace/create-view.tsx` ("Promote an offer" card);
- `components/workspace/action-detail-client.tsx` (offer card, binding banner, approve/export disabling, the `offer_confirmed` input link near `:674`, `offerChecklist`);
- `lib/workspace/queries-pages.ts` (action detail loads the offer view, the run's stored offer facts and `bindingStatus`; `listOffers` for the pages);
- `lib/copy-workspace.ts` (`offerChecklist` per channel and market);
- `lib/messages/en.json`, `lib/messages/zh-HK.json`, `lib/messages/zh-TW.json` (`offers` namespace);
- `lib/offers/client.ts` (new fetch helpers in the `lib/workspace/client.ts` `ClientResult` style);
- `tests/unhonoured-promises.test.ts`;
- `components/workspace/action-detail-client.test.tsx`, `more-view.test.tsx`.

**Interfaces:**
- Consumes: Tasks 4, 8 and 9 routes; `runAction` (`lib/workspace/client.ts:81`); `GET /api/workspaces/[workspaceId]/usage`; `loadOwnerPage` (`lib/workspace/page-context.ts:34`); `LocationSelect`; `CapabilityBadge`.

* **Step 1: Write failing tests.**
  + `offers-view.test.tsx`: four groups render by `phase`; a viewer sees no "New offer"; every row shows the `Beta` badge.
  + `offer-form.test.tsx`:
    - the price prefix is `HK$` for `hk` and `NT$` for `tw`, with no currency picker;
    - "No fixed end date" disables the end-date input;
    - the fixed "Nothing is read from photos…" note renders in each locale;
    - "Start a new offer from this one" pre-fills every field except dates.
  + `offer-detail.test.tsx`:
    - the delivery notice renders **before** the Prepare button with `n` equal to the checked channels and the period usage (`2 of 3`), plus the paid variant;
    - the chat channel is labelled WhatsApp for `hk` and LINE for `tw`;
    - after Prepare, rows move through Drafting → Ready / Needs input / Failed, and "Try again" calls `runAction` for that action only (spy call count 1);
    - "Draft exists — open it" for an existing open action;
    - the photo-brief link is labelled "nothing is generated".
  + `action-detail-client.test.tsx`:
    - an offer action with `bindingStatus: "changed"` shows the banner, and Approve/Export are disabled;
    - an exported version with `changed` keeps Copy enabled;
    - `offer_confirmed` in needed keys renders a link to `/offers/{id}`, not an input;
    - `offerChecklist` renders the market note (PDPO for `hk`, 個人資料保護法 for `tw`) for the chat template only;
    - the new guardrail codes render localized text.
  + `more-view.test.tsx`: the Offers link only when enabled.
  + `tests/unhonoured-promises.test.ts`: the new `PROMISES` entry from spec §10 (banned phrases plus a detector for WhatsApp/LINE messaging API calls in backend sources).
  + `tests/i18n.test.ts` passes with the new keys in all three files.
* **Step 2: Run** `corepack pnpm vitest run components/workspace "app/[locale]/owner" tests`. Expected: FAIL.
* **Step 3: Implement.**
  + Server pages call `offersEnabled()` and `notFound()` when false.
  + Reuse the existing classes (`section-card`, `limitation-note`, `goal-card-grid`) and shadcn components. No new CSS.
  + Copy never says "send", "post" or "publish" in the past tense about the offer.
* **Step 4: Run** Step 2 command, `corepack pnpm lint` and `corepack pnpm typecheck`. Expected: PASS, 0 lint errors, and no new warnings in touched files.
* **Step 5: Commit** `feat(P4.1): offer screens, delivery notice and offer-aware action detail`

---

### Task 11: Regression corpus cases for offers

**Files:**
- Modify: `test/corpus/workflows/harness.ts` (`corpusCaseSchema` gains an optional `offer` fixture and `actionOfferId`; the fake repository gains `assistantOffer`), `test/corpus/workflows/corpus.test.ts` (if the coverage test needs the Beta offer rows listed as covered)
- Create: `test/corpus/workflows/cases/missing_facts-05.json`, `fabricated_claim-06.json`, `fabricated_claim-07.json`, `locale_market-03.json`, `fabricated_claim-08.json`

**Interfaces:**
- Produces: `CorpusCase.offer?: Partial<OfferRow>`. The harness fills safe defaults: confirmed, revision 1, the case market's currency, `starts_on` today and `ends_on` today + 30 relative to the harness clock.

* **Step 1: Write the cases first** (they fail to parse until the schema is extended):
  + `missing_facts-05`: `offer-chat-message`, offer `status: "draft"` → `llmCalls: 0`, `factsNeeded: ["offer_confirmed"]`.
  + `fabricated_claim-06`: `offer-gbp-post`, `hk`, `price_amount: 88`; canned body `"全單8折，只需 HK$88"` with details lacking `8折` → `warningsInclude: ["unconfirmed_discount"]`, `version: true`.
  + `fabricated_claim-07`: `offer-chat-message`, `hk`; canned body containing `NT$88` → `warningsInclude: ["wrong_market_currency"]`.
  + `locale_market-03`: `offer-social-post`, `en` on `tw`, `provided: { text_only: true }`, priced → `promptIncludes: ["Taiwan","NT$"]`, `promptExcludes: ["HK$","WhatsApp"]`.
  + `fabricated_claim-08`: `offer-gbp-post`, `tw`, zh-TW, `open_ended: true`, no terms; canned body `"限時優惠，快來店裡"` → `warningsInclude: ["urgency_claim"]`, `version: true`.
  + No injection case is added for offer text: offer details are typed and confirmed by the owner, so `confirmedText` deliberately trusts them, and a link or claim there is the owner's own. Untrusted text (reviews, scraped pages) never reaches an offer prompt. State this in a comment at the top of `corpus.test.ts`.
* **Step 2: Run** `corepack pnpm vitest run test/corpus/workflows/`. Expected: FAIL (schema rejects `offer`).
* **Step 3: Implement** the schema and harness additions. `CATEGORY_MINIMUMS` is unchanged.
* **Step 4: Run** Step 2 command, `corepack pnpm test`, and `corepack pnpm eval:workflows -- --check-load`. Expected: PASS, and `load ok: 29 cases` (24 + 5). Also run `corepack pnpm eval:workflows -- --budget-usd 1` with no `EVAL_LIVE`. Expected: exit 2 `not_enabled`. This is the only eval invocation allowed (DEC-04).
* **Step 5: Commit** `test(P4.1): corpus cases for unconfirmed offers, invented discounts, wrong currency and urgency`

---

### Task 12: Acceptance journey

**Files:**
- Create: `e2e/acceptance/offer-promotion.spec.ts`
- Modify: `test/e2e/environment.ts` (`isolatedEnv` adds `OFFERS_ENABLED: "true"`), `test/e2e/llm-server.ts` (only if it cannot already return a canned offer draft: add one fixed `offer_copy` response keyed on `offer_copy@` in the prompt)

* **Step 1: Write the spec** against the seeded lite workspace used by `e2e/acceptance/merchant-loop.spec.ts`:
  1. Open Offers from More.
  2. Create an offer (title, details, `88`, dates, terms).
  3. Confirm.
  4. Check all three channels; assert the delivery notice reads `3` and `0 of 3`.
  5. Prepare.
  6. All three rows reach "Ready to review".
  7. Open the Google draft, approve, export; usage shows `1 of 3`.
  8. Copy it again; usage still `1 of 3`.
  9. Edit the offer price to `98` (back to draft, re-confirm).
  10. Open the chat draft: the "changed" banner shows and Approve is disabled.
  11. Run the existing review-reply flow from `merchant-loop.spec.ts`'s helper to prove it still passes.
* **Step 2: Run** `corepack pnpm e2e:acceptance -- e2e/acceptance/offer-promotion.spec.ts`. Expected: FAIL before Tasks 1–10 are present on the branch, PASS after. On Windows, if the standing Turbopack `radix-ui` cascade blocks the dev server, run with the temporary `--webpack` edit in `test/e2e/environment.ts`, revert it with `git checkout --`, and record the run as a diagnostic, not a pass of the literal command.
* **Step 3: Commit** `test(P4.1): acceptance journey from one confirmed offer to counted exports`

---

### Task 13: Gates, invariants, mutation checks and the phase record

**Files:**
- Modify: `docs/implementation/owner-platform-v1/PHASE-4-REPORT.md` (new `## P4.1 — confirmed offers and promotion copy` section), `docs/implementation/owner-platform-v1/PHASE-4-TEST-RESULTS.md`, `docs/implementation/owner-platform-v1/IMPLEMENTATION-TRACEABILITY.md` (the P4.1 row at `:134` moves from `open` to the right state), `docs/implementation/owner-platform-v1/BUSINESS-AND-HOSTED-DECISIONS.md` (only to reference the Q3 outcome under DEC-14 if Willy has decided; otherwise unchanged)

* **Step 1: Unchanged check.** `git diff --stat dc55e02 -- packages neon/migrations/0001_identity.sql neon/migrations/0002_business.sql neon/migrations/0003_workflows.sql neon/migrations/0004_atomic_operations.sql neon/migrations/0005_owner_removal_guard.sql neon/migrations/0006_action_applications.sql neon/migrations/0007_action_verification.sql neon/migrations/0008_workspace_internal.sql neon/migrations/0009_scan_attempts.sql neon/migrations/0010_mail_outbox.sql`. Expected: empty. Then `git diff dc55e02 -- lib/agents/agents/*.ts | grep '^[-+].*task:'` prints only `offer-copy.ts` lines, and the snapshot diff shows only added `offer_copy` entries.
* **Step 2: Gates, one at a time, nothing else running:**
  1. `corepack pnpm typecheck`
  2. `corepack pnpm lint`: 0 errors; state the warning count against the 30 recorded for P4.4.
  3. `corepack pnpm test`: file and test counts against P4.4's 366 / 4,127.
  4. `corepack pnpm build`. If blocked by the Windows Turbopack `radix-ui` cascade, record it as blocked and run `npx next build --webpack` as a labelled diagnostic.
  5. `corepack pnpm test:secret-boundary`
  6. `corepack pnpm test:no-supabase`
  7. `corepack pnpm test:no-self-service-claim`
  8. `corepack pnpm db:verify`: applied 11, replay empty, the Task 1 counts.
  9. `NEON_INTEGRATION=1 corepack pnpm test:integration`
  10. `corepack pnpm e2e`
  11. `corepack pnpm e2e:acceptance`
  12. `corepack pnpm eval:workflows -- --check-load`
      A load-induced 5 s timeout in a file this branch does not touch is re-run alone, and both results are recorded.
* **Step 3: Mutation checks** (scratch script outside the repo; exact-once pattern; restore bytes; verify `git diff --quiet`):
  + (a) Remove `offer_confirmed` from `SERVER_SATISFIED_INPUT_KEYS` → `a persisted offer_confirmed value does not satisfy the gate` fails.
  + (b) Make `offerUsability` ignore `hasEnded` → the ended-offer run test and `confirmable` tests fail.
  + (c) Drop the `firstExportOnly` condition in `assertOfferBinding` → the re-copy test fails.
  + (d) Read the binding from the client body in the versions route → `a client body containing meta is ignored` fails.
  + (e) Remove `offer_id` from the dedupe key → the concurrent-drafts integration test fails.
  + (f) Make `wrongMarketCurrency` check only `HK$` → the `tw` `HK$88` case fails.
* **Step 4: Append the phase record** in the P4.4 section's structure:
  + **Header:** branch, HEAD, base `dc55e02`, spec, plan, environment line, and the bold line **Implemented and locally verified. Nothing here is hosted-verified.**
  + **What it closes:** Master Plan §7 P4.1, with each of its six bullets mapped to the test that proves it.
  + **Decisions:** D1–D10, stating which Willy confirmed.
  + **Commits table**, departures, the verification table and the mutation table.
  + **Not run / blocked:** real-model evaluation (DEC-04); hosted migration (DEC-11); P4.2 and P4.3 not started; P4.5/P4.6 not built.
  + **Open questions:** Q1–Q3 with any answers.
  + **Owner actions:** apply migration 0011 before deploying (same rehearsed procedure as 0010); then set `OFFERS_ENABLED=true` to show the surfaces; unsetting it hides them without losing data.
* **Step 5: Commit** `docs(P4.1): record confirmed offers and promotion copy with their evidence`
