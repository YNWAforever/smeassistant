# Phase 1 report — public funnel on the upstream backend

**Date:** 2026-09-03 · **Branch:** `feat/visibility-workspace-integration` · **Base:** sme-scanner `origin/main` `b9b4151f`
**Status:** complete. The prototype's catch-all dispatcher is replaced by real App Router segments, and the public funnel
(scan → scanning → report → unlock) runs on upstream's contracts against the shared Supabase project.

---

## 1. What now exists

### 1.1 Server layer (ported from upstream, imports rewritten to this repo's conventions)

| Area | Modules |
|---|---|
| Merchant + Instagram search | `lib/scanner/merchant-search/*` (cache, maps-url, market, normalize-candidate, query, ranking, search-plan, serpapi, service, telemetry), `lib/scanner/ig-search/*` (handle, normalize-candidate, query, rapidapi, serpapi, service), `lib/scanner/serpapi-outcome.ts` |
| Scan execution | `lib/scan/start-job.ts` (validation, rate limit, `audit_jobs` insert, `scan_started` event), `lib/scan/run.ts` (`processScan` + runtime switch), `lib/scan/dispatch-runtime.ts`, `lib/scan/fixtures.ts` |
| Report read path | `lib/report/{store,language-service,executive-summary,load-report,view-model,sanitize-proof,top-priorities,weighted-impact,finding-label,competitor-gap}.ts` |
| Report access | `lib/report-access/{authorize-report,token,cookie,visibility,staff-session}.ts`, `lib/auth/staff.ts` |
| Evidence | `lib/evidence/{persist,safe-media,load-authorized,inline-print-media,types}.ts` |
| Analytics | `lib/analytics/{record-event,events}.ts` |

`authorizeReport` gained a fourth access kind, `member`, decided after staff and before the viewer grant, so a workspace
member sees the full report without a grant cookie. `view-model.ts` renders it exactly like `viewer` plus `workspaceId`/`role`.

### 1.2 API routes (9)

`POST /api/business/search`, `POST /api/business/ig-search`, `POST /api/scan/start`, `GET /api/scan/status`,
`POST /api/scan/process` (`maxDuration = 300`), `POST /api/report-access/unlock`, `POST /api/report-access/sign-out`,
`POST /api/unlock` (307 shim), and the pre-existing demo assistant route. Request/response shapes, rate-limit scopes, the
analytics session cookie and the 18-argument `complete_report_unlock` call are byte-identical to upstream; verified by diff.

`POST /api/scan/start` accepts workspace attribution only as a server-side parameter of `lib/scan/start-job.ts`. The HTTP
route never forwards `workspace_id`/`location_id` from a request body, so a client cannot attach a scan to a workspace
(guardrail 15).

### 1.3 Routes and pages (12 segments + OG image + 2 legal documents)

`app/[locale]/` holds `page` (landing), `scan`, `scanning/[jobId]`, `r/[slug]` (+ `opengraph-image.tsx`), `sample-report`,
`demo-workspace`, `unlock/[slug]`, `pricing`, `methodology`, `trust`, `legal/privacy`, `legal/terms`. `app/page.tsx`
redirects to `/zh-HK`. `app/[...path]/page.tsx` survives only as the Phase 2 bridge for `/{locale}/owner/*` and 404s
everything else. `proxy.ts` redirects unprefixed page paths to `/zh-HK/...` and stamps `x-sme-locale`, which the root
layout reads for `<html lang>`.

The four funnel pages became their own client modules (`components/{scan,scanning,unlock,landing}-page.tsx`); the report
is a server component (`components/report-view.tsx`) fed by `buildReportProps`. `components/public-pages.tsx` lost its
`"use client"` directive so it can re-export both kinds.

### 1.4 Fixtures

`scripts/fixtures/{kam-man-house,tw-cafe,unavailable-ig}.json` with `lib/scan/fixtures.ts`. `SCAN_SOURCES=fixture` (also
implied under `NODE_ENV=test`) swaps the live collector for a deterministic one; timestamps are shifted to the scan clock
so "days since last post" stays constant. The `unavailable-ig` fixture is the honesty check: `ig` reports
`IG_HANDLE_NOT_PROVIDED`, `ig.score` is null and coverage falls to 0.60, while `overall` stays non-null — missing evidence
reduces coverage, never the score (guardrail 2).

---

## 2. Verification

