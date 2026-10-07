# SMEAssistant 稽核整改進度

Plan: `docs/superpowers/plans/2026-10-07-smeassistant-audit-remediation.md`

Baseline: `d1cbc7bd8a2bc7989c774d15001f7971274bed8d` (local and remote main verified 2026-10-07 Asia/Hong_Kong).
Branch: `codex/smeassistant-audit-remediation-20261007`.
Worktree: `C:/Users/laich/Documents/smescanner/.worktrees/smeassistant-audit-remediation`.

## 基準及執行界線

- Handoff MANIFEST: 6/6 SHA256 matches. Original evidence MANIFEST: 28/28 matches. Original ZIPs and input documents remain unchanged; extracted copies are read-only inputs.
- Original `smescanner` checkout is a different repository and has user edits; it is not a code source. Correct `smeassistant` main was clean before isolation; remote main matches audit SHA.
- Node 24.18.0 / pnpm 9.12.0. Lockfile SHA256: C7C722C958A874DEEE76AB2B4FAAF654D985547A9D29EB256D8F6C9B848F63C6.
- Initial install: `corepack pnpm install --frozen-lockfile --ignore-scripts` exited 1, ERR_PNPM_ENOSPC (C: had 0 bytes free). Only this session's failed worktree node_modules was removed; reclaimed 1.75 GB.
- Initial temporary ruling: reused correct main's existing node_modules via a verified junction. This was later superseded after disk space was freed: the owned junction was removed without touching its target, and a real frozen-lockfile worktree installation passed. No .env files, provider keys or login cookies copied.
- Ruling: native worktree tool targets the chat's unrelated repo; use `git worktree add` from the correct repository instead. Local branch/commits are authorized; no push, PR, deployment, hosted mutation or paid/provider operation authorized.
- Ruling: retain T/F/UC IDs in this committed ledger rather than transform the supplied plan into skill-specific Task N briefs. Sequential execution and RED → GREEN evidence remain required.
- Existing flags and DEC-10 remain unchanged. T-01/T-04 retain historical baseline completion, not new fix/CI claims.

## 預檢相依介面

| Producer → consumer | Shared interface / decision |
|---|---|
| T-03 → T-18/T-15 | Shared report parser; claim is context, never membership. no_access remains a server result. |
| T-08 → T-07/T-14 | Valid requested source differs from collector measured outcome; preserve unknown outcomes. |
| T-06 → T-16 | Currency and both validity boundaries are deterministic acceptance warnings. |
| T-09 → T-10 → T-12 → T-13 | Sequential changes to queries-pages/workspace-read; preserve count scope, local month, canonical phase, authorization and bounded projection. |
| T-11 → T-02/T-21 | One cancellable budget; cron stays off; recovery evidence separate from scheduler activation. |
| T-19 → T-15/T-20 | 0014 first_published_at required even with publishing off; disposable verification differs from production journal. |

## 任務狀態

See `2026-10-07-remediation-tracker.csv` for all 21 tasks, with audit_status / implementation_status / hosted_status kept separate. New local evidence is stored in `remediation-evidence/`; raw test logs in the plan's `.superpowers/sdd/` scratch directory.

## 檢查紀錄

Batch 0: in progress. A1 starts with T-03 → T-18, then continues to A2, B, C1, C2, D and E. No product fix, new CI pass, hosted acceptance or production deployment is claimed at setup.

### A1 / T-03 / F-02 / UC-12

