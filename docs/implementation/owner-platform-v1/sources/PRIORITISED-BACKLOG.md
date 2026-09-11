# PRIORITISED-BACKLOG — implementation plan

**Companion to `AUDIT-REPORT.md`** · Baseline: `main @ 8f4c5b4` · 2026-09-09

Ranked by owner impact, then evidence strength, then dependency order, then effort and risk. Every item names exact existing files or clearly labelled new paths. **Repairs** are separated from **new proposals**. Effort carries a confidence, because estimates made from a read-only audit deserve one.

Sequence: **A** critical readiness and trust → **B** joining and first value → **C** three complete AI workflows → **D** repeat use and measurement → **E** later expansion. Prefer small reviewable changes; nothing here is a rewrite.

---

## Stage A — Critical readiness and trust

### A1 · Decide and record what is actually deployed — **P1, repair, effort S (high confidence)**

**Why first.** Every other decision is being made against documents describing a system that is not running (**F-31**). Until this is settled, "is it ready?" is unanswerable.

**Change.** A decision, then paperwork. Either (a) accept that production is live and rewrite the status lines in `README.md:3`, `CLAUDE.md:27`, `docs/integration/DEPLOY.md:3`, `NEON-CUTOVER.md:3` and `LAUNCH-REPORT.md:1-3` to describe the actual deployment, alias, commit and configuration state; or (b) if the alias was never meant to be public, remove it or put Vercel Deployment Protection in front of it — note `ssoProtection` is currently `preview`-only, so production is open.

Also correct `vercel.json`: it disables Git deployment for two stale branches while `main` deploys automatically, which is what produced the live state. If continuous deployment of `main` is intended, say so explicitly in `DEPLOY.md`.

**Owner-visible behaviour.** None (a), or the site becomes unavailable (b).
**Tests.** None. **Rollout.** Documentation only. **Rollback.** Git revert.

### A2 · Close the unauthenticated SSRF — **P1, repair, effort M (high confidence)**

**Files.** `lib/scan/start-job.ts` (validation), `packages/scan-engine/src/collect-providers.ts:795-806` (fetch), `lib/website/checks.ts:160-176` (same gap, authenticated path), reusing `lib/evidence/safe-media.ts:135-296`.

**Change.** Add `website_url` to the `evidenceValid` predicate in `parseScanStartBody` using the existing `isOptionalHttpUrl`, plus a length cap. Then extract the URL-safety core of `safe-media.ts` — scheme allowlist, DNS resolution, private/link-local/ULA rejection, pinned connection, manual redirects re-validated, byte cap — into a shared helper used by both website fetches. Cap the response body and reject non-HTML content types. Also cap `business_name` length, since **F-12** interpolates it into the summary prompt.

**Vendored-package note.** `packages/scan-engine` is vendored verbatim at upstream `b9b4151f`. Prefer injecting the fetch dependency if the engine contract allows; if the package must be edited, record the diff in `packages/scan-engine/VENDOR.md` as the vendoring rules require, and raise the fix upstream.

**Tests.** New unit cases — `http://169.254.169.254/…`, `http://127.0.0.1:5432`, `http://[::1]/`, a public host redirecting to a private one, a 100 MB body, a non-HTML content type — each rejected without a request or safely truncated. **Rollout.** No flag; this is a restriction. **Rollback.** Revert (the previous behaviour is the vulnerability).

### A3 · Make the rate limiter fail closed where money is spent — **P2, repair, effort S (high confidence)**

**Files.** `app/api/scan/start/route.ts:24`, `app/api/scan/process/route.ts:21-26`, `app/api/business/search/route.ts:97-102`, `app/api/business/ig-search/route.ts:124-129`, `.env.example:41`.

**Change.** Flip `failClosed: false → true` on the routes that spend SerpApi, Google Places and RapidAPI quota, returning 503 when the limiter is unavailable, and correct `.env.example`, which currently claims behaviour the code does not have (**F-11**). In the same pass verify whether `RATE_LIMIT_SECRET` is set on the serving deployment — if it is not, these endpoints are unlimited today.

**Tests.** Extend the existing rate-limit route tests. **Rollback.** Revert the flag.

### A4 · Stop a sole owner from destroying their workspace — **P1, repair, effort S (high confidence)**

**Files.** `app/api/workspaces/[workspaceId]/members/route.ts:78-100`; consider a DB-level guard beside `neon/migrations/0003_workflows.sql:31`.

