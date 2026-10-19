# Review reply journey reliability

This report belongs to the local branch `codex/review-action-reliability-20261018`.
Product repairs and the isolated Chromium journey have been verified locally.
The full WebKit journey remains unaccepted: hosted authentication is blocked and
local WebKit has an unresolved development-runtime failure. Intermediate PASS
results below do not close either gap. This branch has not been released.

## Source and release baseline

- Repository: `YNWAforever/smeassistant`. The adjacent dirty `smescanner` root is
  unrelated and was not changed.
- Starting worktree: `.worktrees/smeassistant-local-seo-completed-state-20261018`.
- Previous branch HEAD: `c7580c46ebc4c16ba5429cb391bec9e45ff85f95`.
- Refreshed remote main / new branch baseline:
  `94770e3dc36bfbe775f044e2755b62cd2ccfa5d2`.
- The previous HEAD and refreshed main have the same tree:
  `94da05fc53029e423cd4d7e964c983fe797a06fb`.
- PR #90 was rechecked as MERGED, expected feature head `c7580c4`, merge
  `94770e3`. Its existing lifecycle fix was retained.
- A final read-only GitHub main check on 19 October HKT still returned `94770e3`
  and the same tree; see `main-recheck.json`.
- Current production alias was rechecked through Vercel:
  `smeassistant.vercel.app`, deployment
  `dpl_33uanKg72DQCQXpXLPBNCymwHpt9`, READY, production, git source `94770e3`.
- This branch has not been pushed, merged, or deployed.
- Actual local runners: Node 24.18.0, Vitest 4.1.11, Playwright 1.61.1,
  Next 16.2.6, pinned Neon Auth 0.5.0-beta. The existing shared installation's
  Vitest is 4.1.11 although package.json specifies 4.1.7; no dependency manifest,
  lockfile, SDK or installed package was changed in this work.

## Authorized scope

| Layer | Operations |
| --- | --- |
| Production UAT | Read existing action, audit, billing and completed pages only |
| Local code | Minimal fixes, tests, audit evidence and local commit |
| Test writes | Synthetic records in newly owned, labelled Docker databases only |
| Not authorized / not performed | Production merchant or Eldage changes, approval/export/publication in production, paid services, secrets/Auth policy changes, quota changes, scheduling, push/merge/deploy |

## Existing capabilities retained

The existing journey already supports evidence-backed recommendations, confirmed
brand/location facts, editable immutable drafts, compare-and-save concurrency,
exact-version approval, assistant revisions, authenticated role/location checks,
idempotent delivery accounting and append-only history. These were not rebuilt.
Existing onboarding/brand protections and sign-out behavior were not changed.

## Local repairs

1. A continuing finding no longer creates a fresh open action merely because the
   previous one was completed. A linked follow-up requires a pinned comparable
   absent-to-present transition, with a source-complete baseline scan started
   after completion. Same/newer unchanged, incomplete or unavailable sources do
   not establish recurrence. Parent linkage uses the existing evidence JSON.
2. Website checks distinguish an explicitly observed remaining failure from
   missing/partial source evidence. Each result retains its source, checked time
   and comparison in the existing audit. Receipt/stamp writes are atomic,
   workspace-bound and idempotent; stale attempts cannot move the check clock back.
3. Action details display the latest scoped check independently of the general
   activity feed's 200-row limit. Another workspace or location is not evidence.
4. Applied Google reply work explicitly says current sources cannot confirm the
   specific reply, and directs the owner to check it in Google. A website change
   or aggregate response-rate movement is not manufactured into exact-reply proof.
5. An independently verified lifecycle takes precedence over historical version
   approval in the header; the immutable approval record remains visible.
6. Action surfaces describe `Live` capability as feature availability. The
   domain enum and other pages retain their existing capability behavior.
7. Same-tick duplicate export/copy submission uses the existing synchronous
   mutation guard. Production exports were not used to test this.

External change confirmation remains separate from business results. No new
verification connector, channel, model capability, schema, payment feature or
dashboard was introduced.

## Hosted observation and bounded WebKit diagnosis

