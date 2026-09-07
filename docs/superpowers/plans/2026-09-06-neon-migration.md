# Neon Migration Implementation Plan

> User-approved amendment (2026-09-07): retain pinned `@neondatabase/auth@0.5.0-beta` and only its transitive `@supabase/auth-js@2.79.0` library relationship. The library is runtime-reachable through Neon error helpers; this is not zero Supabase-authored packages. No direct application SDK client, Supabase service use, credentials, endpoints or active imports are allowed. The exit gate validates the pinned manifest/importer, package integrity, snapshot and sole introducer edge, then scans all remaining lockfile content. Version or introducer drift fails closed. No SDK patch or upgrade is authorized. This supersedes the literal zero-dependency acceptance wording only; hosted acceptance and release remain separate gates.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all active Supabase dependencies with Neon Postgres and Neon managed Auth, starting empty and preserving every current product flow.

**Architecture:** Vercel retains Next.js UI/API and server-side business authorization. Drizzle and a server-only PostgreSQL pool replace Supabase/PostgREST business queries. Neon managed Auth verifies identity; application UUIDs, accepted memberships and server-resolved action/location determine authority. Database-neutral scan persistence preserves atomic claims, retries and completion fencing.

**Tech Stack:** Next.js 16.2.6, React 19.2.6, TypeScript, pnpm 9.12.0, PostgreSQL, Drizzle, pg, Neon managed Auth SDK, Vitest, Playwright and isolated Docker fixtures. Pin new packages and commit the lockfile without unrelated upgrades.

## Global Constraints

- Approved specification: `docs/superpowers/specs/2026-09-06-neon-migration-design.md`, commit `3dbd16b`.
- Application baseline: `origin/main` at `9f89cbca02e233d49a616d251ed4a5b07ddde402`. Re-fetch and reconcile later commits before execution.
- Work in `C:/Users/laich/Documents/smeassistant`; never edit the legacy `Documents/smescanner` checkout.
- Empty Neon target; no legacy data/accounts imported and no production fixture seeds. Preserve old Supabase resources and legacy staff traffic.
- Preserve email magic links, Google login, scans, reports, workspaces, invitations, claims, assistant artifacts, billing and operational behavior.
- Accepted viewers and out-of-scope managers keep permitted read-only evidence; drafts use server-resolved action/location, including omitted/spoofed context.
- This plan does not perform or authorize implementation, cloud provisioning, shared migrations, paid providers, real email, payment events, deployment or domain changes. Record applicable explicit authorization separately.
- The earlier single Grove search authorization was consumed; it does not authorize migration acceptance calls.
- No competing scheduler, no automatic redirection of legacy jobs to a new database, no restart of Phases 0-7, and no conversion of skipped E2E cases into passes.
- Use an isolated worktree at execution time; one reviewed slice per commit. Do not deploy incompatible intermediate identity/data models.
- Record actual runtime versions. Package floor is Node >=22.13.0; recent local/production evidence used Node 24. Align the selected runtime before final verification.

## Work packages

| Package | Tasks | Deliverable | Dependency |
| --- | --- | --- | --- |
| Data foundation | 1-4 | Inventory, isolated schema, pool and atomic SQL | Approved specification |
| Authentication | 5-7 | Identity, sessions, membership and claims | Foundation |
| Product persistence | 8-11 | Scan/report/workspace/assistant/integrations | Foundation and Auth |
| Execution | 12-13 | Database-neutral engine, fenced recovery | Product persistence |
| Acceptance and release | 14-17 | Replacement harness, removal gate and cutover record | All earlier packages |

Each task below is an independent review boundary. Intermediate commits can be tested locally but are not release candidates. Do not push an implementation branch before reviewing automatic Git deployment behavior.

## File structure and shared contracts

New paths below are proposed files; existing paths were checked against the baseline. Task 1 completes the exhaustive callsite list before changes expand beyond a task's file set.

| New path | Responsibility |
| --- | --- |
| `docs/integration/neon-dependency-map.json` | Consumer-to-task/replacement/evidence mapping |
| `lib/db/config.ts` | Pure configuration validation and sanitized errors |
| `lib/db/client.ts` | Lazy server-only pg pool and Drizzle database |
| `lib/db/transaction.ts` | Same-connection transaction lifetime and local context |
| `lib/db/schema/` | Typed application schema grouped by identity, jobs, workspace, artifacts, integrations |
| `neon/migrations/` | Fresh application migrations, no managed Auth table writes |
| `scripts/neon/verify-migrations.ts` | Isolated apply/replay/privilege checks |
| `lib/identity/contracts.ts` | Verified identity boundary |
| `lib/identity/neon.ts` | Managed SDK and session normalization |
| `lib/identity/users.ts` | Provider-subject to app UUID mapping |
| `lib/identity/client.ts` | Browser Auth client only |
| `lib/repositories/` | Explicit domain queries; no generic Supabase imitation |
| `packages/scan-engine/src/execution-store.ts` | Runtime-neutral persistence contract |
| `lib/scan/execution-store.ts` | PostgreSQL engine persistence |
| `lib/workspace/completion-transaction.ts` | Validated fenced write transactions |
| `scripts/assert-no-supabase.mjs` | Active dependency exit gate |
| `scripts/neon/readiness.ts` | Read-only config/schema readiness |

Preserve current exported `SessionUser`, `Membership`, `RouteAuth`, `ScanStartInput`, `ScanJobAttribution`, `ScanJobInsertResult` and `CompletionResult` shapes. `SessionUser.id` becomes the app UUID, never the raw Neon subject. Keep pure scoring/region contracts unchanged.

