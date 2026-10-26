# Run, test and prepare a deployment

Run commands from the repository root. Runtime boundaries and the risk map are
in [ARCHITECTURE.md](../ARCHITECTURE.md). The scripts in
[package.json](../package.json) and [.github/workflows/ci.yml](../.github/workflows/ci.yml)
are the executable source of truth for verification.

## Install and run

Use Node 24 (`.nvmrc`) and Corepack's pinned pnpm 9.12.0. With nvm installed:

```sh
nvm use
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Open `http://localhost:3000` (default locale zh-HK), `/en` or `/zh-TW`.
Public/demo UI can be developed without a hosted database. Authenticated merchant
flows need an explicitly selected environment or the owned acceptance harness
below. Setting `SCAN_SOURCES=fixture` substitutes evidence collection; it does
not create a database, session or workspace.

For a selected development environment, copy `.env.example` to ignored
`.env.local` and supply only its required configuration. Do not do this for the
owned browser harness: it refuses `.env`, `.env.local`, `.env.development` and
`.env.development.local` so Next cannot load shared credentials.

| Configuration | Source and use |
|---|---|
| `DATABASE_URL` | Selected branch's pooled URL for a restricted app login; server queries only. Production requires secure `sslmode`. |
| `DATABASE_URL_UNPOOLED` | Same branch's direct operator URL; migration/readiness process only, never the web runtime. |
| `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` | Selected managed Auth endpoint and a distinct cookie secret (at least 32 characters). Do not seed managed Auth tables. |
| `APP_ORIGIN`, `NEXT_PUBLIC_SITE_URL` | Explicit app/canonical origins. `APP_ORIGIN` supplies callback, mail and billing links; hosted origins must be HTTPS. |
| `RATE_LIMIT_SECRET`, `REPORT_ACCESS_TOKEN_SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY` | Server-only independent secrets; see `.env.example` for formats. Missing limiter configuration fails closed. |
| Provider keys and feature gates | Optional capabilities, not prerequisites for unit tests. Read `.env.example` and the feature-specific deployment runbook before enabling them. |

`NEXT_PUBLIC_*` is public build-time configuration. Keep credentials out of it.
Blank budget overrides are invalid; leave optional budget settings absent to use
defaults. The template comments explain this distinction.

## Fast offline checks

POSIX shell examples (in PowerShell, set `$env:VITEST_MAX_WORKERS='1'` instead):

```sh
export VITEST_MAX_WORKERS=1
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
```

`test` runs app/component/helper tests, then the timing-sensitive safe-media suite
separately, then each workspace package's tests. No hosted accounts, paid provider
keys or database URLs are needed. For the version mutation boundary tests only:

```sh
corepack pnpm exec vitest run 'app/api/versions/[versionId]/versions.test.ts'
```

Single-quote paths with `[param]` segments so the shell does not expand them.
These route tests use fakes; they cannot establish SQL isolation or hosted Auth
behavior. Do not replace SQL/browser gates with a passing focused unit command.

## Owned PostgreSQL and browser checks

Docker must be running. Prepare PostgreSQL 16 once; the harness uses
`--pull=never` and fails if the image is missing:

```sh
docker pull postgres:16
corepack pnpm db:verify
corepack pnpm test:integration
corepack pnpm exec playwright install --with-deps chromium
corepack pnpm e2e
corepack pnpm e2e:acceptance
```

Run heavy gates sequentially with one Vitest worker. `db:verify` creates a new
labeled, network-isolated PostgreSQL fixture, applies the ordered migrations,
checks the catalog and verifies replay. Integration tests use the same ownership
model; they do not migrate an ambient `DATABASE_URL`. Missing Docker fails the
gate instead of skipping it. `NEON_INTEGRATION=1` is also set in CI; the current
integration config selects all SQL cases without requiring that variable.

Browser harnesses own their database, local identity/mail capture, model server
and Next dev process; they block external transport and clean up their own
resources. Public e2e requires free port 3100; acceptance allocates fixture
ports. Stop any unrelated process occupying a required port yourself. Do not
point these tests at a shared app or seed real accounts.

