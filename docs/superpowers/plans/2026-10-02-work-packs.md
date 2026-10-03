# P4.2 Work Packs (Visibility Starter Pack) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner starts one "visibility starter pack" per location. It groups the existing review-response, FAQ + JSON-LD and website-basics actions, drafts each one in turn with its own retry, and replaces the disconnected Fix Pack card on Home. Approval and export stay per exact version on each action's own page.

**Architecture:**
- **Data:** migration `0012` adds `work_packs` (at most one open pack per workspace, location and kind, through a partial unique index) and `work_pack_items`, which only link to actions.
- **Starting a pack:** one transaction that reuses or creates each item's action through `createObjective`, with the same dedupe key scan derivation uses.
- **Item status:** always derived from the existing action overviews; packs store no state of their own.
- **Gating:** everything sits behind `WORK_PACKS_ENABLED`, and no code reads the pack tables while it is off.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, PostgreSQL 16 (Neon), plain `pg` repositories, Drizzle schema mirrors, Vitest 4, Playwright 1.61, pnpm 9.12.0 via corepack.

**Spec:** `docs/superpowers/specs/2026-10-02-work-packs-design.md`

## Global Constraints

- **Worktree:** `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p42-work-packs`, branch `p42-work-packs`, base `a71c5df`. Commit per task with conventional messages prefixed `(P4.2)`. The `Co-Authored-By` trailer names the model that wrote the commit. Never push.
- **Commands:** `corepack pnpm <script>`. Focused unit runs: `corepack pnpm exec vitest run <paths>`. Focused integration runs: `corepack pnpm exec vitest run --config vitest.integration.config.ts <files>`. `test:integration -- <filter>` does not filter.
- **Before each commit:** `typecheck`, `lint` and `test` must pass. Known load-timeout flakes: re-run a failing file alone and record both results.
- **Migrations are append-only.** `0001`–`0011` are never edited. `0012_work_packs.sql` is re-runnable. Nothing is applied to a hosted database, no paid provider or real model is called, nothing is deployed and no mail is sent.
- **Flag:** `WORK_PACKS_ENABLED`, on only when it is exactly `"true"`.
  - With it off, every pack route answers 404 `{error:"not_found"}` and the pack page calls `notFound()`.
  - With it off, **no code path issues SQL against `work_packs` or `work_pack_items`**.
  - With it off, Home is byte-for-byte today's: `FixPackCard` unchanged.
- **The starter pack is fixed:** `kind` is `"visibility_starter"`, and its items in position order are `review-response`, `visibility-content`, `website-basics`.
- **Item actions are created or reused only through `actionMutationRepository().createObjective`,** with `dedupe_key = dedupeKeyFor(workspaceId, locationId, templateKey)` (`lib/workspace/actions.ts:87`).
- **Packs store no approval, delivery, run or output state.** No approve or export control is rendered on any pack surface.
- **Delivery unit is unchanged:** each approved version counts once, on its first export (DEC-14 safe default). The disclosure copy is exact: "Creates up to 3 drafts. Nothing is counted until you approve and export a draft; each one you export counts as 1 delivery." On a capped plan, append " This month: {used} of {allowance} used."
- **Copy:** all new owner copy is in `en`, `zh-HK` (香港書面中文) and `zh-TW` (台灣用語), in `lib/copy-workspace.ts`. Raw error codes never reach owners.
- **`agent_runs` is never written, rewritten or relabelled.**

## Review Focus

1. **Home shows all locations in a multi-location workspace.** There's no single location to start a pack for. The Home card shows the open packs for in-scope locations and the text "Choose a location to start a starter pack", with no Start button. Task 4.
2. **Spend is refused mid-pack.** When an item's run answers `ai_paused` or `ai_budget_reached`, the loop stops: no further items are run, and the existing pause or budget owner copy is shown once. Task 4.
3. **A template's only matching action is finished.** If it is completed or dismissed, `createObjective` creates a fresh open action for the new pack, and the finished one is untouched. Task 2.
4. **Two people press Start at once.** One pack, three items, and both get the same pack id. Task 2.
5. **An item's action was already drafted outside the pack.** The loop skips any item whose latest version is in `draft`, `changes_requested` or `approved`, so starting a pack never re-spends on work that already exists. Task 4.

---

### Task 1: Migration `0012` — `work_packs`, `work_pack_items`, schema mirrors

