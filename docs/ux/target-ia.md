# Target information architecture (proposal, Phase 0)

Status: **proposal for review**. Nothing here is implemented. Route changes keep every existing URL working through redirects. API contracts, migrations, `packages/*` and auth logic are unchanged. All guardrails in CLAUDE.md §0 apply.

Evidence for each choice is in [`audit.md`](audit.md).

---

## 1. Principles

1. **One journey:** scan → understand → decide → approve → deliver → prove. Each step maps to one place:

   | Step | Public | Workspace |
   |---|---|---|
   | Scan | `/scan` | Rescan button (Today, Insights) |
   | Understand | `/r/[slug]` | Today ("what changed") |
   | Decide | Report: top action | Today hero card, Actions queue |
   | Approve | — | Action side panel, ApprovalBar |
   | Deliver | — | Action side panel, delivery card |
   | Prove | — | Insights, Today "since last comparable scan" |

2. **Five destinations, one home per job.** Every page answers one question. If two pages answer the same question, one becomes a filter or section of the other.
3. **Outcome language, not system language.** For example, "3 review replies ready" instead of "Agent run succeeded", and "Scan on 12 Oct" instead of "Snapshot". Agent names are never shown to customers.
4. **Visual first.** Every concept has one reusable visual (Phase 1B). Text over the budget moves into an `InlineExplainer` or "Learn more" drawer.
5. **Guardrails are visible structure.** Coverage sits beside every score, a fact-type chip sits on every claim, and comparison only appears when the scan is comparable.

---

## 2. Workspace navigation

```
Desktop sidebar (≥ 1024px)              Mobile bottom tab bar (< 1024px)
┌──────────────────────────┐            ┌──────┬──────┬──────┬──────┬──────┐
│ ◉ 錦汶館  ▾  [HK]        │ ← location │Today │Action│Insig.│Busin.│Sett. │
│   天后 · 2 locations      │   switcher └──────┴──────┴──────┴──────┴──────┘
├──────────────────────────┤             (the location switcher and ⌘K live
│ ⌂ Today                  │              in the top bar on mobile)
│ ☑ Actions          (3)   │
│ ↗ Insights               │
│ ▣ Business               │
│ ⚙ Settings               │
├──────────────────────────┤
│ Usage  ▓▓░  1 / 3        │ ← approved deliveries this month
│ ? Help   ·   Owner ▾     │
└──────────────────────────┘
Top bar: breadcrumbs · ⌘K search · 🔔 notifications · ✦ Assistant (drawer) · language
```

| Destination | Answers | Contains (sections or tabs) |
|---|---|---|
| **Today** | "What should I do now, and did anything change?" | Hero "next best action", what changed since the last comparable scan, next 3 actions, ImpactEffortMatrix (≥ 4 open actions), LoopRibbon progress, onboarding checklist (until done), needs-attention items |
| **Actions** | "What is waiting on me?" | One queue with status filters (Needs input · Draft · Awaiting approval · Approved · Delivered), a Due view (replaces Calendar), and a **New** button (replaces Create, Offers and Starter pack as modes). Detail opens in a side panel (full page on mobile). |
| **Insights** | "Is it working?" | Score and coverage trend (comparable points only), per-source cards, before/after measurements, change ledger, AI-search presence, rescan schedule and the Rescan button |
| **Business** | "What do you know about my business?" | Profile and facts (brand voice, approved claims), Locations, Assets (photos, menus), Integrations (Google Business Profile, Instagram, website) |
| **Settings** | "Who, how much, how notified?" | Team and roles, Plan and usage (billing), Notifications, Activity (audit log), Account |

The **Visibility Operator** (assistant) moves to one top-bar drawer. It opens with suggestions for the current page context and has no per-page buttons. The product name is still to be decided (Phase 7).

**Role visibility:** viewers see read-only states (disabled controls with a `PermissionDenied` explainer). Owner-only items (Integrations, Team, Plan) show to managers and viewers as locked rows with a one-line reason. They are never silently redirected. The server still enforces every check.

---

## 3. Route map: old → new

The workspace base is `/{locale}/owner/{ws}`. "308" is a permanent redirect added in `proxy.ts` (a new multi-segment resolver beside `LEGACY_PATHS`) that keeps `?location=` and other query params. API routes don't change.

