# Phase 7 report — content, SEO, accessibility, hardening, deploy prep

**Date:** 2026-09-04 · **Branch:** `feat/phase-7-hardening` (from `main` after PR #2) · **Base:** sme-scanner `origin/main` `b9b4151f`
**Status:** complete. The playbook's seven phases are done; what remains is the operator work only Willy can do (Docker checks,
external registrations, a live smoke test).

---

## 1. What changed

- **Content (§5).** The remaining prototype wording is gone: the landing subheading no longer promises a 30-second scan
  ("in a few minutes" in all three locales); the assistant's running state says "Reading the workspace evidence snapshot" in live
  mode and keeps the demo wording in demo mode; the unused `prototype` copy key is removed. The three dead prototype modules
  (`workspace-home`, `workspace-actions`, `workspace-operations`) are deleted; the demo pages keep their own components.
- **Capabilities.** `lib/capabilities.ts` holds the real capability table from §5; a test pins that every template and every
  agent definition agrees with it and that no real capability is labelled Demo.
- **SEO.** `app/robots.ts` disallows `/api`, `/auth`, reports, unlock, scanning and the whole owner area; `app/sitemap.ts` lists
  the public pages in every served locale with hreflang alternates; `app/opengraph-image.tsx` is the default share card; the root
  layout adds the theme colour (`#173b34`), viewport and the Open Graph site name, and the public pages carry it too. Metadata file
  routes are excluded from the locale redirect (they were being 307'd to `/zh-HK/opengraph-image`).
- **Accessibility.** Lighthouse (desktop, navigation) on the three required surfaces:

  | Page | Accessibility | Best practices | SEO |
  |---|---|---|---|
  | `/zh-HK` (landing) | 96 | 77 | 100 |
  | `/zh-HK/sample-report` (report) | 96 | 100 | 100 |
  | `/zh-HK/demo-workspace` (home surface, no session needed) | 96 | 100 | 100 |

  The landing's best-practices score is a third-party-cookie note from the embedded Pexels images. The two accessibility findings
  are design-owned and left untouched per §5 "never restyle": the header CTA (white on the lime accent, contrast 1.26) and the brand
  link whose `aria-label` ("SME Scanner 主頁") does not contain its visible text. Both are listed in §3.
- **Hardening.** The ported decoder tests in `lib/evidence/safe-media.test.ts` race real timers (a 200 ms hang detector, 20 ms polls)
  and are starved when fifteen workers run in parallel on a laptop, yet pass reliably alone. `pnpm test` now runs the suite without that file
  and then runs the file by itself; Vitest also gets `retry: 1` for ordinary timing noise. The tests themselves are untouched (upstream verbatim).
- **CI.** `.github/workflows/ci.yml` in upstream's gate order: install, lint, typecheck, unit, secret boundary, verify-migrations
  (postgresql-16), integration (Docker), build, Playwright on fixtures.
- **Docs.** `docs/integration/ARCHITECTURE.md` (decisions, layers, topology diagram, product loop, non-negotiables), a rewritten
  `README.md` (setup, commands, environment groups, migration procedure, cut-over plan), and `docs/integration/DEPLOY.md` (Vercel
  settings, env, external registrations, first smoke test). Nothing was deployed.

---

## 2. Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint .` | 0 errors (36 warnings: vendored packages and upstream-verbatim test stubs) |
| `pnpm test` | **161 files, 1516 tests, all passing** (suite, then the isolated decoder file, then the packages) |
| `next build` | green; `/robots.txt`, `/sitemap.xml`, `/opengraph-image` added |
| `playwright test` | 27 passed, 4 skipped (Supabase / SerpApi / magic link / seeded journey) |
| `test:secret-boundary` | passed across 43 public artifacts |
| Live checks | `/robots.txt` and `/sitemap.xml` render with the three locales; `/opengraph-image` answers 200 `image/png`; `og:site_name`, `og:image` and `theme-color` present on public pages |
| Lighthouse | accessibility 96 on landing, report and the home surface (≥ 90 required) |
| Docker-dependent gates | **still unexercised on this machine**; they run in CI on every push |

## 3. Definition of Done (§6) — status

| # | Item | Status |
|---|---|---|
| 1 | Public funnel end-to-end on real providers and on fixtures in CI | Fixtures: covered by Playwright and CI. Real providers: **Willy's smoke test** (DEPLOY.md). |
| 2 | Claimed workspace shows snapshot, coverage, actions, priority factors, versions, approvals, exports, usage, activity | Implemented (Phases 3–6); unit-tested; needs the seeded-workspace walk-through on Docker. |
| 3 | Honest coverage: IG-less scan shows Not scored and lower coverage, never a lower score | Tested (`module-states`, `unavailable-ig` fixture). |
| 4 | Two comparable scans → `scan_diffs` delta and an `Attributed` measurement; incomparable pairs explain why | Unit-tested; the two-scan run itself needs the Docker suite. |
| 5 | Viewer and out-of-scope manager get 403 on every mutation and read-only UI; ownership only via Google or staff | Tested on every mutation route. |
| 6 | No demo data on non-demo pages; no prototype wording outside the two demo surfaces | Done; the last modules deleted this phase. |
| 7 | Three locales on every route; `alternates.languages`; Lighthouse a11y ≥ 90 on landing, report, home | Done (96/96/96). |
| 8 | README, `.env.example`, ARCHITECTURE.md, phase reports, migration and cut-over procedure | Done. |
| 9 | Legacy app renders every job this app creates identically; `db:verify` passes with the new migrations | Same vendored engine and scorer by construction; `db:verify` **pending Docker**. |
| 10 | Clean tree, phase-sized commits, nothing pushed unless asked | Phases pushed at Willy's request (PRs #1, #2); this phase committed on its own branch. |

## 4. Open items for Willy

1. Run `corepack pnpm db:verify`, `test:integration` and `seed:demo` on a machine with Docker, then walk Home → Actions → approve →
   export → rescan → Insights on the seeded workspace.
2. Confirm the live Supabase project carries all 28 upstream migrations, then apply the two workspace migrations to a non-production
   project first (README "Database and migrations").
3. Register the auth callback, the two Google redirect URIs and the Stripe webhook per DEPLOY.md; only then enable the OAuth claim flag.
4. Decide on the two design-owned accessibility findings: the header CTA's contrast (white on lime, 1.26) and the brand link's
   `aria-label` mismatch. Both are one-line changes but §5 forbids restyling without the design owner.
5. Confirm the retention statement on the Trust page (scan evidence 12 months, agent inputs/outputs and audit events 24 months) and
   supply owned photos for `public/brand/` to replace the three Pexels images.
6. Multi-location and Managed plan copy still reads "contact Fimmick" (Appendix D open question).
