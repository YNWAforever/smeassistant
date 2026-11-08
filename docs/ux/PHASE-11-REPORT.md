# Phase 11 report: the legacy layer removed

Date: 2026-10-21 · Branch: `ux/phase-10-shared-classes` (continues Phase 10) · Not pushed.

Decisions taken on 2026-10-21: delete the unused legacy classes, then move the base rules out of legacy. Light mode stays pixel-identical.

There are no changes to API contracts, migrations, `packages/*`, auth logic, data access or copy.

## What changed

| Commit | Result |
|---|---|
| `61049f0` | **Unused classes deleted.** `comparison-*`, `auth-*`, `workspace-choice-grid`, `priority-report-grid`, `priority-rank`, `priority-card-head`, `permission-note`, `fact-definition-list`, `is-sme` and the `.button` class: no component, page or library file names them. 84 rules and the dead half of 4 combined selectors, about 7.8 KB. |
| `93fcfc5` | **Legacy layer removed.** `app/styles/legacy/` and the `legacy` cascade layer are gone. |

### Where the last rules went

| Rules | Now in | Why there |
|---|---|---|
| `html`, `*`, `body`, links, headings, paragraphs, `svg`, `fieldset legend`, focus ring, selection colour, Chinese heading spacing, scroll reveal, reduced motion, `@property --score` and the shared keyframes | `app/styles/base.css`, layer `base`, after Tailwind's preflight | They are element defaults. No page relied on them beating a utility, apart from one link (below). |
| shadcn `data-slot` button, select, radio, checkbox and switch styles, and the two orange-button rules | start and end of `app/styles/shared.css` (`pages.shared`) | They override Tailwind utilities on the primitives: the round, bold buttons beat shadcn's `rounded-md` and `font-medium`. In `components` they would lose to those utilities and every button would change shape. The orange buttons' `!important` colours have to sit in the same layer as the default-button `!important` colour, where the more specific selector wins. |
| `.usage-track`, `.action-list` | `screens/shell.css`, `screens/actions-insights.css` | Workspace-only classes. |
| unread markers in `.compact-action-list` | `shared.css` | Used on Today and in ops. |

Old comments describing rules that had already moved were dropped with the files. The comments in `globals.css`, `tokens.css`, `i18n.css`, `public.css`, `workspace.css`, `a11y.css` and the public and screen files now describe the layers as they are.

### Values kept where they were

| Where | What happened | Now |
|---|---|---|
| Landing page, sample-case card links | They rendered in the card's ink because the old `a { color: inherit }` in legacy beat the `text-brand-text` utility written on the link. In `base` the utility wins and they would turn brand brown. | `.pl-sample .kinnso-card > .kinnso-link { color: inherit; }` in `public/landing.css`, with a comment. See the open question. |
| Button transition under reduced motion | A `transition: none` for reduced motion always lost to a later legacy transition rule. In the new order it would have won. | Dropped. The global reduced-motion rule in `base.css` still shortens every transition. |

## How it was checked

1. **Computed-style diff** on 21 public and workspace states (light and dark, 390 and 1440 px), change applied vs stashed. It found the two cases above. After the fixes, six re-checked states show no differences apart from `<script>` tags.
2. **Pixel comparison** of all 372 captures before and after:
   - 367 identical.
   - 3 differ only by the known glyph noise in the approval bar.
   - The version-conflict state, which shifts scroll between runs, was recaptured twice with the change: 7 of its 8 captures match the baseline exactly.
   - One capture (`action-conflict`, zh-HK, 390 px, light) differs by **one pixel by 3 colour levels** at the edge of the focused "Skip to content" pill, the same on every run. The skip link's computed style is identical with and without the change, so the cause is not traced. It is not visible.

## Measures

| Check | Phase 10 | Phase 11 |
|---|---|---|
| Legacy stylesheet | 28.9 KB, 135 rules | **none** |
| Cascade layers | 9 | 8 (`legacy` removed) |
| `app/styles/base.css` | — | 2.7 KB |
| `app/styles/shared.css` | 9.8 KB | 12.7 KB |

## Verification

All checks ran one after another on the final commit.

| Gate | Result |
|---|---|
| `corepack pnpm typecheck` | pass |
| `corepack pnpm lint` | 0 errors, 10 warnings (unchanged) |
| `corepack pnpm test` | 6,045 + 62 root tests. Packages: scoring 183, region 23, contracts 20, scan-engine 299. All pass. |
| `corepack pnpm build` | pass |
| `test:js-budget`, `test:secret-boundary`, `test:no-supabase`, `test:no-self-service-claim` | pass |

`e2e` and `e2e:acceptance` run in CI.

## Deviations from the plan

1. **The button and select styles went to `pages.shared`, not `components`.** In `components` they would lose to Tailwind utilities and every button and select would change.
2. **One pixel differs** on one capture, as described above.

## Open questions

1. **Landing sample-case links:** keep them ink as they render today, or let them take the brand-brown colour the code asks for (`text-brand-text`)? The second is a one-line deletion in `public/landing.css`.
2. **Buttons and selects in `components`:** moving them there would let the shadcn utilities win, changing every button's radius and weight. That is a visible redesign decision, so I have not done it.
