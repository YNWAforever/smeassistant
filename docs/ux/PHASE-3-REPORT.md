# Phase 3 report: scan and report

Date: 2026-10-20 · Branch: `ux/phase-3-scan-report`, cut from `ux/phase-2-public-site` · Not pushed.

Decisions taken on 2026-10-20 (all five recommendations accepted):

| # | Decision |
|---|---|
| 1 | Evidence without a date shows **"Date not recorded"** everywhere; source and limitation stay required |
| 2 | Findings can be filtered by **priority and source** |
| 3 | **Print / save as PDF** uses the browser's print with a print stylesheet |
| 4 | **Save to my workspace** goes through the existing unlock (contact + report-delivery consent, marketing separate), then sign-in and the Google-verified claim |
| 5 | Moving the pricing copy into `lib/copy.ts` waits for Phase 7 |

No API contract, migration, `packages/*`, auth, data-access or report-access change. The report still renders only from `ReportProps`; the public preview never receives privileged fields.

## What changed

| Commit | Result |
|---|---|
| `914c2ca` | **Scan wizard split** into a state hook (`use-scan-wizard.ts`) and one file per step. `scan-page.tsx` drops to 89 lines. Pixel-identical. |
| `bd95b64` | **Scanning page** shows one row per source (Google Business, Instagram, Search and AI) with its current phase, plus the loop stepper at "Scan". Ready, stalled, paused, failed and recovery cards are unchanged. |
| `0735631` | **Report rebuilt** (details below). New strings in `lib/copy-report.ts` (`copy[locale].report`); proof panels moved to `components/report/proof-panels.tsx`. |
| `a8f6f9c` | **Unlock**: the required report-delivery consent is set apart from the two optional ones. No logic or copy change. |
| `ca45449` | **Dead CSS**: the old scanning collector rules removed (160.9 → 159.1 KB). Scanning, report, sample and unlock pages are pixel-identical before and after. |
| `57edff3` | **Fix**: scan rows keep a fixed height when their status text changes (see Measures). |

### The report, in reading order

1. **Score and coverage.** The shared score dial, a coverage bar with one segment per source, and a trend chip only when the scan is comparable. A withheld or failed score shows "No score yet", never 0.
2. **Do this first.** The top-ranked priority as a large card, then up to two more. Ranks come from the loader and are not re-numbered. The public preview shows labels only and links to the unlock step.
3. **Unlock** (locked preview only), moved up so it comes straight after the priorities.
4. **By source.** One card per source with its state, date and limitation. These replace both the rubric list and the collapsed "evidence passport", and are **shown on the public preview too**, so coverage and limitations are visible before unlock.
5. **Key numbers** and observed comparisons (unlocked only, unchanged logic).
6. **Evidence photos** (unlocked only, unchanged).
7. **Every finding**, collapsed by source, with priority and source filters. Each finding shows:
   - "Why it matters" and "What to do next"
   - the source, date, coverage state and limitation of the module that produced it
8. **Save, share, print** (unlocked, real reports only), in the summary card:
   - **Save to my workspace**: viewers only; starts the sign-in claim step, where ownership is verified with Google.
   - **Copy link**: copies the public share URL. The hint says recipients see the free preview.
   - **Print or save as PDF**: opens every collapsed section first and hides the site chrome.
9. **Contact buttons** (unchanged).

**Dates:** a source's own date if recorded, else "Scanned {date}" from the scan that collected it, else "Date not recorded" (all three locales). The old "Observation date unavailable" strings now read "Date not recorded".

## Honesty checks built in

- **Unavailable ≠ zero.** Unmeasured sources show as hollow coverage segments and dashed source cards with their limitation, never as a 0 score.
- **Comparable before change.** The trend chip shows a number only for a comparable pair. Otherwise it says "Not comparable" and the reason stays in the takeaway.
- **Evidence before score.** Every finding carries its source, date and limitation. The public preview now shows per-source coverage it used to hide in a closed disclosure.
- **Ownership is proven.** "Save to my workspace" never attaches anything; it links to sign-in with the claim slug, exactly as the old claim link did. Members, the sample and locked previews get no claim link (tested).
- **Sharing is honest.** The copied link is the public URL, and the page says what recipients will see.

## Measures

Positions are the top of the section on a 390 px phone, in px from the top of the page.