| Gate | Result |
|---|---|
| `corepack pnpm exec tsc --noEmit` | clean, root and all four packages |
| `corepack pnpm exec eslint .` | 0 errors (30 warnings, all inside vendored `packages/**` and 4 `no-img-element`) |
| `corepack pnpm exec vitest run` | **79 files, 797 tests, all passing** |
| `corepack pnpm exec next build` | green; 25 routes |
| `corepack pnpm exec playwright test` | 7 passed, 2 skipped (skips need Supabase / SerpApi) |
| Live `next start` route checks | 200 for `/zh-HK`, `/zh-HK/scan`, `/zh-HK/legal/{privacy,terms}`, `/en/legal/terms`, `/zh-HK/sample-report`, `/zh-HK/unlock/abc123`, `/zh-HK/methodology` |
| Demo-boundary check | `has-env-bar` and the demo bar render on `/zh-HK/sample-report` and `/zh-HK/demo-workspace` only, never on `/zh-HK` |
| hreflang | all four alternates prefixed (`zh-HK`, `en`, `zh-TW`, `x-default` → `/zh-HK/...`), canonical prefixed |

---

## 3. Fixes made during integration

1. **Fail-open membership in the report loader.** `authorizeReport` deliberately lets a caller vouch for scope when the job
   row carries no `workspace_id`, but the loader always selects that column, so an unattached job (`workspace_id` null)
   could be claimed by any membership. The loader now normalises the column to an explicit value before authorizing, and
   fails closed. Two agent-written tests disagreed on this; the security-correct one now holds.
2. **`localeAlternates` emitted unprefixed hrefs.** Ported from upstream, where the default locale is unprefixed
   (`localePrefix: "as-needed"`). This app prefixes every locale, so `x-default` and `zh-HK` advertised URLs that `proxy.ts`
   307s. Fixed at the source in `lib/seo.ts` with tests; the defensive re-prefixing in `app/[locale]/_meta.ts` is now a no-op.
3. **Environment-bar offsets.** The 30px/38px offsets for `.public-header`, `.workspace-shell`, `.workspace-sidebar` and
   `.workspace-topbar` lived in three stylesheets and applied unconditionally. Each is now gated behind `.has-env-bar` with
   a zero default, so removing the demo bar from production pages leaves no empty strip. Files: `app/globals.css` (5 rules),
   `app/responsive.css` (2), `app/ramp-refresh.css` (2 + the gated companions).
4. **Footer linked to legal pages that did not exist.** `/{locale}/legal/{privacy,terms}` 404'd on every page. Added both
   routes rendering from `PRIVACY_SECTION_KEYS`/`TERMS_SECTION_KEYS` and the trilingual `legal.*` copy already in
   `lib/messages/`, stamped with `LEGAL_POLICY_VERSION` (2026-07-28), in the site's own design primitives.
5. Four `as NodeJS.ProcessEnv` casts on partial env objects failed `tsc`; widened to `as unknown as`.

---

## 4. Known gaps and follow-ups

- **`e2e/public-funnel.spec.ts` skips without Supabase.** No `.env.local` exists here, so the end-to-end funnel test cannot
  insert a job. It is written and ready: manual entry → scanning → report → unlock → full report. Run it with a configured
  `.env.local` and `SCAN_SOURCES=fixture` to close DoD item 1. A second spec exercising `POST /api/business/search` skips
  without `SERPAPI_API_KEY`.
- **`db:verify` still not run** (Phase 0 item). Docker Desktop would not start on this machine; the command is in
  `PHASE-0-REPORT.md` §10.3.
- **Live schema confirmation still pending** (Willy): the production Supabase project must carry all 28 upstream migrations.
- The report page 500s rather than 404s when Supabase is unreachable — that is the connection failing, not a missing row.
- `ContextualAssistant` renders on the report only when `sample` is true, so a real customer report cannot surface Kam Man
  House demo data (guardrail 12). Live assistant mode is Phase 5.
- Dropped from the report view: the prototype's `report-agent-handoff` section (no production copy) and the sign-out control
  (needs a client child; the `report.signOut*` keys exist for Phase 2).
- Multi-location and Managed plans show "contact Fimmick" rather than a price, because `MarketPricing` carries only the
  single per-location price. Confirm the intended plan copy (Appendix D of `CLAUDE.md`).
- `天后` is not one of the 18 administrative districts in `DISTRICTS_HK`; Tin Hau sits in 東區. The e2e spec prefers 天后 if
  offered and otherwise selects 東區.

---

## 5. Not done, by design

No database was written, no migration applied, nothing pushed or deployed, and no paid provider was called: every test and
the e2e specs run on fixtures. Phase 2 (auth, ownership, onboarding, workspace shell) has not started; `/{locale}/owner/*`
still renders the prototype through the bridge route.
