# smeassistant: feature, navigation and journey audit (read-only)

Date: 2026-10-19 · Repo: `/home/user/smeassistant` (working tree as found; nothing modified).
All paths are relative to the repo root. `ws` = `app/[locale]/owner/[workspaceSlug]`.

---

## 1. Owner workspace navigation as implemented

### 1.1 Shell wiring

| Layer | File:line | What it does |
|---|---|---|
| Layout | `ws/layout.tsx:21-38` | `requireMembership` (fails closed), then `loadWorkspaceContext` + `countUrgentActions` → `buildShellWorkspace` → `WorkspacePageFrame` (env bar only for `is_demo`). |
| Shell data type | `components/product-ui.tsx:54-70` | `ShellWorkspace`: name, locations, usage, account, unread count, `urgentActions`, `assistant` ids, `offersEnabled`. |
| Shell | `components/workspace-shell.tsx:65-206` | Desktop sidebar, top bar, mobile bottom nav. |
| Primary nav list | `components/workspace-shell.tsx:46-56` | Fixed 4 items (no flags). |

### 1.2 Primary nav (desktop sidebar and mobile bottom nav use the same list)

| # | Item | Href | Icon | Badge / notes | Source |
|---|---|---|---|---|---|
| 1 | Home (今日焦點) | `{base}` | Home | active also on `/{locale}/owner` (desktop only, :140 vs :196) | `workspace-shell.tsx:52` |
| 2 | Actions | `{base}/actions` | FileClock | urgent-action count badge (desktop only, :141,147; mobile has none) | `:53` |
| 3 | Create | `{base}/create` | WandSparkles | — | `:54` |
| 4 | Insights | `{base}/insights` | BarChart3 | — | `:55` |
| 5 | More | `{base}/more` | MoreHorizontal | active for `/more,/assets,/calendar,/activity,/settings,/offers,/packs` | `:104-105, 151-155, 199-201` |

Every primary href goes through `scopedHref` (`?location=`) (`:76`).

**Top bar** (`workspace-shell.tsx:174-190`): section label (derived from pathname, `:79-97`), `ContextualAssistant` "Ask operator" (live when `workspace.assistant` set, else demo; surface derived from path `:106-116`), notification bell → `{base}/settings/notifications` with unread dot, `LocaleSelect`, `DemoBadge` when demo.
**Sidebar header/footer**: workspace switcher → `/owner/select-workspace` (`:126`); usage "Approved deliveries n / allowance" (`:161-165`); account button → also `/owner/select-workspace` (`:166`). There is no sign-out or settings entry in the sidebar.

### 1.3 "More" page (`components/workspace/more-view.tsx:9-40`, route `ws/more/page.tsx:13-16`)

| Group | Item | Href | Location-scoped? | Gate |
|---|---|---|---|---|
| content | Brand assets | `{base}/assets` | yes | — |
| content | Offers | `{base}/offers` | yes | `offerPromotionsEnabled() && !isDemo` (`more/page.tsx:15`, `more-view.tsx:17`) |
| content | Brand profile | `{base}/settings/brand` | no | owner-only page |
| history | Calendar | `{base}/calendar` | **no** (drops `?location`) | — |
| history | Activity | `{base}/activity` | **no** | — |
| settings | Locations | `/owner/select-workspace` (leaves the workspace) | no | — |
| settings | Integrations | `{base}/settings/integrations` | no | owner-only |
| settings | Team & roles | `{base}/settings/team` | no | owner-only |
| settings | Notifications | `{base}/settings/notifications` | no | member |
| settings | Plan & billing | `{base}/settings/billing` | no | owner-only |

Not linked anywhere in the nav: `{base}/packs/[packId]` (reached only from the Home pack card, `pack-card.tsx:144,161,183`). `ShellWorkspace.offersEnabled` is computed (`lib/workspace/shell.ts:103`) but `WorkspaceShell` never renders an Offers item; only the section label (`workspace-shell.tsx:91-92`) and More use it. The doc comment at `product-ui.tsx:68` ("the Offers nav entry renders only…") is stale.

### 1.4 Feature flags (all `=== "true"` exact; default off)

