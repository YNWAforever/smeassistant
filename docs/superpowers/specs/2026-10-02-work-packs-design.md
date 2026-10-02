# P4.2 — Work packs: the visibility starter pack: design

**Date:** 2026-10-02 · **Branch:** `p42-work-packs` (from `origin/main` at `a71c5df`, PR #28) · **Status:** approved in brainstorming, awaiting spec review

## Why

Master Plan §7 P4.2 (sources E3, F-30, remaining F-29):

- **No second system.** "Define a pack as a grouping of ordinary evidence-linked actions and their existing immutable versions." Do not create "a second competing output/approval/billing system".
- **Idempotent generation.** "Add a pack generator that creates permitted tasks through existing services. Record idempotency so a retry does not duplicate every task in the pack."
- **The legacy card.** "Adapt/retire the disconnected legacy Fix Pack presentation with an explicit migration/compatibility decision. Preserve reachable historical records and review audit events; do not pretend legacy `agent_runs` rows were already populated by the new model."
- **Approval stays exact.** "Keep approval and export per exact version. A 'review pack' view may simplify navigation but must not approve unseen mutable content or collapse location permissions."
- **Partial progress.** "Show partial completion and per-item failure. Retrying one item must not regenerate or recount successful items."

The plan's example pack is "reply to selected reviews + export missing FAQ content + export website basics."

This is the third Phase 4 slice, in the order chosen on 2026-09-30: P4.4 → P4.1 → **P4.2** → P4.3. P4.5 and P4.6 stay unbuilt.

### Baseline at `a71c5df`

- **No pack model exists.** There is no table, route or page. Migrations run `0001`–`0011`.
- **The Fix Pack card is disconnected.** `components/workspace/fix-pack-card.tsx` (rendered from `components/workspace/home-brief.tsx:182`) lists `agent_runs` drafts through `lib/repositories/fix-pack.ts`. Only Fimmick's separate staff tooling writes `agent_runs`; no generator exists in this repository (F-30). The empty state already says the drafts come from staff tooling and carries a "Planned" badge.
- **F-29 is closed.** Approving or rejecting a Fix Pack draft writes an audit row (`app/api/workspaces/[workspaceId]/fix-pack-drafts/[runId]/route.ts:71`).
- **The three workflows already exist as templates.** `review-response`, `visibility-content` (FAQ + JSON-LD) and `website-basics` are on the P4.4 contract. Scan derivation creates their open actions with `dedupe_key = dedupeKeyFor(workspace, location, template)` = `<workspace>:<location|all>:<template>` (`lib/workspace/actions.ts:87`). Its upsert (`lib/repositories/action-derivation.ts:81`) refreshes evidence and priority on an open action with that key and never changes `source`.
- **Running a draft is one route.** `POST /api/actions/[id]/run` already enforces membership, scope, the P3.5a spend budget, the P3.5d AI kill switch and the P4.4 pre-model gate.

## Decisions (user, 2026-10-02)

| Question | Decision |
|---|---|
| What goes into a pack | **One fixed "visibility starter pack"** per location: review replies, FAQ + JSON-LD, and website basics, reusing the open actions the scan created. Owners don't assemble anything. |
| The legacy Fix Pack card | **Replace it, keep history.** Home shows the pack card. Pending staff drafts in `agent_runs` stay reviewable in an "Earlier staff drafts" section while any are pending. `agent_runs` rows are never rewritten or relabelled. |
| What starting a pack runs | **Create, then draft each item.** Create or reuse each item's action, then run a draft for each, one at a time, with independent failure and retry. |
| Storage | **New tables** (migration `0012`) for idempotency, per-item membership and pack history. |
| Delivery unit | Unchanged DEC-14 safe default: each approved version counts once on its first export. A three-item pack is up to three deliveries. This is shown before anything runs. |

## 1. Data — `neon/migrations/0012_work_packs.sql`

Local only. Applying it to a hosted database needs DEC-11 authorization.

### 1.1 `public.work_packs`

| Column | Type | Rule |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `workspace_id` | `uuid NOT NULL` | `REFERENCES workspaces(id) ON DELETE CASCADE` |
| `location_id` | `uuid` | `REFERENCES locations(id) ON DELETE CASCADE`; null when the workspace has no location split. |
| `kind` | `text NOT NULL` | CHECK `kind IN ('visibility_starter')` |
| `created_by` | `uuid` | `REFERENCES app_users(id) ON DELETE SET NULL` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `closed_at` | `timestamptz` | Null while open. |

**At most one open pack per (workspace, location, kind):** a unique index on `(workspace_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), kind) WHERE closed_at IS NULL`. This index is what makes "Start pack" idempotent under concurrency.

RLS, the `server_application` policy and the `sme_app_runtime` grants follow `0010`/`0011`.

### 1.2 `public.work_pack_items`

| Column | Type | Rule |
|---|---|---|
| `pack_id` | `uuid NOT NULL` | `REFERENCES work_packs(id) ON DELETE CASCADE` |
| `action_id` | `uuid NOT NULL` | `REFERENCES actions(id)` (default `NO ACTION`, so deleting an action that a pack points to fails, while a workspace delete still cascades through both) |
| `template_key` | `text NOT NULL` | CHECK `template_key IN ('review-response','visibility-content','website-basics')` |
| `position` | `smallint NOT NULL` | 1–3 |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

The primary key is `(pack_id, template_key)`, with an index on `action_id`.

**Packs store no state of their own.** There is no approval, delivery, run or output column. An item's status is always derived from its action, the latest run and the latest version, through the existing `buildActionOverview` and `displayPhase`. This is the "no second ledger" rule made structural.

### 1.3 Schema mirrors

`lib/db/schema/*`, `lib/db/database.types.ts`, the catalog fixture, and the schema and catalog tests are updated in the same commit, as `0011` did.

## 2. Starting a pack — `lib/workspace/packs.ts` + `lib/repositories/packs.ts`

### 2.1 The starter definition

```ts
export const STARTER_PACK = {
  kind: "visibility_starter",
  items: ["review-response", "visibility-content", "website-basics"],
} as const;
```

A contract test pins that each item names a template on the P4.4 table with an agent, and none is an offer template.

### 2.2 `startPack(workspaceId, locationId, actor)`

Runs in **one transaction**:

1. **Lock and reuse.** Lock the open pack for `(workspace, location, kind)` if there is one. If it exists and is **not finished**, return it with `created: false`; nothing else changes.
2. **Close a finished pack.** If it exists and **is finished**, set `closed_at = now()`. "Finished" means every item's action is in `completed`, `dismissed`, `cancelled` or `expired`.
3. **Insert the pack.** On a unique-index conflict from a concurrent start, return the winner's pack with `created: false`.
4. **Create or reuse each item's action**, in order. Use `actionMutationRepository().createObjective` with `dedupe_key = dedupeKeyFor(workspace, location, template)`, the same key scan derivation uses, so it is one action either way:
   - if an open action with that key exists (usually scan-derived), it is reused unchanged;
   - otherwise a new action is created with `source: "owner_objective"`, evidence `{factType: "Recommended", source: "Visibility starter pack", detail: <localized pack name>}`, and `required_inputs` computed exactly as `POST /api/actions` computes them. A later scan refreshes its evidence and priority through derivation's existing upsert, and leaves `source` alone.
5. **Insert the three `work_pack_items` rows.**
6. **Audit.** Record `pack.started` with `{pack_id, location_id, items: [{template_key, action_id, reused: boolean}]}`. The return is `{ pack, created: true }`.

`startPack` never calls a model. A pack whose items are reused open actions adds no new action rows.

### 2.3 Drafting

The client then calls the existing `POST /api/actions/[id]/run` for each item, **one at a time, in position order**, skipping items whose action is already finished or already has a draft version. As in P4.1:

- Each item shows its own state and its own Retry. A retry runs only that action.
- Spend budget, kill switch and the pre-model gate apply unchanged, per item.
- The FAQ item normally stops at "needs your facts" (three owner facts), with a link to its action page to supply them. This is a normal outcome, not a failure.

### 2.4 Pack status (derived)

`packOverview(pack)` returns:

- the items, in position order, each with its `ActionOverview`;
- `counts: { drafted, needsInput, approved, exported, failed, finished }`;
- `nextToReview`: the first item whose latest version is `draft` or `changes_requested`, else null;
- `finished: boolean`.

It never writes anything.

## 3. Routes and pages

Everything is behind `WORK_PACKS_ENABLED`, which counts as on only when it is exactly `"true"` (`lib/workspace/packs-flag.ts`).

**Every read and write of the pack tables is behind the flag,** including the Home card's query. With the flag off the app never touches `work_packs`, so deploying before `0012` is applied is genuinely harmless. A test pins this by running the Home page and actions pages against a database with no `0012`, flag unset.

### 3.1 Routes

| Route | Who | Does |
|---|---|---|
| `POST /api/workspaces/[id]/packs` | owner; manager for an in-scope `location_id` | Takes `{ location_id: uuid \| null }`. It validates that the location belongs to the workspace, applies the rate limit `action_mutation`, then calls `startPack`. Returns 201 `{pack, created}`. A repeat returns the same pack. |
| `GET /api/workspaces/[id]/packs?location=` | any member | Returns the open pack for the location (or null) plus `packOverview`, filtered by the caller's location scope. |
| `GET /api/packs/[packId]` | any member in scope | `packOverview` for one pack, open or closed. |

Order in every handler: flag (404 when off) → UUID and body → scope read → `authorizeWorkspaceRequest` → location scope → rate limit → work.

### 3.2 Pages

- **Home card** (`components/workspace/pack-card.tsx`) replaces `FixPackCard` when the flag is on:
  - **No open pack:** "Start your visibility starter pack", with the three items listed, the delivery-unit disclosure (*"Creates up to 3 drafts. Nothing is counted until you approve and export a draft; each one you export counts as 1 delivery."*, plus "This month: n of m used." on a capped plan), and a Start button for owners and in-scope managers.
  - **Open pack:** progress (e.g. "2 of 3 drafted · 1 needs your facts"), each item's state, a link to the pack page, and "Review next" when there is a draft to review.
- **Pack page** (`/[locale]/owner/[workspaceSlug]/packs/[packId]`): the same item list with per-item Retry, links to each action's page, and "Review next".
  - **There is no approve or export control here.** Approval and export happen only on the action's own page, on the exact version.
  - A closed pack is shown read-only, as history.
- **Earlier staff drafts:** when the flag is on, Home renders the existing Fix Pack list under the heading "Earlier staff drafts", **only when at least one `agent_runs` draft is pending**. It uses the existing routes, review controls and audit. When none are pending the section is absent. The old "drafts appear here after a paid-tier scan" empty state is gone (F-30).
- **Flag off:** Home is exactly as today, with the `FixPackCard` unchanged.

All new copy is in en, zh-HK and zh-TW, and no raw error code reaches the owner.

### 3.3 Permissions

| | Owner | Manager, location in scope | Manager, out of scope | Viewer |
|---|---|---|---|---|
| See pack and items | ✓ | ✓ | ✓ (workspace-wide pack, and in-scope locations) | ✓ |
| Start pack, run or retry an item | ✓ | ✓ | ✗ 403 | ✗ 403 |
| Approve and export | on each action's page, under the existing rules | | | |

A workspace-wide pack (`location_id` null) follows the existing action rules: a scoped manager may run its items (`inLocationScope(m, null)` is true), as for any workspace-wide action.

## 4. Not in this slice

Custom or owner-built packs, bulk approval, packs spanning locations, offer packs, other pack kinds, regenerating every item at once, P4.3 assistant suggestions, any change to `agent_runs`, and any hosted migration or real-model run.

## 5. Testing

- **Unit:**
  - `STARTER_PACK` contract;
  - `packOverview` counts, `nextToReview` and `finished` across item states;
  - the flag;
  - route permission matrices;
  - flag off gives 404 on every route.
- **Neon integration (owned fixture):**
  - `0012` applies and replays;
  - start creates the pack and three items;
  - reusing a scan-derived open action leaves that action unchanged;
  - creating an action when none is open uses the derivation key, and a later derivation upsert refreshes it without duplicating it or changing `source`;
  - two concurrent starts give one pack and one set of items, and both return the same id;
  - starting again while unfinished returns the same pack;
  - starting after every item has finished closes the old pack and opens a new one;
  - deleting an action a pack points to fails;
  - deleting a workspace cascades through both tables.
- **Flag-off safety:** with `WORK_PACKS_ENABLED` unset, the Home and actions read paths run against a schema **without** `0012` and succeed.
- **Components:**
  - the Home card in each state;
  - the disclosure appears before any request;
  - runs go one at a time, with Retry touching only its item;
  - the pack page has no approve or export control;
  - "Earlier staff drafts" shows only while drafts are pending.
- **e2e acceptance (fixture LLM):** start the pack → three items appear → review-response and website-basics reach "draft ready", FAQ reaches "needs your facts" → "Review next" opens the review-response draft → approve and export → the pack shows 1 exported, and usage goes up by 1 → a repeat start returns the same pack.
- **Full offline gate inventory** on the final candidate, recorded honestly, flaky runs included.

## 6. Rollout and rollback

- `WORK_PACKS_ENABLED` defaults off. `.env.example` documents it, unset.
- **Order:** apply `0012` on a Neon test branch, then production (`rollout/apply-0012.sql`, generated and rehearsed like `apply-0011.sql`, refusing unless the journal is exactly `0001`–`0011`). Then deploy, then set the flag and redeploy to enable. Unlike `0011`, deploying before `0012` is applied is harmless, because no code path reads the pack tables while the flag is off (§3, with a test).
- **Rollback:** unset the flag and redeploy. Home returns to the Fix Pack card. Packs and their items stay in the database, and the actions they point to are ordinary actions that stay listed and workable on the actions pages. Nothing is deleted.

## 7. Deliverables

- this spec;
- the plan, `docs/superpowers/plans/2026-10-02-work-packs.md`;
- code and tests on `p42-work-packs`;
- a P4.2 section in `PHASE-4-REPORT.md` and `PHASE-4-TEST-RESULTS.md`;
- traceability rows for E3, F-30 and F-29;
- `.env.example` and `DEPLOY.md` notes;
- `rollout/apply-0012.sql`, prepared but not run.
