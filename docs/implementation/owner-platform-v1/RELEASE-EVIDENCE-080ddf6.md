# Owner platform v1 (Phases 1–4 core + P4.5): release evidence for main `080ddf6`

Filled from [`RELEASE-EVIDENCE-TEMPLATE.md`](RELEASE-EVIDENCE-TEMPLATE.md) on 2026-10-04. Documentation only: nothing here was produced by a hosted request, a database connection or a provider call made by the writer. The owner runbook for every hosted row is [`HOSTED-ACCEPTANCE-CHECKLIST.md`](HOSTED-ACCEPTANCE-CHECKLIST.md).

Statuses are **passed**, **failed**, **blocked** and **not run** only (Master Plan §9.1). Three things are kept apart throughout:

- **implemented**: the code is on `main` at `080ddf6`;
- **locally verified**: a named offline command passed on this tree (CI or the local run in §3);
- **hosted verified**: an owner-run scenario on `smeassistant.vercel.app` passed. **No row of §5 is hosted verified except the names/presence part of R2.**

Owner-reported facts are labelled "owner-reported <date>" and were not checked by the writer.

## 1. Candidate and scope

| Field | Value |
|---|---|
| Phase / owner outcome | owner-platform-v1, Phases 1–4 core plus the conditional P4.5 preview. Outcomes per `MASTER-IMPLEMENTATION-PLAN.md` §3: safe owner activation (1), complete owner workspace (2), recurring, measurable and commercial service (3), reusable growth platform (4). |
| Candidate commit / branch | `main` at `080ddf66cf2eaf6636b0017b7c47cab1ccf4b2d5`, the merge of PR #31 (`p45-preview-draft`), parents `8582a7c` (main) and `42ff03c` (PR head). Committed 2026-10-04 10:20:42 +0800 (`git log -1 080ddf6`). |
| Working-tree state and relevant uncommitted changes | Evidence written in worktree `release-evidence` at `080ddf6`. Tree identity: `git rev-parse 080ddf6^{tree} 42ff03c^{tree}` prints `be5a0d5dcf19796faba5810ac673d8b9a8a1ef53` twice, so the candidate tree equals the PR head tree. The CI pull-request run checked out merge ref `f32cfe1cd3c372cf15d048e753a28b2910577bac` (run 37169934797 log, "Checking out the ref"); its tree is also `be5a0d5…` (`gh api …/git/commits/f32cfe1…`). The local gate run rewrites two snapshot files' line endings (`lib/agents/__snapshots__/agents.test.ts.snap`, `lib/pocket-assistant/__snapshots__/demo.test.ts.snap`) and restores them at the end; they are not part of the candidate. |
| Base commit and audit delta | Audit pin `8f4c5b4` (`IMPLEMENTATION-TRACEABILITY.md` P1.1). `8f4c5b4..080ddf6`: 444 commits, 675 files changed, +87,320 / −1,837 (`git rev-list --count`, `git diff --shortstat`), landed through PRs #13–#31. |
| Runtime / package manager / lockfile | Node from `.nvmrc` = `24` (CI `setup-node` uses `node-version-file: .nvmrc`); `package.json` `engines.node` `>=22.13.0`, `packageManager` `pnpm@9.12.0`; `pnpm-lock.yaml` `lockfileVersion: '9.0'`, sha256 `c7c722c958a874deee76ab2b4faaf654d985547a9d29eb256d8f6c9b848f63c6`, installed with `--frozen-lockfile` in CI ("Lockfile is up to date", run 37169934797 step 5). Next `16.2.6`, React `19.2.6`, TypeScript `5.9.3`, Playwright `1.61.1` (`package.json`). Local run: Node `v24.18.0`, pnpm `9.12.0` (`summary.txt`). |
| Test database fixture identity | Owned, disposable Docker `postgres:16` created by `db:verify` and the integration suite (`.github/workflows/ci.yml` steps "Prepare owned PostgreSQL fixture image", "Verify migrations", "Integration tests (owned Docker PostgreSQL)"; `NEON_INTEGRATION=1`). No hosted database was used by any gate. |
| Hosted environment / immutable origin | Vercel project `smeassistant` (`prj_Hbox4o4NhM3p0yxRxmY8Xq1mjtb5`, team `ynwaforevers-projects`); production domain `smeassistant.vercel.app`, no custom production domain (`vercel-facts.md`, read 2026-10-04). Deployment runtime Node version is **not recorded** in `vercel-facts.md`; the last recorded value is Node 24.x for an earlier deployment (`IMPLEMENTATION-TRACEABILITY.md` P1.1). |
| Deployment ID / deployment source commit | `dpl_E2HNGePLBHpdDVNzejLTZVrBepqN`, READY, target production, source branch `main`, commit `080ddf66cf2e…`, created 2026-10-04 UTC, current (`vercel-facts.md`). Rollback candidates: `dpl_CggHy5YZ6nshqdhaqrZqTP81YFwe` (`8582a7c`, PR #30) and `dpl_GX5ZokPgkFRdx1crc9Xy8t1ca5Nj` (`ecc60df`, PR #29). |
| Production alias, when relevant | `smeassistant.vercel.app` serves the current production deployment (`vercel-facts.md`). `main` auto-deploys on merge (`IMPLEMENTATION-TRACEABILITY.md` P1.1). The final host `smescanner.fimmick.com` is not assigned to this project (`docs/integration/DEPLOY.md` §5). |
| Authorization record and budget | **None for hosted acceptance.** The "Acceptance authorization record" in `BUSINESS-AND-HOSTED-DECISIONS.md` is blank; DEC-03, DEC-04, DEC-05, DEC-06, DEC-07, DEC-08, DEC-09, DEC-10 and DEC-13 are undecided. DEC-12 is decided (2026-10-04) but authorizes no activation. No provider, mail or billing budget is recorded. |
| New/changed feature flags; actual state | Absent from every Vercel scope, so **off**: `OFFER_PROMOTIONS_ENABLED`, `WORK_PACKS_ENABLED`, `CONTEXTUAL_ASSISTANT_ENABLED`, `PREVIEW_DRAFT_ENABLED`, `PREVIEW_DRAFT_DAILY_LIMIT`, `PREVIEW_DRAFT_USD_DAILY`, `OWNER_SELF_SERVICE_CLAIM` (`vercel-facts.md`). Also absent (names in `.env.example`, compared by the writer): `OPERATOR_EMAILS`, `ASSISTED_ASSIGNMENT_ENABLED` (assisted assignment off), `COMMERCIAL_CONTRACT_APPROVED` (billing closed), `APPLICATION_MAIL_APPROVED`, `MAIL_UNSUBSCRIBE_SECRET`, `MAIL_RECIPIENT_ALLOWLIST`, `MAIL_PAUSED` (application mail closed), `SCANS_PAUSED`, `AI_DRAFTS_PAUSED` (not paused), the four `BUDGET_*` overrides (code defaults apply), `WORKSPACE_COMPLETION_ENABLED`, `WORKSPACE_COMPLETION_SECRET`, `DATABASE_URL_UNPOOLED`, `NEON_READINESS_HOST`, `NEON_READINESS_DATABASE`. Present but **value not read**, so effective state not verified: `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED`, `SCAN_SOURCES`, `REPORT_RECOVERY_ENABLED`, `EVIDENCE_SNAPSHOT_INSTAGRAM_ALLOWED`, `EVIDENCE_SNAPSHOT_GOOGLE_MAPS_ALLOWED`, `CRON_SECRET`. |
| Migration state (owner-reported, not verified by the writer) | `0001`–`0004`: applied during the Neon migration; the repository records the procedure (`docs/integration/NEON-CUTOVER.md`, `docs/integration/LAUNCH-REPORT.md` Task 17) but **no application record**; the journal ending at `0004` before 2026-09-24 is owner-reported. `0005`–`0008`: owner-reported 2026-09-24, Neon test branch then production. `0009`–`0010`: implied, because `rollout/apply-0011.sql` refuses any journal other than exactly `0001`–`0010` and its apply was owner-reported successful. `0011`: owner-reported 2026-10-02, test branch then production. `0012`: owner-reported 2026-10-03, production; the test branch was not mentioned. `0013`: owner-reported 2026-10-04, test branch then production. A read-only journal check is checklist §2. |
| Implemented scope | Phases 1–4 core plus P4.5: P1.1–P1.7, P2.1–P2.5 (P2.5 items 29–30 blocked), P3.1–P3.5, P4.1–P4.5. Details in §2. |
| Explicitly deferred/conditional scope | P4.6 single publishing connector: not built, DEC-13 not authorized. P4.5 is built but off (`PREVIEW_DRAFT_ENABLED` absent). Phase 2 backlog item 5 (tab labels) deliberately deferred; items 29 (invitation delivery) and 30 (report recovery) blocked on DEC-07 (`PHASE-2-BACKLOG.md`). |

## 2. Current implementation findings

One row per Master Plan slice. Sources: `IMPLEMENTATION-TRACEABILITY.md` (Phase 1 and Phase 4 sections), `PHASE-1-REPORT.md`, `PHASE-2-BACKLOG.md` and `PHASE-2-TEST-RESULTS.md` (there is no `PHASE-2-REPORT.md` in this directory, and the traceability register has no Phase 2 or Phase 3 section), `PHASE-3-REPORT.md`, `PHASE-4-REPORT.md`. "Regression evidence" names tests that CI run 37169934797 executed on this tree (§4); "changed" means implemented and locally verified, never hosted verified.

| Source ID / requirement | Present / already fixed / changed / not verified at baseline | Files changed | Regression evidence | Remaining limitation |
|---|---|---|---|---|
| P1.1 Re-baseline and release truth | changed | `.nvmrc` 22 → 24; stale runtime statements in `CLAUDE.md`, `docs/integration/DEPLOY.md` (Traceability P1.1) | CI runs on `.nvmrc`; this pack is the per-candidate re-baseline | Local Windows Turbopack `radix-ui` build blocker (local only; Traceability "Verification and blockers"). |
| P1.2 Provider access and workspace integrity | changed | `547da68`: `packages/scan-engine/src/safe-website-fetch.ts`, `neon/migrations/0005_owner_removal_guard.sql`, `lib/db/config.ts`, `scripts/assert-no-self-service-claim.mjs`; fail-closed spend routes | `safe-website-fetch.test.ts`, `neon-membership.integration.test.ts`, `members` route tests, `lib/db/config.test.ts`, `test:no-self-service-claim` | Hosted not run. `0005` is owner-reported applied 2026-09-24. |
| P1.3 Usable, honest scan | changed | `1823035`, `a278f5c`, `6da4d97`, `df8d36e` (`lib/funnel/scan-progress.ts`, `/api/scan/status`, consent gate, bounded polling) | `scan-progress.test.ts`, `scan/status/route.test.ts`, `consent*.test.ts`, `scanning-page.test.tsx`, `lib/scan/fixtures.test.ts`, `e2e/acceptance/public-funnel.spec.ts` | R3 live HK/TW scans not run. `public-funnel.spec.ts` HK case failed once in push run 37170768091 (§3). |
| P1.4 Identity, eligibility, proof of ownership | changed | `cf72028`, `fb24b94` (Google callback root cause on Node 24), `db4547d` | `lib/identity/*.test.ts`, `app/auth/callback/route.test.ts`, claim route tests, `guided-sign-in.spec.ts`, `claim-and-market.spec.ts` | R4, R5, R6 hosted confirmation not run (Traceability: "hosted confirm blocked"). |
| P1.5 Onboarding context | changed | `79cf656` (brand voice and claims persisted), server-derived resume step | `components/onboarding-page.test.tsx`, `lib/workspace/claim.test.ts`, `claim-and-market.spec.ts` | Keystroke draft persistence deliberately not added. |
| P1.6 Review-reply vertical slice | changed | `lib/workspace/evidence-inputs.ts`, `b0f9b0b`, `02a3af1`, `0e5a451`, `813ac78` | `runs.test.ts`, `evidence-inputs.test.ts`, `agents.test.ts`, `action-run-reaper.test.ts`, `neon-workflow.integration.test.ts`, `merchant-loop.spec.ts` | R7 hosted not run; real model not evaluated (DEC-04). `merchant-loop.spec.ts` "missing LLM output" failed once in push run 37170768091 (§3). |
| P1.7 Commercial and delivery honesty | changed | `02a3af1` (pricing/seat promises, invite copy), recovery-field relabel, Fix Pack empty state | Stripe webhook route tests, `billing-view.test.tsx`, `permissions.spec.ts` (lite allowance) | R8 Stripe test mode not run (DEC-08/09). |
| P2.1 Simplify the daily experience | changed | Backlog items 1–4, 6–8: `520cf00`, `92b2a1a`, `b22dd04`, `60dcab6`, `92e2a44`, `57d2f54`, `75dd922` | Unit/component suite (`PHASE-2-TEST-RESULTS.md` gates 1–3); CI 37169934797 | Item 5 (tab labels) deferred by choice. |
| P2.2 Three complete AI workflows | changed | Items 9–14: `0631309`, `e466730`, `cac3704`, `92e2a44`, `0881ed5`, `f0b728e` | `runs.test.ts` (faq_jsonld and website_basics happy and blocked paths), `test/corpus/workflows/corpus.test.ts` | Hosted FAQ / website-basics workflows not run; real model not evaluated (DEC-04). |
| P2.3 Shared business context | changed | Items 15–18: `4d09059`, `352cf77`, item 17 (no commit recorded in the backlog), `4407fb5` | `evidence-inputs.test.ts`, action-detail tests | Item 17 has no commit hash in `PHASE-2-BACKLOG.md`; its presence was not separately re-verified here. |
| P2.4 Assisted ownership assignment | changed, off | Items 19–23, 27, 28: `70b8a3d`, `ff19a5f`, `84ef171`, `39fa2cd`, `97bf170`, `d41693c`, `1c25db9`; no DDL | `neon-assisted-assignment.integration.test.ts`, `lib/auth/operator*.test.ts`, access-request route and component tests | Off in production: `OPERATOR_EMAILS` and `ASSISTED_ASSIGNMENT_ENABLED` absent (`vercel-facts.md`). DEC-06 undecided. |
| P2.5 Communication and audit paths | changed in part | Items 24–26: `9a749ca`, `2a70d4d`, `268bae9` (mail port). Items 29 (invitation delivery) and 30 (report recovery): not built | `notifications` route tests, `fix-pack-drafts` route tests, `lib/mail/transport.test.ts` | Items 29–30 blocked on DEC-07. Application mail closed in production (`APPLICATION_MAIL_APPROVED` absent). |
| P3.1 Durable lifecycle, one scheduler | changed | `/api/cron/dispatch` (GET and POST, bearer), `vercel.json` cron `*/5 * * * *` (`PHASE-3-REPORT.md` P3.1; GET fix in P3.5c final review) | `neon-cron-dispatch.integration.test.ts`, `app/api/cron/dispatch/route.test.ts`, `tests/cron-registration.test.ts`, `neon-execution.integration.test.ts` | `CRON_SECRET` is present in production (value not read), but no live tick was observed. Per-module checkpoint/resume not built. |
| P3.2 Re-scan and proof of change reachable | changed | P3.2 applied evidence (`0006`, `0007`), P3.2b website verifier, P3.2c comparison states (`5238a7b`–`ede55de`), rescan reachability PR #16 | `neon-report-comparison.integration.test.ts`, `neon-website-verification.integration.test.ts`, `lib/report/comparison/*.test.ts`, `report-scan-comparison.spec.ts` | R11 browser pair not run; no member has opened `/r/[slug]` hosted (`PHASE-3-REPORT.md` P3.2c). Only 2 of 13 templates are verifiable. |
| P3.3 Billing, allowance and seats | changed | Commercial contract on safe defaults (`lib/commercial/*`), billing closed unless approved (`PHASE-3-REPORT.md` P3.3) | `lib/commercial/*.test.ts`, Stripe webhook tests, `permissions.spec.ts` | Billing closed in production (`COMMERCIAL_CONTRACT_APPROVED` absent). No Stripe test-mode run (DEC-09); no commercial matrix (DEC-08). |
| P3.4 Reliable events and value metric | changed | `0008`, durable `scan_events`, `report:value` CLI (`PHASE-3-REPORT.md` P3.4) | `neon-value-report.integration.test.ts`, `tests/value-report-*.test.ts` | Production reliability not observed. The 2026-09-18 `home lookup failed` 500 was attributed to missing `0005`–`0008`, owner-reported applied 2026-09-24. |
| P3.5 Operating controls | changed | P3.5a spend budgets (`0009`), P3.5b failure view, P3.5c mail outbox (`0010`), P3.5d incident runbook and kill switches | `neon-scan-claim-budget`, `neon-failures`, `neon-dead-letter`, `neon-mail-outbox`, `neon-scan-pause` integration tests; `lib/budgets/*.test.ts` | Budget defaults (200 attempts, US$20/24 h) are placeholders, not decisions. No operator alerting. No named incident owner (DEC-06). |
| P4.1 Offers and promotion copy | changed, off | `0011_offers.sql`, offers routes and page, `promotion_copy` agent (Traceability P4.1) | `neon-offers`, `neon-offer-freshness` integration tests, `lib/workspace/offer*.test.ts`, `offer-promotion.spec.ts` | Flag absent in production. Real model not evaluated (DEC-04). DEC-14 safe default (two drafts = two deliveries). |
| P4.2 Work packs | changed, off | `0012_work_packs.sql`, `startPack`, pack card and page (Traceability P4.2) | `neon-work-packs`, `neon-work-packs-flag-off` integration tests, `pack-card.test.tsx`, `work-pack.spec.ts` | Flag absent. Ruling P6 residual (Continue can double-draft). No "all locations" start. |
| P4.3 Contextual assistant | changed, off | `lib/assistant/signals.ts`, suggestions route, two intents; no migration (Traceability P4.3) | `neon-assistant-signals`, `neon-assistant-flag-off` integration tests, `lib/assistant/*.test.ts`, `contextual-assistant.spec.ts` | Flag absent. Hosted suggestions not run. |
| P4.4 Reusable workflow contract | changed | `3914b7e` and follow-ups: `WorkflowDefinition`, `workflow-inputs.ts`, corpus (Traceability P4.4) | `templates.contract.test.ts`, `workflow-inputs.test.ts`, `corpus.test.ts` | Real-model evaluation built, not run (DEC-04). `gbp-post` measurement mapping open. |
| P4.5 Conditional acquisition preview | changed, off | `0013_preview_events.sql`, `lib/preview/*`, `/start/[slug]`, preview route (Traceability P4.5) | `neon-preview-events`, `neon-preview-flag-off` integration tests, `lib/preview/*.test.ts`, `preview-draft.spec.ts` | Flag absent. Not measured; no production metrics. DEC-04 real-model check outstanding. |
| P4.6 Single publishing connector | not built | none | none | DEC-13 not authorized. Outside this release. |

## 3. Offline gate results

**Sources.** (a) **CI, the gate of record:** GitHub Actions run [37169934797](https://github.com/YNWAforever/smeassistant/actions/runs/37169934797), job `verify`, event `pull_request`, head `42ff03c`, checked-out merge ref `f32cfe1` (tree `be5a0d5…`, identical to `080ddf6`), `ubuntu-latest`, Node from `.nvmrc`; conclusion **success**, 02:04:32–02:19:25 UTC (14 m 53 s); all 18 steps success (`gh run view 37169934797 --json jobs`). (a2) **CI push run on the exact commit:** run [37170768091](https://github.com/YNWAforever/smeassistant/actions/runs/37170768091), event `push`, head `080ddf6`, attempt 1, 02:20:49–02:39:17 UTC; conclusion **failure**: steps 5–17 success, step 18 (`e2e:acceptance`) failure. No re-run exists. (b) **Local run** in the `release-evidence` worktree (Windows 11), sequential, with CI's environment (`SCAN_SOURCES=fixture`, `VITEST_MAX_WORKERS=1`, `NEON_INTEGRATION=1`, CI's non-production `RATE_LIMIT_SECRET`, `NEXT_PUBLIC_SITE_URL=http://localhost:3100`): `pending (controller fills)`.

CI counts come from the run logs (`gh run view <id> --log`). Unit totals: root 350 files / 4,243 tests, `safe-media` 1 / 62, region 3 / 23, scoring 16 / 183, contracts 3 / 20, scan-engine 28 / 299, total **401 files / 4,830 tests**, no skips reported. Identical in both runs.

| Actual command | CI 37169934797 (gate of record) | CI 37170768091 (push, `080ddf6`) | Local status | Local exit / counts / skips | Runtime / candidate | Log/artifact | Notes |
|---|---|---|---|---|---|---|---|
| `pnpm install --frozen-lockfile` (CI) / `corepack pnpm install --frozen-lockfile` (local) | passed; lockfile up to date | passed | pending (controller fills) | pending (controller fills) | CI ubuntu, Node per `.nvmrc`; local Node 24.18.0 | CI step 5; local `gate-install.log` | Setup step, not a test gate. |
| `corepack pnpm typecheck` | passed; exit 0 | passed | pending (controller fills) | pending (controller fills) | as above | CI step 7; `gate-typecheck.log` | `tsc --noEmit` plus `pnpm -r typecheck` (4 packages). |
| `corepack pnpm lint` | passed; 0 errors, 30 warnings | passed; 0 errors, 30 warnings | pending (controller fills) | pending (controller fills) | as above | CI step 6; `gate-lint.log` | 30 warnings is the standing baseline (`PHASE-2-TEST-RESULTS.md`). |
| `corepack pnpm test` | passed; 401 files / 4,830 tests, 0 failed | passed; same counts | pending (controller fills) | pending (controller fills) | as above, `VITEST_MAX_WORKERS=1` | CI step 8; `gate-test.log` | Runs the root suite, `safe-media` alone, then `pnpm -r test`. |
| `corepack pnpm test:no-supabase` | passed; "No forbidden retired transport references; only the approved pinned Neon transitive library is permitted" | passed | pending (controller fills) | pending (controller fills) | as above | CI step 10; `gate-no-supabase.log` | Pinned `@neondatabase/auth@0.5.0-beta` exception only. |
| `corepack pnpm test:secret-boundary` | passed; "Secret boundary passed across 60 public artifacts" | passed; 60 artifacts | pending (controller fills) | pending (controller fills) | as above | CI step 9; `gate-secret-boundary.log` | Runs its **own embedded `next build`** (31 static pages) with sentinels. |
| `corepack pnpm db:verify` | passed; journal `0001`–`0013`, replay `[]`, 41 tables / 486 columns / 203 constraints / 106 indexes / 8 triggers / 20 functions, 0 seeded rows | passed; 41 tables | pending (controller fills) | pending (controller fills) | owned `postgres:16` | CI step 13; `gate-db-verify.log` | Owned disposable fixture; never a hosted database. |
| `corepack pnpm test:integration` | passed; 47 files / 502 tests | passed; 47 / 502 | pending (controller fills) | pending (controller fills) | `NEON_INTEGRATION=1`, owned Docker Postgres | CI step 14; `gate-integration.log` | Enablement: `NEON_INTEGRATION=1` (job env). |
| `corepack pnpm e2e` | passed; 31 passed (54.9 s), 1 worker, Desktop Chrome | passed; 31 passed (53.9 s) | pending (controller fills) | pending (controller fills) | production build on `localhost:3100` | CI step 17; `gate-e2e.log` | Project `chromium` only (`playwright.config.ts`). |
| `corepack pnpm e2e:acceptance` | passed; 42 passed (5.8 m) | **failed**; 40 passed, 2 failed (8.1 m) | pending (controller fills) | pending (controller fills) | isolated Auth, database, mail and LLM fixtures | CI step 18; `gate-e2e-acceptance.log` | Push-run failures: `merchant-loop.spec.ts:54` "missing LLM output…" (`apiRequestContext.post: read ECONNRESET` on `POST /api/actions/<id>/run`) and `public-funnel.spec.ts:74` "hk public funnel › manual scan reaches a report" (120 s timeout on the scanning page). Both passed in run 37169934797 on the same tree. No retries are configured (`playwright.acceptance.config.ts`), so Playwright reports them as failures, not flakes. Cause not investigated. |
| Other required gate in CI: `corepack pnpm test:no-self-service-claim` | passed; "OWNER_SELF_SERVICE_CLAIM is not enabled." | passed | pending (controller fills) | pending (controller fills) | as above | CI step 11; `gate-no-self-service-claim.log` | Guardrail 15. |
| Other required gate in CI: `docker pull postgres:16` | passed | passed | pending (controller fills) | pending (controller fills) | Docker | CI step 12; `gate-docker-pull.log` | Fixture preparation for `db:verify` and integration. The local `summary.txt` header recorded that the Docker daemon was not reachable when the run started. |
| Other required gate in CI: `corepack pnpm build` | passed | passed | pending (controller fills) | pending (controller fills) | Next 16.2.6, Turbopack | CI step 15; `gate-build.log` | Separately executed, in addition to the build embedded in `test:secret-boundary`. |
| Scripts not in CI: `e2e:live`, `e2e:neon-auth`, `neon:readiness`, `launch:check`, `eval:workflows` (live) | not run | not run | not run | — | — | — | Need keys, a hosted target or DEC-04 authorization. `launch:check` is checklist §3. |

**Inventory reconciliation.** The "ten gates" wording comes from `docs/integration/LAUNCH-REPORT.md` (Task 16 table): `typecheck`, `lint`, `test`, `db:verify`, `test:integration`, `build`, `e2e`, `e2e:acceptance`, `test:secret-boundary`, `test:no-supabase`. The template lists nine of these (no `build`). Current `.github/workflows/ci.yml` has 14 run steps; excluding `Install` and `Install Playwright browsers`, the **12 gate steps** are: lint, typecheck, unit tests, `test:secret-boundary`, `test:no-supabase`, `test:no-self-service-claim`, `docker pull postgres:16`, `db:verify`, `test:integration`, `build`, `e2e`, `e2e:acceptance`. Against the ten, CI adds `test:no-self-service-claim` (P1.2, `547da68`) and the `docker pull` preparation step. The build runs twice: once embedded in `test:secret-boundary` (`scripts/assert-secret-boundary.mjs` calls `next build` with sentinel values) and once as the separate `Build` step.

## 4. New regression evidence

Status is **passed** only where CI run 37169934797 executed the named tests (file list taken from its log). Every file below appears in that log.

| Family | Exact test(s) | Status | Failure / skip / blocker | Evidence |
|---|---|---|---|---|
| SSRF and safe website collection | `packages/scan-engine/src/safe-website-fetch.test.ts`, `lib/evidence/safe-media.test.ts`, `lib/website/checks.test.ts`, `test/integration/neon-website-verification.integration.test.ts` | passed | none | CI 37169934797 steps 8, 14 |
| Last-owner/concurrent membership safety | `test/integration/neon-membership.integration.test.ts`, `app/api/workspaces/[workspaceId]/members/route.test.ts`, `…/members/[memberId]/route.test.ts` | passed | none | steps 8, 14 |
| Paid-route fail-closed and input limits | `app/api/scan/process/route.test.ts`, `app/api/business/search/route.test.ts`, `app/api/business/ig-search/route.test.ts`, `lib/security/rate-limit.test.ts`, `lib/budgets/{ai,config,messages,pause,scan}.test.ts`, `lib/preview/limits.test.ts`, `test/integration/neon-scan-claim-budget.integration.test.ts`, `test/integration/neon-ai-spend.integration.test.ts` | passed | none | steps 8, 14 |
| Auth/claim/WhatsApp-LINE eligibility/context | `lib/identity/*.test.ts` (11 files), `app/auth/callback/route.test.ts`, `app/auth/callback/viewer-grant.test.ts`, `app/api/oauth/google/claim/{start,callback}/route.test.ts`, `app/api/owner/magic-link/route.test.ts`, `app/api/workspaces/claim/route.test.ts`, `lib/workspace/claim*.test.ts`, `test/integration/neon-identity.integration.test.ts`, `neon-owner-sign-in-completion.integration.test.ts`, `e2e/acceptance/{guided-sign-in,returning-sign-in,claim-and-market,permissions}.spec.ts` | passed | Fixture identity only; hosted Google and mail are §5 rows | steps 8, 14, 18 |
| Consent/coverage/partial and stalled scan | `lib/scan/consent.test.ts`, `lib/scan/consent-gate.test.ts`, `lib/funnel/scan-progress.test.ts`, `app/api/scan/status/route.test.ts`, `components/scanning-page.test.tsx`, `lib/scan/fixtures.test.ts`, `packages/scan-engine/src/processor.test.ts`, `e2e/acceptance/public-funnel.spec.ts` | passed | `public-funnel.spec.ts` HK case failed once in push run 37170768091 (timeout) | steps 8, 18 |
| Saved-draft truth and compatible agent | `lib/workspace/runs.test.ts`, `lib/workspace/evidence-inputs.test.ts`, `lib/workspace/workflow-inputs.test.ts`, `lib/workspace/templates.contract.test.ts`, `lib/agents/agents.test.ts`, `test/corpus/workflows/corpus.test.ts`, `test/integration/neon-artifacts.integration.test.ts`, `e2e/acceptance/merchant-loop.spec.ts` | passed | `merchant-loop.spec.ts:54` "missing LLM output" failed once in push run 37170768091 (`ECONNRESET`) | steps 8, 14, 18 |
| Immutable-version approval and delivery idempotency | `test/integration/neon-workflow.integration.test.ts`, `app/api/actions/[actionId]/versions/route.test.ts`, `app/api/versions/[versionId]/versions.test.ts`, `lib/workspace/usage.test.ts`, `lib/security/export-column-contract.test.ts`, `e2e/acceptance/merchant-loop.spec.ts` (HK and TW) | passed | none | steps 8, 14, 18 |
| Assisted operations/invitation/notification | `test/integration/neon-assisted-assignment.integration.test.ts`, `lib/workspace/assisted-assignment.test.ts`, `lib/auth/operator*.test.ts`, `app/api/access-requests/route.test.ts`, `app/api/ops/access-requests/[requestId]/route.test.ts`, `app/api/workspace-invites/magic-link/route.test.ts`, notifications route and component tests, `lib/mail/*.test.ts`, `test/integration/neon-mail-outbox.integration.test.ts` | passed | Invitation delivery and report recovery are not built (P2.5 items 29–30) | steps 8, 14 |
| Durable lifecycle/scheduling | `test/integration/neon-{cron-dispatch,execution,completion,dead-letter,dead-letter-condition,failures,rescan,scan-pause}.integration.test.ts`, `app/api/cron/dispatch/route.test.ts`, `lib/scheduler/*.test.ts`, `lib/workspace/run-reaper.test.ts`, `lib/repositories/action-run-reaper.test.ts`, `tests/cron-registration.test.ts` | passed | Fake clocks only; no hosted tick | steps 8, 14 |
| Billing/allowance/seats | `app/api/webhooks/stripe/route.test.ts`, `…/route.unconfigured.test.ts`, checkout and portal route tests, `lib/commercial/*.test.ts`, `lib/workspace/{billing,entitlement}.test.ts`, `components/workspace/billing-view.test.tsx`, `e2e/acceptance/permissions.spec.ts` ("lite permits three distinct approved deliveries and blocks the fourth") | passed | No seat policy exists to test (DEC-08) | steps 8, 18 |
| Authorized comparison and metric definitions | `lib/report/comparison/{derive,load}.test.ts`, `lib/report/scan-metrics/*.test.ts`, `lib/workspace/{measurements,metrics,snapshots}.test.ts`, `packages/scoring/src/diff.test.ts`, `test/integration/neon-{report-comparison,snapshots,value-report}.integration.test.ts`, `e2e/acceptance/report-scan-{comparison,metrics}.spec.ts` | passed | No successful pair in a browser (R11) | steps 8, 14, 18 |
| Mobile/desktop/accessibility behavior | `e2e/report-dashboard.spec.ts` and `e2e/acceptance/report-dashboard.spec.ts` (375 and 1440 widths, keyboard), `e2e/acceptance/guided-sign-in.spec.ts` (375 and 1440 in three locales, keyboard), `e2e/acceptance/report-scan-metrics.spec.ts`, `e2e/owner-shell.spec.ts`, `tests/ui-components.test.tsx` | passed | Both Playwright configs define one `Desktop Chrome` project; there is no dedicated mobile project (R10). Mobile coverage is per-spec viewport resizing. | steps 17, 18 |
| Phase 4 offers/packs/assistant/conditional scope | `test/integration/neon-{offers,offer-freshness,work-packs,work-packs-flag-off,assistant-signals,assistant-flag-off,assistant-live,preview-events,preview-flag-off}.integration.test.ts`, `lib/workspace/offer*.test.ts`, `lib/workspace/packs.test.ts`, `lib/assistant/*.test.ts`, `lib/preview/*.test.ts`, `e2e/acceptance/{offer-promotion,work-pack,contextual-assistant,preview-draft}.spec.ts` | passed | P4.6 connector: not run — outside this phase | steps 8, 14, 18 |

`e2e/live/business-search.spec.ts` and `e2e/neon-auth/session.spec.ts` are excluded from both Playwright configs and did not run anywhere: not run.

## 5. Hosted acceptance

Candidate deployment for every row: `dpl_E2HNGePLBHpdDVNzejLTZVrBepqN` (`080ddf6`) on `smeassistant.vercel.app`. Each row's runbook is the section of [`HOSTED-ACCEPTANCE-CHECKLIST.md`](HOSTED-ACCEPTANCE-CHECKLIST.md) named in the scope column.

| Scenario | Authorized scope/reference | Status | Candidate deployment | Safe entity/receipt IDs | Evidence and limitation |
|---|---|---|---|---|---|
| R2 environment inventory | DEC-03 (read-only inventory); checklist §1 | **passed** (names/presence only) | `dpl_E2HNGePLBHpdDVNzejLTZVrBepqN` | project `prj_Hbox4o4NhM3p0yxRxmY8Xq1mjtb5` | `vercel-facts.md`, read 2026-10-04 by the controller: 52 production names present, `hiddenProductionEnvCount = 0`; absences listed in §1. **Values were not read or decrypted**, so value validity, fail-closed configuration and flag values (`WORKSPACE_CLAIM_VIA_OAUTH_ENABLED`, `SCAN_SOURCES`, `REPORT_RECOVERY_ENABLED`, `EVIDENCE_SNAPSHOT_*`) are not verified. Vercel flags `BLOB_READ_WRITE_TOKEN` and `NEON_AUTH_BASE_URL` as `readable-secret` (§7). |
| Migration applies `0001`–`0013` (**owner-reported, not independently verified**) | DEC-11 owner actions; checklist §2 | not run (independent check) | n/a (database) | journal rows 1–13 expected | Owner-reported: `0005`–`0008` 2026-09-24; `0011` 2026-10-02; `0012` 2026-10-03 (production; test branch not mentioned); `0013` 2026-10-04; `0009`–`0010` implied by `apply-0011.sql`'s journal precondition; `0001`–`0004` from the Neon migration with no repository application record. The read-only journal query in checklist §2 would verify names and checksums. |
| R3 HK usable live scan | DEC-04 budget and named HK business: not recorded; checklist §16 | not run | — | — | Blocked by missing DEC-04 authorization and budget. |
| R3 TW usable live scan | DEC-04: not recorded; checklist §16 | not run | — | — | Same precondition. |
| R4 hosted magic link | DEC-05 recipients: not recorded; checklist §5 | not run | — | — | Needs an authorized recipient and an eligible report or invitation. |
| R5 completed Google sign-in | DEC-03 test account: not recorded; checklist §6 | not run | — | — | Root cause fixed locally (`fb24b94`); hosted confirmation outstanding. |
| R6 positive Google claim | DEC-03 test account and managed business: not recorded; checklist §7 | not run | — | — | Also depends on `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED`, whose value is unverified. |
| R6 negative manager/claim case | DEC-03: not recorded; checklist §4 | not run | — | — | Needs a Google account that does not manage the scanned business. |
| R7 HK approved first export | DEC-04 (model spend) and an existing HK test workspace: not recorded; checklist §11 | not run | — | — | — |
| R7 TW approved first export | DEC-04: not recorded; checklist §11 | not run | — | — | — |
| Phase 2 FAQ/website-basics workflows | DEC-04: not recorded; checklist §12 | not run | — | — | — |
| Phase 2 assisted no-GBP assignment | DEC-06: undecided; checklist §9 | not run | — | — | Off in production (`OPERATOR_EMAILS`, `ASSISTED_ASSIGNMENT_ENABLED` absent). |
| Phase 2 application mail/invitation/recovery | DEC-05 and DEC-07: undecided; checklist §10 | not run | — | — | Application mail closed (`APPLICATION_MAIL_APPROVED` absent). Invitation delivery and report recovery are not built (P2.5 items 29–30). |
| Phase 3 actual scheduled/resumed work | DEC-10: undecided; checklist §18 | not run | — | — | `CRON_SECRET` present (value unread); no observed cron invocation. |
| R8 authorized Stripe test transitions | DEC-08 and DEC-09: undecided; checklist §19 | not run | — | — | Billing closed (`COMMERCIAL_CONTRACT_APPROVED` absent). |
| R11 successful comparable pair | DEC-04 for two scans: not recorded; checklist §17 | not run | — | — | Needs two authorized, comparable scans of one place. Rescan is paid-tier only (403 `tier_required` on lite) and billing is closed, so this may depend on R8. |
| Candidate `launch:check` | No authorization needed beyond the owner's choice to send anonymous probes; checklist §3 | not run | — | — | `corepack pnpm launch:check --origin https://smeassistant.vercel.app …` exists (`package.json`, `scripts/launch-check.mjs`). |
| Conditional preview/connector acceptance | Preview: see the `PREVIEW_DRAFT_ENABLED` row. Connector: DEC-13 not authorized | not run | — | — | P4.6 not built: not run — outside this phase. |
| Phase 4 flag: `OFFER_PROMOTIONS_ENABLED` (offers) | DEC-04 for model spend; DEC-14 safe default; checklist §13 | not run | — | — | Flag absent. Owner-reported `0011` applied. |
| Phase 4 flag: `WORK_PACKS_ENABLED` (work packs) | DEC-04; DEC-14 safe default; checklist §14 | not run | — | — | Flag absent. Owner-reported `0012` applied to production. |
| Phase 4 flag: `CONTEXTUAL_ASSISTANT_ENABLED` (contextual assistant) | No spend (no model call); owner flag decision; checklist §8 | not run | — | — | Flag absent. No migration needed. |
| Phase 4 flag: `PREVIEW_DRAFT_ENABLED` (preview draft) | DEC-12 decided; **DEC-04 real-model evaluation required first**; DEC-11 for `0013`; checklist §15 | not run | — | — | Flag absent. Owner-reported `0013` applied. Default caps: 50 per day, US$2 per day. |

A local mock, fixture email, redirect to a provider, a successful button render or an HTTP 201 alone cannot fill a hosted success cell.

## 6. Read-only manual observations

None recorded.

## 7. Data, security and operating review

```text
Migrations added (next valid numbers):
  0005_owner_removal_guard, 0006_action_applications, 0007_action_verification,
  0008_workspace_internal, 0009_scan_attempts, 0010_mail_outbox, 0011_offers,
  0012_work_packs, 0013_preview_events (neon/migrations/). Runner discovery is
  glob-based (scripts/neon/migrations.ts). CI db:verify: 0001-0013, replay [],
  41 tables / 486 columns / 203 constraints / 106 indexes / 8 triggers / 20 functions.
  Hosted state: owner-reported only (§1).

Prior migrations unchanged:
  The runner refuses any journal checksum mismatch (migration_checksum_mismatch,
  scripts/neon/migrations.ts), and CI db:verify replays the journal with an empty
  replay set. The 0001-0004 hashes are recorded in docs/integration/NEON-CUTOVER.md.
  0013 was edited on its branch (Ruling R11) before merge and before any hosted
  apply; apply-0013.sql embeds the final checksum 98ec68e1...cf24 (PHASE-4-REPORT.md).

Runtime-role grants and privileged function review:
  No migration contains SECURITY DEFINER (grep over neon/migrations). 0004 and 0013
  define SECURITY INVOKER functions. Runtime access is granted to sme_app_runtime
  only, and tables use RLS with the server_application policy (0003 and later).
  Tables are owned by the NOLOGIN role smeassistant_migrator; hosted applies run as
  neondb_owner with SET LOCAL ROLE (rollout/apply-00NN.sql headers).

Concurrency/idempotency evidence:
  Last-owner trigger with concurrent removal (neon-membership); single-claim lease
  and budget lock (neon-scan-claim-budget); exactly-once export counting
  (neon-workflow); idempotent pack start under concurrent 23505 (neon-work-packs);
  atomic claim_preview_slot under one advisory lock (neon-preview-events); Stripe
  event dedup in FOR UPDATE (Traceability P1.7). All in CI 37169934797.

Tenant/location and report-grant boundary review:
  Membership and location_scope checks on every route handler (requireMembership,
  pack and offer routes check stored and new location, R9). Preview eligibility
  requires the job's own viewer grant (lib/preview/eligibility.ts). Assistant
  suggestions filter workspace_id after the membership check (Traceability P4.3).

Approval/export authority preserved:
  approve_output_version / export_output_version re-created in 0011 as the 0004
  bodies plus an offer freshness check (offer-sql.test.ts body diff). Packs,
  assistant and preview add no approval, export or usage write (Traceability
  P4.2, P4.3, P4.5).

Provider spend/budget controls:
  P3.5a budgets (code defaults 200 scan attempts and US$20 AI per 24 h; placeholders,
  not decisions); kill switches SCANS_PAUSED and AI_DRAFTS_PAUSED (absent, so not
  paused); provider-spending routes fail closed; preview caps 1 per grant, 3 per job,
  5 per IP per day, 50 per day, US$2 per day (DEC-12). No DEC-04 ceiling is recorded.

Secret-boundary and logging review:
  test:secret-boundary passed across 60 public artifacts (both CI runs). Logs carry
  { category } only on the preview route (Traceability P4.5).
  FINDING (owner configuration): Vercel stores BLOB_READ_WRITE_TOKEN and
  NEON_AUTH_BASE_URL as "encrypted" (readable) rather than "sensitive" and flags both
  securityIssues ["readable-secret"]; every other secret-bearing variable is
  "sensitive" (vercel-facts.md). Recommendation: the owner re-saves both as
  Sensitive in the Vercel dashboard (checklist §1, step 6). No value was read.
  Observation: Playwright's failure call log in push run 37170768091 prints the
  owned local fixture's session cookie header. It is a disposable fixture value,
  not a production credential.

Private media / ownership evidence handling:
  Website fetches go through safe-website-fetch (HTTPS-only, DNS-pinned, redirect
  revalidation, size cap). Evidence snapshot retention is gated by
  EVIDENCE_SNAPSHOT_*_ALLOWED; both are present in production but their values were
  not read. Ownership is proven by Google attestation or (when enabled) an
  authorized operator; OWNER_SELF_SERVICE_CLAIM is absent and guarded at build time.

Existing-data compatibility / backfill scope:
  All migrations after 0004 are additive (nullable column, new tables, re-created
  functions with identical behaviour for existing rows). No data backfill exists.
  Code since a71c5df reads actions.offer_id unconditionally, so it needs 0011
  (owner-reported applied 2026-10-02).

Known operational failures and recovery:
  2026-09-18 production 500 "home lookup failed" (missing 0005-0008); cause and fix
  owner-reported 2026-09-24. Open residuals: M2 (a budget-refused rescan spends a
  daily rescan), M5 (rare claim/delete deadlock, recovered by retry), M7 (no index
  for the pending count) (PHASE-3-REPORT.md P3.5a); a pause needs a redeploy
  (P3.5d); mail held rows are terminal (P3.5c); CI push run 37170768091 failed two
  acceptance cases that passed on the same tree in 37169934797 (cause not
  investigated).
```

## 8. Rollout and data-preserving rollback

```text
Authorized rollout target:
  None recorded. Production already serves 080ddf6 (dpl_E2HNGePLBHpdDVNzejLTZVrBepqN)
  because main auto-deploys. Activating any flag below is a separate owner action.

Features enabled/disabled:
  Off (absent): OFFER_PROMOTIONS_ENABLED, WORK_PACKS_ENABLED,
  CONTEXTUAL_ASSISTANT_ENABLED, PREVIEW_DRAFT_ENABLED, ASSISTED_ASSIGNMENT_ENABLED,
  OPERATOR_EMAILS, COMMERCIAL_CONTRACT_APPROVED, APPLICATION_MAIL_APPROVED,
  OWNER_SELF_SERVICE_CLAIM. Present, value unverified: WORKSPACE_CLAIM_VIA_OAUTH_ENABLED,
  SCAN_SOURCES, REPORT_RECOVERY_ENABLED, EVIDENCE_SNAPSHOT_*.

Pre-deploy gates:
  CI verify green on the candidate tree (37169934797). Before any flag activation,
  re-run CI on main (or explain) because push run 37170768091 failed e2e:acceptance,
  and fill the local column in §3.

Migration order and backward compatibility:
  0001 -> 0013 in order. Each rollout/apply-00NN.sql refuses unless the journal is
  exactly the preceding prefix, and refuses a second run. Run in the Neon SQL Editor
  as neondb_owner, on a Neon test branch first, then production. 0011 had to precede
  the P4.1 deploy; 0012 and 0013 are harmless before their flags are set. All are
  additive and are never rolled back.

  Per flag (each env change takes effect on the next deployment):
  OFFER_PROMOTIONS_ENABLED: needs 0011 -> set exactly "true" -> redeploy.
    Rollback: unset -> redeploy. Offer page and routes 404; new runs on offer actions
    answer agent_unavailable; existing offer actions and versions stay approvable and
    exportable under the SQL freshness guard.
  WORK_PACKS_ENABLED: needs 0012 (else Start fails, pack routes 503) -> set "true" ->
    redeploy. Rollback: unset -> redeploy. Home returns to the Fix Pack card; packs
    and their actions stay.
  CONTEXTUAL_ASSISTANT_ENABLED: no migration -> set "true" -> redeploy.
    Rollback: unset -> redeploy. Suggestions return []; the two new intents 404.
  PREVIEW_DRAFT_ENABLED: needs 0013 (else every preview answers unavailable) and the
    DEC-04 real-model check -> set "true" (optionally PREVIEW_DRAFT_DAILY_LIMIT,
    PREVIEW_DRAFT_USD_DAILY) -> redeploy. Rollback: unset -> redeploy. Card gone,
    /start and the route 404; preview_events rows stay.

Post-deploy observations:
  Cron dashboard shows 200 for /api/cron/dispatch; incident queries
  (rollout/incident-queries.sql, read blocks) for backlog, spend and mail;
  PREVIEW-METRICS.md queries after the preview flag is on.

Disable/rollback trigger:
  Any failed checklist scenario on a flagged feature; unexpected spend against the
  DEC-04 ceiling; a 5xx on owner pages; a refusal or authorization result that
  contradicts the checklist's expected behaviour.

Safe rollback or forward-fix procedure:
  Feature: unset its flag and redeploy (above). Spend: SCANS_PAUSED=true or
  AI_DRAFTS_PAUSED=true and redeploy (INCIDENT-RUNBOOK.md). Code: Vercel promote of
  dpl_CggHy5YZ6nshqdhaqrZqTP81YFwe (8582a7c) or dpl_GX5ZokPgkFRdx1crc9Xy8t1ca5Nj
  (ecc60df); schema stays at 0013. Running that older code against the newer
  additive schema is expected to work but was not tested. Never drop a migrated
  table or delete rows as a rollback.

Data that must be preserved:
  audit_events, deliveries, workspace_usage, output_versions, action_runs, actions,
  offers, work_packs, work_pack_items, preview_events, mail_outbox, scan_attempts,
  scan_events, agent_runs, workspace_tier_events, consent_records,
  neon_migrations.journal.

Authority required to execute rollout/rollback:
  The owner (Willy) for Vercel environment changes, redeploys and promotions, and
  for Neon SQL Editor applies (DEC-11). Spending scenarios need DEC-04; mail DEC-05
  and DEC-07; assisted assignment DEC-06; billing DEC-08 and DEC-09; scheduler
  DEC-10; publishing DEC-13.
```

## 9. Decision

| Question | Evidence-based answer |
|---|---|
| Implementation scope complete? | **Yes, for Phases 1–4 core plus P4.5, with P4.6 excluded** (not built, DEC-13). Inside that scope, P2.5 items 29–30 are blocked on DEC-07 and backlog item 5 is deferred (§2). |
| All required local gates actually passed? | **CI:** yes on the candidate tree in run 37169934797 (all 12 gate steps passed). On the exact commit, push run 37170768091 **failed** `e2e:acceptance` (2 of 42; all other gates passed). **Local run:** pending (controller fills). Answer to be finalized with the local results. |
| Hosted verification complete for the advertised scope? | **No.** Only R2 names/presence passed. Every other §5 row is not run. Migration applies are owner-reported, not verified. |
| Commercial/operating choices approved? | No. DEC-03 to DEC-10, DEC-13 and DEC-14 are undecided; DEC-12 is decided (2026-10-04) for the preview only (`BUSINESS-AND-HOSTED-DECISIONS.md`). |
| Remaining blockers / not-run scenarios | Every §5 row except R2; the authorization record and DEC-04 budget; the push-run acceptance failure; the `readable-secret` configuration finding; the local gate results. |
| Safe independent next work | Fill the local column (Phase B). Re-run CI on `main` and investigate the two acceptance failures. Owner: checklist §1–§3 (free, read-only). Re-save the two variables as Sensitive. |
| Release decision / authorizer | **Not ready to claim a verified release**, pending the hosted checklist and owner authorization. Implemented and locally verified in CI; not hosted verified. Authorizer: the owner (not given). |

Keep **implemented**, **locally verified** and **hosted verified** separate. An unexecuted test remains not run; a release is not ready merely because documentation was updated.