## Standard review cycle

Every implementation task includes these steps in addition to its specific checklist:

- [ ] Read source and existing tests; add a failing behavioral regression before replacing the adapter.
- [ ] Run the focused test and record its actual failure; missing infrastructure is not a successful regression.
- [ ] Implement only the task's reviewed interfaces and behavior.
- [ ] Run focused tests and `corepack pnpm typecheck`; inspect the diff.
- [ ] Obtain independent authorization/test review for Tasks 4-7, 10 and 13 and full review in Task 16; resolve findings before integration.
- [ ] Stage explicit reviewed paths, commit using the suggested message, and record SHA/results. Never use `git add -A`.

## Task 1: Complete dependency and SQL inventory

**Files:** Create `docs/integration/neon-dependency-map.json`, `scripts/neon/check-inventory.mjs`, `tests/neon-inventory.test.ts`. Read `supabase/migrations/`, `package.json`, `packages/scan-engine/package.json`, `test/integration/`, `test/e2e/`, `.github/workflows/ci.yml`, `docs/integration/DEPLOY.md` and `docs/integration/LAUNCH-REPORT.md`.

**Produces:** JSON records `{path,kind,task,replacements,status,evidence}`. `kind` is runtime/schema/test/operation; `task` is 1-17; `status` is pending/replaced; replacements/evidence are string arrays. The checker reads tracked source and never reads credential files.

- [ ] Use the graph to enumerate `@supabase`, `SupabaseClient`, `supabaseServer`, `createServiceClient` and RPC consumers. Include type imports and package entrypoints.
- [ ] Use SQL/config string search for `auth.users`, `auth.*`, `request.headers`, role grants, storage/realtime/edge functions and scheduler URLs. Inventory every object in the 33 source migrations and assign an owning task.
- [ ] Add a fixture checker test: an unlisted temporary Supabase import must fail; a listed import passes inventory coverage. Use an owned temp directory and remove only that directory.
- [ ] Record required execution modes and external producer/consumer boundaries. Document storage/realtime absence only if verified; any required discovered service must have a replacement before the final exit gate.
- [ ] Run `corepack pnpm exec vitest run tests/neon-inventory.test.ts` and `node scripts/neon/check-inventory.mjs`. Expected: no unowned consumer or SQL object.
- [ ] Commit: `docs: inventory Supabase replacement boundaries`.

## Task 2: Connection boundary and PostgreSQL-only fixture infrastructure

**Files:** Create `lib/db/config.ts`, `lib/db/config.test.ts`, `lib/db/client.ts`, `lib/db/transaction.ts`, `test/integration/neon-database.ts`, `test/integration/neon-transaction.integration.test.ts`. Modify package manifest/lockfile, `.env.example`, `test/integration/docker.ts`, `test/integration/global-setup.ts`, `vitest.integration.config.ts`.

**Interfaces:** `readDatabaseConfig(env: Record<string,string|undefined>): {applicationUrl:string;migrationUrl?:string}`; `getPool(): Pool`; `getDatabase(): NodePgDatabase`; `withTransaction<T>(run:(client:PoolClient)=>Promise<T>):Promise<T>`.

- [ ] Add pure tests for absent/blank/non-Postgres URL and sanitized exceptions:

```ts
expect(() => readDatabaseConfig({ DATABASE_URL: ' ' })).toThrow('database_configuration_missing');
expect(() => readDatabaseConfig({ DATABASE_URL: 'https://invalid.example' })).toThrow('database_configuration_invalid');
```

- [ ] Resolve compatible package versions through registry metadata and current official docs. Install exact versions of `pg`, `drizzle-orm`, `drizzle-kit`, `@types/pg`, `@vercel/functions`, `@neondatabase/auth`. Preserve unrelated lockfile entries. The currently retrieved Next.js Auth guide labels the managed integration Beta: record pinned SDK maturity/exports and do not claim GA from older skill text.
- [ ] Lazily construct a shared server-only pg pool from validated `DATABASE_URL`, attach the supported Vercel pool lifecycle, and construct Drizzle from it. Use `DATABASE_URL_UNPOOLED` only for migrations. Do not print connection strings.
- [ ] Implement same-connection transaction lifetime:

```ts
export async function withTransaction<T>(run:(client:PoolClient)=>Promise<T>):Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const value = await run(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
```

- [ ] Add PostgreSQL-only mode to the owned Docker harness. Require loopback host, explicit test database identity, owned container labels and `NODE_ENV=test` before destructive setup. Never fall back to a process production URL.
- [ ] Test rollback from a second connection and absence of context on the next pool borrower. Keep old harness consumers running until replacement tests pass.
- [ ] Run `corepack pnpm exec vitest run lib/db/config.test.ts` and `corepack pnpm test:integration -- test/integration/neon-transaction.integration.test.ts`. Expected: validation/redaction/rollback pass with zero hosted connections.
- [ ] Commit: `feat: add isolated PostgreSQL data boundary`.

## Task 3: Fresh Neon schema and app identity

**Files:** Create `neon/migrations/0001_identity.sql`, `0002_business.sql`, `0003_workflows.sql`; `lib/db/schema/identity.ts`, `jobs.ts`, `workspaces.ts`, `artifacts.ts`, `integrations.ts`, `index.ts`; `drizzle.config.ts`; `scripts/neon/verify-migrations.ts`; `test/integration/neon-schema.integration.test.ts`.

