# Owner platform v1 (Phases 1–4 core + P4.5 + P4.6): release evidence for main `029d86a`

This is the evidence pack for `main` at `029d86a`. It follows [`RELEASE-EVIDENCE-TEMPLATE.md`](RELEASE-EVIDENCE-TEMPLATE.md) and is a **delta on [`RELEASE-EVIDENCE-080ddf6.md`](RELEASE-EVIDENCE-080ddf6.md)**.
- Rows that did not change since `080ddf6` point to that pack instead of repeating it.
- Every result recorded here was produced for this candidate.
- Status values are `passed`, `failed`, `blocked` and `not run` only.

**Bottom line.** Implemented and CI-verified; locally verified on Windows, with every gate run in its normal form for the first time. **Hosted verification is not complete.** The only hosted facts recorded are:
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
| Deployment ID / source commit | `dpl_51eqbSJz9sdiy8vD2ACxbj89ucWQ`, READY, target production, branch `main`, commit `029d86a`, created 2026-10-04T19:46:22Z. It is a rollback candidate. Earlier production deployments in this delta: `dpl_53ZY…` (`577c9d3`), `dpl_GLyW…` (`d880e2c`), `dpl_8dNy…` (`f1d59fa`), `dpl_DHV3…` (`cef0a4d`). |
| Production alias | `smeassistant.vercel.app`; `main` auto-deploys (unchanged). |
| Authorization record and budget | **None for hosted acceptance** (unchanged). No DEC-04 budget is recorded. |
| New/changed feature flags; actual state | **New:** `GBP_REPLY_PUBLISH_ENABLED` (P4.6), on only when exactly `"true"`. It was not re-read in Vercel for this pack; the code path is off unless it is set, and the owner has not set it. The other four Phase 4 flags are as in the 080ddf6 pack. |
| Migration state (owner-reported, not verified by the writer) | `0013`: applied on the Neon test branch and production on 2026-10-04 (owner-reported). `0014_publish_reply.sql`: applied with [`rollout/apply-0014.sql`](rollout/apply-0014.sql) on the Neon test branch, then production, on 2026-10-05. The owner reported "all checks pass": journal row 14 `e2c181b7…`, 5 columns, 4 SECURITY INVOKER functions, 2 indexes, 0 publish deliveries. |
| Implemented scope | Phases 1–4 core, P4.5 and P4.6. See §2. |
| Explicitly deferred/conditional scope | P4.5 and P4.6 are built and off. Turning P4.6 on needs Google Business Profile API access for the GCP project and a separate release approval (checklist §22). |

## 2. Current implementation findings (delta since `080ddf6`)

| Source ID / requirement | Status | Files changed | Regression evidence | Remaining limitation |
|---|---|---|---|---|
| P1.1–P4.5 | unchanged since the 080ddf6 pack | — | 080ddf6 pack §2; the gates in §3 re-ran them all | As recorded there. |
| P3.1 scheduler registration (DEC-10) | changed | PR #33 `b50d406`: `vercel.json` (cron entry removed), `tests/cron-registration.test.ts` (asserts no cron), `docs/integration/DEPLOY.md` | `tests/cron-registration.test.ts`; production runtime logs (§6) | The scheduler is off by DEC-10 default. Re-enabling needs a recorded DEC-10 decision and a valid `CRON_SECRET`. |
| P4.6 single publishing connector (DEC-13/14) | changed | PR #34: `neon/migrations/0014_publish_reply.sql`, `rollout/apply-0014.sql`, `lib/oauth/google-reviews.ts`, `lib/publishing/*`, `lib/repositories/publishing.ts`, publish/targets/reconcile/reply routes, `components/workspace/gbp-publish-card.tsx` | `test/integration/neon-publish-reply.integration.test.ts`, `neon-publish-flag-off.integration.test.ts` (flag-off path on a 0013 schema), `lib/workspace/publish-sql.test.ts`, route and card tests (`PHASE-4-REPORT.md` P4.6) | Off. No Google call has been made from any environment. Open product question: a reply that is published but never exported earns no Attributed measurement. |
| Local Windows gates (engineering) | changed | PR #35: `.npmrc`, `tests/npmrc-store-length.test.ts`, `README.md` | `tests/npmrc-store-length.test.ts`; §3 (every gate now runs in its normal form locally) | Existing local checkouts need one `corepack pnpm install` (accept the purge). |
| Acceptance stability (engineering) | changed | PR #36: `e2e/acceptance/public-funnel.spec.ts` | 20/20 local repeats; every fallback forced 2/2 (PR #36) | The spec no longer proves the in-app redirect under `next dev`; a `dev-navigation-fallback` annotation records each use. |

## 3. Offline gate results

**On CI** (ubuntu, the GitHub `verify` job; workflow steps listed in "Inventory reconciliation" below):
- **PR #36, head `445c3d3`, run 37228507276 (`pull_request`):** passed.
- **Push run on `029d86a`, run 37229545186:**
  - **Attempt 1 failed** `e2e:acceptance`, with 41 passed and 1 failed: `merchant-loop.spec.ts:54` "missing LLM output…", `apiRequestContext.post: read ECONNRESET`.
  - **Attempt 2,** a re-run of the failed job, **passed**.