- RED: actual onboarding dropped `3cuOKFmHdiYf00BOs27E_NO1`; accepted 5/65-character claims. 3 failed / 8 passed, exit 1. Separate imported parser-boundary regression exposed whitespace trimming (2 failed / 5 passed, exit 1).
- Fix: one strict 6–64 ASCII report parser across sign-in, onboarding, Google claim start/callback, magic link and claim body. Duplicate/array claim context fails closed; report context never grants membership. Repository ports in page tests are offline stubs.
- GREEN: `node node_modules/vitest/vitest.mjs run lib/report-access/slug.test.ts lib/report-access/slug-boundaries.test.ts lib/identity/sign-in-flow.test.ts app/[locale]/owner/onboarding/page.test.tsx app/api/oauth/google/claim/start/route.test.ts app/api/oauth/google/claim/callback/route.test.ts app/api/owner/magic-link/route.test.ts app/api/workspaces/claim/route.test.ts --maxWorkers=1`: exit 0, 8 files / 106 tests. Root `tsc --noEmit`: exit 0. Source lint is recorded separately.
- Evidence: `remediation-evidence/T03-red.txt`, `T03-boundaries-red.txt`, `T03-green.txt`, `A1-typecheck.txt`. Rollback: revert this task's local commit; stored report slugs remain unchanged.
- Hosted: not run; dedicated identities/workspace and explicit hosted authorization missing. New CI is not claimed.

### A1 / T-18 / F-14 / UC-08, UC-22

- RED: the actual completion card lacked the own-status link in all three locales (4 failed / 10 passed, exit 1).
- Fix: add localized explicit navigation to `/{locale}/owner/select-workspace`; retain scan and change-account paths. No redirect loop, completion replay or membership mutation. Page boundaries use verified session user id even with another id/email in the query.
- GREEN: `vitest run app/[locale]/owner/onboarding/page.test.tsx app/[locale]/owner/select-workspace/page.test.tsx components/auth/sign-in-completion.test.tsx lib/workspace/my-access-request.test.ts --maxWorkers=1`: exit 0, 35 tests. Scoped eslint: exit 0. `vitest run --config vitest.integration.config.ts test/integration/neon-assisted-assignment.integration.test.ts test/integration/neon-owner-sign-in-completion.integration.test.ts`: exit 0, 7 real PostgreSQL tests, only harness-owned loopback targets.
- Browser: `playwright test --config playwright.acceptance.config.ts e2e/acceptance/guided-sign-in.spec.ts --grep 'an accepted fixture account'`: exit 1, owned fixture setup exceeded 240 seconds before Next/page startup; not a witnessed product assertion failure. The stalled owned `pg_isready` child was ended; its label-verified fixture container was removed. Keep this environment limitation visible and retry during final acceptance.
- Evidence: `remediation-evidence/T18-red.txt`, `A1-green.txt`, `A1-integration.txt`, `A1-browser.txt`, `T18-lint.txt`. Rollback: revert T-18 local commit; no data/migration change. Hosted not run.
- Copied plan Markdown hard-break whitespace and raw test output are preserved; source diff whitespace checks exclude those evidence documents.

### A2 / T-08, T-07, T-14 / F-06, F-05, F-11 / UC-03, UC-04, UC-05, UC-10

- T-08 RED: 9 failed / 3 passed (exit 1), malformed/credential URLs accepted by real client/server functions. Fix: shared optional HTTP(S) parser, 2048 bound, no credentials, path/query preserved, candidate fallback validated, explicit invalid input never replaced. Wizard stays on step 3, focuses the field, associates localized errors, and excludes invalid websites from source count. Route refusal occurs before limiter/quota/job insertion.
- T-07 RED: 7 failed (exit 1). Stage progression and legacy terminal state no longer imply any measured collector; explicit measured outcome alone produces done. Awaiting-result, not-provided (explicit DTO only), unavailable/unsupported, failed and stalled are distinct and localized.
- T-14 RED: 6 failed / 33 passed (exit 1). Owner presentation maps known limitation codes, hides unmeasured raw provider notes, adds relevant next steps, and uses localized generic unknown-code text. Raw codes remain in source evidence; zero values remain measured when evidenced.
- Final targeted command: `node node_modules/vitest/vitest.mjs run lib/scan/website-url.test.ts lib/scan/website-boundaries.test.ts lib/scan/start-job.test.ts app/api/scan/start/route.test.ts components/scan-page.test.tsx components/scan-page.website.test.tsx lib/funnel/collector-outcomes.test.ts lib/funnel/scan-progress.test.ts components/scanning-page.test.tsx lib/funnel/report-labels.test.ts components/report/dashboard.test.tsx components/report/evidence-gallery.test.tsx tests/funnel-scan.test.ts lib/report/view-model.test.ts --maxWorkers=1`: exit 0, 14 files / 245 tests. Root `tsc --noEmit`: exit 0. Scoped eslint: exit 0.
- Evidence: `remediation-evidence/T08-red.txt`, `T07-red.txt`, `T14-red.txt`, `A2-final-green.txt`, `A2-lint.txt`, `A2-typecheck.txt`. Scan disposable integration is separately in progress; no hosted journey/production claim. Rollback: revert A2 local commit; no stored data or migrations changed.