**Produces:** All required business objects and typed schema, with an application UUID identity and checksum-validated migration journal. Managed Auth tables are outside application migration ownership.

- [ ] Write catalog/behavior expectations for all Task 1 objects on empty PostgreSQL without Supabase roles or `auth.users`.
- [ ] Create app identity with this DDL:

```sql
CREATE TABLE public.app_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.auth_identities (
 provider text NOT NULL CHECK (provider = 'neon'),
 subject text NOT NULL,
 user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
 PRIMARY KEY (provider,subject)
);
```

No global unique email constraint becomes an implicit account-linking mechanism.

- [ ] Translate the final business DDL from the 33 source migrations, preserving defaults, uniqueness, indexes, checks and deletion rules. Replace `auth.users` FKs with `app_users`; do not bootstrap or alter `neon_auth`.
- [ ] Give the app role only runtime grants; keep schema owner/migration privileges separate. Revoke PUBLIC execution of privileged functions and preserve constrained search paths. For retained RLS tables, explicitly define server-only application-role policies matching application-layer authorization; grants alone do not bypass RLS. Do not make the runtime role a table owner or grant BYPASSRLS. Test with the actual restricted role, not the migration superuser.
- [ ] Implement ordered migrations with checksums and transaction rollback. Test fresh apply, second no-op run, changed-checksum rejection, interrupted migration and zero seeded business rows.
- [ ] Run `corepack pnpm exec tsx scripts/neon/verify-migrations.ts` and `corepack pnpm test:integration -- test/integration/neon-schema.integration.test.ts`. Expected: complete catalog and privilege checks pass.
- [ ] Commit: `feat: define fresh Neon business schema`.

## Task 4: Atomic SQL operations and completion context

**Files:** Create `neon/migrations/0004_atomic_operations.sql`, `lib/repositories/workflow.ts`, `test/integration/neon-workflow.integration.test.ts`. Modify `lib/db/transaction.ts` for `withCompletionContext<T>(jobId:string,token:string,run:(client:PoolClient)=>Promise<T>):Promise<T>`.

**Consumes:** Task 3 schema and original SQL functions, including create/approve/decide/export output version, job claims, rate limiting, billing and completion. Preserve their argument/return contracts while replacing Supabase transport and identity/role assumptions.

- [ ] Add two-connection tests for version creation, export retry and entitlement/event idempotency. Assert no duplicate effect and correct locking.
- [ ] Translate function bodies rather than replacing atomic functions with unrelated pool calls. Bind values as parameters. Validate SQL injection sentinels remain data.
- [ ] Replace PostgREST header context with transaction-local settings on the exact writing connection:

```ts
return withTransaction(async client => {
  await client.query("SELECT set_config('app.completion_job',$1,true), set_config('app.completion_token',$2,true)",[jobId,token]);
  return run(client);
});
```

Never use process-global context or session-level SET. The context itself does not authorize an arbitrary caller token; Task 13 validates it against the locked ledger.

- [ ] Run `corepack pnpm test:integration -- test/integration/neon-workflow.integration.test.ts`; expected: real SQL concurrency and retry assertions pass. Obtain independent review.
- [ ] Commit: `feat: preserve workflow transactions on Neon`.

## Task 5: Map Neon identities to application users

**Files:** Create `lib/identity/contracts.ts`, `lib/identity/neon.ts`, `lib/identity/users.ts`, `lib/identity/identity.test.ts`, `test/integration/neon-identity.integration.test.ts`. Modify `lib/auth.ts` only after adapter tests pass.

**Interfaces:**

```ts
export type VerifiedIdentity = {provider:'neon';subject:string;email:string;verified:true};
export interface IdentityProvider {
 getIdentity():Promise<VerifiedIdentity|null>;
 signOut():Promise<void>;
}
export type ResolveApplicationUser = (identity:VerifiedIdentity)=>Promise<{id:string;email:string;verified:true}>;
```

`resolveApplicationUser` creates/loads atomically by provider and subject. It returns the application UUID and cannot grant membership.

- [ ] Add tests for null/expired/unverified identity, non-UUID subject, verified-email change, duplicate first login and same email/different subject. Concurrent first login resolves to one app user with no orphan row; same email does not silently merge identities.
- [ ] Add lazy `getNeonAuth()` in `lib/identity/neon.ts`. Validate HTTPS Auth base URL (loopback HTTP only for isolated tests) and a cookie secret of at least 32 characters. Use the documented constructor:

```ts
createNeonAuth({baseUrl:config.baseUrl,cookies:{secret:config.cookieSecret}});
```

`config` is the validated object local to `getNeonAuth`; missing configuration throws a sanitized category. No module-import secret initialization.

- [ ] Read `const {data:session} = await getNeonAuth().getSession()` and require verified user subject/email using the pinned SDK's actual typed response. Reject malformed values; never trust request JSON or a client role.
- [ ] Update `lib/auth.ts::getUser` to normalize the provider identity and return app UUID through `resolveApplicationUser`. Preserve `SessionUser` and nullable unauthenticated behavior.
- [ ] Run `corepack pnpm exec vitest run lib/identity/identity.test.ts lib/auth.test.ts` and `corepack pnpm test:integration -- test/integration/neon-identity.integration.test.ts`. Create `lib/auth.test.ts` if absent, covering existing exported authorization contracts. Expected: identity resolution never creates a privileged membership.
- [ ] Commit: `feat: map Neon identities to application users`.

