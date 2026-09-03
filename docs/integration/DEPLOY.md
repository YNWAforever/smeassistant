# Deploy preparation — Vercel

Prepared, not executed. Everything below is a checklist for the first preview and production deployments.

## Vercel project

| Setting | Value |
|---|---|
| Framework | Next.js (detected) |
| Root directory | `/` |
| Node.js version | 22.x (`.nvmrc`) |
| Package manager | pnpm 9.12.0 (from `packageManager`; corepack) |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Functions | `POST /api/scan/process` declares `maxDuration = 300`; the run and assistant routes declare 60. Hobby caps at 300 s. |
| Cron | none (the legacy Cloudflare scheduler owns dispatch and reaping) |

## Environment variables (Production and Preview)

Copy the keys from `.env.example`. Preview deployments should set `SCAN_SOURCES=fixture` and leave the provider keys blank
unless a live smoke test is intended. `NEXT_PUBLIC_SITE_URL` and `APP_ORIGIN` must equal the deployment's public origin
(`https://…`, no path, no trailing slash).

Secrets that must never be `NEXT_PUBLIC_`: `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_SECRET`, `REPORT_ACCESS_TOKEN_SECRET`,
`OAUTH_TOKEN_ENCRYPTION_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, every
LLM key, `SERPAPI_*`, `RAPIDAPI_INSTAGRAM_KEY`. `test:secret-boundary` proves none of them reach a public artifact.

## External registrations

1. Supabase Auth redirect allowlist: `<origin>/auth/callback` for every origin (production and each preview you will test).
2. Google Cloud OAuth client: authorised redirect URIs `<origin>/api/oauth/google/callback` and `<origin>/api/oauth/google/claim/callback`;
   authorised JavaScript origin `<origin>`.
3. Stripe webhook: `<origin>/api/webhooks/stripe`; copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

## First deployment smoke test (Willy)

1. `/zh-HK` renders; `/en` and `/zh-TW` render; `<link rel="alternate" hreflang>` present; `/robots.txt` disallows `/*/r/`, `/*/owner/`.
2. Fixture scan: `/zh-HK/scan` → manual entry → scanning → report; unlock with a test contact; sign in by magic link.
3. With `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=true` on a preview only: verify with Google, complete onboarding, open the workspace.
4. Home shows the snapshot; Actions lists derived actions; generate a draft (LLM key set) or see the graceful template answer.
5. Approve and export a version; usage increments once; export again does not.
6. Rescan (paid tier or a staff-granted tier event) and confirm the Insights page marks comparability honestly.