- **This flake is not fixed** (see §9). The same test also failed attempt 1 on `080ddf6`, `cef0a4d` and `f1d59fa`.

**Local** (Windows 11, Node v24.18.0, worktree `rel-029d86a` at `029d86a`, Docker Desktop running, `VITEST_MAX_WORKERS=1`, sequential). Logs are kept outside the repository.

| Actual command | Status | Exit / counts / skips | Runtime / candidate | Log | Notes |
|---|---|---|---|---|---|
| `corepack pnpm typecheck` | passed | exit 0 | 57 s, `029d86a` | `typecheck.log` | |
| `corepack pnpm lint` | passed | exit 0; 0 errors, 38 warnings | 84 s | `lint.log` | Warnings only. |
| `corepack pnpm test` | passed | exit 0; app 365 files / 4,435 tests; `tests/` 1 / 62; packages region 3 / 23, scoring 16 / 183, contracts 3 / 20, scan-engine 28 / 299 | 583 s | `test.log` | With `VITEST_MAX_WORKERS=1` (as CI) there were no load timeouts. |
| `corepack pnpm test:no-supabase` | passed | exit 0 | — | `no-supabase.log` | "No forbidden retired transport references; only the approved pinned Neon transitive library is permitted" |
| `corepack pnpm test:no-self-service-claim` | passed | exit 0 | — | `no-ssc.log` | "OWNER_SELF_SERVICE_CLAIM is not enabled." |
| `corepack pnpm test:secret-boundary` | passed | exit 0; "Secret boundary passed across 61 public artifacts." | 64 s | `secret-boundary.log` | **Literal**, no `--webpack` (blocked locally before PR #35). |
| `corepack pnpm db:verify` | passed | exit 0; `0001`–`0014` applied, replay `[]`; 41 tables, 491 columns, 204 constraints, 108 indexes, 8 triggers, 23 functions, 0 seeded rows | 6 s | `db-verify.log` | Owned disposable `postgres:16`. |
| `corepack pnpm test:integration` | passed | exit 0; 49 files / 537 tests | 438 s | `test-integration.log` | Owned fixtures; Docker running. |
| `corepack pnpm build` | passed | exit 0; Next.js 16.2.6 (Turbopack), "Compiled successfully" | 54 s | `build.log` | **Literal** (blocked locally before PR #35). |
| `corepack pnpm e2e` | passed | exit 0; 31 passed | 113 s | `e2e-port3197.log` | Same suite, run on port 3197 through temporary copies of `playwright.config.ts` and `test/e2e/public-setup.ts`. Another project's server holds 3100 on this machine. |
| `corepack pnpm e2e:acceptance` | failed | exit 1; 39 passed, 3 failed | 1,107 s | `e2e-acceptance.log` | See below. |
| The 3 failed acceptance tests, re-run alone | passed | exit 0; 4 passed (`permissions.spec.ts:4` covers viewer and manager) | 2.9 min | `acceptance-rerun3.log` | |

**The three local acceptance failures:**
- `claim-and-market.spec.ts:34` and `permissions.spec.ts:4` (viewer) stayed on `/en/owner/sign-in/complete`.
- `offer-promotion.spec.ts:22` did not see "已確認" (confirmed) on the offer card.

All three follow a client-side redirect or refresh, which is the `next dev` navigation race diagnosed in PR #36. All passed when re-run alone, and all passed in CI attempt 2 on this commit. They are recorded as **flaky locally, not fixed**.

**Inventory reconciliation.** The CI `verify` job runs, in order:
- install and lint;
- typecheck and unit;
- secret-boundary, no-supabase and no-self-service-claim;
- `docker pull postgres:16`, `db:verify` and integration;
- build, then the Playwright browser install;
- `e2e`, then `e2e:acceptance`.

`build` runs as a separate step; `test:secret-boundary` also builds its own sentinel bundle.

## 4. New regression evidence

The 13 families are as in the 080ddf6 pack §4, all re-run green on this candidate as part of §3. New since then:

| Family | Exact test(s) | Status | Failure / skip / blocker | Evidence |
|---|---|---|---|---|
| Phase 4 conditional scope: P4.6 publishing | `neon-publish-reply.integration.test.ts`:<br>– DEC-14 once-per-version matrix<br>– races and active-publish indexes<br>– INVOKER and grants<br><br>`neon-publish-flag-off.integration.test.ts` (no 0014 column read on a 0013 schema)<br><br>`lib/workspace/publish-sql.test.ts` (`export_output_version` change pinned)<br><br>`lib/oauth/google-reviews.test.ts`<br><br>`lib/publishing/*.test.ts`<br><br>`app/api/versions/[versionId]/publish/publish.test.ts`<br><br>`app/api/deliveries/[deliveryId]/deliveries.test.ts`<br><br>`components/workspace/gbp-publish-card.test.tsx` | passed | — | §3 unit and integration runs |
| Durable lifecycle/scheduling: no hosted cron | `tests/cron-registration.test.ts` | passed | — | §3 unit run; §6 runtime logs |
| Local Windows build tooling | `tests/npmrc-store-length.test.ts` | passed | — | §3 unit run |

## 5. Hosted acceptance

The candidate deployment for every row is `dpl_51eqbSJz9sdiy8vD2ACxbj89ucWQ` (`029d86a`). The runbook is [`HOSTED-ACCEPTANCE-CHECKLIST.md`](HOSTED-ACCEPTANCE-CHECKLIST.md).

| Scenario | Authorized scope/reference | Status | Evidence and limitation |
|---|---|---|---|
| R2 environment inventory | Not re-read for this pack (reading Vercel environment variables returns stored values). | not run | The last names-only inventory is in the 080ddf6 pack, read 2026-10-04 at `080ddf6`. It flagged `BLOB_READ_WRITE_TOKEN` and `NEON_AUTH_BASE_URL` as `readable-secret`; whether they were re-saved as Sensitive is not verified. |
| Migration journal `0001`–`0014` | DEC-11 owner actions; checklist §2 | not run | The applies are **owner-reported** (§1). The independent read-only journal check has not been run. |
| Phase 3 scheduler (cron) | DEC-10 default, Path A (checklist §20) | passed: off as intended | Read-only runtime logs (§6): no `/api/cron/dispatch` invocations since the `f1d59fa` deploy. |
| Conditional preview/connector acceptance (P4.5, P4.6) | Separate approvals; P4.6 also needs Google API access (checklist §17, §22) | not run | Both flags off. |
| R3–R8, R10, R11, Hosted Blob, Phase 2–4 rows, `launch:check` | No acceptance authorization or DEC-04 budget recorded | not run | Unchanged from the 080ddf6 pack. |

## 6. Read-only manual observations

All observations were made through the Vercel API, read-only, on 2026-10-04 by the controller. No environment-variable values were read.

- **Production deployment:** `dpl_51eqbSJz9sdiy8vD2ACxbj89ucWQ` serves `029d86a`. It is READY, target production.
- **Cron stopped:**
  - `get_runtime_logs`, filtered to `/api/cron/dispatch` and grouped by deployment over 24 h, counted calls only on `dpl_E2HN…` (91), `dpl_DHV3…` (80) and `dpl_CggH…` (74), all deployments before #33.
  - The last call was **16:35:26 UTC** (401, on `dpl_DHV3…`), **20 seconds before** the #33 deploy `dpl_8dNy…` was created (16:35:46 UTC).
  - There were none from then until at least 20:11 UTC.
  - The 401 noise every 5 minutes has stopped.
- **CI history on `main` since `080ddf6`:** attempt 1 failed on 4 of 6 push runs, with failures in `merchant-loop` ECONNRESET and the HK public funnel (PR #36 fixes the latter). Each was re-run or superseded.

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
Features enabled/disabled: all five Phase 4 conditional flags off; scheduler off.
Pre-deploy gates: CI verify passed (PR #36; push run attempt 2).
Migration order and backward compatibility: 0014 is not required before the code (flag-off path
  proven on 0013); it is owner-reported applied on both hosted databases.
Post-deploy observations: §6.
Disable/rollback trigger: any 5xx regression in owner or export routes; any publish observed while
  GBP_REPLY_PUBLISH_ENABLED is unset.
Safe rollback or forward-fix procedure: promote the previous production deployment (dpl_53ZY…,
  577c9d3); the changes since then are test-only. No migration rollback: 0014 is additive and inert
  with the flag off.
Data that must be preserved: all; no destructive step.
Authority required to execute rollout/rollback: the owner.
```

## 9. Decision

| Question | Evidence-based answer |
|---|---|
| Implementation scope complete? | Yes for Phases 1–4 core, P4.5 and P4.6 (both conditional and off). |
| All required local gates actually passed? | CI: yes on this commit (attempt 2). Locally: every gate passed in its normal form except `e2e:acceptance`, which had 3 flaky failures in the full run; those passed when re-run alone. |
| Hosted verification complete for the advertised scope? | **No.** Only the cron removal is observed. The migrations are owner-reported, and every other hosted scenario is not run. |
| Commercial/operating choices approved? | No change: DEC-04, -05, -06, -08, -09 and -11 acceptance records are not recorded; DEC-10 is at its default (off); DEC-12, -13 and -14 are decided. |
| Remaining blockers / not-run scenarios | Hosted checklist §1–§22 (owner authorization and budget). P4.6 needs Google Business Profile API access. The `merchant-loop` ECONNRESET CI flake is unfixed. |
| Safe independent next work | Fix the `merchant-loop` ECONNRESET acceptance flake (attempt 1 failed on 4 of 6 `main` runs). Then the local dev-server navigation flakes in `claim-and-market`, `permissions` and `offer-promotion`. |
| Release decision / authorizer | **Not ready to claim a verified release.** Implemented and CI-verified is not hosted verified. The decision is the owner's. |