## Task 6: Login, callbacks, session middleware and logout

**Files:** Create `lib/identity/client.ts`, `app/api/auth/[...path]/route.ts`, `lib/identity/return-path.ts`, `lib/identity/return-path.test.ts`. Modify `proxy.ts`, `app/auth/callback/route.ts`, `app/api/owner/magic-link/route.ts`, `app/api/workspace-invites/magic-link/route.ts`, `app/api/report-access/sign-out/route.ts`, current sign-in component from Task 1, `tests/proxy.test.ts`, `tests/sign-in-hydration.test.tsx`.

**Consumes:** `getNeonAuth`, verified app identity; **produces:** same email-link/Google login UX, safe locale-aware return paths, managed sessions and logout.

- [ ] Add callback/proxy regressions for missing config, expired/used link, malformed cookie, external return, protocol-relative return, locale preservation and logout replay. Public routes remain public; protected routes never pass through on Auth configuration failure.
- [ ] Add `safeReturnPath(value:string, fallback:string):string` in `lib/identity/return-path.ts`; reject nonlocal paths, `//`, backslash variants, encoded authority/control-character tricks and foreign origins. Tests include:

```ts
expect(safeReturnPath('//evil.example','/en/owner')).toBe('/en/owner');
expect(safeReturnPath('https://evil.example','/en/owner')).toBe('/en/owner');
expect(safeReturnPath('/zh-HK/owner','/en/owner')).toBe('/zh-HK/owner');
```

- [ ] Use the SDK's `getNeonAuth().handler()` GET/POST methods in the new API route, evaluated lazily. Map initialization failure to sanitized 503 with correlation ID. Preserve route matcher, locale logic and public metadata in `proxy.ts`; membership checks still run in application routes.
- [ ] Use `createAuthClient` from `@neondatabase/auth/next` for browser identity operations. Verify the pinned SDK's magic-link plugin method against current managed Auth documentation/package exports, compile it, and assert its endpoint with fixture transport before integrating the form. Do not replace email links with password login.
- [ ] Replace the old Supabase code exchange in `app/auth/callback/route.ts` with verified managed-session handling. Preserve only the application-owned invite/report/claim post-login actions and safe redirects; old PKCE cookies are not reused.
- [ ] Preserve the hydration-ready form controls and implement managed logout including cookie invalidation. Do not claim a local fixture cookie proves hosted revocation.
- [ ] Run `corepack pnpm exec vitest run lib/identity/return-path.test.ts tests/proxy.test.ts tests/sign-in-hydration.test.tsx` plus manifest callback/magic-link tests. Expected: unavailable Auth denies access; no redirect or replay bypass.
- [ ] Commit: `feat: replace Supabase login with Neon managed Auth`.

## Task 7: Membership, invitations and merchant claims

**Files:** Create `lib/repositories/membership.ts`, `lib/repositories/claims.ts`, `test/integration/neon-membership.integration.test.ts`. Modify `lib/auth.ts`, `lib/workspace/team.ts`, `callback-queries.ts`, `claim.ts`, `bind-workspace.ts`, `access-request.ts`, `app/auth/callback/route.ts`, `app/[locale]/owner/onboarding/page.tsx`, `app/api/workspaces/claim/route.ts`, member/invite routes in Task 1.

**Produces:** Existing membership/claim functions using app UUIDs. Preserve role ordering, `authorizeWorkspace`, accepted-at filtering and location semantics. SQL failure is not falsely converted into missing membership.

- [ ] Add accepted/unaccepted/revoked, cross-workspace, owner/manager/viewer, expired/replayed invitation and conflicting claim SQL cases. Fixture users come through app identity mapping, not writes to managed Auth tables.
- [ ] Port membership lookup and transactional invitation binding. Verified recipient identity is mandatory before granting the invited role. Sign-up alone grants no ownership; preserve current claim flags.
- [ ] Port database and session dependencies in the distinct Google business routes: `app/api/oauth/google/start/route.ts`, `callback/route.ts`, `claim/start/route.ts`, `claim/callback/route.ts`. Preserve business consent scopes, state verification and callbacks. Google login does not replace merchant proof.
- [ ] Run `corepack pnpm exec vitest run lib/auth.test.ts lib/workspace/authorize-workspace.test.ts lib/workspace/team.test.ts lib/workspace/claim.test.ts lib/workspace/access-request.test.ts` and `corepack pnpm test:integration -- test/integration/neon-membership.integration.test.ts`. Expected: same read grants, no extra authority.
- [ ] Independent review, then commit: `feat: preserve workspace access on Neon`.

## Task 8: Scan creation, status, report access and rate limiting

**Files:** Create `lib/repositories/jobs.ts`, `lib/repositories/reports.ts`, `test/integration/neon-scan-start.integration.test.ts`. Modify `lib/scan/start-job.ts`, `app/api/scan/start/route.ts`, `app/api/scan/status/route.ts`, `lib/report/store.ts`, `app/api/report-access/unlock/route.ts`, `app/[locale]/r/[slug]/opengraph-image.tsx`, `lib/security/rate-limit.ts`.

**Interface:** `JobsRepository.insert(row:ReturnType<typeof buildScanJobInsert>):Promise<{id:string}>`. Replace the optional Supabase test dependency of `insertScanJob` with this repository; preserve parser, insert builder, attribution and result contracts.