| Flag | Helper | Gates (UI) | Gates (API) |
|---|---|---|---|
| `OFFER_PROMOTIONS_ENABLED` | `lib/workspace/offers-flag.ts:8` | More link; `ws/offers/page.tsx:25` notFound; action detail offer bits `ws/actions/[actionId]/page.tsx:103`; shell `lib/workspace/shell.ts:103` | `app/api/offers/_shared.ts:11`; offer templates in runs `lib/workspace/runs.ts:367` |
| `WORK_PACKS_ENABLED` | `lib/workspace/packs-flag.ts:8` | Home pack card via `loadHomeWorkPacks` `lib/workspace/packs.ts:60`; `ws/packs/[packId]/page.tsx:30` notFound | `app/api/packs/_shared.ts:10` |
| `CONTEXTUAL_ASSISTANT_ENABLED` | `lib/assistant/flag.ts:5` | (indirect: suggestions empty) | `app/api/assistant/run/route.ts:51,66` (contextual intents 404 + `origin`), `app/api/assistant/suggestions/route.ts:30` |
| `PREVIEW_DRAFT_ENABLED` | `lib/preview/flag.ts:7` | `/start/[slug]` `app/[locale]/start/[slug]/page.tsx:27,35`; report card `r/[slug]/page.tsx:39` | `app/api/start/[slug]/preview/route.ts:63` |
| `ACTION_BULK_ASSIGN_ENABLED` | `lib/workspace/bulk-flag.ts:2` | bulk dialog on Actions `ws/actions/page.tsx:52` | `app/api/workspaces/[workspaceId]/actions/bulk/route.ts:11` |
| `GBP_REPLY_PUBLISH_ENABLED` | `lib/publishing/flag.ts:6` | `GbpPublishCard` panel state `lib/publishing/page-state.ts:67` (else disabled "Publish directly · Connection required", `action-detail-client.tsx:999`) | `app/api/versions/[versionId]/publish/guard.ts:21`, `app/api/deliveries/[deliveryId]/reply/route.ts:35` |
| `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` | `lib/oauth/claim-flow-flag.ts:12` | onboarding Google vs "Ask Fimmick" branch (`onboarding-page.tsx:256-268`); select-workspace and sign-in completion copy | `app/api/oauth/google/claim/{start:37,callback:70}` |
| `ASSISTED_ASSIGNMENT_ENABLED` | `lib/workspace/assignment-flag.ts:12` | `/ops/access-requests` decision controls | `app/api/ops/access-requests/[requestId]/route.ts:20` |
| `INVITATION_MAIL_ENABLED` | `lib/mail/feature-flags.ts:11` | Team page `ws/settings/team/page.tsx:21` | members + resend routes |
| `REPORT_RECOVERY_ENABLED` (+ mail open) | `lib/mail/feature-flags.ts:15-21` | `/r/[slug]/recover` notFound; recover link on report/unlock | `api/report-access/{recover,redeem}` |
| `WORKSPACE_COMPLETION_ENABLED` | inline | — | `app/api/internal/workspace-scan-completion/route.ts:12` |

None of the flags changes the primary nav; flags only add or remove secondary destinations and in-page cards.

---

## 2. Feature overlap analysis

### 2.1 Surface inventory (who renders what)

