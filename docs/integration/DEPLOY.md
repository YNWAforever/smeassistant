# Deployment and acceptance runbook

Prepared for review; this document does not execute or authorize remote operations. Public checks prove only their named response boundaries. Launch acceptance is **not run** until evidence is recorded for the exact staging and final deployments in [LAUNCH-REPORT.md](LAUNCH-REPORT.md).

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
5. Prepare schema inventory and compatibility evidence read-only. Compare all 28 pinned upstream migrations and the two workspace additions, including constraints, grants, RLS and RPC behavior. Empty-database tests do not prove a shared database's state. Prepare exact missing migrations and verification for review; apply only under applicable authorization, isolated staging first.

Repository build settings: Next.js, root `/`, Node 22.x (`.nvmrc`), pnpm 9.12.0; install `pnpm install --frozen-lockfile`, build `pnpm build`. Record actual deployed runtime separately. Keep the existing scheduler; do not create a competing cron. An engine-completed job is not proof that workspace post-processing completed.

Publication guard: `vercel.json` disables automatic Git deployments for `codex/merchant-acceptance-completion`. Publishing its review PR does not authorize a deployment. Remove or revise that branch-specific guard only as part of an authorized staging plan; other branches retain their existing behavior.

## 2. Identify an isolated staging environment

Choose and record one stable HTTPS staging origin and a database/Auth/mail environment isolated from the shared project. Do not treat the existing production alias as staging solely because the merchant domain has not moved. Do not copy shared credentials into a fixture environment.

Keep every staging callback, mailed link and checkout return on that same staging origin. No staging journey should redirect to the legacy merchant app.

| Configuration or registration | Staging value | Final value, prepared separately |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `<staging-origin>` | `https://smescanner.fimmick.com` |
| `APP_ORIGIN` | `<staging-origin>` | `https://smescanner.fimmick.com` |
| Supabase Auth allowlist | `<staging-origin>/auth/callback` in the isolated project | `<final-origin>/auth/callback` in the authorized final project |
| `GOOGLE_OAUTH_REDIRECT_URI` | `<staging-origin>/api/oauth/google/callback` | `<final-origin>/api/oauth/google/callback` |
| `GOOGLE_OAUTH_CLAIM_REDIRECT_URI` | `<staging-origin>/api/oauth/google/claim/callback` | `<final-origin>/api/oauth/google/claim/callback` |
| Google client registration | Both exact callback URIs and the staging JavaScript origin | Both exact final callback URIs and the final JavaScript origin |
| Stripe webhook registration | `<staging-origin>/api/webhooks/stripe`, test mode | `<final-origin>/api/webhooks/stripe`, explicitly selected mode |
| `STRIPE_WEBHOOK_SECRET` | Secret for this exact staging endpoint | Secret for this exact final endpoint |

Two Stripe endpoints have distinct signing secrets; one secret must not be assumed to validate both. Retain `OWNER_SELF_SERVICE_CLAIM` unset. Enable `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` only as explicitly approved; `--claim-flag` describes the expected setting and does not change it.

Inventory variable names and purposes from `.env.example`, never secret values:

- Supabase: isolated/final project identity, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY`.
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