- [ ] Test selected-place/manual paths on actual PostgreSQL, HK/TW fields, slug uniqueness, parent links and server attribution. Client workspace/location values remain ignored.
- [ ] Implement the repository using the schema's typed insert, with parameterized SQL/Drizzle and explicit selected ID. Do not send `Record<string,unknown>` field names directly into string-built SQL.
- [ ] Catch configuration/connection failures before starting collectors. Return safe 503 plus correlation ID for service unavailability, while retaining 400 validation and 429 limits. Preserve existing error categories and never log credential-bearing driver errors.
- [ ] Port report/status/unlock queries with explicit private/public column selection, access-token/cookie checks and existing canonical/locale behavior.
- [ ] Port atomic rate-limit SQL without changing each endpoint's current fail-open/fail-closed policy.
- [ ] Run `corepack pnpm exec vitest run tests/scan-start-contract.test.ts tests/funnel-scan.test.ts tests/funnel-report-props.test.ts tests/funnel-unlock.test.ts` and `corepack pnpm test:integration -- test/integration/neon-scan-start.integration.test.ts`. Expected: unavailable configuration creates no job and invokes no provider; valid fixtures preserve contracts.
- [ ] Commit: `feat: move scan and report persistence to Neon`.

## Task 9: Workspace read models and private evidence

**Files:** Create `lib/repositories/workspace-read.ts`, `lib/repositories/evidence.ts`, `test/integration/neon-workspace-read.integration.test.ts`. Modify `lib/workspace/queries.ts`, `queries-pages.ts`, `brand.ts`, `assets.ts`, `measurements.ts`, `snapshots.ts`, `slug.ts`, `lib/evidence/persist.ts`, `lib/evidence/load-authorized.ts`, brand/Instagram routes in Task 1.

**Produces:** Existing read-model shapes, filters/order/pagination and evidence-authorization contract. Replace nested PostgREST selects with explicit joins, retaining optional relations.

- [ ] Add SQL tests for empty workspace, missing location/evidence, pagination boundaries, optional joins, TW market/currency and locale changes. Missing row is an empty state; SQL failure is an error.
- [ ] Port only selected columns and preserve workspace/location predicates. Do not use inner joins that silently remove incomplete merchants.
- [ ] Preserve evidence access, rights and retention. Task 1's verified storage inventory determines any required storage adapter; URL-only assets do not justify adding another service.
- [ ] Run `corepack pnpm exec vitest run lib/workspace/queries.test.ts lib/workspace/queries-pages.test.ts lib/workspace/assets.test.ts lib/workspace/brand.test.ts lib/workspace/snapshots.test.ts lib/workspace/measurements.test.ts` and the new integration file. Expected: unchanged domain fixture outputs and private data isolation.
- [ ] Commit: `feat: move workspace read models to Neon`.

## Task 10: Assistant artifacts, history and draft authority

**Files:** Create `lib/repositories/artifacts.ts`, `test/integration/neon-artifacts.integration.test.ts`. Modify `lib/assistant/live.ts`, `lib/workspace/actions.ts`, `runs.ts`, `versions.ts`, `audit.ts`, `usage.ts`, `app/api/actions/_shared/mutation.ts`, `app/api/actions/route.ts` and fix-pack routes in Task 1.

**Consumes:** Task 4 SQL version/decision/export functions and Task 7 authorization. **Produces:** same action/run/version/history/export contracts, app UUID actor attribution and atomic usage/audit effects.

- [ ] Retain regressions for viewer evidence access, out-of-scope manager read versus draft denial, omitted/spoofed action/location, cross-workspace references and nonempty facts-needed blocking usable artifacts. Denied requests must invoke neither LLM nor artifact persistence.
- [ ] Add real SQL tests for two edits, selected-version approval, immutable history, repeated export, retry usage and audit deduplication. Use fixture LLM output and local export bytes.
- [ ] Replace query/RPC transport with repositories and original atomic functions. Resolve persisted action/location before authority; never select permission scope from client hints.
- [ ] Run `corepack pnpm exec vitest run lib/assistant lib/workspace/actions.test.ts lib/workspace/runs.test.ts lib/workspace/versions.test.ts lib/workspace/audit.test.ts lib/workspace/usage.test.ts` and the new SQL file. Expected: all permission/history regressions pass with no paid calls.
- [ ] Independent authorization/test review, then commit: `feat: preserve assistant artifact authority on Neon`.

## Task 11: Billing, notifications, analytics and erasure

**Files:** Create `lib/repositories/billing.ts`, `lib/repositories/events.ts`, `lib/repositories/lifecycle.ts`, `test/integration/neon-integrations.integration.test.ts`. Modify `lib/workspace/billing.ts`, `notify.ts`, `lib/owner/billing-authorization.ts`, `lib/analytics/record-event.ts`, `app/api/webhooks/stripe/route.ts`, checkout/preferences and lifecycle consumers in Task 1.

**Produces:** Existing signature/entitlement/deduplication/deletion behavior with app identities. Unknown legacy billing associations cannot grant access based on email matching.

- [ ] Add local signed-event fixtures for unsigned rejection, replay, out-of-order events, unknown workspace/customer and duplicate effects. No Stripe API request is needed.
- [ ] Port database transitions transactionally, preserving unique event IDs and entitlement rules. Unresolved old customer associations remain unresolved until an authorized release reconciliation.
- [ ] Preserve preferences, notification dedupe, analytics contracts and existing transport seams. Database retry must not resend notification mail.
- [ ] Test erasure across app identity, membership, artifacts, report data and nullable audit actors. Preserve the original FK deletion semantics.
- [ ] Run `corepack pnpm exec vitest run lib/workspace/billing.test.ts lib/workspace/notify.test.ts lib/analytics` plus manifest Stripe route tests and the new integration file. Expected: deterministic event and deletion results, no outbound calls.
- [ ] Commit: `feat: preserve integration state and lifecycle on Neon`.