| Feature | Primary render site | Data | Also shown on |
|---|---|---|---|
| Actions list | `ws/actions/page.tsx` → `actions-list-view.tsx`; tabs All / Needs input / Drafts / Approvals / Completed (`:35-41`) | `actions` + latest run/version rollups (`ActionOverview`) | Home priority card + "Open actions" top 3 (`home-brief.tsx:116-131, 227-235`); Create "recommended starting points" (`create-view.tsx:183`); Calendar "Planned work" (due-dated actions, `calendar-view.tsx:37`); pack card / pack page items; offer promotion panel rows |
| Action detail | `ws/actions/[actionId]` → `action-detail-client.tsx` (1041 lines); tabs Draft & approval / Source evidence / Workflow states / Version & audit history (`:766`) | action, versions, runs, measurements, audit rows, owner checks, publish panel | — |
| Versions | Action detail editor + History tab (`:1025-1036`) | `output_versions` | Actions "Drafts" tab; Home month metric "awaiting approval" (`home-brief.tsx:217`); FixPackCard (different table: `agent_runs`) |
| Approvals | Action detail approval panel (`:983-993`) + sticky bar (`:1039`) | `approve_output_version` RPC | Actions "Approvals" tab; FixPackCard Approve/Reject for `agent_runs` (`fix-pack-card.tsx:15-24`) — second approval system |
| Delivery / export / GBP publish | Action detail delivery card (`:994-1000`) + `GbpPublishCard` (`gbp-publish-card.tsx:23-30`) | `deliveries`, `workspace_usage`, publish panel | Sidebar usage (`workspace-shell.tsx:161`); Billing page usage |
| Runs | Action detail Workflow tab (`:1014-1023`) | `action_runs` | Pack card / pack view / offer panel sequential-run rows (`use-sequential-runs`); Activity (`run.*` audit events) |
| Activity | `ws/activity/page.tsx` → `activity-view.tsx` + `ProblemsList` | `audit_events` + `loadWorkspaceProblems` | Action detail History tab "audit mini" (per action); Home NeedsAttentionCard (problems, 2 max) |
| Problems list | `problems-list.tsx` on Activity (`activity/page.tsx:28`) | `OwnerProblem[]` (`lib/workspace/problems`) | NeedsAttentionCard on Home (`needs-attention-card.tsx:10`, "more" → Activity) |
| Needs-attention card | Home top (`ws/page.tsx:62-72`) | same problems, filtered to location | Activity |
| Insights | `ws/insights/page.tsx` → `insights-view.tsx` | snapshot series, per-metric cards, AEO presence, change ledger | Home "results" disclosure: score card, proof card, month metrics, change ledger, evidence gallery (`home-brief.tsx:164-208, 271-281`); action Evidence tab "Before and after" measurements (`:1011`) |
| Assets | `ws/assets` → `assets-view.tsx` | `assets` | Action detail asset select for social posts (`:891`); Offers asset picker (`offers/page.tsx`) |
| Calendar | `ws/calendar` → `calendar-view.tsx` (46 lines: cadence + due actions) | `scan_schedules` cadence, actions `due_at` (`lib/workspace/queries-pages.ts:978`) | Home month-brief "Rescan cadence" (`home-brief.tsx:211-215`); action header "Due" (`action-detail-client.tsx:723`) |
| Create | `ws/create` → `create-view.tsx` | templates + open action summaries | Creates an action with `run: true` then routes to action detail (`create-view.tsx:106,138`) — i.e. an entry into Actions |
| Offers (flag) | `ws/offers` → `offers-view.tsx` + `OfferPromotionPanel` (`offers-view.tsx:230`) | `offers`, creates one action per channel | Action detail (offer templates) |
| Work packs / "Visibility starter pack" (flag) | Home `PackCard` (`home-brief.tsx:238`), `ws/packs/[packId]` → `pack-view.tsx` | creates 3 actions, runs each in sequence (`pack-card.tsx:17-24`) | Actions list (the same 3 actions) |
| Fix Pack card | Home "other tasks" disclosure (`home-brief.tsx:236-243`) | upstream `agent_runs` via `/api/workspaces/[id]/fix-pack-drafts` (`fix-pack-card.tsx:11`) | Links to `actions?view=drafts` (`:98`), which lists `output_versions`, not `agent_runs` |
| Owner review check | Action detail panel for `review-response` (`action-detail-client.tsx:736`) | owner check records | Home follow-up card `home-review-followup` (`home-brief.tsx:135-150`) |
| Visibility Operator | `components/pocket-assistant/*`; `/api/assistant/run`, `/api/assistant/suggestions` | 15 intents (`lib/pocket-assistant/contracts.ts:3-19`) + 2 revision intents | Top bar (every page, `workspace-shell.tsx:184`); Home "Ask why this comes first" (`home-brief.tsx:161`); Actions "Compare priorities" (`actions-list-view.tsx:96`); Create (`create-view.tsx:171`); Action detail "Revise… as a new version" (`:920`); public: landing, sample report, demo workspace |
| Rescan | Home results tools `RescanButton` (`home-brief.tsx:167`) | `/api/workspaces/[id]/rescan` | Problem item control (`problem-item.tsx:48`) |
| Integration health | Home trust disclosure (`home-brief.tsx:260-269`) | brief.integrations | Settings › Integrations; problem item "reauthorise" (`problem-item.tsx:54`) |
| Evidence gallery | Home (`home-brief.tsx:281`) | signed evidence URLs | Report `/r/[slug]` (`report-view.tsx:214`) |

