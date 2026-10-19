# CSS architecture audit — `/home/user/smeassistant`

Read-only audit, 2026-10-19. Method: every stylesheet parsed with PostCSS 8.5 (repo copy). Selectors, custom properties, media queries and declarations were extracted from the parse. Class names were then checked against all `.ts`/`.tsx` under `app/ components/ lib/ hooks/`. All line numbers are 1-based. `globals.css` is mostly minified: lines 16–38 and 73–93 are single lines of up to 7.5 KB, so a `globals.css:NN` reference names a whole block of rules.

## 0. Inventory and cascade order

`app/layout.tsx:3-9` imports the files in this order. Later files win at equal specificity.

| # | File | Lines | Bytes | ~Rules | Purpose |
|---|---|---|---|---|---|
| 0 | `@fontsource-variable/inter/opsz.css`, `@fontsource-variable/geist/wght.css` | – | – | – | Self-hosted Latin variable fonts. No CJK web font is loaded. |
| 1 | `app/globals.css` | 93 | 75.9 KB | 938 | Tailwind v4 entry (`@import "tailwindcss" source(none)` plus 4 `@source` entries, `tw-animate-css`, vendor). Holds the original prototype component CSS (minified), the first `:root` token set, `@theme` and `@theme inline`. |
| 1a | `vendor/shadcn-tailwind-4.13.0.css` (imported at `globals.css:7`) | 629 | 16.0 KB | 100 | shadcn custom variants (`data-open` etc.), accordion/scroll-fade/shimmer keyframes and utilities. No colour tokens. |
| 2 | `app/responsive.css` | 63 | 3.3 KB | 55 | Sticky offsets for `.has-env-bar`, plus breakpoint overrides (1180/900/767/430). |
| 3 | `app/ramp-refresh.css` | 3,225 | 72.8 KB | 663 | "2026 visual refresh". Second full `:root` token set (`:7-57`) and a restyle of most prototype components. |
| 4 | `app/polish.css` | 1,520 | 58.4 KB | 470 | "Craft layer". Typography (`--font-sans`, `:lang(zh)`), motion, contrast fixes, skip link, print. |
| 5 | `app/editorial.css` | 2,193 | 45.8 KB | 333 | Kinnso redesign (2026-10-14). `ed-*` namespace, `--ed-*` tokens, and remaps of the legacy variables on `.public-site` (`:1940`, `:1969`, `:2022`) and `.workspace-shell` (`:2043`). |
| – | `components/auth/sign-in.module.css` | 27 | 3.3 KB | 28 | CSS module (sign-in flow) |
| – | `components/report/dashboard.module.css` | 60 | 10.1 KB | 121 | CSS module (report dashboard, 7 importers) |
| – | `components/report/evidence-gallery.module.css` | 21 | 2.3 KB | 26 | CSS module |

**Total:** 7,831 lines, about 288 KB of hand-written CSS.

**Layering:** none of the app files uses `@layer` (0 occurrences). In Tailwind v4, `@theme` variables and utilities are emitted into `@layer theme` and `@layer utilities`, and all legacy component CSS is unlayered. Two things follow:
- Every unlayered `:root` block in steps 1–5 beats the `@theme` values.
- Legacy class rules beat any Tailwind utility placed on the same element, whatever the specificity. A `className="p-4"` cannot override `.section-card{padding:24px}`.

## 1. Design tokens: duplication and conflicts

### 1.1 Where tokens are defined