### B / T-06 / F-04 / UC-14

- RED: 12 currency/date boundary failures; 3 actual warning classification/localization failures (exit 1).
- Fix: compare amount AND explicit currency; ambiguous bare $/元 warns. Require both validity boundaries and correct explicit years; enforce calendar validity, cross-year disambiguation, full ISO/slash/CJK/English dates. Locale never determines currency.
- UI: offer_price_mismatch / offer_dates_missing / offer_prohibited_term are classified warnings with actionable three-language copy. Warnings do not bypass exact-version human approval.
- GREEN: `vitest run lib/agents/offer-boundaries.test.ts lib/agents/offer-checks.test.ts lib/agents/agents.test.ts test/corpus/workflows/corpus.test.ts lib/workspace/offer-warning-copy.test.ts lib/workspace/version-meta.test.ts components/workspace/action-detail-client.test.tsx --maxWorkers=1`: 7 files / 251 tests, exit 0. Root typecheck and scoped eslint: exit 0.
- Evidence: T06-red.txt, T06-warning-red.txt, T06-final-green.txt, T06-typecheck.txt, T06-lint.txt. Rollback: revert this local task commit; no data or migration change. Hosted not run; flags unchanged.
- A2 scan integration finished exit 1: disposable fixture beforeAll exceeded 120 seconds, 19 tests skipped, no product assertion reached. T-08 local validation remains verified; database acceptance remains blocked. Evidence: T08-integration.txt. A2 SHA: 3ea795dc62fa0e199fd0e299e83f003cf2aff4ae.

### B / T-16 / UC-14, UC-19

- Registry: 12 agents, 7 Live / 5 Beta. Added 88 named HK/TW normal/missing-data/adversarial/recovery JSON fixtures using the existing harness. Eight validation_plan slots are explicitly N/A: no production template routes that agent; server substitution remains forbidden.
- RED coverage: missing named fixtures (exit 1). Additional true-pipeline provider regression: rejected timeout made one call instead of the contracted budget-bounded retry (2 failures, exit 1). Fix: retry rejection inside the existing maximum-two-attempt deadline; clear failure reason on recovery; preserve final persistence and authorization.
- Tests exposed two pre-existing assertions swallowed inside provider mocks. Assertions now inspect actual prompt evidence after successful execution; owner input remains fenced data and cannot widen collected reviews. Facts-needed output can exist without an artifact version; the harness assertion now checks this actual contract.
- GREEN: `vitest run test/corpus/workflows/corpus.test.ts test/corpus/workflows/audit-matrix.test.ts test/corpus/workflows/provider-recovery.test.ts scripts/eval-workflows.test.ts lib/workspace/runs.test.ts --maxWorkers=1`: 5 files / 213 tests, exit 0. Scoped eslint and root typecheck: exit 0.
- Evidence: T16-red.txt, T16-provider-red.txt, T16-green.txt (intermediate harness mismatch), T16-final-verification.txt, T16-final-lint.txt, T16-typecheck.txt; coverage and live manifest: ai-quality-baseline.md. Guardrail/contract coverage only; no real-model writing quality, CI or hosted claim.
- Live blocked by DEC-04 budget/model/provider authorization, approved dataset/reference labels, quality thresholds and human reviewer. Rollback: revert this local commit; no provider/DB/hosted state changed.

### C1 / T-09, T-10 / F-07, F-08 / UC-15, UC-16