| Old route | New route | How |
|---|---|---|
| `{ws}` (Home) | `{ws}` (**Today**) | same URL; new content |
| `{ws}/actions` | `{ws}/actions` | same; tabs become filters (`?status=`) |
| `{ws}/actions/[actionId]` | `{ws}/actions?open=[actionId]` (side panel) **and** `{ws}/actions/[actionId]` (full page, deep links, mobile) | keep both; the full page renders the same panel component |
| `{ws}/create` | `{ws}/actions/new` | 308 |
| `{ws}/offers` (flag) | `{ws}/actions/new?mode=offer` | 308 while the flag is on; 404 behaviour unchanged when off |
| `{ws}/packs/[packId]` (flag) | `{ws}/actions?pack=[packId]` | 308 while the flag is on |
| `{ws}/calendar` | `{ws}/actions?view=due` | 308 |
| `{ws}/insights` | `{ws}/insights` | same |
| `{ws}/assets` | `{ws}/business/assets` | 308 |
| `{ws}/settings/brand` | `{ws}/business/profile` | 308 |
| `{ws}/settings/integrations` | `{ws}/business/integrations` | 308 |
| — (Locations was a link to select-workspace) | `{ws}/business/locations` | new read view; switching stays in the location switcher |
| `{ws}/settings/team` | `{ws}/settings/team` | same |
| `{ws}/settings/billing` | `{ws}/settings/plan` | 308 |
| `{ws}/settings/notifications` | `{ws}/settings/notifications` | same |
| `{ws}/activity` | `{ws}/settings/activity` | 308; the problems list moves to Today "Needs attention" |
| `{ws}/more` | `{ws}/settings` (mobile overflow) | 308 |
| `/owner/select-workspace` | unchanged | — |
| `/owner/onboarding` | unchanged (becomes the first-run wizard shell, Phase 5) | — |

Public routes stay the same. Content moves between pages as follows:

| Public route | Change |
|---|---|
| `/` | Simplified (hero, 3 steps, what we check, sample report, pricing, FAQ, trust strip). The comparison table, coverage rules and agent descriptions move to `/methodology` and `/trust`. |
| `/scan`, `/scanning/[jobId]`, `/r/[slug]`, `/unlock/[slug]` | Same URLs, new layouts (Phase 3) |
| `/pricing`, `/methodology`, `/trust`, `/sample-report`, `/demo-workspace`, legal | Same URLs |
| `/dev/design-system` | New in Phase 1; excluded from production builds and the sitemap |

Redirect tests: one Vitest case per row (status 308, target, query preserved), plus an e2e check that the old Calendar and Create links land on the right view.

---

## 4. Wireframes

### 4.1 Landing (`/`), mobile first

```
┌────────────────────────────────────┐
│ ◉ SME Scanner          Sign in  ☰ │
├────────────────────────────────────┤
│  See how customers find you.       │  ← H1 ≤ 8 words
│  Free scan of Google, Maps, AI     │  ← one line ≤ 20 words
│  search, Instagram and your site.  │
│ ┌────────────────────────────────┐ │
│ │ 🔎 Business name or Maps link  │ │
│ └────────────────────────────────┘ │
│  Market  (●) Hong Kong  ( ) Taiwan │  ← explicit; never inferred from language
│ ┌────────────────────────────────┐ │
│ │      Start free scan  →        │ │  ← one primary CTA
│ └────────────────────────────────┘ │
│  No sign-up · Results in minutes   │
│ ┌────────────────────────────────┐ │
│ │ [SVG loop, 6–10s, pauses       │ │  search → 5 source rows tick →
│ │  offscreen; static if reduced] │ │  dial fills → 1 priority card
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│  How it works                      │
│  (1)🔍 Scan   (2)☑ Decide  (3)📈 Prove│  ← 3 animated icons, one line each
├────────────────────────────────────┤
│  What we check                     │
│  [G Search][Maps/GBP][AI][IG][Web] │  ← source chips; tap = one-line tooltip
├────────────────────────────────────┤
│  Sample report       [Demo data]   │  ← live components + sanitised demo data
│  ┌ ScoreDial 62 ◔ coverage 78% ┐   │
│  └ 1 priority action card ─────┘   │
├────────────────────────────────────┤
│  Pricing  HK$ / NT$ by market      │  ← existing tiers only
│  [Free scan] [Growth HK$888/mo]    │
├────────────────────────────────────┤
│  FAQ (accordion, 5 items)          │
│  Trust strip: 🔒 Nothing auto-posts │
│  · You approve every version       │
├────────────────────────────────────┤
│  Footer                            │
└────────────────────────────────────┘
```