| Location | Scope | Tokens |
|---|---|---|
| `globals.css:10-13` | `@theme` | `--font-sans-hk`, `--font-sans-tw`. Neither is referenced anywhere in TS/TSX or CSS, so both are dead. |
| `globals.css:44-57` | `:root` | 43 tokens: shadcn set, plus `--ink --soft --paper --canvas --teal* --amber* --red* --blue* --shadow-* --content` |
| `globals.css:58-72` | `@theme inline` | `--color-*` → `var(--*)`, radii, `--font-sans`, `--font-mono` |
| `ramp-refresh.css:7-57` | `:root` | The same 43 tokens again, every one with a different value, plus `--lime* --peach --lilac --sky` |
| `polish.css:12-25` | `:root`, `:root:lang(zh-HK)` | `--font-latin`, `--font-sans` (twice), `--font-mono: var(--font-sans)`, `--ease-*` |
| `editorial.css:9-40` | `:root` | 30 `--ed-*` tokens, all orange/peach/ink in oklch |
| `editorial.css:1940-1972, 2022-2028` | `.public-site` | Remaps 26 legacy tokens onto `--ed-*` |
| `editorial.css:2043-2060` | `.workspace-shell` | Remaps sidebar/lime/teal/primary/ring onto `--ed-*` |
| `editorial.css:2183-2193` | `:is(.public-site,.workspace-shell) :is(.delta-up, .score-dial, …)` | Sets `--teal*` back to a status green (oklch 155°) |

**49 custom properties are defined in more than one file. 23 of them are defined in 3 or 4 places.** The worst cases:

| Token | globals `:root` | ramp `:root` | editorial override(s) |
|---|---|---|---|
| `--primary` | `#383840` (:46) | `#1a1a1d` (:14) | `var(--ed-ink)` on `.public-site` (:2023) and `.workspace-shell` (:2058) |
| `--ring` | `#383840` | `#78512a` | `var(--ed-orange)` (:1953, :2060) |
| `--teal` | `#383840` | `#714518` (brown) | `--ed-orange-700` (:1945, :2055), then `oklch(50% .12 155)` green (:2190) |
| `--sidebar` | `#27272b` | `#1c1c20` | `#ffffff` (:2044) |
| `--radius` | `.7rem` | `1rem` | `--ed-radius 1.25rem` (separate) |
| `--content` | `1240px` | `1320px` | `--ed-max 1200px` (separate) |
| `--canvas`/`--background` | `#f5f3ed` | `#f8f4f1` | `--ed-bg #fffaf5` |
| `--font-sans` | `@theme inline` "Inter, Aptos, Noto Sans TC, PingFang TC…" (:70) | – | polish `:13` (Inter Variable + PingFang TC), polish `:24` (zh-HK variant), editorial `--ed-sans` (Geist Variable) |
| `--font-mono` | SFMono/Consolas (:71) | – | polish `:19` sets it to `var(--font-sans)`, so `--font-mono` is no longer monospace |

Every globals `:root` value is shadowed by ramp-refresh `:root` and can never take effect, so `globals.css:44-57` is fully dead.

**Theme-boundary gap:** the remaps are scoped to `.public-site` and `.workspace-shell`. Radix portals (`components/ui/sheet.tsx:28` `SheetPrimitive.Portal`, and likewise dialog, select and popover) render into `<body>`, outside both scopes. Overlays therefore get the ramp-refresh `:root` values (`--ring #78512a`, `--radius 1rem`, `--sidebar #1c1c20`) rather than the Kinnso tokens.

### 1.2 Hard-coded colours per file

| File | Distinct hex | Hex occurrences | Distinct rgb(a) | Distinct oklch | Most frequent hex |
|---|---|---|---|---|---|
| globals.css | **224** | 281 | 3 | 0 | `#27272b`×13, `#fffefa`×6, `#1f1f24`×5, `#393940`×4, `#383840`×4, `#cea881`×3 |
| ramp-refresh.css | **189** | 317 | 51 | 0 | `#1a1a1d`×47, `#fff`×45, `#ffffff`×5, `#986939`×4, `#615d59`×4, `#f0af6d`×3 |
| polish.css | 39 | 82 | 26 | 0 | `#615c56`×24, `#fff`×7, `#1a1a1d`×6, `#48433e`×4 |
| editorial.css | 6 | 21 | 11 | 49 | `#fff`×15. Otherwise tokenised. |
| dashboard.module.css | 5 | 10 | 0 | 18 | `#fff`×6, `#172019`, `#087f5b`, `#b54708` |
| vendor | 1 | 24 | 2 | 0 | `#000` (shimmer masks) |

**Repo total: 423 distinct hex values.** Almost all of them sit in the two legacy layers, which hold near-duplicates of the same greys:
- Ink: `#1f1f24`, `#1a1a1d`, `#202025`, `#212125`, `#26262a`
- Paper: `#fffefa`, `#ffffff`, `#fbfaf8`, `#fbf9f7`

