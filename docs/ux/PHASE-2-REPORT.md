# Phase 2 report: public site

Date: 2026-10-20 · Branch: `ux/phase-2-public-site`, cut from `ux/phase-1b-visual-motion` (PR #96) · Not pushed.

Decisions taken on 2026-10-20 (all five recommendations accepted):

| # | Decision |
|---|---|
| 1 | The public brand is **Kinnso OS** (by Fimmick) in the header, footer, page titles and Open Graph images |
| 2 | The three Pexels photos are dropped from the landing page |
| 3 | Hero copy: en "See how customers find you." · zh-HK / zh-TW 「看清顧客如何找到你」, with "Free scan of Google, Maps, AI search, Instagram and your website." |
| 4 | The three outcome cards (`/scan?intent=`) are dropped from the landing page; `/scan` still accepts `intent` |
| 5 | The landing page shows the Free and Growth plans only; multi-location and managed stay on /pricing |

No API contract, migration, `packages/*`, auth, data-access or `/scan` change. The scan handoff is unchanged: `/{locale}/scan?market=&business=`.

## What changed

| Commit | Result |
|---|---|
| `5262957` | **Header, menu and footer.** Nav is How it works · Pricing · Methodology, plus Sign in and one **Free scan** button. Brand, page titles, Open Graph images, the 404 link and the footer read Kinnso OS. Strings for the public chrome and landing are in `lib/copy-public.ts` (en / zh-HK / zh-TW), reached as `copy[locale].site`. |
| `f755ea3` | **Landing rebuilt** from 13 sections to 7: hero (one value line, business field, explicit Hong Kong / Taiwan market, one Start free scan button, an 8-second SVG loop beside it), how it works, what we check, a Demo-labelled sample report, Free + Growth pricing, a 5-question FAQ and a trust strip. `components/landing-page.tsx` is now a 34-line composition of `components/public/landing/*` (largest file 130 lines, down from 655). Redesigned pages get a `pages` cascade layer after `legacy`, so old element rules never override them. |
| `701286f` | **Methodology and Trust rebuilt** with the shared visuals. Methodology: coverage meter with a missing source, a withheld score, comparable and non-comparable trend chips, the six fact labels, what we check and do not claim, how the work is prepared (no agent names) and the comparison table moved from the landing page. Trust: four pillars, `ApprovalFlow` with the lock before Approved, the reviewed data-boundary rows and the policy link. Strings in `lib/copy-public-info.ts`, reached as `copy[locale].siteInfo`. |
| `b4c1f97` | **Pricing**: the free plan is named "Free scan" instead of "SME Scanner". The page already matched the new look, so its layout, logic and 20 tests are unchanged. |
| `7e42db6` | **Dead CSS removed**: the old editorial landing (`ed-*`) and the previous methodology and trust layouts. Legacy CSS drops from **197 KB to 161 KB**. Scan, sample report, pricing, sign-in, demo workspace and the rebuilt pages are **pixel-identical** before and after the prune (32 captures, 390 and 1440 px, en and zh-HK). |

## Honesty checks built in

- **No outcome promise.** The old zh hero 「讓更多顧客找到你」 (audit G-8) is gone from the page and the page metadata.
- **The hero loop carries no numbers and no business.** It is described to screen readers as "an illustration … No real data", and the source that is "not available" is drawn hollow, never as zero.
- **The sample report is labelled Demo** and built from the real components with the fixed Kam Man House data (`lib/demo-data.ts`). It shows the honest demo trend (**Down 4** since the previous comparable scan), 4 of 5 sources measured, and the priority action labelled **Observed**. The old landing claimed a 22% → 31% response-rate rise that disagreed with the demo workspace (audit G-11). That claim is gone.
- **FAQ answers only restate what the product does**: free scan with no sign-up, contact needed to unlock the full report, nothing published automatically, marketing needs a separate opt-in.
- **Market is explicit.** The Growth price follows the market chosen in the hero, never the interface language (tested).

## Measures

| Landing | Phase 0 | Phase 2 |
|---|---|---|
| Height at 390 px (en / zh-HK) | 15,481 / 14,459 px | **5,200 / 5,035 px** |
| Height at 1440 px (en) | 9,267 px | **3,725 px** |
| Words in `<main>` (en) | 1,383 | **327** |
| CJK characters in `<main>` (zh-HK) | 2,467 | **560** |
| Sections | 13 | **7** |
| Raster images | 3 (hot-linked Pexels) | **0** |
| Primary actions above the fold | several | **1** (Start free scan) |
| Largest contentful paint, local `next start` (en / zh-HK, 390 px) | — | 388 / 276 ms |

Every page, at 390, 768 and 1440 px in all three locales (landing, methodology, trust):

| Check | Result |
|---|---|
| axe-core (WCAG 2.2 AA) | **0 violations** |
| Cumulative layout shift while scrolling every reveal | **0** |
| Horizontal overflow | none (the comparison table scrolls inside its own focusable container) |

Captures: [landing en 1440](phase-2/landing-en-1440.jpg) · [landing zh-HK 390](phase-2/landing-zh-HK-390.jpg) · [landing zh-TW 390](phase-2/landing-zh-TW-390.jpg) · [methodology en 1440](phase-2/methodology-en-1440.jpg) · [trust zh-HK 390](phase-2/trust-zh-HK-390.jpg)

## Verification

All gates ran sequentially on the final head.

| Gate | Result |
|---|---|
| `corepack pnpm typecheck` | pass |
| `corepack pnpm lint` | 0 errors, 40 warnings (unchanged) |
| `corepack pnpm test` | 5,869 + 62 root tests; package suites unchanged. All pass. |
| `corepack pnpm build` | pass |
| `test:secret-boundary`, `test:no-supabase`, `test:no-self-service-claim` | pass |
| `corepack pnpm e2e` | **Not run locally** (needs Docker). CI runs it. `e2e/smoke.spec.ts` now expects the page title to contain "Kinnso OS" (decision 1). |

New and updated tests:
- `components/landing-page.test.tsx`: one headline and one submit, no outcome promise, market handoff, empty-field error, illustration label, planned sections, Demo label, zh-TW register, Growth price per market, FAQ keyboard trigger.
- `components/public/info-pages.test.tsx`: withheld score, non-comparable chips without numbers, no agent names, comparison caption, approval lock, data-boundary rows.

A flaky timing assertion in `app/api/mail/unsubscribe/route.test.ts` failed once under parallel load and passes on its own and on rerun; it is unrelated to this phase.

## Deviations from the plan

1. **Pricing kept its layout.** It already matched the new look, so only the free plan's name changed; its inline bilingual text was not moved to `lib/copy.ts` in this phase. The text moves when the page is next restyled.
2. **The sample report omits Before/After.** The demo data's comparable scans show a score drop (66 → 62), so a "before/after" proof card would either show that drop or need invented numbers. The teaser shows the honest TrendChip instead.
3. **The assistant launcher is no longer on the landing page.** It stays on the sample report and demo workspace.
4. **The old footer's large decorative sign-off** ("Evidence first, action next.") is unchanged; the footer is restyled with the workspace in Phase 4.

## Open questions

1. **Pricing copy:** move pricing text into `lib/copy.ts` now (one commit, no visual change), or in Phase 7 (repo hygiene)?
2. **Still open:**
   - **From Phase 1B:** should evidence without a date be hidden everywhere, or shown as "Date not recorded"?
   - **From Phase 0** (these decide Phase 4):
     - assistant name
     - bulk approve
     - Fix Pack drafts
     - whether to merge Create, Offers and Starter pack
