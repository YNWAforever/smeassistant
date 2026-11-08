# Local WebKit navigation reliability

Repository: `YNWAforever/smeassistant`. Worktree:
`.worktrees/smeassistant-local-seo-completed-state-20261018`.
Branch: `codex/review-action-reliability-20261018`.
Baseline: `4b866045192abc17c4b9924d042d4fa33034957d`.
Dates/times in this report are Hong Kong time unless a receipt uses ISO UTC.

This round repairs the owned local test harness. Application Auth/CORS/session,
membership, draft, approval, delivery and usage implementation is unchanged.
No push, PR, merge, deployment, live merchant mutation, Eldage access, paid
provider call, real email, scheduling or authentication-policy change occurred.

## Reproduction and cause

The original minimum test authenticates normally with a new synthetic fixture
identity, reaches workspace home, performs a real document navigation to an
action, and reloads it. The first run failed with the action navigation
interrupted by another navigation to home.

The new sanitized timeline identifies the sequence:

| Offset | Observed event |
| --- | --- |
| 21,733 / 21,736 ms | Home begins its initial `fix-pack-drafts` reads |
| 21,783 ms | The old helper considers home hydrated/ready |
| 21,789 ms | Full action navigation starts while the dev document is unloading |
| 22,936 ms | WebKit rejects `webpack.hot-update.json` with access-control error |
| 22,949 ms | Next emits `client-full-reload`, interrupting the action |

Auth verification/callback/completion returned 303/307/200 before the failure.
The problem is the Next development compiler/HMR interaction with an unloading
WebKit document, not evidence that membership was refused or CORS should be
relaxed. This is a local development-runtime diagnosis, not a claim that every
WebKit fetch failure or the hosted Neon state-integrity incident shares a cause.

Controls retained:

- Pure owned HTTP streaming/navigation with interception enabled and disabled:
  **2 PASS**. Basic same-origin transport works.
- Fresh native WebKit context, iPhone emulation, normal synthetic login and an
  owned rejecting egress proxy: **FAIL** with the same Next hot-update error.
  Request interception is therefore not necessary for this failure.
- Hydration plus `waitForLoadState("networkidle")`: **2 FAIL**. In the native
  control, home reads finished before navigation, but compiling the cold action
  still triggered HMR in the unloading document. This attempted fix was replaced.

## Small repair

`test/e2e/page-readiness.ts` and the existing fixture now:

1. Observe current GET/HEAD requests and the existing HMR connection across
   client redirects, supplementing hydration and normal DOM assertions.
2. Before a full WebKit document navigation/reload, use the same context's
   normal authenticated GET to compile the target while the current document
   can still receive HMR.
3. Wait for actual read/HMR quiescence (500 ms, bounded at 30 seconds), then
   perform the real browser `goto`/`reload`. No retries or fixed sleeps.
4. Permit preparation only for the factory's bare loopback origin and synthetic
   `acceptance-hk/tw-*` workspace document paths with known read filters.
   Blank/foreign pages, Auth links/callbacks, APIs, other merchants, userinfo
   URLs and unknown query fields are not prepared.
5. Reject a preparation response of 500 or above with sanitized status/path.
   Dispose its body even on failure. Intentional 4xx boundaries remain for the
   actual browser assertions, rather than being called successful acceptance.
6. In the normal fixture sign-in helper, require a visible workspace shell and
   its exact intended workspace home link before retaining the existing URL
   assertion. Each DOM readiness check has a 30-second bound. A cold RSC render
   after a successful completion POST reproduced the old 15-second URL race in
   both engines; neither a successful POST nor a generic shell is sufficient
   proof of access.

HMR remains connected and applies updates. HTTP routing, request/page/hydration
error assertions, server identity verification and ownership/role checks remain
active. No live cookies/tokens are read, exported or transplanted to make login work.
The existing synthetic revoked-session regression retains only its local fake
state in memory; no live session is involved.