### 1.3 Brand-colour families and teal remnants

Four brand eras coexist:

1. **Original teal/forest** (CLAUDE.md §1.1: `#0d6b5d`, `#167356`, `#173b34`, `#caf36a`, `#172019`). Literal remnants:
   - `globals.css:89`: `.scan-pulse` shadow `#0d6b5d0d`
   - `#172019` (old green-black ink):
     - `ramp-refresh.css:921`, `:2627`
     - `polish.css:775` (`color:#172019 !important`)
     - `polish.css:792` (comment)
     - `dashboard.module.css:60`
   - `#087f5b` (green): `dashboard.module.css:56`
   - Comments that still describe teal and forest: `polish.css:778`, `:790`
2. **Hue-shifted warm greys and browns** (globals, ramp): `#cea67e`, `#cda277`, `#986939`, `#714518` (`--teal` renamed in all but name), `#f0af6d` (`--lime`, now orange).
3. **Kinnso orange/peach** (editorial): `--ed-orange oklch(76% .158 55)` ≈ `#fc9340`, plus 600/700/800, the peach scale and amber.
4. **Status green** (`--ed-green`, `oklch(50–58% .13 155)`): `editorial.css:26, 711, 1184, 1328, 1360, 2190`.

**Variable-name remnants:** `var(--teal*)` is still referenced 93× in globals, 26× in polish and 10× in ramp. `var(--lime*)` is used 18× in ramp and 7× in polish, and `--lime` now means orange. The names no longer describe the colours, and `--teal` means "brand accent" in some selectors and "success" in others (hence the `:2183` patch).

**Mismatches:**
- `app/layout.tsx:33` sets `themeColor: "#f39a3d"`, which is not `--ed-orange` (`#fc9340`). CLAUDE.md §5 still says `#173b34`.
- The ink and lime colour pair is used in `ramp-refresh.css:921` (`background:#172019;color:var(--lime)`).

## 2. Conflicting selectors across files

258 selectors are defined in at least two files. **165 of those set the same property to different values.** Selectors repeated within a single file: globals 44, ramp 35, editorial 20, dashboard.module 7, responsive 6, polish 5.

| # | Selector | Definitions | Conflicting props (examples) |
|---|---|---|---|
| 1 | `:root` | globals:44, ramp:7, polish:12, editorial:9 | 43 token values (§1.1) |
| 2 | `.workspace-sidebar` (background) | globals:16 `#27272b!important`, ramp:1028 `#1c1c20!important`, editorial:2069-2071 `.workspace-shell .workspace-sidebar #fff!important` | Three-step `!important` escalation |
| 3 | `.brief-priority-card` | globals:17, ramp:1190, 1194, 1204 (5 defs) | padding, radius 12→24px, 3 different backgrounds, shadow |
| 4 | `.landing-hero` | globals:79, ramp:288, polish:189 | min-height 640/690, padding, grid columns, gap |
| 5 | `.business-search-card` | globals:80, ramp:442, polish:224 | radius 16/26px, border, background |
| 6 | `.source-icon` | globals:81, ramp:727 | 42→46px, radius 10/15, margin |
| 7 | `.workspace-switcher` | globals:16, ramp:1041 (+ editorial:2093) | min-height 66/72, radius 9/16, padding |
| 8 | `.workspace-avatar` | globals:16, ramp:1055, editorial:2084 | size 36/40, radius 8/13, bg `#ece3d9`→`--lime`→`--ed-orange` |
| 9 | `.month-brief` | globals:17, ramp:1298 | padding 22/28, border 1px/0, radius 12/24 |
| 10 | `.brand-mark` | globals:76, ramp:156, editorial:1747/2083 | 34/38px, radius 9/12, bg `--teal`→`--lime`→`--ed-orange` |
| 11 | `.landing-hero-copy h1` | globals:79, ramp:339 | font-size clamp(42–70)/(48–76), line-height 1.02/.96, weight 720/790 |
| 12 | `.section-card` | globals:84, ramp:985, ramp:1339 | padding 24/26, radius 12/20, bg `--paper`/`#fff` |
| 13 | `.public-header` | globals:76, responsive:2, ramp:138, ramp:1782, ramp:1873 | ramp turns the sticky blurred bar transparent (`background:transparent;backdrop-filter:none`). `top` is set 4 times. |
| 14 | `.consent-row` | globals:88, polish:729 | min-height 64/52, align flex-start/center, padding |
| 15 | `.prototype-bar` | globals:75, responsive:1, ramp:128 | position relative/sticky, bg `#1f1f24`/`#1a1a1d` |
| 16 | `.workspace-topbar` | globals:16, ramp:1120, globals:35 @767, polish:960 @767 | min-height 64/68/58 |
| 17 | `.card` (CSS modules) | sign-in.module:2 vs evidence-gallery.module:7 | Hashed names, so no runtime clash. Two different card styles for the same concept. |
| 18 | Buttons `[data-slot="button"]…` | 36 selectors: ramp 20, polish 18, editorial 1 | Restyles shadcn Button from outside. `.button` is also restyled in ramp:75. |
| 19 | `body` | globals:73, ramp:59, polish:27 (+ editorial `body:has(.public-site)`) | background gradient vs `--canvas`, font-family set twice |

