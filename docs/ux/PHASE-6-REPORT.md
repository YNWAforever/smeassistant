# Phase 6 report: quality

Date: 2026-10-20 · Branch: `ux/phase-6-quality`, cut from `ux/phase-5-onboarding-states` · Not pushed.

Decisions taken on 2026-10-20 (all recommendations accepted):

| # | Decision |
|---|---|
| 1 | Measure Lighthouse locally, with `lighthouse` as a dev-only dependency (see deviation 1). |
| 2 | Move the strings of every owner workspace screen into `lib/copy` now. The public demo workspace and the remaining public pages follow in Phase 7. |
| 3 | Restore a hard 404 for unknown action ids. |
| 4 | Add acceptance specs for the Phase 4 and 5 flows. They run in CI only, because they need Docker. |

There are no changes to API contracts, migrations, `packages/*`, auth logic or data access. The one data-path change: `loadActionDetailProps` returns "not found" for an id that is not a UUID, without querying. A malformed id used to reach the database and come back as a server error. Every server check is unchanged.

## What changed

| Commit | Result |
|---|---|
| `f992c37` | **Hard 404 for unknown actions.** Today and the Actions queue keep their loading skeletons inside route groups (`(today)/`, `actions/(queue)/`). No loading boundary sits above action detail, so `notFound()` answers 404 again. A test now checks that no `loading.tsx` sits above action detail or the report. |
| `8a8c1d7`, `67f909a`, `acddc56` | **Action detail split.** The 982-line client file is now a composition root of 119 lines, a state hook, a mutations module and seven section components. No file is over 400 lines. Its 186 strings moved to `lib/copy-action.ts` (`copy[locale].action`), with a test that every locale has the same keys and placeholders. |
| `7300974`, `d16a949` | **Accessibility** (details below). |
| `3948601` | **The Actions queue loads the side-panel editor only when a panel is open:** 282 → 241 KB first-load JS. |
| `16dc7e4` | **JS budget in CI.** `pnpm test:js-budget` reads the production build and fails when a route's gzipped first load goes over budget: 300 KB for workspace pages, 240 KB for the rest. It runs right after the build step. |
| `330a1b5` | **Acceptance specs** for bulk approve, the getting-started checklist, the side panel and the action 404 (details below). |
| `e8168cf`–`3897e7e` | **Workspace strings.** About 420 strings from 17 workspace files moved into three dictionaries: `copy-workspace-home.ts`, `copy-workspace-actions.ts` and `copy-workspace-business.ts`. Each of the 17 files now has 0 inline `isChinese` choices (Today had 44, New 29, Insights 26, Plan 24, and so on). A parity test covers all three. |
| `83617d4` | **Legacy CSS:** removed the rules for the deleted More page and the old onboarding layout. 120 captures are pixel-identical before and after. |
| `fcf6a5d` | **Phone queue fix:** a long status badge such as "Approved · export ready" no longer pushes the card past a 390 px screen, where the page cut it off. |

Also on this branch: the two acceptance specs fixed on PR #100 (`8db5f69`), merged in.

### Accessibility

- **Axe (WCAG 2.2 AA):** 0 violations on 21 workspace and auth pages, in light and dark, at 390 px.
- **Touch targets (44 px on touch screens):**
  - Checkboxes and switches keep their drawn size and get an invisible 44 px hit area. The old blanket rule had stretched them to 16×44.
  - The theme menu and the icon-only Ask Kinnso button now reach 44 px. Before, they were 36 and 42 px wide.
  - Queue status chips, queue paging links and the sign-in Help link now reach 44 px.
  - Tab strips grow with their tabs.
- **Before → after:** 2–10 targets under 44 px per page → 0.
- **Keyboard:** I tabbed through every page above. Every stop shows a focus ring. The only exception is the dev-only Next.js overlay, which production doesn't ship.
- **Forced colours:** sign-in fields kept only a box-shadow ring, which Windows high contrast hides. They now keep a transparent outline, which shows there in the system colour.
- **Names:** no unnamed interactive element.
- **Phone top bar:** the short language label ("EN") was cut off at 390 px and now fits.

### Acceptance specs (`e2e/acceptance/workspace-queue-flows.spec.ts`)

1. **Bulk approve:**
   - The owner can't approve until each draft is ticked as read.
   - After approval, the version row is `approved`.
   - Today's "Approve your first draft" step is then ticked.