Chromium's ordinary navigation behavior is retained; the stronger sign-in
completion checks apply to both engines. The opt-in
`playwright.webkit.config.ts` runs Desktop Safari emulation at 1440x900 plus
Chromium; mobile cases explicitly select their own viewport. A native iPhone
14 emulation control is also tested. These are Playwright emulations, not a
physical phone or actual Safari application.

## RED to GREEN and retained failures

| Evidence | Result |
| --- | --- |
| `red-navigation.log` | 1 FAIL, original action navigation interrupted |
| `http-repro.log` | 2 PASS, independent HTTP controls |
| `native-navigation.log` | 1 FAIL, interception-free Next control |
| `ready-navigation.log` | 2 FAIL, load-state-only hypothesis |
| `red-scope.log` -> `scope-green.log` | 3 FAIL / 10 PASS -> 13 PASS |
| `red-userinfo-scope.log` -> `scope-final.log` | 1 FAIL / 13 PASS -> 14 PASS |
| `prepared-navigation.log` | 2 PASS, no page errors or HMR full reloads |
| `browser-first-attempt.log` | Desktop audit assertion failed because the initial project used a mobile viewport with an intentionally hidden sidebar. Bilingual mobile reload case passed; run then stopped. It is not a completed 64-test result. |
| `browser-final.log` | 64 PASS, exit 0, retries 0, 17.8 minutes |
| `red-server-failure.log` | 1 FAIL / 15 PASS: a preparation 503 was previously concealed |
| `scope-post-review-green.log` | 16 PASS, including failed-read rejection/disposal and preserved 403 behavior |
| `post-review-navigation.log` | Added 503 guard: 4 PASS, exit 0, both engines with fixture and fresh native contexts; before the final sign-in DOM readiness checks |
| `post-review-bilingual.log` | Standalone cold replay: total 180-second test budget exhausted during a GET; 1 FAIL, other engine NOT_RUN; one additional runner error reported |
| `cold-bilingual-300.log` | 300-second total budget: cold sign-in URL readiness race; 1 FAIL, other engine NOT_RUN |
| `cold-bilingual-ready.log` | WebKit 1 PASS (18 reads, zero mutations/errors); Chromium 1 FAIL at the old URL readiness boundary, despite completion POST 200 and workspace GET 200; one additional runner error reported |
| `cold-bilingual-final.log` | Final sign-in readiness in both engines: **2 PASS**, exit 0, 3.6 minutes, retry 0; 18 read checks per engine |
| `unit-final.log` | First full-unit attempt: root group 1 timeout / 5,680 PASS; subsequent safe-media/package commands were NOT_RUN because the script stopped |
| `pack-route-focused.log` | Same unchanged packs route file, 7 PASS, same 5000ms limit, one worker, retry 0 |
| `unit-single-worker.log` | Complete final unit command: 6,268 PASS, exit 0, no assertion/timeout/source change in packs |

The interrupted first broad run's exact container ID, current fixture receipt,
database/ownership labels, network=none and closed Next port were checked before
exact-ID cleanup. See `interrupted-fixture-cleanup.json`. Older resources were
not removed.

An independent review found the preparation-500 issue, which was repaired after
the broad 64-case run. `browser-tested-source.json` preserves that cohort's
fingerprint. The final-source unit, focused navigation, static and build results
below cover the added failure guard; `guard-gates-tested-source.json` binds that
cohort. The last change is the positive sign-in DOM readiness check in
`fixtures.ts`. Its dedicated final cold replay and static results are listed
separately; the earlier 64 cases and full unit/build are not relabelled as fresh
executions of that last delta. `tested-source.json` binds final files.
No test assertion was removed, safety rule relaxed or failure counted as PASS.

## Browser acceptance

In the 64-case cohort, both engines passed the five merchant scenarios, stale-version conflict,
failure/retry, workspace/location/role refusal, exact-version approval/delivery
and synthetic login/replay/expiry/cooldown/limit/logout cases. This cohort
precedes the final sign-in DOM readiness checks.

The final cold replay, after the last helper change, passed in WebKit **26.5**
and Chromium **149.0.7827.55**. For **each engine**, EN -> zh-HK -> EN performs
initial browser document loads and full reloads of action, billing and Completed:

- 18 read checks at **390x844 CSS px**, followed by a wide **1440x900** action read.
- Version 2 content and approval/export/applied history remain readable.
- Exact action/version/approval/delivery/application/audit/usage snapshots are
  unchanged; zero monitored business API writes, page errors, hydration errors,
  request errors or horizontal-overflow cases.
- The local fixture correctly remains **1/3** in period `2026-10`, matching its
  one synthetic approved export. Production's 2/3 is not copied into fixtures.

See `final-cold-replay.json`, `local-webkit-read-only-reload.json` and
`local-chromium-read-only-reload.json`. These receipts and their six local
screenshots come from the final cold replay, replacing the earlier broad-run
copies. Engine/viewport evidence remains separate. Returning-login cases in
the earlier broad cohort also cover 375px zh-HK and 1440px English.

The first broad attempt's viewport mismatch was fixed through an explicit
desktop project default, preserving the original visibility assertion. The
scenario-4 artifact now reports the actual engine/version instead of a hardcoded
Chromium label.

## Production read-only result

The existing authenticated **in-app browser** read the same production action:
`SMEAssistant UAT cb1419df`,
`9c2b8cf3-eee3-4d37-9902-98924205aa4a`.

On 19 October around 02:55-03:00, English and zh-HK action, billing and Completed
were loaded and fully reloaded:

- Applied (reported) / 已套用（店主回報） and
  Wait for the next scan / 等待下次掃描 remain visible in the deployed UI.
- Version 2 approval and export, and the owner-applied audit are retained.
- The same action stays in Completed.
- Usage remains **2/3**, one remaining, period **2026-10**.
- Header/audit/card/usage text is unchanged after each locale's full reload.

See `production-readonly.json` and the `production-*` screenshots. These are
current deployed-UI observations, not independent production SQL evidence and
not proof that this local change was deployed. Only read/navigation/history-tab/
language-selection/scroll actions were used. No approval/export/copy/application
or publication control was invoked, and no live credentials were copied.
Agent-created tabs were closed; user tabs remain.

This is **not hosted Playwright WebKit, a new Google/OTP login, real Safari or a
physical-device acceptance**. No Ready/relogin cycle was started.

## Final verification

| Gate | Command | Final result |
| --- | --- | --- |
| Complete unit | `VITEST_MAX_WORKERS=1 corepack pnpm test` (PowerShell environment assignment) | PASS, exit 0: root 5,681 + safe-media 62 + packages 525 = **6,268** |
| Final status/scope decisions | `corepack pnpm exec vitest run test/e2e/page-readiness.test.ts --retry=0 --maxWorkers=1` | PASS, exit 0, 16 |
| Broad browser | Command below | PASS, exit 0, 64; 32 per engine, retries 0 |
| Added-guard browser regression | `corepack pnpm exec playwright test --config playwright.webkit.config.ts --max-failures=1 --output test-results/webkit-reliability-20261019/post-review-navigation e2e/acceptance/webkit-navigation-regression.spec.ts` | PASS, exit 0, 4 |
| Final cold bilingual replay | Command below, `--timeout=300000 -g 'bilingual completed-page reloads'` | PASS, exit 0, **2**, 3.6 minutes, retries 0; includes the last both-engine sign-in DOM readiness delta |
| TypeScript | `corepack pnpm typecheck` | PASS, exit 0, root and all four packages |
| ESLint | `corepack pnpm lint` | PASS, exit 0, **0 errors / 40 existing warnings** |
| SDK boundary | `corepack pnpm test:no-supabase` | PASS, exit 0 |
| Ownership boundary | `corepack pnpm test:no-self-service-claim` | PASS, exit 0 |
| Webpack and public secret sweep | `node test-results/webkit-reliability-20261019/run-build-boundary.cjs` -> `corepack pnpm test:secret-boundary` -> `corepack pnpm exec next build --webpack` | PASS, exit 0, 34 static pages and **170 public artifacts** |
| Whitespace | `git diff --check` | PASS, exit 0 |

