# SME Scanner Visibility Workspace

The merchant application uses Next.js 16, typed Neon PostgreSQL repositories and the pinned Neon managed Auth SDK. The legacy staff application remains separate. Hosted Neon branch, Auth configuration and staging origin are **NOT CHOSEN**; hosted acceptance and deployment are **NOT RUN**.

Use Node from `.nvmrc`, pnpm from `packageManager`, and `corepack pnpm install --frozen-lockfile`. Copy `.env.example` only for a deliberately selected environment. Local tests create their own labeled disposable PostgreSQL containers and never use ambient database URLs. Docker must already have `postgres:16`; local fixture commands use `--pull=never`.

| Command | Purpose |
|---|---|
| `corepack pnpm dev` | Local application development |
| `corepack pnpm typecheck` | App and package type contracts |
| `corepack pnpm test` | Offline unit and package tests |
| `corepack pnpm test:no-supabase` | Active-source retired transport exit gate |
| `corepack pnpm test:secret-boundary` | Builds and scans its own sentinel public artifacts |
| `corepack pnpm db:verify` | Owned local migration journal, replay and catalog verification |
| `corepack pnpm db:types` | Generates row/insert mappings from authored typed schema, offline |
| `corepack pnpm seed:demo --owned-test` | Seeds and verifies a disposable owned demo, then destroys it |
| `corepack pnpm neon:readiness` | Read-only configuration, target, journal and schema metadata checks |
| `corepack pnpm test:integration` | Actual owned PostgreSQL repository tests |
| `corepack pnpm e2e` | Public browser cases on owned fixtures |
| `corepack pnpm e2e:acceptance` | Required local merchant cases |
| `corepack pnpm e2e:neon-auth` | Explicit opt-in hosted Auth cases; target not yet chosen |

Run heavy gates sequentially with `VITEST_MAX_WORKERS=1`. The demo seed command accepts only `--owned-test`; it neither persists a shared demo nor seeds managed Auth users. It reports nonsecret counts after executing real SQL.

`neon/migrations/0001` through `0004` are immutable. The older SQL corpus and catalog snapshots are historical compatibility evidence, not deployment instructions. See [deployment preparation](docs/integration/DEPLOY.md) and [Neon schema](neon/README.md). This branch's deployment block remains in place.