**Files:**
- Create: `neon/migrations/0012_work_packs.sql` and `test/integration/neon-work-packs.integration.test.ts`
- Modify:
  - `lib/db/schema/business.ts` (add `workPacks` and `workPackItems` in the `mailOutbox` style);
  - `lib/db/database.types.ts` (regenerate with `corepack pnpm db:types`);
  - `test/integration/fixtures/legacy-final-catalog.json` (the two tables, their columns and constraints);
  - `test/integration/neon-schema.integration.test.ts` (expected migration list gains `0012_work_packs.sql`; table count 40 → 42);
  - `scripts/neon/catalog.ts` and `test/integration/neon-catalog.integration.test.ts`, only if they enumerate tables or indexes that need the new names.

**Interfaces:**
- Produces, in SQL, exactly spec §1.1–§1.2:
  - Constraint names:
    - `work_packs_kind_check`;
    - `work_pack_items_template_check`;
    - `work_pack_items_position_check` (`position BETWEEN 1 AND 3`);
    - primary key `work_pack_items_pkey (pack_id, template_key)`.
  - Index `work_packs_open_idx`, unique, on `(workspace_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), kind) WHERE closed_at IS NULL`.
  - Index `work_pack_items_action_idx` on `(action_id)`.
  - RLS, the `server_application` policy and the `sme_app_runtime` grants on both tables, as in `0010_mail_outbox.sql:51-55`.

- [ ] **Step 1: Write the failing integration tests.** Reuse the setup from `test/integration/neon-offers.integration.test.ts`.
  - `0012 applies after 0011, and a second applyMigrations returns []`.
  - `a second open pack for the same workspace, location and kind is rejected (23505), and with location_id null too`.
  - `a closed pack does not block a new open one`.
  - `work_pack_items rejects an unknown template_key and position 4 (23514), and a duplicate (pack_id, template_key) (23505)`.
  - `deleting an action referenced by a pack item fails (23503); deleting the workspace cascades through packs, items and actions`.
- [ ] **Step 2: Run** the focused integration file. Expected: FAIL.
- [ ] **Step 3: Write `0012_work_packs.sql`,** the Drizzle mirror and the catalog fixture, then run `corepack pnpm db:types`.
- [ ] **Step 4: Run** the focused file plus `neon-schema` and `neon-catalog`, then `corepack pnpm db:verify` and `corepack pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(P4.2): work pack tables`.

### Task 2: Starter definition, flag, pack overview and `startPack`

**Files:**
- Create:
  - `lib/workspace/packs-flag.ts`;
  - `lib/workspace/packs.ts`;
  - `lib/workspace/packs.test.ts`;
  - `lib/repositories/packs.ts`.
- Modify:
  - `lib/workspace/queries-pages.ts`. Export `overviewsFor` as `export async function overviewsFor(ctx: WorkspaceContext, rows: ActionRow[], scanSatisfiedInputs?: readonly string[]): Promise<ActionOverview[]>`, with no behaviour change.
  - `lib/workspace/audit.ts`. Add `"pack.started"` to `AUDIT_EVENTS`.
  - `lib/workspace/audit-labels.ts`. Add trilingual labels.
  - `test/integration/neon-work-packs.integration.test.ts`.

**Interfaces:**
- Produces, in `lib/workspace/packs-flag.ts`: `workPacksEnabled(env: Record<string, string|undefined> = process.env): boolean`.
- Produces, in `lib/workspace/packs.ts`:
  - `STARTER_PACK = { kind: "visibility_starter", items: ["review-response", "visibility-content", "website-basics"] } as const`, plus types `PackKind` and `StarterItemKey`.
  - `interface WorkPack { id; workspaceId; locationId: string|null; kind: PackKind; createdAt; closedAt: string|null }`
  - `interface PackItem { templateKey: StarterItemKey; position: 1|2|3; action: ActionOverview }`
  - `interface PackOverview { pack: WorkPack; items: PackItem[]; counts: { drafted: number; needsInput: number; approved: number; exported: number; failed: number; finished: number }; nextToReview: { actionId: string; templateKey: StarterItemKey } | null; finished: boolean }`
  - `buildPackOverview(pack: WorkPack, items: Array<{ templateKey: StarterItemKey; position: 1|2|3; action: ActionOverview }>): PackOverview`. This is pure. It counts from each `ActionOverview`:
    - `drafted`: the latest version exists;
    - `needsInput`: `actionState === "needs_input"`;
    - `approved`: the latest version's `approvalState === "approved"`;
    - `exported`: the latest version's `deliveryState === "exported"`;
    - `failed`: `runState === "failed"`;
    - `finished`: `actionState` is in `completed|dismissed|cancelled|expired`.

    `nextToReview` is the first item, by position, whose latest version is `draft` or `changes_requested`. `finished` is true when every item is finished.
  - `isPackFinished(itemActionStates: ActionState[]): boolean`.
