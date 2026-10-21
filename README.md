# Kinnso OS

Kinnso OS, by Fimmick, helps Hong Kong and Taiwan small businesses see how they appear on Google, Instagram and AI search. Then it prepares the work to improve it.

- **Scan:** a free scan collects public evidence and scores it. Missing evidence lowers coverage, never the score.
- **Act:** the owner workspace turns findings into prioritised actions and drafts.
- **Approve:** nothing is published or counted until the owner approves one exact version and exports it.
- **Prove:** a later comparable scan shows what changed.

The product rules (guardrails, contracts and decisions) are in [CLAUDE.md](CLAUDE.md). The redesign that made the current interface is documented in [docs/ux](docs/ux/README.md).

The merchant application uses Next.js 16, typed Neon PostgreSQL repositories and the pinned Neon managed Auth SDK. The legacy staff application remains separate. Hosted Neon branch, Auth configuration and staging origin are **NOT CHOSEN**; hosted acceptance and deployment are **NOT RUN**.

## Set up

Use Node from `.nvmrc`, pnpm from `packageManager`, and `corepack pnpm install --frozen-lockfile`. Copy `.env.example` only for a deliberately selected environment. Local tests create their own labeled disposable PostgreSQL containers and never use ambient database URLs. Docker must already have `postgres:16`; local fixture commands use `--pull=never`.

On Windows, the repository `.npmrc` keeps pnpm's store folder names to 60 characters (`virtual-store-dir-max-length=60`). With Windows long paths off, Turbopack cannot read dependency files past about 275 characters, and the default 120-character names made `corepack pnpm build` fail with `Can't resolve '@radix-ui/…'` from deep worktree paths. A checkout installed before this setting needs one `corepack pnpm install` (accept the store purge) to re-lay `node_modules`.

## Commands

| Command | Purpose |
|---|---|
| `corepack pnpm dev` | Local application development |
| `corepack pnpm build` | Production build |
| `corepack pnpm typecheck` | App and package type contracts |
| `corepack pnpm lint` | ESLint |
| `corepack pnpm test` | Offline unit and package tests |
| `corepack pnpm test:no-supabase` | Active-source retired transport exit gate |
| `corepack pnpm test:no-self-service-claim` | Ownership is never self-declared |
| `corepack pnpm test:secret-boundary` | Builds and scans its own sentinel public artifacts |
| `corepack pnpm test:js-budget` | First-load JavaScript per route, read from the last production build |
| `corepack pnpm db:verify` | Owned local migration journal, replay and catalog verification |
| `corepack pnpm db:types` | Generates row/insert mappings from authored typed schema, offline |
| `corepack pnpm seed:demo --owned-test` | Seeds and verifies a disposable owned demo, then destroys it |
| `corepack pnpm neon:readiness` | Read-only configuration, target, journal and schema metadata checks |
| `corepack pnpm launch:check` | Public endpoints, metadata and boundaries of a running origin |
| `corepack pnpm test:integration` | Actual owned PostgreSQL repository tests |
| `corepack pnpm e2e` | Public browser cases on owned fixtures |
| `corepack pnpm e2e:acceptance` | Required local merchant cases |
| `corepack pnpm e2e:neon-auth` | Explicit opt-in hosted Auth cases; target not yet chosen |

Run heavy gates sequentially with `VITEST_MAX_WORKERS=1`. The demo seed command accepts only `--owned-test`; it neither persists a shared demo nor seeds managed Auth users. It reports nonsecret counts after executing real SQL.

## Where things are

| Path | Contents |
|---|---|
| `app/` | Routes (App Router). Every route is locale-prefixed: `en`, `zh-HK`, `zh-TW`. `proxy.ts` handles locale redirects, sessions and old-URL redirects. |
| `app/styles/` | Design tokens and stylesheets, in cascade layers. `shared.css` holds classes the public site and workspace share, `public/` the public pages' styles and `screens/` the workspace screens' styles; `legacy/` keeps base element rules and pre-redesign CSS no page uses any more. |
| `components/` | `kinnso/` (component kit), `visual/` (visuals and motion), `states/` (error, loading, empty, role notices), `workspace/` (owner screens), `ui/` (shadcn primitives). |
| `lib/` | Data access through the repositories in `lib/repositories` and `lib/db`, workspace logic in `lib/workspace`, and all user-facing text in `lib/copy.ts` and `lib/copy-*.ts`. |
| `packages/` | Vendored scoring, region, scan-engine and contracts packages. They are changed only by re-pinning; see each `VENDOR.md`. |
| `neon/` | Neon migrations. |
| `e2e/`, `test/`, `tests/` | Browser specs, fixture tooling and root tests. `test/visual/` is a manual pixel-comparison tool for style changes. |
| `docs/` | Reports and runbooks: `ux/` (redesign), `integration/` (deployment and integration), `implementation/`, `audits/`, `operations/`, and `archive/`. |

## Database

`neon/migrations/0001` through `0004` are immutable. The older SQL corpus and catalog snapshots are historical compatibility evidence, not deployment instructions. See [deployment preparation](docs/integration/DEPLOY.md) and [Neon schema](neon/README.md). This branch's deployment block remains in place.