## 3. Dead rules (best effort)

A class counts as unreferenced when its name does not appear as a token in any `.ts`/`.tsx` under `app/ components/ lib/ hooks/`. Names covered by a dynamic template prefix (`` `provider-${x}` ``, `is-`, `priority-`, `action-`, `fact-` and about 40 more) were also treated as used. CSS modules were checked for `styles.x` or `styles["x"]`.

| File | Classes in CSS | Unreferenced | Selector definitions that need an unreferenced class |
|---|---|---|---|
| globals.css | 397 | **116** | **332** |
| ramp-refresh.css | 245 | **62** | **259** |
| polish.css | 191 | 32 | 80 |
| responsive.css | 61 | 13 | 18 |
| editorial.css | 155 | 8 (2 are lucide auto-classes, so 6 real) | 1 |
| *.module.css | 74 | 0 | 0 |

**159 distinct dead class names, about 690 selector definitions.** That is likely 25–35% of the legacy CSS by volume.

**Main cause:** the landing page was rebuilt on `ed-*` classes, which orphaned the old landing styles in globals, ramp, polish and responsive. `.landing-hero` itself survives only as a `querySelector` in `components/motion-director.tsx:58`.

Samples:
- **globals:** `success-banner`, `asset-boundary-banner`, `calendar-boundary`, `create-truth-banner`, `state-preview-buttons`, `conflict-toggle` (prototype preview controls CLAUDE.md says to remove), `goal-grid`, `goal-card-top`, `create-sheet`, `usage-explainer`, `change-summary-grid`, `trend-section`
- **ramp-refresh:** `landing-hero-copy`, `hero-lead`, `hero-eyebrow`, `business-search-card`, `market-choice(-grid)`, `supported-strip`, `source-grid`, `source-icon`, `product-loop-section`, `loop-proof-grid`, `workspace-preview-section`, `brief-preview-card`, `report-score-panel`, `integration-card`, `activity-table-card`
- **polish:** `owner-story-section`, `owner-story-main-photo`, `owner-story-sticker`, `sample-case-section`, `sample-case-steps`, `agent-team-section`, `agent-gateway`, `agent-role-grid`, `paid-plan-preview-grid`, `operator-explainer`, `state-gallery-grid`
- **responsive:** `report-score-panel`, `hero-actions`, `score-meta-grid`, `market-choice-grid`, `preview-score-row`, `preview-priority`
- **editorial:** `summary-icon`, `legend-measured`, `movement-resolved`, `before-after-values`, `observed-change`, `integration-logo` (all inside the status-green patch at `:2183`)

Several of the contrast fixes in §8 (`polish.css:772-793`, `.sample-case-section`, `.product-loop-section`) target these dead classes.

## 4. Hard-coded values

