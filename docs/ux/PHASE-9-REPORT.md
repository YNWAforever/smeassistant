# Phase 9 report: tidy the workspace screen files

Date: 2026-10-21 · Branch: `ux/phase-9-screen-tidy`, cut from `ux/phase-8-legacy-migration` · Not pushed.

Decisions taken on 2026-10-21 (all recommendations accepted):

| # | Decision |
|---|---|
| 1 | Colours: swap to a theme token only where it is invisible in light mode (delta E under 2). List every other literal colour on a swatch sheet for a decision. |
| 2 | Push the Phase 8 branch and open its PR once [YNWAforever/smeassistant#101](https://github.com/YNWAforever/smeassistant/pull/101) merges, so that PR shows only Phase 8. It has not merged yet, so nothing is pushed. |
| 3 | Start with `today.css` and `shell.css`, then the other screen files. |

There are no changes to API contracts, migrations, `packages/*`, auth logic, data access or copy.

## What changed

| Commit | Result |
|---|---|
| `23be561` | **Duplicate selectors merged.** Where a selector appears more than once in the same media context, earlier declarations that a later one redeclares are dropped, and the rest move into the last rule unless a rule in between touches the same property family. 95 declarations and 26 empty rules removed, 11 moved, 123 left in place where moving could change which rule wins. |
| `3e8894f` | **`!important` cut from 32 to 11.** 21 existed only to beat legacy, which the screens sub-layer now does by itself. Three are still needed (the sidebar border, the month-metrics dividers, `.workspace-root small`). Eight sit in hover, focus and demo-only contexts the check cannot reach and stay. |
| `35403f9` | **36 dead declarations removed.** Each was always beaten by the same selector prefixed with `.workspace-shell` or `.workspace-root`, which wrap every workspace page. Most were the old dark sidebar and top bar colours from before the redesign. |
| `3299228` | **Dark-mode fix: dark text on orange.** See below. |
| `cf001c3` | **Two near-identical colours become tokens** (delta E 0.63 and 1.57). |
| `7e5e573` | **Capture tool:** the Ask Kinnso sheet is captured only once its question groups have finished loading. |

### Dark mode

The month-metrics icons on Today, the agent strip's current step and the count on the active Actions tab put `--ink` text on the orange brand fill. In dark mode `--ink` turns light, so they showed white on orange, which the brand rules out. They now use `--on-brand`, which equals `--ink` in light mode and stays dark in dark mode.

[Before](phase-9/orange-icons-dark-before.png) · [after](phase-9/orange-icons-dark-after.png)

### Colour decisions waiting for you

The swatch sheet lists the 56 literal colour uses left after the dead ones went: [Workspace colour audit](https://claude.ai/artifact/A9MAEXVNdUUxmz43kMgTAs) (private to you).

| Group | Uses | What the sheet recommends |
|---|---|---|
| Swapped | 2 | Done in `cf001c3`. |
| Your call | 30 | A suggestion per row. Two brief-card borders (delta E 2.6 from `--line`) are worth swapping. The rest sit on dark surfaces, are shadows, or are white text on a fill that stays dark in both themes, so I suggest keeping them. |
| Leave untouched | 24 | Never seen on the captured pages, but not proven unused. |

## How each step was checked

Every step was checked twice:

1. **Computed-style diff:** every element's computed style on 6 to 13 states, compared with the change applied and stashed.
2. **Pixel comparison:** the 284-capture comparison in `test/visual/`.

The final run compared the finished branch with the run after `35403f9`. Of the 284 captures, 26 differ, all expected:

| Difference | Captures |
|---|---|
| The dark on-orange fix on Today and the Actions tabs | 18 |
| The current-step ring moving from `#1a1a1d` to `--on-brand` in light mode, 128 px | 4 |
| Glyph anti-aliasing in the fixed approval bar, which varies between identical runs | 4 |

Two things went wrong along the way and were caught:

- **Ask Kinnso sheet:** one capture differed because the sheet's second question group loaded after the shot. Computed styles were identical, so the tool now waits for the sheet to settle.
- **Priority card circle:** I first read a `content: none` rule as making the card's decorative circle dead and removed both rules. The rule only applies in the daily-focus layout, and my edit also damaged the next selector. The check caught it at once, and the commit keeps the circle.

## Measures

| Check | End of Phase 8 | Phase 9 |
|---|---|---|
| Screen files | 79.8 KB, 849 rules, 2,448 declarations | **75.6 KB, 814 rules, 2,317 declarations** |
| Duplicate selectors | 100 | 78 |
| `!important` | 33 | 11 |
| Literal colours | 76 | 54 |

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

1. **78 duplicate selectors remain.** Merging them could change which rule wins, so they stay where they are. Each could be done by hand with a check, but the gain is small.
2. **Only two colours became tokens.** That is what the approved threshold allows. The other 30 visible uses need your call on the swatch sheet.

## Open questions

1. Which of the 30 "Your call" colours should become tokens? Answering by row group is enough. For example: "swap the two brief-card borders, keep the rest".
2. Phase 8's PR is still waiting for #101 to merge. Merge #101 first, or open Phase 8 now against `ux/phase-7-hygiene`?