The authorized UAT is `SMEAssistant UAT cb1419df`, action
`9c2b8cf3-eee3-4d37-9902-98924205aa4a`.

Fresh reads in the existing authenticated **in-app browser** found:

- Version 2 approval, export and owner-applied audit records retained.
- Applied (reported), Wait for the next scan, and completed-list membership.
- Current approved deliveries `2/3`, one remaining, period `2026-10`.

See `production-current-readonly.json` and
`screenshots/production-current-{audit,usage}.png`. These are current production
baseline observations, not local-change deployment evidence and not WebKit PASS.
No production database was independently queried.

At this run's start, the previous Playwright process was no longer available.
One new controlled WebKit window was created: Node PID 33784, one context, one
page, WebKit 26.5, viewport 390 x 664 CSS px. Its direct protected-action request
landed on `/en/owner/sign-in`; no authenticated UAT session was available in that
context. See `screenshots/controlled-webkit-sign-in.png`.

The app origin and target action are confirmed. The app Auth proxy is `/api/auth`.
The upstream Neon Auth origin was observed in the earlier redacted diagnostic;
no new provider initialization/callback was replayed to refresh that evidence.
The user was given this single window's redacted recognition image. There is no
repeated Ready/sign-in/refresh loop, no cookie/token transfer or export, no HAR,
and no security policy change.

Authenticated production WebKit navigation/reload/locale switching: **BLOCKED /
NOT_RUN**, unless a later receipt in this audit explicitly supersedes this entry.
Real Safari and physical devices: **NOT_RUN**, outside this round.
The previous English/Chinese offline DOM/CSS snapshot checks remain historical.

## Reproduction evidence

Logs are under `test-results/review-action-reliability-20261018/`.

| Evidence | Result |
| --- | --- |
| `red-focused.log` | 8 failed / 126 passed; missing source distinction, receipts, exact-review limitation and capability wording |
| `red-verification-ui.log` | 6 failed / 2 passed, 96 intentionally filtered tests |
| `red-completion-link.log` | 2 failed; verified lifecycle incorrectly read Approved, missing predecessor link |
| `red-double-click-export.log` | 1 failed; two same-tick clicks issued two mock requests |
| `red-receipt-read-limit.log` | 1 failed; newer unrelated audit returned instead of persisted verification |
| Recurrence agent RED | 13 failed / 1 passed, then additional source-completeness RED 2 failed / 18 passed |
| `green-focused.log` | Intermediate 204/204 PASS before the later read-limit and click repairs |
| `integration-focused.log` | Intermediate 76/76 PASS before the later read-limit repair |
| `unit-full.log` | First broad run: 6 failed / 5658 passed; all six were caused by initially changing the default shared Live label. Repair narrowed the wording to action context instead of deleting assertions. |
| `integration-final.log` | 57 files / 635 tests PASS, exit 0, owned PostgreSQL only |
| `typecheck.log` | Initial FAIL: unsupported RTL option and ES2017-incompatible test regexp flag; both corrected |
| `typecheck-final.log` | Root and all four workspace packages PASS, exit 0 |
| `lint-final.log` | Exit 0, zero errors, 40 remaining warnings; no warnings were suppressed |
| `no-supabase.log`, `no-self-service-claim.log` | Both PASS, exit 0; SDK boundary and disabled self-service claim retained |
| `browser-regression.log` | Chromium 17 PASS; first three WebKit cases FAIL with document navigation interrupted by a home navigation. Remaining WebKit run interrupted, not counted PASS. |
| `webkit-helper-regression.log` | DOM/hydration wait alone did not fix the race: 3/3 WebKit FAIL. This is a failed hypothesis, not a fix. |
| `webkit-navigation-diagnostic.log` | One diagnostic FAIL with sanitized request/response/frame timeline. Home DOM was already committed and hydrated before the action navigation was interrupted. |
| `unit-final.log` | Full command PASS, exit 0: root 5,665, safe-media 62, workspace packages 525; total 6,252. Existing package Vite future-configuration warnings retained. |
| `webkit-prewarm-diagnostic.log` | Readiness setup FAIL: normal completion rejected a missing Origin header. The existing same-origin guard was not changed. |
| `webkit-prewarm-origin-diagnostic.log` | Authenticated API warmup reached eight expected protected pages, but the browser action navigation still failed. Prewarm was not retained. |
| `webkit-hmr-diagnostic.log` | FAIL: a WebKit dev-fetch error preceded `client-full-reload`; `hadRuntimeError=false`, first stack line `Load failed`. Underlying fetch cause remains unknown. |
| `webkit-fixed-source-diagnostic.log` | FAIL: inert exact-local HMR interception moved the failure to sign-in completion hydration. No successful action journey was reached; this change was reverted. |
| `browser-chromium-final.log` | 28 PASS, exit 0, retries 0: merchant scenarios, bilingual read-only reload, role/tenant boundaries, synthetic OTP/replay/expiry/cooldown/limits, logout and legacy error recovery. |