| File | `!important` | px `font-size` decls | Declarations containing `px` | z-index values | Media queries |
|---|---|---|---|---|---|
| globals.css | 30 | 273 | 1,304 | -1, 0, 1, 2, 40 (topbar), 45 (approval bar), 60 (header, bottom nav), 70 (prototype bar) | 5 |
| ramp-refresh.css | 32 | 162 | 941 | -1, 0, 1, 2 | 6 |
| polish.css | 8 | 89 | 425 | -1, 1, 40 (bottom nav reset), 100 (skip link) | 13 |
| editorial.css | **46** | 4 | 92 | -1, 2 | 4 |
| responsive.css | 0 | 3 | 35 | – | 4 |
| dashboard.module.css | 0 | 31 | 156 | – | 3 |
| evidence-gallery.module.css | 4 | 6 | 28 | – | 2 |
| sign-in.module.css | 0 | 0 | 22 | – | 1 |

- **`!important` total:** 120. The editorial ones mostly fight legacy rules (e.g. `:1062-1097` table cells, `:1793-1801` header CTA, `:2066-2121` workspace).
- **z-index:** no scale or tokens. `polish.css:1490-1492` has to drop the bottom nav from 60 to 40 because it sat above Radix overlays (z 50).
- **px font sizes:** 573 declarations across 33 distinct values. Most frequent: 11px×84, 10px×84, 12px×69, **9px×62**, 13px×54, **8px×39**, 14px×35, **7px×5**. 106 declarations are ≤ 9px, which is below a legible floor for CJK glyphs. editorial.css uses rem/clamp almost exclusively.
- **line-height:** 27 distinct values (1.55×23, 1.6×19, 1.65×18, 1.7×15, …).

**Breakpoints (16 distinct width conditions):**

| Query | Uses | Files |
|---|---|---|
| `max-width:767px` | 23 | globals, responsive, ramp, polish, editorial |
| `max-width:900px` | 6 | all 5 app files |
| `max-width:1100px` | 4 | ramp, polish, editorial |
| `max-width:430px` | 3 | globals, responsive, ramp |
| `max-width:1180px` | 2 | globals, responsive |
| `max-width:640px` | 2 | dashboard.module, evidence-gallery.module |
| `max-width:1023px`, `1000px`, `700px`, `480px`, `380px` | 1 each | ramp / dashboard / dashboard / polish / polish |
| `min-width:768px`, `901px`, `1024px`, `768px and max 1100px` | 1 each | polish |
| `hover:hover` ×2, `print` ×1 | | polish |

Max-width and min-width queries are mixed, and some pairs sit one pixel apart (1023/1024, 900/901, 767/768). Tailwind's own `sm/md/lg` breakpoints (640/768/1024) are used in TSX and match none of the legacy max-width values exactly.

## 5. Typography and Traditional Chinese

**Font stacks:**

| Where | Stack |
|---|---|
| `globals.css:70` `@theme inline --font-sans` | Inter, Aptos, Noto Sans TC, PingFang TC, system-ui… (shadowed) |
| `globals.css:11-12` `@theme --font-sans-hk/-tw` | PingFang HK/TC, Microsoft JhengHei, Noto Sans HK/TC (unused) |
| `polish.css:13-14` `:root --font-sans` | Inter Variable, Inter, Aptos, PingFang TC, Noto Sans TC, Microsoft JhengHei, system-ui… |
| `polish.css:23-25` `:root:lang(zh-HK)` | Inter Variable…, PingFang HK, Noto Sans HK, Microsoft JhengHei |
| `polish.css:19` `--font-mono` | `var(--font-sans)`. Figures rely on `tabular-nums` instead. |
| `editorial.css:28` `--ed-sans` (on `.public-site` `:1965`, workspace `:2061`) | Geist Variable, PingFang HK, PingFang TC, Microsoft JhengHei, Noto Sans TC, system-ui |

So the public site uses Geist and the owner workspace also uses Geist, via `--ed-sans` on `.workspace-shell`. Inter is still the body font for anything outside those scopes, including portalled overlays. Two Latin variable fonts are shipped.