- T-09 RED: mixed needs_input/completed faithful repository states-filter regression failed (exit 1). Counts now use authorized workspace/location/channel/explicit-status scope before the active tab predicate. SQL integration reproduces stable tab totals, workspace-wide actions and foreign-tenant exclusion. Interim read cost still loads histories; T-12 must replace it with bounded projection/aggregation.
- T-10 RED: home passed a UTC string instead of local month boundaries; allowance notice also used UTC month (one failure each, exit 1). Shared monthWindow validates period/IANA zone; SQL parameterizes both local midnights with AT TIME ZONE and uses [start,end). Allowance dedupe reads trusted workspace timezone; quota/billing period definitions are unchanged.
- GREEN: `vitest run lib/workspace/queries-pages.test.ts lib/workspace/month-window.test.ts lib/workspace/delivery-notices.test.ts lib/workspace/notify-repository.test.ts --maxWorkers=1`: 4 files / 66 tests, exit 0. `vitest run --config vitest.integration.config.ts test/integration/neon-workspace-read.integration.test.ts`: 1 file / 23 tests, exit 0, real owned PostgreSQL.
- Database boundary fixture covers previous-month last millisecond, month 00:00, 00:15, 07:59, 08:00, month end and next-month midnight in HK/TW/UTC and November America/New_York DST. Notifications at either outside boundary do not suppress the month's notice; in-month and exact-start notices do. Data is entirely synthetic.
- Disposable harness Docker commands now have bounded execution and readiness deadlines after prior pg_isready hangs. Ownership checks/network-none/loopback relay and unrelated containers are preserved. This fixture improvement does not establish a hosted fix.
- Evidence: T09-red.txt, T10-red.txt, T10-notice-red.txt, C1-green.txt, C1-integration.txt, C1-lint.txt, C1-typecheck.txt. Rollback: revert C1 query commit; no DB migration or history rewrite. Hosted not run; no CI/deployment claim.
- C1 scoped eslint and root typecheck completed: exit 0.

### C2 / T-12 / F-10 / UC-18

- RED: original unbounded list returned 31 actions and accepted invalid cursor/page size; 2 failures, exit 1.
- Fix: default 25 / maximum 50, scoped keyset cursor with exact microsecond timestamps; latest run/version metadata projection and independent SQL counts. List/home no longer fetch all version bodies or run inputs/outputs. Detail history remains full. Three-language next/refresh links preserve filter state and clear cursor on scope changes.
- EXPLAIN evidence justified new 0015 indexes after verified 0014; no committed migration edited. Disposable only. Final 1000-action fixture: 3 queries / 16000 rows / 26,739,928 bytes before; 2 queries / 27 rows / 22,589 bytes after. Latency samples are local, not hosted p95.
- GREEN: 70 selected unit tests, 6 real PostgreSQL tests, root typecheck and scoped lint, exit 0. SQL phase parity imports the canonical function; no regex extraction. Tests cover tied tuple completeness, counts, viewer/manager/global/foreign scopes and preserved detail histories.
- Evidence: action-list-performance.md; T12-red.txt, T12-final-unit.txt, T12-db-final.txt, T12-benchmark-final.jsonl, T12-typecheck.txt, T12-lint.txt. Intermediate failed DB run remains recorded. Rollback: revert application commit; retain applied indexes pending separately authorized forward migration. No CI/hosted/deployment claim.

### C2 / T-13 / F-10 / UC-18 — service/API checkpoint