For a single SQL scenario:

```sh
corepack pnpm test:integration -- test/integration/neon-artifact-runtime.integration.test.ts
```

Other useful offline/owned commands:

```sh
corepack pnpm db:types
corepack pnpm seed:demo --owned-test
```

`db:types` regenerates `lib/db/database.types.ts` from the authored
`lib/db/schema/`, without introspection. Review its diff. `seed:demo --owned-test`
creates, seeds, verifies and destroys its own fixture; it does not leave a
persistent login/demo workspace. See [test/e2e/README.md](../test/e2e/README.md)
for the separately authorized hosted managed Auth suite.

## Build and release checks

```sh
corepack pnpm test:secret-boundary
corepack pnpm test:no-supabase
corepack pnpm test:no-self-service-claim
corepack pnpm build
corepack pnpm test:js-budget
```

The secret-boundary check builds its own synthetic-sentinel artifacts; do not
substitute an existing build. JS budgets read the last production `.next` build,
so run them after `build` (workspace routes 300 KB, other routes 240 KB gzipped).
`corepack pnpm start` serves that build locally; it does not supply missing
runtime configuration. The complete CI order also includes every SQL/browser
gate above. Keep those checks enabled.

Common setup failures:

| Symptom | Action |
|---|---|
| Corepack cannot write its cache in a sandbox | Set `COREPACK_HOME` to a writable scratch/cache directory for the command. Keep the pnpm pin. |
| Fixture reports Docker unavailable or missing image | Start the daemon, confirm access with `docker info`, and prepare `postgres:16`. Do not substitute a hosted URL. |
| Browser executable missing | Run the pinned Playwright install command above. |
| Playwright cannot install Linux system dependencies as a non-root user | Have an administrator install the OS dependencies once. If those libraries are already present, `corepack pnpm exec playwright install chromium` downloads the browser alone. |
| Fixture refuses a dotenv file | Use a clean checkout for acceptance, or safely move your private local env files out of Next's search paths before running it. |
| Windows deep-path dependency resolution fails | Follow the `.npmrc` store-length note in the root README and reinstall with the pinned package manager. |

## Deployment handoff

Deployment is a separate operation from this local workflow. Follow
[DEPLOY.md](integration/DEPLOY.md) and its authoritative
[NEON-CUTOVER.md](integration/NEON-CUTOVER.md) worksheet; those records still mark
the migration target as NOT CHOSEN and hosted acceptance as NOT RUN. Later
feature sections include owner-reported hosted actions; verify their actual
target/journal before using them as release evidence.

1. Record the exact candidate commit, Vercel project/build, region, Neon
   branch/database, Auth endpoint, stable origins and responsible operators.
   Prepare restricted runtime credentials separately from migration credentials.
2. Pass local CI gates, then rehearse the ordered migrations and recovery on the
   explicitly approved isolated target. Applied migrations are immutable; use
   the checked-in migration runner/rollout procedure, not a schema push.
3. Configure server variables and registered callbacks for that exact target.
   Run `corepack pnpm neon:readiness` in the separate read-only operator process
   with both URLs and explicit expected host/database. READY proves configuration
   and schema metadata, not mail delivery, login or provider correctness.
4. Deploy the reviewed candidate through the approved Vercel process, preserving
   branch deployment guards. No cron is currently registered in `vercel.json`.
   Hosted Auth, OAuth, mail, Stripe, publishing and runner tests require their
   existing explicit accounts, feature gates and bounded acceptance procedure.
5. Record results in [LAUNCH-REPORT.md](integration/LAUNCH-REPORT.md), including
   failed attempts and actual serving version. Promote only after the release
   procedure's approvals and acceptance pass. After new writes, recover using
   a verified Neon-compatible build on the same database or a forward fix;
   never serve Neon data with an old backend-only release or erase new writes.

This guide does not select a hosted target or replace the feature-specific
migration, rollback, payment or mail activation instructions.