**CJK coverage:**
- No CJK web font is loaded. Coverage relies on system fonts: PingFang on Apple, Microsoft JhengHei on Windows. Noto Sans TC/HK is only present on Android/Linux when installed locally.
- `editorial.css:28` lists PingFang HK before TC for every locale, including zh-TW.
- `zh-TW` has no `:lang` stack of its own and falls back to polish's default, which is TC-first.

**`:lang()` selectors** (13). `<html lang>` is resolved per request (`app/layout.tsx:47-49`).
- `polish.css:23, 69, 74, 78, 396, 551, 1427` (`:lang(zh)` headings, eyebrow and kicker tracking, footer, legal body)
- `editorial.css:110-123, 1892-1897` (`:is(:lang(zh),:lang(zh-HK),:lang(zh-TW))`)

**Line breaking:**
- `editorial.css:112-114`: `word-break:keep-all; overflow-wrap:anywhere; line-break:strict` on the zh landing, reset at `:134`
- `ramp-refresh.css:68-72`: `text-wrap: balance` on h1–h3 and `pretty` on p
- `editorial.css:87, 97`: balance on `.ed-display` and `.ed-heading`
- `overflow-wrap:anywhere` in 14 places, mostly the CSS modules
- `word-break:break-word` (deprecated) at `globals.css:26`
- There is no `line-break` or `text-autospace` handling outside the landing page.

**CJK line-height:** there is no `:lang(zh)` line-height rule. Body text uses 1.55–1.7, which is adequate. Headings go down to `.96–1.05` (`ramp-refresh.css:339`, `globals.css:79`), which is tight for Han glyphs. `editorial.css:110-123` loosens the zh headings only on the landing page.

## 6. Dark mode

- **There is no dark theme.** No `.dark` selector, `[data-theme]`, `prefers-color-scheme` query or `color-scheme` declaration exists in any stylesheet. All 4 token sets are light-only.
- `next-themes` is imported only in `components/ui/sonner.tsx:10-14` (`theme = "system"`). There is no `ThemeProvider` in the tree, so `useTheme()` returns the default.
- **Gap:** 44 Tailwind `dark:` utilities ship in `components/ui/*` (button, input-group, textarea, tabs, checkbox, badge, dropdown-menu, menubar, …). With no `@custom-variant dark` override, Tailwind v4 compiles `dark:` to `@media (prefers-color-scheme: dark)`. Users whose OS is in dark mode therefore get dark tweaks such as `dark:bg-input/30` and `dark:border-input` on top of light tokens. This mixes the two themes inconsistently. The vendor shimmer `@variant dark` (`vendor…css:576`) has the same exposure.
- Sonner toasts follow the system theme while the rest of the app stays light.

## 7. Motion

- **@keyframes:**
  - polish: `rise-in`, `float-tilt`, `pulse-ring` (`:497-512`)
  - editorial: `ed-rise` (`:1651`)
  - vendor: `accordion-down/up`, `scroll-fade-reveal-t/b/s/e`, `tw-shimmer`
  - `tw-animate-css` (enter/exit utilities)
- **Infinite animations:** `float-tilt 6s infinite` (`polish.css:483`) and `pulse-ring 2.4s infinite` (`:487`). Both sit inside `@media (prefers-reduced-motion: no-preference)` (`polish.css:403`).
- **Transition declarations:** polish 29, editorial 13, ramp 5, globals 2, modules 5. Shared easings: `--ease-out` and `--ease-spring` (polish), `--ed-ease` and `--ed-ease-out` (editorial). These are duplicates with identical curves (`cubic-bezier(.16,1,.3,1)`).
- **Reduced motion is handled well:**
  - Global kill switch at `globals.css:38`: `*,*:before,*:after{animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:.01ms!important; scroll-behavior:auto!important}`
  - Entrance animations opt in through `no-preference` blocks (`polish.css:403`, `:718`; `editorial.css:1616`)
  - Explicit `reduce` blocks: ramp `:2222`, polish `:1520`, vendor `:623`, sign-in.module `:23`, evidence-gallery.module `:22`
  - `polish.css:514` `@media print` forces `[data-reveal]` content visible

  Minor: `html{scroll-behavior:smooth}` (`globals.css:73`) is reset only by the global kill switch.

