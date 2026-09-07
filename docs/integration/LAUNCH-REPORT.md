# Launch evidence — Tasks 16–17 independently approved; hosted execution not run

**Current checkpoint (2026-09-07): Task 16 technical gates and independent implementation/specification review are approved, including the invitation policy amendment.** Pending workspace invitations remain valid until accepted or explicitly revoked. Managed sign-in links retain expiry and replay protection. Hosted Neon project, branch and origin are not chosen; hosted database/Auth/mail/Google/provider acceptance, migration, deployment and cutover were not run. Task 17 preparation and the owned recovery rehearsal are independently approved after re-review of `9aec5b7674bd52a8ce1e6f485735c78034d2636e`; the source-record and fixture-cleanup findings are resolved. The reviewed source candidate remains `214884c78ba0e4b1cf7e24fbbebca20f459ae1a4`. This is neither merge, deployment nor release approval.

Use only these status values: `passed`, `failed`, `blocked`, `not run`. A pass applies only to the named category on the recorded commit/deployment. Record failed and blocked attempts as separate rows before adding a successful rerun. No credentials, cookies, private payloads or test contact details belong here.

Runtime/origin configuration must include Node version, request origin, expected canonical origin, `APP_ORIGIN`, scan source mode, execution runtime, claim flag, isolated/shared database identity (non-secret), and provider test/live mode as applicable. Use `not applicable` for deployment fields on a local fixture test; do not invent deployment evidence from unit results.

## Task 16 final local technical gate — source `853bdee87031cd1d1b2282969ab1b238c498d147`

All ten commands ran sequentially against the owned local fixture and exited 0. Runtime was Node 24.18.0, pnpm 9.12.0, Docker Linux 29.7.2, Next 16.2.6 with Turbopack, and Vitest 4.1.11. The run used `VITEST_MAX_WORKERS=1`, `NEON_INTEGRATION=1`, and the absolute Task 9 transport-guard `NODE_OPTIONS`. It selected the local production build and owned acceptance fixture; no hosted target or provider was used.

This is worktree evidence, not commit-only or remote-CI evidence. The public worktree proof includes the unstaged, user-owned `e2e/owner-shell.spec.ts` at SHA256 `C34D6BB9BD439AF56AF8EB3A47693170CE8EC4C54FE6A5DBB112C41C545236D4`; that file was not modified, staged or restored by the gate run.

| Exact command | Status | Exact result |
|---|---|---|
| `corepack pnpm typecheck` | passed | Exit 0; root plus four workspace packages passed |
| `corepack pnpm lint` | passed | Exit 0; 0 errors and 30 warnings |
| `corepack pnpm test` | passed | Exit 0; 249 files / 2,394 tests: app 199/1,837, isolated 1/62, region 3/23, scoring 16/183, contracts 3/20, engine 27/269 |
| `corepack pnpm db:verify` | passed | Exit 0; immutable migrations 0001–0004, empty replay, 34 tables / 403 columns / 151 constraints / 84 indexes / 7 triggers / 13 functions, zero seeds |
| `corepack pnpm test:integration` | passed | Exit 0; 21 files / 232 tests |
| `corepack pnpm build` | passed | Exit 0; 26/26 static pages. Dynamic OG font fetch attempts were blocked by `fixture_external_transport_forbidden`; this does not claim remote font success |
| `corepack pnpm e2e` | passed | Exit 0; 27 public production-build tests |
| `corepack pnpm e2e:acceptance` | passed | Exit 0; 18 owned-local acceptance tests |
| `corepack pnpm test:secret-boundary` | passed | Exit 0; 44 public artifacts scanned |
| `corepack pnpm test:no-supabase` | passed | Exit 0; active dependency scanner permits only the separately approved pinned Neon SDK/auth-js transitive relationship |

The isolated fixture proves local PostgreSQL, managed-Auth-shaped handoff, mail and provider-shaped behavior within the transport fence. It does not prove any hosted service. Warnings retained in the successful epoch were 30 lint warnings, a Vite config-loader warning, Playwright `NO_COLOR`/`FORCE_COLOR`, and secret-boundary `DEP0190`. Two test-written snapshots were verified as empty diffs with their HEAD blob IDs before exact-path normalization; the user-owned E2E file remained untouched.