2. **Viewer:** a viewer is offered no bulk approval, and the approve route answers 403.
3. **Side panel:**
   - It opens beside the queue, with its title as an `h2`.
   - Its history tab works.
   - Closing it keeps the queue's `?location=`.
4. **Action 404:** an unknown or malformed action id answers 404. A bad `?open=` leaves the queue at 200.

Each step was run against the local fixture with a scratch replica of the spec, and all passed. The spec itself runs in CI.

## Measures

### First-load JavaScript (gzipped, from the production build)

| Route | Before | After |
|---|---|---|
| Actions queue | 282 KB | **241 KB** |
| Action detail | 275 KB | 272 KB |
| New | 251 KB | 251 KB |
| Today | 228 KB | 228 KB |
| Insights | 220 KB | 220 KB |
| Landing | 217 KB | 217 KB |
| Root (React and Next) | 129 KB | 129 KB |

**Workspace shell:** the layout adds about 70 KB on top of the root. That's the Radix tooltip, select, sheet, dropdown and sidebar parts the shell uses. Splitting them would save 8–12 KB each, and I don't think that's worth the risk now.

### Lighthouse (production build, public pages)

| Page | Performance, mobile / desktop | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Landing (en, zh-HK) | 90, 88 / 100 | 100 | 100 | 100 |
| Pricing | 95 / 100 | 100 | 100 | 100 |
| Methodology | 91 / 100 | 100 | 100 | 100 |
| Scan | 96 / 100 | 100 | 100 | 100 |
| Sample report | 87 / 100 | 100 | 100 | 100 |
| Report | 87 / 100 | 100 | 100 | 63 |
| Sign-in | 87 / 100 | 100 | 100 | 66 |

- **CLS:** 0 on every page.
- **LCP:** 2.2–3.5 s on simulated mobile and under 0.85 s on desktop.
- **SEO:** reports and sign-in score lower only because they are `noindex` by design.
- **Sign-in:** Lighthouse counts 344 KB of JS there because the auth client preloads while the page is idle. That's deliberate; the page's own first load is 201 KB.
- **Workspace pages:** Lighthouse can't run on them against a production build. The local test sign-in is refused when `NODE_ENV=production` (a safety rule with its own test), and I didn't work around it. For those pages, see the JS table above and the dev-mode axe and CLS checks.

### Screens

- **Pixel check:** 30 pages × en and zh-HK × 390 and 1440 px = 120 captures. On the same data, they are identical before and after the CSS prune.
- **Status codes:**
  - An unknown action id answers 404, and a malformed one 404 too. It used to answer 200, and a malformed id gave a 500.
  - Unmatched owner URLs answer 404.
  - Signed-out requests get a 307 to sign-in.
  - Old URLs answer 308 to their new pages.

## Verification

All checks ran one after another on the final commit.

Gate results are added when the sequential run finishes.

`e2e` and `e2e:acceptance` need Docker, so they were not run locally; CI runs both.

## Deviations from the plan

1. **Lighthouse is not a repo dependency.** Adding it as a dev dependency also changed production resolution:
   - It bumped `ws` 8.21.3 → 8.22.0 under `@vercel/functions`.
   - It made `next` and `drizzle-orm` resolve `@opentelemetry/api`.

   A measuring tool shouldn't do that, so I ran Lighthouse from a separate install outside the repo. If you want it in the repo, it needs a pnpm override to keep those versions.
2. **The legacy CSS prune is small.**
   - **What was removed:** about 1.5 KB of rules whose classes no source file uses any more. The legacy layer is still 157 KB.
   - **Why I stopped there:** removing more means proving a rule is unused in every state, including dialogs, toasts, errors and flag-gated modes. The 120 captures don't cover all of those.
   - **Proposal for Phase 7:** a coverage-based prune that also records interaction states, with this pixel check as the guard.
3. **Focus rings needed no change.** My first keyboard audit reported missing rings, but it read the style before the focus transition finished. Measured properly, every stop already showed the browser's ring, so I made no visual change there.
4. **Strings still inline:**
   - 21 `isChinese` uses remain, in helpers that build their own text (`comparisonReasonText`, `auditEntityLabel` and others) and in the action detail's evidence and workflow tabs.
   - The access-request components stay as they are, because they are shared with ops.
   - These, the public demo workspace and the public pages are for Phase 7.

## Open questions

1. Should the coverage-based legacy CSS prune go into Phase 7, before or alongside the repo-hygiene work?
2. The workspace shell costs about 70 KB of Radix code. Is a 300 KB workspace budget the right ceiling, or should it be tighter?