The interrupted first WebKit run left one local fixture container. Its full
container ID, database/name/ownership labels, network=none, current-run receipt
and closed app port were checked before exact-ID cleanup. See
`interrupted-fixture-cleanup.json`; no other container or data was removed.

The WebKit diagnostic correlates extra home document requests with Next
development-mode **Fast Refresh full reload**. No Refresh response header was
present. This proves the immediate reload mechanism, not the underlying fetch
failure's cause. See `local-webkit-hmr-failure.json`.

Three hypotheses were tested without adding retries: waiting for committed DOM,
authenticated route prewarm, and isolating only the owned HMR WebSocket. None
passed. The last attempt committed an HTTP 200 completion page but did not
hydrate within 30 seconds; it stopped before workspace/action access. See
`local-webkit-hmr-isolation-failure.json`, `navigation-probe.spec.ts.txt` and
`rejected-fixed-source-fixture.diff.txt`. All attempted harness changes and the
throwaway probe were removed from executable source. No Auth guard or policy was
weakened. Local WebKit execution is **FAIL**, attribution between application
and fixture/runtime remains **UNKNOWN**, and the intended journey beyond the
blocked boundary is **NOT_RUN**. No fourth speculative repair was retained.

Initial sandbox/Corepack cache failures occurred before test execution. They
are tooling failures, not behavioral RED or product acceptance. The pinned
package manager was made available through the supported escalated command;
test processes retain the project's external transport guard.

## Isolation

Docker 29.8.1 and the pre-existing PostgreSQL 16 fixture image were checked.
The existing harness creates a unique `sme_neon_it_*` database in a newly
labelled `sme-neon-it-db-*` container, `--pull=never`, `--network none`, no
published DB port. A loopback Docker-exec relay is the only connection path.
Ownership/database labels and exact container ID gate cleanup.

The integration setup replaces the connection with its own fixture and removes
the inherited unpooled target. Acceptance rejects ordinary local env files,
constructs an allowlisted child environment, and uses local Auth/mail/model
fixtures. Node/browser transport guards reject external requests. No expired
Neon test branch, production DATABASE_URL or paid provider is a fallback.

Synthetic verified-email fixtures do not establish real email delivery. A local
fixture session does not establish real Google/OTP behavior. Fixture model
responses do not establish real AI acceptance.

## Final gates

The original product/SQL source fingerprint is preserved separately from the
final delivery fingerprint. All product and SQL source/test files in that
snapshot remain byte-identical; subsequent work changed only the browser
regression helper use and diagnostics/reporting. The unsuccessful fixture
changes were reverted.

Independent static follow-up review found no remaining P1/P2 product issue after
the scoped receipt read repair. The WebKit execution failure is retained as a
release/acceptance limitation, not waived by that review.

The final static/build receipts are complete below. `tested-source.json` lists
the final 26 changed source files and SHA-256 values; `product-sql-gates-source.json`
preserves the earlier product/SQL gate fingerprint. The enclosing Git commit is
the local delivery revision; its SHA is reported in the handoff, avoiding a
self-referencing commit hash in this file.

### Commands and final results

Run from the worktree at the top of this report. `logs/` contains text copies,
including failures, with trailing terminal whitespace normalized. Original raw
logs remain under the ignored `test-results/` directory. No fixture server log,
live Auth link, credential/session material or HAR is archived. Unit/browser Node processes used the local
`test/e2e/transport-guard.cjs`. Browser contexts also reject non-loopback requests.