Independent review found the readiness false-positive issue, which was fixed and re-reviewed at this source SHA: readiness now probes the exact application URL separately and rejects invalid, migration-owner or privileged application credentials. The remaining Important finding was a requirement gap for invitation lifetime. **Approved amendment — 2026-09-07:** the [specification](../superpowers/specs/2026-09-06-neon-migration-design.md#authentication-and-authorization) and [Task 7 plan](../superpowers/plans/2026-09-06-neon-migration.md#task-7-membership-invitations-and-merchant-claims) now state that a pending workspace invitation remains valid until accepted or explicitly revoked. Acceptance still requires verified intended-recipient identity, a pending unrevoked membership and transactional acceptance. Managed sign-in links retain provider-enforced expiry and replay rejection; an expired or replayed link is a no-op, and a later fresh link may accept the still-pending invitation. The local acceptance expiry case proves sign-in-link expiry only. No invitation-specific SQL expiry was tested or is claimed, and no arbitrary TTL was added.

Tasks 11–15 are approved and the pinned Neon SDK/auth-js exception is complete. The Task 16 technical gate is passed and **independent final review is approved**, including the readiness fix and explicit invitation-policy amendment; no outstanding Critical/Important findings remain. Hosted project/branch/origin remain **not chosen** and every hosted database/Auth/mail/Google/provider, migration, deployment and cutover action remains **not run**.

## Task 17 local preparation — 2026-09-07

Prepared [Neon cutover and recovery runbook](NEON-CUTOVER.md), configuration source/scope map, immutable migration byte checksums, named-but-unassigned operational roles, bounded proposed acceptance and recovery decisions. Hosted project/region/branch/database/origins/accounts remain NOT CHOSEN. All external operations remain NOT READY / NOT RUN. Task 17 independent re-review approved the bounded fixes at `9aec5b7674bd52a8ce1e6f485735c78034d2636e`.

| Check | Status | Evidence / boundary |
|---|---|---|
| Owned recovery SQL initial rehearsal | passed | New `neon-recovery.integration.test.ts`: 1 file / 1 test, exit 0, 14.43s; Node 24.18.0, pnpm 9.12.0, Vitest 4.1.11, Docker Linux 29.7.2 |
| Intentional data-loss negative control | failed | Expected: deleting only the owned report before drain/restart caused repository equality to fail (null vs saved report), 1 failed, exit 1, 13.40s; temporary deletion removed |
| Final restored recovery SQL rehearsal | passed | 1 file / 1 test, exit 0, 13.71s; original preserving sequence restored |
| Task 17 focused checks | passed | Typecheck app + four packages; scoped recovery-test ESLint; inventory checker; 11 inventory regression tests (1.66s); diff whitespace check, all exit 0 |
| Recovery behavior | passed | Restricted runtime creates new app user, accepted membership and related report; original pool drains/closes; exact owned network-none DB container stops/restarts; same DB reconnect preserves exact repository report data and user relation; subsequent repository write/read passes |
| Hosted rollback / prior deployed build / traffic maintenance | not run | Local restart/reconnect of current repository only; no hosted Neon restore, traffic change, provider/Auth/mail or old-build execution |
| Hosted release readiness | blocked | Target, origin, identities, operators, budget and compatible recovery deployment not chosen; no provisioning/migration/deployment/promotion |

Task 17 parent source is `0da3b65af99c4c7381907b3b5ad97001a5599d6b`. Reviewed source candidate `214884c78ba0e4b1cf7e24fbbebca20f459ae1a4` is the eight-file documentation/env-comment/focused-recovery-test commit; production runtime source remains `853bdee87031cd1d1b2282969ab1b238c498d147`. The earlier all-ten-gate counts above were not rerun for this slice and remain attributed to that runtime source plus the protected owner-shell worktree delta. The protected file remains unstaged with its recorded SHA256; no commit-only or remote-CI claim is made. The closure commit records review/source identity only: it does not select a hosted target, authorize deployment, or supply a deployment ID. Operational evidence belongs in a later separately authorized record/commit.
Review-fix verification: the post-acquisition Docker inspect, identity derivation and pool setup now execute inside the same `try/finally` that calls `fixture.stop()`, so an early setup failure after fixture acquisition reaches owned cleanup. The focused actual-SQL recovery test passed once after this change: **1 file / 1 test**, exit 0, 11.16s (7.92s test time). Root plus all four package typechecks passed; scoped recovery-test ESLint passed with no output; Neon inventory passed; inventory regression passed **1 file / 11 tests**, exit 0. No heavy full gate was rerun, and no new full-gate epoch is claimed.

## Historical pre-Neon acceptance table — not current Task 16 proof

The following table predates the Neon migration checkpoint. It is retained as historical evidence and must not be used as current Neon proof.

| Probe category / case | Status | Commit SHA | Deployment ID | Runtime/origin configuration | Result | Reference |
|---|---|---|---|---|---|---|
| Local fixture and repository gate | passed | Uncommitted changes on 3fae6ef | not applicable | Node 24.18.0, localhost | 2,161 unit/package; 27 public browser; build/typecheck/lint/secret boundary passed | Task 3–6 local verification below |
| Isolated authenticated fixture merchant loop (Task 3) | passed | Uncommitted changes on 3fae6ef | not applicable | Docker Linux 29.7.2; Next dev; localhost; local Auth/SMTP/LLM | 16 passed, no skips, exit 0; 6.6 minutes | Docker follow-up below |
| Isolated workspace completion database proof (Task 4) | passed | Uncommitted changes on 3fae6ef | not applicable | Fresh Docker Postgres 16 + PostgREST | 18 integrations passed; full migration/replay/erasure gate passed | Docker follow-up below |
| Retained-runner caller/receiver parity | not run | Prepared patch on pinned legacy base | not applicable | Forwarding patch unapplied | 20 transport fixtures and apply-check passed earlier; full retained-runner parity remains required | DEPLOY section 8 |
| Schema inventory and compatibility | blocked | 3fae6ef plus local additions | not applicable | Scanner project absent from connected Supabase account | Source checksums prepared; no shared catalog or migration execution | Task 5–6 preparation below |
| Staging public reachability and metadata | not run | to record | to record | to record | Correct expected canonical origin | to record |
| Staging anonymous claim boundary | not run | to record | to record | to record | 404 not_found off; 401 unauthenticated on; 503 fails | to record |
| Staging request/signature rejection | not run | to record | to record | to record | Invalid email, invalid market, unsigned Stripe; 429 blocked | to record |
| Authenticated Google redirect construction | not run | to record | to record | to record | 307/302 to consent endpoint only; not registration proof | to record |
| Google registration, consent, callback and claim | not run | to record | to record | to record | Exact origin and approved test account/business | to record |
| Email delivery and real magic-link redemption | not run | to record | to record | to record | Authorized contact; signed-in callback outcome | to record |
| Signed Stripe test event and entitlement transitions | not run | to record | to record | to record | Endpoint-specific signing secret, retries/idempotency | to record |
| Staging HK successful merchant journey | not run | to record | to record | to record | Successful draft/edit/approve/export and repeat usage | to record |
| Staging TW successful merchant journey | not run | to record | to record | to record | Market/currency retained across locale switches | to record |
| Final-host build, assignment and certificate | not run | to record | to record | to record | Authorized cutover and rollback target recorded | to record |
| Final-host public checks | not run | to record | to record | to record | Exact final origin and deployment | to record |
| Final-host HK/TW authenticated/provider acceptance | not run | to record | to record | to record | Repeat critical paths on the serving build | to record |
| Legacy staff access and retained scheduler observation | not run | to record | to record | to record | Record bounded observation window and workspace outcomes | to record |

## Task 5–6 preparation — 2026-09-05 read-only inventory

**Decision: cutover blocked; release operations not run.** Local Task 3/4 evidence and independent source review now pass below; retained-runner parity and external release verification remain prerequisites. These observations do not establish merchant acceptance.

| Item | Observed result | Limit |
|---|---|---|
| Successor project | `prj_Hbox4o4NhM3p0yxRxmY8Xq1mjtb5`, Next.js, Node 24.x; latest production `dpl_F5Ni6HP1q7CopfzZKqq8xbUCqgNy` READY | Connector `get_project`; not the uncommitted local implementation or exact-main CI proof |
| Successor domains | `smeassistant.vercel.app`, project/team alias and git-main alias | No merchant domain attached in this inventory |
| Legacy project | `prj_zKzNcbLTwlSXbhYTMe59spRQh1BC`, Node 24.x | Latest listed deployment `dpl_FQD4AUpVoEaTCkV8ZQ9yyudfRHjB` has target null; do not use it as a verified production rollback target |
| Current domain owner | Legacy project lists `smescanner.fimmick.com` and `sme-scanner-one.vercel.app` | Project inventory only; certificate, request routing and authenticated staff access not run |
| Schema source | All 28 pinned upstream migrations byte-identical; two workspace additions identified with SHA256 in DEPLOY section 7 | Shared database schema not verified |
| Shared DB access | Connected Supabase project listing exposes only unrelated projects | Blocked; no SQL run against them, no project identity inferred |
| Scheduler source | Pinned upstream worker targets `https://smescanner.fimmick.com`, daily enqueue plus five-minute queue tick | Deployed settings, leases and completion not observed; domain move can affect this target |
| Runtime discrepancy | Repository `.nvmrc` targets 22; local runtime 24.18.0 and Vercel 24.x | Reconcile and record the actual tested final runtime before release |

Prepared [schema queries, migration order and release/rollback worksheet](DEPLOY.md#7-prepared-task-5-schema-comparison-read-only). Required operational input remains: stable isolated staging origin/project; authorized HK/TW businesses and Google account; test contact, provider/LLM budget and Stripe test permission; final configuration/registration scope; verified rollback deployment and rollback authorization. No emails, paid calls, shared migrations, deployments or domain changes were performed for this preparation.

## Task 3–6 local verification — 2026-09-06

Source: `codex/merchant-acceptance-completion`, uncommitted working tree on `3fae6ef020d72ff528a4a9b50b5b013c2c5b1995`. A fresh `git fetch origin main` confirms origin/main is the same SHA; no intervening commits. These results cover local changes, not a deployed commit or remote CI run. Local runtime: Node 24.18.0, pnpm 9.12.0.

| Check | Status | Exact result |
|---|---|---|
| Normal typecheck | passed | Application and all four packages, exit 0 |
| Normal lint | passed | Exit 0; 0 errors, 36 existing warnings |
| First normal unit gate | failed | 3 schema-inventory/deletion-graph tripwires for the new ledger; 1,587 passed |
| Security invariant repair | passed | Ledger added to expected tables and cascading job deletion; 114 security cases passed |
| Normal unit/package rerun | passed | 1,597 application/harness + 62 safe-media + 502 package tests = 2,161 passed, exit 0 |
| Production build | passed | Next.js production build and TypeScript, exit 0 |
| Public browser suite | passed | 27 passed, no skips; local production build |
| Secret boundary | passed | 43 public artifacts; rerun includes WORKSPACE_COMPLETION_SECRET sentinel, exit 0 |
| Acceptance discovery | passed | 16 required cases, separate from public and paid-live suites |
| Earlier acceptance attempts | blocked | 11-case run: 1 setup failure, 10 did not run; 12-case run: 1 setup failure, 11 did not run; Docker unavailable |
| Earlier required acceptance run before Docker recovery | blocked | Exit 1: 1 setup failure (verified assigned-owner Auth claim callback), 15 did not run; Docker Linux engine unavailable; no skipped cases |
| Earlier database integration before Docker recovery | blocked | Exit 1 in global setup: Docker unavailable; 0 cases executed. Vitest also prints “No test files found” after setup failure; independent file discovery found the integration files |
| Legacy forwarding patch | passed | Applies with `git apply --check` to pinned `b9b4151fb89217a926e38f187873b5ff9f10f90f`; 20 extracted fixture transport tests passed; patch unapplied |
| Independent source review | passed | Reported authorization, retry ordering, fence and cleanup findings corrected; runtime SQL/Auth proof subsequently passed in the Docker follow-up below |
| Staging/final release | not run | No providers, mail, shared schema mutation, deployment or domain operation |

Task 3 now has passing real local Auth/mail and HK/TW/role/draft/claim browser proof. Task 4 has passing database races, retry repair, persisted completion and per-write fencing; the [prepared legacy patch](legacy-workspace-completion.patch) remains unapplied and retained-runner parity is still required. Tasks 5/6 have a concrete schema/configuration/cutover/rollback worksheet, not executed launch evidence.

## Docker follow-up — 2026-09-06

Docker Desktop 4.89.0 / Linux Engine 29.7.2 was healthy at inspection; no reset of unrelated containers was needed. All SQL ran only against run-owned throwaway containers. Auth links used local GoTrue and Mailpit, and generation used the local LLM server. The acceptance environment uses a dedicated ordinary bridge with loopback published ports, not an egress-isolated network; paid/shared credentials are scrubbed. `SCAN_FIXTURE=unavailable-ig` pins missing-evidence coverage for both job markets. OTP expiry is explicitly 3600 seconds. This proves local fixture behavior, not real provider availability.

Failed attempts are retained separately from successful reruns:

| Attempt | Status | Result / correction |
|---|---|---|
| First integration after engine recovery | failed | Windows `spawnSync sleep ENOENT` in startup; replaced by awaited Node timer |
| Acceptance service startup and seed | failed | Internal bridge did not expose Mailpit host port; obsolete owner_user_id seed column; corrected bridge and membership-based seed |
| Acceptance Auth/sign-in startup | failed | localhost/127 cookie-origin mismatch, then native pre-hydration form submission; normalized harness origin and disabled initial controls until handlers attach |
| Draft browser attempts | failed | 4 passed, 1 failed, 11 did not run; first lost Generate click before hydration, then inactive history-tab locator; both corrected |
| Expired-link attempt | failed | 13 passed, 1 failed, 2 did not run; two-hour fixture age was within the pinned Auth server's default 24-hour expiry; explicit one-hour harness expiry now matches the case |
| Public-funnel attempts | failed | Full attempt: 14 passed, 1 failed, 1 did not run; focused attempts exposed scan hydration, missing continue_without_place payload flag, extra wizard advance, and double-locale unlock URL; corrected with actual builder-boundary regressions |
| Taiwan missing-evidence attempt | failed | Focused run: 1 passed, 1 failed; default TW fixture had measured IG. Harness now explicitly pins unavailable-ig, preserving job market/locale |
| Migration replay attempt | failed | 2 replay failures: fencing triggers already existed. All five replacements now occur transactionally with drop-if-exists |
| Unit run during browser execution | failed | 1 failed, 1,591 passed; cold route import timed out, retry overlapped mock audit calls |
| Sequential unit run before final test corrections | failed | 2 failed, 1,595 passed; same cold-import timeout plus stale manual payload expectation. Static route import and strict expected payload corrected; assertions/timeouts retained |
| Final database integration | passed | 2 files, 18 tests, exit 0; 89.35 seconds, after fencing migration repair |
| Final migration gate | passed | All 33 migrations applied; replay passes, ownership backfill, cascade/erasure checks passed; exit 0 in a network-disabled disposable Postgres 16 container |
| Final required acceptance | passed | Full matrix: 16 passed, no skips, exit 0; 6.6 minutes |
| Final unit/package gate | passed | 1,597 + 62 + 502 = 2,161 passed, exit 0 |
| Final typecheck/lint/build | passed | App and packages typecheck; lint 0 errors / 36 existing warnings; production build and build TypeScript passed |
| Final production public browser suite | passed | 27 passed, no skips, exit 0; 24.8 seconds |
| Final secret-boundary gate | passed | 43 public artifacts, including completion-secret sentinel; exit 0 |
| Independent review | passed | Runtime, authorization, fixture and regression changes reviewed; no actionable findings. A temporary reviewer usage-limit interruption was resolved by a subsequent completed review |

Owned acceptance and migration containers were removed; unrelated containers/work were preserved. No files were staged, no remote CI/deployment was run, and no shared migrations, paid provider calls, external emails or domain changes occurred. At pre-publication verification, source HEAD and origin/main were `3fae6ef020d72ff528a4a9b50b5b013c2c5b1995`; results cover that working tree. Subsequent commit and remote-CI results belong in the PR record.

Completion migration checksums for review (SHA256 of staged Git blobs with LF line endings; Windows checkout bytes can differ):

- `20260905000000_completion_idempotency.sql`: `8106cc4f0242e7d4f5a0e70aa73e8a34d3817c7c924b5062f69e8171b9529951`
- `20260905000001_workspace_completion_ledger.sql`: `519d13bf0b0347d2b6e4e70414f59c121887a80653339a30ee769a9f89108357`
- `20260905000002_workspace_completion_fencing.sql`: `0cbab1c44984358423da7a006190e37f81462a39a82e1f09604f8f3a3fdf0141`

Next: complete retained-runner caller/receiver parity locally, then review the isolated staging identity, schema inventory and applicable operational authorization. Keep completion disabled. Even flag-off deployment requires the audit idempotency migration. Do not infer a launch go-ahead from the passing local unit/build/public checks.

## Preserved historical notes — not current acceptance evidence

The pre-existing local report below is retained verbatim. Its observations have not been reverified during Task 2. Its opening describes an intended cutover, not a completed one. The old evaluator's `PASS fixture guard` proved only invalid-input rejection, and its Google redirect expectation did not prove registration. Its environment diagnoses and PENDING values remain historical notes; they do not fill the current acceptance table. Recheck current configuration and deployments before operations.

---

# Launch report

Record of the HK + TW cut-over of the SME Scanner Visibility Workspace to `smescanner.fimmick.com`. Plan: `docs/superpowers/plans/2026-09-04-launch-readiness.md`. No secret values appear here; variable names only.

## 1. Vercel settings applied (Task 6)

| Setting | State | Observed |
|---|---|---|
| Deployment protection | Vercel Authentication on for previews only; production open. Password protection and Trusted IPs off. | 2026-09-05, connector `update_project_deployment_protection`; raw production URL and `smeassistant.vercel.app` answer 200 |
| Production deployment from `main` | `dpl_F5Ni6HP1q7CopfzZKqq8xbUCqgNy` READY, target production (PR #3 and #4 merged 2026-09-05) | 2026-09-05 |
| Node.js version | PENDING: still 24.x, plan asks for 22.x | 2026-09-05 |
| Preview environment variables | PENDING | |
| Production environment variables | PENDING | |

## 2. Environment variable names present

PENDING: to be diffed against `.env.example` (48 keys) once set.

## 3. Registrations and probes (Task 7)

Baseline `launch:check` on `https://smeassistant.vercel.app`, 2026-09-05, before any registration or production variable:

```
PASS  locale page zh-HK        200, lang zh-HK
PASS  locale page en           200, lang en
PASS  locale page zh-TW        200, lang zh-TW
FAIL  hreflang alternates      missing zh-HK, en, zh-TW, x-default on https://smeassistant.vercel.app
FAIL  robots.txt               wrong origin or missing disallow
FAIL  sitemap.xml              missing zh-HK, en, zh-TW
PASS  magic-link route         route answers (400 on empty body)
FAIL  google claim start       404 — claim flag off or route missing (expected 302 to Google)
FAIL  stripe webhook unsigned  500 — expected 400
PASS  fixture guard            400 — validation or rate limit answered; nothing queued
```

Reading: the three origin probes fail because `NEXT_PUBLIC_SITE_URL` is unset (the sitemap prints the raw deployment hostname); the claim probe fails because `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` is unset; the Stripe probe answers 500 because `STRIPE_WEBHOOK_SECRET` is unset. Legacy redirect verified: `/owner` → 308 `/zh-HK/owner/select-workspace`.

| Registration | Status | Probe |
|---|---|---|
| Supabase Auth redirect allowlist | PENDING | |
| Google OAuth redirect URIs | PENDING | |
| Stripe webhook endpoints | PENDING | |
| Workspace migrations | PENDING | |

## 4. Smoke tests (Task 8)

PENDING.

## 5. Cut-over

PENDING. Legacy check 2026-09-05: `sme-scanner-one.vercel.app` 200, `smescanner.fimmick.com` 200 (still on `sme-scanner`).

## 6. Open items

- Product decisions locked as assumptions for launch (spec section "Product assumptions").
- Staff console remains on the legacy app at `sme-scanner-one.vercel.app`.