### 2.2 Overlap matrix (● = same data shown, ○ = partial/related, blank = none)

| | Home | Actions list | Action detail | Insights | Activity | Calendar | Create | Packs | Offers | Fix Pack | Assistant |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Open/priority actions | ● | ● | | | | ○ due | ● | ● | ○ | | ○ compare |
| Draft versions awaiting approval | ● count | ● tab | ● | | ○ events | | | ○ next to review | | ○ other table | ○ |
| Approve / reject control | | | ● | | | | | | | ● (agent_runs) | |
| Runs / generation state | | ○ phase | ● | | ○ events | | ○ starts | ● | ● | | ○ drafts |
| Score / coverage / ledger | ● | | ○ | ● | | | | | | | ● explain |
| Measurements (before/after) | ● proof | | ● | ● | | | | | | | ○ |
| Problems | ● (2) | | | | ● (all) | | | | | | |
| Audit history | | | ● per action | ● | | | | | | | |
| Rescan cadence | ● | | | | | ● | | | | | |
| Integration health | ● | | ○ | | | | | | | | |

### 2.3 Consolidation candidates

1. **Two approval systems.** FixPackCard approves upstream `agent_runs` on Home while every other approval happens on action detail over `output_versions`. Its "Open drafts" link (`fix-pack-card.tsx:98`) points to a list that does not contain those drafts. Fold Fix Pack drafts into the Actions "Drafts"/"Approvals" tabs, or label them as a separate source.
2. **Three "start generating" entry points** (Create, Starter pack, Offer promotions) each create actions and then run them. One "New work" flow with modes for goal, pack or offer, ending in Actions, would cover all three.
3. **Home vs Insights.** The Home "results" disclosure repeats Insights: score card, proof, month metrics, change ledger and evidence. Keep a one-line summary on Home and link to Insights.
4. **Calendar is thin** (46 lines: cadence plus due-dated actions), and both are already on Home or Actions. Make it a filter or view on Actions (for example "Due") and show cadence in Insights or Settings.
5. **Problems are split** between NeedsAttention (Home, 2 items) and the ProblemsList on Activity. Activity is an audit log, so problems would fit better in a dedicated "Needs attention" view or an Actions tab.
6. **Assistant has 5+ launch points** inside the workspace (top bar plus per-page triggers) on top of the global trigger. Keep the top bar launcher and use context-aware suggestions instead of per-page buttons.
7. **More mixes two kinds of link.** It holds content pages (Assets, Offers, Brand profile) and settings, and "Locations" leaves the workspace. Calendar and Activity drop `?location`. Split it into "Library" (Assets, Offers, Brand) and "Settings".

---

## 3. Journey click-count (actual UI)

Assumptions: HK market, desktop, a business found by search, website and Instagram skipped, OAuth claim **on** (path A). Path B (flag off, the shipped default) is shown separately. "Clicks" counts deliberate taps. Typing a field is counted under "fields", not as a click.

### 3.1 Landing → first scan result

| # | Screen | Required input | Clicks | Fields | Wait | Est. time | Running clicks / fields / page loads |
|---|---|---|---|---|---|---|---|
| 1 | `/` → 307 to `/zh-HK` (`proxy.ts:22-27`; also `app/page.tsx:12`) → landing hero form (`landing-page.tsx:327`) | — | 0 | 0 | page load | 3 s | 0 / 0 / 1 |
| 2 | Landing: type business, market radio (default from `initialMarket`, `:70`), submit → `/scan?market&business` (`:291-300`) | business name | 1 | 1 | — | 10 s | 1 / 1 / 2 |
| 3 | `/scan` step 1: auto-search runs 450 ms after the last keystroke (`scan-page.tsx:173-181`, `lib/funnel/business-search.ts:9`). Pick a candidate (`:457-463`), Continue (`:750`) | candidate or manual entry (`:305-311`) | 2 | 0 | SerpApi search 2–5 s | 15 s | 3 / 1 / 2 |
| 4 | Step 2: market preset; industry Select, district Select (required `:313-319`); objective default `better_visibility` (`lib/funnel/scan-start.ts:62`); Continue | industry, district | 5 | 2 | — | 20 s | 8 / 3 / 2 |
| 5 | Step 3: website / Instagram optional (IG finder optional); Continue | — | 1 | 0 | — | 5 s | 9 / 3 / 2 |
| 6 | Step 4: consent checkbox (required `:321`), Start → `POST /api/scan/start` → push `/scanning/{jobId}` (`:241-290`) | consent | 2 | 1 | ~1 s | 5 s | 11 / 4 / 3 |
| 7 | `/scanning/[jobId]`: POST `/api/scan/process` once; poll status 1 s × 1.5 up to an 8 s cap, 30 s after 90 s, give up at 15 min / 50 attempts (`lib/funnel/scan-progress.ts:16-19, 155-179`); auto-navigates 1.5 s after a terminal status (`scanning-page.tsx:295`) | — | 0 | 0 | **scan ~5–13 min** (CLAUDE.md §7) | 5–13 min | 11 / 4 / 3 |
| 8 | `/r/[slug]` public preview (≤12 findings + unlock banner `report-view.tsx:243-255`) | — | 0 | 0 | page load | 3 s | 11 / 4 / 4 |

