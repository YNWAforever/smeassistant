# Phase 3 report — owner-platform-v1

## P3.1 — scan scheduler dispatch

**Branch** `claude/session-development-6a86ea` · **HEAD** `5aad416ee985a29ea0fc4a7acca770cd96d2453f` · Node `v24.18.0`, pnpm `9.12.0` via corepack, Windows 11.

Built from `docs/superpowers/plans/2026-09-13-scan-scheduler-dispatch.md` (8 tasks), against the approved design in `docs/superpowers/specs/2026-09-13-scan-scheduler-trigger-design.md`. Base: `main` at `943281b` (PR #14, merged).

**Locally verified. Not hosted-verified.** No deployment, migration, paid provider call, real cron registration, or hosted OAuth/Stripe/mail action was attempted, and nothing was pushed. `CRON_SECRET` was not set anywhere in this session.

### What this closes

Per the design doc: "nothing currently calls any of this on a schedule. No cron is registered, and a manual 'Rescan now' click is the only path that runs today." This work adds exactly one authenticated route, one Vercel Cron entry, and three independently-failure-isolated concerns run in sequence inside it — closing that one real gap without touching the claim lease, the completion receiver's internals, or the `scan_schedules` computation helpers, all of which are reused exactly as they were.

### What changed, by task

All 8 tasks are complete and merged on this branch. Full diff across the P3.1 range (`943281b..5aad416`, design doc through the final concurrency test): **22 files changed, 2,133 insertions, 28 deletions.** No migration — every table and column this work reads or writes (`scan_schedules`, `workspace_notifications`, `audit_jobs`) already existed.

| Task | Commit(s) | What it did |
|---|---|---|
| 1. Extract the shared claimable-job predicate | `5287b2d` | Pulled the claim lease's WHERE clause out of `lib/scan/execution-store.ts`'s inline UPDATE into a new, exported `CLAIMABLE_JOB_CONDITION_SQL` constant in `lib/scan/claimable.ts`, then had `claimJob` reference it. Pure, behavior-preserving extraction — done so Task 3's reclaim SELECT can share the exact same eligibility rule as the claim UPDATE rather than duplicating the raw SQL string in two places where they could quietly drift apart. |
| 2. Notification kind + href export | `7e5aa9a` | Added `"schedule.due"` to `lib/workspace/notify.ts`'s `NOTIFICATION_KINDS`, and exported `workspaceHref` from `lib/workspace/post-process.ts` so the notify-due-schedules module (Task 4) can build a link to the location's rescan action without duplicating that logic. |
| 3. Scheduler repository | `2223b40`, `84ef0a2`, `6e5572c`, `d6f8731` | New `lib/repositories/scheduler.ts`: `dueSchedules()` (queries `scan_schedules` for `cadence='monthly' AND next_run_at <= now()`) and a claimable-jobs lookup reusing Task 1's shared predicate. Code review found a real concurrency gap — two overlapping cron ticks could both select and double-notify the same due schedule — closed with `FOR UPDATE OF s SKIP LOCKED` on the query, matching the idiom `lib/repositories/action-run-reaper.ts` already uses. A doc comment on the function now states its precondition directly: the caller must run `dueSchedules` and the row's `next_run_at` advance inside one shared transaction. |
| 4. Notify due schedules | `675d4f3`, `e91972e`, `f6ae212`, `f51b6c7`, `f3b178c` | New `lib/scan/notify-due-schedules.ts`: for each due schedule, loads its workspace, and — only when `tier='paid'` **and** `notify_monthly_digest=true` — inserts a `workspace_notifications` row and attempts a best-effort email. Regardless of tier or preference, **always** advances `next_run_at` in the same transaction, so a lite-tier or digest-off workspace isn't re-evaluated as "due" on every 5-minute tick for a month. Never calls `enqueueRescan`; the owner still clicks "Rescan now" through the unchanged, unmodified consent flow. Code review found a plain try/catch does not actually isolate one schedule's failure from the others inside one shared Postgres transaction — a failed statement aborts the whole transaction server-side regardless of JS-level catching — fixed with a real `SAVEPOINT` / `RELEASE SAVEPOINT` / `ROLLBACK TO SAVEPOINT` per schedule. A second review round found the `notified` counter could overcount if a savepoint release itself failed, and that a silent rollback-of-rollback failure had no distinct log signal; both fixed. |
| 5. Cron dispatch route | `8e74297`, `df58fcd`, `e569234`, `cd35152` | New `app/api/cron/dispatch/route.ts`: authenticates via the existing `authorizeCronRequest`/`CRON_SECRET`, then runs notify (Task 4) → reclaim (fires unawaited `POST /api/scan/process` per stuck/queued job via `waitUntil`) → reconcile (`reconcileWorkspaceScans`, in-process, no HTTP hop) in sequence, each in its own try/catch. Code review found the response shape misleading — `reclaimed` counted jobs *found*, not jobs successfully dispatched or completed, and `reconciled` discarded a real per-item status breakdown down to one flat count — and that a missing `APP_ORIGIN` silently disabled reclaim with zero log signal. All three fixed: renamed to `reclaimCandidates`, `reconciled` is now a status-keyed breakdown via a new `summarizeByStatus` helper, and a log line now fires on the missing-`APP_ORIGIN` case. A missing test (isolation when `claimableJobIds` itself throws) was added. A final pass caught the design doc itself still describing the pre-refinement response shape and corrected its wording to match. |
| 6. Cron registration + cleanup | `8c3cfd5`, `05ac4e6`, `c9a7b43`, `a372e73` | Registered the cron in `vercel.json` (`{"path": "/api/cron/dispatch", "schedule": "*/5 * * * *"}`, Vercel Pro — confirmed by the user, correcting an earlier Hobby-plan assumption). Rewrote `tests/cron-registration.test.ts` to assert exactly one cron entry (at exactly this path and schedule) instead of asserting the list stays empty. This surfaced three real regressions, all fixed here: (a) `lib/funnel/scan-progress.test.ts`'s "reclaim window honesty" guard is a string-match contract test that read `lib/scan/execution-store.ts` for the claim-lease interval literal — Task 1 moved that literal to `claimable.ts`, so the guard had silently stopped checking anything real; repointed. (b) Two `tests/unhonoured-promises.test.ts` guards tripped on the new `app/api/cron` directory — one genuinely (the dispatcher does read due `scan_schedules` rows, though only to notify, never to auto-start a scan; per the user's direction the UI copy stays as-is and the detector was narrowed to test the real thing it means: whether `enqueueRescan` is ever called from outside the existing owner-triggered rescan route) and one as a false positive (an unrelated "deletes aged data" guard used "does any cron exist" as a stale proxy for "could a retention sweep exist"; the proxy was removed, not widened). (c) Four deployment/cutover documents (`docs/integration/NEON-CUTOVER.md`, `docs/integration/DEPLOY.md`, `docs/integration/NEON-RUNNER-COMPATIBILITY.md`, and `lib/workspace/rescan.ts`'s doc comment) that said "no new cron" or described a stale legacy-scheduler relationship were reconciled with narrow, additive notes — see "The rescan.ts comment" below. One flagged document, `neon-dependency-map.json`, was correctly left untouched as a dated evidence record rather than living guidance; one flagged `DEPLOY.md` mention was correctly left untouched as it describes the separate legacy app, not this repo. |
| 7. Docker-Postgres integration test | `6e48925`, `dd9fc59`, `5aad416` | New `test/integration/neon-cron-dispatch.integration.test.ts` (5 cases against real Postgres). The implementer caught two real bugs in the plan's own prescribed test code before running it — a wrong expected date and a fixture helper that would have violated a real unique constraint — both independently verified against the actual migration SQL and fixed (`dd9fc59`). Code review then found the two properties most specific to needing a *real* Postgres test were never actually exercised: concurrent-tick row locking, and SAVEPOINT rollback under genuine failure. The first was added in the final commit (`5aad416`): a real two-`PoolClient` test proving `FOR UPDATE OF s SKIP LOCKED` genuinely excludes a row another open transaction holds, verified passing against real Postgres. The second was deliberately left as a documented follow-up rather than forced — both realistic trigger paths for the SAVEPOINT code are already blocked by real constraints or by `notifyWithRepository`'s own error-swallowing, so exercising it would need artificial fault injection (e.g. killing a connection mid-transaction), materially more complex than anything else in this file. |
| 8. Full verification and phase documentation | *(this report)* | Steps 1–5 below. |

### The `lib/workspace/rescan.ts` comment — already fixed, not an open item

The implementation plan (Task 8, Step 4 instructions) flags this file's stale "no cron in this repo; the monthly cadence is a `scan_schedules` row the legacy scheduler dispatches" comment as a follow-up to check for, since Tasks 1–7 as originally scoped never touch that file. It was, in fact, already corrected — as part of Task 6's doc-reconciliation commit (`a372e73`), which touched `lib/workspace/rescan.ts` alongside the three `docs/integration/*.md` files for the same reason (all described the same now-stale "no scheduler" assumption). Read directly at HEAD, the comment on `enqueueRescan` now correctly names `app/api/cron/dispatch` and explains why it never calls `enqueueRescan` itself:

> "This is still the only path that ever calls this function: `app/api/cron/dispatch` ... reads the monthly `scan_schedules` cadence and reminds the owner it's due, but deliberately never calls `enqueueRescan` itself — the consent gate this route satisfies cannot be satisfied by a machine, so the owner still has to click the button."

There is nothing left to flag here.

### What's still NOT done, and why

The Master Plan's full P3.1 description imagines a complete durable job lifecycle — leases, per-module checkpoint/resume, retry caps, reaping, fenced dispatch — largely as if none of it existed yet. Most of it already did before this work started (the atomic 30-minute/3-attempt claim lease, and a fenced workspace-completion reconciler), which is why the approved design explicitly narrowed P3.1 to the one real gap: nothing called any of it on a schedule. Three items from that fuller wishlist remain deliberately undone, each cut in the design doc itself rather than discovered as a gap during implementation:

- **Per-module checkpoint/resume.** Today's claim-and-retry model re-runs the whole collect → score → persist pipeline on reclaim, up to 3 total attempts. The design doc "accepts rather than redesigns" this: adding partial-progress resume (e.g. skip a module that already measured successfully before the abandonment) is a change to the claim lease and scan-engine's collection loop, not to scheduling, and was explicitly named out of scope.
- **Standing consent for automated scans.** The consent gate (`lib/scan/consent.ts`) requires a request body asserting consent against the *currently published* policy version — deliberately, so a stale consent can't be silently reused, and deliberately something `enqueueRescan` never synthesizes itself. The design doc considered and rejected inventing a new standing-consent record that an unattended cron could produce on the owner's behalf, calling that "a real product/legal surface" outside this slice's remit. Instead the cron **notifies, never dispatches** — it does not call `enqueueRescan` at all, so no new consent concept was needed. This is not a narrower version of standing consent; it's the reason standing consent wasn't needed here.
- **Budgets / operating controls / dead-letter handling.** The design doc lists this under Phase 3's other, independent items (P3.5, "operating controls / dead-letter / budgets") and explicitly scopes it out alongside P3.2 (re-scan comparison reachability), P3.3 (billing/seats), and P3.4 (analytics reliability) — "each is its own independent piece of the Master Plan's Phase 3 and gets its own design when it's next." Nothing in this work adds a spend cap, a dead-letter queue, or any operating-control surface; the reclaim step's only bound is the existing batch cap (20 jobs per tick) the design doc specifies to keep one tick's own duration bounded.

### Verification (Steps 2–3)

Full detail, including the build-gate investigation, is in `PHASE-3-TEST-RESULTS.md`. Summary:

| Command | Result |
|---|---|
| `corepack pnpm typecheck` | passed — exit 0 |
| `corepack pnpm lint` | passed — exit 0, 30 warnings / 0 errors (unchanged baseline) |
| `corepack pnpm test` | passed — exit 0, **313 files / 3,213 tests**, zero failures |
| `corepack pnpm build` | **blocked on this Windows machine** — the same pre-existing, Windows-only Turbopack/`radix-ui` module-resolution blocker documented in `PHASE-1-TEST-RESULTS.md` and `PHASE-2-TEST-RESULTS.md`, confirmed unrelated to this work: no P3.1 commit touches `package.json`, the lockfile, `next.config.ts`, or the failing import chain, and `next build --webpack` compiles cleanly (zero errors, including the new `/api/cron/dispatch` route in the generated route manifest) |
| `corepack pnpm test:integration` | passed — exit 0, **27 files / 277 tests** (245.17s), including the new `neon-cron-dispatch.integration.test.ts` (5/5) |

### Hosted authorization — not done by this plan

Per the design doc's own "what done means here": *"Hosted deployment is still NOT CHOSEN, so this cannot be proven by watching a real Vercel Cron fire against a live deployment — that's a hosted-acceptance gate for later... Definition of done: local unit + integration tests green, `tests/cron-registration.test.ts` updated and green, and a documented manual step for whoever eventually runs the hosted-acceptance gate — not a live-fire demonstration now."*

Two things remain, both explicitly out of this plan's scope and requiring a human with hosted access to authorize and perform:

1. **`CRON_SECRET` must be set in the real (production/preview) environment.** `.env.example` documents it as `required in production -- authorizes app/api/cron/dispatch`, but it ships blank as a placeholder like every other secret in that file. Without a real value there, `authorizeCronRequest` has nothing to check requests against — the route stays correctly unreachable, but the cron also cannot do anything once deployed.
2. **Confirming the cron actually fires post-deploy.** Registering `{"path": "/api/cron/dispatch", "schedule": "*/5 * * * *"}` in `vercel.json` only takes effect once this branch is deployed to a Vercel project on a plan that honors it (confirmed Pro, per the design doc) — nothing in this session deployed anything or observed a live invocation. The manual step is: after deploy, watch the route's own logs (or Vercel's Cron Jobs dashboard) for an invocation within 5 minutes, and confirm its response summary (`notified`, `reclaimCandidates`, `reconciled`) reflects real due schedules and stuck jobs rather than an all-zero no-op.

