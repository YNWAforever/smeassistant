# Neon cutover and data-preserving recovery

Prepared locally on 2026-09-07. **Hosted execution: NOT READY / NOT RUN.** The user has answered **NOT CHOSEN** for the hosted target. Do not interpret preparation approval as provisioning, migration, deployment, mail, provider, billing, scheduler, domain or promotion authority.

## Release record and ownership

| Input | Current record / required operator evidence |
|---|---|
| Reviewed runtime source | `853bdee87031cd1d1b2282969ab1b238c498d147` |
| Preparation parent | `0da3b65af99c4c7381907b3b5ad97001a5599d6b`; Task 17 adds documentation, env comments and one SQL rehearsal only |
| Exact deploy candidate SHA | NOT SELECTED. After independent Task 17 review record the full candidate commit and verify its runtime diff from the reviewed source; a docs/test commit is not a new full-gate run |
| Local Task 16 evidence | All ten technical gates passed on runtime source above **plus** user-owned unstaged `e2e/owner-shell.spec.ts`, SHA256 `C34D6BB9BD439AF56AF8EB3A47693170CE8EC4C54FE6A5DBB112C41C545236D4`. This is not commit-only or remote CI proof |
| Independent Task 16 review | APPROVED, including readiness fix and explicit pending-invitation amendment; no outstanding Critical/Important findings |
| Tested runtime | Node `24.18.0`, pnpm `9.12.0`; select Node 24 for the planned deployment and record its actual version. `.nvmrc` 22 is a historical local default, not evidence of a passing Node 22 run |
| Project / region / branch / database | NOT CHOSEN; record immutable IDs, empty application-data status and regional Postgres/Auth capabilities before operations |
| Vercel project / stable staging origin / final origin | NOT CHOSEN; historical aliases are not approved destinations |
| Release operator / database operator / Auth-provider operator / recovery owner / approver | UNASSIGNED; name each person and responsibility before a ready decision |
| Acceptance identities | Authorized mail recipient, Google test account, HK/TW business identities NOT CHOSEN; keep private contact details in the approved restricted record |
| Recovery deployment / maintenance control / observation window | NOT CHOSEN. Record exact compatible build ID, switch mechanism, write-drain procedure and responsible operator before accepting writes |

Keep `vercel.json` branch deployment guards unchanged, including `codex/neon-migration: false`. No new cron. Preserve the old Supabase resources, legacy staff application and domain. Old upstream catalog/migration evidence is historical compatibility context, not instructions to migrate a shared Supabase database.

## Configuration source and scope map

Record names, target IDs, modes and secret-manager references only. Never print URLs containing credentials, secret values, cookies, OAuth tokens or mail-link tokens.