**Subtotal to first result: 11 clicks, 4 inputs (1 typed and 3 chosen), 4 page loads, about 1 min of effort plus a 5–13 min scan wait.**

### 3.2 Anonymous result → first approved action

| # | Screen | Required input | Clicks | Fields | Wait | Est. time | Running clicks / fields / loads |
|---|---|---|---|---|---|---|---|
| 9 | Report → "Unlock" (`report-view.tsx:254`) → `/unlock/[slug]` | — | 1 | 0 | load | 3 s | 12 / 4 / 5 |
| 10 | Unlock form: objective preset, channel preset WhatsApp/LINE (`lib/funnel/unlock.ts:22-24`), contact input (`unlock-page.tsx:179`), delivery consent (required, `:204`); optional recovery email, discussion and marketing consents. Submit → `POST /api/report-access/unlock` → `router.push(reportUrl)` (`:87-102`) | contact, delivery consent | 2 | 2 | ~1 s | 40 s | 14 / 6 / 6 |
| 11 | Report (viewer) → "Claim" CTA → `/owner/sign-in?claim=` (`components/report/dashboard-summary.tsx:66-73`) | — | 1 | 0 | load | 5 s | 15 / 6 / 7 |
| 12a | Sign-in with **Google** (`components/auth/sign-in-flow.tsx:112-127`): button, then Google account chooser → `/auth/callback` → `/owner/sign-in/complete` | Google account | 2 | 0 | external OAuth 5–15 s | 20 s | 17 / 6 / 9 |
| 12b | *(alt.)* **Email code**: email (`:128-154`) + Send, wait for mail, type the 6-digit code (`:198-209`) + Verify → replace to complete | email, code | 2 (+ mail-app switch) | 2 | **email delivery 10 s–2 min**; resend locked 60 s | 1–3 min | (17 / 8 / 8) |
| 13 | `/owner/sign-in/complete` → `POST /api/owner/sign-in/complete` → `finishClaim` → `requires_verification` (self-service off) → `/owner/onboarding?claim=&claimed=` (`lib/identity/complete-sign-in-ports.ts:24-46`) | — | 0 | 0 | 1–2 s | 3 s | 17 / 6 / 10 |
| 14A | Onboarding step 1 (OAuth **on**): "Verify ownership with Google" → `/api/oauth/google/claim/start?slug=` → Google consent (GBP read scope) → callback → `/owner/onboarding?claim=` (`claim/callback/route.ts:53-60,185`) | Google account that manages the GBP | 3–4 | 0 | external OAuth 10–30 s | 45 s | 21 / 6 / 13 |
| 14B | *(default, flag off)* "Ask Fimmick to assign your workspace" (`onboarding-page.tsx:268-269`): contact by WhatsApp/LINE/email, staff assigns via `/ops/access-requests`, owner signs in again (repeat steps 11–13) | contact message | 1 + repeat ~4 | 1–3 | **human wait: hours to days** | n/a | — |
| 15 | Step 1 Continue → step 2 basics: name and address prefilled, voice default `warm`, approved claims optional (`onboarding-page.tsx:159-160, 297-307`); Finish → `POST /api/workspaces/claim` (snapshot, website checks, actions) → push to matched action **or** home (`:195-229`) | workspace name (prefilled) | 2 | 0 (1 if edited) | 3–8 s (5 s website fetch) | 30 s | 23 / 6 / 14 |
| 16 | Home: priority card CTA → action detail (`home-brief.tsx:124`). Skipped when the scan intent matched an action (`claim/route.ts:58-65`) | — | 1 | 0 | load | 10 s | 24 / 6 / 15 |
| 17 | Action detail: "Generate" (`action-detail-client.tsx:920`, `generate()` `:396`) → `POST /api/actions/[id]/run` (maxDuration 60, LLM timeout 45 s, `lib/agents/index.ts:46`) | — | 1 | 0 | **LLM 10–45 s** | 45 s | 25 / 6 / 15 |
| 17b | *(often)* needs-input: required inputs form (`:885`, `submitInputs` `:434-455`), for example the review selection for review replies or 3 owner facts for FAQ; submit re-runs | 1–3 facts | 1–2 | 1–3 | LLM again 10–45 s | 1–2 min | (27 / 9 / 15) |
| 18 | Approve: "Approve vN" → confirm dialog (`:989`, `approveDraft` `:611-616`) | optional comment | 2 | 0 | ~1 s | 15 s | **27 / 6 / 15** |