## 8. Contrast (WCAG 2.x relative luminance)

oklch tokens were converted to sRGB (`--ed-ink` ≈ rgb(24,24,27), `--ed-orange` ≈ rgb(252,147,64), `--ed-orange-700` ≈ rgb(150,82,18), `--ed-ink-3` ≈ rgb(104,104,114)).

| Pair | Ratio | Result |
|---|---|---|
| Public body: `--ed-ink` on `--ed-bg #fffaf5` | 17.09:1 | AAA |
| `--ed-ink-2` on `--ed-bg` | 10.08:1 | AAA |
| Muted `--ed-ink-3` on `#fff` / `--ed-bg` / `--ed-peach-100` | 5.53 / 5.33 / 4.76:1 | AA |
| **Primary CTA** `--ed-ink` on `--ed-orange` (`editorial.css:330-333`, `:1793-1795`) | 7.92:1 | AAA |
| CTA hover `--ed-ink` on `--ed-orange-hover` | 6.34:1 | AA |
| `#fff` on `--ed-orange` (avoided, per the comment at `:329`) | 2.24:1 | FAIL |
| Accent text `--ed-orange-700` (the `--teal` remap) on `--ed-bg` | 5.76:1 | AA |
| Sidebar active `--ed-orange-800` on `--ed-peach-100` | 8.63:1 | AAA |
| `--ed-orange` as text on `#fff` (e.g. hover states and icons outside dark panels) | 2.24:1 | FAIL for text; below 3:1 for UI too |
| `--ed-orange` on `--ed-ink` (footer, `:1813`, `:1817`) | 7.92:1 | AAA |
| Status `--ed-green` on `#fff` (`.ed-trust svg`, `:456`) | 4.03:1 | Passes 3:1 for UI/icons only |
| Status teal `oklch(50% .12 155)` on its soft tint | 5.17:1 | AA |
| shadcn primary `#fff` on `--ed-ink` | 17.73:1 | AAA |
| Workspace ramp `--ink #1a1a1d` on `--canvas #f8f4f1` | 15.88:1 | AAA |
| ramp `--soft #6d6862` on `--canvas` | 5.04:1 | AA |
| **ramp `--muted-foreground #706b66` on `--muted #eeecea`** (shadcn `text-muted-foreground`, 42 uses in `components/ui`) | 4.47:1 | FAIL AA for normal text (just under 4.5) |
| **ramp `--amber #a76010` on `--amber-soft #fff1d7`** (warning chips, `ramp:2693`) | 4.35:1 | FAIL AA for normal text |
| ramp `--red #a74039` on `--red-soft #ffe8e4` | 5.21:1 | AA |
| **ramp `--lime #f0af6d` as text on white** (`color: var(--lime)`: 18× in ramp, 7× in polish; most uses sit on ink panels, check any on light surfaces) | 1.90:1 | FAIL |
| `themeColor #f39a3d` with white browser-chrome text | 2.21:1 | Informational |

Most failures are small-type pairs. Combined with the 106 font sizes ≤ 9px (§4), muted or amber text at 8–10px fails in practice even where the ratio is borderline.

## Summary of structural issues

1. **Five global layers, four token eras, no `@layer`.** Each later file restyles the earlier ones (165 conflicting cross-file selectors, 120 `!important`). `globals.css:44-57` is fully shadowed.
2. **Kinnso migration by variable remap.** Legacy names (`--teal`, `--lime`, `--blue`, `--sky`) now hold orange or peach values, and `--teal` doubles as the success colour (`editorial.css:2183` patch). The remaps do not reach portalled overlays.
3. **About 159 dead class names (about 690 selector definitions),** concentrated in globals and ramp-refresh after the `ed-*` landing rebuild.
4. **423 distinct hex colours.** No spacing, z-index or font-size scale. 16 breakpoints. 106 font sizes ≤ 9px.
5. **No dark theme,** yet 44 shadcn `dark:` utilities fire under OS dark mode.
6. **Motion and reduced-motion handling are sound.** CJK handling is partial: `:lang` rules mostly cover headings, and there is no CJK web font, so rendering depends on system fonts.
