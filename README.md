# SME Scanner Visibility Workspace

Evidence-first visibility workspace for Hong Kong and Taiwan SMEs. A merchant runs a free public scan
(Instagram, Google Business Profile, search and AI answers, trust signals), reads the report, claims the
business with Google, and then works through prioritised actions in an owner workspace: drafts are
prepared by guardrailed agents, the owner approves an exact version, exports it, and a rescan proves the
change. Trilingual UI (zh-HK, en, zh-TW).

This repo is the production successor of the `sme-scanner` app for the merchant-facing product. It vendors
that app's scan engine and scorer verbatim and shares its Supabase project; the legacy app keeps the staff
console and the scheduler until cut-over. Design notes live in `docs/integration/ARCHITECTURE.md`; the
phase-by-phase record is in `docs/integration/PHASE-*-REPORT.md`; the integration playbook is `CLAUDE.md`.

## Prerequisites

- Node 22 (`.nvmrc`) and pnpm 9.12.0 through corepack: `corepack enable` once, then `corepack pnpm …`.
- Docker Desktop for the migration dry run, the integration suite, type generation and the demo seed.
- A Supabase project that already carries the 28 upstream migrations (the shared one, or a copy for staging).

## Setup

```bash
corepack pnpm install
cp .env.example .env.local   # fill in at least the Supabase keys and RATE_LIMIT_SECRET
corepack pnpm dev
```

Without provider keys set `SCAN_SOURCES=fixture`: scans run on the deterministic fixtures in
`scripts/fixtures/`, which is also how CI and Playwright run.

## Commands

| Command | What it does |
|---|---|
| `corepack pnpm dev` / `build` / `start` | Next.js dev server, production build, production server |
| `corepack pnpm lint` / `typecheck` | ESLint; `tsc --noEmit` for the app and the four packages |
| `corepack pnpm test` | Vitest unit suite for the app and the packages |
| `corepack pnpm test:integration` | Docker Postgres + PostgREST suite (migrations, invite bind, claim, version RPCs) |
| `corepack pnpm e2e` | Playwright on port 3100; DB-backed journeys skip without `NEXT_PUBLIC_SUPABASE_URL` |
| `corepack pnpm test:secret-boundary` | Builds with sentinel secrets and scans every public artifact for leaks |
| `corepack pnpm db:verify` | Applies the migration corpus to an empty Postgres 16 and checks the delete graph |
| `corepack pnpm db:types` | Generates `lib/supabase/database.types.ts` from the corpus (needs Docker and the Supabase CLI) |
| `corepack pnpm seed:demo` | Seeds the `kam-man-house` demo workspace into a **localhost** database only (`SEED_DEMO_ALLOW=true`) |

Before every commit: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test && corepack pnpm build`.
CI (`.github/workflows/ci.yml`) runs the same gates plus the secret boundary, migration verification, the
integration suite and the e2e specs on fixtures.

## Environment

`.env.example` documents every variable with its purpose. The groups that matter for a first deployment:

| Group | Variables | Notes |
|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Same project as the legacy app. The anon key is used for Auth only. |
| Origin | `NEXT_PUBLIC_SITE_URL`, `APP_ORIGIN` | Absolute `https` origin, no trailing slash: canonical URLs, OG cards, mailed links, Stripe return URLs, auth callbacks. |
| Security | `RATE_LIMIT_SECRET`, `REPORT_ACCESS_TOKEN_SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY` | Fail closed: rate-limited routes answer 503 without the first. |
| Evidence providers | `GOOGLE_PLACES_KEY`, `SERPAPI_API_KEY`, `RAPIDAPI_INSTAGRAM_KEY` | Missing keys make a module `unavailable`, never `failed`. `SCAN_SOURCES=fixture` bypasses them. |
| LLM | `OPENCODE_API_KEY` or `LLM_API_KEY` or `OPENROUTER_KEY`, `LLM_MODEL` | Without a key, drafts degrade to template answers with a warning. |
| Ownership | `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_OAUTH_CLAIM_REDIRECT_URI`, `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` | The claim routes stay closed until the flag is exactly `true`. Never set `OWNER_SELF_SERVICE_CLAIM`. |
| Billing | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_HK_TIER_PRICE_ID`, `STRIPE_TW_TIER_PRICE_ID` | Tier changes arrive only through the webhook or a staff grant. |
| Email | `RESEND_API_KEY`, `REPORT_EMAIL_FROM` | Report delivery and the legacy digest. |

## Database and migrations

`supabase/migrations/` holds the 28 upstream migrations verbatim plus this repo's two additive ones,
`20260903000000_workspace_layer.sql` and `20260903000001_workspace_rpcs.sql`. Rules for any new migration
are in `CLAUDE.md` §1.3.7 and are enforced by the tests in `lib/security/`.

Procedure:

1. `corepack pnpm db:verify` (Docker on Windows: `docker run --rm -v "$PWD/supabase:/work/supabase" postgres:16 bash /work/supabase/verify-migrations.sh`).
2. `corepack pnpm test:integration`.
3. Apply the new files by pasting them into the Supabase SQL editor in filename order, on a non-production project first, then on the shared project. Never `supabase db push`.
4. Confirm with a read-only query that every table in the migration exists and that RLS is enabled with zero policies.

## Cut-over from sme-scanner

Both apps share the database, Supabase Auth and Storage, so cut-over is a routing change, not a data migration.

1. **Supabase Auth → URL configuration**: add `<APP_ORIGIN>/auth/callback` to the redirect allowlist (magic links) and keep the
   legacy callback until the staff console moves.
2. **Google Cloud OAuth client**: register `<APP_ORIGIN>/api/oauth/google/callback` and `<APP_ORIGIN>/api/oauth/google/claim/callback`
   byte-exact; put the same strings in `GOOGLE_OAUTH_REDIRECT_URI` and `GOOGLE_OAUTH_CLAIM_REDIRECT_URI`.
3. **Stripe**: add a webhook endpoint `<APP_ORIGIN>/api/webhooks/stripe` for `checkout.session.completed` and the subscription
   lifecycle events; set `STRIPE_WEBHOOK_SECRET` from it. Both apps may receive events during the overlap; the handler is idempotent.
4. **Scheduling**: leave the legacy Cloudflare scheduler running. It dispatches `scan_schedules` and executes queued jobs with the same
   engine and lease; this app has no cron routes.
5. **DNS**: point the merchant domain at this Vercel project; keep the legacy app on its own hostname for staff.
6. **Flags**: enable `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=true` only after step 2 is verified on a preview deployment.

`docs/integration/DEPLOY.md` lists the Vercel project settings and the exact environment variables to prepare.

## Demo surfaces

`/sample-report` and `/demo-workspace` render fixed, sanitised Kam Man House data and are the only pages that show the
demo bar. A seeded `is_demo` workspace (`corepack pnpm seed:demo` against a localhost database) exercises the real workspace
code path for QA.

## Photo credits

The three landing photographs are Pexels images used under the Pexels licence until owned images are supplied in `public/brand/`.