- RED: actual single PATCH accepted a timezone-free due date (200 instead of 400); new strict bulk contract was absent, exit 1. Search regression separately shows ignored query and invalid filters (2 failures); UI/read work continues after this checkpoint.
- Shared assignment service rechecks accepted owner/manager membership, action and persisted snapshot scope, writable accepted assignee scope, open state and exact microsecond expectedUpdatedAt. Per-item action update + audit event share one transaction. Foreign/missing IDs return identical detail-free not_found; no_change reauthorizes and does not duplicate events. Single PATCH assignment uses the same service, retaining its existing authorization front half.
- New bulk API ships dark unless ACTION_BULK_ASSIGN_ENABLED is exactly true; no existing flag changed. Strict payload accepts only assignee and due date, 1–50 unique items, explicit timezone. No bulk lifecycle/artifact operations.
- GREEN service/API: 30 unit tests / 3 files, 5 real disposable DB tests, root typecheck and scoped lint exit 0. Real tests cover 2 updated + scope denial + conflict, stale replay idempotency, revoked actor/pending/out-of-scope assignee, foreign/deleted/closed target, atomic audit rollback and a real row-lock timeout followed by recovery.
- Each item has 5s statement / 1s lock timeout; bulk stops starting items after 50s and returns deferred failed items. This does not yet assert a shared cancellable deadline for every multi-query step or pool wait; T-11 will supply that infrastructure. No hosted/CI/production claim.
- Evidence: T13-boundary-red.txt, T13-boundary-green.txt, T13-service-unit.txt, T13-service-db.txt, T13-service-typecheck.txt, T13-service-lint.txt. Rollback: revert gated service/API commit; legitimate assignment data is not automatically reversed.

### C2 / T-13 — bounded search and preview UI checkpoint

- Search now trims/bounds q to 200, uses literal parameterized title/summary predicates only, and shares the same authorized filters with counts. Assignee UUID/unassigned is validated and canonicalized; due windows use workspace IANA local midnights, including DST. Cursor clears on filter/tab changes and remains bound to role/scope.
- UI supports explicit selection across pages up to 50; a changed workspace/location/filter/role remount clears selection. Preview reads current DB state and returns fresh expectedUpdatedAt for apply. Apply rechecks CAS; unknown/conflicted results require a fresh preview, and retries include failures only. Successful results remain visible; partial completion is never labelled all-success.
- Workspace-local datetime conversion refuses nonexistent/ambiguous DST times. No browser timezone or locale currency inference. New flag stays off outside explicit synthetic acceptance fixtures.
- GREEN: 67 unit tests / 6 files, root typecheck and scoped lint exit 0. Genuine Radix dialog Escape/focus, three-language controls, selection cap, URL state and failure-only retry tested. 12 real DB tests passed for filters, IANA/DST and assignment transactions. Browser 375px/keyboard acceptance follows in the third T-13 checkpoint.
- Evidence includes T13-search-red.txt, T13-date-filter-red.txt, T13-due-input-red.txt, T13-ui-red.txt, T13-assignee-case-red.txt, T13-ui-jsx-failure.txt (corrected intermediate syntax error), T13-ui-final-unit.txt, T13-ui-typecheck.txt, T13-ui-lint.txt. No hosted/CI/production claim.

### C2 / T-13 third checkpoint; T-17 action mobile/keyboard

- Real DB acceptance: 12 tests / 2 files, exit 0. Actual local Chromium: 2 tests, exit 0, 375px keyboard/selection/preview/apply/Escape/focus/overflow; database verified the timezone instant and exactly one event. Viewer mutation 403 and scoped manager list exclusion witnessed.
- Initial browser setup failed on the dependency junction, not a product assertion. After freed disk, verified/removed only our junction, preserved original repo dependencies, and installed frozen lockfile inside isolated worktree: exit 0, unchanged SHA256 C7C722C958A874DEEE76AB2B4FAAF654D985547A9D29EB256D8F6C9B848F63C6. Default Turbopack rerun passed.
- T-13 local implementation verified. T-17 local action flow verified, wider mobile journeys still to be covered by final acceptance; HK field participants/workspace remain blocked. No hosted activation/production/remote CI claim. See action-assignment-acceptance.md for contracts, evidence and rollback.

### D / T-11 / F-09 / UC-17
Shared 55-second work budget and 5-second bounded settlement reserve implemented. RED 3 expected deadline failures; GREEN 187 unit / 35 owned DB tests. Real cancellation and unattempted lease compensation verified. Cron remains off. See dispatch-deadline-verification.md; rollback by reverting this batch, no migration.

### D/E — read-only evidence and prepared operations

