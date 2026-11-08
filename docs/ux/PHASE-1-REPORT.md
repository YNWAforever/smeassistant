# Phase 1 report: design system

Date: 2026-10-19 · Branch: `ux/phase-1-design-system`, cut from `ux/guardrail-fixes` (PR #94).

Phase 0 (the audit, the target information architecture and the screenshots) is on `claude/optimistic-meitner-r5ntsa`. This phase follows the plan approved on 2026-10-19 and the decisions taken that day:

| Decision | Choice |
|---|---|
| Brand colour | Kinnso orange |
| Dark mode | Workspace only; light by default, with a Light / Dark / Match device switch (decided 2026-10-20) |
| Fonts | System fonts only (Geist removed after review) |
| Name | Kinnso OS |
| Ownership claim | OAuth-verified claim on |

## What changed

| Step | Commits | Result |
|---|---|---|
| 1.0 | `a4ce2ae` | CLAUDE.md amendment (2026-10-19) authorising the restyle and the new information architecture, plus a decisions-log row. Guardrails are unchanged. |
| 1.2–1.3 | `8fd239f` | `app/styles/tokens.css` is now the one token source: colour, type, space, radius, elevation, motion and z-index, with light values and workspace-dark values. `app/globals.css` fixes the cascade-layer order: `theme, tokens, base, components, utilities, legacy, i18n, a11y`. The four duplicated `:root` sets and the `.public-site` / `.workspace-shell` remaps are gone, so pop-up overlays now get Kinnso tokens too. `--teal` and `--lime` (orange in all but name) are kept only as compatibility aliases. |
| 1.4 | `dca541a`, `e837739`, `3fabf1d` | **Removed:** 541 unused legacy rules (156 class names). **Floors:** a 12 px minimum font size (206 declarations raised); 16 width breakpoints collapsed to 639/767/1023/1279 plus one 380 px header exception. **Tokens:** about 330 hard-coded colours replaced by semantic tokens, so the workspace can go dark. Light mode was verified pixel-stable after each step. |
| 1.5 | `e837739` | **Chinese typography (`i18n` layer):** strict line breaking (kinsoku), body line height 1.75, heading line height ≥ 1.25, word-kept balanced headings. **Fonts:** a per-locale system stack (PingFang HK / TC → Microsoft JhengHei → Noto Sans HK / TC). **Touch and focus (`a11y` layer):** 44 px touch targets on touch screens, and a focus ring that survives forced-colours mode. |
| Dark mode | `17c9bcc`, follow-up | **Behaviour:** light by default; a Light / Dark / Match device switch in the workspace top bar stores the owner's choice, and only Match device follows the OS. A saved choice is kept in a cookie and rendered by the server, so there is no light flash and no inline script (fixed after review: the first version used a pre-paint script, which caused a hydration mismatch). The `html[data-theme]` attribute is removed when leaving the workspace, so public pages stay light. **Shared components:** toasts follow the page theme, and Tailwind's `dark:` variant now keys off the attribute rather than the OS setting. **Dependencies:** `next-themes` and the unused Inter font package are removed. |
| 1.6 | `4ef7546`, `de27304` | **Kit (`components/kinnso/`):** PageHeader, StatCard, ScoreDial, CoverageMeter, EvidenceBadge, FactTypeBadge plus a legend, ActionCard, ApprovalBar, VersionDiff, EmptyState, ErrorState, PartialDataState, PermissionDenied, DataTable, ConfirmDialog, CommandPalette and skeletons. **Guardrails enforced by the component inputs:** a stat card needs a source and an observed date; null shows "Unknown" (never 0); a change figure shows only for a comparable pair; a withheld score shows "No score yet". **Strings:** `lib/copy-ui.ts` in three locales. **Command palette:** built on Radix Dialog with an ARIA combobox; no `cmdk`. |
| 1.7 | `730c01c` | `product-ui.tsx` (328 lines) is split into `components/product/*`, with a re-export barrel so no importers change. The action-detail helpers move out to their own file. See the deviations below. |
| 1.8 | `b86c0e8` | `/[locale]/dev/design-system` shows every token and component, with dark-preview, reduced-motion and locale switches. A test checks that it answers 404 in production, is noindex, and is absent from the sitemap. Verified against `next start`: the page returns 404 while `/en/methodology` returns 200. |
| Accessibility | `454da0f` | The last contrast findings are fixed: workspace breadcrumb, eyebrows on dark panels, and the landing proof chip. The table scroll container is now keyboard-focusable. |

## Measures

| | Phase 0 | Phase 1 |
|---|---|---|
| Hand-written CSS | 288 KB, 5 global files, no `@layer` | 217 KB, 1 entry + 5 legacy + 4 new files, 8 ordered layers |
| Duplicated `:root` token sets | 4 | 1 |
| Distinct hex colours in CSS | 423 | 100 (all left in legacy) |
| `!important` | 120 | 87 |
| Unused class names | ~159 | 0 by the same scan |
| Font declarations under 12 px | 106 (≤ 9 px), 270 (≤ 11 px) | 0 |
| Breakpoints | 16 | 4 + 1 narrow-phone exception |
| axe-core violations, 31 page states × 390/1440 × 3 locales | 108 nodes (105 colour contrast) | **0** |
| Horizontal overflow at 390/768/1024/1440 | none | none |
| Dark mode | none (shadcn `dark:` classes leaked under OS dark) | workspace only, light by default + switch |

## Before and after

Captures come from the local fixture stack at 390 and 1440 px. Every step was diffed against a PNG baseline taken before any CSS change.

| Page | Mobile | Desktop |
|---|---|---|
| Landing | [compare/landing-zh-HK-mobile.jpg](phase-1/compare/landing-zh-HK-mobile.jpg) | [desktop](phase-1/compare/landing-zh-HK-desktop.jpg) |
| Scan | [mobile](phase-1/compare/scan-zh-HK-mobile.jpg) | [desktop](phase-1/compare/scan-zh-HK-desktop.jpg) |
| Report | [mobile](phase-1/compare/report-full-zh-HK-mobile.jpg) | [desktop](phase-1/compare/report-full-zh-HK-desktop.jpg) |
| Methodology | [mobile](phase-1/compare/methodology-zh-HK-mobile.jpg) | [desktop](phase-1/compare/methodology-zh-HK-desktop.jpg) |
| Today | [mobile](phase-1/compare/today-zh-HK-mobile.jpg) | [desktop](phase-1/compare/today-zh-HK-desktop.jpg) |
| Actions | [mobile](phase-1/compare/actions-zh-HK-mobile.jpg) | [desktop](phase-1/compare/actions-zh-HK-desktop.jpg) |
| Action detail | [mobile](phase-1/compare/action-detail-zh-HK-mobile.jpg) | [desktop](phase-1/compare/action-detail-zh-HK-desktop.jpg) |

- **Dark workspace:** captured with dark selected, in [phase-1/dark/](phase-1/dark/) (Today, Actions, Action detail and Brand at 390 and 1440).
- **Design-system gallery:** [light](phase-1/design-system-en.jpg) and [dark](phase-1/design-system-zh-HK-dark.jpg).

### Intended visual changes

- **Text size:** all text is at least 12 px, so chips, eyebrows, the mobile bottom-nav labels (7 → 12 px) and meta lines are larger. Some pages grow taller; for example, Methodology at 390 px grows from 2,871 px to 3,084 px.
- **Chinese headings and body:** headings no longer break inside a word (for example, 證據 used to split across lines). Line height is looser.
- **Tone shifts:** small shifts where four overlapping token sets became one. Workspace shadows now match the public site, muted text is darker (AA), and the focus ring is a darker orange (3:1).

### Unintended changes found and fixed during the phase

- Mapping the 380 px rule to 639 px hid the mobile header wordmark. That rule is restored at 380 px.
- The breadcrumb grey and the dark-panel eyebrows failed contrast after tokenising. Both are fixed in `454da0f`.

## Verification

All gates ran sequentially on the final head.

| Gate | Result |
|---|---|
| `corepack pnpm typecheck` | pass (root and 4 packages) |
| `corepack pnpm lint` | 0 errors, 40 warnings (unchanged from `main`) |
| `corepack pnpm test` | 5,807 + 62 root tests; scoring 183, region 23, contracts 20, scan-engine 299. All pass. |
| `corepack pnpm build` | pass |
| `test:secret-boundary` | pass (91 public artifacts) |
| `test:no-supabase`, `test:no-self-service-claim` | pass |
| `launch:check --origin http://localhost:3200` (local fixture) | 10 of 11 pass. **Sitemap fails:** each page appears only under its first locale. `app/sitemap.ts` is unchanged since PR #44, so this fails on `main` too. It is Phase 7 scope (sitemap and hreflang). |
| `corepack pnpm e2e` | **Not run.** The fixture requires Docker, which this environment does not have. CI will run it. |

New tests:
- `lib/theme.test.ts`
- `components/theme/workspace-theme.test.tsx`
- `lib/text-diff.test.ts`
- `components/kinnso/kinnso.test.tsx` (guardrail behaviour of the kit)
- `app/[locale]/dev/design-system/page.test.tsx`

## Deviations from the approved plan

1. **Splitting oversized files (1.7)** was done only for `product-ui.tsx` and the action-detail helpers.
   - The 860-line action-detail editor, `landing-page.tsx`, `scan-page.tsx`, `scanning-page.tsx` and `assistant-sheet.tsx` are each rewritten in a later phase: Phase 2 (landing), Phase 3 (scan and scanning) and Phase 4 (action side panel and assistant drawer).
   - Splitting them now would be thrown away, and the editor's sections all share one block of state, so a "pure move" is not possible without a refactor.
   - **Decided 2026-10-20:** each file is split in the phase that rewrites it, under 300 lines per file.
2. **The legacy layer sits after `utilities`, not before.** Tailwind utilities therefore do not yet override legacy class rules. Putting legacy first would restyle every shadcn button and many cards at once. New components use new class names, so they are unaffected. Each page leaves the legacy layer when it is redesigned.
3. **Stylesheets are not physically merged** into `base/components`. The five legacy files stay as ordered files in one layer, keeping their git history. Merging text gives no runtime benefit, and the rules disappear page by page in Phases 2–4.
4. **There are four breakpoints, not three:** Tailwind's 639/767/1023/1279, plus a 380 px exception for the header wordmark.
5. **AppShell is deferred to Phase 4,** where the navigation changes. Building it now would mean building it twice.
6. **Pages do not use the new kit yet.** The current pages still render the old ScoreDial and FactType. Adoption happens in Phases 2–4.
7. **The design-system page chrome is English only.** It is an internal page, like `/ops`. The components on it render in the URL's locale.

## Risks

- **Dark mode coverage.** Today, Actions, Action detail, Insights and Brand were checked. Less common workspace states (dialogs, the GBP publish card, offers, team and billing tables) still contain some of the 100 literal colours left in legacy CSS. Because the workspace is light by default, only owners who choose Dark or Match device see these states until Phase 4 re-checks them.
- **Taller pages.** The type floor and Chinese line height make pages taller. No horizontal overflow and no clipped text were found in the captures, but fixed-height containers in rarely seen states have not all been visited.
- **Existing caption overlap.** The landing hero photo caption overlaps the hero text at 390 px. This is in the baseline too; the hero is rebuilt in Phase 2.

## Resolved after review (2026-10-20)

1. **Dark mode rollout:** light by default. Dark and Match device are explicit choices in the switch, and the choice is stored.
2. **Oversized files:** split in the phase that rewrites each one (Phase 2 landing; Phase 3 scan and scanning; Phase 4 action editor and assistant).

## Open questions

Still open from Phase 0; these decide Phase 4:
- Assistant name
- Whether bulk approve is allowed
- Fix Pack drafts
- Merging Create, Offers and Starter pack