| Command / retained runner | Exit | Outcome |
| --- | --- | --- |
| `corepack pnpm test` with `NODE_ENV=test`, `VITEST_MAX_WORKERS=2` | 0 | PASS 6,252; `logs/unit-final.log` |
| Full Vitest integration runner, `--config vitest.integration.config.ts` (entry point `corepack pnpm test:integration`) | 0 | Retained earlier continuation execution: 57 files / 635 PASS; `logs/integration-final.log`. All product and SQL source/test fingerprints unchanged since that gate; not rerun after browser-only diagnostics. |
| `corepack pnpm exec playwright test --config test-results/review-action-reliability-20261018/playwright-local.config.cjs --project=chromium e2e/acceptance/content-approval-journey.spec.ts e2e/acceptance/audit-delivery-history.spec.ts e2e/acceptance/permissions.spec.ts e2e/acceptance/auth-reliability.spec.ts e2e/acceptance/returning-sign-in.spec.ts` | 0 | PASS 28, retries 0, 6.5 minutes; `logs/browser-chromium-final.log` |
| `corepack pnpm typecheck` | 0 | PASS root and all four packages; `logs/typecheck-delivery.log` |
| `corepack pnpm lint` | 0 | PASS, 0 errors / 40 warnings; `logs/lint-delivery.log` |
| `corepack pnpm test:no-supabase` | 0 | PASS pinned Neon transitive boundary; `logs/no-supabase-delivery.log` |
| `corepack pnpm test:no-self-service-claim` | 0 | PASS; `logs/no-self-service-claim-delivery.log` |
| `node test-results/review-action-reliability-20261018/run-build-boundary.cjs` -> `corepack pnpm test:secret-boundary` -> `corepack pnpm exec next build --webpack` | 0 | PASS optimized Webpack compile, TypeScript, 34 static pages and secret sweep of 170 public artifacts; `logs/build-secret-boundary-final.log` |
| Local WebKit probe, first normal / DOM-wait / prewarm / inert-HMR attempts | 1 | FAIL; preserved diagnostics and logs. No successful workaround retained. |
| `git diff --check` | 0 | PASS |

The archived `browser-config.cjs.txt` has Chromium and iPhone-viewport WebKit
projects. Final Chromium invocation selects only Chromium; it does not silently
skip WebKit inside a claimed full green run. `SME_TEST_WEBPACK=1` selects the
existing local shared-dependency bundler option. `SME_TEST_PREWARM` and
`SME_TEST_FIXED_SOURCE` experiments are not part of final executable source.

`build-runner.cjs.txt` documents the exact build wrapper: reject ordinary env
files, allowlist only OS/cache variables, use synthetic local database/Auth
values, retain the external transport guard, and run the existing secret scanner.
No ambient production database/Auth/model credentials are copied. The build's
existing shell-argument deprecation warning was retained, not hidden.

Final Docker readback found the latest recorded fixture absent, with no
container created during this 18/19 October run remaining in the labelled
inventory. Eighteen **older exited** containers (created 11 September through
17 October) were preserved because their labels alone are not cleanup authority.
See `final-fixture-cleanup.json`. Existing untracked `.superpowers/sdd/` acceptance
outputs were also retained and are not part of the delivery source commit.

## Final merchant acceptance matrix

All rows below use the owned local PostgreSQL, synthetic Auth and model fixtures.
They do not assert live Google, real email delivery, real AI or human draft quality.