**Change.** The guard at line 93 is unreachable dead code — the route already requires `minRole:"owner"`, so `auth.membership.role` is always `"owner"` (**F-10**). Replace it with a real rule: refuse removal of the last `owner` row (409 `last_owner`). Because the cascade destroys `audit_events` and `workspace_tier_events` — the accountability and billing ledgers — also make `delete_orphaned_workspace()` refuse when related workflow rows exist, or replace hard deletion with an archived state. **New migration** (`0005_…`); do not edit 0001–0004, which are immutable.

**Tests.** Integration: sole-owner self-removal → 409 with workspace intact; removing a second owner → allowed; last-member path covered explicitly. **Rollback.** Data-preserving — the migration only adds a constraint.

### A5 · Pin TLS verification for the database — **P3 now, P2 at the pg 9 upgrade, repair, effort XS (medium confidence)**

`lib/db/client.ts:12-19`: pass `ssl: { rejectUnauthorized: true }` or require `sslmode=verify-full`, which also removes the deprecation warning on every cold start (**F-13**). Medium confidence only because I could not inspect the production connection string.

### A6 · Guard `OWNER_SELF_SERVICE_CLAIM` at boot — **P3, repair, effort XS (high confidence)**

`app/auth/callback/route.ts:160` honours the variable at runtime with no deploy-time guard (**F-37**). Add a startup assertion, or a CI check beside `scripts/assert-no-supabase.mjs`, that fails when it is set — so guardrail 15 is enforced by the build rather than by memory.

---

## Stage B — Joining and first value

The stage that changes the answer to "can an owner join?".

### B1 · Link the claim entry point — **P1, repair, effort S (high confidence)**

**Files.** `components/report-view.tsx` (the block from `OWNER-EXPERIENCE-BLUEPRINT.md` §4.1), `components/unlock-page.tsx` (post-unlock next step), `lib/copy.ts` (three locales).

**Change.** Render `href={/${locale}/owner/sign-in?claim=${slug}}` on the unlocked report and after unlock. This single href is what the entire ownership journey depends on, and it makes the sign-in page's existing instruction true instead of circular (**F-01**).

**Tests.** Browser: the unlocked report shows the claim link with the correct slug; the public preview leaks nothing alongside it; the slug survives into the callback. **Rollback.** Remove the block.

### B2 · Choose and operate one ownership path — **P1, mixed, effort S (path A) / L (path B)**

**Path A — enable the Google claim (configuration, S, high confidence).** Set `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=true` with `GOOGLE_OAUTH_CLAIM_REDIRECT_URI` registered byte-exact. Verify with the repository's own probe: `/api/oauth/google/claim/start?slug=…` must return 401 `unauthenticated` anonymously — not 404 (flag off, today) and not 503 (misconfigured) (**F-02**). Unblocks only owners whose scan matched a Google place and who manage that profile.

**Path B — build assisted assignment for real (new, L, medium confidence).** A request form and route writing `workspace_access_requests` with contact details, an acknowledgement to the owner, a notification to Fimmick, and a status the owner sees on return. The only route for manual-entry and no-GBP owners (**F-06**), and already promised in copy (**F-03**). Requires deciding who operates the queue — a staffing decision as much as an engineering one, and dependent on D2 (there is no sender).

**Recommendation: A now, B next.**

### B3 · Fix the coverage display on the scanning page — **P2, repair, effort XS (high confidence)**

`components/scanning-page.tsx:162` interpolates raw 0–1 coverage into a `%` string, so owners see "覆蓋率 0.7%" (**F-14**). Reuse `coveragePercent` from `lib/report/view-model.ts:114-118`. In the same pass stop showing every collector as "已量度" on a `partial` result (`lib/funnel/scan-progress.ts:57-73`, **F-36**). Add the missing test.

### B4 · Degrade IG-less scans instead of failing them — **P2, repair, effort M (medium confidence)**

`packages/scan-engine/src/processor.ts:181-192` returns `failed` unless two independent modules measured, so a business with no Instagram gets nothing whenever GBP or AEO is unavailable (**F-17**) — contradicting the product's central promise. Medium confidence because it touches the vendored scorer contract. The "unavailable ≠ zero" rule must not be weakened: render a partial report with honest coverage and the existing "not enough independent evidence to score" state (`overall: null`) rather than lowering the scoring threshold.

### B5 · Persist scan consent — **P2, repair, effort S (high confidence)**

The step-4 checkbox is never stored (**F-15**) while guardrail 13 and the owner-facing copy promise a policy-versioned record. Add the field to `buildScanStartPayload`/`parseScanStartBody`, write a `consent_records` row (or emit the already-declared `consent.public_evidence` event), and cover it in the integration suite.

### B6 · Make claim failures visible — **P2, repair, effort S (high confidence)**

