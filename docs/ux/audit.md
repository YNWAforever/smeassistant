# UX audit: SME Scanner Visibility Workspace (Phase 0)

Date: 2026-10-19 · Base: `main` @ `697ef29` · Branch: `claude/optimistic-meitner-r5ntsa` · **No application code was changed.**

This page is the summary. Detailed evidence with file:line citations is in [`docs/ux/audit/`](audit/):

| Appendix | Covers |
|---|---|
| [`inventory.md`](audit/inventory.md) | Every route and component with line counts (section a) |
| [`features-and-journeys.md`](audit/features-and-journeys.md) | Navigation, feature overlap, click counts, redirect mechanics (sections a, b) |
| [`copy-and-naming.md`](audit/copy-and-naming.md) | Copy architecture, naming, jargon, zh-HK/zh-TW register, text-heavy screens (sections c, i) |
| [`css-architecture.md`](audit/css-architecture.md) | Stylesheets, tokens, conflicts, dead CSS, typography, contrast (sections d, e) |
| [`guardrails-states-motion.md`](audit/guardrails-states-motion.md) | Guardrail check, missing states, motion, static a11y (sections f, g, h, j) |
| [`axe.md`](audit/axe.md) | axe-core results per page (section f) |
| [`page-metrics.md`](audit/page-metrics.md) | Height, overflow, word count and under-44 px targets for every page × locale × width |
| [`screens/`](screens/) | 279 screenshots (31 page states × 390/768/1440 px × zh-HK/zh-TW/en; JPEG, 25 MB) in `public/` and `owner/`, plus a 13-step zh-HK journey walk at 390 px in `journey/`. Includes viewer-role captures of action detail and brand. |

## How the screenshots were taken

- **Server:** the repo's own fixture stack on `next dev`. That means the `SME_TEST_IDENTITY=owned-local` identity and mail server, the fixture LLM server, `SCAN_SOURCES=fixture`, and the transport guard that blocks all non-loopback traffic.
- **Database:** Docker isn't available in this container, so `seed:demo --owned-test` couldn't run. I used a throwaway local PostgreSQL 16 cluster instead, with migrations 0001–0018 applied by `scripts/neon/migrations.ts`.
- **Data:** the report is a real fixture scan run through the UI (manual entry, Instagram unavailable). The workspace is seeded the way `test/e2e/seed.ts` seeds it: one workspace, two locations, owner/manager/viewer, and one review-reply action. The scan job is attached to the workspace.
- **No production data, no paid providers.**
- **Capture settings:** `reducedMotion: "reduce"` so scroll-reveal content is visible in full-page captures, and the Next dev indicator is hidden.
- **Fixture artefacts to ignore:**
  - Pexels photos show as broken images, because external hosts are blocked.
  - The fixed mobile bottom nav appears mid-page in full-page captures.
  - The executive summary on the full report shows the fixture LLM's JSON (see finding P-9).

---

## a) Page and feature inventory

### Routes

| Area | Count | Notes |
|---|---|---|
| Public pages under `app/[locale]` | 17 | Includes `start/[slug]`, `r/[slug]/recover`, `unsubscribe` and legal. 4 are flag-gated and return 404 when the flag is off: offers, packs, start, recover. |
| Owner pages | 20 | 5 primary nav + More, 5 settings, plus offers, packs, onboarding, select-workspace and sign-in(+complete) |
| Internal ops pages | 3 | `ops/*`, English only, behind `requireOperator()` |
| `app/auth` | 1 | `auth/callback` |
| `app/api` route handlers | 70 | Names listed in `inventory.md` |

### Components

There are about 150 component files. Six are over 400 lines:

| File | Lines | Note |
|---|---|---|
| `components/workspace/action-detail-client.tsx` | 1,041 | 88 KB; some single lines run to 1,158 characters, so this is about 2,500 lines if formatted |
| `components/scan-page.tsx` | 759 | |
| `components/ui/sidebar.tsx` | 723 | vendored shadcn |
| `components/landing-page.tsx` | 655 | |
| `components/scanning-page.tsx` | 450 | |
| `components/pocket-assistant/assistant-sheet.tsx` | 448 | |

