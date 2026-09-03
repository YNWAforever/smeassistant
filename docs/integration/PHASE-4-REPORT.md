# Phase 4 report — action runs, versions, approvals, export, usage

**Date:** 2026-09-03 · **Branch:** `feat/visibility-workspace-integration` · **Base:** sme-scanner `origin/main` `b9b4151f`
**Status:** complete. The owner can generate a draft, save edits as new versions, approve an exact version, export or copy it
(counted once), manage assets, create objective-led actions, and see plan, usage and Fix Pack drafts. The prototype bridge now
serves only `settings/brand` and `settings/team`.

---

## 1. What now exists

### 1.1 Agents (`lib/agents/*`)

Eleven agents (`review_reply`, `review_request`, `social_post`, `ig_bio`, `faq_jsonld`, `website_basics`, `validation_plan` Live;
`gbp_post`, `photo_brief`, `local_seo_brief`, `menu_translation` Beta) share one system prompt that reproduces §3.7 items 1–5:
role, locale and market; brand facts as the only assertable facts; the guardrails verbatim; an evidence JSON block; JSON-only output
with the fixed keys. Output is zod-validated (`lib/agents/schema.ts`), `parseAgentOutput` tolerates fenced JSON, and each agent has a
prompt snapshot test from one fixed context. Upstream's `computeCostUsd` is ported so `action_runs.cost_usd` is populated when the
gateway reports usage.

### 1.2 Runs, versions, usage, audit (`lib/workspace/{runs,versions,usage,audit}.ts`)

- `runAgentForAction` loads the action, workspace, brand profile, location, snapshot evidence and (for review replies) sampled
  reviews through `sanitizeReportProof`; calls the LLM with jsonMode, 0.4, 1200 tokens, 45 s; retries once; a null or invalid
  answer fails the run with a friendly error and never touches an existing draft. `facts_needed` → the action becomes `needs_input`
  and no version is created. `social_post` requires an approved asset or explicit text-only. Every transition is audited.
- `versions.ts` wraps the Phase 2 RPCs and maps PostgREST messages to typed errors (`version_conflict`, `not_approved`,
  `allowance_exceeded`, `version_closed`, `version_not_found`). Approval is idempotent; export counts once per version and a replayed
  idempotency key returns the existing delivery uncounted.

### 1.3 Routes

`POST /api/actions` (objective action, optional run), `POST /api/actions/[id]/run`, `POST /api/actions/[id]/versions`,
`PATCH /api/actions/[id]`, `POST /api/versions/[id]/{approve,request-changes,reject,export}`, `GET /api/workspaces/[id]/usage`,
`GET|POST /api/workspaces/[id]/assets`, `PATCH .../assets/[assetId]`, ported `checkout-link`, `billing-portal`, `fix-pack-drafts`
(list + review) and `POST /api/webhooks/stripe`. Mutations authorise with `authorizeWorkspaceRequest` at manager level with the
action's location, so viewers and out-of-scope managers get 403 on every one; rate limits run after authorisation. Billing links are
owner-only per §3.9.

### 1.4 UI

- Action detail is a client editor with the prototype's markup and dialogs: real versions, dirty tracking, save-as-new-version with
  the conflict UI on 409, approve/request-changes/reject, export to a Markdown download or clipboard after `/export`, the allowance
  card on 409, a needs-input form driven by `facts_needed`, real run rows in the workflow tab, real audit rows in history, offline
  handling from `navigator.onLine`, owner-only role preview, unchanged sticky bar.
- Create page: goals are the templates that have an agent, marked evidence-led when an open action already exists for the scoped
  location; Start creates the objective action and runs it. The demo BFF fetch is gone.
- Assets page: rows from `assets` with 60 s signed URLs, upload (5 MB, image/PDF allowlist, per-workspace storage path), rights
  confirmation setting `rights_confirmed_at`.
- Billing page: plan card (Stripe checkout for lite, portal for paid, owners only), usage `n / allowance`, tier-event history;
  non-owners see the existing "no billing authority" banner from the real role. Fix Pack card on Home lists upstream's drafts with
  approve/reject for owners and managers.

---

## 2. Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint .` | 0 errors (36 warnings, unchanged set) |
| `vitest run` | **143 files, 1349 tests, all passing** (Phase 3: 1204) |
| `next build` | green; 15 new routes (3 pages, 12 API handlers) |
| `playwright test` | 25 passed, 4 skipped (Supabase / SerpApi / magic-link / draft-approve-export journey need env) |
| `test:secret-boundary` | passed across 41 public artifacts (LLM, Stripe and service-role sentinels included) |
| Playbook Phase 4 tests | run → v1; manual edit → v2 (RPC supersedes v1); approve idempotent; export counted once, replay uncounted; allowance 409; viewer and out-of-scope manager 403 on every mutation; `version_conflict` 409; Stripe webhook signature and lifecycle branches |
| Docker-dependent checks | **not run** (unchanged since Phase 0) |

---

## 3. Notes from integration

1. **Stripe API version** is pinned to `2026-08-26.dahlia`; the installed `stripe@22` types reject upstream's older string.
2. **Success/cancel/return URLs** land on the workspace billing page (`/settings/billing?checkout=…`) because this app has no bare
   `/owner` page; the view renders the outcome banners.
3. **`PATCH /api/actions/[id]`** promotes `needs_input → ready` when every required input is present (§3.4 semantics); the playbook
   text does not say so explicitly.
4. **No `action.created` audit event exists in §3.11**, so objective actions record `action.updated` with `payload.change = "created"`.
5. The Write tool corrupted a `\x00-\x1f` regex escape in `lib/workspace/assets.ts` into raw bytes; it was repaired at byte level and
   verified.

---

## 4. Known gaps and follow-ups

- The "draft → approve → export" journey runs only with a configured Supabase and a seeded workspace; the manual path is documented in
  the spec. All Docker-backed checks remain pending.
- `output_versions.meta.warnings` carries guardrail violations detected by the acceptance checks; the UI shows them as reminders, it
  does not block approval (the owner decides).
- The Fix Pack card approves upstream's `agent_runs` drafts through the copied routes; those drafts never become this app's versions
  (v1 scope, §3.7).
- Brand basics from onboarding are still not persisted (open since Phase 2); the brand settings page arrives in Phase 6.

---

## 5. Not done, by design

No migration applied, nothing deployed, no paid provider or LLM called in tests (the LLM is stubbed), `OWNER_SELF_SERVICE_CLAIM` never
set. Phase 5 (Visibility Operator live mode, §3.8) replaces the demo assistant route and adds live, evidence-grounded answers.