- T-05: exact baseline `verify` check passed; main protection returns 404 and rulesets are empty. Production alias maps to audit SHA, while Vercel automatic custom-domain assignment is enabled and project checks are empty. No setting changed. `docs/operations/release-gates.md` and the unapplied JSON proposal describe the concrete gate gap and failed-candidate drill. Required external setting/drill authority, integration choice, bypass-role inventory and test alias remain missing.
- T-19: production DATABASE_URL is sensitive; independent host/database and direct/readiness variables are unavailable. No hosted DB query. Local pre-0014 measurement fixture with publishing off must fail on first_published_at; the fully migrated counterpart must succeed. Prefix fixtures now distinguish 0013, 0014 and 0015. Historical SQL/catalog evidence remains unchanged.
- T-02, T-21: activation/heartbeat/backlog/missing-tick design and isolated restore runbook are prepared. DEC-10 remains off; no scheduler, monitoring destination, backup recovery point, retention evidence, isolated restore target or restore authorization is presumed.
- T-15/T-20: acceptance matrix maps identities, membership, claim/resume, required facts, exact version approval/export, idempotent applied assertion and composed rescan/measurement to permanent fixtures. Production flag metadata absence is distinct from operational acceptance. HK field checklist records devices, roles, network and unmeasured timings separately from local Chromium.

### Verification and sequential review history — final results follow below

- Frozen dependency install passed, lockfile unchanged. Full lint exit 0 (40 warnings); full typecheck exit 0 (root and all four packages).
- First full unit run was interrupted after an incomplete long run, with the stale raw IG-label expectation identified. Preserved `full-unit-first-interrupted.txt`; no complete unit pass is claimed for that attempt. The copy expectation now checks the actual localized visible mapping. Existing CI VITEST_MAX_WORKERS is explicitly honored. Rerun exit 0: root 391 files/4738 tests plus isolated safe-media 62 tests; packages region 23, scoring 183, contracts 20, scan-engine 299.
- Secret boundary exit 0 (61 public artifacts), no-supabase exit 0 (approved pinned auth-js exception retained), no-self-service-claim exit 0. These runs predate the final UI refresh follow-up; that follow-up receives fresh targeted and browser verification.
- Sequential self-review using requesting-code-review checklist found bulk apply left server cards/filter counts stale. RED expected refresh once but observed zero; minimal router.refresh after any apply result, including unknown response, keeps per-item outcomes and failed-only retry. Selected 14 tests exit 0; browser visible due-date check added, pending final acceptance.
- Migration catalog RED showed exactly three new 0015 indexes missing from verifier expectations; retained legacy catalog and old migrations are untouched. New definitions are independently checked exactly. `pnpm db:verify` exit 0: 0001–0015, replay [], tables 41, columns 491, constraints 204, indexes 111, triggers 8, functions 23, zero seeded rows. Full integration/build/browser gates are still in progress.
- Added browser acceptance for the exact legal claim slug and persisted onboarding resume; HK/TW merchant loop now fills a missing required fact through the real PATCH UI, checks stored input/audit, and asserts repeated applied returns one record/event. These new cases are not yet reported passed.
- Full integration first attempt: 561 passed / 2 failed, solely remaining journal count 14 vs 15 expectations; raw log preserved as full-integration-first.txt. Corrected counts retain checksum/order/interruption/rollback assertions. Full rerun: 52 files / 563 tests, exit 0, no skipped tests.
- T-19 sequential review found an additional actual readiness gap: journal/table/function/privilege checks did not prove first_published_at exists. New real DB regression renames the column with intact journal and observed ready instead of schema/not_ready (RED exit 1; other cases excluded by the targeted filter). Minimal read-only pg_attribute check requires the live timestamptz column. Targeted full files and final gates follow; no hosted query or migration occurred.
- Browser inventory: 49 tests / 14 files load successfully; inventory alone is not a pass. Added real-server commit + intentionally lost browser response recovery; reread/no_change must retain one stored update/event.
- Operations/acceptance preparation commit: 05da46cdd18e6434cbf80f995d23e5adaea0d08e. T-02/T-05/T-19/T-21 runbooks, T-15/T-20 matrix, T-17 field checklist and sanitized read-only settings/role/environment metadata. GitHub/Vercel GETs and JSON parsing succeeded; the main protection 404 is an observed absent rule, not a new product test failure. Fresh full lint/typecheck exit 0; no heavy gate removed. Rollback: revert this documentation commit, with no hosted or DB effect.
- New T-19 readiness/measurement GREEN: three full integration files / 51 tests exit 0, including intact-journal missing-column rejection and healthy recovery. Final all-gate rerun includes this source and regression.
- Follow-up source/fixtures commit: 76404c43458e3bf614bd2ac2329655e265c74f79, tree 9cc29f67569b7be35849ffe78e21da382917733b. T-13 refresh/unknown recovery; T-19 explicit column readiness and 0015 catalog/prefix checks; T-03/T-15/T-17/T-20 acceptance extensions. RED/GREEN and rollback are in final-followup-verification.md. Fresh full root/packages unit, lint/typecheck, secret boundary/no-supabase/no-self-service-claim and db:verify each exit 0. Final all-file integration/build/E2E/acceptance still pending; no source changes made during that rerun.