## Task 12: Make scan execution database-independent

**Files:** Create `packages/scan-engine/src/execution-store.ts`, `lib/scan/execution-store.ts`, `test/integration/neon-execution.integration.test.ts`. Modify `packages/scan-engine/src/execution.ts`, `analytics.ts`, `persist-diff.ts`, `persist-aeo-snapshots.ts`, `index.ts`, `lib/scan/run.ts` and package consumers from Task 1.

**Produces:** The following contract, using verified keys from `packages/scan-engine/src/processor.ts`:

```ts
import type { ScanProcessorDependencies } from './processor';
export type ScanExecutionStore = Pick<ScanProcessorDependencies,
 'claimJob' | 'persist' | 'fail'> & {
 setStage: NonNullable<ScanProcessorDependencies['setStage']>;
 recordTerminal: NonNullable<ScanProcessorDependencies['recordTerminal']>;
};
```

The app constructs this store. The engine receives it explicitly and never imports application SQL, sharp or credentials. Keep collector/scoring/persistence input types unchanged.

- [ ] Add store contract tests with existing processor fixtures: one winning claim, bounded retries, persistence failure, original failure-state transitions and tracked terminal analytics lifetime.
- [ ] Replace `ScanExecutionRuntime.supabase` with `store:ScanExecutionStore`; wire its methods into `createScanProcessor`. Update `processScan` callers coherently rather than retaining optional silent Supabase fallback.
- [ ] Implement `lib/scan/execution-store.ts` with atomic claim SQL, typed status updates, result/finding persistence and event recording. Preserve unique finding keys and retry semantics. Never keep a transaction open during evidence collection.
- [ ] Port diff/AEO/analytics database dependencies, retaining existing best-effort behavior. Keep `persistEvidence(jobId,candidates)` explicit; only the app owns the sharp-dependent implementation.
- [ ] Run `corepack pnpm --filter @sme-scanner/scan-engine test` and `corepack pnpm test:integration -- test/integration/neon-execution.integration.test.ts`. Expected: package contracts and actual claim/persist/retry pass.
- [ ] Commit: `refactor: make scan execution storage independent`.

## Task 13: Fenced completion, recovery and runner compatibility

**Files:** Create `lib/workspace/completion-transaction.ts`, `test/integration/neon-completion.integration.test.ts`, `docs/integration/NEON-RUNNER-COMPATIBILITY.md`. Modify `lib/workspace/completion.ts`, `completion-client.ts`, `post-process.ts`, `lib/scan/dispatch-runtime.ts`, completion API handlers/forwarding fixtures from Task 1 and `neon/migrations/0004_atomic_operations.sql` before release.

**Consumes:** Task 4 transaction context and original `claim_workspace_completion`, `finish_workspace_completion`, `pending_workspace_completions` contracts. Preserve `CompletionResult` and current bounded batch size of five.

- [ ] Adapt all original fence triggers from `request.headers` to `app.completion_job`/`app.completion_token`. When fencing applies, missing/mismatched/stale context must reject protected writes. Preserve non-completion write behavior.
- [ ] For each protected write, acquire/validate the current ledger lease and token within the same transaction/connection that performs the write. Use transaction-local settings. Do not wrap external calls in a long transaction or move context to pool-global state.
- [ ] Exercise two real clients: A claims, A expires, B reclaims, A attempts every protected write and finish. Assert A cannot change snapshot/action/measurement/notification/audit effects or finalize B's lease; B completes once. Verify context is absent on the next pool borrower.
- [ ] Test duplicate completion, partial failure/retry and recovery using persisted evidence. Collectors must not run during recovery. Engine terminal status alone must not mark workspace completion successful.
- [ ] Record a compatibility matrix for `vercel`, `scheduled`, `cloudflare`: job DB identity, producer, consumer, scheduler and receiver. Vercel uses the Neon store. External modes need a compatible store or reviewed forwarding path; an unchanged Supabase worker is incompatible.
- [ ] If runner source lies outside this checkout, prepare a patch/contract artifact for review rather than edit the legacy repository. Hosted cutover in that mode remains blocked until separately authorized caller/receiver parity is demonstrated. Do not add a competing cron.
- [ ] Run `corepack pnpm exec vitest run lib/workspace/completion.test.ts lib/workspace/post-process.test.ts lib/scan/dispatch-runtime.test.ts` and `corepack pnpm test:integration -- test/integration/neon-completion.integration.test.ts`. Expected: stale-writer denial and durable retry pass on actual SQL.
- [ ] Independent review, then commit: `feat: preserve completion fencing with Neon transactions`.

## Task 14: Replace fixture and hosted acceptance infrastructure

**Files:** Modify `test/e2e/environment.ts`, `test/e2e/fixtures.ts`, `test/e2e/seed.ts`, `test/integration/global-setup.ts`, `fixtures.ts`, `schema.ts`, `workspace-layer.integration.test.ts`, `workspace-completion.integration.test.ts`, `playwright.acceptance.config.ts`, `e2e/acceptance/merchant-loop.spec.ts`, `permissions.spec.ts`, `claim-and-market.spec.ts`, `public-funnel.spec.ts`. Create `test/e2e/identity-provider.ts`, `test/e2e/identity-provider.test.ts`, `playwright.neon-auth.config.ts`, `e2e/neon-auth/session.spec.ts`.

