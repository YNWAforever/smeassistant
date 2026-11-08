# Phase 10 report: shared classes and public pages off the legacy stylesheet

Date: 2026-10-21 · Branch: `ux/phase-10-shared-classes`, cut from `main` at `01c03a6` · Not pushed.

Decisions taken on 2026-10-21 (all recommendations accepted):

| # | Decision |
|---|---|
| 1 | Scope: the shared classes and the public pages in one phase. |
| 2 | The shared classes go in a `shared` sub-layer at the start of `pages`, before `screens`, not in `components`. Screen rules keep winning over them, and nothing shifts. |
| 3 | Light mode stays pixel-identical. Public pages are captured in light only, since dark mode exists only in the workspace. |

There are no changes to API contracts, migrations, `packages/*`, auth logic, data access or copy.

## What changed

| Commit | Result |
|---|---|
| `e29933e` | **Screenshot tool covers the public site.** 22 new states, signed out and in light: landing, scan form (empty, error, manual entry), scanning (running and failed, from stubbed status requests under a fixed clock), report preview and member view, unlock (empty and error), sample report, demo workspace, pricing, methodology, trust, privacy, terms, unsubscribe, sign-in, onboarding, select workspace and 404. 88 captures; two runs with no change give identical images. |
| `c606dd2` | **Shared and public styles leave legacy.** |

### Where the rules went

Inside `pages`, the sub-layers now run in this order, so each beats the one before it and all of them beat `legacy`:

| Sub-layer | File | Holds |
|---|---|---|
| `shared` | `app/styles/shared.css` | 105 rules for classes both sides use: eyebrows, section cards, limitation notes, field stacks, empty states, consent rows, the brand lockup, and the capability, provider, fact-type and priority badges. |
| `public` | `app/styles/public/*.css` | 553 rules in 9 files: `chrome` (header, menu, footer, page intro), `landing`, `scan` (form and scanning), `report`, `unlock`, `content` (pricing, legal, 404), `auth` (onboarding, select workspace), `demo`, and `editorial`. |
| `screens` | `app/styles/screens/*.css` | The workspace screens, as before. |

`editorial.css` holds the site-wide `.public-site …` restyle and is imported after the page files, because in legacy it came after them. The unsubscribe page's rules sit at its end for the same reason.

### Values kept where they were

Moving rules into a later layer changes which rule wins wherever a legacy rule used to win on order or specificity. The check found three such places:

| Where | What happened | Now |
|---|---|---|
| "Free scan" header button and the report's orange buttons | Their `!important` colours used to beat the default button's `!important` colour in the same layer. In a later layer an `!important` rule loses to an earlier layer's, so the text turned white on orange. | These two rules stay in legacy, with a comment saying why. |
| Language selector background | Its `background: transparent` always lost to the select-trigger background. In the new layer it would have won. | Dropped. |
| Report and demo headings, unsubscribe heading | Equal-specificity rules changed order between files. | Fixed by the `editorial.css` ordering above. |

## How it was checked

1. **Computed-style diff:** every element's computed style on 20 public and workspace states, with the change applied and stashed. It found the three cases above; after the fixes, every state shows no differences apart from `<script>` tags.
2. **Pixel comparison:** all 372 captures (284 workspace, 88 public) before and after. 369 are identical. Two differ only by the known glyph noise in the approval bar. One phone-width dark conflict capture differed by page scroll position; three new captures with the change applied are identical to the baseline.

The first full run, with only the shared classes moved, showed why the shared move could not ship alone. Rules on public pages such as the round brand mark, the featured pricing card and the legal cards used to beat the shared classes by specificity, and they lost once the shared classes moved up a layer. Moving the public pages in the same commit puts them back on top, so the two steps landed as one commit rather than two.

## Measures

| Check | Phase 9 | Phase 10 |
|---|---|---|
| Legacy stylesheet | 81.5 KB, 727 rules | **28.9 KB, 135 rules** |
| `!important` in legacy | 36 | 20 |
| Literal colours in legacy | 82 | 17 |
| Shared file | — | 9.8 KB, 105 rules |
| Public files | — | 52.9 KB, 553 rules |
| Visual check | 284 captures | 372 captures, identical apart from known noise |

## What is left in legacy

| Group | Size | Notes |
|---|---|---|
| Base element and attribute rules | ~3 KB | `body`, headings, focus rings, `data-slot` button, select and radio rules, `[data-reveal]`, selection colour. These belong in `base` or `components`; moving them changes what wins everywhere, so they are a phase of their own. |
| Kept on purpose | ~1 KB | The two orange-button rules described above. |
| Classes no code uses | ~7 KB | `comparison-*`, `auth-*`, `workspace-choice-grid`, `priority-report-grid`, `priority-rank`, `priority-card-head`, `permission-note`, `fact-definition-list`, `is-sme`, `.button`, `.badge`. No component, page or library file names them. |
| Mixed rules | small | A few selectors that combine a shared class with an unused one. |

Ops pages (`/ops/*`) are not in the screenshot tool, because the acceptance environment has no operator account. Their rules use shared classes (`limitation-note`, `field-stack`), which moved; nothing ops-only was moved.

## Verification

All checks ran one after another on the final commit.

| Gate | Result |
|---|---|
| `corepack pnpm typecheck` | pass |
| `corepack pnpm lint` | 0 errors, 10 warnings (unchanged) |
| `corepack pnpm test` | 6,045 + 62 root tests. Packages: scoring 183, region 23, contracts 20, scan-engine 299. All pass. |
| `corepack pnpm build` | pass. The built CSS has `@layer pages{@layer shared…` and `@layer public`. |
| `test:js-budget`, `test:secret-boundary`, `test:no-supabase`, `test:no-self-service-claim` | pass |

`e2e` and `e2e:acceptance` run in CI.

## Deviations from the plan

1. **The shared classes and public pages landed in one commit, not two.** Alone, the shared move changed public pages (see "How it was checked"); together they are pixel-identical.
2. **Two button rules stay in legacy** because of how `!important` works across layers.
3. **Legacy is not empty.** Base rules and unused classes remain, as listed above.

## Open questions

1. Delete the ~7 KB of unused classes listed above? Nothing renders them; the check would confirm no capture changes.
2. Move the base element and attribute rules into `base`/`components` next? This is the last real content of legacy, and it changes what wins site-wide, so it would get the same full check.
