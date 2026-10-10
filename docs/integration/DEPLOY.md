# Neon deployment and acceptance procedure

**Task 16 local gates and independent review: approved. Task 17: preparation and recovery rehearsal independently approved after source-record and fixture-cleanup fixes. Hosted actions: NOT READY / NOT RUN.** Target project, region, branch, database, stable origin, accounts and operators remain NOT CHOSEN. The authoritative active procedure is [NEON-CUTOVER.md](NEON-CUTOVER.md); record outcomes in [LAUNCH-REPORT.md](LAUNCH-REPORT.md).

1. Complete the release worksheet and source/configuration map in NEON-CUTOVER. Reviewed source candidate is `214884c78ba0e4b1cf7e24fbbebca20f459ae1a4`; it is an eight-file Task 17 documentation/env-comment/focused-test commit after runtime source `853bdee87031cd1d1b2282969ab1b238c498d147`. The prior full-gate evidence remains attributed to that runtime source plus the protected unstaged owner-shell delta. A later closure commit may record review/source identity only; neither source record selects a hosted target, authorizes deployment, proves remote CI, or creates a new full-gate epoch.
2. After explicit isolated-target provisioning authorization, select an empty Neon/Auth target and verify regional capabilities and identities. Use the separate migration role/direct URL for approved schema work; pooled runtime credentials must be a restricted member of `sme_app_runtime`. Verify immutable 0001–0004 checksums and use the reviewed `applyMigrations` API described in the cutover runbook. Never run historical Supabase migrations/RPC setup as an active Neon procedure.
3. Run `corepack pnpm neon:readiness` with both scoped URLs injected into the authorized operator process. It independently probes direct schema/journal and exact app-role credentials in read-only transactions; it does not provision, grant, seed or contact Auth. The direct migration URL must not be deployed with web runtime credentials.
4. After deployment authorization, deploy the exact reviewed candidate on one approved stable staging origin. Planned runtime is Node 24 (locally tested 24.18.0), pnpm 9.12.0, frozen-lockfile install and `corepack pnpm build`. `.nvmrc` is now 24, so CI installs the runtime production serves; the previous 22 was a historical local default that had never been verified against production. Record the actual deployed runtime and run readiness before hosted Auth acceptance.
5. Confirm managed Auth origins/mail/Google sign-in registration separately from business Google OAuth/claim callbacks and report mail. Execute only the approved bounded public/Auth/HK/TW/provider/payment matrix in NEON-CUTOVER. A redirect or local fixture pass is not registration/delivery/provider evidence.
6. Select Vercel execution. Verify [runner and completion parity](NEON-RUNNER-COMPATIBILITY.md), same job database and one existing scheduler owner -- that owner is `app/api/cron/dispatch`. **Its Vercel Cron entry was removed from `vercel.json` on 2026-10-04 (owner decision, DEC-10 default "no hosted cron activation"):** every production call had returned 401, so it never ran, and fixing the secret would have started unsupervised provider spend. The route remains in the code, unscheduled; re-registering it needs a recorded DEC-10 decision and a valid `CRON_SECRET` (at least 16 characters), and `tests/cron-registration.test.ts` must change in the same PR. It was originally an internal Vercel Cron authorized 2026-09-13 (`docs/superpowers/specs/2026-09-13-scan-scheduler-trigger-design.md`); it does not execute scans itself, only notifies owners and reaps abandoned work, so it changes nothing about scan-execution runner selection. Current code blocks external scheduled/cloudflare dispatch. An unchanged Supabase worker blocks promotion for that mode. Do not create a competing scan-execution cron or move the legacy domain.
7. Prepare production schema/readiness, final callbacks, payment mode/webhook routing, explicit old-subscription reconciliation and data-preserving recovery. Obtain exact promotion authorization before switching serving traffic or enabling integrations. Repeat readiness and approved probes on the serving deployment; preserve failed attempts and stop at the approved bounds.

`vercel.json` keeps automatic Git deployment disabled for the migration and completion branches. No push/merge/deploy permission is implied by this guide. Old Supabase resources, legacy staff access and domain stay untouched.

## P4.1 offers and promotion copy: migration 0011 and the flag

P4.1 adds migration `neon/migrations/0011_offers.sql` (journal row 11) and one flag, `OFFER_PROMOTIONS_ENABLED`. When P4.1 was prepared nothing here had been applied to any hosted database; see the owner-reported line below. Hosted acceptance is **NOT RUN**. The statement is [`rollout/apply-0011.sql`](../implementation/owner-platform-v1/rollout/apply-0011.sql); the runbook, its rehearsal and the full phase record are in `docs/implementation/owner-platform-v1/PHASE-4-REPORT.md`.

Owner-reported 2026-10-02: `0011` applied on a Neon test branch and on production, before PR #28 merged (not verified from this repository).

Order, which matters:

1. **Apply `0011` first, on a Neon test branch of production, then on production, before deploying the P4.1 code.** Run `apply-0011.sql` in the Neon SQL Editor as `neondb_owner`. It refuses unless the journal is exactly `0001`-`0010`, so `apply-0010.sql` must already have been applied. The flag does **not** guard the schema dependency: the action queries and the version-writing path select `actions.offer_id` whether or not the flag is on, so this code against a database without `0011` fails every action read and version write.
2. **Deploy the code with `OFFER_PROMOTIONS_ENABLED` unset.** With it unset (or any value other than exactly `true`) the offers page answers 404 and every offer route answers 404 `{"error":"not_found"}`; the Offers navigation entry is hidden.
3. **Then set `OFFER_PROMOTIONS_ENABLED=true` and redeploy** (an environment variable change takes effect on the next deployment). The flag defaults off and is blank in `.env.example`.

Rollback: unset the flag (or set anything but `true`) and redeploy. Exactly what that does:

- **Stops:** the offers page (404) and the Offers nav entry; every offer route (`GET`/`POST /api/workspaces/[id]/offers`, `PATCH /api/offers/[id]`, `…/confirm`, `…/archive`, `…/promotions` all answer 404), so no offer is created, edited, confirmed or archived and no promotion action is created; and every new AI draft or run on an existing offer action (`POST /api/actions/[id]/run` answers 409 `agent_unavailable` for an offer template, shown to the owner as "No agent is available for this action yet", before any model call or run row).
- **Stays:** offer actions already created stay listed on the actions pages, and their existing versions stay approvable and exportable through the normal version routes, and an owner can still save a hand-edited version (`POST /api/actions/[id]/versions` is not flag-gated; the edit inherits its base version's offer revision). The SQL freshness guard still applies to all of them, so a draft whose offer has changed, expired, been archived or is no longer confirmed is still refused. Because editing and archiving are off too, an approved draft of a current offer can still be exported (and counted) while the flag is off.
- Nothing is deleted: offers, offer actions and versions stay in the database. `0011` itself is additive and is not rolled back: the new column is nullable, existing rows are null, and the re-created `approve_output_version` / `export_output_version` behave exactly as before for any action without an `offer_id`.

## P4.2 visibility starter pack: migration 0012 and the flag

P4.2 adds migration `neon/migrations/0012_work_packs.sql` (journal row 12, two new tables, `work_packs` and `work_pack_items`) and one flag, `WORK_PACKS_ENABLED`. When P4.2 was prepared nothing here had been applied to any hosted database; see the owner-reported line below. Hosted acceptance is **NOT RUN**. The statement is [`rollout/apply-0012.sql`](../implementation/owner-platform-v1/rollout/apply-0012.sql); the runbook, its rehearsal and the full phase record are in `docs/implementation/owner-platform-v1/PHASE-4-REPORT.md`.

Owner-reported 2026-10-03: `0012` applied on production, before PR #29 merged; a test-branch application was not reported (not verified from this repository).

Order, which differs from P4.1:

1. **Apply `0012` on a Neon test branch of production, then on production.** Run `apply-0012.sql` in the Neon SQL Editor as `neondb_owner`. It refuses unless the journal is exactly `0001`-`0011`, so `apply-0011.sql` must already have been applied. The statement is purely additive (two new tables); nothing existing is altered.
2. **Deploy the code with `WORK_PACKS_ENABLED` unset.** Unlike `0011`, deploying before `0012` is applied is **harmless**: while the flag is unset (or any value other than exactly `true`) no code path reads or writes `work_packs` or `work_pack_items`, so the P4.2 code runs against a database without `0012`. `test/integration/neon-work-packs-flag-off.integration.test.ts` proves it against a schema that stops at `0011`: the Home brief, the Home pack loader and the actions list issue no SQL that mentions a pack table. With the flag unset Home renders today's Fix Pack card, the pack page and every pack route answer 404 `{"error":"not_found"}`.
3. **Set `WORK_PACKS_ENABLED=true` only after `0012` is applied, then redeploy** (an environment variable change takes effect on the next deployment). With the flag on and no `0012`, the Home pack card shows its empty state, Start fails, and every pack route answers 503. The flag defaults off and is blank in `.env.example`.

Rollback: unset the flag (or set anything but `true`) and redeploy. Exactly what that does:

- **Stops:** the pack card on Home (Home returns to the Fix Pack card, unchanged), the pack page (404), and every pack route (`POST`/`GET /api/workspaces/[id]/packs` and `GET /api/packs/[packId]` answer 404), so no pack is started and no pack row is read.
- **Stays:** packs and their items stay in the database. The actions they point to are ordinary actions: they stay listed on the actions pages, and their drafts stay reviewable, approvable and exportable there under the existing rules. Nothing is deleted, and `agent_runs` is never touched.
- `0012` itself is additive and is not rolled back.

## P4.3 contextual assistant: no migration, one flag

P4.3 adds **no migration** (the journal stays `0001`-`0012`; `neon/migrations/` is untouched) and one flag, `CONTEXTUAL_ASSISTANT_ENABLED`. Every signal reads tables that already exist. Nothing here has been applied to any hosted database or deployed; hosted acceptance is **NOT RUN**. The full phase record is in `docs/implementation/owner-platform-v1/PHASE-4-REPORT.md` ("P4.3").

Order:

1. **Deploy the code with `CONTEXTUAL_ASSISTANT_ENABLED` unset.** There is nothing to apply first, so the order against any database step is free. While the flag is unset (or any value other than exactly `true`), `GET /api/assistant/suggestions` answers `200 {"suggestions":[]}` before any auth or SQL, the two new questions (`explain_missing_inputs`, `where_to_continue`) answer `404 {"error":"not_enabled"}` before auth, no answer carries a `nextStep`, and the run route ignores `origin`, so the audit rows are the ones the previous build wrote. `test/integration/neon-assistant-flag-off.integration.test.ts` records every statement the flag-off paths issue and asserts zero.
2. **Set `CONTEXTUAL_ASSISTANT_ENABLED=true` and redeploy** (an environment variable change takes effect on the next deployment). The assistant sheet then shows up to three "Needs you now" questions (missing inputs, drafts waiting for approval, a Google connection that needs attention) above the usual list, and answers can end with a "Continue here" link.

Rollback: unset the flag (or set anything but `true`) and redeploy. Exactly what that does:

- **Stops:** the "Needs you now" questions (the route returns `[]`), the two new questions (404 `not_enabled`), every "Continue here" link, and the `origin` and `next_step_kind` fields in new `assistant.run` audit rows.
- **Stays:** every existing assistant question and answer, the action page's `?version=` and `#inputs` landing (they are plain navigation), and all audit rows already written. The assistant never wrote to `actions`, `action_runs`, `output_versions`, `deliveries` or `workspace_usage`, so nothing persisted depends on the flag.
- **Not a rollback target:** there is no migration to undo.

## P4.5 unsaved preview draft: migration 0013 and the flag

P4.5 adds migration `neon/migrations/0013_preview_events.sql` (journal row 13: one new table, `preview_events`, with no text column, and two `SECURITY INVOKER` functions, `claim_preview_slot` and `finish_preview_slot`, EXECUTE granted to `sme_app_runtime` only) and one flag, `PREVIEW_DRAFT_ENABLED`, with two optional limit overrides, `PREVIEW_DRAFT_DAILY_LIMIT` and `PREVIEW_DRAFT_USD_DAILY`. DEC-12 is decided (`BUSINESS-AND-HOSTED-DECISIONS.md`); applying `0013` to a hosted database is a DEC-11 owner action. When P4.5 merged nothing here had been applied to any hosted database or deployed; see the owner-reported line below for the later hosted state of `0013`. Hosted acceptance is **NOT RUN**. The statement is [`rollout/apply-0013.sql`](../implementation/owner-platform-v1/rollout/apply-0013.sql); its rehearsal and the full phase record are in `docs/implementation/owner-platform-v1/PHASE-4-REPORT.md` ("P4.5"), and the read-only measures are in [`PREVIEW-METRICS.md`](../implementation/owner-platform-v1/PREVIEW-METRICS.md).

Owner-reported 2026-10-04: `0013` applied on the Neon test branch and on production (not verified from this repository).

Order (the same shape as P4.2):

1. **Apply `0013` on a Neon test branch of production, then on production.** Run `apply-0013.sql` in the Neon SQL Editor as `neondb_owner`. It refuses unless the journal is exactly `0001`-`0012`, so `apply-0012.sql` must already have been applied. The statement is purely additive (one new table, two new functions); nothing existing is altered.
2. **Deploy the code with `PREVIEW_DRAFT_ENABLED` unset.** Deploying before `0013` is applied is **harmless while the flag is off**: with the flag unset (or any value other than exactly `true`) the report renders no preview card, `/{locale}/start/{slug}` answers 404 before reading a cookie or the database, and `POST /api/start/{slug}/preview` answers `404 {"error":"not_enabled"}` before reading the body or issuing any SQL. `test/integration/neon-preview-flag-off.integration.test.ts` proves it against a schema that stops at `0012`: zero statements for the route and for the card decision, with a flag-on contrast so the recorder is not silent.
3. **Set `PREVIEW_DRAFT_ENABLED=true`, and optionally the two overrides, only after `0013` is applied, then redeploy** (an environment variable change takes effect on the next deployment). Unlocked report viewers then see "Try one AI reply draft (not saved)" on their report. Limits: 1 preview per viewer grant (at most 3 attempts if generation fails), 3 per job, 5 per IP per day, and by default 50 model calls (failed ones included) and US$2 per rolling 24 hours across all jobs; a call whose provider reports no usage is charged a conservative estimate. An invalid override refuses every preview as `unavailable` (fail closed). With the flag on and no `0013`, the card and the page still render, and every submitted preview answers `unavailable` (the slot claim fails); no model is called.

Rollback: unset the flag (or set anything but `true`) and redeploy. Exactly what that does:

- **Stops:** the report card, the `/start` page (404) and the preview route (`404 not_enabled`). No new `preview_events` row is written and no model is called.
- **Stays:** `preview_events` rows stay for the metrics in `PREVIEW-METRICS.md`; they hold no text. No draft was ever stored, so nothing else exists to clean up. Nothing in `actions`, `action_runs`, `output_versions`, `deliveries` or `workspace_usage` was written by the preview.
- `0013` itself is additive and is not rolled back.

## P4.6 Google review-reply publishing: migration 0014 and the flag

P4.6 adds migration `neon/migrations/0014_publish_reply.sql` (journal row 14: four `deliveries` columns, `target_ref`, `provider_receipt`, `failure_reason` and `verified_at`; `output_versions.first_published_at`; the check `deliveries_publish_target_check`; two partial unique indexes; three `SECURITY INVOKER` functions, `begin_publish_output_version`, `finish_publish_output_version` and `cancel_published_reply`; and `export_output_version` re-created so a version counts once at its first export **or** first verified publish; EXECUTE granted to `sme_app_runtime` only) and one flag, `GBP_REPLY_PUBLISH_ENABLED`. With the flag on, an owner or an in-scope manager can post one approved review-reply version as the owner's reply to one chosen Google review, after confirming the exact version and the review; only the owner can delete it. DEC-13 and DEC-14 are decided (`BUSINESS-AND-HOSTED-DECISIONS.md`); applying `0014` to a hosted database is a DEC-11 owner action, and turning the flag on needs a **separate release approval**. When P4.6 merged, nothing here had been applied to any hosted database. Owner-reported 2026-10-05: `0014` applied on the Neon test branch and on production (not verified from this repository). The code is deployed to production (from `d880e2c` on) with the flag unset (owner-reported). Hosted acceptance is **NOT RUN**. The statement is [`rollout/apply-0014.sql`](../implementation/owner-platform-v1/rollout/apply-0014.sql); its rehearsal and the full phase record are in `docs/implementation/owner-platform-v1/PHASE-4-REPORT.md` ("P4.6"), and the acceptance run is §22 of `HOSTED-ACCEPTANCE-CHECKLIST.md`.

Order:

1. **Request Google Business Profile API access** for the GCP project behind `GOOGLE_OAUTH_CLIENT_ID`. Quota stays at 0 until Google approves it, and until then every Google call answers `provider_forbidden`. No reconnect is needed: the existing connection already asks for `business.manage`.
2. **Apply `0014` on a Neon test branch of production, then on production.** Run `apply-0014.sql` in the Neon SQL Editor as `neondb_owner`. It refuses unless the journal is exactly `0001`-`0013`, so `apply-0013.sql` must already have been applied. It is additive except for one function: `export_output_version` is re-created, but until a publish has finished `first_published_at` is null on every row, so exports count exactly as before.
3. **Deploy the code with `GBP_REPLY_PUBLISH_ENABLED` unset.** Deploying before `0014` is applied is **harmless while the flag is off**: with the flag unset (or any value other than exactly `true`) **Publish to Google** is never offered, and `GET /api/versions/{id}/publish/targets`, `POST /api/versions/{id}/publish` and `DELETE /api/deliveries/{id}/reply` answer `404 {"error":"not_enabled"}` before any SQL. `POST /api/deliveries/{id}/reconcile` stays on (it only reads from Google, so an uncertain delivery never strands) and answers 404 for anything that is not a publish delivery; the page loader and reconcile read no `0014` column unless a publish delivery exists. `test/integration/neon-publish-flag-off.integration.test.ts` proves it against a schema that stops at `0013`. So steps 2 and 3 may come in either order; both must precede step 4. **Changed by PR #40 (`e69378d`, 2026-10-05):** from that commit on, the measurement recorded after a comparable rescan reads `output_versions.first_published_at` whether or not the flag is on, so code from `e69378d` on needs `0014` applied first. Both hosted databases already have `0014` (owner-reported above), and `neon:readiness` reports READY only when the journal matches every migration; this matters only for a new or restored database, which must be migrated through `0014` before it serves this code.
4. **Separate release approval: set `GBP_REPLY_PUBLISH_ENABLED=true` on a non-production deployment only, then redeploy**, and run `HOSTED-ACCEPTANCE-CHECKLIST.md` §22 against the Fimmick-owned listing (publish, read-back, reconcile, delete). With the flag on and no `0014`, every publish answers `unavailable` (the begin function is missing) and nothing reaches Google's write endpoint.
5. **Production:** setting the flag in production is a further explicit owner decision after step 4 passes. Limits: 20 publishes per workspace per day and 200 across all workspaces, 60 target lists per workspace per hour, 30 reconciles per delivery per day; an unavailable limiter refuses (503).

Rollback: unset the flag (or set anything but `true`) and redeploy. Exactly what that does:

- **Stops:** **Publish to Google**, the targets, publish and delete routes (`404 not_enabled`). Nothing new is written to Google.
- **Stays:** replies already published stay on Google; the owner can remove them in Google directly. Reconcile keeps working, so a "Couldn't confirm" delivery can still be settled read-only. Delivery rows, their counted usage and the audit events stay; the card keeps showing the last delivery's state as history.
- `0014` itself is not rolled back. Its columns and functions are additive, and the re-created `export_output_version` behaves like the `0011` body for any version that was never published.

## T-12 action-list indexes: migration 0015, no flag

`neon/migrations/0015_action_list_indexes.sql` (journal row 15) adds three read indexes, `action_runs_latest_metadata_idx`, `output_versions_latest_metadata_idx` and `actions_list_keyset_idx`, for the bounded owner action list and the latest run/version lookups (T-12). No table, column, function, grant or data changes. The deployed code does **not** depend on it: every query runs without these indexes, only more slowly on large workspaces. Applying it to a hosted database is a DEC-11 owner action. Hosted state (read-only check 2026-10-10): production already has the 0015 indexes and the full 0009–0015 schema, but its journal stops at 0008, so `apply-0015.sql` refuses there. Production was brought to journal 15 by [`rollout/reconcile-journal-0009-0015.sql`](../implementation/owner-platform-v1/rollout/reconcile-journal-0009-0015.sql) on 2026-10-10 (owner-run; journal 1–15 and checksums verified read-only afterwards; see `docs/operations/migration-readiness.md`, 2026-10-10), so 0015 is in place on production. `apply-0015.sql` remains the statement for a database whose journal is exactly 1–14. The statement is [`rollout/apply-0015.sql`](../implementation/owner-platform-v1/rollout/apply-0015.sql); `tests/rollout-apply-0015.test.ts` keeps its embedded migration and checksums equal to the files on disk.

1. Follow the operator rule in [`docs/operations/migration-readiness.md`](../operations/migration-readiness.md): match the Neon endpoint and database to Vercel's Production `DATABASE_URL`, confirm the journal is exactly `1`–`14`, and run `check-missing-columns.sql` (0 rows).
2. **Apply on a Neon test branch of production, then on production.** Run `apply-0015.sql` in the Neon SQL Editor as `neondb_owner`. It refuses unless the journal is exactly `0001`-`0014`, and refuses (rolling back) if an index of the same name already exists with a different definition. A plain `CREATE INDEX` holds a SHARE lock on `action_runs`, `output_versions` and `actions` while it builds: writes to those tables wait until the statement commits, reads continue. On current row counts that is well under a second; prefer a quiet hour if the tables have grown.
3. Re-run the journal query (max ordinal 15) and check the owner home and action list.

Rollback: none needed for the code. The indexes are harmless to keep; removing them would be a separate authorised migration, never a journal edit.

## Local verification and limits

The Task 16 all-ten-gate epoch is recorded in LAUNCH-REPORT with exact source and warning counts. Task 17 adds one actual-SQL recovery rehearsal: a new application user and report survive a drained pool, restart of the same owned network-none Postgres container and compatible repository reconnect. It also verifies a continued report write. This is not hosted rollback, managed Auth recovery or an old build test.

Commands remain `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm db:verify`, `corepack pnpm test:integration`, `corepack pnpm build`, `corepack pnpm e2e`, `corepack pnpm e2e:acceptance`, `corepack pnpm test:secret-boundary`, `corepack pnpm test:no-supabase`. Do heavy gates sequentially and record the exact worktree scope. `db:verify` always owns a disposable local database; it is not a hosted migration command. `corepack pnpm db:types` generates schema types; `corepack pnpm seed:demo --owned-test` creates/seeds/verifies/destroys its own local fixture and ignores ambient DB URLs. Never seed managed Auth or production demo data.

The approved dependency exception remains only pinned `@neondatabase/auth@0.5.0-beta` and its runtime-reachable transitive `@supabase/auth-js@2.79.0` library relationship. No Supabase service, direct application SDK client, credential or endpoint is allowed; the inventory and exit scanner enforce that boundary.

## Historical pre-Neon runbook archive — not active instructions

The collapsed original document below is retained for provenance only. Its targets, Node 22 guidance, shared Supabase schema/RPC procedures, old pending task states and proposed domain moves are superseded by the active Neon procedure above. Do not execute archived steps or treat archived identifiers as selected destinations.

<details>
<summary>Archived preparation through Task 16, before Task 17</summary>

# Deployment and acceptance runbook

Prepared for review; this document does not execute or authorize remote operations. Public checks prove only their named response boundaries. Launch acceptance is **not run** until evidence is recorded for the exact staging and final deployments in [LAUNCH-REPORT.md](LAUNCH-REPORT.md).

## Current Neon preparation status

Task 15 supplies local readiness and removal tooling. Hosted Neon project/branch, Auth endpoint, staging origin and authorized accounts are **NOT CHOSEN**. Hosted validation, provisioning, migration and deployment are **NOT RUN**. The historical references below are not selected destinations.

| Variable | Source and boundary |
|---|---|
| `DATABASE_URL` | Selected Neon branch pooled application-role connection string; server-only |
| `DATABASE_URL_UNPOOLED` | Same selected branch/database direct administrative connection; read-only metadata readiness uses this to access the migration journal; server-only |
| `NEON_READINESS_HOST`, `NEON_READINESS_DATABASE` | Independently confirmed nonsecret expected branch endpoint and database; pooled `-pooler` hostname is normalized |
| `NEON_AUTH_BASE_URL` | Auth endpoint from that selected branch; HTTPS without credentials/query/fragment; never a database URL |
| `NEON_AUTH_COOKIE_SECRET` | Distinct securely generated random value of at least 32 characters; server-only |
| `APP_ORIGIN`, `NEXT_PUBLIC_SITE_URL` | Same explicitly chosen bare app origin; no credentials/path/query/fragment |

A registered variable name or placeholder is not a usable configuration value. Readiness performs a read-only transaction: current database identity, journal checksums, expected tables/functions. It never queries personal/business rows and emits only status/category plus validated nonsecret host/database. It does not contact Auth or prove delivery, expiry, replay or revocation. Missing/unavailable/wrong targets fail closed. Do not run against an unapproved hosted target.

Local commands: `corepack pnpm db:verify`, `corepack pnpm db:types`, `corepack pnpm seed:demo --owned-test`, `corepack pnpm test:no-supabase`. The seed command creates, seeds, verifies and destroys its own fixture; ambient URLs are ignored and arbitrary target arguments are refused. No persistent or managed Auth seed is implied. The migration harness uses only an already-present `postgres:16` image; CI explicitly prepares that image before running the same harness. Existing lint/typecheck/unit/secret/migration/integration/build/public/acceptance gates remain.

User-approved amendment (2026-09-07): retain pinned `@neondatabase/auth@0.5.0-beta` and only its transitive `@supabase/auth-js@2.79.0` library relationship. The library is runtime-reachable through Neon error helpers; this is not zero Supabase-authored packages. No direct application SDK client, Supabase service use, credentials, endpoints or active imports are allowed. The exit gate validates the pinned manifest/importer, package integrity, snapshot and sole introducer edge, then scans all remaining lockfile content. Version or introducer drift fails closed. No SDK patch or upgrade is authorized. This supersedes the literal zero-dependency acceptance wording only; hosted acceptance and release remain separate gates.

## Repository and historical targets

Use `YNWAforever/smeassistant` in `C:\Users\laich\Documents\smeassistant`. Preserve unrelated work in the legacy `Documents/smescanner` checkout. Phases 0–7 are implemented; do not restart them.

The following identifiers are historical audit references from 2026-09-05, not a fresh infrastructure inventory. Verify assignments read-only before any release operation.

| Item | Historical reference |
|---|---|
| Vercel team | `ynwaforevers-projects` (`team_qvzlsFmfCsLkgItSypqHjw3z`) |
| Successor project | `smeassistant` (`prj_Hbox4o4NhM3p0yxRxmY8Xq1mjtb5`), repository `YNWAforever/smeassistant`, production branch `main` |
| Successor alias | `https://smeassistant.vercel.app`; an existing production alias, not an isolated staging environment |
| Legacy project | `sme-scanner` (`prj_zKzNcbLTwlSXbhYTMe59spRQh1BC`) |
| Final merchant origin | `https://smescanner.fimmick.com`; historically assigned to legacy |
| Legacy staff hostname | `https://sme-scanner-one.vercel.app`; retain staff access |

## 1. Prepare the release record and local evidence

1. Record current commit SHA, exact-main CI reference and local runtime version. Review changes after audited main `3fae6ef020d72ff528a4a9b50b5b013c2c5b1995` before relying on historical evidence.
2. Complete assistant capability/missing-facts fixes, corrected public checks, isolated merchant acceptance (continuation Task 3), and durable workspace completion across retained runners (Task 4). Public smoke checks alone do not satisfy these prerequisites.
3. Run the normal repository gate: `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`. Run `corepack pnpm test:secret-boundary` sequentially: it builds its own sentinel bundle. Also run the migration verifier, `corepack pnpm test:integration`, `corepack pnpm e2e` and `corepack pnpm e2e:acceptance`. The 2026-09-06 local result is recorded in LAUNCH-REPORT.md: 33-migration gate, 18 integrations, 16 required acceptance cases and 27 public cases passed; this is not exact-deployment CI or provider acceptance.
4. Record actual outcomes, including skipped cases. The historical four skipped cases (manual scan → report → unlock, live business search, magic-link form submission, draft → approve → export) are not passing acceptance evidence.
5. Prepare schema inventory and compatibility evidence read-only. Compare all 28 pinned upstream migrations and the two workspace additions, including constraints, grants, RLS and RPC behavior. Empty-database tests do not prove a shared database's state. The historical SQL corpus remains compatibility evidence; the current Neon migration journal is authoritative for this branch. Prepare any hosted operation separately for review.

Repository build settings: Next.js, root `/`, Node 22.x (`.nvmrc`), pnpm 9.12.0; install `pnpm install --frozen-lockfile`, build `pnpm build`. Record actual deployed runtime separately. No cron is registered as of 2026-10-04 (see item 6 above); do not add one without a recorded DEC-10 decision, and never a competing scan-execution cron. An engine-completed job is not proof that workspace post-processing completed.

Publication guard: `vercel.json` disables automatic Git deployments for `codex/merchant-acceptance-completion`. Publishing its review PR does not authorize a deployment. Remove or revise that branch-specific guard only as part of an authorized staging plan; other branches retain their existing behavior.

## 2. Identify an isolated staging environment

Choose and record one stable HTTPS staging origin and a database/Auth/mail environment isolated from the shared project. Do not treat the existing production alias as staging solely because the merchant domain has not moved. Do not copy shared credentials into a fixture environment.

Keep every staging callback, mailed link and checkout return on that same staging origin. No staging journey should redirect to the legacy merchant app.

| Configuration or registration | Staging value | Final value, prepared separately |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `<staging-origin>` | `https://smescanner.fimmick.com` |
| `APP_ORIGIN` | `<staging-origin>` | `https://smescanner.fimmick.com` |
| Neon Auth origin registration | `<staging-origin>/auth/callback` in the isolated project | `<final-origin>/auth/callback` in the authorized final project |
| `GOOGLE_OAUTH_REDIRECT_URI` | `<staging-origin>/api/oauth/google/callback` | `<final-origin>/api/oauth/google/callback` |
| `GOOGLE_OAUTH_CLAIM_REDIRECT_URI` | `<staging-origin>/api/oauth/google/claim/callback` | `<final-origin>/api/oauth/google/claim/callback` |
| Google client registration | Both exact callback URIs and the staging JavaScript origin | Both exact final callback URIs and the final JavaScript origin |
| Stripe webhook registration | `<staging-origin>/api/webhooks/stripe`, test mode | `<final-origin>/api/webhooks/stripe`, explicitly selected mode |
| `STRIPE_WEBHOOK_SECRET` | Secret for this exact staging endpoint | Secret for this exact final endpoint |

Two Stripe endpoints have distinct signing secrets; one secret must not be assumed to validate both. Retain `OWNER_SELF_SERVICE_CLAIM` unset. Enable `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` only as explicitly approved; `--claim-flag` describes the expected setting and does not change it.

Inventory variable names and purposes from `.env.example`, never secret values:

- Neon PostgreSQL/Auth: configuration source map above; isolated and final target identities remain separately selected.
- Security: `RATE_LIMIT_SECRET`, `REPORT_ACCESS_TOKEN_SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY`.
- Google: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, both redirect variables and claim flag.
- Scan: `SCAN_SOURCES`, `SCAN_EXECUTION_RUNTIME`, relevant worker settings and explicitly authorized evidence-provider coverage.
- Drafting: selected LLM credential, `LLM_BASE_URL`, `LLM_MODEL`; missing configuration yields degradation, not successful drafting evidence.
- Mail: `RESEND_API_KEY`, `REPORT_EMAIL_FROM`, authorized test contact and return origin.
- Billing: `STRIPE_SECRET_KEY`, endpoint-specific `STRIPE_WEBHOOK_SECRET`, `STRIPE_HK_TIER_PRICE_ID`, `STRIPE_TW_TIER_PRICE_ID`, test/live mode.

Provider/account setup, deployments, migrations, emails, paid calls and signed payment events remain operational gates requiring applicable explicit authorization.

## 3. Run public checks with precise expectations

The checker uses anonymous GETs and deliberately invalid POST bodies. It supplies no credentials and does not follow redirects. These commands are prepared examples; replace the staging hostname with the approved one before execution:

```powershell
corepack pnpm launch:check --origin https://approved-staging.example --claim-flag off
corepack pnpm launch:check --origin https://approved-staging.example --claim-flag on
```

Use only the command matching the intended flag state. With the flag off, claim start must return `404 not_found`. With it on and configured, the anonymous probe must return `401 unauthenticated`; `503` means unavailable configuration. A proxy login page, redirect, generic 404 or unexpected body does not pass.

For metadata inspection of a deployment intentionally built with final-host canonical URLs, specify the expectation explicitly:

```powershell
corepack pnpm launch:check --origin https://smeassistant.vercel.app --canonical-origin https://smescanner.fimmick.com --claim-flag on
```

This separates the request origin from the expected canonical origin for canonical/hreflang, robots and sitemap checks. It does not redirect requests, configure callbacks, allow other failures or replace coherent staging acceptance. Do not use this exception to send staging authentication to the final origin while legacy still serves it.

| Public result category | What a pass establishes | Separate evidence still required |
|---|---|---|
| Public reachability/metadata | Expected status, language, exact canonical and alternate paths, robots/sitemap origin | Authenticated merchant behavior on the same build |
| Anonymous claim boundary | Flag-off route hidden or flag-on request denied without authentication | Google registration, consent, callback and ownership claim |
| Magic-link input rejection | Empty email rejected before sending | Authorized email delivery and real link redemption |
| Unsigned Stripe signature rejection | Missing-signature request rejected | Signed event handling, retries and entitlement transitions |
| Invalid-market rejection | Invalid input rejected | Production fixture-mode guard and completed scan outcomes |

`429` is **blocked**: it observes rate limiting and proves nothing about the intended deeper check. Failed or blocked results produce a nonzero exit; investigate and rerun. Public success ends with authenticated/provider acceptance explicitly **not run**.

The separate `evaluateAuthenticatedClaimRedirect` helper can evaluate captured responses from an authorized signed-in test. It accepts the framework's 307 (and 302) to the exact Google consent endpoint, proving only that the app constructed a redirect. It makes no request and is not included in the public command. Real consent and callback completion remain necessary.

Never submit a valid production scan as a fixture guard test. `resolveScanSourceMode` converts `SCAN_SOURCES=fixture` to **live** when `VERCEL_ENV=production`. Use the deterministic regression in `lib/scan/run.test.ts` to prove this rule. Fixture acceptance must use isolated non-production/local services; fixture jobs still write data.

## 4. Verify staging merchant and provider acceptance

After applicable authorization and Tasks 3/4 prerequisites, record exact commit, deployment ID, Node runtime, origins, scan source mode, execution runtime, database identity (non-secret), claim flag and provider mode for each result.

1. Run the isolated fixture acceptance suite without silent prerequisite skips, including real local Auth/mail redemption. Verify role/location denial, revoked membership, successful generation, missing-facts blocking and unavailable/invalid model behavior.
2. On approved staging, complete HK and TW scan → report → unlock → magic-link redemption → Google consent/claim callback → onboarding → workspace. Observe which deployment serves every callback. A form's inbox message does not prove sign-in.
3. Create a successful draft, edit it, approve that exact immutable version, export twice and inspect usage/audit records. The second export must not consume another delivery. A template fallback is a separate degradation case, not successful draft acceptance.
4. Use authorized Stripe test-mode signed events to prove endpoint-specific validation, idempotency and entitlement effects. An unsigned 400 cannot substitute for this.
5. Verify a rescan and retained scheduler produce the workspace snapshot, actions, comparable measurement or honest incomparable reason, and completion notification once. Record failures and recovery; a terminal engine status is insufficient.
6. Record accessibility and all three locale results. Locale changes must preserve the business's HK/TW market, currency and contact channel.

Any unresolved critical result blocks cutover while independent local work can continue.

## 5. Prepare and authorize final-host cutover

Prepare a concrete release record for review: tested commit, final configuration/registration inventory, deployment ID, schema compatibility, current and intended domain ownership, approved test budget/contact, and rollback target. Rebuild and record a new final deployment when public build-time origins change; staging success does not make a different build tested.

Under applicable explicit release authorization, configure and validate the final target, move `smescanner.fimmick.com` to the existing successor project, verify assignment/certificate, and retain the legacy staff hostname and scheduler unless separately approved. Then run:

```powershell
corepack pnpm launch:check --origin https://smescanner.fimmick.com --claim-flag on
```

Use the approved flag expectation. Repeat critical HK/TW authenticated/provider acceptance on the exact final build. Verify legacy redirects, magic-link destinations, both Google callbacks, webhook destination and workspace completion. Record the observation window and actual outcomes in the launch report. READY deployment status or passing public checks alone does not complete launch.

## 6. Rollback and handoff

Prepare the previous domain/deployment target and callback, webhook, environment and worker settings before cutover. Under the applicable rollback authorization, restore the documented targets if critical final acceptance fails, then verify merchant and legacy staff access.

Moving the domain does not undo database writes, sent emails, payment events or completed scans. Verify backward schema compatibility and reconcile any affected data or external events separately; do not promise a complete data rollback. Record exact changes and remaining limitations. Do not apply rollback migrations or issue compensating payment operations without applicable authorization.

## 7. Prepared Task 5 schema comparison (read-only)

On 2026-09-05 the 28 local upstream migrations matched the pinned checkout byte-for-byte. This verifies source provenance only. The connected Supabase account listed two unrelated projects and did not expose the scanner project; no SQL was sent to either. Shared and isolated staging schema inventories remain blocked on the correct project identity/access.

Run the following catalog queries only against the positively identified project, capturing the same output from the empty-database fixture baseline for comparison. They read schema metadata, not merchant rows. Use a read-only transaction; do not invoke business RPCs as a schema probe.

```sql
begin transaction read only;
select current_database(), current_user, version();
select table_schema, table_name, column_name, data_type, udt_name,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
select c.relname, c.relrowsecurity, c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) as owner, c.relacl
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p','S')
order by c.relname;
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;
select tablename, indexname, indexdef from pg_indexes
where schemaname = 'public' order by tablename, indexname;
select c.conrelid::regclass::text as relation, c.conname,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c join pg_namespace n on n.oid = c.connamespace
where n.nspname = 'public' order by relation, c.conname;
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result, p.prosecdef,
       p.proconfig, p.proacl, md5(pg_get_functiondef(p.oid)) as definition_hash
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' order by p.proname, arguments;
select c.relname, t.tgname, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal order by c.relname, t.tgname;
rollback;
```

A migration-history row alone is insufficient. Compare definitions, including partial unique indexes, foreign-key delete actions, trigger configuration and effective privileges. Workspace tables require RLS enabled with zero policies and no public/anon/authenticated privileges; service_role has the explicit DML grants. The audit sequence requires its service-only sequence grants. RPCs require the exact overload, empty search_path, SECURITY DEFINER where specified, no public/anon/authenticated execution, and service_role execution. Check inherited/default role grants as well as direct ACLs. Behavioral RPC verification belongs in the isolated fixture database; read-only shared inventory cannot prove transactional behavior.

The ordered workspace additions are:

1. `20260903000000_workspace_layer.sql` — SHA256 `8f28fa2be4e86cef0d278f795dec962cd16864a8de8b3762d68c44e2d559420b`.
2. `20260903000001_workspace_rpcs.sql` — SHA256 `9fb185e7a3fdd34efa5765ab22c6db3d03c83b034cd70b17871af5e5ca217435`.
3. Any subsequently reviewed completion-recovery migration, after these dependencies, with its final checksum recorded before release.

Despite the first migration's historical re-run comment, do not blindly reapply it: it backfills workspace slugs and upserts bucket configuration. Review missing objects and divergent definitions, row-count impact, backup/restore evidence and legacy compatibility first. The four workspace RPC contracts are `approve_output_version(uuid,uuid,text)`, `decide_output_version(uuid,uuid,text,text)`, `create_output_version(uuid,uuid,text,uuid,text,text,jsonb,uuid)` and `export_output_version(uuid,uuid,text,text)`. Isolated tests must prove exact-version approval, concurrent version creation, export idempotency and allowance enforcement.

## 8. Release decision and rollback worksheet

Fill these fields before requesting the applicable operational authorization. An unset field is a release blocker, not permission to infer a value.

| Decision | Prepared value / required evidence |
|---|---|
| Source | `YNWAforever/smeassistant`; audited base `3fae6ef020d72ff528a4a9b50b5b013c2c5b1995`; final tested commit and CI URL pending |
| Staging | Stable origin, isolated DB/Auth project, mail sink or authorized contact, deployment ID pending |
| Successor | `prj_Hbox4o4NhM3p0yxRxmY8Xq1mjtb5` in `team_qvzlsFmfCsLkgItSypqHjw3z` |
| Runtime | Local Node 24.18.0; repository target 22.x; Vercel read-only inventory still 24.x on 2026-09-05; reconcile and verify exact final build |
| Merchant domain | Intended `smescanner.fimmick.com`; current ownership must be reverified immediately before cutover |
| Staff | Preserve `sme-scanner-one.vercel.app`; record its current deployment and authenticated staff check |
| Scheduler | Retain existing runner; source configuration targets legacy merchant origin; prove routing remains correct when that origin moves and review any explicit target change |
| Test authority | Named HK/TW businesses, account ownership, contact, provider/LLM budget, Stripe test-mode permission pending |
| Schema | Correct shared project access, catalog comparison, authorized missing migration list, compatibility and recovery evidence pending |
| Rollback | Capture pre-cutover domain project/deployment and each changed callback, webhook, environment and worker setting; authorized rollback scope pending |
| Observation | Proposed 30-minute bounded window after cutover, covering at least one five-minute worker tick and an authorized queued completion; daily enqueue requires a separately recorded observation or authorized fixture trigger |

The rollback trigger is failure of ownership/authentication, cross-workspace authorization, billing idempotency, a critical HK/TW journey, or retained-runner completion on the final build. Record the failing evidence and use only the approved rollback scope. Preserve job IDs for reconciliation; never rerun paid scans to repair workspace state. A 30-minute quiet log window does not prove daily scheduling. No recurring monitor is created by this worksheet.

## Completion recovery activation prerequisite

The local prepared implementation adds, in order, `20260905000000_completion_idempotency.sql`, `20260905000001_workspace_completion_ledger.sql`, and `20260905000002_workspace_completion_fencing.sql`. Record final checksums after review. No shared migration has been applied. Even with completion disabled, the updated default helper audit upserts require migration 00000; flag-off is not schema compatibility. Local SQL/PostgREST tests now establish idempotency, expired-worker fencing, scope validation and interactive-write compatibility. Keep `WORKSPACE_COMPLETION_ENABLED=false` until retained caller/receiver parity and the approved isolated-staging schema/runtime validation pass. The dedicated `WORKSPACE_COMPLETION_SECRET` is server-only and at least 32 bytes; it is neither an Auth session nor a service-role key.

With the feature enabled, inline scan completion uses the persisted ledger. The prepared `POST /api/internal/workspace-scan-completion` accepts exactly `{ "jobId": "<uuid>" }` or `{ "reconcile": true }` with its dedicated Bearer credential. It rejects client-supplied workspace/location/status. Job linkage and terminal state come from the database; reconciliation selects at most five jobs. Responses distinguish completed/skipped, busy (202), and retry/unavailable (503). The caller must inspect individual reconciliation results; an HTTP response does not prove every job completed.

Prepare the retained legacy patch as a separate reviewable change: after inline engine persistence and in the existing `/api/scan/notify` callback, forward only the persisted job ID; on the existing five-minute tick call reconciliation before normal queue work with a bounded timeout, then continue ordinary queue work even if reconciliation fails. Use an explicitly configured stable successor origin, exact HTTPS origin validation and `redirect: manual`; never send the secret to a redirect target. Do not target the merchant domain until routing is verified after cutover. Legacy retains report-email ownership. Do not add a cron or replay paid collection for workspace recovery.

The local code does not alter the pinned legacy checkout or deployed scheduler. The caller patch is prepared/source-reviewed and local SQL race tests pass. Task 4 cross-runtime exit remains incomplete until full retained caller/receiver parity and isolated-staging validation pass. Missing completions remain visible in `workspace_scan_completions`; a completed engine job is insufficient. A disabled feature continues the original best-effort hook with the reviewed retry repairs, without promising process-exit recovery.

The concrete retained-runner change is prepared in [legacy-workspace-completion.patch](legacy-workspace-completion.patch), pinned to upstream `b9b4151fb89217a926e38f187873b5ff9f10f90f`. `git apply --check` passes and its extracted transport fixtures pass 20 cases. It is not applied to the pinned checkout or a deployed service. Independent source review is complete; execute full caller/receiver integration locally before requesting its operational rollout.

</details>
