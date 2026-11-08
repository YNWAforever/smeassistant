# Phase 8 report: workspace screens off the legacy stylesheet

Date: 2026-10-21 · Branch: `ux/phase-8-legacy-migration`, cut from `ux/phase-7-hygiene` · Not pushed.

Decisions taken on 2026-10-21 (all recommendations accepted):

| # | Decision |
|---|---|
| 1 | Light mode stays pixel-identical. Dark mode gets fixes only where a legacy colour ignored the theme, each listed here. |
| 2 | Workspace screens only. Public pages keep their legacy rules for now. |
| 3 | The state-capture tool and its fixture states are committed under `test/visual/` as a manual tool, not run in CI. |
| 4 | Phases 6 and 7 go to `main` first as one PR ([YNWAforever/smeassistant#101](https://github.com/YNWAforever/smeassistant/pull/101)). |

There are no changes to API contracts, migrations, `packages/*`, auth logic, data access or copy.

## What changed

| Commit | Result |
|---|---|
| `05a216b`…`66b87d7` | **State-capture tool** in `test/visual/` (details below). |
| `0c88c06` | **Action detail** moved: 136 rules. |
| `cc13a98` | **Dark fix:** the sticky approval bar's border. |
| `952018f` | **Today** moved: 235 rules. |
| `3895aeb` | **Actions queue and Insights** moved: 128 rules. |
| `f3b1e1b` | **Workspace shell and the Ask Kinnso sheet** moved: 189 rules. |
| `7b0a658` | **Business, Settings and New** moved: 149 rules. |
| `0faf7a1` | **Workspace-wide rules** scoped to `.workspace-root` moved: 9 rules. |

### Where the rules went

Each screen has its own file in `app/styles/screens/`. All of them sit in a `screens` sub-layer of `pages`, so:

- they beat everything still in `legacy`;
- rules placed directly in `pages` (`workspace.css`, `states.css`) still beat them, as before.

Rules moved verbatim and in their legacy order. A rule was moved when one of its selectors names a class that only workspace code uses. Grouped selectors that also named a shared class were split, and the shared part stayed in legacy.

Classes the public site, auth pages or ops pages also use stay in legacy for now. Examples:

| Class | Also used by |
|---|---|
| `eyebrow`, `section-card` | public pages and reports |
| `limitation-note`, `field-stack`, `draft-editor-actions` | ops pages and the scan form |
| `action-card` | the landing page |
| `brand-lockup`, `skip-link` | the public header and auth pages |

### Values restated

Moving a rule out of legacy changes which rule wins wherever a remaining legacy rule used to beat it on source order or specificity. The places that mattered were found with the visual check and a computed-style diff. Each is restated so the element keeps the value it had:

| Where | Before the move | Now |
|---|---|---|
| Approval panel and payment-retry paragraphs | A plain paragraph directly in a section card took the workspace-wide paragraph style. | Scoped so they still do. |
| Section-card headings | The heading letter-spacing in the moved rule was always overridden by the workspace-wide heading rule. | Dropped. |
| Payment-retry card | Its amber background and border were always overridden by a later section-card rule. | Rule dropped. |
| Plan, goal and team section cards on phones | Took the 20 px phone radius. | Restated. |
| Brand checkbox group | Took the field-stack gap and top margin. | Restated. |
| Ask Kinnso launcher in a phone draft action row | Took the row's 40 px button height. | Restated. |

### Dark mode

One fix: the sticky approval bar's light warm-grey border (`#b5aba1`) showed as a bright outline on the dark theme. It now uses `--line-warm` in dark only.

[Before](phase-8/approval-bar-dark-before.png) · [after](phase-8/approval-bar-dark-after.png)

Today, the queue, Insights, Business and Settings were checked in dark mode, and no other colour ignored the theme.

## The state-capture tool

`test/visual/` has its own README. In short:

- **`stack.ts`** starts the acceptance environment (disposable PostgreSQL in Docker, local sign-in, `next dev`). It runs a fixture scan into a seeded merchant and adds the states that ordinary fixtures never reach: several versions, a failed run, an urgent action, missing inputs, unread notifications. Then it signs in an owner, a manager and a viewer.
- **`states.ts`** lists 39 states. Some click into tabs or open every disclosure. Some go offline, fake a version conflict, or use up the delivery allowance with SQL and put it back afterwards.
- **`capture.ts`** takes full-page screenshots in en and zh-HK, at 390 and 1440 px, in light and dark: 284 captures.
- **`compare.ts`** compares two runs pixel by pixel.

**Noise floor:** two runs with no change give zero differing pixels, with one exception. Text inside the fixed, blurred approval bar on action detail can differ by about 1,600 glyph pixels between runs. Every step below showed only that difference, in 3 to 6 captures, and the computed styles of every element on those states were unchanged.

## Measures

| Check | Phase 7 | Phase 8 |
|---|---|---|
| Legacy stylesheet size | 157.5 KB, 1,501 rules | **84.2 KB, 720 rules** (−47 %) |
| `!important` in legacy | 68 | 36 (33 more now sit in the screen files) |
| Literal colours in legacy | 161 | 86 (76 more now sit in the screen files) |
| Visual check per step | — | 268–284 captures identical apart from the approval-bar noise |

The rules moved; they were not deleted. Total CSS is about the same size. What changed is that every workspace screen now has its styles in one file that wins over legacy, so later restyling or deletion is a change to that file alone.

## Verification

All checks ran one after another on the final commit.

| Gate | Result |
|---|---|
| `corepack pnpm typecheck` | pass |
| `corepack pnpm lint` | 0 errors, 10 warnings (unchanged) |
| `corepack pnpm test` | 6,045 + 62 root tests. Packages: scoring 183, region 23, contracts 20, scan-engine 299. All pass. |
| `corepack pnpm build` | pass. The built CSS has `@layer pages{@layer screens{…}}`. |
| `test:js-budget`, `test:secret-boundary`, `test:no-supabase`, `test:no-self-service-claim` | pass |

`e2e` and `e2e:acceptance` run in CI.

## Deviations from the plan

1. **No consolidation or tokenising yet.** The moved rules keep their legacy duplicates (for example `.offline-banner` is defined three times) and their literal colours. Merging them or swapping in tokens changes which declaration wins, so each needs its own verification run. That is cheap now that every screen has its own file.
2. **`!important` is 36 in legacy instead of falling to near zero.** The rest belong to public pages and shared classes, which stay for a later phase.
3. **The capture tool needs Docker and about 40 minutes per full verification.** The dev server can also miss git's rewrites; the README explains how to check.

## Open questions

1. Should the next phase move the public pages the same way, or consolidate and tokenise the workspace screen files first?
2. Should the shared classes (`eyebrow`, `section-card`, `limitation-note` and the rest) move into the component layer as one shared file? They are the main part of what remains in legacy.