| Setting | Source | Scope / verification |
|---|---|---|
| `DATABASE_URL` | Selected branch pooled connection for a restricted LOGIN member of `sme_app_runtime` | Application runtime only; no owner/admin credentials; exact credentials independently exercised by readiness |
| `DATABASE_URL_UNPOOLED` | Same branch/database direct migration-role connection | Authorized migration/readiness process only; do not deploy to the web runtime |
| `NEON_READINESS_HOST`, `NEON_READINESS_DATABASE` | Independently verified selected endpoint and database | Nonsecret expected target; readiness canonicalizes Neon `-pooler` suffix and checks host, port and database equality |
| `NEON_AUTH_BASE_URL` | Selected branch managed Auth configuration | Server SDK proxy endpoint; HTTPS, never a database URL; region/capability and branch binding require hosted verification |
| `NEON_AUTH_COOKIE_SECRET` | Newly securely generated independent secret, at least 32 characters | Server only, shared consistently across instances of the approved environment |
| `APP_ORIGIN`, `NEXT_PUBLIC_SITE_URL` | Approved stable staging/final bare HTTPS origin | Same origin for canonical metadata, cookies and return URLs; registered Auth trusted origin and callback configuration must agree |
| Managed login mail | Selected supported managed Auth sender/transport and its verified sender setup | Auth operator configuration, distinct from report mail; delivery only to explicitly approved recipient |
| Google sign-in provider | Managed Auth Google registration for the selected branch | Use the exact redirect URI supplied by that Auth registration; do not substitute business OAuth callbacks |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Approved business integration OAuth registration | Server only; separately authorized scopes/consent and account/business |
| `GOOGLE_OAUTH_REDIRECT_URI` | `<APP_ORIGIN>/api/oauth/google/callback` | Byte-exact registered business OAuth callback |
| `GOOGLE_OAUTH_CLAIM_REDIRECT_URI` | `<APP_ORIGIN>/api/oauth/google/claim/callback` | Separate business claim callback; `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=false` until authorized |
| `RESEND_API_KEY`, `REPORT_EMAIL_FROM`, `REPORT_RECOVERY_ENABLED` | Approved report-delivery account/sender/mode | Separate from managed login email; leave recovery disabled until bounded delivery checks authorized |
| Evidence/LLM/Blob/analytics variables | Existing approved provider accounts and approved target/test mode; `.env.example` plus private-storage integration guide | Retain product integration boundaries; absent evidence remains unavailable; no guessed or borrowed credentials |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, HK/TW price IDs | Approved Stripe account, target mode and endpoint-specific webhook registration | Record test/live mode and routing; do not map old subscriptions to new empty accounts by email |
| `RATE_LIMIT_SECRET`, `REPORT_ACCESS_TOKEN_SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY` | Approved secret manager, independently generated values matching `.env.example` requirements | Server-only security configuration; never reuse Auth cookie material |
| `SCAN_EXECUTION_RUNTIME`, `SCAN_WORKER_URL` | Reviewed execution choice | Select `vercel`; external scheduled/cloudflare dispatch is blocked in current code |
| `WORKSPACE_COMPLETION_ENABLED`, `WORKSPACE_COMPLETION_SECRET`, `CRON_SECRET` | Approved receiver and existing scheduler configuration | Leave completion disabled until its schema/runtime/caller gates pass; one scheduler owner; dedicated completion secret |

Readiness is **read-only**. It checks configuration, migration journal/checksums, expected tables/functions on the direct connection, then opens the **exact application connection** and checks role membership, effective DML/schema grants, and rejects owner/privileged credentials. It does not create roles, grant privileges, migrate, seed, inspect business rows, contact Auth or prove provider functionality. Its output contains status/category and validated nonsecret host/database only. Host normalization is not an independent cloud project/branch inventory: the database operator must establish those IDs separately.

## Immutable reviewed migrations

SHA256 from current file bytes, not a copied historical Supabase checksum. Verify bytes again in the exact candidate checkout; any mismatch is STOP, not a reason to rewrite the journal. Migration loader reads UTF-8 and journals the SHA256 of each SQL string.

| Order / file | SHA256 |
|---|---|
| `neon/migrations/0001_identity.sql` | `f2e65e08e94c6514735db9a7eb6b0dcc5ec522732e2fb3e573b02b62aedb60fa` |
| `neon/migrations/0002_business.sql` | `34c46b53bc08e12d7c76d365c177877890ebadec27fbf4d7836e253d901021a1` |
| `neon/migrations/0003_workflows.sql` | `bfd553d6b500e953af6c663c8af9130a4e659fa0781d0582ffb0b91a278e599a` |
| `neon/migrations/0004_atomic_operations.sql` | `b24f2cbba79881d1f97118e05a5d7990a847fdaed6ecd5461682f404af076069` |

The authorized DB operator must provision a separate restricted non-owner group `sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS` before migrations. Provision an independent application LOGIN role with usable inherited membership in that group, no owner/admin-role membership, no elevated flags, and a securely delivered password. Store its pooled connection directly in the authorized runtime secret store, without terminal echo or a credential-bearing command argument. Migration-owner credentials belong only to the operator process. Current migrations apply grants/policies; readiness checks them but never repairs them.

There is **no hosted migration CLI** in package scripts. `corepack pnpm db:verify` always creates its own local disposable fixture and cannot apply a hosted schema. The reviewed API is `applyMigrations(pool)` in `scripts/neon/migrations.ts`; its single locked transaction covers DDL and the immutable journal. Only after explicit target/schema authorization, an operator may run this invocation in the exact candidate checkout with the direct credential injected privately into that process:

```powershell
# AUTHORIZED OPERATOR ONLY; NOT RUN by Task 17.
# DATABASE_URL_UNPOOLED is already injected securely for the approved target.
corepack pnpm exec tsx -e 'import { Pool } from "pg"; import { applyMigrations } from "./scripts/neon/migrations.ts"; (async () => { if (!process.env.DATABASE_URL_UNPOOLED) throw new Error("missing_direct_url"); const p = new Pool({connectionString: process.env.DATABASE_URL_UNPOOLED}); try { await applyMigrations(p); console.log("migration_completed"); } finally { await p.end(); } })().catch(() => { console.error("migration_failed"); process.exitCode=1; });'
corepack pnpm neon:readiness
```

Do not run that invocation with a missing direct URL (pg can fall back to ambient configuration). Confirm presence and independently approved target identity without displaying its value before launching. Give the readiness process both scoped URLs and required nonsecret/Auth configuration; never put the direct URL into the serving web environment. A failure stops the procedure; investigate without blind retries or journal edits. No production fixture seeds. `corepack pnpm seed:demo --owned-test` creates, verifies and destroys only its own disposable database and ignores ambient database URLs.

## Gated execution sequence

Every row currently remains NOT READY / NOT RUN. The named operators must complete the release inputs above and obtain the applicable explicit authorization, including exact action, candidate SHA, target IDs/origin, identities, request/cost bounds, stop conditions and recovery plan. Record who approved what and when; plan approval alone is insufficient.

| Gate | Concrete action and pass evidence | Stop condition |
|---|---|---|
| 1. Isolated target provisioning | Select/create an isolated **empty application-data** Neon/Auth target after provisioning authorization; verify region/capabilities, project/branch/database/Auth IDs and direct/pooled equality | Any unchosen/mismatched target, unsupported capability or existing business data |
| 2. Schema and roles | Verify candidate bytes above, provision roles, apply exact migrations with owner-only API, capture journal/checksum evidence and run `corepack pnpm neon:readiness` once | Nonzero exit, unsafe app role or any mismatch; do not seed managed Auth |
| 3. Stable staging | Deploy the exact reviewed candidate after deployment authorization to the one approved stable origin; record deployment ID, actual Node version, configuration presence and callback registrations; run readiness before any hosted Auth flow | Mutable preview origin, wrong revision/runtime, callback mismatch, readiness failure |
| 4. Bounded hosted acceptance | Execute only the separately approved matrix below, one attempt per case unless an explicit bound says otherwise; record exact pass/fail and costs | Any unauthorized identity/provider, auth bypass, private-data exposure, callback failure or budget exhaustion |
| 5. Runtime and scheduler parity | Select Vercel; verify actual producer database and receiver revision/auth, duplicates, retry/reconcile outcomes and one existing scheduler owner using [receiver contract](NEON-RUNNER-COMPATIBILITY.md) | An unchanged Supabase runner, absent forwarding parity or competing scheduler blocks that mode/promotion |
| 6. Production preparation | Independently repeat schema/readiness on approved empty production target; prepare exact final callbacks, certificate/origin, Stripe mode/webhook routing, maintenance/traffic control and compatible recovery build | Missing recovery target, unresolved external subscriptions or incomplete acceptance |
| 7. Promotion | Present exact production action and obtain promotion authorization; repeat readiness and authorized bounded hosted probes on the **serving** deployment | Any failed gate; stop writes/enter authorized maintenance, preserve data and evidence |

## Proposed acceptance bounds, still awaiting authorization

The following is a reviewable proposed maximum, not authority to send requests. Operators must approve or replace each bound and fill the private acceptance record. No automatic retry. Do not run `e2e:live` or a fixture command against a real service as a substitute.

- One `corepack pnpm launch:check --origin <approved-origin> --canonical-origin <approved-origin> --claim-flag off` invocation per approved deployment. This covers public reachability/metadata and negative request/signature boundaries only; it never proves successful Auth or billing. Use `on` only if the actual claim flag was separately authorized on.
- At most two managed login email requests to the approved recipient: use the first for one expired-link rejection after the provider-configured expiry within an explicitly approved observation window; use the second fresh link for one successful redemption, one replay rejection and one logout/revocation check. Any additional fresh link requires an explicitly increased mail bound. Pending invitations remain valid until accepted/revoked; expiry applies to managed sign-in links, not a separate invitation TTL.
- One managed Google sign-in round trip with the approved account. Separately, one business OAuth/claim round trip per approved HK/TW business where applicable; record exact registration, requested scopes, callback and accepted membership. Signup/email match alone must not grant ownership.
- One HK and one TW merchant journey: authorized scan/report, unlock/access, workspace isolation, draft/edit/approve/export and one repeat-use check. The approval record must itemize provider/LLM request ceilings and a monetary cap before any live scan or generation; until supplied these journeys remain NOT READY.
- Stripe test mode only after explicit test-event permission: one signed event per approved entitlement transition plus one duplicate-delivery check. Record event IDs privately and idempotency/entitlement outcomes. No charges, refunds, subscription recreation or live reconciliation inferred from this bound.
- Before enabling billing, reconcile legacy subscriptions with authoritative account/ownership records under separate authorization. Do not import old data or attach subscriptions to new accounts by email, and do not cancel legacy subscriptions as a cleanup step.