### Final complete-gate results — source frozen at 76404c4

- All-file integration now includes the missing-column regression: 52 files / 564 tests passed, exit 0, no skipped. Build exit 0. The final lint/type/unit/security/migration runs above also ran against this source; earlier intermediate counts remain history.
- General E2E startup first failed before browser assertions because Next's generated development route manifest contained only `_not-found`. Preserved log and manifest; verified the resolved owned `.next/dev` target and absence of owned Next processes before removing that cache alone. No application/auth/locale change. Rebuilt routes and `pnpm e2e`: 31/31 passed, exit 0. Required 49-case acceptance continues separately.
- Fresh remote main and production alias metadata still bind audit SHA d1cbc7bd8a2bc7989c774d15001f7971274bed8d. Original correct repo remains clean; unrelated smescanner has its 12 existing changes. Only new 0015 appears in migration/dependency/CI contract diff; no source changes after the verified commit.

### Final delivery — all unblocked local work verified

- Follow-up fixture commit 6941ed7c24ab66593018ab40e3628d193056ed17 corrects owned merchant required_inputs and exact applied 201-create/200-replay/UUID assertions. First complete acceptance 47 passed / 2 failed remains in full-acceptance-first-fixture-failure.txt, with both DOM contexts and traces. No product fix was inferred from an invalid test seed. Windows pipe-command exit 255 ran zero browser tests; targeted first-request HK 404 / TW pass also remains recorded. Verified owned dev-cache reset, unchanged tests rerun HK/TW 2/2 pass, full lint (40 warnings) / root+four-package typecheck exit 0. Application/unit/DB/build/general-E2E source remained identical to 76404c4; only this E2E fixture changed.
- Final full `pnpm e2e:acceptance` at 6941ed7: 49/49 passed, exit 0, 10.1m, no skipped. Actual general E2E 31/31, unit 5,325, all-file DB 52 files / 564, secret-boundary 61 artifacts, no-supabase/no-self-service-claim, 15-migration verification and build each exit 0. Per-run SHA, command, exit, completion time/log and preserved failed/incomplete attempts: remediation-evidence/verification-summary.json and final-gates.jsonl. These are local equivalents of retained CI gates; no remote CI for this remediation occurred.
- All 21 tracker rows retain exact historical audit_status and separate implementation_status / hosted_status. T-03/T-13/T-18 local browser verified; T-15 composed fixture and T-20 feature matrix verified; T-17 local three-language mobile/keyboard verified, HK field blocked. T-01/T-04 remain closed baselines. T-16 offline corpus complete/live blocked. T-02/T-05/T-19/T-21 have prepared concrete runbooks/proposals plus achievable read-only/fixture evidence, with missing external prerequisites explicitly retained.
- Latest read-only main and production alias remain d1cbc7bd8a2bc7989c774d15001f7971274bed8d. No push/PR/deployment/production migration/settings/flags/paid providers/mail/publication/restore; cron remains DEC-10 off and new bulk defaults off. Production journal/checksums/first_published_at/privileges unobserved until independently identified read-only DB target is available. Local dev-cache recovery does not establish a framework cold-start fix or hosted stability.
- Rollback: revert remediation/fixture commits in reverse dependency order, preserving user work and legitimate data. Applied 0015 indexes may remain; any removal requires a new forward migration and explicit authority. Prepared hosted rollback plans preserve unknown provider/delivery ledgers and require reconciliation. Final evidence-only commit changes docs/logs/tracker alone; see 2026-10-07-remediation-handoff.md for every task, batch and external blocker.