The first full-unit attempt timed out in the existing packs test's first case,
which dynamically imports the route. Inspection recorded 97% CPU load; this is
an observation, not a proof that every timeout was caused by the environment.
The test file's Git blob matches baseline. Its focused 7 tests passed with the
original 5000ms limit and zero retries. The entire command then passed with one
worker, without changing packs, assertions, timeouts or safety rules. See
`unit-timeout-diagnostic.json`; the failed run remains archived.

After the final sign-in helper delta, typecheck, lint and the 16 scope/status
tests were rerun; exact exit codes and times are in `final-static-checks.json`.
The initial sandboxed typecheck command could not start because Corepack's npm
registry lookup failed (`getaddrinfo`). Its log is retained separately; it is
not a TypeScript source failure. The permitted rerun uses the existing package
toolchain without invoking the application or external providers.

Independent review found no remaining P1/P2 findings after the 503 repair.
The complete unit, four navigation cases, typecheck/lint and build ran after
that repair, before the final sign-in DOM readiness delta. The earlier 64-case
source cohort is separately fingerprinted. The final seven source files are
bound by `tested-source.json`; the enclosing local commit SHA is reported in
the handoff. No application/runtime code changed in this round.

Logs in `logs/` are copies with trailing terminal whitespace normalized.
Local fixture credential header lines in failed Playwright request diagnostics
are redacted. Raw logs remain under ignored
`test-results/webkit-reliability-20261019/`. No fixture server log, live
credentials, cookie storage file, OTP or HAR is archived.
`build-runner.cjs.txt` records the build's OS/cache variable allowlist, synthetic
DB/Auth values and external transport guard. The existing package Vite and
build shell-argument deprecation warnings are retained, not suppressed.

Final read-only Docker inventory found **zero running labelled containers and
zero containers dated 19 October**. Eighteen older exited containers were
preserved. See `final-cleanup.json`. Existing untracked `.superpowers/sdd/`
outputs remain outside the local source commit.

The standalone Vitest SQL suite was not rerun because application/repository/
schema code did not change. The browser cases exercise actual owned PostgreSQL
and API read/write/snapshot behavior; their Auth/mail/model providers remain
synthetic. Prior SQL results are not counted as new results in this round.

The 64-case command:

```powershell
$env:NODE_ENV='test'
$env:SME_TEST_WEBPACK='1'
$env:PLAYWRIGHT_BROWSERS_PATH='C:\Users\laich\AppData\Local\ms-playwright'
$env:NODE_OPTIONS='--require=C:/Users/laich/Documents/smescanner/.worktrees/smeassistant-local-seo-completed-state-20261018/test/e2e/transport-guard.cjs'
corepack pnpm exec playwright test --config playwright.webkit.config.ts --max-failures=1 --output test-results/webkit-reliability-20261019/browser-final e2e/acceptance/content-approval-journey.spec.ts e2e/acceptance/audit-delivery-history.spec.ts e2e/acceptance/permissions.spec.ts e2e/acceptance/auth-reliability.spec.ts e2e/acceptance/returning-sign-in.spec.ts e2e/acceptance/webkit-navigation-regression.spec.ts e2e/acceptance/webkit-http-repro.spec.ts
```

The local DB/Auth/mail/model target is the existing owned-fixture factory:
labelled unique Docker DB, no network/published DB port, loopback relay, isolated
child environment and external transport guard. No production DATABASE_URL or
expired hosted branch is a fallback. Model and email outputs are synthetic.

NOT_RUN: hosted WebKit authentication, new hosted Google/OTP boundary testing,
Neon legacy magic-link/state-integrity repair, real AI/provider/email calls,
Safari application/physical phone, production rescan and release operations.
The production IAB result and local fixture passes do not close those items.

The standalone cold replay uses the same browser config plus
`--timeout=300000 -g 'bilingual completed-page reloads'` and only
`audit-delivery-history.spec.ts`. This is an explicit total execution budget
for the complete cold flow, not an extension of OTP/session/rate-limit or
individual request/readiness limits. Retries remain zero and the config's
ordinary per-test budget remains 180 seconds.