The claim callback redirects to `/{locale}/r/<slug>?claim=<reason>` and the report ignores `searchParams`, so a wrong-Google-account owner lands on a public report with no message (**F-05**). Render a banner per reason, each with a next step.

### B7 · Correct the pricing and allowance contract — **P2, business decision + repair, effort S or M**

Public copy promises 12/36 deliveries and 2 seats; enforcement is 3 and unlimited, with no seat limit (**F-16**). Choose Option A (copy follows code, S) or Option B (code follows copy, M, plus the D3 fix). **Do not ship a paid plan while the two disagree.**

### B8 · Surface sign-in on mobile — **P2, repair, effort XS (high confidence)**

`components/product-ui.tsx:257` hides the sign-in link below `lg`, leaving it invisible at 375 px and buried as the 8th hamburger item (**F-28**). Show it at all widths, raise 40 px controls to 44 px, translate the sheet's "Close" (**F-38**).

---

## Stage C — Three complete AI workflows

Depends on Stage B. Specifications are in `AGENT-TOOL-CAPABILITY-MATRIX.md` §3; these items are the gaps that stop those workflows being trustworthy.

### C1 · Stop failed runs looking like successes — **P2, repair, effort S (high confidence)**

`components/workspace/create-view.tsx:87-95` toasts success when the inline run failed (**F-22**); `components/pocket-assistant/assistant-sheet.tsx:150-154` shows "new version created" before the server responds (**F-21**). In an approval product these are trust-critical. Await the result, surface the real state, and test the LLM-unavailable path on both surfaces.

### C2 · Remove the double-entry in review replies — **P2, repair, effort S (high confidence)**

Drop `reviews_without_response` as a required typed input; show the reviews the scan already sampled (`lib/workspace/runs.ts:110-120`) and let the owner select. This is the moment the product demonstrates it did the work.

### C3 · Add a prompt-injection boundary — **P3, repair, effort S (high confidence)**

`lib/agents/prompt.ts:21-46` embeds scraped reviews and website text with no "treat as data, not instructions" statement (**F-12**). Add an explicit delimiter and instruction, bound `provided_inputs` size, and add acceptance scenario **A7**. Existing mitigations are genuinely good — no tools, zod-validated output, no model output influencing authorization — so this is hardening, not a hole.

### C4 · Reap stuck runs and constrain `agentKey` — **P3, repair, effort S (high confidence)**

Nothing ever sets `action_runs.state='timed_out'`, so a killed function permanently disables Generate for that action; and any registered agent can run against any action (`runs.ts:90-93`). Add a reaper (or a transition on next load) and validate `agentKey` against the template.

---

## Stage D — Repeat use and measurement

### D1 · Make scans finish, and say so honestly — **P2, mixed, effort M (medium confidence)**

No completion path exists beyond the 300 s ceiling, and the page polls forever while promising the scan continues in the background (**F-18**). Options: a Vercel cron reaping stale leases — note `tests/cron-registration.test.ts` currently asserts none exists, a test that encodes the old architecture and must be revisited deliberately — or resume-on-return plus honest waiting copy. This also decides whether monthly `scan_schedules` rows mean anything: today `next_run_at` is written and shown on the calendar with nothing in this app to execute it.

### D2 · Provide a sender, or stop promising one — **P2, mixed, effort M (high confidence)**

No email sender exists in this repository, yet unlock copy promises secure delivery to a chosen channel and a 15-minute recovery link (**F-25**), and team invites claim an email was sent (**F-24**). Either wire `RESEND_API_KEY` and build both flows, or correct the copy. B2-B depends on this.

### D3 · Fix the mid-period allowance — **P2, repair, effort S (high confidence)**

`workspace_usage.allowance` is frozen at row creation, so a mid-month upgrade leaves a paying owner capped at 3 exports (**F-20**). Update the allowance when the tier changes in `applyTier`; add an integration test for upgrade-then-export.

### D4 · Make the two-scan comparison reachable — **P2, repair, effort M (medium confidence)**

The panel always renders `no_accessible_pair` on the share route because the grant cookie carries one job and `/r/[slug]` never resolves membership (**F-26**, **F-27**) — a gap the repository's own verification document already records. Pass a membership resolver to `loadReport`, then capture the successful-pair browser proof that is currently missing.

### D5 · Repair analytics reliability — **P2, repair, effort S (high confidence)**

`event_record_failed { backend_unavailable }` fired 9× in production because a 250 ms budget wraps a pooled transactional insert (**F-34**). Raise the budget on the fire-and-forget path or warm the pool. Until this is fixed every funnel denominator below is unreliable.

