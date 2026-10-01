# P4.1 — Confirmed offers and promotion copy: design

**Date:** 2026-10-01 · **Branch:** `p41-offers` (from `origin/main` at `dc55e02`, PR #27) · **Status:** approved in brainstorming, awaiting spec review

## Why

Master Plan §7 P4.1 (source E1; Capability Matrix §§3–4) asks for an `offers` model, but "only after inspecting whether newer code already has one". It should store:

- workspace/location scope;
- owner-confirmed title and details;
- price and currency where applicable;
- validity period;
- terms;
- approved claims and prohibited wording;
- source and confirmation status;
- optional rights-cleared asset references.

It sets these rules:

- Offer facts stay distinct from generated variants.
- Drafts are channel-specific **text**, built through the existing path: action → run → immutable version → exact approval → export.
- The delivery unit is decided and shown before generation.
- "A changed source offer never mutates an immutable prior output."

This is the second Phase 4 slice. The order chosen on 2026-09-30 is P4.4 contract → **P4.1** → P4.2 work packs → P4.3 contextual assistant. P4.5 and P4.6 stay unbuilt, because DEC-12 and DEC-13 are not authorized.

### Baseline at `dc55e02`

- **No offer model exists.** There is no `offers` table in `neon/migrations/0001`–`0010`, nothing in `lib/db/schema/*`, and no offer route or page. The Capability Matrix §4 row "Offers — No — Proposed" is still true.
- **The prompts that would carry an offer forbid one:**
  - `gbp_post` says "No prices, offer dates, event dates or 'limited' wording unless they appear in the brand facts" (`lib/agents/agents/gbp-post.ts:9`).
  - `social_post` says "do not invent dishes, prices, opening dates, offers or events" (`lib/agents/agents/social-post.ts:13`).
  - The shared guardrail (`lib/agents/guardrails.ts:22`) forbids invented prices and offer dates.
  - Brand `facts` (`lib/workspace/brand.ts`) is a free key/value map, with no validity period, currency or confirmation.
- **Approval and export are SQL.** `approve_output_version` and `export_output_version` (`neon/migrations/0004_atomic_operations.sql:6-53, 422-503`) lock the version row `FOR UPDATE`. The export function counts the first export of an approved version against `workspace_usage`.
- **The P4.4 gate** (`lib/workspace/workflow-inputs.ts`) stops a run before the model when a `confirmed_fact` is missing. `SERVER_SATISFIED_INPUT_KEYS` names the keys whose only authority is a server check; today that is just `asset_or_text_only`.
- **Owner-initiated actions** are created by `POST /api/actions` (`app/api/actions/route.ts`), with `source = 'owner_objective'` and an objective dedupe key.

## Decisions (user, 2026-10-01)

| Question | Decision |
|---|---|
| Channels in this slice | **Instagram post and Google Business post**: two drafts per offer. There is no WhatsApp/LINE message, because no sender exists. |
| How drafts are generated | **Two new template rows and one new `promotion_copy` agent**, which takes its channel from the template. The `social_post` and `gbp_post` prompts, snapshots and measurements stay untouched. |
| A draft whose offer later changed or expired | **Approve and export are refused**, enforced in SQL, with a reason the owner can act on (generate a new draft). |
| Who manages offers | **Owners, and managers for the locations in their scope.** Workspace-wide offers are owner-only. Viewers can read. |
| Delivery unit | The DEC-14 safe default, unchanged: each approved version counts once, on its first export. Two channel drafts are two deliveries if both are approved and exported. This is shown before generation. |

## 1. Data — `neon/migrations/0011_offers.sql`

Local only. Applying it to any hosted database is a DEC-11 action and is not part of this slice.

### 1.1 `public.offers`

| Column | Type | Rule |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `workspace_id` | `uuid NOT NULL` | `REFERENCES workspaces(id) ON DELETE CASCADE` |
| `location_id` | `uuid` | `REFERENCES locations(id) ON DELETE CASCADE`; null means the whole workspace. |
| `title` | `text NOT NULL` | 1–120 characters (CHECK) |
| `details` | `text NOT NULL` | 1–1000 characters (CHECK) |
| `terms` | `text NOT NULL DEFAULT ''` | ≤ 1000 characters |
| `price_amount` | `numeric(12,2)` | nullable, `>= 0` |
| `currency` | `text` | nullable, `IN ('HKD','TWD')`; CHECK `(price_amount IS NULL) = (currency IS NULL)` |
| `valid_from` | `date NOT NULL` | |
| `valid_until` | `date NOT NULL` | CHECK `valid_until >= valid_from` |
| `claims` | `text[] NOT NULL DEFAULT '{}'` | Owner-approved claims specific to this offer, added to the brand's. |
| `prohibited_terms` | `text[] NOT NULL DEFAULT '{}'` | Added to the brand's. |
| `asset_id` | `uuid` | `REFERENCES assets(id) ON DELETE SET NULL`; optional photo reference. |
| `status` | `text NOT NULL DEFAULT 'draft'` | `IN ('draft','confirmed','archived')` |
| `revision` | `integer NOT NULL DEFAULT 1` | Incremented by every fact edit. |
| `confirmed_at` | `timestamptz` | Non-null exactly when `status = 'confirmed'` (CHECK). |
| `confirmed_by` | `uuid` | `REFERENCES app_users(id) ON DELETE SET NULL`. It is deliberately left out of the CHECK, so deleting a user never breaks a confirmed offer; the `offer.confirmed` audit event keeps the actor. |
| `created_by` | `uuid` | `REFERENCES app_users(id) ON DELETE SET NULL` |
| `created_at`, `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

There is an index on `(workspace_id, status, valid_until)`. RLS is enabled, with the same `server_application` policy and `sme_app_runtime` grants as `0010_mail_outbox.sql`.

**"Expired" is derived, never stored.** An offer has expired when `valid_until < (now() AT TIME ZONE workspaces.timezone)::date`. An offer whose `valid_from` is in the future is usable, because promoting ahead is the point.

**The application archives offers and never deletes them.** No delete route exists.

### 1.2 `public.actions.offer_id`

`ALTER TABLE actions ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES offers(id)`, with the default `NO ACTION`. That is checked at the end of the statement, so:

- deleting a workspace still cascades through both tables;
- deleting an offer that a live action still points to fails.

The column is nullable, and every existing row stays null. `offer_id` is indexed.

### 1.3 Offer binding on versions

A version of an offer action records the offer revision it was written from, in `output_versions.meta`: `{ "offer_id": "<uuid>", "offer_revision": <int> }`. `artifactRepository.createOutputVersion` (the gateway both `createVersion` and the run's `finish` call) applies one rule:

- **A version from an agent run** records the revision the run actually read; the run path passes it in.
- **Every other version** (an owner edit, an assistant rewrite) records the **base version's** revision. A version with no base on an offer action records none.

So a hand edit never marks a stale draft as current; only a new run against the current offer does. A version on an offer action with no recorded revision is treated as stale (fail closed).

### 1.4 SQL functions

All are `SET search_path TO ''`, schema-qualified, with `REVOKE ALL … FROM PUBLIC` and `GRANT EXECUTE … TO sme_app_runtime`, in the style of `0004`.

**`confirm_offer(p_offer_id uuid, p_actor uuid, p_expected_revision int) RETURNS jsonb`.** It locks the offer `FOR UPDATE` and raises:

- `offer_not_found`;
- `offer_archived`;
- `offer_revision_changed`, when the caller confirmed a revision it did not see;
- `offer_incomplete`, when the title or details are blank;
- `offer_currency_market`, when the currency doesn't match `workspaces.market` (`hk` needs `HKD`, `tw` needs `TWD`);
- `offer_expired`.

If the offer is already confirmed at that revision, it returns `{kind:'already-confirmed'}`. Otherwise it sets `confirmed` and `confirmed_by`/`confirmed_at`, and inserts `offer.confirmed` into `audit_events`.

**`archive_offer(p_offer_id uuid, p_actor uuid) RETURNS jsonb`.** It locks the offer and sets it to `archived`. It then sets every open action with that `offer_id` to `cancelled`; "open" means `action_state NOT IN ('completed','dismissed','cancelled','expired')`. It inserts `offer.archived`, and is idempotent.

**`offer_current_for_version(v public.output_versions) RETURNS void`.** This is an internal helper, granted no further than its two callers need. If `v`'s action has an `offer_id`, it runs `SELECT … FROM offers WHERE id = … FOR SHARE`, then raises:

- `offer_inactive`, when the offer isn't `confirmed`;
- `offer_changed`, when `v.meta->>'offer_revision'` is null, isn't an integer, or differs from `offers.revision`;
- `offer_expired`.

**`approve_output_version` and `export_output_version` are re-created** with one added call to `offer_current_for_version(v)`, immediately after the version row is locked and found.

- In `export_output_version`, the call sits **after** the existing idempotency-key early return, so retrying a completed export still answers `existing`.
- Nothing else in either body changes. Allowance, period, counting, audit rows and return shapes are byte-for-byte as in `0004`.
- A test diffs each new body against `0004` minus the one inserted line.

Edits take `FOR UPDATE` on the offer row and these two functions take `FOR SHARE`, so an edit and an approval or export serialize. Either the export finishes against the old revision before the edit commits, or it sees the new revision and refuses.

### 1.5 Schema mirrors

`offers` and `actions.offer_id` are added to:

- `lib/db/schema/*` (Drizzle);
- `lib/db/database.types.ts` (`db:types`).

The schema and catalog integration tests, and any table list that enumerates runtime tables, are updated in the same commit.

## 2. Workflow — on the P4.4 contract

### 2.1 Template rows (`lib/workspace/templates.ts`)

Two rows are added to `TEMPLATES`, and `TemplateKey` is extended:

| Field | `offer-instagram-post` | `offer-google-post` |
|---|---|---|
| `triggerFindingKeys` | `[]` | `[]` |
| `capability` | `Beta` | `Beta` |
| `agentKey` | `promotion_copy` | `promotion_copy` |
| `inputs` | `offer_id` (confirmed_fact), `brand_voice` (preference) | same |
| `delivery` | `export_copy` | `export_copy` |
| `deliveryUnit` | `approved_version` | `approved_version` |
| `measurement` | `ig.days_since_last_post` | `null` (the scan does not measure Google posts) |
| `externalFacing` | `true` | `true` |
| `channel` | `instagram` | `google` |

- **Copy:** `outcome`, `title`, `summary` and `workflow` in en, zh-HK and zh-TW.
- **Agent:** `WorkspaceAgentKey` gains `promotion_copy`, and `CAPABILITIES.promotion_copy = "Beta"`.
- **Existing contract tests** cover the new rows without changes: they already require agent/capability agreement, no `publish` delivery, and every agent in use.
- **A new contract case** pins two things: neither offer row has trigger keys (so they can never be derived from a scan), and `offer_id` is a `confirmed_fact`.

### 2.2 The offer satisfier

`offer_id` joins `SERVER_SATISFIED_INPUT_KEYS`, so a persisted id never satisfies the gate by itself.

A new `offerSatisfied(...)` in `lib/workspace/runs.ts` sits beside `socialAssetSatisfied` and is exported for reuse.

- **Lookup:** it loads the offer by the action's `offer_id` **column**, not by `provided_inputs`, and only within the action's workspace.
- **When it returns the offer:** only when the offer is `confirmed`, has not expired, and is usable by the action under the caller's location scope. This is the same family of predicate as `assetUsableByAction`.
- **Effect:** `satisfiedInputs` adds `offer_id` when it returns an offer.
- **A blocked run** ends through the existing `persistence.finish({ output: null, factsNeeded: ["offer_id"] })` path: zero model calls, zero cost, and the action moves to `needs_input`.

The run reads the offer **once**. It uses that one object for both the prompt and the version binding, and passes its `revision` to `createVersion`. If the offer is edited between that read and approval, approval refuses, because the draft describes the revision it was written from.

### 2.3 The `promotion_copy` agent (`lib/agents/agents/promotion-copy.ts`)

It is defined with `defineAgent`, with `capability: "Beta"` and its own `promptVersion`.

**The `offer` evidence block.** The context gains a fenced `offer` block containing:

- the title, details and terms;
- the price and currency, if any;
- the validity dates;
- the offer's claims;
- the alt text of the linked asset, when that asset is rights-approved and usable by the action.

The offer's `prohibited_terms` are merged into the brand's for this run.

**The task, by channel:**

- **Instagram:** one caption of at most 220 words (or 300 Chinese characters), with at most five hashtags. It describes a photo only through the supplied alt text, and is text-only otherwise.
- **Google:** one post, with a summary under 300 characters and a hard limit of 1,500, ending with one plain call to action.
- **Both:**
  - The offer block is the only allowed source of price, currency, dates and terms.
  - If the offer has a price, the draft states it exactly once, with its currency, as given.
  - The draft states the validity dates.
  - It never adds "limited", stock, ingredient, allergen or eligibility claims that aren't in the offer or brand facts.

**Acceptance checks.** These are warnings shown to the approver, and they run alongside P4.4's shared `unexpected_link` and `unconfirmed_claim`:

- `offer_price_mismatch`: either the body contains a price-like token whose number isn't the offer's amount, or the offer has a price and the body states none. Price-like means the `$`, `HK$`, `NT$`, `HKD`, `TWD`, `元` and `蚊` forms.
- `offer_dates_missing`: neither validity date appears in a recognised form (ISO, `M月D日`, `D/M`, `D MMM`).
- `offer_prohibited_term`: a merged prohibited term appears.
- `bodyLength` per channel, plus `too_many_hashtags` for Instagram.

As in P4.4, these warn rather than block: the owner is the approver and sees them before approving.

**The assistant** (`lib/assistant/live.ts`) gains **no** promotion draft intent. Its existing rewrite path, used on an offer action, produces a version that inherits the base version's revision (§1.3). So approval still enforces freshness.

### 2.4 Regression corpus

`test/corpus/workflows/` gains cases for `promotion_copy`. They run through the existing harness, with a fake offer repository:

| Case | Expected result |
|---|---|
| Unconfirmed offer | Blocked before the model. |
| Expired offer | Blocked before the model. |
| `hk` workspace with a `TWD` offer | Refused at confirmation (a repository-level case). |
| Canned output inventing a different price | `offer_price_mismatch` |
| Canned output omitting the dates | `offer_dates_missing` |
| Offer `details` carrying injected instructions | They stay inside the fence and are not followed (asserted on the rendered prompt). |
| A prohibited term in the canned output | `offer_prohibited_term` |

The coverage assertion, "every Live workflow with an agent has a case", is extended to the Beta workflows this slice adds.

## 3. Owner flow and routes

Every route returns 404 unless `OFFER_PROMOTIONS_ENABLED === "true"`. The flag lives in `lib/workspace/offers-flag.ts`, in the same exact-match style as `assignment-flag.ts`. Every route authorizes with `authorizeWorkspaceRequest` and the location-scope helpers. The UI mirrors those checks but never decides.

### 3.1 Routes

**`GET /api/workspaces/[id]/offers`** (any member)
- Returns the offers the caller can see: workspace-wide offers plus those for in-scope locations, each with its derived `expired` flag.

**`POST /api/workspaces/[id]/offers`** (owner; or a manager, for an in-scope `location_id`)
- Creates a `draft` offer.
- Validates lengths, dates and currency against the workspace market.
- If an `asset_id` is given, checks that it belongs to the workspace and is usable by the offer's location.
- Records an `offer.created` audit event, and is rate-limited under `action_mutation`.

**`PATCH /api/offers/[offerId]`** (same rule, applied to the offer's scope)
- The body carries `expected_revision`.
- A single `UPDATE … WHERE id = $1 AND revision = $2` sets the new facts, sets `revision = revision + 1` and `status = 'draft'`, and clears confirmation.
- If zero rows update, it returns 409 `offer_revision_changed`.
- An archived offer returns 409.
- Records an `offer.updated` audit event naming only the fields that changed.

**`POST /api/offers/[offerId]/confirm`** (same rule)
- Takes `{ expected_revision }` and calls `confirm_offer`.
- The codes it raises map to 409 or 422 with the same names.

**`POST /api/offers/[offerId]/archive`** (same rule)
- Calls `archive_offer`.

**`POST /api/offers/[offerId]/promotions`** (owner or manager, for the offer's scope)
- Takes `{ channels: ("instagram"|"google")[] }`, defaulting to both.
- Requires a confirmed, unexpired offer.
- Creates or returns one action per channel, with:
  - `source = 'owner_objective'`;
  - `offer_id`;
  - `location_id = offer.location_id`;
  - `template_key` according to the channel;
  - evidence `{factType:"Recommended", source:"Owner offer", detail: offer title}`;
  - `dedupe_key = 'offer:<offerId>:<templateKey>'`.
- A retry returns the same action ids with `created: false`.
- Returns `{ actions: [{ channel, actionId, created }] }`.
- Does **not** call the model.

**Approve and export keep their existing routes.** Their new SQL errors (`offer_changed`, `offer_inactive`, `offer_expired`) are mapped in `lib/workspace/versions.ts` to 409 with the same code. The action detail page never shows the raw code; it renders plain owner copy for each, for example "The offer changed after this draft was written. Generate a new draft from the current offer."

### 3.2 Pages

**`/[locale]/owner/[workspaceSlug]/offers`**
- A list showing each offer's status, validity, scope and an "expired" badge.
- A create and edit form.
- Confirm, with a plain statement of what confirming means: "These details are correct and may be used in drafts".
- Archive.
- Viewers see the list read-only.

**Offer detail → "Create promotion drafts"**
- Before anything runs, the panel states the delivery unit using the existing usage read: *"Creates 2 drafts (Instagram, Google). Nothing is counted until you approve and export a draft; each one you export counts as 1 delivery. This month: n of allowance used."* When the allowance is unlimited, the last sentence is left out.
- On confirm, the client calls `/promotions`, then calls `POST /api/actions/[id]/run` for each action in turn.
- It shows each draft's state: generating, draft ready, needs input, or failed with a retry button.
- A failed or refused run of one draft never affects the other, and retrying runs only that action.
- Spend budgets (P3.5a) and the AI kill switch (P3.5d) apply unchanged, because runs go through the existing route.

**Action detail, for an offer action**
- Shows the offer (title, price, validity, revision) beside the evidence.
- Shows a stale banner when:
  - the latest version's recorded revision differs from the offer's current one;
  - or the offer has expired;
  - or the offer has been archived.

**Navigation**
- An "Offers" entry in the workspace shell, shown only when the flag is on.

All new strings exist in en, zh-HK and zh-TW (`lib/copy-workspace.ts`). The zh-TW strings use 台灣用語.

### 3.3 Permissions

| | Owner | Manager, offer's location in scope | Manager, otherwise | Viewer |
|---|---|---|---|---|
| Read offers | All | Workspace-wide and in-scope | Workspace-wide and in-scope | All |
| Create, edit, confirm or archive a location offer | ✓ | ✓ | ✗ 403 | ✗ 403 |
| Create, edit, confirm or archive a workspace-wide offer | ✓ | ✗ 403 | ✗ 403 | ✗ 403 |
| Create promotion drafts, run, approve, export | ✓ | ✓ (existing action rules) | ✗ | ✗ |

## 4. What is explicitly not in this slice

- Image generation.
- Any sending or publishing: WhatsApp, LINE, Instagram or Google.
- A draft for a messaging channel.
- Counting a bundle or campaign as one delivery.
- Work packs (P4.2).
- Assistant suggestions, or a promotion draft intent for the assistant (P4.3).
- Hosted migration, deployment, or real-model runs.
- Re-checking asset rights at approval or export time. Rights are checked when the offer is saved and when a draft is generated, and the exported text carries only the alt text.

## 5. Testing

**Unit**
- Offer body parsing and validation: lengths, dates, currency against market, asset scope.
- `offerSatisfied`, across:
  - confirmed, draft and archived offers;
  - an offer that expires at the date boundary in the workspace's timezone;
  - a future `valid_from`;
  - an out-of-scope manager;
  - the wrong workspace.
- `createVersion`'s binding rule: an agent run records the revision it read; an edit records the base version's revision; a version with no base records none.
- `promotion_copy` prompt snapshots for both channels and all three locales.
- Each acceptance check, including CJK price and date forms.
- The version-error mapping.

**Contract**
- The two rows have no triggers, `offer_id` is a `confirmed_fact`, `promotion_copy` is Beta in both registries, and neither row has a `publish` delivery.

**Routes**
- Every route, called as an owner, an in-scope manager, an out-of-scope manager, a viewer and a non-member.
- Flag off returns 404.
- `/promotions` is idempotent: a repeat call returns the same ids and creates nothing.
- `/promotions` is refused for draft, archived and expired offers.

**Neon integration (owned Docker fixture)**
- Migrating and confirming:
  - The migration applies on top of `0010`, and is idempotent where the runner expects it to be.
  - `confirm_offer` handles a revision race between two editors.
  - Archiving cancels the offer's open actions.
- Refusals:
  - Approval is refused after an edit (`offer_changed`), after archiving (`offer_inactive`) and after expiry (`offer_expired`). Expiry uses the database clock and the workspace's timezone.
  - Export is refused the same way, while a retried export with an already-used idempotency key still returns `existing`.
  - A concurrent edit and export serialize.
- Counting:
  - Exporting two channel versions adds 2 to `approved_deliveries`.
  - Exporting one version twice counts once.
- Preservation:
  - Editing the offer leaves an exported historical version's body and delivery rows unchanged.
  - Actions without an offer approve and export exactly as before.
  - Deleting a workspace cascades through its offers and actions.

**Corpus**
- The cases in §2.4.

**e2e (fixture LLM)**
1. The owner creates an offer and confirms it.
2. They create promotion drafts, and both drafts are ready.
3. They approve and export the Instagram draft.
4. They edit the offer.
5. Approving the Google draft is now refused, with the stale-offer copy.

**Full offline gate inventory**
- Run on the final candidate, and recorded in `PHASE-4-TEST-RESULTS.md` with exact commands and exits, as in P4.4.

## 6. Rollout and rollback

- **The flag defaults to off.** `.env.example` documents `OFFER_PROMOTIONS_ENABLED`, unset. With it off, every offer route returns 404 and the nav entry is hidden.
- **Deploying the code before `0011` is applied is inert.** The flag is off, no action has an `offer_id`, and the current `approve_output_version` and `export_output_version` still exist.
- **Applying `0011` to a hosted database needs DEC-11 authorization.** It follows the recorded procedure: a single `DO` block run as `smeassistant_migrator`, rehearsed on a fixture, applied to a test branch and then production. With `0011` applied and the flag off, actions without an offer behave identically, because the helper returns immediately when `offer_id` is null.
- **Rollback:** turn the flag off. Offers, offer actions and versions stay where they are. There's no need to restore the `0004` function bodies, because the added check only acts on actions that carry an `offer_id`.

## 7. Deliverables

- This spec.
- The implementation plan, `docs/superpowers/plans/2026-10-01-offers-promotion-copy.md`.
- Code and tests in reviewable commits on `p41-offers`.
- A P4.1 section in `PHASE-4-REPORT.md` and `PHASE-4-TEST-RESULTS.md`.
- A traceability row for E1 / P4.1.
- `.env.example` and `DEPLOY.md` notes for the flag and the migration.
- The `0011` production statement, prepared but not run.