| Scenario | Result and evidence |
| --- | --- |
| Existing brand: recommendation -> editable saved reply -> manual approval | PASS; S1 uses source/time/limits and the saved brand revision. Manual edits require a new exact-version approval. |
| Incomplete facts | PASS; required review input blocks the model, invented operating facts are withheld, safe omission saves. |
| Selected branch | PASS; other-branch and imported address facts excluded; correct location survives reload. |
| Shorten, tone and CTA; fresh session | PASS; five saved versions, exact final body read after an independent synthetic login; only explicitly approved version is approved. |
| Old tab, provider failure and retry | PASS; stale text preserved for comparison, explicit rebase, stale approval refused, invalid output retains saved version, explicit retry creates a new version. |
| Failed assistant save / lost generation response | PASS; retryable preview retained, read-back reconciles the existing draft instead of generating again. |
| Cross-workspace / location / role | PASS in Chromium and SQL fixtures; spoofed/omitted context, non-approver and revoked access refuse authority. |
| Approved V1 -> saved draft V2 -> V2 export | PASS in actual isolated SQL; `not_approved`, old approval preserved, exact usage/delivery/audit snapshot unchanged. |
| Same-tick delivery click / repeated delivery | PASS in component and SQL/browser fixtures respectively; synchronous submission guard and existing exact-version delivery accounting retained. |
| Applied, verified, not yet observed, unavailable source | PASS in unit/SQL fixtures; receipts persist source/time and do not conflate fetch failure with owner non-application. |
| Completion and recurrence | PASS in unit/SQL fixtures; unchanged/incomplete scans preserve completion; only pinned comparable absent-to-present evidence creates one linked follow-up. |
| EN -> zh-HK -> EN; action/billing/Completed first load + reload | PASS; 18 mobile read checks, zero mutations/page/hydration/request errors/overflow; exact action/version/approval/delivery/application/audit/usage snapshots unchanged. |
| Hosted authenticated WebKit | BLOCKED / NOT_RUN; single controlled sign-in boundary described above. |
| Local WebKit intended action journey | FAIL at runtime/navigation boundary; downstream complete journey NOT_RUN. |
| Real Safari, physical phone, real providers, paid model, production rescan | NOT_RUN. |

See `scenarios/scenario-1..5.json` and `chromium-read-only-reload-result.json`.
S1 measured **5,787 ms** from automated fixture operations to first saved draft.
This is not a human five-minute usability acceptance. New human content review
and real model acceptance were not run in this round.

Chromium was `149.0.7827.55`; the full read-only matrix used **390 x 844 CSS px**,
then a **1440 x 900 CSS px** action read. Returning sign-in additionally covered
375-px zh-HK and 1440-px English. These are browser viewports, not physical
devices. The production observation screenshot and the local fixture screenshots
are labelled separately under `screenshots/`.

The fixture's period is `2026-10` with **1/3** because it exported one approved
version exactly once before read-only validation. Production's separately
observed **2/3** was not copied into fixture data and was not changed.

## Remaining limits and next smallest real UAT

- Exact Google review reply verification has no supported source in the current
  website verifier. The UI retains owner-reported/pending verification.
- Recurrence requires explicit comparable measured source evidence. Unknown
  source mappings or incomplete data suppress a new task instead of guessing.
- Normal hosted Google/OTP/session tests remain separate from synthetic Auth.
- This round's synthetic OTP wrong/expired/replayed-code, resend rotation,
  cooldown/limits and logout/session tests passed in Chromium. These do not
  verify the hosted Neon configuration or actual email delivery.
- Hosted legacy magic-link reliability and the Neon gateway state-integrity
  issue remain unverified; local invalid-code alternative-navigation tests are
  not a hosted magic-link success.
- Real provider failure/retry, real AI, real email, OAuth ownership changes,
  physical Safari/mobile and production rescans were not performed.

The next smallest step is a bounded decision on the local WebKit test runtime,
using the retained fetch/navigation/hydration diagnosis rather than another
login attempt or weakened Auth. The current synthetic-identity production-mode
guard stays intact; changing that architecture is not part of this delivery.
After a supported controlled WebKit context is demonstrably available, real UAT
is limited to the same existing action: normal login, identity/workspace
confirmation, EN/zh-HK action/billing/completed reads, full reloads and language
picker. Compare the actual current usage/period without approval/export/rescan
or publication. Stop after one diagnostic if blocked.

No release readiness is claimed. Push, merge, deployment, production writes,
paid/provider operations and any authentication-policy change require fresh
explicit authorization. A later approved release can roll back to main and
production `94770e3`; this local change has no migration or quota mutation to undo.
