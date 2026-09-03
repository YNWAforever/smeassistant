# Phase 0 discovery report — playbook drift audit

**Date:** 2026-09-03 · **Status:** Phase 0.1 (discovery) complete; Phase 0.2/0.3 **not executed** — stopped per the playbook's own rule ("if something in this file contradicts the code you find, stop and report").

> **Decision recorded 2026-09-03 (Willy):** integrate against **`origin/main`** (decision 1a below). Consequences: the playbook is regenerated against `b9b4151f` as `CLAUDE.md` in this repo; a full upstream checkout lives at `C:\Users\laich\Documents\sme-scanner-upstream` (pinned to `b9b4151f`) and becomes `SME_SCANNER_SRC`; the stale `smescanner` checkout is no longer a source. See §10.

| Source | What it is | Revision |
|---|---|---|
| PLAYBOOK | `C:\Users\laich\Downloads\CLAUDE.md` (1,178 lines) | as downloaded |
| STALE | `C:\Users\laich\Documents\smescanner`, local `main` — the checkout the playbook was written against | `8415a327` (2026-08-09) |
| WORKTREE | `smescanner\.worktrees\report-read-render-module`, branch `codex/report-read-render-module` | `073270ce` |
| ORIGIN | `YNWAforever/sme-scanner` `origin/main` (read-only depth-1 clone in the session scratchpad) | `b9b4151f` (2026-08-27, PR #86) |
| PROTO | `YNWAforever/smeassistant`, cloned to `C:\Users\laich\Documents\smeassistant` | `9b37f41` |

**Method.** Eight verifier agents checked every playbook claim against the four trees (181 findings, 73 overlap rows). Eleven skeptic agents then re-read the sources for all 85 medium-or-higher discrepancies: 84 upheld, 1 refuted, merged into 49 groups. Key facts were re-checked by hand (git history, PR states, tooling). Every tree was read-only throughout.

---

## 1. Executive summary

- **The playbook targets the wrong backend.** It pins sme-scanner at `8415a327`, which exists only on this laptop and on the remote branch of a **closed, unmerged** PR (#55). GitHub's `main` diverged from it on 2026-07-05 and is now **117 commits ahead** (`b9b4151f`). The Phase 0 check "expect 8415a327 or newer" gives a false green on this machine and can never be satisfied by upstream.
- **Upstream already built most of Phases 1–6, in different shapes, on the same Supabase project.** `origin/main` has 28 migrations (the playbook lists 7), tables named `workspaces`, `workspace_members` and `agent_runs` with columns that differ from the playbook's `0100_workspace_layer.sql`, a different job-lease design (`claim_audit_job`), a coverage-aware scorer, Supabase magic-link auth, Google Business OAuth, Stripe billing, monthly re-scans via a Cloudflare scheduler, Fix Pack agents with owner approval, email notifications and team roles. Because the playbook uses `create table if not exists`, its migrations would silently no-op against those tables and later code would break or write into live upstream data.
- **The code the playbook vendors was rejected or replaced upstream.** The scan-execution module and its `claim_scan_job / finalize_scan_job / fail_scan_job` lease live only in the 13 unpushed local commits; PR #56 explicitly refused to adopt them. The report module in the worktree was PR #55 (closed 2026-08-10) and was replaced by PR #56's `load-report.ts` / `view-model.ts`. `packages/scoring` on STALE still emits the 50 / 20 / 50 placeholders that upstream removed on 2026-07-14.
- **The prototype inventory is accurate.** Every file, export, enum, intent count, design token and dependency named in §1.1 checks out in `smeassistant`; the only prototype-side findings are scope understatements (hard-coded demo identity in ~50 places, header offsets in three stylesheets, a private helper).
- **Tooling gaps:** `pnpm` is not on PATH (only via `corepack`, and the prototype has no `packageManager` pin so corepack would hand out pnpm 11), the Supabase CLI is not installed and upstream dropped it in favour of hand-applied migrations, and the prototype requires Node ≥ 22.13 rather than the playbook's ≥ 20.
- **Nothing was changed** in `smescanner`. `smeassistant` was cloned, the branch `feat/visibility-workspace-integration` created, and this file written (uncommitted). No install, migration, push, deployment or paid call was run.

**Decision that unblocks everything:** which sme-scanner base the integration is against (§8, decision 1). Recommended: regenerate the playbook against `origin/main b9b4151f`.

---

## 2. Environment and checklist results

Phase 0.1 checklist (playbook lines 847–858), run read-only with `SME_SCANNER_SRC=C:\Users\laich\Documents\smescanner`:

| Check | Result |
|---|---|
| `test -d $SME_SCANNER_SRC` | OK. `../smescanner` also resolves now that `smeassistant` sits beside it. |
| `git log --oneline -3` (expect `8415a327` or newer) | `8415a327`, `1ff610ba`, `54332d19`. **But** `8415a327` is not an ancestor of `origin/main` (merge-base `cc472948`, 2026-07-05); `origin/main` = `b9b4151f` (2026-08-27), 117 ahead / 13 behind. Only `origin/codex/report-read-render-module` contains `8415a327`. |
| `ls .worktrees/report-read-render-module/apps/web/lib/report` | `store.ts`, `prepare.ts`, `language-service.ts`, `top-priorities.ts` + 4 tests present. The branch is PR #55: **CLOSED, not merged** (2026-08-10). |
| `git branch -a \| grep report-read-render` | Local (checked out in the worktree) and `remotes/origin/codex/report-read-render-module`. |
| `grep -rn "supabasePublic("` | One hit: the definition at `apps/web/lib/supabase.ts:11`. Zero callers in STALE, WORKTREE and ORIGIN. The question is moot: ORIGIN already enabled RLS and revoked `anon`/`authenticated` on every scanner table (`20260714_trust_foundation.sql:249-274`, `20260717022612_harden_server_only_grants.sql:8-32`). |
| `ls supabase/migrations` (expect 7) | 7 in STALE. **28 on `origin/main`.** STALE's 7th file (`20260808144027_scan_execution_leases_and_finalization.sql`) is local-only and was never applied anywhere (`docs/superpowers/plans/2026-08-08-scan-execution-module.md:888`). |
| `node -v && pnpm -v` | `v24.18.0`; **`pnpm: command not found`** (bash and PowerShell). `corepack pnpm -v` → 9.12.0 inside smescanner (pinned), 11.7.0 inside smeassistant (no `packageManager` field). |
| `package.json` pins `next@16.2.6`, `react@19.2.6` | Confirmed (`package.json:29,32,34`), exact pins. |
| `components/ui/*` untouched | 56 primitives, clean at `9b37f41`. |
| `app/ramp-refresh.css` ≈ 3.1k lines | 3,099 lines (`globals.css` 83, `responsive.css` 61). |
| Imports to remove | `cloudflare:workers` → `db/index.ts:1`; `vinext` → `vite.config.ts:1`, `worker/index.ts:2-3`; `@/app/chatgpt-auth` → `app/[...path]/page.tsx:2`. No `@/db` import exists outside `examples/d1`. |

Additional tooling facts:

| Tool | State |
|---|---|
| Supabase CLI | Not on PATH. STALE has it only as a `node_modules/.bin` shim (root devDependency `supabase 2.113.0`, added in local-only commit `3cdc07d8`). ORIGIN removed the dependency on 2026-08-01 and applies migrations by hand after `supabase/verify-migrations.sh` (needs a local postgresql-16). |
| Docker | Docker Desktop 29.7.2 running; `postgres:16` image cached (ORIGIN's integration tests need it). |
| Playwright | Chromium builds 1161/1223/1228/1234 cached; 1228 matches `@playwright/test 1.61.1` used upstream. |
| GitHub | `gh` authenticated as `YNWAforever`. Open PR upstream: #87 "schema-drift check against the live database". |
| Vercel | Via the Vercel connector: a project named `sme-scanner` exists under the hobby team "ynwaforever's projects". SETUP.md documents a second project `sme-scanner-tw` on the same database. |
| smescanner working tree | Pre-existing uncommitted change to `apps/web/middleware.ts` (+22 lines, `x-next-intl-locale` pass-through, no upstream equivalent) plus untracked docs, `supabase/.temp/` (a project was linked on 2026-07-17) and `.pnpm-store-cli/`. Left untouched. |

---

## 3. Confirmed discrepancies (ranked)

Severity: **blocker** = Phase 0–2 as written would be wrong or dangerous (shared-database collisions, vendoring superseded code); **high** = a step cannot be executed as written; **medium** = wording wrong, intent executable; **low** = cosmetic. Finding ids refer to the audit data in the session scratchpad.

### 3.1 Blockers

| # | Playbook says | What is actually true | Evidence | Impact |
|---|---|---|---|---|
| B1 | sme-scanner `main` head is `8415a327`; "or newer" passes Phase 0 (L28, L116, L850) | `8415a327` is a diverged local fork head, present upstream only on the closed PR #55 branch. `origin/main` = `b9b4151f`, 117 commits ahead; merge-base `cc472948` (2026-07-05). No upstream commit is "newer" than the fork. | `git merge-base --is-ancestor 8415a327 origin/main` → no; `git rev-list --count main..origin/main` = 117, `origin/main..main` = 13; `gh pr view 55` → CLOSED 2026-08-10, `mergedAt: null` | Every §1.2/§1.3 statement and all of Phase 0.3 inherit the stale base. ids: history-01, env-02, db-20 |
| B2 | Vendor `apps/web/lib/{scan-execution,merchant-performance,region,…}` as `@sme-scanner/engine`; keep `/api/ingest` (D1, L121–127, L878) | Upstream already extracted the same code into `packages/scan-engine` (`@sme-scanner/scan-engine`, 60 files) and `packages/region` (`@sme-scanner/region`) in PRs #80/#81; `apps/web/lib/scan-execution` never existed upstream; `/api/ingest` was deleted in PR #54. `AuditJobRow` gained 13 columns and `llmComplete` now returns `LLMResult \| null` (`{text, usage}`). | ORIGIN `packages/scan-engine/package.json`, `packages/region/package.json`; `git ls-tree origin/main apps/web/lib/scan-execution` empty; commits `4d07fe88` (#56), `f4d97fb3` (#80), `25f360a1` (#81), `aad72b65` (#54); ORIGIN `apps/web/lib/types.ts:20-57`, `lib/llm.ts:97` | Phase 0.3 step 2 recreates an older copy of packages that exist, under a new name, diverging from the backend that writes the shared database. ids: engine-01, scanexec-03, overlapbe-01, env-21, history-02 |
| B3 | Shared DB has `scan_claim_token / scan_lease_expires_at / scan_attempt`, RPCs `claim_scan_job / finalize_scan_job / fail_scan_job`, 10-minute lease (§1.3 L136–146, D7) | Those exist only in STALE's local migration `20260808144027`, whose plan records it was never applied. The deployed design is `claim_audit_job(p_job_id)` (security definer, `attempt_count` / `last_attempt_at` / `processing_stage`, lease widened to 30 min in `20260821000001`), with a cron reaper. Upstream's status CHECK rejects the `'running'` value `claim_scan_job` writes. PR #56's spec: "Do not add migrations or introduce the stale claim_scan_job … contract." | STALE `20260808144027:53-58,109`; ORIGIN `20260714_trust_foundation.sql:36-53, 281-298`; `20260729000000_scan_claim_lease.sql:24-57`; `20260821000001_widen_claim_lease.sql:23-48`; ORIGIN `docs/superpowers/specs/2026-08-11-current-base-scan-report-boundaries-design.md:5,24`; README.md:46-56 | Copying the 7 files "verbatim" installs a second, competing lease on the same `audit_jobs` rows, and the first real scan fails at the missing RPC. ids: history-03, overlapdb-04/05, overlapbe-05 |
| B4 | 7 migration files, copied verbatim so history is complete (L129, L243, L854, L882) | `origin/main` has 28 (the same first 6 + 22 newer). They add 17 tables, 13 `audit_jobs` columns, RPCs, RLS/grants and a storage bucket; README/SETUP describe them as the applied corpus. | `git ls-tree origin/main supabase/migrations` = 28; `git log origin/main..main -- supabase` = `7e87ce67` only | Vendored history would be incomplete and contain one file that must never be pushed. ids: db-10, overlapdb-07, env-06, history-04 |
| B5 | `0100_workspace_layer.sql` creates `workspaces`, `workspace_members`, `agent_runs` (L463–489, L546–555) | All three already exist upstream with incompatible shapes: `workspaces` (business_name, tier lite\|paid, stripe_customer_id, notify_*, instagram_handle; no slug/plan_key/is_demo/created_by), `workspace_members` (email invites, accepted_at, one-owner index, orphan-delete trigger), `agent_runs` (job_id + finding_key Fix Pack drafts, status draft\|approved\|rejected). `create table if not exists` silently no-ops. | `20260801000000:19-31`, `20260822000000_workspace_members.sql:20-36,56-69,97-103`, `20260818000000_agent_runs.sql:17-32`, `20260826000000:48-50` | Every later step reading the playbook's columns fails, or writes into tables the legacy owner dashboard, Stripe webhook and invites depend on. ids: overlapdb-01/02/03, overlapbe-06 |
| B6 | Take `report/{store,prepare,language-service}.ts` from the worktree branch (L124, L409–410, L880, L912) | That branch is PR #55, closed unmerged. Upstream merged PR #56 (`4d07fe88`) with a different `ReportStore` (`readPublicJobBySlug`, `readAuthorizedJobData`, `findViewerGrant`, …), a different `ReportLanguageService` (`resolveSummary`), and `load-report.ts` / `view-model.ts` replacing `prepareReport`; it reads `module_results`, `score_coverage`, `scoring_version`, `report_access_grants` and approved `agent_runs`. | `gh pr view 55/56`; `git log origin/main -- apps/web/lib/report/prepare.ts` empty; ORIGIN `lib/report/store.ts:7,68-77`, `language-service.ts:9-15`, `load-report.ts:78` | Phase 1's report page would be built on a data contract that no longer exists upstream. ids: engine-02, history-05, overlapbe-17 |
| B7 | Copy `packages/scoring` verbatim; legacy `score()` untouched; add `coverageAwareScore()` wrapper (L120, D8, §3.5.2, L1107) | STALE's scorer (always-numeric overall, 50/20/50 placeholders) is the early-July version. Upstream replaced it (11 commits, 2026-07-14 → 08-17): `ModuleStatus measured\|unavailable\|unsupported\|failed`, `score: null` when missing, `overall: null` unless ≥ 2 of ig/gbp/aeo measured, `coverage`, `scoringVersion "2026-08-16"`, `diffScans`; `prompts.ts` removed. Lead scoring that "depends on legacy numbers" was retired on 2026-08-05. | STALE `packages/scoring/src/modules/{ig,gbp,aeo}.ts:7-9`; ORIGIN `index.ts:23-43,56,62`, `types.ts:304-321`; `git log main..origin/main -- packages/scoring` | The wrapper rebuilds what exists and would write old-shaped rows the live report renders as "low confidence". ids: db-19, overlapbe-02 |
| B8 | `/api/scan/start` triggers `GET /api/scan/process` via `after()`; process "kept" with `maxDuration = 300`; a Vercel sweep cron retries (D7, L376, L385, L872, L999) | Neither tree uses `after()`: the scanning page triggers processing (GET on STALE, `POST {jobId}` on ORIGIN); STALE has no `maxDuration` anywhere; ORIGIN runs `GET /api/cron/run-queued` every 5 min from a Cloudflare Worker because the Vercel account is on Hobby (daily crons only). That reaper claims the oldest `queued` row in the shared table regardless of which app created it, using `claim_audit_job`. | STALE `scanning/[jobId]/page.tsx:45`, `process/route.ts:7-9`; ORIGIN `process/route.ts:13,17-42`, `cron/run-queued/route.ts:30,38-50`, `infra/cloudflare-scheduler/wrangler.toml:33`, `lib/scheduler/cron-registration.test.ts:10-15` | The legacy app would process smeassistant's jobs too, spending provider quota twice and writing conflicting results into the same rows. ids: overlapbe-03 (blocker), scanexec-13 (medium), scanexec-12 (refuted, see §6) |
| B9 | `POST /api/workspaces/claim` creates a workspace from a report link; `email_matched` if the sign-in email equals `leads.email`, else `unverified` but still granted (L416–423, L938, L1069–1071) | Upstream built exactly this, then switched it off permanently (`OWNER_SELF_SERVICE_CLAIM`, "LEAVE THIS OFF"): anyone holding a forwarded `share_slug` can unlock the report and write their own email, so the match proves nothing. Ownership is granted only by staff (`POST /api/staff/workspaces`) or by Google attesting GBP management (PR #82, `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED`). `audit_jobs.workspace_id` is write-once. | ORIGIN `lib/workspace/claim-scan.ts:40-49,86-100`, `.env.example:166-174`, `CLAUDE.md:98-101`, `api/report-access/unlock/route.ts:123-135` | The playbook's claim path lets strangers permanently take over real merchants' scans. id: overlapbe-14 |

### 3.2 High

| # | Playbook says | What is actually true | Evidence | ids |
|---|---|---|---|---|
| H1 | §1.2 / Phase 0.3 paths exist in sme-scanner | On `origin/main`: `apps/web/lib/scan-execution` 0 files (never existed), `merchant-performance` and `region` moved to packages (#80), `api/ingest` deleted (#54), `n8n/05_lead_routing.json` deleted (#50). | `git ls-tree -r main\|origin/main` counts 7/0, 15/0, 4/0, 2/0 | history-08 |
| H2 | Backend has no auth, no comparable scans, only job status, placeholder scores (§1.2 header, §1.4) | Upstream shipped auth, workspaces, OAuth, scheduler, diffs, billing, fix packs and notifications between 2026-07-14 and 08-27 (PRs #20–#86). | `git log --reverse main..origin/main` | history-11 |
| H3 | `audit_jobs.status ∈ queued\|running\|done\|failed` (L137, L379, L999) | STALE: plain `text`, no CHECK. ORIGIN: CHECK with `queued\|collecting\|scoring\|persisting\|done\|partial\|failed`; old `running` rows rewritten to `collecting`; `processing_stage` carries detail. Only done/partial/failed are terminal. | STALE `0001_v0_1_schema.sql:14`; ORIGIN `20260714:13-19,48-50`, `lib/db/job-state.ts:1-18` | db-02, overlapdb-06 |
| H4 | `0101_rls.sql`: `is_member()` + member SELECT policies; D4 "RLS by membership" | Upstream: RLS on, **zero policies**, all grants revoked from `anon`/`authenticated`, authorization in `lib/workspace/authorize-workspace.ts`; a hardening test fails any grant to those roles. `workspace_members.status` does not exist. | `migration-hardening-sweep.test.ts:170-215`; no `create policy` in the corpus | overlapdb-09 |
| H5 | `plans` table + `workspaces.plan_key` (free/growth/multi/managed) | Upstream: `workspaces.tier` CHECK `lite\|paid`, `workspace_tier_events` written by the Stripe webhook and staff grants; `isWorkspacePaid` gates re-scans and Fix Packs. `plan_key` would never be created. | `20260826000000:40-51`, `20260819000000:15-31`, `lib/workspace/entitlement.ts:1-49` | overlapdb-10 |
| H6 | `db:push: supabase db push`; `supabase link + db push` cut-over (L867, L1019, L1166) | Upstream has no CLI workflow: dry-run with `supabase/verify-migrations.sh`, then paste into the dashboard in filename order; `0001` cannot be re-run. | ORIGIN README.md:54, CLAUDE.md:227-232, ci.yml:68-71 | overlapdb-15 |
| H7 | Port worktree report files + `llm-summary.ts` from main | Worktree files import `SummaryInput`, which main's `llm-summary.ts:3` does not export (the worktree changed one line). Phase 0 `pnpm typecheck` fails unless that change comes too. | WORKTREE `llm-summary.ts:3`, `prepare.ts:2` | engine-03 |
| H8 | Phase 0 grep decides whether to enable RLS on legacy tables (L643–645, L853, L1110) | Already enabled with zero policies and service-role-only grants upstream. Policies as written would grant nothing; re-granting `authenticated` reopens what upstream closed. | `20260714:249-274`, `20260717022612:8-32` | db-09, overlapdb-08, overlapbe-16 |
| H9 | `scan_events` exists but is unused; reuse for collector progress (L142, L156, L382) | On `origin/main` it is the analytics log: extra columns (`anonymous_session_id`, `properties`, `dedupe_key`), unique index, RLS; written by `complete_report_unlock` and the scan engine; counted in erasure receipts. | `20260714:223-235,424-438`; `packages/scan-engine/src/analytics.ts:140-149` | db-06, scanexec-15, overlapdb-11, overlapbe-12 |
| H10 | Backend requires `business_name` + `ig_handle` (§1.4 row 1) | ORIGIN's start route makes IG optional but requires uppercase market, industry, district, locale, objective and a SerpApi identity (`place_id`/`data_id`/`data_cid` + confidence) or explicit manual entry; persists `input_snapshot` v2, `business_objective`, `place_id`, `place_match_confidence`, `parent_job_id`; rate-limited. | ORIGIN `start/route.ts:46-48,92-180` | overlapbe-10 |
| H11 | Keep `POST /api/ingest/[jobId]` for n8n "supplied" mode (L127, L358, L386) | Deleted upstream 2026-08-05; no n8n workflow runs; `N8N_WEBHOOK_SECRET` has no reader. | ORIGIN CLAUDE.md:213-220, `n8n/README.md:7-24` | overlapbe-09 |
| H12 | Backend has no concept of comparable scans (§1.4, §3.5.3) | Upstream: `audit_jobs.parent_job_id`, one `scan_diffs` row per compared pair, comparability rules in `packages/scoring/src/diff.ts` (never diff across module sets or scoring versions). The playbook's 60 % rule differs. | `20260817000000_scan_diffs.sql:17-35`, `diff.ts:1-30` | scanexec-08 |
| H13 | Report locked when `!job.unlocked`; unlock sets the flag (L326, L389–392) | Upstream ignores `audit_jobs.unlocked`: full access = `report_access_grants` row + signed `sme_report_grant` cookie minted by `complete_report_unlock`. A report unlocked in one app stays locked in the other. | `lib/report-access/authorize-report.ts:11-12,49-52`; `api/unlock/route.ts:9-11` (307 shim) | overlapbe-07 |
| H14 | Backend has no auth; build Supabase Auth with magic link + Google sign-in (L159, D4, L933) | Upstream already has three magic-link flows (staff, owner, invited member) over `@supabase/ssr` with `/auth/callback` and `/auth/owner/callback`; Google is a GBP connection, not a sign-in provider. Both apps would share one Auth project. | `lib/auth/supabase-server.ts:1-21`, `lib/auth/staff.ts:36-52`, `api/owner/magic-link/route.ts` | scanexec-11, overlapbe-13 |
| H15 | GBP OAuth modelled behind `FEATURE_GBP_OAUTH=false`; Stripe stubbed (D9, §3.10) | Live upstream: `oauth_connections` with AES-256-GCM tokens and `/api/oauth/google/{start,callback}`; Stripe checkout, portal, webhook, staff grants, market-keyed price ids (HK$888 / NT$2,800). | `20260801000000:39-58`, `api/webhooks/stripe/route.ts:110-207`, `lib/stripe.ts` | overlapbe-15 |
| H16 | `vercel.json` crons daily + every 10 min (L872, L998–999) | Hobby plan rejects sub-daily crons at deploy time (measured 2026-08-16). Upstream keeps `vercel.json` empty (enforced by test) and schedules from `infra/cloudflare-scheduler` hitting `/api/cron/dispatch` and `/api/cron/run-queued`. | `cron-registration.test.ts:10-15,34-39`; `specs/2026-08-15-scheduler-lease-spec.md:20-35` | overlapdb-14, overlapbe-04 |
| H17 | Rescan = owner button + nightly `locations.next_scan_at` loop (L308, L424, L998) | Upstream: `scan_schedules` keyed by `place_id`, staff-created, paid-only, anniversary-day spread, dispatched daily and executed by `run-queued`, which is also the retry path. No owner-triggered re-scan by design. | `20260816000000:24-34`, `api/staff/schedules/route.ts:8-49`, `lib/scheduler/dispatch-plan.ts:24,51-73` | overlapbe-25 |
| H18 | pnpm 9 available; `pnpm -v` preflight (L77, L855) | Not on PATH. Corepack resolves 9.12.0 only where `packageManager` is pinned; the prototype has no pin (→ pnpm 11.7.0). The playbook never pins or provisions it. | `which pnpm` → 127; PROTO `package.json` has no `packageManager` | env-07, db-24 |
| H19 | `supabase init/start/gen types/db push` (L867, L882, L936, L949) | CLI not installed and not in the playbook's dependency list; upstream removed it (2026-08-01). `supabase start` also needs Docker. | `Get-Command supabase` empty; ORIGIN root `package.json` has no devDependencies | env-15 |

### 3.3 Medium

| # | Playbook says | What is actually true | ids |
|---|---|---|---|
| M1 | `workspaces.claim_source_job_id references audit_jobs(id)` (L472) | A bare FK to `audit_jobs` re-breaks report erasure; upstream pins every FK's on-delete rule in `verify-migrations.sh:204-241` and CI. Use `on delete set null`. | overlapdb-13, overlapbe-24 |
| M2 | Legacy score is a fixed weighted sum; coverage/comparability are new (§1.4, D8, §3.5) | Upstream stores `score_coverage`, `scoring_version`, `module_results` on `audit_jobs`, comparability in `scan_diffs`, AI-visibility facts in `aeo_surface_snapshots`. Two sources of truth would disagree. | overlapdb-12, db-12 |
| M3 | `FindingKey` has 36 keys; the template table covers them (L120, L736–751) | 38 keys (identical on both trees); the table maps 34. Unmapped: `ig.follower_count_low`, `gbp.rating_low`, `trust.social_proof`, `trust.cross_signal` — those findings would never become actions. | db-13, db-15 |
| M4 | `aeo.website_no_faq_schema` triggers `visibility-content` | Declared but never emitted (rule deleted 2026-06-19, commit `dc40874`; tests assert absence; upstream treats re-adding it as a product decision). Trigger from the website check instead. | db-16 |
| M5 | Module states derive from `payload.available`; errors → `failed`, missing handle → `unavailable` (§3.5.1) | STALE payloads cannot distinguish failed from unavailable (IG/GBP return the same `{available:false}`; AEO says available whenever a SerpAPI key exists). Upstream persists explicit `ProviderResult` states + limitation codes per module. | scanexec-20/21, overlapbe-11 |
| M6 | New `POST /api/scan/lookup` via Google Places (L324, L363) | Upstream already has hardened SerpApi merchant search (`POST /api/business/search`, ≤ 8 candidates, cached, rate-limited) and `/api/business/ig-search`, producing the identity shape the start route validates. | overlapbe-19 |
| M7 | Unlock keeps `lead_score`, hot/warm/nurture routing and the n8n webhook (L392, Appendix A) | Retired upstream (PR #50: payload never matched, every lead landed in nurture). `leads.lead_score`/`routed_to` have no writer or reader; unlock now writes three policy-versioned `consent_records`. | overlapbe-08 |
| M8 | `docs/v0.2-plan.md` is the plan; no agents/approval exist (L131, L163, §3.7) | v0.2 plan rewritten 2026-07-28; `docs/v0.3-roadmap.md` (2026-08-14) is current; Fix Pack agents (`review_reply_agent`, `gbp_post_agent`) with owner approval, `agent_runs`, cost tracking and an LLM digest have shipped (#72, #78, #83). | overlapbe-26 |
| M9 | Notifications and team invites are new (Phase 6 steps 4–5) | Upstream: Resend emails with three per-workspace toggles + `notification_events`; `workspace_members` roles owner/manager/viewer, email invites binding on first verified sign-in. Only in-app rows and per-location scope are new. | overlapbe-27 |
| M10 | sme-scanner = one Vercel project + Vercel Cron (L115, §2.3) | Two Vercel projects (`sme-scanner`, `sme-scanner-tw`, root directory `apps/web`) + two Cloudflare Workers (scheduler, scan worker), shared `CRON_SECRET`, origin `smescanner.fimmick.com`. | overlapbe-22 |
| M11 | Appendix A is the complete env contract | Accurate for STALE's 20 readers; ORIGIN's `.env.example` has 52 variables (renamed contact vars, `SERPAPI_API_KEY` + fallback, rate-limit/report-token/OAuth/Stripe/claim-flag/worker vars, several fail-closed). | overlapbe-21 |
| M12 | "Known sites" for `@/lib` rewrite (L405–408) | Misses `report/language-service.ts:9` (`@/lib/llm-translate`, runtime import) and `language-service.test.ts:1` (`@/lib/types`). | engine-04 |
| M13 | Drop `resolveServedLocales/servedLocales/defaultServedLocale` (L404) | `region/config.test.ts:36-49` tests them; copying "every neighbouring test" then fails. Upstream's `packages/region` keeps them. `LOCALE_LABELS` is unmentioned. | engine-05 |
| M14 | Only next-intl coupling is the `Locale` type import (L126) | `share.ts:11-14` `reportPath` builds unprefixed links for zh-HK/zh-TW (as-needed prefix); the new app prefixes every locale, so zh-TW share/OG links would open the zh-HK report. | engine-06 |
| M15 | Alias-rewrite guidance (L405–408) | Matches only `8415a327`; on `origin/main` the engine has no `@/` aliases and reaches back into `apps/web` with type-only relative imports plus a `persistEvidence` callback. | overlapbe-28 |
| M16 | Create `middleware.ts` (L193, L900, L935) | Next 16 renames the convention to `proxy.ts` (deprecation warning for `middleware.ts`). STALE's file is a Next 15 next-intl reference only. | env-12 |
| M17 | Node ≥ 20 (L77, L855) | Prototype `engines.node >= 22.13.0`; supabase-js crashes on Node 20 without a WebSocket global (upstream needed `websocket-shim.ts`). Machine runs 24.18. | env-09, proto-16 |
| M18 | Replace `kam-man-house` / 錦汶館 / Willy Lai in `product-ui.tsx` (L943–945) | Also hard-coded in ~50 places across `workspace-home/actions/operations.tsx`, `public-pages.tsx`, `assistant-sheet.tsx`, plus a location whitelist `["all","tin-hau","yik-yam"]` defaulting to `yik-yam` (`product-ui.tsx:288`). The QA seed is also `kam-man-house`, so leftovers pass Phase 3/4 verification. | proto-20, proto-21 |
| M19 | Drop the 30 px offsets "in globals.css" (L1035) | The public header's 30 px offset lives in `responsive.css:2` and `ramp-refresh.css:138-139` (last loaded, wins); the 38 px mobile variant is in all three files. | proto-24 |

### 3.4 Low (kept without adversarial review unless noted)

- `CreatePage.startDraft` (`workspace-operations.tsx:68`) is a second consumer of `/api/pocket-assistant/demo` (proto-14, reviewed).
- `downloadText` is not exported and lives in a different file from `ActionDetailPage` (proto-22, reviewed).
- §1.2 omits `merchant-performance/ai-overview-fetch.ts`; it is copied anyway (engine-07).
- `audit_jobs.region` has no DB CHECK; `hk|tw` is an app convention (db-03).
- `goal` and `consent_public_evidence` duplicate upstream's `business_objective` and `consent_records` (overlapdb-17).
- PROTO has two commits, not one (proto-01). `AssistantSurface` lives in `assistant-sheet.tsx`, not `contracts.ts` (proto-13). `hooks/use-mobile.ts` and `"type": "module"` are unmentioned but must survive the restructure (proto-31, proto-32).
- The alias list omits the type-only import in `language-service.test.ts` (env-14).
- `llmComplete` upstream returns `LLMResult | null`, not a string (overlapbe-23).
- Upstream has no Supabase CLI setup at all (overlapbe-29). The Pitfalls note on `maxDuration` is inaccurate: 300 s is the ceiling on every plan, a scan takes ~10–13 min, and the Hobby fallback (a 10-minute cron) is impossible (overlapbe-30).

---

## 4. origin/main overlap matrix

Relationship: **already_built** = upstream has an equivalent; **conflicts** = upstream's design contradicts the playbook's; **partial** = overlapping but different; **absent** = nothing upstream.

### Database (§3.3)

| Playbook item | origin/main equivalent | Relationship |
|---|---|---|
| `plans` + `workspaces.plan_key` | `workspaces.tier` (`lite\|paid`), `workspace_tier_events`, `stripe_customer_id` | conflicts |
| `workspaces` | `workspaces` (business_name, tier, notify_*, instagram_handle, …) | conflicts (same name) |
| `workspace_members` | `workspace_members` (email invites, accepted_at, one-owner index, orphan trigger) | conflicts (same name) |
| `locations` (place_id, cadence, next_scan_at) | `scan_schedules` (place_id unique, cadence, anniversary_day, next_run_at, workspace_id) | partial |
| `audit_jobs.location_id` | none | absent |
| `audit_jobs.requested_by` | `scan_schedules.created_by`, `workspace_claim_events.claimed_by_user_id` | partial |
| `audit_jobs.trigger` | `audit_jobs.parent_job_id`, `scan_schedules.last_job_id` | partial |
| `audit_jobs.goal` | `audit_jobs.business_objective` | partial (rename) |
| `audit_jobs.place_id` | `audit_jobs.place_id` (+ `place_match_confidence`) | already_built |
| `audit_jobs.consent_public_evidence` | `consent_records` (policy-versioned) | partial |
| `scan_snapshots` | `audit_jobs.module_results / score_coverage / scoring_version / input_snapshot`, `scan_diffs`, `aeo_surface_snapshots` | partial |
| `actions` | `agent_runs.finding_key` (one draft per finding) | absent |
| `agent_runs` | `agent_runs` (job_id, finding_key, agent_key, status draft\|approved\|rejected, cost_usd) | conflicts (same name) |
| `output_versions` | `agent_runs.status/reviewed_by/reviewed_at/output` | partial |
| `deliveries`, `workspace_usage` | none (approval *is* delivery upstream; paid gating via tier) | absent |
| `action_measurements` | `scan_diffs` (resolved/regressed/decayed findings, composite delta) | partial |
| `integrations` | `oauth_connections` (instagram\|google_gbp\|ga4, encrypted tokens), `workspaces.instagram_handle` | partial |
| `brand_profiles` | none | absent |
| `assets` + bucket `workspace-assets` | `report_evidence` + private bucket `report-evidence` | partial |
| `audit_events` | `staff_report_events`, `workspace_claim_events`, `erasure_events` | partial |
| `notifications` (in-app) | `notification_events` (email log) + `workspaces.notify_*` | partial |
| `is_member()` + member policies | app-layer `authorize-workspace.ts`; RLS with zero policies | conflicts |
| Legacy-table RLS decision | already hardened (`20260714`, `20260717022612`) | already_built |
| approve/decide/create/export RPCs | none; approval via owner fix-pack routes | absent |
| `claim_workspace_from_job` | `claim-scan.ts` (off) + OAuth-attested claim | partial |
| `claim_scan_job / finalize / fail` lease | `claim_audit_job` (30 min, attempt_count) | conflicts |

### Scan pipeline and public funnel (D1, D7, §3.2, Phase 1)

| Playbook item | origin/main equivalent | Relationship |
|---|---|---|
| `packages/engine` from `apps/web/lib` | `packages/scan-engine`, `packages/region`, `packages/scoring` | conflicts |
| Server `after()` trigger + Vercel sweep cron | Client `POST /api/scan/process` → inline or Cloudflare `apps/scan-worker`; `run-queued` reaper via Cloudflare scheduler | conflicts |
| IG short-circuit when no handle | `collect-providers.ts:104-110` `IG_HANDLE_NOT_PROVIDED` (#63); IG auto-match (#62) | already_built |
| Places by `placeId`; keep all reviews | `gbp-collector.ts` (Places New by placeId → SerpApi fallback); raw reviews still `slice(0, 5)` | partial |
| 15 website checks | 3 signals (`has_faq_schema`, `meta_description_len`, `h1_count`) | absent |
| `createFixtureSources()` | injected deps for unit tests + Docker integration layer | partial |
| `POST /api/scan/lookup` | `POST /api/business/search` + `/api/business/ig-search` | already_built |
| `POST /api/scan/start` contract | market/objective/SerpApi identity, `input_snapshot` v2, rate limit | conflicts |
| `GET /api/scan/status` with collectors | `{status, shareSlug, processingStage, coverage, failureCorrelationId}` | partial |
| `GET /api/scan/process` kept | `POST`, rate-limited, runtime switch, worker dispatch | conflicts |
| `POST /api/ingest/[jobId]` | deleted 2026-08-05 | conflicts |
| `POST /api/unlock` (email\|whatsapp) | 307 → `/api/report-access/unlock`; market-valid channel; consent records; grant + cookie | conflicts |
| `buildSnapshot` on finalize | `module_results`, `score_coverage`, `scoring_version` written by `processScan` | partial |
| Report via `prepareReport` | `load-report.ts` + `view-model.ts` (public / viewer / staff models) | partial |
| Comparability rule (§3.5.3) | `parent_job_id` + `scan_diffs` + `diff.ts` | partial (conflicting rule) |

### Auth, claim, workspace product (D4, D9, D10, Phases 2–6)

| Playbook item | origin/main equivalent | Relationship |
|---|---|---|
| Supabase Auth magic link + Google sign-in | staff / owner / invite magic links; Google = GBP connection only | partial |
| Claim by email match | self-service off; staff assignment; OAuth-attested claim (X6) | conflicts |
| Onboarding / select-workspace / shell | `/[locale]/owner` dashboard (PR #60/#86) with ScanSummary, ConnectGoogle, ScoreTrend, AeoTrend, Notification cards | partial |
| Snapshots / comparability / actions (Phase 3) | `scan_diffs` + `diffScans`; incomparable reasons; no action templates | partial |
| 11 agents + versions/approvals (Phase 4) | Fix Pack `review_reply_agent`, `gbp_post_agent`; `packages/scoring/src/agents/contracts.ts`; owner approval routes | partial |
| Assets upload (Phase 4) | evidence bucket only | absent |
| Visibility Operator live mode (Phase 5) | none (digest narrative is an email) | absent |
| Rescan + crons + retry (Phase 6) | `scan_schedules`, `cron/dispatch`, `cron/run-queued`, Cloudflare scheduler | conflicts |
| Integrations page | ConnectGoogleCard, InstagramConfirmationCard | partial |
| Notifications | Resend emails + preferences route | partial |
| Team invites / roles | `workspace_members`, members route, invite magic link | already_built |
| Billing stub + `plans` | Stripe checkout/portal/webhook, tier | conflicts |
| Seeded `is_demo` workspace | none | absent |
| Rate limiting, consent records, data lifecycle, staff console | exist upstream; not in the playbook | absent (from playbook) |
| Deployment (D3/D5, §2.3) | `apps/web` root dir, Next 15.5 + next-intl + Tailwind 3.4, second TW project, two Workers | partial |
| CI (Phase 7) | `ci.yml`: lint, typecheck, test, secret-boundary, verify-migrations, integration, e2e, both region builds | partial |
| Appendix A env | 52 variables in `apps/web/.env.example` | partial |

---

## 5. Claims that held up (for the STALE tree)

These are true of the checkout the playbook was written against. The same statements are false for `origin/main` where §3 says so.

| Section | Claim | Evidence |
|---|---|---|
| §1.1 (all rows) | Every prototype file, export, enum, dataset and dependency named; 13 `DemoQuestionId`s; `supportedLocales`/`normaliseLocale`; Tailwind v4 + `vendor/shadcn-tailwind-4.13.0.css`; tokens and fonts; shadcn new-york/neutral; node:test + vite SSR tests; Progress aria + Sidebar skeleton assertions; three Pexels images; `codex-preview` meta; lucide 1.31; react-hook-form/@base-ui barely used; zod unused; next-themes used by `sonner.tsx`. | `components/product-ui.tsx:72-459`, `public-pages.tsx` (11 exports), `lib/demo-data.ts:1-263`, `lib/pocket-assistant/contracts.ts:1-56`, `package.json`, `tests/ui-components.test.mjs:51-85` |
| §1.2 Scan execution | `executeScan(input, deps)` = claim → acquire → score → finalize/fail; store RPCs `claim_scan_job / finalize_scan_job / fail_scan_job`; `createLiveSources()` = RapidAPI IG, Places text search + details, SerpAPI google/ai_mode/maps with bounded retry, 3 website signals. | STALE `scan-execution/execute.ts:8-35`, `supabase-store.ts:12-33`, `sources.ts:31-53,577-599,862-883` |
| §1.2 helpers | `MARKETS`/`localeToMarket`/`getMarketConfig`/local `Loc`; `llmComplete` options and key precedence; `SCAN_MODES` + `selectPreviewFindings`; `pickFinding/pickSummary`; `buildShareCardData`; `AuditJobRow/AuditFindingRow/RawData/LeadRow`; `supabaseServer/supabasePublic`; n8n `X-Webhook-Secret`; `docs/v0.2-plan.md` (2026-05-23 version). | `region/config.ts:49-91`, `llm.ts:15-62`, `scan-modes.ts:3-279`, `share.ts`, `types.ts`, `n8n/README.md:23-26` |
| §1.2 Report (worktree) | `prepareReport({slug, locale}, {store, languageService}) → PreparedReport` with every listed field; `createReportStore`; `ReportLanguageService`. | WORKTREE `report/prepare.ts:136-239` |
| §1.3 | `audit_jobs`, `audit_findings`, `leads` columns as listed; `scan_events` unused **in STALE**; RPC signatures, service-role-only grants, 10-minute lease, retry reclaim. | STALE `0001_v0_1_schema.sql:5-57`, `20260808144027:12-58` |
| §1.4 backend column | `ig_handle` required; `industry/district` required by the form; status endpoint `{status, shareSlug}` only; `whatsapp` required and `consent_bd_contact` must be true; 50/20/50 placeholders live in `packages/scoring`; reviews `slice(0,5)` in raw data (also still true upstream). | STALE `start/route.ts:32-37`, `status/route.ts:15-26`, `unlock/route.ts:24-29,52-76`, `sources.ts:615-648`; `packages/scoring/src/modules/{ig,gbp,aeo}.ts` |
| §1.2 Scoring | Weights .30/.35/.25/.10; exported names; 11 test files. | `packages/scoring/src/index.ts:7-30`, `types.ts` |
| §3.2.2 changes 1–4 | Genuinely new on STALE: no event sink; empty IG handle still calls RapidAPI; no `placeId` parameter; `payload.website` = 3 fields. | `scan-execution/types.ts:85-89`, `sources.ts:36,109-132,577-599,872` |
| Worktree branches | `current-base-scan-report-boundaries` merged as PR #56 (identical patch-id); `live-search-auth-reliability` is an ancestor of `origin/main`; only `report-read-render-module` is unmerged. | `gh pr view 56`; `git merge-base --is-ancestor` |
| §0.1 / env | pnpm 9.12.0 pinned in STALE and ORIGIN; vitest 4.1.7; Tailwind 3.4 (sme-scanner) vs 4 (prototype); the lib files slated for vendoring have no `next/*`, `server-only` or `react` imports (only the `Locale` type import); Docker and Playwright available; Vercel project exists. | `package.json` files; regex scan of 43 lib files |

---

## 6. Refuted or downgraded items

| id | Original claim | Outcome |
|---|---|---|
| scanexec-12 | `/api/scan/start` does not return `scanRef`, write `scan_events` or call `after()` | **Refuted (info).** True of the code, but the playbook marks the route "(changed)" and §1.2 says routes are a contract reference to re-implement; these are additions, not misdescriptions. |
| scanexec-13 | `GET /api/scan/process` "kept" with `maxDuration = 300` | Downgraded high → medium: the exports are additions (STALE has none), and smeassistant re-implements the route anyway. |
| proto-14, proto-21, proto-22 | Second demo-route consumer; location whitelist; private `downloadText` | Downgraded to low: phase order already rewires CreatePage; the query-param claim is correct; the helper fix is one line. |
| db-13 | FindingKey count | Downgraded to low on its own (copying the package is unaffected); the unmapped-keys consequence is tracked as M3. |
| db-02 | `audit_jobs.status` enum | Upgraded medium → high (any writer of `running` is rejected by the upstream CHECK). |
| overlapbe-03 | Process trigger | Upgraded high → blocker (legacy reaper would drain smeassistant's queued rows). |

---

## 7. Unverifiable from this machine

- **Which migrations the live Supabase project actually has.** No database access was used. Upstream docs state the 28-file corpus was applied to the linked project (rollout note in `docs/SME_SCANNER_IMPLEMENTATION_REPORT.md`, 2026-07-17; scan-worker README "must already be applied"), and PR #87 (open) adds a drift check for exactly this. STALE's `supabase/.temp/` shows a project was linked on 2026-07-17; it was not inspected.
- **Whether the STALE `20260808144027` migration was ever applied** to any remote project (its plan says no).
- **The Vercel plan** a future smeassistant project would run on (Hobby is documented for the sme-scanner account only).
- **Whether BD still wants lead-routing semantics** (upstream says the webhook never worked).
- **Next 16.2.6's exact `middleware.ts` → `proxy.ts` behaviour** (evidence comes from a local 16.3.1 install).

---

## 8. Decisions needed before Phase 0 proceeds

1. **Which sme-scanner base?**
   - (a) **`origin/main` at `b9b4151f` or newer — recommended.** It is the code that writes the shared database, and it already contains most of Phases 1–6.
   - (b) The local fork `8415a327` (+ worktree), stated explicitly as "117 commits behind, diverged, PR #55 closed", with a hard rule of no writes to the shared Supabase project until the schema and scorer match upstream.
   - (c) Rebase the 13 local commits onto `origin/main` — not recommended: PR #56 already replaced that work with a different design.
   - In every case replace "or newer" with a pinned-SHA check and add `git fetch origin && git merge-base --is-ancestor <sha> origin/main` to Phase 0.1.

2. **Vendor or depend?** (a) **Copy `packages/scan-engine`, `packages/region`, `packages/scoring` (and `apps/web/lib/report/*` from PR #56) from `origin/main` at the pinned SHA into `packages/*` here — recommended**, keeping "final code lives in smeassistant" while dropping the hand-extracted `@sme-scanner/engine`; (b) git subtree so upstream fixes can be pulled; (c) an HTTP contract to the deployed sme-scanner (rejected by D1, still the safest for the shared database).

3. **Schema reconciliation (§3.3).** Rewrite against the 28-migration corpus: extend `workspaces` / `workspace_members` / `agent_runs` additively or use new names; adopt `claim_audit_job` and the 7-value status; give every new FK to `audit_jobs` an explicit on-delete rule; keep RLS "on, zero policies, service-role only" with app-layer authorization; map `plans` onto `tier lite|paid`. **First confirm the live migration state** (run PR #87's check or a read-only query with Willy present).

4. **One executor for `audit_jobs`.** Either reuse upstream's `processScan` + `claim_audit_job` + `run-queued` contract, or add a marker so the legacy reaper ignores smeassistant jobs. Never let both lease designs touch the same row.

5. **Ownership and claim.** Remove the email-match self-service claim. Use staff assignment or the OAuth-attested claim (`WORKSPACE_CLAIM_VIA_OAUTH_ENABLED`), or design a genuinely unforgeable proof and document why.

6. **Auth.** Reuse the upstream magic-link flows and `workspace_members`; keep Google as the GBP connection (and claim proof) unless Google *sign-in* is an explicit product decision. Reconcile `APP_ORIGIN` and the Supabase redirect allowlist for the new origin.

7. **Scheduling and runtime.** Accept the Hobby-plan constraint: reuse `infra/cloudflare-scheduler` + `/api/cron/dispatch` + `/api/cron/run-queued`, and decide whether `apps/scan-worker` (300 s cap vs ~10–13 min scans) is part of smeassistant's deployment.

8. **Product overlap.** Decide, per feature, whether smeassistant's UX wraps the upstream implementation (Fix Pack agents, scan_diffs trends, Stripe tier, email notifications, team roles, business search) or replaces it. The prototype's action/version/delivery model (`actions`, `output_versions`, `deliveries`, `workspace_usage`, `brand_profiles`, assistant live mode) is genuinely new and can be additive.

9. **Tooling.** Add `"packageManager": "pnpm@9.12.0"` to smeassistant's root `package.json`; choose `corepack enable` vs `corepack pnpm …`; raise the Node floor to ≥ 22.13; choose the migration workflow (dashboard + `verify-migrations.sh`, which needs postgresql-16 — via Docker on Windows — versus a Supabase CLI that would have to be added); rename `middleware.ts` → `proxy.ts` for Next 16.

10. **Regenerate the playbook** against the chosen base (recommended). Sections that must change under option 1(a): §1.2, §1.3, §1.4, D1/D2/D4/D7/D8/D9, §2.2, §2.3, §2.4, §3.1 (`/r/[slug]`, `/scan`, `/owner/sign-in`), §3.2.1–3.2.3, §3.3 entirely, §3.5, §3.6.1 (38 keys, FAQ trigger), §3.7, §3.9 (RLS), §3.10, Phase 0.1/0.2/0.3, Phases 1–7, §5 (claim/onboarding copy), §7, Appendix A/B.

11. **Local-only work in `smescanner`.** The 13 unpushed commits, the uncommitted `middleware.ts` change and the untracked docs are superseded upstream. Decide whether to archive them (tag) and remove the stale worktrees; nothing was touched.

---

## 9. What was and was not changed

- **Cloned** `YNWAforever/smeassistant` to `C:\Users\laich\Documents\smeassistant` (clean clone at `9b37f41`), created branch `feat/visibility-workspace-integration`, and wrote this file. **Not committed.**
- **Cloned** a read-only depth-1 snapshot of `sme-scanner` `origin/main` into the session scratchpad for comparison.
- **`smescanner` was not modified**: no fetch, checkout, install or edit; its pre-existing uncommitted `middleware.ts` change and untracked files were left as found.
- **Not run:** `pnpm install`, any migration, `supabase link/push`, live or paid scans, `git push`, deployments. The only side effect outside the repos is corepack's own cache now holding pnpm 9.12.0 and 11.7.0.
- **Phase 0.2 (restructure) and 0.3 (vendoring) were not started.**

## 10. Decision log

| Date | Decision | Chosen option | Follow-through |
|---|---|---|---|
| 2026-09-03 | 1. Which sme-scanner base | (a) `origin/main` at `b9b4151f` | Playbook regenerated as `CLAUDE.md` (repo root); `SME_SCANNER_SRC=../sme-scanner-upstream`; Phase 0 re-run against the new base. Decisions 2–11 are taken as the recommended options in the regenerated playbook and flagged there as assumptions Willy can override. |

## Appendix — audit artefacts

- Verifier findings (181) and overlap rows (73): `scratchpad/verifiers.json`; per-cluster inputs: `scratchpad/clusters/*.json`; skeptic verdicts and 49 groups: `scratchpad/refute.json` (session scratchpad `C:\Users\laich\AppData\Local\Temp\claude\C--Users-laich-Documents-smescanner\5af08162-4de2-4688-9ab1-03573c990264\scratchpad`).
- Workflow runs: `wf_2c33fe02-357` (verifiers; refute stage aborted by a session limit), `wf_271022bf-88d` (cluster refuters, 11/11 complete).

---

## 10. Phase 0 execution against `origin/main` (2026-09-03)

Base pinned: sme-scanner `b9b4151fb89217a926e38f187873b5ff9f10f90f`, checked out at `C:\Users\laich\Documents\sme-scanner-upstream`
(`SME_SCANNER_SRC`). Playbook regenerated as `CLAUDE.md` in this repo. Phase 0.1 checklist against the new base: pinned SHA
present and clean, 28 migrations, `packages/{region,scan-engine,scoring}` present, `scoringVersion "2026-08-16"`, Node v24.18.0,
`corepack pnpm` 9.12.0, prototype pins unchanged (`next 16.2.6`, `react 19.2.6`), `ramp-refresh.css` 3,099 lines.

### 10.1 Restructure (0.2)

- Removed the ChatGPT-Sites/vinext/Cloudflare/D1 scaffolding: `vite.config.ts`, `worker/`, `build/`, `scripts/*.sh`, `.openai/`, `.npmrc`,
  `db/`, `drizzle/`, `drizzle.config.ts`, `examples/`, `tests/rendered-html.test.mjs`, `tests/ui-components.test.mjs`, `tsconfig.tsbuildinfo`,
  `package-lock.json`, `app/chatgpt-auth.ts` (+ its three call sites in `app/[...path]/page.tsx`), the `codex-preview` meta, and ten unused
  `components/ui/*` primitives with their libraries (`cmdk`, `vaul`, `recharts`, `embla-carousel-react`, `react-day-picker`, `input-otp`,
  `react-resizable-panels`, `react-hook-form`, `@base-ui/react`, `@shadcn/react`); no non-UI importer existed for any of them.
- Root `package.json`: `packageManager pnpm@9.12.0`, `engines node >=22.13.0`, standard Next scripts, workspace deps on the four
  `@sme-scanner/*` packages, `@supabase/{supabase-js,ssr}`, `server-only`, `zod`, `stripe`, `sharp`, `image-size`; dev: vitest 4, RTL, jsdom,
  Playwright 1.61.1, tsx. `pnpm-workspace.yaml`, `.nvmrc` (22), `vercel.json` (`{}` + guard test), `vitest.config.ts` (alias `@`, and
  `server-only` aliased to an empty module under tests), `tests/ui-components.test.tsx` (Progress aria, Sidebar skeleton determinism).
- `next.config.ts`: `transpilePackages` for the four packages, Pexels `remotePatterns`, `turbopack.root` pinned (a stray lockfile in the
  home directory made Next infer the wrong workspace root). `eslint.config.mjs`: ignores + `packages/**` override (`no-explicit-any`,
  `@next/next/no-assign-module-variable` off). `app/globals.css`: `@import "tailwindcss" source(none)` with explicit `@source` for
  `app`, `components`, `hooks`, `lib` (Tailwind's default scanner walked the vendored trees and crashed on an escaped candidate), plus the
  `@theme` font-stack tokens. `app/page.tsx`: `dynamic = "force-dynamic"` like the catch-all (the prototype shell reads search params).

### 10.2 Vendoring (0.3)

- `packages/scoring` (30 files), `packages/region` (9), `packages/scan-engine` (63) copied verbatim from the pinned commit; each carries a
  `VENDOR.md`. `packages/contracts` (`@sme-scanner/contracts`) created from `apps/web/lib/{types,db/job-state,evidence/types,
  scanner/ig-search/types,scanner/serpapi-outcome}.ts` (+ upstream tests) with a barrel and smoke test. The eleven scan-engine files that
  reached into `apps/web` by relative type imports now import `@sme-scanner/contracts`; only comments still mention `apps/web`.
- `lib/`: ported `scan-modes`, `localized-field`, `share` (every locale prefixed in `reportPath`, test updated), `seo`, `og-font`, `llm`,
  `llm-summary`, `llm-translate`, `leads/{consent,contact}`, `legal/policy`, `security/{rate-limit,request-fingerprint,cron-auth,token-crypto}`
  with tests; new `lib/locale.ts`, `lib/scheduler/constants.ts`, `lib/supabase/{admin,server,client}.ts`. Upstream's `legal/policy.test.ts`
  was dropped (it asserts copy in `messages/*.json`, which this app does not use).
- `supabase/migrations` = the 28 upstream files verbatim; `supabase/verify-migrations.sh` verbatim (LF). The five migration-contract tests
  and the hardening sweep live in `lib/security/` and pass here. `.env.example` = CLAUDE.md Appendix A.

### 10.3 Verification

| Check | Result |
|---|---|
| `corepack pnpm install` | OK (pnpm 9.12.0; only the upstream-inherited vitest/coverage peer warning) |
| `corepack pnpm typecheck` | OK — root `tsc` plus region, scoring, contracts, scan-engine |
| `corepack pnpm lint` | OK — 0 errors (16 warnings, all inside the vendored packages) |
| `corepack pnpm test` | OK — root 18 files / 183 tests; region 23; scoring 183; contracts 20; scan-engine 276 |
| `corepack pnpm build` | OK — `/`, `/[...path]`, `/api/pocket-assistant/demo` (dynamic), `/_not-found` (static) |
| `next start -p 3010` render checks | `200` for `/`, `/zh-HK`, `/en`, `/zh-TW`, `/zh-HK/pricing`, `/zh-HK/sample-report`, `/zh-HK/owner/kam-man-house` |
| `corepack pnpm db:verify` | **Pending** — Docker Desktop was started but its daemon had not come up within ten minutes. Command to run: `docker run --rm -v "C:/Users/laich/Documents/smeassistant/supabase:/work/supabase:ro" postgres:16 bash -c "cp -r /work/supabase /tmp/supabase && cd /tmp && bash /tmp/supabase/verify-migrations.sh"`. The corpus is byte-identical to upstream's, which passes this script in upstream CI at the pinned commit, and the static rulebook tests pass here. |
| Live schema confirmation | **Pending (Willy)** — confirm the production project carries all 28 migrations before any Phase 2 migration is written (see CLAUDE.md Phase 0.1). |

### 10.4 Deviations and notes

- `pnpm` is invoked through `corepack pnpm` everywhere, including the workspace scripts (`corepack pnpm -r …`), because pnpm is not on PATH.
- `share.ts::reportPath` deliberately differs from upstream (all locales prefixed); recorded in the file and its test.
- Vitest 4 resolves to 4.1.11 while upstream pins `@vitest/coverage-v8 4.1.7`; only `--coverage` would notice. Left as vendored.
- Not done in Phase 0 by design: the catch-all route still renders the prototype (Phase 1 replaces it with real segments); no Supabase
  Auth or data access is wired yet; nothing was applied to the database, pushed, or deployed.