Neither of these is a code gap — both are the same category of action CLAUDE.md §0.1 reserves for Willy ("Never apply a remote migration, run a live paid scan, deploy... unless Willy explicitly asks"), and neither was attempted here.

---

## P3.2 — applied evidence (owner-asserted application and the verifier seam)

**Branch** `worktree-p32-rescan-reachability` · **HEAD** `dea6785` · Base: `main` at `84bae0b` (PR #15, merged — P3.1). Node `v24.18.0`, pnpm `9.12.0` via corepack, Windows 11, Docker Server `29.7.2`.

Built from `docs/superpowers/plans/2026-09-16-applied-evidence.md` (10 tasks), against the approved design in `docs/superpowers/specs/2026-09-16-applied-evidence-design.md`.

**Implemented and locally verified. Nothing here is hosted-verified.** No deployment, no remote migration, no paid provider call, no push. Migration `0006` was applied only to disposable Docker Postgres, by `db:verify` and by the integration harness.

### What this closes, and what was already done

P3.2 reads in the Master Plan as a large repair, but the design doc's opening table records that **four of its six requirement bullets were already satisfied** at the baseline, by the `2026-09-08-two-scan-comparison` work and by Phase 2: membership resolution through `loadReport` with both scans authorized independently; re-scan reachable only under an approved entitlement policy (`isWorkspacePaid` fail-closed in `app/api/workspaces/[workspaceId]/rescan/route.ts`); time decay distinguished from regression (`DECAY_FINDING_KEYS` in `packages/scoring`); and the `Attributed` / `Observed` / `Unknown` semantics in `lib/workspace/measurements.ts`.

*Correction (2026-09-25, from the P3.2c whole-branch review):* the first of those four, "membership resolution through `loadReport`", was **not** satisfied. The loader accepted a membership resolver (`getMembership` in `lib/report/load-report.ts`), but `app/[locale]/r/[slug]/page.tsx:33` called `loadReport(slug, locale)` and never supplied one, so `loadReport` fell back to its `noMembership` default. Staff identity is stubbed off in this app (`lib/auth/staff.ts`). At runtime, therefore, no reader of `/r/[slug]` ever received member access. The loader-level claim was true; the page wiring was missing. `OWNER-WORKSPACE-GAP-OBSERVATIONS.md` finding 13 had recorded the missing page wiring, but this record did not pick it up. It is now wired: `f5fdf84` passes `reportMembershipResolver()` from `lib/auth.ts`. See [P3.2c — whole-branch review and membership wiring](#whole-branch-review-and-membership-wiring). The other three bullets are unaffected by this correction.

This slice therefore covered the one genuinely missing part: the plan's central requirement that **four events stay separate — approved/exported, owner says applied, provider verifies applied, later observed metric change**. Only the first and last existed. There was no owner-asserted application record anywhere in the baseline — no `applied_at`, `marked_applied`, or equivalent column, table or route — and `action_state='completed'` ("the owner is done with this task") was standing in for "the action entered the loop" inside the `entered` set of `lib/workspace/measurements.ts`. That proxy is now gone.

### What changed

Full diff across the P3.2 range (`84bae0b..dea6785`, design doc through the final Task 9 review fix): **37 files changed, 3,749 insertions, 71 deletions**, across 40 commits.

| Area | Files | What it does |
|---|---|---|
| Migration | `neon/migrations/0006_action_applications.sql` | New append-only `action_applications` table (five FKs, each stating an explicit `ON DELETE`; `source` CHECK `owner_asserted \| verified`; partial index on live rows) carrying its own four-statement RLS / REVOKE / GRANT / POLICY block scoped to `sme_app_runtime` — `0003_workflows.sql` holds the existing tables' grants and is immutable. Also adds the nullable `attribution_basis` column and its CHECK to `action_measurements`, deliberately **not** backfilled: no honest value exists for pre-`0006` rows, and a backfill would invent a claim about what an owner did. |
| Pure domain | `lib/workspace/applications.ts` (+ `applications.test.ts`) | `ApplicationRecord`, `strongestBasis()` implementing the precedence `verified` > `owner_asserted` > `exported`, and `recordApplication()` — the verifier seam, a function contract only. Kept separate from SQL and from HTTP so the precedence rule (the part most likely to be got wrong) is testable with no database at all. |
| Repository | `lib/repositories/applications.ts` | Scope-defensive SQL adapter in the style of `lib/repositories/measurements.ts`: assertion (writing the row and completing the action in one transaction), retraction (stamping **every** live owner assertion, not only the newest), and the duplicate-submit vs closed-action distinction. |
| Measurement rule | `lib/workspace/measurements.ts`, `lib/repositories/measurements.ts` | Attribution is now decided by basis rather than by a completed-state proxy; an assertion dated after the head scan started never yields `Attributed`; retracted rows are ignored. `attribution_basis` is carried through `insert`, and an `applications()` port was added. |
| Route | `app/api/actions/[actionId]/applied/route.ts` (+ `route.test.ts`) | POST asserts, DELETE retracts. Membership and location scope are checked before any data read (viewers and out-of-scope managers get 403); an unapproved or foreign version is refused with 409 `version_not_applicable`; a double POST yields one row, not two; retraction reopens the action to `in_progress` and clears `completed_at`. |
| Display phase | `lib/workspace/overview.ts`, `lib/copy-workspace.ts` | A new `applied` display phase, placed **above** `exported` so an owner's assertion is not shadowed by a delivery state that stays `exported` for that version forever, and still deferring to the scan's own verdict through the `measurementState !== "measured"` guard. |
| Display surfaces | `components/workspace/action-detail-client.tsx`, `components/workspace/home-brief.tsx`, `lib/workspace/format.ts`, `lib/workspace/queries-pages.ts`, `lib/repositories/workspace-read.ts` | The checklist-done control is replaced by the applied-assertion control. The basis renders beside the fact type on the home proof card and on the action-detail "Before and after" card, with a `null` basis rendering "basis not recorded" and never a guess. `attribution_basis` had to be SELECTed and threaded, or the basis could never render as anything but unknown. `insights-view.tsx` was deliberately *not* touched: its `metricCards()` is a pure snapshot-to-snapshot comparison that never reads `action_measurements`. |
| Drizzle / schema fixtures | `lib/db/schema/business.ts`, `test/integration/fixtures/legacy-final-catalog.json`, `test/integration/neon-schema.integration.test.ts` | The `action_applications` Drizzle definition and the catalog baseline the schema test deep-equals — two locations Task 1 initially missed and a later commit (`32d3027`) corrected. |
| i18n | `lib/messages/{en,zh-HK,zh-TW}.json`, `tests/i18n.test.ts` | Trilingual `applied` and `basis` copy. zh-TW carries its own override rather than inheriting zh-HK: the register split (你/您, 核實/查證) would otherwise silently give Taiwan the Hong Kong verb. A review round caught and corrected an inversion of exactly that pair (`2f573e0`, `dea6785`). |
| Integration | `test/integration/neon-action-applications.integration.test.ts` | 8 cases against real Postgres, including proof that an ordinary assertion does not trip `fence_workspace_completion_write`, and that `0006`'s `sme_app_runtime` grant actually took. |

### Verification

Full detail is in `PHASE-3-TEST-RESULTS.md`. Summary:

| Command | Result |
|---|---|
| `corepack pnpm typecheck` | passed — exit 0 |
| `corepack pnpm lint` | passed — exit 0, 30 warnings / 0 errors (unchanged baseline; no new warning from this work) |
| `corepack pnpm test` | passed — exit 0, **316 files / 3,264 tests**, zero failures (P3.1 baseline 313 / 3,213 → +3 files, +51 tests) |
| `corepack pnpm build` | **blocked on this Windows machine** — the standing Turbopack/`radix-ui` module-resolution blocker documented in `PHASE-1-TEST-RESULTS.md`, `PHASE-2-TEST-RESULTS.md` and P3.1 above. Not worked around. Separately, `npx next build --webpack` compiles clean (exit 0) with the new `/api/actions/[actionId]/applied` route in the manifest |
| `corepack pnpm test:integration` | passed — exit 0, **28 files / 285 tests** (136.33s), including the new `neon-action-applications.integration.test.ts` (8/8) |
| `corepack pnpm db:verify` | passed — exit 0; `0006_action_applications.sql` applied as part of the corpus (35 tables, 416 columns, 159 constraints, 86 indexes) |

### What this slice does NOT prove

Restated from the design doc's "What this design cannot prove", plus the two items scoped out there:

1. **No verifier exists.** `source='verified'` is exercised as an insert-path unit test and through `strongestBasis()` precedence tests, and nothing end-to-end. `recordApplication()` is a function contract, not a working feature. Nothing writes `source='verified'`; no verifier is registered, scheduled, or reachable over HTTP. Building one means a per-template check (refetch the website to confirm FAQ JSON-LD landed; confirm a specific review now carries an owner reply) and, for the GBP and Instagram templates, provider quota — its own piece of work with its own design.
2. **The plan's browser acceptance artifact is not produced.** A real comparable pair proven in a browser, plus negative authorization examples, needs hosted access and explicit authorization from the repo owner. It remains a documented manual step — the same category as P3.1's unset `CRON_SECRET`, and the same category of action CLAUDE.md §0.1 reserves for Willy.
3. **The `ScanComparison` state-splitting remains an open P3.2 gap.** `no_accessible_pair` still fires for three distinct situations the Master Plan names separately: no earlier scan exists; an earlier scan exists but authorization denied it; an authorized earlier scan shares no comparable cohort. The design doc scoped this out as a deliberate, contained follow-up. It was not started here. *(Closed by P3.2c, `5238a7b`–`ede55de`: see [P3.2c — honest comparison states](#p32c--honest-comparison-states) below. The three situations now report `no_earlier_scan`, `no_accessible_pair`, and `not_comparable` or `insufficient_evidence` respectively. A viewer gets `no_history_access` before any history is looked up. The browser artifact in item 2 is still not produced. Added 2026-09-25: the member-only states became reachable in production only with `f5fdf84`, which wired membership into `/r/[slug]`; see the correction above.)*

### Observations worth recording

- **A dated fallback remains in `lib/workspace/measurements.ts`.** `action_state === 'completed'` still counts an action toward the `entered` set, but **only** to cover actions completed before `0006`, which have no application row and would otherwise silently lose their `measured` label. The code carries, in a comment, the SQL to run to decide when it can be retired (when the count of completed actions with no live application row reaches zero). This is a deliberate, documented, dated compromise, not an oversight.
- **A pre-existing oddity this work deliberately did not change.** In `displayPhaseKey`, the `exported` branch sits above `measured`, so an exported action that is later measured still displays "Exported". That ordering predates this slice. The new `applied` phase was inserted above `exported` (and guarded by `measurementState !== "measured"`) without disturbing it, because reordering the existing branches is a separate product decision.
- **`closeResolvedActions` remains a legitimate second writer of `action_state='completed'`.** It is not the proxy that was removed: it sets `measurement_state='measured'` itself, and only from a comparable diff's `resolved_findings`. It is called out in a comment beside the dated fallback so the two are not confused.

---

## P3.2b — website verifier (the first caller of `source='verified'`)

**Branch** `website-verifier` · **HEAD** `45c2746` · Base: the P3.2 slice at `5a52c5e` (same worktree, same branch lineage). Node `v24.18.0`, pnpm `9.12.0` via corepack, Windows 11, Docker Server `29.7.2`.

Built from `docs/superpowers/plans/2026-09-16-website-verifier.md` (8 tasks), against the approved design in `docs/superpowers/specs/2026-09-16-website-verifier-design.md`.

**Implemented and locally verified. Nothing here is hosted-verified.** No deployment, no remote migration, no paid provider call, no push, and no live customer website fetched — every fetch in the suite is injected. Migration `0007` was applied only to disposable Docker Postgres, by `db:verify` and by the integration harness.

### What this closes

The P3.2 section above records, as its first "what this slice does NOT prove" item: *"No verifier exists. `source='verified'` is exercised as an insert-path unit test and through `strongestBasis()` precedence tests, and nothing end-to-end. `recordApplication()` is a function contract, not a working feature. Nothing writes `source='verified'`; no verifier is registered, scheduled, or reachable over HTTP."*

That is the gap this slice closes, and only for website-backed templates. `source='verified'` now has a real caller: a bounded sweep inside the existing `/api/cron/dispatch` tick refetches the owner's website for engaged website actions and, when every check that was *failing* at the action's source snapshot now passes, writes a `verified` application row. The four-event separation P3.2 built (approved/exported · owner says applied · provider verifies applied · later observed metric change) now has its third event produced by something other than a test fixture.

### What changed

Full diff across the verifier range (`5a52c5e..45c2746`, design doc through the final fixture-pinning test commit): **36 files changed, 2,901 insertions, 33 deletions**, across 30 commits.

| Area | Files | What it does |
|---|---|---|
| Migration | `neon/migrations/0007_action_verification.sql` | Adds the nullable `actions.verification_checked_at` timestamp and `actions_verification_sweep_idx` on `(template_key, verification_checked_at)` — the pair both selection queries filter by on every tick. Nullable and deliberately **not** backfilled: null means "never attempted", which is true of every pre-`0007` row. The migration's own comment names the boundary smudge it accepts — scheduling state on a domain table — and states the signal for moving it out if more sweep state accumulates. `0001`–`0006` were not edited. |
| Template declaration | `lib/workspace/templates.ts` (+ `templates.test.ts`) | New optional `verifyChecks?: readonly WebsiteCheckKey[]` on `ActionTemplate`. Two templates declare it: `visibility-content` → `["faq_schema"]`, `website-basics` → `["title", "meta_description_50_160", "single_h1"]`. Absent means "not verifiable", a permanent and correct answer rather than a gap. Declared on the template row so one record says both what creates an action and what would prove it done. `website-basics` includes `title` deliberately even though no scanner finding inspects `<title>` — the rule verifies against the recorded `website_checks` state, not against which finding fired — and the reasoning is carried inline so it is not mistaken for a sloppy mirror of `triggerFindingKeys`. |
| Pure decision rule | `lib/verify/decide.ts` (+ `decide.test.ts`) | `decideVerification(verifyChecks, { prior, fresh })` → `verified \| not_yet \| not_verifiable`. Judges **only** the checks that were failing at the action's source snapshot, so a template's un-broken checks neither withhold a verification nor manufacture one from work nobody did. A key the prior snapshot never evaluated yields `not_verifiable`, never `not_yet`. Lookups are per key, never a check on `fresh.evaluated`, so a partial fetch cannot verify a check it never looked at. `prior` and `fresh` are named arguments because they share a type and a positional swap would invert every decision while still compiling. Kept pure — no database, no network — because this rule decides what the product is permitted to claim it confirmed. Its known limitation (a `not_verifiable` answer is permanent for the action but is not remembered, so the action is re-derived each cycle) is documented at the function rather than left to be rediscovered. |
| Repository | `lib/repositories/verification.ts` | `dueLocations` (one row per location with a usable website URL and at least one engaged, unverified, un-recently-checked website action, ordered never-checked first), `actionsForLocations`, and `markChecked`. Eligibility is owner engagement — a live `owner_asserted` application **or** an exported approved version; a retracted assertion does not count. An action with a live `verified` row is excluded permanently; a retracted `verified` row does not exclude it. `verification_checked_at` is stamped on every attempt, so a broken site is retried daily rather than every tick. |
| Sweep | `lib/verify/website-sweep.ts` (+ `website-sweep.test.ts`) | `runWebsiteVerification`: one fetch per location per tick whatever the action count, capped at 5 locations per tick, each action isolated so one failure does not sink the concern. An unreachable site yields `not_yet` and writes no row. Malformed `scan_snapshots.website_checks` jsonb is coerced to `null` (→ `not_verifiable`) rather than throwing and taking the whole concern down with it. |
| Cron wiring | `app/api/cron/dispatch/route.ts` (+ `route.test.ts`) | A fourth, independently try/caught concern after notify → reclaim → reconcile, reporting a `verified` breakdown (`locationsChecked`, `actionsConsidered`, `actionsVerified`, `actionsFailed`). Each verified row goes through the existing `recordApplication` seam and emits an `action.verified` audit event. |
| Display | `lib/workspace/overview.ts`, `lib/copy-workspace.ts`, `lib/workspace/queries-pages.ts`, `components/workspace/action-detail-client.tsx`, `lib/workspace/audit-labels.ts`, `lib/workspace/audit.ts` | New `verified` / `verifiedOn` overview fields and a `verified` display phase ranked **above** `applied` and `exported`, still deferring to `measured`. `verified` rows never populate `applied` / `appliedOn`, and vice versa. The `ActionOverviewContext` doc comment now records explicitly that two existing consumers (`lib/assistant/live.ts`, `lib/workspace/runs.ts`) build overviews without these fields — a silent `false` that reads as a safe understatement for `applied` but as an overstated absence for `verified`. |
| i18n | `lib/messages/{en,zh-HK,zh-TW}.json`, `tests/i18n.test.ts` | Trilingual `verified.confirmedOn`. The copy reads "Verified on your site on {date} · we checked the page, not who changed it" — the caveat is in the string the owner sees, not only in this document. zh-TW carries its own 查證 register rather than inheriting zh-HK's 核實. |
| Schema fixtures | `lib/db/schema/business.ts`, `test/integration/fixtures/legacy-final-catalog.json`, `test/integration/neon-schema.integration.test.ts` | The Drizzle column plus the catalog baseline the schema test deep-equals. |
| Integration | `test/integration/neon-website-verification.integration.test.ts` | 15 cases against real Postgres: eligibility and its two negative filters, permanent exclusion, retraction on both row kinds, the 24-hour throttle, `markChecked` scoping and exact value, `dueLocations` ordering with a pinned-id tiebreaker, `verified` evidence round-trip, and both branches of the attribution timing gate. |

### Verification

Full detail is in `PHASE-3-TEST-RESULTS.md`. Summary:

| Command | Result |
|---|---|
| `corepack pnpm typecheck` | passed — exit 0 |
| `corepack pnpm lint` | passed — exit 0, 30 warnings / 0 errors (unchanged standing baseline; no new warning from this work) |
| `corepack pnpm test` | passed — exit 0, **318 files / 3,298 tests**, zero failures (P3.2 baseline 316 / 3,264 → +2 files, +34 tests) |
| `corepack pnpm build` | **blocked on this Windows machine** — the standing Turbopack/`radix-ui` module-resolution cascade documented in `PHASE-1-TEST-RESULTS.md`, `PHASE-2-TEST-RESULTS.md`, P3.1 and P3.2 above. Not worked around; no flag was substituted into the gate. Separately, `npx next build --webpack` compiles clean (exit 0, 29/29 static pages) |
| `corepack pnpm test:integration` | passed — exit 0, **29 files / 300 tests** (104.44s), including the new `neon-website-verification.integration.test.ts` (15/15). P3.2 baseline 28 files / 285 tests → +1 file, +15 tests |
| `corepack pnpm db:verify` | passed — exit 0; `0007_action_verification.sql` applied as part of the corpus (35 tables, 417 columns, 159 constraints, 87 indexes) |

### What this slice does NOT prove

1. **A passing check does not prove the owner applied our draft.** It proves the check that was failing now passes. Their developer may have fixed it independently; a CMS template update may have added the markup; the site may have been rebuilt for unrelated reasons. No HTTP fetch distinguishes those causes, and this one does not try. The copy says "verified on site" deliberately, never "verified you applied our draft" — and the rendered line carries that caveat to the owner directly ("we checked the page, not who changed it").
2. **Two templates are verifiable, not thirteen.** Only `visibility-content` and `website-basics` declare `verifyChecks`; every other template returns `not_verifiable`, permanently and correctly. Verifiers for the GBP and Instagram templates need provider quota and a separate authorization (DEC-04), and are not started here.
3. **Nothing is hosted verified.** The sweep runs inside the cron tick that still needs `CRON_SECRET` set in a real environment and a deploy — the same outstanding step P3.1 recorded and that nothing since has closed. No live invocation was observed, because nothing was deployed.
4. **The integration test does not exercise the sweep's own wiring.** `test/integration/neon-website-verification.integration.test.ts` covers the repository's selection queries, `markChecked`, and the measurement/attribution path against real Postgres. It does **not** invoke `runWebsiteVerification` or `decideVerification` at the integration level — the sweep's orchestration and the decision rule are covered by unit tests only, with an injected `fetch` and an injected `record`.

### Observation recorded, deliberately not acted on

In `packages/scoring/src/modules/aeo.ts`, the findings `aeo.website_meta_weak` (line 131) and `aeo.website_content_weak` (line 370) fire on **byte-identical conditions** — both `payload.website?.available && (meta_description_len ?? 0) < 50` — so one is redundant. The claim was checked against the source at HEAD rather than taken on the plan's word, and it holds: the two guards differ only in optional-chaining style, and only `aeo.website_h1_weak` (line 148, on `h1_count !== 1`) is an independent condition. `packages/scoring` is vendored verbatim from upstream and CLAUDE.md §7 forbids changing its semantics here, so this is reported rather than fixed. It matters to this slice only in that the `website-basics` template appears to have three independent scanner triggers when it effectively has two.

---

## P3.4 — reliable events and the value metric

**Branch** `p34-reliable-events` · **HEAD** `d734dd7` · Base: `main` at `ed23418` (PR #18, merged). Node `v24.18.0`, pnpm `9.12.0` via corepack, Windows 11, Docker Server `29.7.2`.

Built from `docs/superpowers/plans/2026-09-24-reliable-events-value-metric.md` (Tasks 0–10), against the design in `docs/superpowers/specs/2026-09-24-reliable-events-value-metric-design.md`. The design carries two dated amendments, both from 2026-09-24, which describe the code as built. They are summarised under "The design as built" below.

**Implemented and locally verified. Nothing here is hosted-verified.** No deployment, no remote migration, no paid provider call, no push. Migration `0008` was applied only to disposable Docker Postgres, by `db:verify` and by the integration harness. `report:value` has never been run against a real database.

### What this closes

F-34 recorded `event_record_failed { category: "backend_unavailable" }` nine times across `/api/scan/start` and `/api/scan/process`. The design's trace of `main` found the defect still live and worse than recorded:

- the engine's 250 ms budget still applied, around a cold connect plus four round trips;
- a timeout destroyed the connection that had just warmed;
- `scan_started` was a bare `void` promise that Vercel may freeze after the response;
- deduplication had never fired, because `dedupe_key` was always NULL and the unique index treats NULLs as distinct.

Separately, nothing computed the number the product says it is judged by: weekly businesses completing a useful approved delivery.

This slice does two things. It writes both scan events inside the transaction that records the fact they describe. And it adds `report:value`, a read-only CLI that computes the value metric and the funnel from authoritative business tables. It reads `scan_events` only to print a reconciliation against `audit_jobs`.

### What changed, by task

Full diff `ed23418..d734dd7`: **43 files changed, 4,548 insertions, 210 deletions**, across 19 commits. No file under `packages/` changed (`git diff origin/main -- packages/scan-engine` is empty, 0 bytes).

| Task | Commit(s) | What it did |
|---|---|---|
| Design and plan | `7df6f9b`, `be6de30` | The design, then a plan written against the code. Reading the code changed the design in three places before anything was built: `persist()` also receives `failed`; rescans create jobs through `jobsRepository.insert` directly; and adding a required parameter would break existing call assertions, which the plan rewrites deliberately. |
| 0. Correct the spec | `7626d56` | Two spec claims corrected before building: `persist()` carries `failed` as well as done/partial, and `scan_started` must be written for rescans too. |
| 1. Migration `0008` | `25e07b5` | `neon/migrations/0008_workspace_internal.sql` adds `workspaces.is_internal boolean NOT NULL DEFAULT false`. It is kept separate from `is_demo`, so a staff workspace is never marked demo and shown on the demo page. Also updated: the Drizzle column in `lib/db/schema/business.ts`, `test/integration/fixtures/legacy-final-catalog.json`, and the `neon-schema` baselines. |
| 2. One writer for `scan_events` | `5db5098` | New `lib/analytics/scan-events.ts`. It validates events with the engine's `parseScanEvent` before any transaction opens. It writes on the caller's own client, so the event joins the caller's transaction. It uses fixed dedupe keys `started` / `terminal`. |
| 3. `scan_started` in the job's transaction | `9abc666`, `d404f04`, `ed8c29d` | `jobsRepository.insert` (`lib/repositories/jobs.ts`) writes `scan_started` beside the job and its consent row. `insertScanJob` (`lib/scan/start-job.ts`) validates the event first and returns it. `app/api/scan/start/route.ts` resolves the session before the insert. It forwards to PostHog through `after()`, calling `forwardEventToPostHog` directly. A synchronous `after()` throw can no longer turn a committed job into a 500 that the client would retry into a duplicate job. |
| 4. `scan_started` for rescans | `aa9e961` | `lib/workspace/rescan.ts` builds the event from the source job's snapshot market and locale. `app/api/workspaces/[workspaceId]/rescan/route.ts` passes a session through. Without this, every rescan would have been a permanent reconciliation gap. |
| 5. `scan_completed` in the terminal write | `f6def6e`, `f806a27`, `ea2c009` | `persist()` and `fail()` in `lib/scan/execution-store.ts` write `scan_completed` with the terminal status. `recordTerminal` only forwards to PostHog. `f806a27` and `ea2c009` are the owner-approved "scan always completes" change, the lock timeout and the `COMMIT`-tag guard. All three are described below. |
| 6. Shared target check | `26566a8`, `4e82805` | Moved the database-target check out of `scripts/neon/readiness.ts` into `scripts/neon/target.ts`, so `report:value` uses the same copy. `4e82805` then tightened `canonicalHost` (see below). |
| 7. Reporting weeks | `72d773d` | `scripts/report/week.ts`: ISO weeks as half-open `[Monday 00:00, next Monday 00:00)` in `Asia/Hong_Kong`, with the last complete week as the default. |
| 8. Report queries | `173e287`, `5e81fdf` | `scripts/report/value-queries.ts` computes the primary metric, the account metric, the funnel, the exclusions, the limitations and the reconciliation. The integration test seeds cross-tenant deliveries, because the single-column FKs let a delivery point at another tenant's version. The query tenant-matches every join hop. `5e81fdf` keeps a duplicate `scan_started` in the seed, so replacing `count(DISTINCT e.job_id)` with `count(*)` now fails a test. |
| 9. CLI | `d734dd7` | `scripts/report/value.ts`, `scripts/report/format.ts`, and `"report:value"` in `package.json`. The CLI refuses without `VALUE_REPORT_HOST` / `VALUE_REPORT_DATABASE`, checks `DATABASE_URL` before connecting, runs in `BEGIN TRANSACTION READ ONLY`, checks `current_database()` after connecting, and always rolls back and ends the pool. A URL that fails to parse is refused with no `cause`, because Node attaches the input, which is the connection string. It fixes the plan's formatter: `padEnd` never truncates, so the 27-character "Deliveries with no location" label ran into its value. Columns now have an explicit two-space gap. |
| 10. Verification and this record | *(this commit)* | Gates, baseline measurement, mutation checks and the checklist below. |

### The design as built

The code differs from the design's first version in six places. The owner approved each one during the build. They are recorded here so that nobody checks the code against the superseded text.

1. **"The scan always completes"** (owner decision, 2026-09-24; spec amendment "Amended 2026-09-24", `f806a27`). The first version said an event-insert failure should fail the transaction. A review found that this stranded scans: `persist()` rolled back the scored findings, the engine's `fail()` fallback carried the same insert and failed too, and the job stayed in `persisting`. This repo has no reaper, and a reclaim re-runs paid collection. Every event write now goes through `writeScanEventSafely` in `lib/analytics/scan-events.ts`. It runs inside a `SAVEPOINT`. On failure it rolls back to the savepoint and logs `event_record_failed` with the job id and SQLSTATE, and the business write commits. So **a failed event write keeps the job and loses the event. The loss is logged, and the reconciliation gap counts it.** `fail()` became a transaction (guarded `UPDATE`, then the event only when a row matched) in place of the single-statement CTE the design first described.
2. **`withTransaction` refuses a silent rollback** (`ea2c009`, `lib/db/transaction.ts`). PostgreSQL answers `COMMIT` on an aborted transaction with the tag `ROLLBACK` and no error, and node-pg resolves it as success. `withTransaction` now throws `transaction_rolled_back` in that case. Without this guard, any caught statement error inside any transaction would silently discard the whole transaction.
3. **`lock_timeout` bounds the event insert** (spec amendment "Amended again 2026-09-24 (code-quality review)", `ea2c009`). A savepoint protects the scan from an insert that errors, not from one that waits. Nothing set `lock_timeout` or `statement_timeout`. DDL or maintenance on `scan_events` queued behind a long reader could therefore hold the scan transaction, and its `audit_jobs` row lock, until Vercel's 300 s kill. `writeScanEventSafely` now runs `SET LOCAL lock_timeout = '500ms'` inside the savepoint. Proven by the integration test "persist does not wait on a blocked scan_events insert" (556 ms in the Task 10 run).
4. **The F-34 reasoning correction** (same second amendment). The first amendment claimed the in-transaction write had "no timeout, so F-34 stays fixed". The second amendment records that this reasoning was wrong and left the gap above. It also explains why the new timeout does not bring F-34 back. F-34 was a budget around opening a fresh connection, outside the transaction that records the fact. The lock timeout runs on the connection the scan already holds, bounds only lock waiting, and is safe only because of the savepoint.
5. **`failQueued` is a third terminal writer** (`f806a27`, `lib/repositories/jobs.ts`). A consent-refused scan is failed by the consent gate (`lib/scan/consent-gate.ts`), not by the store. It now writes `scan_completed(failed)` the same savepointed way, so consent refusals are not a permanent reconciliation gap. The process route resolves the analytics session before the gate and passes it through as a required argument.
6. **`canonicalHost` is stricter and case-insensitive** (`4e82805`, `scripts/neon/target.ts`, shared with `neon:readiness`). It used to strip the first `-pooler` followed by a dot anywhere in the host, so `ep-a.region-pooler.x` compared equal to `ep-a.region.x`. It now strips `-pooler` only at the end of the first label. It also lowercases both sides, because WHATWG URL keeps host case for `postgres:` URLs and DNS ignores case. Covered by `tests/neon-target.test.ts`.

### Verification

Full detail, including the baseline measurement and every mutation, is in `PHASE-3-TEST-RESULTS.md`. Summary:

| Command | Result |
|---|---|
| `corepack pnpm typecheck` | passed: exit 0 |
| `corepack pnpm lint` | passed: exit 0, 30 warnings / 0 errors, the same files and messages as `origin/main` |
| `corepack pnpm test` | passed: exit 0, **323 files / 3,413 tests**, zero failures. `origin/main` measured at 319 / 3,311, so **+4 files, +102 tests**, all in the app suite |
| `corepack pnpm build` | **blocked on this Windows machine**: exit 1, `Turbopack build failed with 32 errors`, the standing `radix-ui` cascade. Not worked around. Separately, `npx next build --webpack` compiles clean (exit 0, 29/29 static pages) |
| `corepack pnpm test:integration` | passed: exit 0, **30 files / 324 tests** (130.04s). `origin/main` measured at 29 / 301, so **+1 file, +23 tests** |
| `corepack pnpm db:verify` | passed: exit 0, `0008_workspace_internal.sql` applied as part of the corpus (35 tables, **418 columns**, 159 constraints, 87 indexes: +1 column, as predicted) |

**Mutation checks.** Task 10 ran 23 mutations, one at a time. Each was restored before the next. 22 were killed by a named test and 1 survived: V9, the scans line's `is_demo` exclusion (see the checklist). V9 was closed after Task 10 in `65b6546` and is now killed. The per-mutation table is in `PHASE-3-TEST-RESULTS.md`. It covers:

- the dedupe key, the PostHog trap and the `fail()` guard (Task 5's three);
- the savepoint, the lock timeout, the `COMMIT`-tag guard and `after()`;
- the five exclusions the plan names for Task 8, plus the two tenant-match hops and the scans line;
- the CLI's read-only transaction, target check, database check, no-cause rule and column gap;
- the `canonicalHost` fix.

### Verification checklist

Walked item by item against the code at `d734dd7`.

| Item | Status | Evidence |
|---|---|---|
| `scan_started` exists exactly when its job does: rollback leaves neither; a failed event write leaves no job | **Partly superseded; not ticked.** | *Holds:* a committed job has exactly one event ("writes exactly one scan_started inside the job's own transaction", `neon-scan-start`), and an event cannot outlive a job transaction that fails ("writes no scan_started when the job transaction fails before reaching it"). That test fails at the consent insert, before the event is reached, so it proves the event is not written outside and ahead of the transaction. "Written, then rolled back" holds by construction, because the event is the transaction's last statement (`d404f04`). *Superseded* by the owner's "scan always completes" decision: a failed event write now **leaves** the job and loses the event ("still creates the job when its scan_started cannot be written"). The loss is logged and counted by the reconciliation. A job can therefore exist without its event, which is intended. |
| `scan_started` is written for rescans as well as the public funnel | **Holds** | `neon-rescan` "enqueues actual TW jobs and server-attributed audit, then monthly schedule once" asserts exactly one `{scan_started, {market:'TW', locale:'zh-TW'}, 'started'}` row for the rescan job, alongside the public-funnel test above. |
| `scan_completed` is written by `persist()` for all three outcomes, and by `fail()` only when its guard matched | **Holds, extended** | `neon-execution` `it.each(done, partial, failed)` "persist writes exactly one scan_completed for %s inside its transaction". "fail() writes one failed scan_completed only when its status guard matched" is mutation E3, killed. The third writer, `failQueued`, is covered by "failQueued fails a queued job with exactly one scan_completed, and leaves a non-queued one untouched" (`neon-scan-start`). |
| A retried `persist()` produces one row (dedupe key conflicts) | **Holds, with its stated scope** | `neon-execution` "a retried persist leaves one scan_completed, because the dedupe key now conflicts". Mutation E1 (key → NULL) makes it fail with `expected [ …, … ] to have a length of 1 but got 2`. Its scope, as its own comment says: the retry uses the same store, so the same session. Production does not run this sequence, because a committed terminal status ends claimability, and a different process carries a different session, which the key does not deduplicate. The test guards the key against a NULL regression. It does not prove that a cross-process retry leaves one row. |
| `recordTerminal` reaches PostHog and never inserts | **Holds** | `neon-execution` "recordTerminal still reaches PostHog and never writes a second row" asserts `insert` is never called and `capture` once. It is mutation E2, killed. Unit: `lib/scan/execution-store.test.ts` "tracks the PostHog tail on a failed scan and never inserts from recordTerminal". The store's default `analytics.insert` now throws. |
| `scan/start` forwards to PostHog through `after()`, not a bare promise | **Holds** | `app/api/scan/start/route.test.ts` "hands PostHog forwarding to after() instead of a bare promise" is mutation U2, killed. Also covered: "still returns the committed job when after() itself throws", "returns the committed job when PostHog forwarding never settles", "forwards nothing when the job could not be created". |
| `packages/scan-engine` is unchanged | **Holds** | `git diff origin/main -- packages/scan-engine` is empty (0 bytes). No file under `packages/` changed. Package test counts are identical to `origin/main`. |
| The primary metric counts distinct locations with a `counted` delivery; demo and internal excluded; workspaces separate; NULL-location deliveries on their own line | **Holds** | `neon-value-report` "counts distinct locations with a counted delivery, excluding demo and internal" expects `{locations: 2, eligibleLocations: 3, workspaces: 2, eligibleWorkspaces: 2, deliveriesWithoutLocation: 1}`. Also "states how many workspaces were excluded", and the cross-tenant case (V6/V7 killed). |
| Every exclusion was mutation-checked and each mutation failed a named test | **Holds after `65b6546`** (not true at `d734dd7`) | The five mutations the plan names for Task 8 were re-run in Task 10 and all were killed (V1–V5). So were V6–V8. At `d734dd7`, **V9 survived.** Removing `is_demo` from the scans line (`AND NOT coalesce(w.is_demo OR w.is_internal, false)` in `scripts/report/value-queries.ts`) failed no test, because the seed attached no scan to the demo workspace. `65b6546` seeds one. The scan expectations are unchanged, because that scan is excluded. Reconciliation, which covers every job, re-derives to `{jobsStarted: 6, startedEvents: 3, jobsTerminal: 5, completedEvents: 1}`. Re-running V9 now fails "reads scans from audit_jobs, excluding scans claimed by an internal or demo workspace" (1/10), and the file passes 10/10 unmutated. |
| The report runs `READ ONLY`, refuses an unconfirmed or mismatched target, and never prints a connection string | **Holds for what is tested; one qualification** | Read-only: `neon-value-report` "runs under a read-only transaction that Postgres enforces" (`25006`), and `tests/value-report-cli.test.ts` "opens a read-only transaction…" (C1 killed). Refusal: "refuses to run without an explicit target", "refuses a DATABASE_URL pointing somewhere other than the named target" (C3 killed), "stops at a different database before any report query" (C2 killed), and the Task 10 run of `corepack pnpm report:value` with nothing set (`report:value failed: configuration`, exit 1). Connection string: every error message is a fixed category. The one path where Node would attach the URL is refused without a cause (C4 killed). *Qualification:* for `query_failed`, the CLI deliberately prints the underlying `pg` error as `cause` to the operator's terminal. That output is not tested for absence of the host name. The password is not in `pg`'s error messages, but no test proves that. |
| `neon:readiness` behaviour is unchanged after the target-check extraction | **Not literally true: unchanged except for one deliberate fix** | `26566a8` is a pure extraction. `tests/neon-readiness.test.ts` is not modified by any P3.4 commit and passes in gate 3. `4e82805` then deliberately changed the shared `canonicalHost`, which readiness uses: `-pooler` is stripped only at the end of the first label, and both sides are lowercased. Readiness therefore now refuses `ep-a.region-pooler.x` against `ep-a.region.x`, which it used to accept, and accepts a mixed-case host it used to refuse. Covered by `tests/neon-target.test.ts` (T1, restoring the old function, is killed). |
| Paid conversion prints as not measurable, never `0` | **Holds** | `neon-value-report` "never reports paid conversion as a number" (`{measurable: false, reason: "billing unavailable (DEC-09)"}`). `tests/value-report-cli.test.ts` "says paid conversion is not measurable instead of printing zero". |

### Runbook

1. Apply `neon/migrations/0008_workspace_internal.sql` to the target database (DEC-11, an owner action). Until then `report:value` fails with *column does not exist*.
2. Mark staff and test workspaces: `UPDATE workspaces SET is_internal = true WHERE slug = 'nadagogo';`
3. Deploy the code.
4. Run `DATABASE_URL=<runtime-role pooled URL> VALUE_REPORT_HOST=<host> VALUE_REPORT_DATABASE=<db> corepack pnpm report:value`. Add `-- --week YYYY-Www` to report a specific week.
   - `DATABASE_URL` is required. Use the application runtime role's URL, the same one the deployed app uses, **never** the owner role's. Nothing enforces this: `BEGIN TRANSACTION READ ONLY` prevents writes whichever role connects, but the spec (§4) calls for the runtime role.
   - `VALUE_REPORT_HOST` may be given with or without `-pooler`.
   - The reconciliation gaps for weeks **after** the deploy should approach zero. Earlier weeks keep showing the historical loss.

### What this slice does NOT prove

1. **Production reliability.** That needs `0008` applied, a deploy, and a near-zero reconciliation gap observed on real traffic. Until then this work is locally verified, not hosted verified.
2. **Past losses stay lost.** Historical `scan_events` remain undercounted. The primary metric is unaffected, because it never reads `scan_events`.
3. **PostHog delivery remains best-effort.**
4. **Sign-in and claim *started* remain unmeasured.** Scan totals include staff test scans, because a public-funnel scan cannot be classified internal until it is claimed. Paid conversion is not measurable.
5. **Phase 3's hosted acceptance gate** is still blocked by the unresolved production `home lookup failed` 500.

### After Task 10: the whole-branch review and its fixes

The sections above describe the Task 10 candidate `d734dd7`. After Task 10, `65b6546` / `94c2e26` closed V9 (see the checklist). A final review of the whole diff against `origin/main` then found nothing Critical, one Important finding and four Minor ones.

| Finding | Resolution |
|---|---|
| **I1.** `lib/analytics/record-event.ts` still exported `recordEvent`, with a default `insert` through `lib/repositories/events.ts`. That was the F-34 path: a 250 ms budget around a fresh connection, and a NULL `dedupe_key`. Nothing live called it, but it was the obvious import for the next event. | **Fixed in `f4c4613`.** `recordEvent`, `lib/repositories/events.ts` and their tests are removed. `defaultDependencies().insert` now throws, mirroring the execution store's stub, and `forwardEventToPostHog` never calls it. Three integration tests that only exercised the removed path are removed. Their live equivalents already exist in `neon-execution`. `tests/scan-events-single-writer.test.ts` fails if any non-test source under `lib/`, `app/` or `scripts/` other than `lib/analytics/scan-events.ts` contains `INSERT INTO scan_events`. Mutation-checked: a planted insert string fails it and names the file. `lib/scan/run.test.ts` now asserts that exactly one `scan_events` insert runs and that `backend_unavailable` is never reported. Pointing `recordTerminal` back at the engine's `recordEvent` fails it. |
| **M1.** The value report's `repeat_export` EXISTS did not match `a2.workspace_id`. No location-keyed count checked that the location belongs to the action's workspace. `actions.location_id` is a single-column FK, so nothing enforces that. | **Fixed in `5b8cc9d`.** The EXISTS now matches the workspace. A new `LOCATION_MATCHED` condition applies to `primary`, `first_draft`, `first_export` and `repeat_export`. A row whose action points at another tenant's location is excluded from every count, as a mismatched version or action already was. Location-less deliveries are unaffected. Two new rolled-back cross-tenant tests each fail when their own half of the fix is reverted. |
| **M2.** Consent-refused scans get `scan_completed` in the database but are not forwarded to PostHog. | **Recorded, not changed** (`c20f9b0`). See the residuals below. |
| **M3.** The runbook's command omitted `DATABASE_URL` and the runtime-role requirement. | **Fixed in `c20f9b0`.** |
| **M4.** These headers describe `d734dd7`. | **This section.** |

**Branch as offered:** `p34-reliable-events` at `5b8cc9d` plus this documentation commit. That is 25 commits on `ed23418`. At `5b8cc9d` the diff against `origin/main` is 50 files, 5,032 insertions and 491 deletions. The deletions grew because of the removed writer and its tests. `git diff origin/main -- packages` is still empty, and migrations 0001–0007 are unchanged.

**Gates at `5b8cc9d`**, run sequentially:

| Gate | Result |
|---|---|
| `corepack pnpm typecheck` | passed, exit 0 |
| `corepack pnpm lint` | passed, 30 warnings / 0 errors |
| `corepack pnpm test` | passed, exit 0. **323 files / 3,414 tests** (app 272 / 2,827, safe-media 1 / 62, region 3 / 23, scoring 16 / 183, contracts 3 / 20, scan-engine 28 / 299) |
| `corepack pnpm test:integration` | passed, exit 0. **30 files / 323 tests**, which is 324 − 3 removed + 2 added |
| `build`, `db:verify` | not re-run. No commit after `d734dd7` touches `package.json`, the lockfile, `components/`, or `neon/migrations`. |

The whole-branch review's other checks all came back clean:
- Every terminal-status writer (`persist`, `fail`, `failQueued`) and every job creator writes its event through the safe path, once.
- No `withTransaction` caller is broken by the new COMMIT-tag guard. Every caller that can now see `transaction_rolled_back` handles it.
- No CLI path prints the password.
- The spot-checked claims in this record hold.

### Known residuals, not fixed

- **Rescans mint an analytics session without setting a cookie.** `app/api/workspaces/[workspaceId]/rescan/route.ts` passes `resolveAnalyticsSession(req).id` into `enqueueRescan` but never calls `setAnalyticsSessionCookie`. A request with no cookie therefore gets a fresh session that the browser never keeps. The later process request for the same job may carry a different session, so one job can have events from two sessions. Counts are unaffected, because reconciliation counts `DISTINCT` jobs. Per-session joins break. Rescans are also not forwarded to PostHog. That is unchanged from before P3.4, by design, since adding it would change that dataset without a requirement.
- **Consent-refused scans reach the database but not PostHog.** `failQueued` (`lib/repositories/jobs.ts`) now writes `scan_completed(failed)` to `scan_events` when the consent gate refuses a queued scan. The 403 branch of `app/api/scan/process/route.ts` never reaches the engine's `recordTerminal`, so nothing is forwarded to PostHog. PostHog's started → completed funnel therefore counts these scans as never finishing, while the durable table counts them as failed. Before P3.4, neither dataset had this event, so PostHog's numbers are unchanged. The mismatch is deliberate: forwarding it would change the PostHog dataset without a requirement, the same reasoning as for rescans. The report reads only the durable table.
- **`recordTerminal` forwards to PostHog even when its event write failed.** This is by design: PostHog is best-effort and independent of the durable table. However, since `f4c4613` removed the old writer's tests, no test asserts the behaviour either way.
- **A rescan event-validation failure would log `rescan_insert_failed`.** `scanStartedEvent(...)` is built inside `enqueueRescan`'s insert `try`, so a validation throw would be reported as an insert failure. By then the snapshot has passed `scanInputFromSnapshot`, which already requires market `HK`/`TW` and a known locale. That is everything `parseScanEvent` checks for `scan_started`, so the path is unreachable as the code stands. Noted and left unfixed.
- **The production 500 `home lookup failed` on `/zh-HK/owner/nadagogo` is unresolved.** The working hypothesis is that production is missing migrations `0006` / `0007` (`action_measurements.attribution_basis`). The read-only diagnostic SQL has **not** been run. According to the operator's reading of Vercel logs, there were 3 occurrences, all at 2026-09-18 07:29, and none since. Task 10 did not re-check those logs. The quiet period is not proof of a fix, because no cause was confirmed and nothing was changed to address it.

---

## P3.2c — honest comparison states

**Branch** `p32-comparison-states` · **HEAD** `f78174d` (the last code commit) plus this documentation commit · Base: `main` at `073c4ae` (PR #19, merged, P3.4; `origin/main` still points there). Node `v24.18.0`, pnpm `9.12.0` via corepack, Windows 11, Docker Server `29.7.2`.

Built from `docs/superpowers/plans/2026-09-24-comparison-states.md` (Tasks 1–8), against the design in [`docs/superpowers/specs/2026-09-24-comparison-states-design.md`](../../superpowers/specs/2026-09-24-comparison-states-design.md), including its "Amendment (2026-09-25): wiring membership into the report page".

This section was first written in Task 5 (`5a2fb42`), describing `ede55de`. A whole-branch review followed and led to Tasks 6–8. Task 8 amended this section in place: the header, the task table, "Reachable by", the `no_accessible_pair` definition note, the verification numbers and the checklist now describe `f78174d`. The review itself is under [Whole-branch review and membership wiring](#whole-branch-review-and-membership-wiring).

**Implemented and locally verified. Nothing here is hosted-verified.** No deployment, no migration, no paid provider call, no push. The acceptance route was not run locally, and no member sign-in was exercised in a browser (see Verification and "What this slice does NOT prove").

### What this closes

The P3.2 section above records, as its third "does NOT prove" item, that `ScanComparison`'s `no_accessible_pair` fired for three situations the Master Plan names separately: no earlier scan exists; an earlier scan exists but authorization denied it; an authorized earlier scan shares no comparable cohort. The Master Plan's P3.2 asks the report to "show no-access, no-pair, non-comparable and insufficient-evidence states separately from a successful comparison".

This slice separates them. It keeps the rule from the 2026-09-08 two-scan comparison design: never disclose inaccessible candidates, their existence, dates, counts or evidence. It does that by deciding a viewer's state from **who is reading**, not from **what history exists**.

### What changed, by task

Full diff `073c4ae..f78174d`: **18 files changed, 1,948 insertions, 69 deletions**, across 10 commits. Excluding `docs/`: 14 files, 456 insertions, 68 deletions. *(At `ede55de`, when this section was first written: 12 files, 1,306 insertions, 67 deletions, across 5 commits; excluding `docs/`, 10 files, 309 insertions, 67 deletions.)* No migration, and no file under `packages/` changed. `git diff --stat origin/main -- lib/report/comparison/projection.ts components/report/scan-comparison.tsx lib/funnel/report-props.ts lib/report/view-model.ts packages neon/migrations` prints nothing.

| Task | Commit(s) | What it did |
|---|---|---|
| Design and plan | `35cba4a`, `0700ed8` | The design, then the plan. `0700ed8` also amends the design in three places, all dated 2026-09-24: "or sources" in the `not_comparable` copy, the copy typed per reason, and e2e recorded as CI-only. |
| 1. Derivation | `5238a7b` | `compareScanMetrics` (`lib/report/comparison/derive.ts`) returns `PairComparison` (`changes \| insufficient_evidence \| not_comparable`) instead of `PairChanges \| null`. A `changes` result is exactly the old non-null result. New `hasUsableEvidence` (a complete cohort with at least one known folded outcome, or a complete `stored-post-sample-v1` Instagram sample) and a private `overlaps` (a shared cohort key with at least one shared query identity, or an Instagram sample of that definition on both sides). |
| 2 + 3. Loader states and typed copy | `a7aa56d` | `loadScanComparison` (`lib/report/comparison/load.ts`) takes a fourth argument, `reader: 'viewer' \| 'member' \| 'staff'`. `lib/report/load-report.ts` passes `access.kind`, a one-line change. `lib/report/comparison/types.ts` adds `UNAVAILABLE_REASONS` and `UnavailableReason`. `lib/report/comparison/copy.ts` types `unavailable` as `Record<UnavailableReason, string>` and adds the four new reasons in en, zh-HK and zh-TW. The two tasks landed together; see the plan defect below. |
| 4. Acceptance route | `ede55de` | `e2e/acceptance/report-scan-comparison.spec.ts`: the current-only-unlocked viewer now expects `comparisonCopy[locale].unavailable.no_history_access`, and the test is renamed "…shows the access state after current-only unlock". Its privacy assertions are unchanged. |
| 5. Gates and this record | `5a2fb42` | Gates, an independent re-run of every mutation check, and the checklist below, all at `ede55de`. |
| Spec and plan after the review | `cf6c101`, `642f7f2` | `cf6c101` makes the spec's table define `no_accessible_pair` as the code implements it: none was authorized **with readable input**. `642f7f2` adds the spec's "Amendment (2026-09-25)" and plan Tasks 6–8. |
| 6. Membership on `/r/[slug]` | `f5fdf84` | `reportMembershipResolver()` in `lib/auth.ts`, passed by `app/[locale]/r/[slug]/page.tsx` as `loadReport(slug, locale, { getMembership: reportMembershipResolver() })`. New `app/[locale]/r/[slug]/page.test.tsx`; a new `reportMembershipResolver` block in `lib/auth.test.ts`. See the review subsection. |
| 7. Review follow-ups | `f78174d` | A test for the Instagram branch of `overlaps` in `derive.test.ts`, and zh-HK 身分 → 身份 in `no_history_access` (`copy.ts`). zh-TW keeps 身分, the Taiwan form. |
| 8. This correction | *(this commit)* | Gates re-run at `f78174d`, the Task 6–7 mutations re-run, this section and `PHASE-3-TEST-RESULTS.md` amended, the P3.2 correction, and a note in `OWNER-WORKSPACE-GAP-OBSERVATIONS.md`. |

### The states as built

| Reason | When `loadScanComparison` returns it | Reachable by |
|---|---|---|
| `no_history_access` *(new)* | The reader is a viewer. Returned on the first line, before the current scan is even validated. No port is called. | viewers |
| `missing_location`, `invalid_current_scan` | The current scan is not comparable at all. Unchanged. | members¹, staff² |
| `insufficient_evidence` *(new)* | (a) The current scan has no usable evidence, and the walk reaches the first valid **and** authorized candidate. It returns there, without calling `readInput` for it. (b) The walk ends, and at least one authorized, readable candidate returned `insufficient_evidence` from `compareScanMetrics`. | members¹, staff² |
| `not_comparable` *(new)* | The walk ends, at least one authorized, readable candidate was compared, and none returned `insufficient_evidence`. | members¹, staff² |
| `no_earlier_scan` *(new)* | The walk ends and no candidate passed `validCandidate`: same location, `done` or `partial`, a valid completion time strictly before the current scan's. | members¹, staff² |
| `no_accessible_pair` *(kept)* | The walk ends, valid candidates were seen, and none was both authorized and readable with a matching timestamp. Also the outward projection of `history_limit` (`projection.ts`, unchanged). | members¹ and staff² (defensive fallback) |
| `history_limit`, `lookup_failed` | Candidate cap exhausted with more remaining; a thrown error. Unchanged. | members¹, staff² |

¹ *Corrected 2026-09-25.* Members reach these states **once signed in on `/r/[slug]`, as of Task 6 (`f5fdf84`)**. Before that commit the page never passed `getMembership`, so in production no reader was ever a member, and only the viewer row was reachable. This table originally said "members, staff" without that qualification.
² Staff reach these states in the loader and its tests only. `lib/auth/staff.ts` stubs staff identity off (`loadStaffIdentity` always returns `null`), so no staff session exists in this app, before or after Task 6.

`insufficient_evidence` outranks `not_comparable` whichever candidate is newer, because a fuller rescan could still produce a comparison.

*A precise definition, as built:* `sawAuthorized` is set only after `readInput` returns an input whose `scannedAt` matches the candidate's `completed_at`. So an authorized candidate with unreadable or mismatched input counts toward `no_accessible_pair`, not `no_earlier_scan`. When this section was first written, the spec's table said "none was authorized" while the plan said "none was authorized with readable input", and the code and "rejects an impossible authorized candidate input before comparison" followed the plan. *Updated 2026-09-25:* `cf6c101` aligned the spec's table ("none was authorized with readable input", and an authorized candidate whose stored input fails the timestamp check counts as unreadable), and `642f7f2` aligned its "Selection order". Spec, plan and code now agree.

**The privacy argument.** A viewer holds a single-report grant (`sme_report_grant`), which never covers another scan, so a viewer can never obtain a comparison. The loader therefore answers a viewer before looking at history, and nothing about hidden history can change a viewer's answer. Two tests prove it at the two layers:

- `lib/report/comparison/load.test.ts`, "gives a viewer the access state without touching history": with a comparable earlier scan present, the result is `no_history_access` and `list`, `authorize` and `readInput` are **never called**. Its companion, "gives a viewer the identical state when no history exists", gets the same result with no history.
- `lib/report/load-report.test.ts`, the viewer `it.each` "gives a %s the access state without looking up any earlier scan" (current-only viewer token, revoked candidate grant, expired candidate grant): through the real `createReportLoader`, the result is `no_history_access`, `readEarlierReportJobs` is never called, and `findViewerGrant`, `markViewerGrantUsed` and `readAuthorizedJobData` are never called for the earlier job.

Members and staff already open every scan of their workspace's locations, so the history-based reasons reveal nothing they cannot already see. Every candidate is still authorized one by one, as before.

### Plan defect found in execution: Tasks 2 and 3 could not land separately

The plan treated the copy's `unavailable` object as `Record<string, string>`, so Task 2 could widen the reason type before Task 3 added the copy. But `comparisonCopy` is checked with `satisfies`, which keeps the object's own literal keys. Widening `ScanComparison['reason']` therefore made `comparisonCopy[locale].unavailable[reason]` in `components/report/scan-comparison.tsx` a TS7053 until the four new keys existed. The Task 2 implementer stopped rather than add a cast. Tasks 2 and 3 landed as one commit, `a7aa56d`. Task 3's RED step was still observed first: Vitest does not typecheck, so the new panel tests failed at runtime on the missing copy before it was added.

Re-checked in Task 5: with `copy.ts` restored to its `origin/main` text and everything else at HEAD, `npx tsc --noEmit` exits 2 with `components/report/scan-comparison.tsx(31,79): error TS7053`, plus the same error in the panel test and a TS2339 in the acceptance spec. The plan was not retro-edited.

### Tests changed, and why

- **`lib/report/comparison/load.test.ts`.** All 12 existing `loadScanComparison(` calls pass `'member'`. One expectation changed. "rejects impossible candidate metadata before authorization" became "treats impossible candidate metadata as no earlier scan, before authorization" and expects `no_earlier_scan`, because an impossible completion date fails `validCandidate` and cannot establish an earlier scan. Two `no_accessible_pair` expectations were examined and kept: "returns no accessible pair when all candidates are denied" (a valid candidate, denied) and "rejects an impossible authorized candidate input before comparison" (authorized, but its input timestamp is impossible). A new `describe('loadScanComparison states')` adds 12 tests.
- **`lib/report/load-report.test.ts`**, the only file that goes through `createReportLoader`. Its two `no_accessible_pair` expectations were audited:
  - Line ~1002, "authorizes each historical candidate by its own membership before reading private data": a member reader, and one valid candidate denied by membership. It **stays** `no_accessible_pair`, the correct fallback.
  - Line ~1042, the viewer `it.each`: it **changed** to `no_history_access`. The old assertions that `findViewerGrant` *was* called for `job-previous` were replaced by assertions that `readEarlierReportJobs` is never called and that `findViewerGrant` and `markViewerGrantUsed` are never called for the earlier job.
  - Added: "tells a member there is no earlier scan when the location has none".
- **`lib/report/comparison/derive.test.ts`.** Existing `changes` assertions go through a `changes()` helper that fails loudly on any other kind. Five `toBeNull()` expectations became `not_comparable` (disjoint cohorts, changed context) or `insufficient_evidence` (incomplete cohort, oversized cohort, incomplete Instagram sample). Two tests were renamed to say so. Added: 3 `compareScanMetrics` cases and 5 `hasUsableEvidence` cases.
- **`components/report/scan-comparison.test.tsx`.** Added "renders every unavailable reason in %s, never claiming a first scan" (en, zh-HK, zh-TW, each checking every reason against `/first scan|首次|第一次/i`) and "tells a viewer how to get history, and the others why there is none".
- **Unchanged:** `lib/report/view-model.test.ts` (projection pass-through, including `history_limit` → `no_accessible_pair`), `tests/funnel-report-props.test.ts` and every public and locked privacy test.
- **Added after the review (Tasks 6–7).** No existing expectation changed.
  - `lib/auth.test.ts`: a new `describe("reportMembershipResolver")` with 8 tests. No workspace (and `getUser` never called); nobody signed in; no accepted membership; an accepted owner, manager and viewer (`it.each`, 3); "answers every job of one workspace identically, with one user lookup and one query"; "fails closed to no membership, with a fixed log line, when identity or the query fails". The last one also asserts that the logged calls contain no error detail. The test user carries `verified: true`, because `SessionUser` requires it; the plan's fixture omitted it.
  - `app/[locale]/r/[slug]/page.test.tsx` *(new file)*: "loads the report with the session layer's workspace membership resolver" asserts `loadReport("the-slug", "en", { getMembership: sentinel })`. The locale is the raw `"en"`, because the page passes `params.locale` through unnormalised; the plan had said "normalised locale". "builds a fresh resolver for every render, so no membership outlives its request" asserts two renders create two resolvers.
  - `lib/report/comparison/derive.test.ts`: "is insufficient evidence when both have an Instagram sample, one incomplete, and their searches differ". The search cohorts share a key but no query, so only the Instagram line of `overlaps` makes the two sides overlap.

### Whole-branch review and membership wiring

After Task 5 (`5a2fb42`), a review of the whole branch against `origin/main` found **no Critical issue, one Important and five Minor**.

| Finding | Resolution |
|---|---|
| **I1.** `/r/[slug]` never passed `getMembership`. `loadReport` defaults it to "no membership", and staff identity is stubbed off (`lib/auth/staff.ts`), so in production only viewers ever reached the comparison panel. The member states were unreachable, and the viewer copy's promise ("Sign in as the business owner to see changes over time") could not be kept: signing in changed nothing. The P3.2 record's claim that membership resolution through `loadReport` was already satisfied was wrong (corrected in the P3.2 section above). | **The owner decided to wire it on this branch.** Spec amendment in `642f7f2`; code in `f5fdf84` (Task 6). Design below. |
| **M1.** The privacy argument rested on an unwritten invariant: the resolver must answer per workspace, not per job. | **Stated and pinned.** The resolver's doc comment states it, and "answers every job of one workspace identically, with one user lookup and one query" pins it (mutation M6.1 fails it). |
| **M2.** The Instagram line of `overlaps` was untested. | **Closed by `f78174d`** (Task 7). Mutation M7.1 fails the new test. |
| **M3.** An overlap larger than `MAX_EVIDENCE_ROWS` (50 shared queries) is reported as `insufficient_evidence`, and that copy mentions a fuller rescan, which fits missing evidence rather than an oversized overlap. | **Accepted, not changed.** Recorded in the spec's amendment as an accepted limitation: no current scan approaches 50 shared queries in one cohort. Revisit if query counts grow. |
| **M4.** Stale documentation lines, among them the spec's "Selection order", which still said "none was authorized". | **Fixed** in `cf6c101` (the table) and `642f7f2` ("Selection order"). This section's header, task table, "Reachable by" and definition note are amended by Task 8. |
| **M5.** Copy: zh-HK used 身分 where `lib/copy.ts` uses 身份. Also noted: zh-TW uses both 據點 and 地點 (one each in `lib/report/comparison/copy.ts`), and the English says "business owner" although managers and workspace viewers also get member access. | **身份 fixed in `f78174d`.** The 據點 / 地點 mix and the "business owner" wording are **left as they are**, by the review's own judgement. Both remain open for the native-speaker review. |

The review also examined the member-denied split between `no_accessible_pair` and `no_earlier_scan` and judged it **not a real leak**. No production resolver denies a same-workspace, same-location candidate to a member: `reportMembershipResolver` answers by workspace, and `validCandidate` (`lib/report/comparison/load.ts:54-60`) admits only candidates with the current scan's `workspace_id` and `location_id`, so a member authorized for the current scan is authorized for every valid candidate. The load-report test that produces `no_accessible_pair` for a member ("authorizes each historical candidate by its own membership before reading private data") uses an artificial fixture that denies one job of the same workspace.

**The resolver as built** (`reportMembershipResolver()` in `lib/auth.ts`, passed by `app/[locale]/r/[slug]/page.tsx`):

- **Keyed by workspace, never by job.** A job with no `workspaceId` returns `null` before anything is asked. Otherwise the answer comes from a per-resolver `Map` keyed by workspace id, so every job of one workspace gets the same answer. This is the M1 invariant: a per-job answer would let `no_accessible_pair` versus `no_earlier_scan` reveal a scan the reader cannot open.
- **Memoised per render.** `getUser()` is called at most once per resolver, and `membershipRepository.accepted(userId, workspaceId)` at most once per workspace, however many candidates the comparison walks. The page calls `reportMembershipResolver()` inside its default export, so each render gets a fresh resolver and nothing crosses requests (pinned by the second page test).
- **Accepted members only.** The query requires `accepted_at IS NOT NULL` (`lib/repositories/membership.ts:24`), so a pending invite never grants access. The resolver's role type is `WorkspaceRole`, the same union as the loader's `ReportMemberRole`.
- **No location-scope check**, as the spec's amendment decides: §3.9 lets every member read evidence. `authorizeReport` still fails closed when the membership names a different workspace from the job's.
- **Fails closed.** The page is public, so any identity or query failure becomes `null`, and the reader gets the public or viewer view, never an error page or more access. It logs the fixed line `"[report] membership_unavailable", { category: "report_membership_unavailable" }` and no error detail. A rejected lookup stays memoised, so later jobs of that workspace also get `null`, which keeps the answer the same across jobs.

**Effect.** A signed-in, accepted member of the job's workspace now receives the full report on `/r/[slug]` (CLAUDE.md §3.2.2, "member = full"), including the member-only comparison states. Public readers and viewers see what they saw before. Staff remain unreachable in this app. This effect is shown at the unit layer only (see the checklist).

**Tests and mutation checks.** The resolver tests went RED first (8 failing, `reportMembershipResolver is not a function`), then GREEN at 31/31 in `lib/auth.test.ts`. The page test went RED with 2 failing (resolver called 0 times), then 2/2. Those RED observations are the Task 6 implementer's and were not repeated in Task 8. The four Task 6 mutations and the Task 7 mutation were re-run independently in Task 8, and all five were killed (M6.1–M6.4, M7.1 in `PHASE-3-TEST-RESULTS.md`).

**Two deviations from the plan's Task 6 text**, both recorded in the test notes above: `verified: true` on the test user, and the raw `"en"` locale in the page assertion.

**Still open, and not part of this branch:** the owner-surface link from the workspace to `/r/[slug]`. `OWNER-WORKSPACE-GAP-OBSERVATIONS.md` finding 13 records that no owner surface links to the report, and the snapshot carries no share slug. Wiring membership makes the report readable by a member who has the URL. It does not give the member a way to find it.

### Verification

Full detail is in `PHASE-3-TEST-RESULTS.md`. Summary of the Task 8 run at `f78174d`, one gate at a time:

| Command | Result |
|---|---|
| `corepack pnpm typecheck` | passed: exit 0 |
| `corepack pnpm lint` | passed: exit 0, 30 warnings / 0 errors across 18 files, the same counts as the standing baseline. None is in a file this branch touches. |
| `corepack pnpm test` | passed: exit 0, **324 files / 3,450 tests**, zero failures. P3.4's final record was 323 / 3,414, so **+1 file, +36 tests**, all in the app suite. Task 5 had recorded 323 / 3,439 at `ede55de`; Tasks 6–7 add the remaining +1 file / +11 tests. The file-by-file delta is in `PHASE-3-TEST-RESULTS.md`. |
| `corepack pnpm test:integration` | passed: exit 0, **30 files / 323 tests** (158.70s), unchanged from P3.4. Re-run because Task 6 touches the session path. No integration test references `reportMembershipResolver`, so this shows only that nothing else moved. |
| `corepack pnpm build` | **blocked on this Windows machine**: exit 1, `Error: Turbopack build failed with 45 errors`, the standing `radix-ui` barrel cascade. Not worked around. Separately, `npx next build --webpack` compiles clean (exit 0, 29/29 static pages, `ƒ /[locale]/r/[slug]` in the manifest) |
| `corepack pnpm e2e`, `corepack pnpm e2e:acceptance` | **not run**: both need a production build, which this machine cannot produce. CI runs both (`.github/workflows/ci.yml`: `pnpm e2e`, then `pnpm e2e:acceptance`). The changed acceptance expectation is proven only where CI runs it. |
| `corepack pnpm db:verify` | **not run**: no migration was added |

**Mutation checks.** The implementers reported 11 mutation checks across Tasks 1–3. Task 5 re-ran all 11 independently, one at a time, restoring each file byte-identically before the next. **All 11 were killed**, each by the test the implementer named. Tasks 6 and 7 reported 5 more (4 and 1). Task 8 re-ran those 5 the same way. **All 5 were killed**, each by the test named in the plan. That makes **16 of 16** killed. The per-mutation tables are in `PHASE-3-TEST-RESULTS.md`.

### Verification checklist

First walked against `ede55de` in Task 5, then re-walked against `f78174d` in Task 8. `lib/report/comparison/load.ts`, `lib/report/load-report.ts`, `load.test.ts` and `load-report.test.ts` did not change after `ede55de` (`git diff --stat ede55de..f78174d -- lib app components e2e` lists only `page.tsx`, `page.test.tsx`, `lib/auth.ts`, `lib/auth.test.ts`, `copy.ts` and `derive.test.ts`), and every named test passed in the Task 8 gate 3 run. The last three rows were added by the amended plan.

| Item | Status | Evidence |
|---|---|---|
| A viewer gets `no_history_access`, and no history port (list, authorize, read) is called | **Holds** | Loader: "gives a viewer the access state without touching history" (`list`, `authorize`, `readInput` never called). Report: the viewer `it.each` (`readEarlierReportJobs` never called; `findViewerGrant`, `markViewerGrantUsed`, `readAuthorizedJobData` never called for `job-previous`). Mutation T2.1 fails all five. |
| A viewer's result is identical with and without earlier scans | **Holds** | "gives a viewer the identical state when no history exists" (no history) against "gives a viewer the access state without touching history" (a comparable earlier scan). Both return `{kind:'unavailable', reason:'no_history_access'}`. By construction the viewer branch is the function's first statement. |
| A member gets `no_earlier_scan`, `insufficient_evidence` and `not_comparable`, each in the situation the spec defines | **Holds** | `no_earlier_scan`: "reports no earlier scan to a member with %s" (no history; only another location and unfinished scans), "treats staff like members, not viewers", and, through the report loader, "tells a member there is no earlier scan when the location has none". `insufficient_evidence`: "reports insufficient evidence when an authorized earlier scan overlaps but is incomplete". `not_comparable`: "reports not comparable when every authorized earlier scan measured different searches". The derivation rules behind them are in `derive.test.ts`, listed above. |
| `insufficient_evidence` outranks `not_comparable` whichever candidate is newer | **Holds** | "prefers insufficient evidence over not comparable when the incomplete scan is the %s one" (newer, older), both asserting `readInput` was called twice. Mutation T2.3 fails both. |
| A current scan without usable evidence reads no earlier scan's input | **Holds** | "reports insufficient evidence for a current scan without usable evidence, reading no earlier scan" (`readInput` never called). Mutation T2.4 fails it on exactly that assertion, because the reason alone would still come out `insufficient_evidence` through `compareScanMetrics`. "still reports no earlier scan for a current scan without usable evidence and no history" covers the no-history case. |
| All-denied history still gives `no_accessible_pair`; `history_limit` and `lookup_failed` are unchanged | **Holds** | "returns no accessible pair when all candidates are denied", "reports exhaustion after exactly 1000 denied candidates", "keeps no accessible pair when a current scan without usable evidence has only denied history", and the report-loader member-denied test at line ~1002. "stops at 1000 candidates and uses one metadata-only page to report history_limit" and "contains thrown failures as lookup_failed" keep their expectations, with only the `'member'` argument added. |
| Every reason has copy in en, zh-HK and zh-TW, enforced by the type, and none claims a first scan | **Holds** | `Record<UnavailableReason, string>` in `copy.ts`: mutation T3.1 (delete zh-TW `not_comparable`) fails `tsc` with `copy.ts(27,5) TS2741`. "renders every unavailable reason in %s, never claiming a first scan" asserts, for every reason in every locale, the exact copy, a non-empty string and no match for `/first scan\|首次\|第一次/i`. |
| Public and locked reports still carry no comparison data | **Holds for the unit layer; the RSC layer runs in CI only** | Unchanged and green: "keeps the public early return free of history and comparison data" (`load-report.test.ts`), "omits poisoned comparison data from public models and props" (`view-model.test.ts`), and "maps a public model to a locked preview" (`tests/funnel-report-props.test.ts`, `not.toHaveProperty("scanComparison")`). The acceptance spec's HTML and RSC payload assertions are unchanged but were **not run** locally. |
| `packages/**`, the migrations, the projection and the panel component are unchanged | **Holds** | The Step 1 `git diff --stat origin/main -- …` prints nothing. Package test counts are identical to P3.4's. |
| Every mutation check failed its named test | **Holds** | 11 of 11 killed in the Task 5 re-run, and 5 of 5 (Tasks 6–7) killed in the Task 8 re-run. See `PHASE-3-TEST-RESULTS.md`. |
| `/r/[slug]` passes a membership resolver; a signed-in accepted member gets member access | **Holds at the unit layer, link by link; not proven in a browser** | *Page:* `page.test.tsx` "loads the report with the session layer's workspace membership resolver" (`loadReport("the-slug", "en", { getMembership: sentinel })`). Reverting `page.tsx` to `loadReport(slug, locale)` fails both page tests (M6.4). *Resolver:* "returns an accepted %s membership for the job's workspace" (owner, manager, viewer → `{ workspaceId: "ws-1", role }`, queried as `accepted("user-1", "ws-1")`). The production query requires `accepted_at IS NOT NULL` (`lib/repositories/membership.ts:24`), so a pending invite never resolves. *Loader:* the existing `load-report.test.ts` "uses the authorized path for an accepted workspace member without a viewer grant" gives `access: "member"` and the full model for a resolver answer of `{ workspaceId: "ws-1", role: "manager" }`, and "fails closed to the public model when the membership names another workspace". No single test runs the real resolver through the real loader, and no browser session was exercised. *Update 2026-09-25:* CI's acceptance run `36035662332` (on `e0523af`) now signs in an accepted member on `/r/[slug]` and asserts member access. |
| The resolver answers per workspace, memoised, and fails closed to `null` with a fixed log line | **Holds** | "answers every job of one workspace identically, with one user lookup and one query" (3 jobs, 1 `getUser`, 1 `accepted`). Keying the memo by `job.id` fails it (M6.1). "fails closed to no membership, with a fixed log line, when identity or the query fails" asserts `null` for both failures, the call `("[report] membership_unavailable", { category: "report_membership_unavailable" })`, and no `"secret detail"` in any logged argument. Replacing the `catch` with a bare `finally` fails it (M6.2). "returns nothing for a job attached to no workspace, without asking who is signed in" fails when the guard is removed (M6.3). The invariant is stated in the resolver's doc comment in `lib/auth.ts`. |
| The Instagram branch of `overlaps` has a test that fails without it | **Holds** | "is insufficient evidence when both have an Instagram sample, one incomplete, and their searches differ" passes at HEAD. Deleting the Instagram line at the top of `overlaps` (`derive.ts:50`) fails exactly that test, 1/22 (M7.1). |

### What this slice does NOT prove

1. **A member signing in and getting the full report in a real browser.** Task 6 is proven link by link at the unit layer: the page passes a resolver, the resolver returns an accepted membership, and the loader turns a membership into the member model. Nobody has signed in as a member and opened `/r/[slug]`. That needs hosted Neon Auth, which is not chosen or run (see CLAUDE.md "Current Neon migration operating contract"). So the member comparison states are **locally verified, not hosted verified**. The integration suite does not exercise the resolver.

   *Update, 2026-09-25, CI after the whole-branch review.* The first CI run of PR #20 failed two acceptance specs, `report-scan-comparison` and `report-scan-metrics`.
   - **Why they failed.** Both signed in the fixture's `viewer` account, an accepted workspace member, before unlocking. With membership now resolved, that reader was a member, so the specs saw member access where they expected viewer-grant behaviour. This was not a leak.
   - **The fix.** `e0523af` makes them unlock signed out, as a link-holder does. Each spec then signs in as the member and asserts member access on the same route: the member-only `not_comparable` state, and the full metrics after the grant is revoked.
   - **Result.** CI run `36035662332` on `e0523af` passed Build, End-to-end and "Required merchant acceptance (isolated Auth, database, mail and LLM)".
   - **What this proves.** A signed-in accepted member gets member access on `/r/[slug]` in a real browser, against CI's isolated Auth. It is **CI verified**, still **not hosted verified**: the production Neon Auth target is unchanged.
2. **The successful-pair browser artifact still does not exist.** A comparable pair in a real browser, plus negative authorization examples, needs hosted access and the repository owner's authorization. That has been recorded since 2026-09-08 and is unchanged.
3. **The acceptance route was not run locally.** `e2e/acceptance/report-scan-comparison.spec.ts` now expects `no_history_access`. It is typechecked here (it is in the `tsc` project, and TS2339 fires on it when the key is missing), but it runs only in CI.
4. **The Chinese copy has not been reviewed by a native speaker.** It follows the repository register rules: 香港書面中文 for zh-HK (商戶, 地點, and now 身份), 台灣用語 for zh-TW (店家, 據點), and 工作台 as the workspace term in both. The zh-TW 據點 / 地點 mix and the English "business owner" wording (M5) are open for that review.
5. **A workspace member cannot yet find the report.** The owner-surface link to `/r/[slug]` (`OWNER-WORKSPACE-GAP-OBSERVATIONS.md` finding 13) is still open. Only a member who already has the share URL benefits from Task 6.