**Produces:** Deterministic local fixture acceptance plus a separately configured opt-in hosted Auth suite. Local stubs are not hosted identity proof.

- [ ] Replace GoTrue/PostgREST with owned PostgreSQL, fixture identity, local mail capture and fixture LLM/evidence. Preserve loopback ports, labels, per-run ownership and scoped cleanup. A Docker bridge alone is not an egress guarantee.
- [ ] Use `IdentityProvider` injection in a test-only composition entrypoint. Require nonproduction test mode and loopback origin. Prove fixture identity cannot authenticate in production or on a nonlocal origin. No production header/cookie bypass.
- [ ] Seed app UUID identities and membership/market fixtures; never write managed Auth tables. Rename the current local `real magic link` scenario to distinguish local contract redemption from managed Neon delivery/redemption.
- [ ] Preserve all 16 current required acceptance cases and add identity/configuration regressions. Keep hydration/manual scan/report/unlock, HK/TW, draft/edit/approve/export, repeated usage and permission cases. Do not skip failures to match historical counts.
- [ ] Add hosted tests for managed magic-link delivery/redemption, expiry/replay, Google login, safe callbacks, logout and session invalidation. Require an isolated target and authorized recipients/accounts; refuse the production alias by default. A dedicated Google consent test is not replaced by constructing a redirect URL.
- [ ] Run `corepack pnpm e2e:acceptance`, `corepack pnpm e2e`, `corepack pnpm test:integration`. Expected: all required local cases execute without providers, owned resources cleaned. Hosted cases stay `not run` without external authorization.
- [ ] Commit: `test: replace Supabase acceptance infrastructure`.

## Task 15: Readiness, secret boundary and final Supabase removal

**Files:** Create `scripts/neon/readiness.ts`, `scripts/assert-no-supabase.mjs`, `tests/neon-readiness.test.ts`, `tests/no-supabase.test.ts`. Modify `.env.example`, root and engine package manifests/lockfile, `scripts/assert-secret-boundary.mjs`, `scripts/gen-types.ts`, `scripts/seed-demo.ts`, `scripts/launch-check.mjs`, `.github/workflows/ci.yml`, `docs/integration/DEPLOY.md`, `CLAUDE.md`. Remove obsolete `lib/supabase/`, `packages/scan-engine/src/supabase-client.ts` and obsolete Auth/JWT/WebSocket fixture helpers only when their consumers are gone.

**Produces:** `db:verify`, `neon:readiness`, `test:no-supabase`, `e2e:neon-auth` scripts bound to the new implementations. Historical SQL/doc references are explicitly allowed evidence, not active dependencies.

- [ ] Add configuration/readiness tests for required database/Auth values, origin consistency, missing schema and wrong target. A registered sensitive variable name is not evidence of a usable value.
- [ ] Readiness performs only connection/schema-journal/expected-object checks and produces sanitized status/category plus nonsecret target identity. Never query personal/business data or expose credential-bearing URLs.
- [ ] Add database URL and Auth cookie-secret sentinels to the client artifact scanner. Verify they never reach browser bundles. Public Auth endpoint configuration must not expose DB credentials.
- [ ] Exit scanner checks runtime source, package manifests and active scripts/tests for Supabase imports/types/endpoints/env names and PostgREST transport. Historical allowlist paths cannot include active runtime directories. Add a temp-source regression proving an active reference fails.
- [ ] Remove packages only after zero active consumers. Switch type generation to the new schema and demo seeding to explicitly owned local/test targets. Update CI migration and integration steps without deleting existing gates.
- [ ] Update package scripts:

```json
{
 "db:verify": "tsx scripts/neon/verify-migrations.ts",
 "neon:readiness": "tsx scripts/neon/readiness.ts",
 "test:no-supabase": "node scripts/assert-no-supabase.mjs",
 "e2e:neon-auth": "playwright test --config playwright.neon-auth.config.ts"
}
```

- [ ] Run `corepack pnpm test:no-supabase`, `corepack pnpm exec vitest run tests/neon-readiness.test.ts tests/no-supabase.test.ts tests/launch-check.test.ts` and `corepack pnpm test:secret-boundary`. Expected: zero active Supabase dependency, readiness rejects unavailable targets and no secret in public artifacts.
- [ ] Commit: `chore: remove Supabase runtime and add Neon readiness`.

## Task 16: Complete local gate and independent review

**Files:** Update `docs/integration/LAUNCH-REPORT.md`, `docs/integration/neon-dependency-map.json` and fixes in their originating task files.

- [ ] Run the final source in a clean owned fixture environment. Confirm Docker Linux engine, exact SHA, Node/pnpm and selected runtime. Migration tests must never use hosted URLs.
- [ ] Execute each command, record counts and exit codes, and keep secret-boundary sequential because it builds its own bundle:

```powershell
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm db:verify
corepack pnpm test:integration
corepack pnpm build
corepack pnpm e2e
corepack pnpm e2e:acceptance
corepack pnpm test:secret-boundary
corepack pnpm test:no-supabase
```