| Report at 390 px (en) | Before | After |
|---|---|---|
| "Do this first", unlocked fixture report | 4,977 | **2,114** |
| "Do this first", sample report | 3,115 | **1,342** |
| "Do this first", public preview | 1,104 | 1,086 |
| Source cards visible on the public preview | collapsed | **open at 2,114** |
| Page height: unlocked / sample / public | 7,692 / 7,856 / 3,152 | 7,688 / 7,587 / 3,788 |
| Printed pages, unlocked fixture (A4) | 5, with sections still collapsed | 11, everything open, no chrome |

The public preview is 636 px taller because the source cards (coverage and limitations) are no longer hidden.

At 390 and 1440 px, in en, zh-HK and zh-TW:

| Check | Report (public, unlocked, sample) | Unlock | Scanning |
|---|---|---|---|
| axe-core (WCAG 2.2 AA) | **0 violations** | **0** | **0** |
| Horizontal overflow | none | none | none |
| Cumulative layout shift | **0** | **0** | see below |

**Scanning layout shift.** A full scroll-through measured CLS of 0.42–0.52 on phones. Two causes:

1. **Fixed.** My scanning change put the status text beside the source name, and a longer status wrapped and grew the row. `57edff3` stacks them, so the rows no longer move.
2. **Pre-existing, still open.** After the first status check, a status card (ready, stalled or failed) is inserted above the recovery cards and pushes them down. The pre-phase page measures the same when scrolled to those cards (0.52 en / 0.42 zh-HK on a phone). Viewed from the top, it is 0.057 before and 0.075 after, both under the 0.1 "good" threshold. See open question 1.

Captures:
- [unlocked report en 1440](phase-3/report-unlocked-en-1440.jpg)
- [unlocked report zh-HK 390](phase-3/report-unlocked-zh-HK-390.jpg)
- [public preview en 390](phase-3/report-preview-en-390.jpg)
- [sample report zh-HK 390](phase-3/sample-report-zh-HK-390.jpg)
- [scanning en 390](phase-3/scanning-en-390.jpg)
- [unlock zh-HK 390](phase-3/unlock-zh-HK-390.jpg)

## Verification

All gates ran sequentially on the final head.

| Gate | Result |
|---|---|
| `corepack pnpm typecheck` | pass |
| `corepack pnpm lint` | 0 errors, 40 warnings (unchanged) |
| `corepack pnpm test` | 5,882 + 62 root tests; packages: scoring 183, region 23, contracts 20, scan-engine 299. All pass. |
| `corepack pnpm build` | pass |
| `test:secret-boundary`, `test:no-supabase`, `test:no-self-service-claim` | pass |
| `corepack pnpm e2e` | **Not run locally** (needs Docker). CI runs it. `e2e/acceptance/report-dashboard.spec.ts` relies on `#report-detail-ig + details` and `[data-metric]`, which are kept. |

New and updated tests:
- `components/report/report-rebuild.test.tsx`:
  - the date fallback in three locales
  - findings carry source, date, state and limitation
  - anchors stay outside closed disclosures
  - priority and source filters, and their order
  - Save only with a claim href
  - copy link without the hash
  - print opens and restores sections
  - members get no claim; the public preview and the sample get no actions
  - one coverage segment per source
- `components/report/dashboard.test.tsx`: updated for the new dial and trend markup and the new order (priorities before source cards). The public preview now asserts that source cards **are** present and that numbers, comparisons and private fields are not.
- `components/scanning-page.test.tsx`: row states per source.

## Deviations from the plan

1. **"Do this first" reuses the priority cards, not the workspace `ActionCard`.** `ActionCard` needs impact, effort and minutes; the report has no effort data, so filling them would invent numbers.
2. **The scan-comparison panel stays above the score dial**, as an existing test requires, so the score's change and the search comparison are never confused. It only appears on repeat scans.
3. **The unlock page got a light restyle only.** It already matched the new look, so only the consent emphasis changed.
4. **The fixture's executive summary is raw JSON** in the local captures. That comes from the local stub LLM, not the page.

## Open questions

1. **Scanning status card shift (pre-existing).** Should the ready/stalled/failed card replace the source list in place (no shift, but the list disappears), or stay where it is? I recommend replacing it in place in Phase 6.
2. **Still open from Phase 0** (these decide Phase 4):
   - assistant name
   - bulk approve
   - Fix Pack drafts
   - whether to merge Create, Offers and Starter pack
