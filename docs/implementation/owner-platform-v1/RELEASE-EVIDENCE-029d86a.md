# Owner platform v1 (Phases 1–4 core + P4.5 + P4.6): release evidence for main `029d86a`

This is the evidence pack for `main` at `029d86a`. It follows [`RELEASE-EVIDENCE-TEMPLATE.md`](RELEASE-EVIDENCE-TEMPLATE.md) and is a **delta on [`RELEASE-EVIDENCE-080ddf6.md`](RELEASE-EVIDENCE-080ddf6.md)**.
- Rows that did not change since `080ddf6` point to that pack instead of repeating it.
- Every result recorded here was produced for this candidate.
- Status values are `passed`, `failed`, `blocked` and `not run` only.

**Bottom line.** Implemented and CI-verified: push run attempt 2 passed; attempt 1 failed on an unfixed flake.

Locally on Windows:
- Every other gate passed in its normal form; `e2e` passed, run on port 3197 through temporary config copies.
- `e2e:acceptance` **failed**: 3 of 42 tests. Those 3 passed when re-run alone.

**Hosted verification is not complete.** The only hosted facts recorded are:
- read-only Vercel observations;
- migrations the owner reported applying.

This is **not** ready to claim a verified release.

## 1. Candidate and scope

| Field | Value |
|---|---|
| Phase / owner outcome | owner-platform-v1 Phases 1–4 core, plus the conditional P4.5 preview and P4.6 publishing connector. Both are built and **off**. Outcomes per `MASTER-IMPLEMENTATION-PLAN.md` §3. |
| Candidate commit / branch | `main` at `029d86ac559f209c62f034e7797f04ae56d41879`, the merge of PR #36 (`fix-funnel-dev-navigation`, head `445c3d3`). |
| Working-tree state | Evidence was written in worktree `rel-029d86a` (branch `release-evidence-029d86a`, from `029d86a`). The gate runs used that tree with no uncommitted product changes. The e2e port copies (§3) were temporary and removed. |
| Base commit and delta since the last pack | `080ddf6..029d86a`: 31 commits, 82 files changed, +10,606 / −166. First-parent merges: PR #32 (`cef0a4d`, evidence pack), #33 (`f1d59fa`, cron removal), #34 (`d880e2c`, P4.6), #35 (`577c9d3`, Windows build fix), #36 (`029d86a`, funnel test fix). |
| Runtime / package manager / lockfile | Unchanged: Node from `.nvmrc` = `24` (local v24.18.0), `corepack pnpm` 9.12.0, frozen `pnpm-lock.yaml`. **New:** a repo `.npmrc` with `virtual-store-dir-max-length=60` (PR #35). It changes only pnpm's store folder names; the lockfile is unchanged. |
| Test database fixture identity | Unchanged: owned, disposable Docker `postgres:16` per `db:verify`, integration and acceptance run. Never a shared or hosted database. |
| Hosted environment / immutable origin | Vercel project `smeassistant` (`prj_Hbox4o4NhM3p0yxRxmY8Xq1mjtb5`, team `ynwaforevers-projects`). Production alias `smeassistant.vercel.app`. |
| Deployment ID / source commit | `dpl_51eqbSJz9sdiy8vD2ACxbj89ucWQ`, READY, target production, branch `main`, commit `029d86a`, created 2026-10-04T19:46:22Z; it is the current production deployment. Earlier production deployments in this delta: `dpl_53ZY…` (`577c9d3`), `dpl_GLyW…` (`d880e2c`), `dpl_8dNy…` (`f1d59fa`), `dpl_DHV3…` (`cef0a4d`). |
| Production alias | `smeassistant.vercel.app`; `main` auto-deploys (unchanged). |
| Authorization record and budget | **None for hosted acceptance** (unchanged). No DEC-04 budget is recorded. |
| New/changed feature flags; actual state | **New:** `GBP_REPLY_PUBLISH_ENABLED` (P4.6), on only when exactly `"true"`. It was not re-read in Vercel for this pack. The code path is off unless it is set; that it is unset is **owner-reported, not verified**. The other four Phase 4 flags were last read off in the 2026-10-04 names inventory at `080ddf6` (`dpl_E2HN…`). They were not re-read for `dpl_51eq…`. |
| Migration state (owner-reported, not verified by the writer) | `0013`: applied on the Neon test branch and production on 2026-10-04 (owner-reported). `0014_publish_reply.sql`: applied with [`rollout/apply-0014.sql`](rollout/apply-0014.sql) on the Neon test branch, then production, on 2026-10-05. The owner reported "all checks pass": journal row 14 `e2c181b7…`, 5 columns, 4 SECURITY INVOKER functions, 2 indexes, 0 publish deliveries. Some older records still describe `0014` as never applied to a hosted database (`IMPLEMENTATION-TRACEABILITY.md` P4.6 row, `PHASE-4-TEST-RESULTS.md` P4.6). They are historical: they were true when written, before the owner's applies. |
| Implemented scope | Phases 1–4 core, P4.5 and P4.6. See §2. |
| Explicitly deferred/conditional scope | P4.5 and P4.6 are built and off. Turning P4.6 on needs Google Business Profile API access for the GCP project and a separate release approval (checklist §22). |

## 2. Current implementation findings (delta since `080ddf6`)

| Source ID / requirement | Status | Files changed | Regression evidence | Remaining limitation |
|---|---|---|---|---|
| P1.1–P4.5 | present (no change since the 080ddf6 pack; this pack records deltas only) | — | 080ddf6 pack §2; the gates in §3 re-ran them all | As recorded there. |
| P3.1 scheduler registration (DEC-10) | changed | PR #33 `b50d406`: `vercel.json` (cron entry removed), `tests/cron-registration.test.ts` (asserts no cron), `docs/integration/DEPLOY.md` | `tests/cron-registration.test.ts`; production runtime logs (§6) | The scheduler is off by DEC-10 default. Re-enabling needs a recorded DEC-10 decision and a valid `CRON_SECRET`. |
| P4.6 single publishing connector (DEC-13/14) | changed | PR #34: `neon/migrations/0014_publish_reply.sql`, `rollout/apply-0014.sql`, `lib/oauth/google-reviews.ts`, `lib/publishing/*`, `lib/repositories/publishing.ts`, publish/targets/reconcile/reply routes, `components/workspace/gbp-publish-card.tsx` | `test/integration/neon-publish-reply.integration.test.ts`, `neon-publish-flag-off.integration.test.ts` (flag-off path on a 0013 schema), `lib/workspace/publish-sql.test.ts`, route and card tests (`PHASE-4-REPORT.md` P4.6) | Off. No Google call has been made from any environment. Open product question: a reply that is published but never exported earns no Attributed measurement. |
| Local Windows gates (engineering) | changed | PR #35: `.npmrc`, `tests/npmrc-store-length.test.ts`, `README.md` | `tests/npmrc-store-length.test.ts`; §3 (`build` and `test:secret-boundary` now run in their normal form locally) | Existing local checkouts need one `corepack pnpm install` (accept the purge). |
| Acceptance stability (engineering) | changed | PR #36: `e2e/acceptance/public-funnel.spec.ts` | 20/20 local repeats; every fallback forced 2/2 (PR #36) | The spec no longer proves the in-app redirect under `next dev`; a `dev-navigation-fallback` annotation records each use. |

## 3. Offline gate results

**On CI** (ubuntu, the GitHub `verify` job; workflow steps listed in "Inventory reconciliation" below):
- **PR #36, head `445c3d3`, run 37228507276 (`pull_request`):** passed.
- **Push run on `029d86a`, run 37229545186:**
  - **Attempt 1 failed** `e2e:acceptance`, with 41 passed and 1 failed: `merchant-loop.spec.ts:54` "missing LLM output…", `apiRequestContext.post: read ECONNRESET`.
  - **Attempt 2,** a re-run of the failed job, **passed**.
- **This flake is not fixed** (see §9). The same test also failed attempt 1 on `080ddf6`, `cef0a4d` and `f1d59fa`.

**Local** (Windows 11, Node v24.18.0, worktree `rel-029d86a` at `029d86a`, Docker Desktop running, sequential).
- **Environment:** `VITEST_MAX_WORKERS=1` was set by the runner script. No other variables were set; no `.env` files are present.
- **Integration enablement:** `vitest.integration.config.ts` sets `NEON_INTEGRATION=1` itself.
- **Acceptance environment:** acceptance builds its own isolated environment (`test/e2e/safety.ts` `isolatedEnv`):
  - `SCAN_SOURCES=fixture`;
  - an owned fixture database;
  - local identity and LLM servers;
  - `OFFER_PROMOTIONS_ENABLED`, `WORK_PACKS_ENABLED`, `CONTEXTUAL_ASSISTANT_ENABLED` and `PREVIEW_DRAFT_ENABLED` set to `true`;
  - `GBP_REPLY_PUBLISH_ENABLED` unset.
- **Logs:** in the session scratchpad directory `gates-029d86a/`, kept outside the repository and not committed.

| Actual command | Status | Exit / counts / skips | Runtime / candidate | Log | Notes |
|---|---|---|---|---|---|
| `corepack pnpm typecheck` | passed | exit 0 | 57 s, `029d86a` | `typecheck.log` | |
| `corepack pnpm lint` | passed | exit 0; 0 errors, 38 warnings | 84 s | `lint.log` | Warnings only. |
| `corepack pnpm test` | passed | exit 0; app 365 files / 4,435 tests; `safe-media` 1 / 62; packages region 3 / 23, scoring 16 / 183, contracts 3 / 20, scan-engine 28 / 299 | 583 s | `test.log` | With `VITEST_MAX_WORKERS=1` (as CI) there were no load timeouts. |
| `corepack pnpm test:no-supabase` | passed | exit code not captured; output shows success | — | `no-supabase.log` | "No forbidden retired transport references; only the approved pinned Neon transitive library is permitted" |
| `corepack pnpm test:no-self-service-claim` | passed | exit code not captured; output shows success | — | `no-ssc.log` | "OWNER_SELF_SERVICE_CLAIM is not enabled." |
| `corepack pnpm test:secret-boundary` | passed | exit 0; "Secret boundary passed across 61 public artifacts." | 64 s | `secret-boundary.log` | **Literal**, no `--webpack` (blocked locally before PR #35). |
| `corepack pnpm db:verify` | passed | exit 0; `0001`–`0014` applied, replay `[]`; 41 tables, 491 columns, 204 constraints, 108 indexes, 8 triggers, 23 functions, 0 seeded rows | 6 s | `db-verify.log` | Owned disposable `postgres:16`. |
| `corepack pnpm test:integration` | passed | exit 0; 49 files / 537 tests | 438 s | `test-integration.log` | Owned fixtures; Docker running. |
| `corepack pnpm build` | passed | exit 0; Next.js 16.2.6 (Turbopack), "Compiled successfully" | 54 s | `build.log` | **Literal** (blocked locally before PR #35). |
| `corepack pnpm exec playwright test --config playwright.port3197.tmp.config.ts` (in place of `corepack pnpm e2e`) | passed | exit 0; 31 passed | 113 s | `e2e-port3197.log` | **Not the literal command.** It runs the same suite and specs, on port 3197, through temporary copies of `playwright.config.ts` and `test/e2e/public-setup.ts` with `3100` replaced by `3197`. Another project's server holds 3100 on this machine. The copies were deleted afterwards. |
| `corepack pnpm e2e:acceptance` | failed | exit 1; 39 passed, 3 failed | 1,107 s | `e2e-acceptance.log` | See below. |
| `corepack pnpm exec playwright test --config playwright.acceptance.config.ts e2e/acceptance/claim-and-market.spec.ts:34 e2e/acceptance/offer-promotion.spec.ts:22 e2e/acceptance/permissions.spec.ts:4` (the 3 failed tests, re-run alone) | passed | 4 passed (`permissions.spec.ts:4` covers viewer and manager); exit 0 reported by the shell, not written to the log | 2.9 min | `acceptance-rerun3.log` | |

**The three local acceptance failures:**
- `claim-and-market.spec.ts:34` and `permissions.spec.ts:4` (viewer) stayed on `/en/owner/sign-in/complete`.
- `offer-promotion.spec.ts:22` did not see "已確認" (confirmed) on the offer card.

All three follow a client-side redirect or refresh. This is **likely** the `next dev` navigation race diagnosed in PR #36 for `public-funnel`, but that is an inference: no trace was examined for these three. All passed when re-run alone, and all passed in CI attempt 2 on this commit. They are recorded as **flaky or unexplained, not fixed**.

**Inventory reconciliation.** The CI `verify` job runs, in order:
- install and lint;
- typecheck and unit;
- secret-boundary, no-supabase and no-self-service-claim;
- `docker pull postgres:16`, `db:verify` and integration;
- build, then the Playwright browser install;
- `e2e`, then `e2e:acceptance`.

`build` runs as a separate step; `test:secret-boundary` also builds its own sentinel bundle.

## 4. New regression evidence

The 13 families are as in the 080ddf6 pack §4.
- **CI:** all green in push run 37229545186, attempt 2.
- **Elsewhere:** see §3 for the attempt-1 failure (`merchant-loop`, Saved-draft family) and the local acceptance failures (Auth/claim, Billing/allowance and Phase 4 families), which passed when re-run alone.

New since then:

| Family | Exact test(s) | Status | Failure / skip / blocker | Evidence |
|---|---|---|---|---|
| Phase 4 conditional scope: P4.6 publishing | `neon-publish-reply.integration.test.ts`:<br>– DEC-14 once-per-version matrix<br>– races and active-publish indexes<br>– INVOKER and grants<br><br>`neon-publish-flag-off.integration.test.ts` (no 0014 column read on a 0013 schema)<br><br>`lib/workspace/publish-sql.test.ts` (`export_output_version` change pinned)<br><br>`lib/oauth/google-reviews.test.ts`<br><br>`lib/publishing/*.test.ts`<br><br>`app/api/versions/[versionId]/publish/publish.test.ts`<br><br>`app/api/deliveries/[deliveryId]/deliveries.test.ts`<br><br>`components/workspace/gbp-publish-card.test.tsx` | passed | — | §3 unit and integration runs |
| Durable lifecycle/scheduling: no hosted cron | `tests/cron-registration.test.ts` | passed | — | §3 unit run; §6 runtime logs |
| Local Windows build tooling | `tests/npmrc-store-length.test.ts` | passed | — | §3 unit run |

## 5. Hosted acceptance

The candidate deployment for every row is `dpl_51eqbSJz9sdiy8vD2ACxbj89ucWQ` (`029d86a`). The runbook is [`HOSTED-ACCEPTANCE-CHECKLIST.md`](HOSTED-ACCEPTANCE-CHECKLIST.md).

| Scenario | Authorized scope/reference | Status | Candidate deployment | Safe entity/receipt IDs | Evidence and limitation |
|---|---|---|---|---|---|
| R2 environment inventory | Not re-read for this pack (reading Vercel environment variables returns stored values). | not run | — | — | The last names-only inventory is in the 080ddf6 pack, read 2026-10-04 at `080ddf6`. It flagged `BLOB_READ_WRITE_TOKEN` and `NEON_AUTH_BASE_URL` as `readable-secret`; whether they were re-saved as Sensitive is not verified. |
| Migration journal `0001`–`0014` | DEC-11 owner actions, with **no recorded DEC-11 authorization** (the "Acceptance authorization record" in `BUSINESS-AND-HOSTED-DECISIONS.md` is blank); checklist §2 | not run | — | — | The applies are **owner-reported** (§1). The independent read-only journal check has not been run. |
| Phase 3 actual scheduled/resumed work | DEC-10 default; checklist §20 Path A | not run | `dpl_51eqbSJz9sdiy8vD2ACxbj89ucWQ` (cron removed since `dpl_8dNy…`) | — | **Scheduler off by DEC-10.** The cron entry was removed (#33). Read-only runtime logs (§6) show no `/api/cron/dispatch` invocations from 16:35:26 UTC until at least 20:11 UTC on 2026-10-04. The Vercel → Cron Jobs listing (§20 Path A step 2) was **not checked**. |
| Conditional preview/connector acceptance (P4.5, P4.6) | Separate approvals; P4.6 also needs Google API access (checklist §17, §22) | not run | — | — | Flags not re-read for this deployment (§1). |
| R3–R8, R10, R11, Hosted Blob, Phase 2–4 rows, `launch:check` | No acceptance authorization or DEC-04 budget recorded | not run | — | — | Unchanged from the 080ddf6 pack. |

## 6. Read-only manual observations

All observations below were made read-only on 2026-10-04 by the controller. The deployment and cron observations came through the Vercel API; the CI history came from `gh run list` and `gh run view`. No environment-variable values were read.

- **Production deployment:** `dpl_51eqbSJz9sdiy8vD2ACxbj89ucWQ` serves `029d86a`. It is READY, target production.
- **Cron stopped:**
  - `get_runtime_logs`, filtered to `/api/cron/dispatch` and grouped by deployment over 24 h, counted calls only on three deployments, all before #33:
    - `dpl_E2HN…` (`080ddf6`): 91;
    - `dpl_DHV3…` (`cef0a4d`): 80;
    - `dpl_CggHy5YZ6nshqdhaqrZqTP81YFwe` (`8582a7c`): 74.
  - The last call was **16:35:26 UTC** (401, on `dpl_DHV3…`), **20 seconds before** the #33 deploy `dpl_8dNy…` was created (16:35:46 UTC).
  - There were none from then until at least 20:11 UTC.
  - The 401 noise every 5 minutes has stopped.
- **CI history on `main` (GitHub):** attempt 1 failed on 4 of the 5 push runs after `080ddf6` (5 of 6 counting `080ddf6`; only `d880e2c` passed first time), with failures in `merchant-loop` ECONNRESET and the HK public funnel (PR #36 fixes the latter). Each was re-run or superseded.

## 7. Data, security and operating review

```text
Migrations added (next valid numbers): 0014_publish_reply.sql (additive). Its rollout statement,
  rollout/apply-0014.sql, was rehearsed twice on a disposable postgres:16 (PHASE-4-REPORT.md P4.6 runbook).
Prior migrations unchanged: yes; 0001–0013 checksums are pinned by apply-0014's journal check.
Runtime-role grants and privileged function review: the 4 functions (3 new, export_output_version
  re-created) are SECURITY INVOKER with search_path '' and EXECUTE for sme_app_runtime only;
  asserted by integration tests and by apply-0014's post-apply checks.
Concurrency/idempotency evidence: partial unique indexes allow one active publish per version and per
  review; the 23505 race maps to already_publishing/target_busy; finish is a no-op for the second
  caller; DEC-14 counting is pinned by tests.
Tenant/location and report-grant boundary review: publish, targets and reconcile require an owner or
  an in-scope manager; delete is owner-only; reconcile works with the flag off (read-only on Google).
Approval/export authority preserved: yes; export counting is byte-identical to 0011 until a publish
  exists.
Provider spend/budget controls: scheduler off (cron removed); P4.6 limits are per workspace and global,
  and fail closed.
Secret-boundary and logging review: secret-boundary passed (61 artifacts); P4.6 logs carry a category
  and IDs only; GBP tokens never leave local variables.
Private media / ownership evidence handling: unchanged.
Existing-data compatibility / backfill scope: additive columns and indexes; no backfill.
Known operational failures and recovery: CI acceptance flakes (merchant-loop ECONNRESET; dev-server
  navigation races locally). A Google token-endpoint outage marks a GBP connection expired, which
  fails closed to a reconnect prompt (PHASE-4-REPORT P4.6 ruling E7).
```

## 8. Rollout and data-preserving rollback

```text
Authorized rollout target: production already serves 029d86a (auto-deploy from main).
Features enabled/disabled: the four older Phase 4 flags were off as of the 2026-10-04 names read at
  080ddf6 (not re-read for dpl_51eq…); GBP_REPLY_PUBLISH_ENABLED is unset (owner-reported, not
  verified); scheduler off (cron removed).
Pre-deploy gates: CI verify passed (PR #36; push run attempt 2).
Migration order and backward compatibility: 0014 is not required before the code (flag-off path
  proven on 0013); it is owner-reported applied on both hosted databases.
Post-deploy observations: §6.
Disable/rollback trigger: any 5xx regression in owner or export routes; any publish observed while
  GBP_REPLY_PUBLISH_ENABLED is unset.
Safe rollback or forward-fix procedure:
  - Regression attributable to P4.6 (it changed the export route and re-created
    export_output_version): promote dpl_8dNy… (f1d59fa, the last production deployment before
    P4.6). This is safe with 0014 applied: for versions never published, the re-created
    export_output_version counts exports exactly as the 0011 body did (the comment above it in
    0014_publish_reply.sql; DEPLOY.md, P4.6 section), and the
    older code never calls the 0014 functions.
  - Regression in the test-only or tooling deltas (#35, #36): promote dpl_53ZY… (577c9d3).
  - No migration rollback: 0014 is additive and inert with the flag off.
Data that must be preserved: all; no destructive step.
Authority required to execute rollout/rollback: the owner.
```

## 9. Decision

| Question | Evidence-based answer |
|---|---|
| Implementation scope complete? | Yes for Phases 1–4 core, P4.5 and P4.6 (both conditional and off). |
| All required local gates actually passed? | **CI:** yes on this commit, attempt 2 only; attempt 1 failed. **Locally:** no. `e2e:acceptance` failed 3 of 42 tests in the full run; those passed when re-run alone. `e2e` passed only through temporary port-3197 config copies. Every other gate passed in its normal form. |
| Hosted verification complete for the advertised scope? | **No.** Only the cron removal is observed. The migrations are owner-reported, and every other hosted scenario is not run. |
| Commercial/operating choices approved? | **No.**<br>– DEC-01 to DEC-09 and DEC-11: undecided, or no acceptance record.<br>– DEC-11: the owner-reported applies of `0013` and `0014` have no recorded authorization; the "Acceptance authorization record" in `BUSINESS-AND-HOSTED-DECISIONS.md` is blank.<br>– DEC-10: at its default (off).<br>– DEC-12, -13 and -14: decided. |
| Remaining blockers / not-run scenarios | Hosted checklist §1–§22 (owner authorization and budget). P4.6 needs Google Business Profile API access. The `merchant-loop` ECONNRESET CI flake is unfixed. |
| Safe independent next work | Fix the `merchant-loop` ECONNRESET acceptance flake (it failed attempt 1 on `080ddf6`, `cef0a4d`, `f1d59fa` and `029d86a`). Then investigate the local acceptance flakes in `claim-and-market`, `permissions` and `offer-promotion` (likely the dev-server navigation race; not yet investigated). |
| Release decision / authorizer | **Not ready to claim a verified release.** Implemented and CI-verified is not hosted verified. The decision is the owner's. |