### 4.2 Scan result (`/r/[slug]`)

```
┌────────────────────────────────────┐
│ 錦汶館 · Visibility report          │
│ HK · Eastern · scanned 19 Oct 14:02 │
├────────────────────────────────────┤
│        ╭───────╮                   │
│        │  62   │  ◔ 60% coverage   │  ← ScoreDial + CoverageMeter
│        ╰───────╯                   │    "No score yet" when withheld (never 0)
│ Sources ▓▓▓▓ ▓▓▓▓ ░░░░ ▓▓▓▓ ╳╳╳╳    │  ← one segment per source:
│         Maps Search AI   Web  IG   │    measured / pending / unavailable / failed
│                     [Partial] ⓘ    │
├────────────────────────────────────┤
│ ① Do this first          [Observed]│  ← one priority action
│   Add opening hours on Google      │
│   ~10 min · Evidence: GBP, 19 Oct  │
│   [ See why ]                      │
├────────────────────────────────────┤
│ By source                          │
│ ┌ Google Business ┐ ┌ Instagram  ┐ │  ← module cards: state icon, score or
│ │ 72 · measured   │ │ not checked│ │    "not measured", 1 line, source + date
│ └─────────────────┘ └────────────┘ │
│ ┌ AI search ──────┐ ┌ Trust ─────┐ │
├────────────────────────────────────┤
│ ▸ All findings (12)  [Status▾][Sev▾]│  ← collapsed; each row: icon, 1 line,
│   ⚠ No opening hours · GBP · 19 Oct │    source, observed_at, coverage, limit
│     ▸ Why it matters / What to do  │    in a drawer
├────────────────────────────────────┤
│ ┌ Keep this report ──────────────┐ │  ← anonymous viewer
│ │ [Save to workspace] [Share] [⎙]│ │    existing report-access flow; explicit
│ └────────────────────────────────┘ │    consent, never bundled with marketing
└────────────────────────────────────┘
```

### 4.3 Today (workspace home), desktop

```
┌──────────┬───────────────────────────────────────────────────────────────┐
│ sidebar  │ Today › 天后            ⌘K   🔔2   ✦ Assistant   繁 ▾          │
│          ├───────────────────────────────────────────────────────────────┤
│ ⌂ Today  │ Good morning. 1 thing needs you.            Scan 19 Oct [HK]  │
│ ☑ Actions│ ┌─ Next best action ─────────────────────────┐ ┌─ Getting started ┐ │
│ ↗ Insight│ │ 3 review replies ready        [Inference]  │ │ ✓ Confirm business│ │
│ ▣ Busines│ │ Impact ●●●○  Effort ●○○  ~8 min  Risk low  │ │ ✓ Brand voice     │ │
│ ⚙ Setting│ │ Evidence: 3 unanswered of newest 5 · GBP   │ │ ○ Approve first   │ │
│          │ │ observed 19 Oct · coverage 60%             │ │ ○ Invite teammate │ │
│          │ │ [ Review & approve ]  [Edit]  [Skip]       │ │ ○ Schedule rescan │ │
│          │ └────────────────────────────────────────────┘ └───────────────────┘ │
│          │ Scan ─ Decide ─ Approve ─ Deliver ─ Prove   ← LoopRibbon (state)   │
│          │ ┌─ Since last comparable scan ──┐ ┌─ Impact vs effort ──────────┐ │
│          │ │ +4 pts · 2 fixed · 1 new issue│ │  hi │ •A      •B            │ │
│          │ │ or: "Not comparable: scoring  │ │     │     •C                │ │
│          │ │  version changed" (no number) │ │  lo └──────────────── effort│ │
│          │ └───────────────────────────────┘ └─────────────────────────────┘ │
│          │ Up next                                                           │
│          │ • Add opening hours   10 min   [Open]                             │
│          │ • Post this week      8 min    [Open]                             │
│          │ • FAQ for AI search   15 min   Needs 3 facts                      │
│ Usage 1/3│ Needs attention: Google connection expired  [Reconnect]           │
└──────────┴───────────────────────────────────────────────────────────────────┘
```

On mobile, the hero card sits above the fold with its button fully visible (the existing FA-04 test keeps guarding this). The matrix and "since last scan" stack below it, and the checklist collapses into a progress chip.