`home-brief.tsx` is 287 lines but 28 KB. Line counts understate the size of the densest files. The copy modules are also over 400 lines: `copy-dictionaries.ts` (1,270), `copy-workspace.ts` (1,067) and `copy.ts` (522).

### Feature overlap

The workspace answers the same few questions in several places:

| Question | Where it is answered today |
|---|---|
| What should I do next? | Home priority card · Home "other tasks" · Actions list · Create "starting points" · Starter-pack card · Offer promotion panel · Assistant "compare priorities" |
| What needs my approval? | Actions "Approvals" tab · Action detail · **Fix Pack card on Home, which approves a different table (`agent_runs`)** and links to a list that doesn't contain those drafts |
| Is it working? | Home "recent results" disclosure (score, proof, month metrics, ledger, evidence) · Insights · Action detail "Before and after" |
| When is the next thing? | Calendar (46 lines: rescan cadence + due actions) · Home month brief · Action header "Due" |
| What went wrong? | Home needs-attention (2 items) · Activity problems list (all) · Action detail toasts |
| How do I make something new? | Create · Offers (flag) · Starter pack (flag) · Assistant drafts |
| Where are runs and versions? | Action detail tabs: "Workflow states" (an engineering view) and "Version & audit history" · Activity |

The Visibility Operator assistant has 5+ launch points inside the workspace.

"More" mixes content (Assets, Offers, Brand) with settings. Its "Locations" link leaves the workspace, and Calendar and Activity drop `?location`.

The full matrix is in `features-and-journeys.md` §2.

---

## b) Clicks and time

Measured by driving the real UI (zh-HK, 390 px, manual entry). The script is in the session scratchpad, not the repo. Its result: **landing → report in 11 taps + 1 typed field, 4 page loads.**

| Segment | Taps | Typed fields | Page loads | Owner time | Waits |
|---|---|---|---|---|---|
| Landing → scan wizard | 1 | 1 (business) | 2 | ~10 s | — |
| 4-step wizard (find/manual, market + industry + district, channels, consent) | 9 | 0 | — | ~45–60 s | SerpApi search 2–5 s (live) |
| Scanning → report | 0 (auto-navigates) | 0 | 2 | — | **5–13 min live** (fixture: 2 s) |
| **Subtotal: first result** | **11** | **1** | **4** | **~1 min** | **5–13 min** |
| Report → unlock form → report | 4 (unlock, channel, consent, submit) | 1 (contact) | 2 | ~40 s | — |
| Report → claim → sign-in (Google, or email code + 2 fields) | 3 | 0–2 | 3 | 20 s – 3 min | Email 10 s – 2 min |
| Onboarding: verify with Google, then basics | 5–6 | 0 | 4 | ~1 min | 2nd Google consent |
| Today → action → generate → (often) facts → approve | 5–7 | 0–3 | 2 | 1–3 min | LLM 10–45 s, sometimes twice |
| **Total: first approved action** | **≈ 27** | **2–7** | **≈ 15** | **5–7 min** | **≈ 10–20 min end to end** |

Findings:

- **With the shipped default (`WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=false`) the journey cannot finish in one session.** Onboarding stops at "Ask Fimmick to assign your workspace", and the owner waits hours or days for staff.
- **Google is asked twice:** once to sign in, once to prove ownership, each with its own consent screen.
- Unlock returns the visitor to the report, and the claim button only appears after that.
- Onboarding step 1 has a Continue tap that collects nothing.
- The wizard's step 1 has two inputs that both accept a Maps link: "name or Maps link" plus an optional "Maps link" (`scan-zh-TW-390`).
- The scanning page renders "0 of 6 stages · Pending" on first paint, even for a finished job, until the first client poll. Status is client-only (`scanning-page.tsx:97`). The page shows **3** source rows but counts **6** stages.

