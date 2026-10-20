# Phase 7 report: repo hygiene and finishing

Date: 2026-10-20 · Branch: `ux/phase-7-hygiene`, cut from `ux/phase-6-quality` · Not pushed.

Decisions taken on 2026-10-20 (all recommendations accepted):

| # | Decision |
|---|---|
| 1 | Move the tracked `.superpowers/` folder to `docs/archive/superpowers/`. |
| 2 | Move the access-request strings into a shared dictionary that the owner and ops views both read. |
| 3 | In CLAUDE.md, add the decisions and a short "current interface" section. The prototype sections stay as history. |
| 4 | Leave the seven Playwright configs at the root. |
| 5 | The paid plan is the **Growth plan**: 增長方案 in zh-HK, 成長方案 in zh-TW. It replaces "Growth Workspace", which read like a second product name. |

There are no changes to API contracts, migrations, `packages/*`, auth logic or data access.

## What changed

| Commit | Result |
|---|---|
| `a37061c` | **Rename finished** (details below). |
| `72bc870` | **Sitemap:** one entry per page per locale, each with all language versions and `x-default`. The launch check's sitemap rule, failing since Phase 1, now passes. |
| `d435b99` | **Lint:** `_`-prefixed bindings count as intentionally unused, and local agent worktrees are ignored. Warnings go from 40 to 10: nine are in the vendored packages, and one is a deliberate `<img>` for signed asset URLs. |
| `3dfa2e8`, `c80d949` | **`.superpowers/` archived** to `docs/archive/superpowers/`, with a README that maps the old paths cited in older reports. `.superpowers/` is now gitignored for local output, and `docs/` stays out of typecheck and Vitest. |
| `ba3506f` | **27 unused shadcn components removed** (2,892 lines). knip found them and a search confirmed that nothing imports them. knip found no unused dependencies. |
| `1c83278`–`f01aed7` | **Strings** (details below). |
| `d6998f4` | **README** rewritten for Kinnso OS: what it does, where code and docs live, and every check command. The setup, Windows and database notes are kept. Also adds `docs/ux/README.md`, an index of the redesign docs. |
| `97ce0ac` | **CLAUDE.md:** a "Current interface" section, plus the Phase 4–7 decisions in the log. |

### Rename

- **Plan name:** "Growth Workspace" / 增長工作台 / 成長工作台 become the Growth plan / 增長方案 / 成長方案 wherever the plan appears:
  - the pricing and SEO copy
  - billing and upgrade prompts
  - the rescan notice
- **Multi-location plan:** now 多地點方案.
- **A zh-TW fix:** the zh-TW upgrade prompt showed the Hong Kong wording; it now uses the Taiwan wording.
- **Product name:** the report page title, the WhatsApp hand-off message, the demo assistant's source line and the demo activity log now say Kinnso OS.
- **Removed:** the old prototype `SignInPage` and `SelectWorkspacePage` in `public-pages.tsx`. Nothing used them, and they still offered "Sign in with ChatGPT".
- **Guard:** `tests/product-name.test.ts` fails if an old product or plan name returns to user-facing source.

### Strings

Every remaining inline language choice in owner and public UI code now reads from `lib/copy`. The new dictionaries, each with a parity test:

| Dictionary | Covers |
|---|---|
| `accessRequest` | The access-request form and status, shared with ops |
| `assistantSheet` | The Ask Kinnso sheet, run status, evidence card and draft preview |
| `demoWorkspace` | The public demo workspace |
| `pricingPage` | Plan cards, banner and FAQ |
| `product` | Badges, score dial, loop ribbon and language selector |
| `actionTabs` | The action detail's Workflow and Evidence tabs |
| `workspaceLabels` | Text built by helpers such as guardrail text, comparison reasons, effort and audit labels |

These helpers now take a locale instead of an `isChinese` flag.