- [ ] Independent review examines identity mapping, SQL privileges, membership/invites, draft authority, stale-writer fencing, runtime ownership and production-unreachable fixtures. Test review checks behavior, not just adapter-shaped mocks.
- [ ] Resolve findings with reproducing tests; rerun affected checks and required final gates after changes. Record exact verified commit instead of claiming a whole branch passed from earlier runs.
- [ ] Record passed/failed/blocked/not-run statuses. Historical 2,161 unit/package, 18 integration, 16 acceptance and 27 public cases are reference evidence, not numbers to reproduce artificially. Hosted Auth and paid-provider acceptance remain separate.
- [ ] Commit: `docs: record Neon verification and independent review`.

## Task 17: Prepare staging, cutover and data-preserving recovery

**Files:** Create `docs/integration/NEON-CUTOVER.md`. Update `docs/integration/DEPLOY.md`, `docs/integration/LAUNCH-REPORT.md`, `.env.example`, `docs/integration/NEON-RUNNER-COMPATIBILITY.md`.

**Produces:** Exact release SHA, reviewed migration checksums, target/environment map, bounded acceptance procedure, execution ownership and rehearsed recovery record. Preparation is in scope; execution of cloud actions requires applicable explicit authorization.

- [ ] Prepare and verify this configuration map without publishing values:

| Setting | Source | Scope |
| --- | --- | --- |
| `DATABASE_URL` | Selected Neon branch pooled app-role connection | Runtime only |
| `DATABASE_URL_UNPOOLED` | Same branch direct migration role | Authorized migration process only |
| `NEON_AUTH_BASE_URL` | Selected branch Auth configuration | Server SDK proxy |
| `NEON_AUTH_COOKIE_SECRET` | New secure random secret, >=32 characters | Server only |
| `APP_ORIGIN` and site/callback values | Approved staging/final origin | Coherent cookies/redirects |
| Managed mail configuration | Selected supported sender/transport | Authorized login email |
| Google sign-in provider | Managed Auth registration | Identity callback |
| Existing Google business OAuth/claim variables | Approved business integration | Separate scopes/callbacks |
| Provider/billing/security variables | Existing approved account and target mode | Retained product integrations |

Actual project, region, branch, origin and test identities are release inputs, not guessed constants. Resolve and record them before an operator action is marked ready.

- [ ] After provisioning authorization, create/select an isolated empty Neon/Auth target, verify regional capabilities and apply exact reviewed migrations through the migration role. Confirm app-role restrictions and pooled/direct target equality. No production fixture seeds.
- [ ] After deployment authorization, deploy the exact release candidate to one stable staging origin. Run readiness before hosted Auth testing. Authorized mail recipients and Google test identity must match the isolated acceptance record.
- [ ] Verify selected runtime caller/receiver parity and single scheduler ownership. An unchanged Supabase runner blocks promotion for that mode. Do not silently introduce another cron or move the legacy domain.
- [ ] Prepare production schema/readiness, exact callbacks, payment mode/webhook routing, maintenance behavior and rollback target. Reconcile old external subscriptions explicitly before enabling billing on new empty app accounts.
- [ ] Rehearse recovery in isolation: before first write, record traffic rollback; after writes, use Neon-compatible prior build, forward fix or maintenance while preserving data. Demonstrate a new user/report survives the rehearsal. An old Supabase release cannot serve new Neon data.
- [ ] Present the exact production action, release SHA, target, bounded real-provider/mail checks and recovery procedure for applicable authorization. Plan approval alone does not authorize those actions.
- [ ] Only after promotion authorization, repeat readiness and the authorized hosted probes on the serving deployment. Record exact outcomes; no retries beyond approved bounds. Leave old Supabase resources and legacy staff/domain untouched.
- [ ] Commit the prepared runbook: `docs: prepare Neon cutover and recovery`; operational evidence is a later separate commit.

## Specification coverage and review

| Approved requirement | Task coverage |
| --- | --- |
| Empty target, preserve source | 1, 3, 17 |
| Drizzle/server-only data layer, app/migration role separation | 2-4 |
| Managed Auth, email links, Google login, identity mapping | 5-6, 14, 17 |
| Invitations, merchant claims, verified membership | 7 |
| Scan/report/manual/market parity | 8-9, 12, 14 |
| Evidence and draft authority, facts-needed | 9-10, 16 |
| Billing, events, notifications and erasure | 11 |
| Fencing/recovery/retained-runner compatibility | 4, 12-13, 17 |
| Fail-closed config and secret safety | 2, 6, 8, 15 |
| Fixtures versus hosted proof, independent review | 14-16 |
| Deployment/runbook/no-Supabase exit, rollback after writes | 15-17 |

No application code, dependency installation, database mutation, provider request, real email or deployment was performed while writing this plan. SQL is translated from the checked-in final schema with catalog/behavior parity, not replaced by a guessed minimal schema. Version-sensitive Auth integration is compiled against pinned SDK exports; local stubs do not prove managed capabilities.

Execution begins only after the user selects execution. Recommended: one fresh subagent per task with review before integration. Alternative: inline execution with the same task/checkpoint order. Both retain the separate external-operation gates.

## References verified during planning

- Approved specification: `docs/superpowers/specs/2026-09-06-neon-migration-design.md`
- Neon Next.js Auth: https://neon.com/docs/auth/quick-start/nextjs (retrieved as Markdown; guide currently labels managed integration Beta)
- Managed Auth configuration: https://github.com/neondatabase/website/blob/main/content/docs/auth/guides/manage-auth-api.md
- Connections: https://neon.com/docs/connect/choose-connection
- Drizzle: https://neon.com/docs/guides/drizzle
