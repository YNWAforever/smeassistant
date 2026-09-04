# Launch readiness — design

**Date:** 2026-09-04 · **Status:** approved in conversation, pending file review · **Follows:** the seven-phase integration playbook (`CLAUDE.md`)

## Goal

Put this app in front of real merchants in Hong Kong and Taiwan on the existing hostname, replacing the legacy `sme-scanner`
merchant surface. The staff console and the Cloudflare scheduler stay on the legacy deployment.

**Done means all four hold:**

1. `smescanner.fimmick.com` serves this app; `/zh-HK`, `/en` and `/zh-TW` render from it.
2. The live smoke test on real providers has passed, in both markets, on the same build that is serving.
3. CI is green on `main`.
4. Merchants can no longer reach the legacy funnel on the public hostname; staff reach the legacy app on `sme-scanner-one.vercel.app`.

## Decisions taken for this phase

| Topic | Decision |
|---|---|
| Launch shape | Full launch, HK and TW, one deployment serving all three locales (Taiwan is `/zh-TW` on the same host, as today). |
| Domain | Take over `smescanner.fimmick.com` from the legacy Vercel project; no DNS change (the record already points at Vercel). |
| Remit | Claude executes everything the Vercel connector allows (project settings, non-secret env, deploys, domain move) and verifies each external step; Willy performs Supabase, Google Cloud and Stripe registrations and pastes secret values. |
| Product assumptions | Locked as built: lite allowance 3 deliveries, paid unlimited, paid-only rescan 3/day, growth → paid, multi-location and managed as "contact Fimmick", 12/24-month retention wording. Revisit after launch. |
| Accessibility | Fix both Lighthouse findings minimally (see Code changes). |
| Vercel team | Stay on the Hobby team where both projects and the domain already live; the 300 s function cap covers `POST /api/scan/process`. |
| Node | Pin the Vercel project to 22 to match `.nvmrc` (the project currently says 24). |

## Facts observed (Vercel connector, 2026-09-04)

- Legacy project `sme-scanner` (`prj_zKzNcbLTwlSXbhYTMe59spRQh1BC`): domains `smescanner.fimmick.com`, `sme-scanner-one.vercel.app` and the project defaults. No separate Taiwan hostname.
- This app's project `smeassistant` (`prj_Hbox4o4NhM3p0yxRxmY8Xq1mjtb5`): linked to `YNWAforever/smeassistant`, latest deployment READY from `main`, only `vercel.app` hostnames, no custom domain.
- Both on team `ynwaforevers-projects` (Hobby). The Fimmick Pro team has no projects.

## Code changes

All small, all in this repo, all gated by the usual checks.