### 4.4 Actions queue and side-panel detail

```
┌──────────┬─────────────────────────────────────┬──────────────────────────────┐
│ sidebar  │ Actions                  [+ New ▾]  │ Reply to 3 reviews        ✕ │
│          │ [All 7][Needs input 1][Draft 2]     │ Draft → Needs approval →     │
│          │ [Awaiting approval 2][Approved 1]   │ 🔒Approved → Delivered       │ ← ApprovalFlow
│          │ [Delivered 1]   [Due ▾] [Location ▾]│ ──────────────────────────── │
│          │ ┌─────────────────────────────────┐ │ v2 (draft) ▾   Compare v1↔v2 │ ← VersionDiff
│          │ │☐ Reply to 3 reviews  Awaiting  ▸│ │ ┌──────────────────────────┐ │
│          │ │   GBP · 8 min · High            │ │ │ Thank you for visiting…  │ │
│          │ ├─────────────────────────────────┤ │ │ (editable; saving = new  │ │
│          │ │☐ Opening hours   Needs input   ▸│ │ │  version, approval reset)│ │
│          │ ├─────────────────────────────────┤ │ └──────────────────────────┘ │
│          │ │☐ Weekly post     Draft         ▸│ │ Evidence  [Observed] GBP 19 Oct│
│          │ └─────────────────────────────────┘ │ ▸ Why this priority          │
│          │ [Approve 2 selected] ← only items   │ ▸ History (audit trail)      │
│          │  marked safe (no missing facts,     │ ──────────────────────────── │
│          │  owner/manager in scope)            │ [Request changes] [Approve v2]│ ← ApprovalBar
│          │                                     │ After approve: [Copy] [Export]│
│          │                                     │ Usage: counts 1 of 3 on first │
│          │                                     │ export. Undo = new draft.     │
└──────────┴─────────────────────────────────────┴──────────────────────────────┘
```

Rules shown in the panel:
- Approving locks that exact version (padlock).
- Editing an approved version creates a new draft and resets approval. The panel shows "v3 · draft · approval reset".
- Export or copy counts one delivery only on the first export of an approved version. The counter animates once.
- Viewers see the panel read-only, with a `PermissionDenied` strip in place of the ApprovalBar.
- Bulk approve applies only to items flagged safe. Each item still goes through the existing approve route one at a time; no new API is introduced.

---

## 5. Product decisions

| Date | Decision | Effect on the plan |
|---|---|---|
| 2026-10-19 | **Product name: Kinnso OS** | Replaces SME Scanner, Visibility Workspace, Growth Workspace and the other names in UI copy, metadata, the OG image, sitemap and README. The rename is applied phase by phase, with metadata finished in Phase 7, and recorded in the CLAUDE.md decisions log at the start of Phase 1. |
| 2026-10-19 | **Guardrail items G-1 to G-7 ship first as a separate PR** | Done in [YNWAforever/smeassistant#94](https://github.com/YNWAforever/smeassistant/pull/94), ahead of Phase 1. |
| 2026-10-19 | **OAuth-verified claim is the intended production path** (`WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=true`) | The Phase 5 first-run wizard is designed around "Verify with Google" as the main ownership step, with staff assignment as the fallback. Turning the flag on in Vercel is an owner/provider action outside this repo. It needs the Google OAuth client and the claim redirect URI registered (see `docs/integration/DEPLOY.md`). `.env.example` keeps its fail-closed default. |
| 2026-10-19 | **Dark mode: workspace only** | Phase 1 tokens define light and dark for the owner workspace (`.workspace-shell` and its overlays). The public site stays light. The stray shadcn `dark:` utilities are scoped so they no longer fire on public pages under OS dark mode. |
| 2026-10-19 | **Fonts: system fonts, no CJK web font** | Phase 1 builds one tuned stack per locale (zh-HK: PingFang HK → Microsoft JhengHei → Noto Sans HK; zh-TW: PingFang TC → Microsoft JhengHei → Noto Sans TC), with `:lang()` line-height and line-breaking rules. No added font bytes. |

### Still open

1. **Assistant name.** If you don't choose one, it is shown as "Kinnso OS assistant", or a plain "Ask" button.
2. **Bulk approve:** allowed at all? If yes, for which templates?
3. **Fix Pack drafts:** fold them into Actions, or retire the Home card?
4. **Create / Offers / Starter pack:** merge them into one "New" flow?