---

## c) Jargon and naming

Full tables are in `copy-and-naming.md`. The headline points follow.

**Nine competing product and feature names:**

- SME Scanner (also the free plan's name)
- Visibility Workspace / 能見度工作台 (also the activity-log actor)
- Growth Workspace / 增長工作台 / 成長工作台 (the paid plan)
- Visibility Operator / 隨身增長助理 / "Ask operator" / 問增長助理
- AI visibility team
- Visibility Scout
- Fix Pack
- Work pack / Starter pack / 入門套裝
- Visibility Score / AI Visibility Score

Examples of the names colliding in the UI:

- On the same zh-TW screen the sidebar says "Visibility WORKSPACE" in English, while the breadcrumb says 店家工作台 (`brand-zh-TW-1440`).
- The mobile nav label 待辦與審批 opens a page titled 行動 (`actions-zh-HK-390`).

**Engineering language on customer screens:**

- coverage / 覆蓋率, comparable scan, snapshot / 快照
- Unsupported, Superseded, Not eligible
- Attributed / Inference with no legend
- "Agent run", "Separate state machine", 冪等性 (idempotency)
- entitlement / webhook (Billing), OAuth 代幣 (Trust)
- JSON-LD and `<head>` paste instructions
- "Engine: google · Query type: Not recorded · Inspected records: 3 · Duplicate records: 0" on the report (`report-full-en-1440`)
- 獨立生命週期狀態：行動、Agent 執行、審批… as a footer on Actions

**"Agent" is shown untranslated in Chinese:** "Agent 只能使用已核准的語氣", Agent 輸入 and 由 Agent 生成.

**Register problems:**

- zh-HK mixes colloquial Cantonese (嘅 ×74 in `messages/zh-HK.json`) with formal written Chinese. It uses three verbs for approve (核准, 審批, 批准), sometimes on one card.
- zh-TW is derived: 36 files use `isChinese = locale !== "en"`, so 商戶, 店主, 地點, 上載, 帖文 and 套裝 leak into Taiwan pages. The report OG tagline is Cantonese (你間舖…搵唔搵到) on zh-TW too.
- The locale switcher label 繁港 is cryptic.

**Contradictions:**

- "Get your audit report in 30 seconds" (`messages/*.json:135`) versus "a few minutes" on landing.
- The root meta description is zh-HK on every locale.

---

## d) Visual issues

From the screenshots and `css-architecture.md`.

| Area | Finding | Evidence |
|---|---|---|
| Length | Landing is **9,267 px** tall at 1440 px and **15,481 px at 390 px** (about 18 phone screens, about 1,390 words), with 13 sections and 4 different card systems. The full report is 4,971 px at 1440 px (priority actions start about 3,300 px down) and 7,611 px on a phone. By comparison, Today is about 1,000 px. | `landing-*-1440`, `report-full-*` |
| Hierarchy | The report's "Captured scan samples" (three near-identical bordered cards with raw engine fields) come **before** the priority actions. Two "AI mentions" cards differ only in an "Engine:" string. | `report-full-en-1440` |
| Overflow | No page scrolls horizontally at 390, 768 or 1440 px in any locale (`page-metrics.md`). |
| Mobile density | On the Actions page at 390 px, four full-width filter selects plus search push the first action card about 850 px down. The status tabs overflow horizontally with no affordance. | `actions-zh-HK-390` |
| Action detail | With no draft yet, the page offers **12 controls**: Generate, Revise with operator, Save manual edits, Mark as applied, Approve (panel), Approve (sticky bar), Save (sticky bar), Reject, Export, Copy, Publish, and a role-preview select. The one useful next step, "Generate a draft", is styled as a secondary button. "Mark as applied" uses the strongest (black) style. The sticky bar reads "No version yet · No version yet" and covers the approval panel. Four tabs sit behind a collapsed "View source and workflow" disclosure. | `action-detail-en-1440` |
| Chrome | Onboarding (a signed-in task) uses the **public** header ("Why us · Sample case · Pricing · Free scan") and the 300 px marketing footer wordmark. The dark step sidebar is mostly empty. | `onboarding-en-1440` |
| Type scale | 573 px font-size declarations across 33 sizes, including **106 declarations at ≤ 9 px** (8 px ×39, 7 px ×5). That is below a readable floor for Han glyphs on a phone. | css §4 |
| Spacing | No spacing scale. 16 breakpoints, including pairs one pixel apart (767/768, 900/901, 1023/1024). | css §4 |
| Colour | 423 distinct hex values. There are four brand eras: teal → warm grey/brown → Kinnso orange → status green. `--teal` now holds orange (and green in some selectors), and `--lime` holds orange. `themeColor #f39a3d` ≠ `--ed-orange`. | css §1 |
| Contrast | The main pairs pass: body 17:1, CTA 7.9:1. Small muted, amber and orange text fails (details in section f). | css §8, axe |
| Overlays | Radix portals (sheet, dialog, select) render outside `.public-site` / `.workspace-shell`, so they miss the Kinnso remap and use old tokens. | css §1.1 |
| Dark mode | There is no dark theme. However, 44 shadcn `dark:` utilities fire under the OS dark setting, which gives mixed styling. | css §6 |
| Chinese typography | No CJK web font, so the system font is used (PingFang / JhengHei; on Android/Linux it varies). The editorial stack lists PingFang **HK** first even for zh-TW. `keep-all` / `line-break: strict` apply on landing only. Headings go down to line-height 0.96. | css §5 |
| Photos | Landing hotlinks three Pexels images. With the host blocked, they render as broken frames. In production that is a third-party dependency on the LCP element. | `landing-*` |

---

## e) CSS architecture

| Sheet | Lines | Role |
|---|---|---|
| `globals.css` | 93 lines (76 KB minified) | Tailwind entry, prototype CSS, first `:root` (fully shadowed) |
| `vendor/shadcn-tailwind-4.13.0.css` | 629 | shadcn variants and keyframes |
| `responsive.css` | 63 | breakpoint patches |
| `ramp-refresh.css` | 3,225 | second `:root`, restyle of the prototype |
| `polish.css` | 1,520 | typography, motion, contrast fixes |
| `editorial.css` | 2,193 | Kinnso `ed-*` system, remaps legacy tokens |
| CSS modules | 3 files | sign-in, report dashboard, evidence gallery |

Total: **about 7,800 lines and 288 KB** of hand-written CSS. No file uses `@layer`, so every legacy rule beats every Tailwind utility.

- 49 tokens are defined in more than one file (23 of them in 3–4 places).
- 258 selectors are defined in at least two files; 165 of those conflict. The worst is `.workspace-sidebar`, a three-step `!important` chain.
- 120 `!important` declarations.
- About **159 dead class names (≈ 690 selector definitions)**, mostly old landing styles orphaned by the `ed-*` rebuild.
- Two parallel reveal systems with duplicate easing tokens.

This is the main reason Phase 1 should be a **consolidation**, not another layer.

---

## f) Accessibility (axe-core 4.10.3, WCAG 2.0/2.1/2.2 A+AA, 390 and 1440 px, all locales)

See [`axe.md`](audit/axe.md) for every page.

| Rule | Impact | Nodes | Pages |
|---|---|---|---|
| `color-contrast` | serious | 105 across 186 runs | All 31 page states, mostly at 1440 px. Repeat offenders: the header brand tagline `small` ("BY FIMMICK"), `.workspace-topbar-context` breadcrumb text, `.plan-test-note`, and `em` emphasis on landing. |
| `scrollable-region-focusable` | serious | 3 | Landing: the comparison table's `.overflow-x-auto` wrapper can't be reached by keyboard |

axe found nothing else automatically: no missing names, labels, landmarks or ARIA errors. Its limits apply here: it can't judge text over gradients or images, touch-target size, focus visibility, or reading order. Those are covered by the static review below and by `page-metrics.md`. On every page between 4 and 19 interactive elements measure under 44 px.

Static review (`guardrails-states-motion.md` §D):

- The owner-review textarea has no label (`action-detail-client.tsx:862`).
- **No interactive element reaches 44 px.** Buttons are 32–36 px, and tabs and nav links are 40 px. There is no `pointer: coarse` override.
- Focus is shown with box-shadow only, which disappears in forced-colors mode. On the landing field, the invalid style overrides the focus ring.
- `FactType` badges have no accessible explanation.
- The unlock contact input has no `type="email"` / `inputmode` when the email channel is chosen, so phones show the wrong keyboard (`unlock-page.tsx:179`).
- Positives: skip link, ScoreDial `role="img"` with label, `aria-live` on scan collectors, an accessible data table under the trend strip, and a global reduced-motion kill switch.

---

## g) Missing states

- **There is no `loading.tsx`, `error.tsx` or `global-error.tsx` anywhere.** A thrown query shows Next's unstyled, untranslated default error page with no retry.
- Owner routes are `force-dynamic`, and the layout makes three sequential awaits before first paint. Client navigation therefore freezes on the old page with no pending indicator.
- **Permission denied is silent.** `requireMembership({ minRole: "owner" })` redirects managers and viewers to `{ws}?forbidden=1`, but Home never reads that parameter. More and Home's "Manage" link still show Integrations to every role.
- Onboarding swallows lookup failures (`console.error` only).
- Partial evidence is handled well on the report and Home (withheld score, coverage, "Not comparable"). It is missing on select-workspace (no observed date) and on the actions list.
- Empty states exist on most lists, but they are text-only and inconsistent. There is no shared EmptyState component.

The full page-by-state matrix is in `guardrails-states-motion.md` §B.

---

## h) Guardrail check

The code is disciplined: most nulls already render as "—" or "Withheld". The remaining violations, in priority order:

| # | Guardrail | Finding | Where |
|---|---|---|---|
| G-1 | Unavailable ≠ zero | The share/OG card prints an unmeasured module as **"IG 0"**. It also reads legacy `module_scores`. | `lib/share.ts:63` → `r/[slug]/opengraph-image.tsx:64` |
| G-2 | Unavailable ≠ zero | A null measurement delta renders "(0)" via `signed(Number(m.delta))`. | `action-detail-client.tsx:1010` |
| G-3 | Unavailable ≠ zero | With no comparable diff, "0 resolved / 0 regressions · across comparable scans" shows on Home and Insights. | `queries-pages.ts:728-729`, `home-brief.tsx:217`, `insights-view.tsx:76-77` |
| G-4 | Unavailable ≠ zero | A null `score_coverage` becomes "0% coverage". Home invents "0 measured · 4 unavailable" when `sources` is missing. | `snapshots.ts:154,244`, `home-brief.tsx:183-184` |
| G-5 | Comparable before change | The change ledger is filled from any diff without checking `comparable`, then labelled "in the latest comparable scan". | `queries-pages.ts:737,952` |
| G-6 | Comparable before change | An up-trend icon shows when the delta is null. | `home-brief.tsx:171`, `insights-view.tsx:75` |
| G-7 | Fact types | The landing sample "improved by 9 points after the reply batch" is labelled **Observed**, but it should be **Attributed**; its own caveat says "temporal association". | `landing-page.tsx:563,648` |
| G-8 | No causal / outcome claims | zh hero 「讓更多顧客找到你」 promises an outcome; the en version says "Be easier to find". | `copy-dictionaries.ts:1146,1217` |
| G-9 | Evidence before score | Report "Key statistics" show values (rating 4.1, 260 reviews) with **"Observation date unavailable"**, although the scan date is known. The Home score card, Insights stat cards and select-workspace scores carry no fact-type chip, and select-workspace shows no observed date. | `report-full-*`, `select-workspace-page.tsx:88` |
| G-10 | Demo data on demo pages | `workspace-shell.tsx:184` falls back to **demo** assistant mode in a real workspace when `workspace.assistant` is unset (needs verifying). There is also a dead "Demo" `SelectWorkspacePage` export in `public-pages.tsx`. | — |
| G-11 | Consistency | The demo response rate is `22% → 31%` on landing but `31% → 18%` on the demo workspace. | `landing-page.tsx:558`, `public-demo-workspace.tsx:49` |

No live causal claims and no unlabelled revenue or bookings claims were found.

---

## i) Text-heavy screens

Rough copy load, including all states: `copy-and-naming.md` §4.

**Over budget:**

| Screen | English words |
|---|---|
| Action detail | ~1,230 inline (worst) |
| Landing | ~1,200 |
| Report | ~600 |
| Pricing / Methodology / Trust | 250–470 each |
| Offers | 467 |
| Onboarding | 413 |
| Home | ~470 |
| Scanning | ~380 |
| Scan | ~360 |
| Create | 357 |
| Billing | 269 |
| Brand | 292 |
| Insights | 216 |

**Long copy:** 11 headings are over 8 words; the worst is a 16-word `<h2>` on Pricing. 86 supporting lines are over 20 words (worst: 47 words).

Proposed replacements, one visual per concept:

| Screen | Text block | Replace with |
|---|---|---|
| Landing | confidence trio, loop essay, agent team, comparison table | 3 animated step icons, LoopRibbon, source chips; table → `/methodology` |
| Scan | step hints, security body, "improve coverage" | Stepper; live CoverageMeter that fills as optional channels are added; consent as 3 toggle rows with ⓘ |
| Scanning | stalled/resume/background paragraphs | ScanProgress rows per source with status icons; one-line status + "Why?" disclosure |
| Report | withheld/first-scan/unlock/claim paragraphs; sample cards | ScoreDial + segmented CoverageMeter; "No score yet" illustration; 3-benefit icon row; samples into a collapsed "How we measured" |
| Unlock | body, benefits, form body | 2-step diagram (report access now → ownership later) |
| Pricing | "what counts as a delivery" heading and banner | Mini-flow: Draft → Approve → Export = 1 delivery |
| Methodology | principles, formula, limitations | Weighted donut; "missing ≠ zero" visual; FactTypeBadge legend |
| Trust | pillars, approval contract, retention | ApprovalFlow diagram; retention table |
| Home | review follow-up, proof empty state, ledger | Next-best-action card; before/after tile; "Do → rescan → proof" 3-icon empty state; coloured ledger dots |
| Action detail | "Workflow states" tab, history, needs-facts note, website disclaimer | ApprovalFlow stepper on top; timeline; input checklist; "Not published" badge + popover |
| Billing / Create | entitlement, webhook and allowance sentences | Plan card + usage meter |
| Insights | 43-word denominator note | ⓘ InlineExplainer |

---

## j) Motion

**What `components/motion-director.tsx` does** (public pages only):

1. Toggles `data-scrolled` on the header.
2. Uses an IntersectionObserver to reveal sections below the fold. Nothing on screen is ever hidden, it is skipped under reduced motion, and pending sections are forced to "in" on unmount.
3. Moves a pointer light over `.landing-hero`. That class no longer exists after the editorial redesign, so this is **dead code**.

The 4 tests cover the reveal and reduced-motion paths only.

**CSS motion:**

- Entrance `rise-in` and `ed-rise` come from **two parallel reveal systems** with different timings. A grid cascade plus the hero stagger means content finishes appearing about 1.3 s after scroll.
- `.score-dial` sweeps only inside revealed public sections.
- Two infinite loops: `float-tilt` (an orphaned sticker) and `.scan-pulse`. The pulse animates box-shadow, not transform, and **keeps pulsing when a scan is stalled**.
- Editorial hover lifts are not gated individually, but the global reduced-motion kill switch catches them.

**Missing:**

- **The workspace has no motion layer at all.** Approve, export and copy give a toast only, and the approval panel, version list and delivery card change state instantly.
- No usage-meter feedback when a delivery is counted.
- When a rescan completes, Home neither updates nor announces it.
- Scan collectors swap states with no transition, and "ready" has no confirming moment.

**Bundle:** there is no animation library today; tw-animate-css is CSS only. The Phase 1B < 30 KB motion-JS budget is achievable with CSS plus a small hook.

---

## k) Top-10 problems by user impact and effort

| # | Problem | Impact | Effort | Phase |
|---|---|---|---|---|
| 1 | **First approved action is ~27 taps, ~15 page loads and two Google consents, and cannot finish in one session with the default ownership setting.** | Very high: activation | M (IA, onboarding) · **product decision** on OAuth claim | 4, 5 |
| 2 | **Guardrail breaches where unknown values show as 0 or as a trend** (G-1 to G-6): OG "IG 0", "(0)" delta, "0 resolved", 0% coverage, ledger not gated on comparability, up-arrow on null | High: trust, product promise | S | 1B, 3, 4 (or a hot-fix before Phase 1) |
| 3 | **Overlapping workspace surfaces.** Two approval systems (Fix Pack vs versions), three "create" flows, Home duplicates Insights, Calendar is thin, More mixes content and settings. | High: comprehension | M | 4 |
| 4 | **Engineering and agent vocabulary on customer screens, plus 9 product names.** Includes untranslated "Agent", state-machine and idempotency text, and raw engine fields on the report. | High: comprehension, trust | M (copy) · **naming decision** | 2–5, 7 |
| 5 | **No error, loading or permission states.** Default Next error page, frozen navigations, silent `?forbidden=1`. | High: reliability perception | S–M | 5 |
| 6 | **Text-heavy, very long pages.** Landing 8.5k px; report priorities 3.3k px down; action detail ~1,200 words. | High: mobile owners | M–L | 2, 3, 4 |
| 7 | **CSS sprawl.** 5 global layers, 423 colours, 165 conflicting selectors, 120 `!important`, ~690 dead selectors, no `@layer`. Blocks every visual change. | Medium for users, very high for delivery | L | 1 |
| 8 | **zh-TW is a derived locale and zh-HK has mixed registers.** HK terms on TW pages, 3 approval verbs, a Cantonese OG tagline on TW, 688 inline ternaries. | Medium–high in TW | M | 1 (copy architecture) + each page |
| 9 | **Touch targets, small type and contrast.** No target reaches 44 px; 106 font sizes ≤ 9 px; muted, amber and orange small text fails AA. | Medium–high on phones | S–M | 1, 6 |
| 10 | **No feedback motion in the workspace, and decorative or broken motion in public.** No approve, export or rescan moments; stalled scan still pulses; dead pointer light; two reveal systems. | Medium | S–M | 1B |

Related findings outside the top 10:

- **P-9:** the report executive summary returns `llmComplete` text without a shape check (`lib/llm-summary.ts:154`). The fixture LLM's JSON shows verbatim under an "Inference" chip. That is a fixture artefact, but it is also a hardening gap if a live model returns JSON.
- `ScoreDial` sweeps on public pages but is static in the workspace.
- `components/ui/sonner` follows the OS theme while the app is light-only.
- Pexels photos are hotlinked on the LCP section.
- Mobile Actions page: filters before content.
- Onboarding uses marketing chrome.

---

## Decisions needed before Phase 1

Decided 2026-10-19: Kinnso OS name, guardrail PR first, OAuth claim on, workspace-only dark mode, system fonts. See `target-ia.md` §5 for the record and what is still open. The original list follows:

1. Product name (and assistant name)
2. Whether `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` is expected to be on, since it decides whether first-session activation is even possible
3. Bulk approve: allowed or not, and for which templates
4. Fix Pack drafts: merge into Actions or retire
5. Merge Create, Offers and Starter pack into one "New" flow
6. Dark-mode scope
7. CJK web font or a tuned system stack
8. Whether to hot-fix guardrail items G-1 to G-6 before the redesign, as a small separate PR