- **Count:** `isChinese ? …` in UI code went from 119 to 0. The only ones left build the fixed Kam Man House sample (`lib/funnel/sample-report.ts`, `lib/demo-data.ts`), which is data rather than interface.
- **Rendered output is unchanged:** 1,462 captures (every rendering test's output, plus three-locale captures of each moved component and the open Ask Kinnso sheet on all ten surfaces) are identical before and after. The comparison ignored React-generated ids.

## Legacy CSS: measured, not pruned

I measured legacy CSS use in Chrome over 209 page loads:
- **Pages:** every public page and every workspace page.
- **Roles:** owner, manager and viewer.
- **Viewports and themes:** 390 and 1440 px, light and dark.
- **Languages:** en, zh-HK and zh-TW.
- **States opened on each page:** disclosures, tabs, menus, popovers, dialogs and sheets.

**Result:** 993 of the 1,354 legacy rules were used.

I then counted the unused rules a prune could still remove. A rule only counted if it:
- has no state selector such as `:hover`, `[data-state]` or `[aria-*]`
- is not inside print, forced-colours or reduced-motion media
- names no class used by ops or print markup

288 rules remained.

**I removed none of them.** Spot checks show they belong to live components in states the fixture data never produces:

| Class | State it styles |
|---|---|
| `.offline-banner` | No network |
| `.conflict-state` | Version conflict |
| `.notification-dot` | Unread notifications |
| `.run-failed` | Failed run |
| `.version-list` | Several versions |
| `.priority-urgent` | Urgent priority |
| `.has-env-bar` | Demo environment bar |

Coverage can't tell "never used" from "used when the data is different". Deleting these rules would silently break those states. The way to shrink the legacy layer is to move those components onto the new styles in `pages`, one screen at a time, with that screen's states in the fixtures.

## Measures

| Check | Result |
|---|---|
| `launch:check` against the local server | **11 of 11 pass**, including the sitemap. |
| Captures: 30 pages × en and zh-HK × 390 and 1440 px (120) | 0 axe violations, no horizontal overflow, CLS ≤ 0.001, one `h1` each. The only console errors are the expected 404s on the not-found page. |
| Lint | 0 errors. Warnings 40 → 10. |
| Code removed | 27 unused UI components and the dead prototype sign-in and select-workspace pages. Overall the phase is 1,963 lines added and 3,358 removed. |

Captures:
- [Pricing, zh-HK 1440](phase-7/pricing-zh-HK-1440.jpg)
- [Pricing, en 390](phase-7/pricing-en-390.jpg)

## Verification

Gate results are added when the sequential run finishes.

`e2e` and `e2e:acceptance` need Docker, so they were not run locally; CI runs both.

## Deviations from the plan

1. **No legacy CSS pruned from coverage.** The measurement worked, but every candidate rule styles a live state the fixtures don't reach (see above).
2. **`!important` count unchanged (46).** Removing them is only safe screen by screen, alongside the move to the new styles.
3. **`lib/llm-translate.ts` and the `lib/db/schema/*` files stay.** knip reports them as unused. The schema files are read by the type generator rather than imported, and the translate helper is a ported upstream helper that CLAUDE.md lists for reuse.

## Open questions

1. **Line breaks in Chinese headings.** Big Chinese headings use `word-break: keep-all` so that a word such as 循環 isn't split across lines (Phase 1). When a whole clause is wider than the heading, the browser has to break it somewhere, and it can push the closing 。 onto a line of its own. You can see this on the pricing page at 1440 px ([capture](phase-7/pricing-zh-HK-1440.jpg)); it was already there in Phase 6. Two options:
   - **Recommended:** use normal CJK breaking for zh headings, keeping the strict line-break rules. Punctuation then never starts a line, but a word can be split across two lines, which is common in Chinese typesetting.
   - Keep `keep-all` and shorten or rewrite the headings that are too long.
2. **Moving legacy screens onto the new styles:** should it be the next piece of work, and in which order? I'd start with action detail and Today, which use the most legacy rules.