- Produces, in `lib/repositories/packs.ts`, `packRepository(client?)` with:
  - `startPack(input: { workspaceId: string; locationId: string|null; actorId: string; locale: string; ipHash: string|null }): Promise<{ packId: string; created: boolean; items: Array<{ templateKey: StarterItemKey; actionId: string; reused: boolean }> }>`;
  - `openPack(workspaceId: string, locationId: string|null): Promise<{ pack: WorkPack; itemRows: Array<{ templateKey; position; actionId }> } | null>`;
  - `getPack(packId: string): Promise<{ pack: WorkPack; itemRows: … } | null>`;
  - `packScope(packId: string): Promise<{ workspaceId: string; locationId: string|null } | null>`.
- Produces, in `lib/workspace/packs.ts`: `loadPackOverview(ctx: WorkspaceContext, pack, itemRows): Promise<PackOverview>`. It calls `loadActionRows(ctx.workspace.id, { ids })`, then `overviewsFor`, then `buildPackOverview`.

**`startPack` rules,** in one transaction on one client:
1. Lock any open pack for the key with `SELECT … FOR UPDATE`.
2. If it is open and not finished (item action states read in the same transaction), return it with `created: false` and write nothing.
3. If it is finished, set `closed_at = now()`.
4. Insert the new pack. A 23505 from the open index means a concurrent winner: roll back to a savepoint, re-read the open pack and return it with `created: false`.
5. For each starter item, in position order, call `createObjective` with the row:
   - `template_key`, `source "owner_objective"`, `source_finding_keys []`;
   - `title` and `summary` from the template;
   - evidence `{factType:"Recommended", source:"Visibility starter pack", value:"", detail: <pack name, localized>, observedAt, freshness}`;
   - `priority "medium"`, `priority_score 50`, `priority_factors []`, `effort_minutes` from the template;
   - `required_inputs` as `app/api/actions/route.ts:125` computes it (`applyResolvedInputs` over the template's inputs), `provided_inputs {}`;
   - `action_state` `"needs_input"` when required inputs are missing, else `"recommended"`;
   - `measurement_state "not_eligible"`, `capability` from the template;
   - `dedupe_key = dedupeKeyFor(workspaceId, locationId, templateKey)`.

   `reused = !created`.
6. Insert the three item rows.
7. Write the `pack.started` audit row in the same transaction, with payload `{pack_id, location_id, items:[{template_key, action_id, reused}]}`.

`createObjective` must run on the transaction's client. Add an optional `client` parameter to `actionMutationRepository` if it doesn't already accept one, with no behaviour change for existing callers.

- [ ] **Step 1: Write the failing unit tests,** `packs.test.ts`.
  - `STARTER_PACK` contract: each item is a `TEMPLATES` key with a non-null `agentKey`, and `!isOfferTemplate`.
  - `workPacksEnabled` is true only for `"true"`.
  - `buildPackOverview` counts and `nextToReview` for this fixture set: review-response with a draft version; visibility-content `needs_input`; website-basics exported, which gives `drafted 2, needsInput 1, exported 1, nextToReview review-response`.
  - `finished` is true only when all three items are finished.
- [ ] **Step 2: Write the failing integration cases.**
  - `start creates one pack and three items`.
  - `reuses an open scan-derived action unchanged (same id, same evidence, reused:true)`.
  - `creates a missing action with the derivation key; a later derivation upsert updates it, without a duplicate, leaving source owner_objective`. Insert through the derivation SQL path the repository uses in `lib/repositories/action-derivation.ts`.
  - `a completed action for a template does not block: a new open action is created and the completed one is untouched` (Review Focus 3).
  - `two concurrent startPack calls give one pack and one set of items, and both return the same packId` (Review Focus 4).
  - `start while unfinished returns created:false and writes no audit row`.
  - `start after every item finished closes the old pack (closed_at set) and opens a new one`.
  - `pack.started audit payload lists template_key, action_id and reused`.
- [ ] **Step 3: Run both focused suites.** Expected: FAIL.
- [ ] **Step 4: Implement it.**
- [ ] **Step 5: Run both again, plus `lib/workspace/queries-pages` tests.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(P4.2): starter pack definition, overview and idempotent start`.

### Task 3: Pack routes

**Files:**
- Create:
  - `app/api/workspaces/[workspaceId]/packs/route.ts` (POST and GET) and its `route.test.ts`;
  - `app/api/packs/[packId]/route.ts` (GET) and its `route.test.ts`.

**Interfaces:**
- Consumes: Task 2; `authorizeWorkspaceRequest`, `inLocationScope` and `roleAtLeast` from `lib/auth.ts`; `enforceRateLimit({scope:"action_mutation", failClosed:true})`; `ipHashFor` and `localeFrom`; the location-in-workspace check as in `app/api/actions/route.ts:71-82`.
- Produces:
  - **`POST /api/workspaces/[id]/packs`:** `{location_id: uuid|null}` → 201 `{ pack: PackOverview, created: boolean }`. It returns 400 for an invalid id, or a location not in the workspace; 403 for a viewer or an out-of-scope manager; 429; 503 on a repository failure; 404 when the flag is off.
  - **`GET /api/workspaces/[id]/packs?location=<uuid|"none">`:** any member gets 200 `{ pack: PackOverview | null }`. A scoped manager asking for an out-of-scope location gets 403.
  - **`GET /api/packs/[packId]`:** a member with the pack's location in scope gets 200 `{ pack: PackOverview }`. Unknown is 404, out of scope is 403.
  - Handler order: flag → UUID and body → scope read → auth → location scope → rate limit (POST only) → work.

- [ ] **Step 1: Write the failing route tests,** mocking as `app/api/offers/offers.test.ts` does.
  - The flag off gives 404 on all three handlers, with neither the repository nor auth called.
  - Owner, scoped manager in scope, scoped manager out of scope, viewer and non-member, for each handler.
  - POST: a repeat returns the same pack with `created:false`; `location_id` from another workspace gives 400; the 429 comes before any repository write.
  - GET with `location=none` reads the workspace-wide pack.
- [ ] **Step 2: Run** `corepack pnpm exec vitest run "app/api/workspaces/[workspaceId]/packs" "app/api/packs"`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run the same command,** then `typecheck` and `lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(P4.2): pack routes`.

### Task 4: Home pack card, pack page, shared sequential runner

**Files:**
- Create:
  - `lib/workspace/use-sequential-runs.ts`, extracted from `components/workspace/offer-promotion-panel.tsx`'s `runRow`/`outcome` loop;
  - `components/workspace/pack-card.tsx` and `pack-card.test.tsx`;
  - `components/workspace/pack-view.tsx` and `pack-view.test.tsx`;
  - `app/[locale]/owner/[workspaceSlug]/packs/[packId]/page.tsx`.
- Modify:
  - `components/workspace/offer-promotion-panel.tsx`, to use the hook with no behaviour change; its existing tests must pass unchanged;
  - `components/workspace/home-brief.tsx:182`;
  - `app/[locale]/owner/[workspaceSlug]/page.tsx`, to pass `workPacks`;
  - `components/workspace/fix-pack-card.tsx`, to add a `mode?: "full" | "earlier"` prop;
  - `lib/workspace/client.ts`, to add `startPack` and `getOpenPack`;
  - `lib/copy-workspace.ts`.

**Interfaces:**
- Produces, in `lib/workspace/use-sequential-runs.ts`:
  - `useSequentialRuns(opts: { onStop?: (reason: "ai_paused" | "ai_budget_reached") => void }): { rows: Record<string, RowState>; runAll(actionIds: string[]): Promise<void>; retry(actionId: string): Promise<void> }`
  - `RowState = "idle" | "generating" | "draft_ready" | "needs_input" | "failed"`.
  - `runAll` runs one at a time and stops on `ai_paused` or `ai_budget_reached`, calling `onStop` once and leaving later rows `idle` (Review Focus 2).
- Produces, in `client.ts`:
  - `startPack(workspaceId: string, locationId: string|null): Promise<ClientResult<{ pack: PackOverview; created: boolean }>>`
  - `getOpenPack(workspaceId: string, locationId: string|null): Promise<ClientResult<{ pack: PackOverview | null }>>`
- Produces: `PackCard` props `{ locale; workspaceId; workspaceSlug; role; location: { id: string|null; isAll: boolean }; inScope: boolean; usage: { approvedDeliveries: number; allowance: number|null } | null; initialPack: PackOverview | null }`.
- Produces: `HomeBriefView` gains `workPacks?: { enabled: true; card: PackCardProps; earlierDrafts: { workspaceId: string; role: WorkspaceRole } }`.
  - When `workPacks` is present, Home renders `PackCard` plus `FixPackCard mode="earlier"`.
  - `mode="earlier"` renders nothing when there are no pending drafts, and otherwise lists only those drafts under "Earlier staff drafts". It uses the same review controls and routes.
  - When `workPacks` is absent, Home renders exactly today's `FixPackCard`.

**Card behaviour:**
- **No open pack:**
  - list the three items with their template outcome text;
  - show the exact disclosure copy before any request;
  - owners and in-scope managers get a Start button, which calls `startPack` then `runAll` over items that have no latest version and are not finished (Review Focus 5).
- **Open pack:** per-item state from `ActionOverview` (live row state while running), a Retry on failed rows, "Review next" linking to `…/actions/{nextToReview.actionId}`, and a link to the pack page.
- **`location.isAll` in a multi-location workspace:** the text "Choose a location to start a starter pack", with no Start button (Review Focus 1).
- **Never rendered on the card or the pack page:** approve, export, reject or bulk controls.

**Pack page:** a server component. It checks the flag (otherwise `notFound()`), loads with `loadOwnerPage`, `packScope` and scope, `getPack` and `loadPackOverview`, and renders `PackView`: the same item list, Retry and Review next, read-only when closed.

**Required copy,** in English; zh-HK and zh-TW follow the copy rules:
- the title "Visibility starter pack";
- the disclosure (Global Constraints);
- "Choose a location to start a starter pack";
- "Earlier staff drafts";
- item states: "Generating", "Draft ready", "Needs your facts", "Approved", "Exported", "Failed — retry", "Not started".

- [ ] **Step 1: Write the failing component tests.**
  - **PackCard:**
    - the disclosure is visible before any request, with "This month: 1 of 3 used." for `{1,3}` and without that sentence for `null` allowance;
    - Start calls `startPack` then `runAction` for each item in turn;
    - `ai_paused` on item 1 stops the loop, so `runAction` is called once and the pause copy shows once;
    - an item whose action already has a draft version is skipped;
    - Retry calls `runAction` only for that item;
    - a viewer gets no Start or Retry;
    - an `isAll` multi-location workspace shows the choose-a-location text with no Start;
    - no button whose name matches /approve|export|核准|匯出/ is ever rendered.
  - **PackView:** a closed pack renders read-only, and there are no approve or export controls.
  - **FixPackCard:** `mode="earlier"` renders nothing with zero pending drafts, and lists the pending drafts under "Earlier staff drafts" otherwise.
  - **HomeBriefView:** without `workPacks`, it renders the existing `FixPackCard`, matched against the current markup.
  - **OfferPromotionPanel:** the existing tests pass unchanged after the hook extraction.
- [ ] **Step 2: Run** `corepack pnpm exec vitest run components/workspace lib/workspace`. Expected: FAIL.
- [ ] **Step 3: Implement it.** Compose the existing classes and `components/ui/*`; no restyling.
- [ ] **Step 4: Run the same command,** then `typecheck` and `lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(P4.2): starter pack card, pack page and earlier staff drafts`.

### Task 5: Flag-off safety against a database without `0012`

**Files:**
- Create: `test/integration/neon-work-packs-flag-off.integration.test.ts`.

**Interfaces:**
- Consumes: `applyMigrations` with an explicit migration list (`scripts/neon/migrations.ts`), Task 2's `workPacksEnabled`, the Home data loader that `app/[locale]/owner/[workspaceSlug]/page.tsx` uses, `getHomeBrief`, and `listActions`.

- [ ] **Step 1: Write the test.**
  1. Apply only `0001`–`0011` to a fresh owned database. Seed one workspace, a location and an action.
  2. With `WORK_PACKS_ENABLED` unset, run the Home page's server data assembly, the same function calls the page makes, including whatever decides `workPacks`. Then run `listActions`.
  3. Assert that both succeed, and that `workPacks` is `undefined`.
  4. Then set the flag to `"true"` and assert the pack read fails with `42P01` (relation does not exist). This proves the test exercised the gated path.
- [ ] **Step 2: Run it.** Expected: PASS, given Tasks 2–4 gate every read. If it fails, gate the offending read; do not weaken the test.
- [ ] **Step 3: Commit** `test(P4.2): deploying before 0012 is harmless while the flag is off`.

### Task 6: Acceptance journey

**Files:**
- Modify: `test/e2e/safety.ts:13`, adding `WORK_PACKS_ENABLED: "true"`; `test/e2e/safety.test.ts`, asserting it.
- Create: `e2e/acceptance/work-pack.spec.ts`, following `e2e/acceptance/offer-promotion.spec.ts`. Use its `clickUntil` only on controls that open things, never on ones that change data.

- [ ] **Step 1: Write the spec.**
  1. Sign in and open Home for a single-location seeded workspace. The disclosure is visible.
  2. Start the pack. Three items appear. review-response and website-basics reach "Draft ready", and visibility-content reaches "Needs your facts". DB: one open `work_packs` row and three `work_pack_items` rows.
  3. "Review next" opens the review-response action page. Approve and export there. DB usage goes up by 1. Returning to Home shows the item as exported.
  4. Reload Home and press Start again if it is shown, or call `POST …/packs`. The same pack id comes back, and the DB still has one open pack.
- [ ] **Step 2: Run** `corepack pnpm exec playwright test --config playwright.acceptance.config.ts work-pack`. Expected: PASS. Record the actual outcome. If the Windows Turbopack block applies, run the `--webpack` diagnostic as P4.4 did and record it separately.
- [ ] **Step 3: Commit** `test(P4.2): acceptance journey for the starter pack`.

### Task 7: Gates, `apply-0012.sql`, phase record

**Files:**
- Modify:
  - `.env.example` (`WORK_PACKS_ENABLED=`, with the comment "exactly true shows the visibility starter pack; safe to deploy before 0012, but set only after 0012 is applied");
  - `docs/integration/DEPLOY.md` (the flag, `0012`, the order and rollback);
  - `docs/implementation/owner-platform-v1/PHASE-4-REPORT.md` (a new P4.2 section in the P4.1 structure, with the opening paragraph updated);
  - `PHASE-4-TEST-RESULTS.md`;
  - `IMPLEMENTATION-TRACEABILITY.md` (rows for P4.2, E3, F-30 and F-29).
- Create: `docs/implementation/owner-platform-v1/rollout/apply-0012.sql`. Generate it exactly as `apply-0011.sql` was (see its header and the P4.1 runbook): the expected journal is `0001`–`0011` with their checksums, and it embeds `0012`'s exact text. Rehearse it on a disposable `postgres:16` with the production-like roles: the pre-grant refusal, a wrong-journal refusal, a first apply, `applyMigrations` returning `[]`, ownership and runtime grants, and a second-run refusal.

- [ ] **Step 1: Run the full offline gate inventory sequentially** and record every command, exit, count and skip. The list is `typecheck`, `lint`, `test`, `test:integration`, `db:verify`, `test:no-supabase`, `test:no-self-service-claim`, `build`, `test:secret-boundary`, `e2e` and `e2e:acceptance`, plus any extra gate in `.github/workflows/ci.yml`.
- [ ] **Step 2: Generate and rehearse `apply-0012.sql`,** and record the output.
- [ ] **Step 3: Write the report.** It covers:
  - what changed, by task, with commit hashes;
  - the decision table;
  - every ruling from the ledger;
  - deferred minors;
  - known limits: a fixed pack kind only; the FAQ item usually needs owner facts; a multi-location "all" view can't start a pack;
  - not run: the hosted migration (DEC-11), the real-model evaluation (DEC-04) and P4.3;
  - owner actions: apply `0012` (test branch, then production), deploy, then set the flag. Deploying before `0012` is harmless while the flag is off, as Task 5 proves.

  State plainly: implemented and locally verified; nothing hosted-verified.
- [ ] **Step 4: Commit** `docs(P4.2): record the starter pack, gates and the 0012 statement`.