**Minimum totals for landing → first approved action (Google sign-in, OAuth claim on, no needs-input):**
- **About 27 clicks, 6 required inputs (2 typed, 4 chosen or checked), about 15 page loads or navigations.**
- **3 external hand-offs:** Google sign-in, Google OAuth claim, and either the LLM or the email code.
- **Time:** about 5–7 min of owner effort plus the 5–13 min scan, so roughly **10–20 min end to end**.
- With an email code instead of Google: +2 fields and a 10 s–2 min email wait.
- With needs-input: +1–2 clicks, 1–3 fields and one more LLM run.
- With the shipped default (`WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=false`) **the journey cannot finish in one session.** It stops at step 14B until Fimmick staff assign the workspace.

Friction notes:
- The report → unlock → report → claim → sign-in path bounces back to the report before the claim CTA appears (steps 10–11).
- Google is used twice, once to sign in and once to verify the claim, with separate consent screens.
- Onboarding step 1 has a Continue click that adds no input (`onboarding-page.tsx:328`).

---

## 4. Route inventory: `app/[locale]/**` pages

| Route | Purpose | Auth / gate | Notes |
|---|---|---|---|
| `/` (root `app/page.tsx`) | redirect to `/zh-HK` | — | `redirect()` at `:12`; the proxy also 307s |
| `/[locale]` | Landing (hero search, outcomes) | public | outcomes link to `/scan?intent=` (`landing-page.tsx:581`) |
| `/scan` | 4-step scan setup | public | |
| `/scanning/[jobId]` | progress, polling, stuck card | public | |
| `/r/[slug]` | report (public, viewer, member, staff) | grant cookie | `notFound` for an unknown slug |
| `/r/[slug]/recover` | redeem a one-use recovery token | **flag** `recoveryAvailable()` else 404 (`:16`) | noindex |
| `/unlock/[slug]` | contact + consent unlock | public | |
| `/start/[slug]` | one unsaved AI review-reply preview for a viewer-grant holder | **flag** `PREVIEW_DRAFT_ENABLED` else 404 (`:27,35`) | |
| `/sample-report`, `/demo-workspace` | fixed Kam Man House demo data | public | guardrail 12 |
| `/pricing`, `/methodology`, `/trust` | marketing / policy | public | |
| `/legal/privacy`, `/legal/terms` | legal documents | public | legacy `/privacy`, `/terms` 308 here |
| `/unsubscribe` | mail unsubscribe confirm (GET is read-only) | token | |
| `/owner/sign-in` | Google or email-code sign-in (`claim`, `returnTo`, `method`, `intent`, `plan` params) | public (not gated, `locale-redirect.ts:52-56`) | |
| `/owner/sign-in/complete` | post-auth completion: bind invites, claim, route | public | noindex |
| `/owner/onboarding` | 2 steps: ownership (Google or Fimmick), basics | user | OAuth branch gated by flag |
| `/owner/select-workspace` | membership picker; `?denied=` | `requireUser` (`:41`) | legacy `/owner` 308s here |
| `ws` (Home) | Today brief, problems, packs / Fix Pack | member | `?forbidden=1` banner |
| `ws/actions`, `ws/actions/[actionId]` | list (5 tabs) / review, approve, export | member | bulk is flag-gated |
| `ws/create` | goal → action + run | member (editors act) | |
| `ws/insights` | trends, measurements, ledger | member | |
| `ws/assets` | uploads, rights | member | |
| `ws/calendar` | cadence + due actions | member | |
| `ws/activity` | audit events + problems | member | |
| `ws/more` | secondary links | member | |
| `ws/offers` | offers + promotion drafts | **flag** `OFFER_PROMOTIONS_ENABLED` (`:25`) | |
| `ws/packs/[packId]` | one starter pack | **flag** `WORK_PACKS_ENABLED` (`:30`) | not in nav |
| `ws/settings/{brand,integrations,team,billing}` | owner settings | owner (managers and viewers redirected by `requireMembership`) | |
| `ws/settings/notifications` | email prefs + in-app list | member | target of the bell |
| `/ops/access-requests`, `/ops/access-requests/[requestId]`, `/ops/failures` | **internal** operator queues (English only, noindex, unlinked) | `requireOperator()` (`ops/access-requests/page.tsx:25`, `ops/failures/page.tsx:37`); assignment decisions flag `ASSISTED_ASSIGNMENT_ENABLED` | Note: under `/{locale}/ops`, so not owner-gated by the proxy; the gate is server-side |

