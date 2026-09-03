# SME Scanner Visibility Workspace

Evidence-first visibility workspace for Hong Kong and Taiwan SMEs. A merchant runs a free public
scan (Instagram, Google Business Profile, AI answers, trust signals), reads the report, claims the
business, and then works through prioritised actions in an owner workspace: drafts are prepared,
the owner approves them, and a re-scan proves the change. Trilingual UI (zh-HK, en, zh-TW).

## Architecture

- Next.js 16 App Router, React 19 and Tailwind v4 at the repo root render the product UI
  (`app/`, `components/`, `lib/`). The visual design and copy come from the prototype.
- The backend is vendored from the `sme-scanner` upstream (pinned SHA) as pnpm workspace
  packages: `packages/scoring`, `packages/region`, `packages/scan-engine` and
  `packages/contracts`. The app shares the upstream Supabase project; `supabase/migrations`
  holds the applied corpus and `supabase/verify-migrations.sh` dry-runs it.
- Hosting is Vercel (Hobby plan, so `vercel.json` stays free of crons); owners sign in with
  Supabase Auth magic links. The source-of-truth map, decisions, environment contract and the
  phased playbook live in `CLAUDE.md` — read it before changing anything.

## Setup

Requires Node 22.13+ (`.nvmrc`) and pnpm 9 via corepack (`packageManager` pin).

```bash
corepack pnpm install
cp .env.example .env.local      # fill in Supabase keys and provider keys as needed
corepack pnpm dev               # http://localhost:3000/zh-HK
```

## Checks

```bash
corepack pnpm typecheck         # tsc --noEmit, then every workspace package
corepack pnpm lint
corepack pnpm test              # vitest (root), then every workspace package
corepack pnpm build
corepack pnpm db:verify         # applies the migration corpus to a scratch Postgres (Docker on Windows)
corepack pnpm e2e               # Playwright, against `next start`
```

## Phase reports

Each playbook phase ends with a report in `docs/integration/PHASE-<n>-REPORT.md`
(`PHASE-0-REPORT.md` holds the discovery answers and the base-revision decision).