For each executed case record date/operator, exact source SHA, deployment ID, target identifiers, origin/modes, approved bound, attempts consumed, expected/actual result, sanitized evidence location and recovery decision in LAUNCH-REPORT. Failed/blocked attempts stay visible. A public pass or local fixture result cannot replace hosted Auth, sender, OAuth, payment or runner proof.

## Recovery decisions and local rehearsal

**Before first new write:** record the current traffic assignment, existing compatible traffic target, callback/webhook/scheduler state and an authorized reversal action. If the new target has accepted no writes, the approved operator can reverse traffic/configuration to that recorded target. No traffic switch was rehearsed here; legacy staff/domain remain untouched.

**After any new write:** never roll back to an old Supabase-only release to serve Neon data. Stop admitting new writes with the approved maintenance mechanism and drain outstanding requests/jobs; record IDs, current statuses and inflight leases. Choose a previously verified Neon-compatible build on the **same** database, a reviewed forward fix, or maintenance while investigating. Do not destroy/reseed the database, restore a pre-write snapshot over new records, replay collectors blindly or assume raw scan leases fence every engine write. Snapshot/PITR recovery, if later proposed, needs its own data-loss assessment and authorization. Verify the new user, accepted membership, exact report and subsequent allowed write after recovery before reopening traffic. Record deployment and configuration changes separately from durable data state.

Local rehearsal: `test/integration/neon-recovery.integration.test.ts` applies immutable migrations in an owned `postgres:16` container with `--network none`. Restricted runtime credentials create one new application user, an accepted workspace member and a related completed report with score, private JSON and summary. The test stops issuing app work, drains/disposes the pool, proves it cannot read, validates exact container ID/ownership labels, stops/starts only that container, verifies a changed start timestamp, reconnects to the same database/role, and checks exact public/private report data through the production report repository plus the user/member/report relation through SQL. A subsequent repository summary write/read proves usable recovered access. Cleanup destroys only that owned disposable fixture. No managed Auth state is seeded.

On 2026-09-07 this focused rehearsal passed **1 file / 1 test**, exit 0, Vitest 4.1.11, Node 24.18.0, pnpm 9.12.0, Docker Linux server 29.7.2. Initial run: 14.43 seconds; final restored run: 13.71 seconds. An intentional negative control deleted only the owned fixture report before pool drain: 1 test failed as expected (exit 1, 13.40 seconds), because the production repository returned null instead of the saved report after restart. The destructive test-only line was removed before the final pass. It proves local DB persistence across a real restart and application pool replacement with the current compatible repository. It does **not** run an old deployment, actual production maintenance/traffic rollback, hosted Neon restore, managed Auth recovery or provider actions. This is new Task 17 proof; the earlier 232 SQL cases belong to the Task 16 full gate, not this run.

Reproduce locally from this checkout (requires the already-present `postgres:16` image):

```powershell
$env:NEON_INTEGRATION='1'
$env:VITEST_MAX_WORKERS='1'
$env:NODE_OPTIONS='--require=C:/Users/laich/Documents/smeassistant/.worktrees/neon-migration/.superpowers/sdd/task-9-transport-guard.cjs'
corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-recovery.integration.test.ts
```

The absolute preloader is a local audit artifact; the tracked integration config also loads `test/e2e/transport-guard.cjs`. The database has no network and is reached through owned Docker exec pipes plus a host loopback relay. No hosted credentials are needed. No full gate was repeated for Task 17 docs/comments/test additions, and no remote CI or deployed release is claimed. Operational evidence must be a later separately authorized record/commit.