Redirects from code (`lib/auth.ts`): signed-out → `/owner/sign-in?returnTo=` (`:78`); non-member → `/owner/select-workspace?denied=` (`:149`); role or scope failure → `{ws}?forbidden=1` (`:152`). Server actions in `app/[locale]/owner/actions.ts:15-23` redirect after sign-out.

---

## 5. Redirect / alias mechanics (for a future IA change)

| Mechanism | Where | Behaviour | How to extend |
|---|---|---|---|
| Legacy path map | `lib/funnel/locale-redirect.ts:85-99` (`LEGACY_PATHS`, `resolveLegacyRedirect`) applied first in `proxy.ts:16-21` | **308**. Matches **single-segment** paths only (`rest.length !== 1` → null), with or without a locale prefix: `owner→/owner/select-workspace`, `privacy→/legal/privacy`, `terms→/legal/terms`, `scanner→/scan` | Add keys for one-segment aliases. Multi-segment aliases (for example `/{l}/owner/{ws}/calendar` → `…/actions?view=due`) need a new resolver, because workspace paths are dynamic and the current function rejects them. |
| Locale prefixing | `resolveLocaleRedirect` (`locale-redirect.ts:21-30`), `proxy.ts:22-27` | **307** to `/zh-HK{path}` for any unprefixed path except passthrough roots (`api, auth, _next, _vercel, opengraph-image, twitter-image, icon, apple-icon`) and paths containing a dot | — |
| Proxy matcher | `proxy.ts:64-66` | excludes `api`, `auth/`, `_next`, `_vercel`, OG/icon routes, dotted paths | Redirects for `/api/*` must live in route handlers. |
| Owner gate | `proxy.ts:33-61`, `isOwnerGatedPath` (`locale-redirect.ts:52-56`) | `/{l}/owner/*` except `sign-in*` → 307 to sign-in with `returnTo` | New owner IA paths are gated automatically if they stay under `/owner/`. |
| Root redirect | `app/page.tsx:12` | `redirect('/zh-HK')` | — |
| `next.config.ts` | `next.config.ts:1-25` | **No `redirects()` / `rewrites()`**; only turbopack alias, `transpilePackages`, images | Declarative redirects could go here (Next evaluates them before the proxy). Mixing that with the proxy map would split the source of truth, so extending `LEGACY_PATHS`-style logic in the proxy is more consistent. |
| `vercel.json` | `vercel.json` | region `sin1` and branch deploy toggles; no redirects or crons | — |
| Page-level `notFound()` for flags | offers, packs, start, recover | a dark feature looks like a missing page | A removed or renamed page should get a proxy redirect, not a `notFound`. |
| Query-param views | `actions?view=all\|needs_input\|drafts\|awaiting_approval\|completed` (`actions-list-view.tsx:35-41`), `?location=` everywhere | Cheap aliasing target: a retired page can redirect to an Actions view. | |