1. **Accessibility.** The public header call-to-action keeps the lime button but pins dark text (#172019) with a selector specific enough to beat the utility class, measured in the browser (white-on-lime 1.26 → dark-on-lime passes 4.5). The brand link's `aria-label` becomes "SME Scanner by Fimmick · 主頁" / "SME Scanner by Fimmick · home" so it contains the visible text, and a space is inserted between the name and its caption so the DOM text matches. No other styling changes.
2. **Production guard.** `resolveScanSourceMode` refuses `SCAN_SOURCES=fixture` when `VERCEL_ENV=production` (logs and falls back to `live`), so a copied preview setting cannot ship fixture scans to merchants. Unit-tested.
3. **Legacy path redirects** in `proxy.ts` (308): the legacy app's unprefixed default-locale paths already redirect; add `/owner` (no slug) → `/{locale}/owner/select-workspace`, `/privacy` → `/{locale}/legal/privacy`, `/terms` → `/{locale}/legal/terms`, `/scanner` → `/{locale}/scan`. Pure rule in `lib/funnel/locale-redirect.ts`, unit-tested; nothing else in the proxy changes.
4. **Launch readiness check** `scripts/launch-check.mjs` (`corepack pnpm launch:check --origin https://…`). Read-only probes, one line of pass/fail each: locale pages and `hreflang`; `robots.txt` and `sitemap.xml` on the given origin; magic-link route reachable; `GET /api/oauth/google/claim/start?slug=x` → 404 when the flag is off, 302 to `accounts.google.com` when on; `POST /api/webhooks/stripe` unsigned → 400; `/api/scan/start` with a fixture-only body → 400 in production (guard). The migration check is a read-only SQL statement Willy runs in the Supabase SQL editor (the service-role key stays in Vercel), see the plan. Exit code 1 on any failure. Unit tests cover the response parsers with mocked fetch.
5. **Docs.** `DEPLOY.md` gains the exact values used (team, project ids, hostnames) and the cut-over runbook below; `.env.example` unchanged.

## Deployment (Claude, via the Vercel connector)

1. Project settings on `smeassistant`: framework Next.js, root `/`, Node 22, install `pnpm install --frozen-lockfile`, build `pnpm build`, production branch `main`, no cron, deployment protection off for production only.
2. Environment, two scopes.
   - Preview: `SCAN_SOURCES=fixture`, the three Supabase variables, `RATE_LIMIT_SECRET`, `NEXT_PUBLIC_SITE_URL` and `APP_ORIGIN` = the preview URL. No provider, LLM or payment keys.
   - Production: every key in `.env.example` that has a value in the legacy project's production environment, `SCAN_SOURCES=live`, `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=true`, both origin variables = `https://smescanner.fimmick.com`. Claude sets non-secret values and verifies the variable names against `.env.example`; Willy pastes secrets in the Vercel UI. Secrets never appear in chat or files.
3. Production deploy from `main` to `smeassistant.vercel.app`; `launch:check` against it. Because the origin variables already name the final hostname, callback and mailed-link probes are expected to fail until the registrations below and the domain move; the script labels those as "pending registration".

## External registrations (Willy), each verified by Claude before the next

| # | Where | What | Verification |
|---|---|---|---|
| 1 | Supabase Auth → URL configuration | Add `https://smescanner.fimmick.com/auth/callback` and `https://smeassistant.vercel.app/auth/callback` | Request a magic link for a test lead on the `vercel.app` origin; the mailed link lands on `/auth/callback` and signs in. |
| 2 | Google Cloud → OAuth client | Redirect URIs `/api/oauth/google/callback` and `/api/oauth/google/claim/callback` on both origins; JavaScript origins both origins | `launch:check` claim-start probe returns a 302 to Google. |
| 3 | Stripe → Webhooks | Endpoint `/api/webhooks/stripe` on both origins; signing secret into production env | Stripe dashboard "send test event" → route answers 200; unsigned probe → 400. |
| 4 | Supabase → SQL editor | Apply `20260903000000_workspace_layer.sql` then `20260903000001_workspace_rpcs.sql` on a non-production project, then production | Read-only SQL in the editor lists the two RPC functions. |

## Live smoke test (Claude drives, on `smeassistant.vercel.app` with production env)

One pass per market: manual-entry scan → scanning → report → unlock with a test contact → magic-link sign-in → Google verification →
onboarding → workspace home → generate one draft → approve → export. Each step recorded in the phase report with job and workspace
ids only. Any failure stops the phase before the domain moves.

## Cut-over and rollback

1. Move `smescanner.fimmick.com` from `sme-scanner` to `smeassistant` (one connector action). DNS is untouched.
2. `launch:check --origin https://smescanner.fimmick.com` must pass every probe.
3. The legacy project keeps `sme-scanner-one.vercel.app`; staff use that hostname. Its production env is not changed.
4. Rollback: move the domain back. Both apps share the database, so no data step is needed in either direction.

## Testing

- Unit: production guard; legacy redirect rules; `launch-check` parsers (mocked responses).
- Gate before each commit: typecheck, lint, test, build, Playwright on fixtures, secret boundary; Lighthouse re-run on landing, sample report and demo workspace after the accessibility edits (≥ 90 with the two findings gone).
- Live: `launch:check` green on the production origin after the move; the smoke-test log in the phase report.

## Out of scope

Product-decision changes, Taiwan-specific hostnames, moving the staff console or scheduler, any new merchant feature, Pro-team migration.
