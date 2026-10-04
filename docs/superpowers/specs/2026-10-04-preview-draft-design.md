# P4.5 — Conditional acquisition preview (one unsaved review-reply draft): design

**Date:** 2026-10-04 · **Branch:** `p45-preview-draft` (from `origin/main` at `8582a7c`, PR #30) · **Status:** approved in brainstorming, awaiting spec review

## Why

Master Plan §7 P4.5 (source: Blueprint §5's proposed `/{locale}/start/[jobId]`). It is **new and off by default**, and it may be "implemented only as a separately enabled experiment after the main join path works". The plan's rules:

- **A real grant, not a guessed id.** "Require evidence of a completed scan via an authorized, purpose-limited server-issued capability/grant; a guessed job ID is not enough."
- **Owner text only.** "Use only owner-supplied text, no protected scan evidence and no account access. Checking eligibility does not authorize retrieving hidden report content."
- **One unsaved preview.** "Produce one unsaved preview, labelled '未認領草稿 · 未儲存,' with no version number, approval or export control."
- **Outside the ledger.** "Do not create `actions`, `action_runs` or `output_versions`, or touch approved-delivery usage. Minimal abuse/cost events may exist separately without protected evidence."
- **Budgets.** "Enforce per-job, per-identity/session where available, per-IP and global generation budgets atomically, fail closed and make repeat requests deterministic/idempotent where appropriate."
- **No silent migration.** "Preserving/editing/approving/exporting requires verified ownership and an explicit transfer into the normal workflow, not silently migrating an unverified preview as an approved version."
- **Purpose.** "to test whether a safe taste of output improves legitimate activation. It is not a bypass for the ownership model."

DEC-12 (`BUSINESS-AND-HOSTED-DECISIONS.md`) requires choices on eligible traffic, a purpose-limited grant, the input/privacy model, a generation budget and success/failure metrics. The user made them on 2026-10-04 (below).

Phase 4 order: P4.4, P4.1, P4.2 and P4.3 are merged (PRs #27–#30). This is P4.5. P4.6 still needs DEC-13 and separate authorization.

### Baseline at `8582a7c`

- **Viewer grant.** `POST /api/report-access/unlock` calls `complete_report_unlock`. That records delivery consent and issues a viewer grant: `report_access_grants`, a hashed token, 30 days, the cookie `sme_report_grant` (`lib/report-access/token.ts:3`).
  - `authorizeReport` (`lib/report-access/authorize-report.ts`) returns `{ kind: "viewer", grantId }` only when the presented grant matches the job and is valid (unexpired, unrevoked).
  - `lib/report/load-report.ts:113` looks the grant up through `reportsRepository().findViewerGrant(jobId, grantId)`.
- **Report page.** `/{locale}/r/[slug]` renders `public | viewer | member | staff` views (`lib/report/load-report.ts`). Public jobs are addressed by `share_slug`; job ids are never shown publicly.
- **Agent.** `review_reply` (`lib/agents/agents/review-reply.ts`) takes an `AgentContext` (`lib/agents/schema.ts:29`): locale, market, brand, location, action overview, evidence, provided inputs, and `sampledReviews: { rating, text, time }[]`. It fences review text as DATA and applies injection guards. `computeCostUsd` (`lib/agents/cost-model.ts`) prices reported usage.
- **Controls.**
  - `enforceRateLimit` / `consume_rate_limit` is atomic and keyed by scope plus the HMAC request fingerprint (`lib/security/rate-limit.ts:197`).
  - The P3.5d AI pause is `pauseState(env).ai` (`lib/budgets/pause.ts`).
  - The workspace AI budget is measured from `action_runs.cost_usd` (`lib/budgets/ai.ts`), which a preview must not write to.
- **Migrations:** `0001`–`0012`. 0012 is the current style model: RLS enabled, `REVOKE ALL FROM PUBLIC`, grants and a `server_application` policy for `sme_app_runtime`, and an explicit `ON DELETE` rule on every foreign key.

## Decisions (user, 2026-10-04)

| DEC-12 question | Decision |
|---|---|
| Eligible traffic / grant | **Unlocked report viewers only.** The existing viewer grant for *that* job is the capability. Members, staff and the public view are not eligible. |
| What is generated | **One review reply.** The visitor pastes one customer review and may add a star rating. |
| Budget | **Tight trial:** 1 per grant; 3 per job across grants; 5 per IP per day; 50 per day globally; US$2 per day globally, summed from the preview's own cost records. Any limit or check failure refuses. |
| Hand-off | **Nothing carried over.** The draft is shown once and never stored. The CTA leads to the normal sign-in/claim path, and after a verified claim the owner uses the normal review-reply workflow. |
| Architecture | A **`preview_events` table** (migration `0013`, events only, no text) with an atomic `claim_preview_slot`. Per-IP uses `consume_rate_limit`. Flag `PREVIEW_DRAFT_ENABLED`, off unless exactly `true`. |

**Deterministic repeat, without storing text.** The grant's one slot is claimed atomically before the model call. Every later request from that grant gets the same `already_used` answer. A failed generation releases the slot. The page says plainly that the draft is not kept.

**Route addressing.** Blueprint §5 proposes `/start/[jobId]`. This design uses the report's `share_slug` (`/{locale}/start/{slug}`), because job ids never reach the public and the grant is checked against the job the slug resolves to. Either way, a guessed identifier without the grant gets 404.

## 1. Data — `neon/migrations/0013_preview_events.sql`

This migration is local only. Applying it to a hosted database needs DEC-11 authorization (§8).

### 1.1 `public.preview_events`

```sql
CREATE TABLE IF NOT EXISTS public.preview_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES public.audit_jobs(id) ON DELETE CASCADE,
  grant_id    uuid REFERENCES public.report_access_grants(id) ON DELETE SET NULL,
  outcome     text NOT NULL,
  reason      text,
  cost_usd    numeric NOT NULL DEFAULT 0,
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT preview_events_outcome_check CHECK (outcome IN ('claimed', 'generated', 'failed', 'refused')),
  CONSTRAINT preview_events_cost_check CHECK (cost_usd >= 0)
);
-- indexes: (grant_id), (job_id), (created_at)
```

- **No text column.** No review, reply, prompt, contact detail or raw IP is stored. `ip_hash` is the existing HMAC request fingerprint.
- **Erasure.** `job_id` cascades, so erasing a job erases its preview trail. `grant_id` is set null, so revoking or deleting a grant keeps the cost record.
- **Access.** RLS, revoke and grant follow 0012 exactly, for `sme_app_runtime`.

### 1.2 `public.claim_preview_slot(p_job uuid, p_grant uuid, p_ip_hash text, p_global_daily int, p_usd_daily numeric) returns jsonb`

Security definer, `SET search_path = ''`, EXECUTE granted to `sme_app_runtime` only.

1. `pg_advisory_xact_lock(hashtextextended('preview_slot', 0))`. This is one global lock, so claims are fully serialized. Volume is bounded by the 50 a day limit.
2. Rows with `outcome = 'claimed'` and `created_at < now() - interval '5 minutes'` become `failed` with `reason = 'stale'`. A crashed request cannot hold a slot.
3. The function refuses on the first rule that matches. A refusal inserts an `outcome = 'refused'` row with the reason and returns `{ "allowed": false, "reason": <r> }`. The rules, in order:
   - any `claimed | generated` row for `p_grant` → `already_used`
   - 3 or more `claimed | generated` rows for `p_job` → `job_limit`
   - `p_global_daily` or more `claimed | generated` rows with `created_at > now() - interval '24 hours'` → `daily_limit`
   - `sum(cost_usd)` over the last 24 hours ≥ `p_usd_daily` → `budget`
4. Otherwise it inserts `outcome = 'claimed'` and returns `{ "allowed": true, "event_id": <id> }`.

### 1.3 `public.finish_preview_slot(p_event uuid, p_outcome text, p_reason text, p_cost numeric) returns void`

- Security definer and the same grants as `claim_preview_slot`.
- It updates only a row that is still `claimed`, to `generated` or `failed`, and sets `finished_at` and `cost_usd`.
- `failed` rows never count toward a limit, which is what releases the slot.
- Any other transition is a no-op.

### 1.4 Mirrors and rollout file

- `lib/db/schema/` mirror, `db:types`, and the catalog fixture `test/integration/fixtures/legacy-final-catalog.json`.
- `docs/implementation/owner-platform-v1/rollout/apply-0013.sql`, built the same way as `apply-0012.sql`:
  - one `DO $apply$` block;
  - `SET LOCAL ROLE smeassistant_migrator`;
  - advisory lock `(1936549221,3)`;
  - it refuses unless the journal is exactly `0001`–`0012`;
  - it embeds the migration text and checksum and inserts the journal row.

  It is rehearsed locally and not run.

## 2. Server

### 2.1 `lib/preview/flag.ts`

`previewDraftEnabled(env = process.env)` is true only for the exact string `"true"`.

### 2.2 `lib/preview/limits.ts`

- Fixed values: per grant 1, per job 3, per IP per day 5.
- Overrides, read with `readPreviewLimits(env)`:
  - `PREVIEW_DRAFT_DAILY_LIMIT`: positive integer, default 50;
  - `PREVIEW_DRAFT_USD_DAILY`: positive decimal, default 2.
- An invalid override throws. The route turns that into `unavailable`, so it fails closed.
- Rate-limit scope `preview_draft`: `{ limit: 5, windowSeconds: 86400 }`, fail-closed.

### 2.3 `lib/preview/context.ts` — `buildPreviewContext({ locale, market, businessName, review, rating }): AgentContext`

The context holds exactly the following:
- `locale` and `market`;
- `brand`: `{ voice: "warm", approvedClaims: [], prohibitedTerms: [], languages: [locale], facts: {} }`;
- `location`: `{ name: businessName }`;
- `action`: an **in-memory** `ActionOverview` for the `review-response` template. It is built with `buildActionOverview` from a synthetic row and never persisted;
- `evidence: {}` and `providedInputs: {}`;
- `sampledReviews`: `[{ rating: rating ?? null, text: review, time: null }]`.

Nothing from the report, snapshot, findings or raw data is read or passed.

### 2.4 `lib/repositories/previews.ts`

- `claimSlot(...)` and `finishSlot(...)` call the two SQL functions.
- `previewJob(slug)` returns only `{ id, status, region, business_name }` for the slug. It reads no other column.

### 2.5 `POST /api/start/[slug]/preview` — order of checks

1. Flag off → `404 { error: "not_enabled" }`, with no SQL.
2. Validate the body:
   - `review` is a string of 10–1,500 characters after trimming;
   - `rating` is absent or an integer from 1 to 5;
   - `locale` is supported.

   Otherwise → `400 { state: "refused", reason: "invalid_input" }`.
3. Load `previewJob(slug)`. Missing, or a status other than `done | partial` → `404`.
4. Authorize the `sme_report_grant` cookie for this job with `authorizeReport` (the `findViewerGrant(job.id, grantId)` lookup). Anything other than `{ kind: "viewer" }` → `404`. A session cookie, member or staff identity alone never qualifies.
5. AI pause → `{ state: "refused", reason: "paused" }`. No claim and no model call.
6. `readPreviewLimits` throws → `unavailable`.
7. `enforceRateLimit({ scope: "preview_draft", failClosed: true })` refuses → `ip_limit`.
8. `claimSlot(job.id, grantId, ipHash, daily, usd)`. A refusal → that reason. A throw → `unavailable`.
9. One `llmComplete(AGENTS.review_reply.buildPrompt(ctx), AGENT_LLM_OPTIONS)`, then `parseAgentOutput`.
   - No output, invalid output or `facts_needed` → `finishSlot(failed)` with the reported cost → `unavailable`.
   - Otherwise → `finishSlot(generated, cost)` → `200 { state: "generated", body, warnings }`, where `warnings` combines the agent's own warnings and its acceptance warnings.

**Refusal shape.** Every refusal returns `200 { state: "refused", reason }`; malformed input returns `400`, and auth or eligibility failures return `404`. The client renders refusals from fixed copy and never echoes the input.

**Logging.** Logs carry only `{ category: "preview_<reason>" }`. The review and the reply are never logged.

**Isolation.** No `assistant.run` or workspace audit row is written, because there is no workspace. The only record is `preview_events`.

## 3. Pages

### 3.1 Report card — `components/report-view.tsx` (viewer view only)

- Shown only when `previewDraftEnabled()` is true **and** the access kind is `viewer`. The server component passes a boolean prop, so the flag is checked server-side.
- Copy: en "Try one AI reply draft (not saved)", zh-HK 「試寫一則 AI 評論回覆（不會儲存）」, zh-TW 「試寫一則 AI 評論回覆（不會儲存）」.
- Links to `/{locale}/start/{slug}`.

### 3.2 `/{locale}/start/[slug]` (new)

- **Server side.** The flag, job status and grant are checked exactly as in §2.5 steps 1, 3 and 4. A failure calls `notFound()`.
- **Header.** The badge 「未認領草稿 · 未儲存」 / "Unclaimed draft · not saved".
- **Boundary note.**
  - en: "Only the text you type here is used. Nothing from your report is used, and nothing is saved, approved or published. One preview per unlocked report."
  - zh-HK: 「只會使用你在此輸入的文字，不會使用報告內容，亦不會儲存、核准或發佈任何內容。每份已解鎖報告可試一次。」
  - zh-TW: 「只會使用你在此輸入的文字，不會使用報告內容，也不會儲存、核准或發佈任何內容。每份已解鎖報告可試用一次。」
- **Form.**
  - A review textarea with a live character count.
  - An optional 1–5 star radio group.
  - The submit button "Draft a reply" / 「草擬回覆」.
- **Result.**
  - The reply text under the 「未認領草稿 · 未儲存」 label, with any warnings.
  - A **Copy** button.
  - The line "This draft is not kept. Copy it now if you want it." / 「此草稿不會保留，如需要請立即複製。」 / 「此草稿不會保留，如需要請立即複製。」
  - The CTA "Verify ownership to save and approve drafts" / 「驗證擁有權以儲存及核准草稿」 / 「驗證擁有權以儲存並核准草稿」, linking to `/{locale}/owner/sign-in?claim={slug}`.
- **What it never renders.** No version number, no approve, export, regenerate or edit-and-save control, and no workspace UI.
- **Refusals.** Fixed copy per reason in all three locales. `already_used` says that this report's preview was already used and points to the CTA.
- **Copy rule.** All strings are added in en, zh-HK and zh-TW. zh-TW uses Taiwanese terms where they differ.

## 4. Authority (unchanged, by construction)

- No writes to `actions`, `action_runs`, `output_versions`, `deliveries`, `workspace_usage`, `workspaces`, `workspace_members`, claims or audit tables.
- The grant authorizes only this job's preview. The preview reads only `id`, `status`, `region` and `business_name`.
- Members and staff gain nothing here. The real workflow remains the only way to keep a draft.

## 5. Failure handling

| Case | Behaviour |
|---|---|
| Flag off | No card; `/start` and the route return 404; no SQL |
| No grant, wrong job, expired or revoked grant | 404 |
| Job not `done`/`partial` or unknown slug | 404 |
| Bad input | 400 `invalid_input`, no claim |
| AI paused | `paused`, no claim, no model call |
| Per-IP / grant / job / daily / USD limit | the fixed reason (`ip_limit` / `already_used` / `job_limit` / `daily_limit` / `budget`) |
| Limits misconfigured, claim throws | `unavailable`, no model call |
| Model fails, invalid output, `facts_needed` | `unavailable`, slot released, cost recorded |
| Reload after success | draft gone; a new request returns `already_used` |

## 6. Metrics (DEC-12 success and failure measures)

Documented, read-only SQL lives in `docs/implementation/owner-platform-v1/PREVIEW-METRICS.md`. There is no dashboard. It reports:
- previews generated per day;
- refusals by reason;
- failures by reason;
- daily cost;
- **claim-after-preview rate**: jobs with a `generated` preview whose job later has `audit_jobs.workspace_id` set through a verified claim, divided by jobs with a `generated` preview.

## 7. Testing

No real model, no paid provider and no mail.

- **Unit, route** (`app/api/start/[slug]/preview/route.test.ts`):
  - every step's refusal in order;
  - flag off means zero auth and zero repository calls;
  - a foreign grant, missing grant, member-only or staff-only session gets 404;
  - a non-terminal job gets 404;
  - the slot is released on no output, invalid output and `facts_needed`;
  - responses never contain the input text;
  - logs carry only categories.
- **Unit, context** (`lib/preview/context.test.ts`):
  - the context's keys are exactly as in §2.3;
  - `evidence` and `providedInputs` are empty;
  - the rendered prompt contains the review inside the DATA fence and no snapshot or evidence keys.
- **Unit, limits:** defaults, overrides, and invalid overrides throwing.
- **Unit, pages:**
  - the card renders only for `viewer` with the flag on;
  - `/start` shows the badge, boundary note, form, result and CTA, with no version, approve, export or regenerate controls;
  - copying works;
  - each refusal has its copy in three locales.
- **Integration (Neon Docker):**
  - the grant, job, daily and USD limits;
  - **two parallel claims for one grant → exactly one `claimed`**;
  - `failed` releases the slot;
  - a stale `claimed` row expires;
  - deleting the job cascades;
  - revoking the grant sets `grant_id` null and the row survives;
  - `finish_preview_slot` changes only `claimed` rows.
  - **Flag off:** a statement-recording test proves the card and the route run no SQL, so deploying before 0013 is harmless.
- **Migration gate:** `db:verify` on `0001`–`0013`, plus the catalog fixture and the `apply-0013.sql` rehearsal.
- **Acceptance e2e** (`e2e/acceptance/preview-draft.spec.ts`, flag on in `test/e2e/safety.ts`, fixture LLM):
  1. unlock a report;
  2. see the card;
  3. open `/start`;
  4. paste a review;
  5. see the draft with the badge and the CTA;
  6. a second submit shows `already_used`.

  The test also asserts no rows in `actions`, `action_runs`, `output_versions`, `deliveries` or `workspace_usage`, and exactly one `generated` `preview_events` row.

## 8. Rollout and rollback

- **Deploy before 0013 is harmless while the flag is off.** The card and the route check the flag first and run no SQL, and the flag-off test proves it.
- **To enable:**
  1. Run `apply-0013.sql` in the Neon SQL Editor as `neondb_owner`, on a test branch first, then production. This is a DEC-11 owner action.
  2. Set `PREVIEW_DRAFT_ENABLED=true`, and optionally the two limit overrides, then redeploy.
- **Rollback:** unset the flag. The card disappears and `/start` returns 404. `preview_events` rows stay for metrics.

## 9. Not in this slice

- Any draft type other than a review reply.
- Storing or carrying over review or draft text.
- Regenerating.
- A metrics dashboard.
- Changes to unlock, sign-in or claim.
- Hosted activation.
- P4.6.

## 10. Deliverables

- Code: `lib/preview/{flag,limits,context}.ts`, `lib/repositories/previews.ts`, `app/api/start/[slug]/preview/route.ts`, `app/[locale]/start/[slug]/page.tsx`, the client form component, the report card, the `preview_draft` rate-limit scope, and copy in three locales.
- Data: `neon/migrations/0013_preview_events.sql`, schema mirrors and types, the catalog fixture, and `rollout/apply-0013.sql`.
- Tests: as in §7.
- Docs:
  - `.env.example`: `PREVIEW_DRAFT_ENABLED=`, `PREVIEW_DRAFT_DAILY_LIMIT=`, `PREVIEW_DRAFT_USD_DAILY=`;
  - `docs/integration/DEPLOY.md`;
  - `PREVIEW-METRICS.md`;
  - the P4.5 sections of `PHASE-4-REPORT.md` and `PHASE-4-TEST-RESULTS.md`;
  - `IMPLEMENTATION-TRACEABILITY.md`;
  - DEC-12 recorded as decided in `BUSINESS-AND-HOSTED-DECISIONS.md`.