### Continue / independent whole-branch review and one fix pass

- Fresh reviewer read `d1cbc7bd..c58bc017`: two Important/P2 (T-06/F-04/UC-14 parenthesized wrong-year bypass; T-13/F-10/UC-18 assigned card still Unassigned), no Critical, one cursor-calendar P3; Declined to judge: None. One read-only reviewer only, no implementer delegation or second review. `final-independent-review.md` records the provenance and scope. Ruling: T-12 invalid cursor is in the user's authorized scope, so the P3 receives a minimal calendar guard under the explicit all-unblocked-local-work instruction.
- T-06 RED: expanded actual-import boundary file 10 failed / 29 passed, exit 1. Adjacent prefix/suffix parenthesized years now bind to the boundary, with contradictory explicit years preserved. Unrelated establishment years do not become validity. GREEN: two full offer files 63/63, exit 0; correct same-year, cross-year and full-width Chinese examples covered.
- T-13 RED: actual list function 2 failed / 48 passed, three-language visible-copy 3 failed / 3 passed, real owned DB 1 expected failure (7 cases excluded only by targeted filter), each exit 1. New bounded scalar projection resolves only the matching accepted workspace member; list passes that label to overview. Missing/revoked membership stays assigned with a visible unavailable label, without leaking pending/foreign email or granting membership.
- T-13 GREEN: five selected unit/UI files 126/126, two full DB files 13/13, exit 0. Existing filters, counts, manager scope, CAS and audit transactions retained. Real 1,000-action EXPLAIN: 2 queries / 27 rows / 23,133 bytes including the new label field, matching member lookup Index Scan loops 26. Historical before remains 3 / 16,000 / 26,739,928 bytes. This is local fixture evidence, not hosted latency.
- Preserved DB setup attempt timed out before assertions (`final-review-assignee-db-setup-timeout.txt`). The first GREEN attempt had 12 pass / 1 fixture error `owner_removal_forbidden`; only the synthetic removable member changed to manager, preserving the owner guard; rerun 13/13. No Docker/provider/prod workaround. The owned `.next/dev` cache target and absence of owned Next were verified before removing that regenerable cache alone.
- T-12 RED: three impossible-date decoder cases failed, exit 1. Minimal calendar check rejects JavaScript's normalized impossible day before SQL, retaining the original exact timestamp. Two complete decoder/list files GREEN 68/68, exit 0. Real DB scope test now includes a tampered otherwise scope-matching cursor and must get `invalid_action_cursor` rather than a SQL cast error in the final rerun.
- Named-assignee browser fixture now checks actual apply → refreshed email → assignee filter, stored member and 375px overflow, in addition to keyboard/scope/unknown recovery. Targeted browser/typecheck and fresh final CI-order gates are pending at this ledger point; the earlier all-green source at 76404c4 does not establish a pass for these new changes. No hosted activity or external mutation was authorized or performed.
- Targeted local browser completed: action-list file 3/3, exit 0, 2.9m; actual named member persisted and shown after apply, refresh and filter, with 375px overflow/keyboard and lost-response recovery. Root + all four packages typecheck exit 0. This is local synthetic acceptance; hosted remains unchanged.
- Scoped eslint for all 11 changed source/test files exit 0. Local fix commit follows; rollback is a normal revert of that commit, with no schema/data/flag/provider effect. Fresh all-gate run will bind the exact committed SHA; required gates remain intact and are run sequentially.