### D6 · Close the audit and notification gaps — **P3, repair, effort S (high confidence)**

Emit `assistant.run`; write an audit row on Fix Pack review (**F-29**); add a mark-as-read path for `workspace_notifications`, whose unread count can never be cleared today (**F-23**).

### D7 · Define the funnel and the primary metric — **P2, new, effort M (medium confidence)**

Event definitions with explicit denominators, excluding demo actions and duplicates, and separating user-declared completion from provider-verified execution: scan started/completed; signup started/completed; ownership claim completed; first real draft saved; first approved delivery; repeat weekly completion; paid conversion; task failure; time to first useful output.

**Primary value metric: weekly businesses completing a useful approved delivery** — an exact version approved *and* exported. It is already recorded exactly once by `export_output_version`, so it cannot be inflated by generation volume. Guardrails beside it: draft acceptance rate (approved ÷ generated), provider failure rate, LLM cost per delivery, support contacts per active workspace, week-4 retention. **Set no targets yet** — there is no measured baseline, and inventing conversion or time-saved figures would be exactly the fabrication the product's own guardrails forbid.

---

## Stage E — Later expansion

**E1** Offers in the shared context model, enabling a genuine weekly-promotion workflow (*new, M*). **E2** Assisted-assignment operations tooling once B2-B proves demand (*new, L*). **E3** A Fix Pack generator, or remove the card until one exists (*repair, M* — **F-30**). **E4** A verified publishing connector, only with explicit scope and guardrail-6 authorization (*new, L*). **E5** Rewrite `ARCHITECTURE.md` and the stale Supabase sections of `CLAUDE.md` (*repair, M* — **F-32**) — worth doing sooner if agents keep working in this repository, since they read it as contract.

---

## Ranked summary

| Rank | Item | Sev | Type | Effort (conf.) | Blocks |
|---|---|---|---|---|---|
| 1 | A1 Decide/record deployment truth | P1 | repair | S (high) | every release decision |
| 2 | A2 Close SSRF | P1 | repair | M (high) | — |
| 3 | A4 Prevent sole-owner workspace deletion | P1 | repair | S (high) | — |
| 4 | B1 Link the claim entry point | P1 | repair | S (high) | all of Stage C |
| 5 | B2 Operate one ownership path | P1 | config / new | S / L | all of Stage C |
| 6 | A3 Rate limiter fails closed | P2 | repair | S (high) | — |
| 7 | B3 Coverage display | P2 | repair | XS (high) | — |
| 8 | B7 Pricing vs allowance | P2 | decision | S / M | any paid launch |
| 9 | B4 Degrade IG-less scans | P2 | repair | M (med) | — |
| 10 | B5 Persist consent | P2 | repair | S (high) | — |
| 11 | B6 Visible claim failures | P2 | repair | S (high) | — |
| 12 | B8 Mobile sign-in | P2 | repair | XS (high) | — |
| 13 | C1 No fake success | P2 | repair | S (high) | workflow trust |
| 14 | C2 Review double-entry | P2 | repair | S (high) | workflow 1 |
| 15 | D1 Scan completion + scheduler | P2 | mixed | M (med) | repeat value |
| 16 | D2 Sender, or honest copy | P2 | mixed | M (high) | B2-B, invites |
| 17 | D3 Mid-period allowance | P2 | repair | S (high) | paid launch |
| 18 | D4 Comparison reachable | P2 | repair | M (med) | proof of change |
| 19 | D5 Analytics reliability | P2 | repair | S (high) | all measurement |
| 20 | D7 Funnel + primary metric | P2 | new | M (med) | knowing whether any of this worked |
| 21– | A5, A6, C3, C4, D6, E1–E5 | P3 | mixed | XS–L | — |

**Effort scale.** XS ≤ half a day · S ≈ 1 day · M ≈ 2–4 days · L ≈ 1–2 weeks, for one engineer familiar with this codebase, including tests. Confidence reflects how much of the change I could see from a read-only audit: `high` where the change is local and the path fully traced; `medium` where it touches a vendored package, a hosted configuration I could not inspect, or an operational decision.

---

## Release gates for Stage A–B

No item above ships to production without: the repository's ten offline gates green on the exact candidate commit; the new SSRF and last-owner tests passing; a recorded read-only environment inventory confirming `RATE_LIMIT_SECRET`, `REPORT_ACCESS_TOKEN_SECRET` and `OAUTH_TOKEN_ENCRYPTION_KEY` are set; and — for B2 — one authorized end-to-end hosted claim on a named test business, recorded in `LAUNCH-REPORT.md` with deployment ID, commit, origin and outcome. Do not remove existing safety gates to make a release look ready.
