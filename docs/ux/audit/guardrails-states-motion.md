# Guardrail, State, Motion and A11y Audit — `smeassistant` (read-only)

Date: 2026-10-19 · Scope: `components/`, `app/[locale]/**`, UI-facing `lib/` · No repo files modified.

Overall: the codebase is unusually disciplined about guardrails 1–4. Most surfaces already handle null as "—"/"Withheld" and carry inline comments about past fixes. The findings below are the remaining gaps, listed by severity.

---

## A. Guardrail check (CLAUDE.md §0)

### A1. Unavailable/null rendered as 0 (guardrail 2) — highest priority

| # | Sev | File:line | Snippet | Problem |
|---|---|---|---|---|
| 1 | **High** | `lib/share.ts:63` → `app/[locale]/r/[slug]/opengraph-image.tsx:64` | `score: Math.round((ms[key]?.score as number) ?? 0)` → `` `${moduleLabel[m.key]} ${m.score}` `` | The share/OG card prints an unmeasured module (e.g. an Instagram scan with no handle) as **"IG 0"**. Public unfurls show unavailable as zero. It also reads legacy `module_scores` and not `module_results`. |
| 2 | **High** | `components/workspace/action-detail-client.tsx:1010` | `({signed(Number(m.delta), 1)})` | `Number(null) === 0`, so a measurement with a null delta renders **"(0)"** ("no change") next to `before ?? "—" → after ?? "—"`. Pass `m.delta` without coercion (`signed` already handles null). |
| 3 | **High** | `lib/workspace/queries-pages.ts:728-729` → `components/workspace/home-brief.tsx:217-218` | `resolved: diff?.comparable ? diff.resolved_findings.length : 0` | With no comparable diff, Home's month strip shows **"0 issues resolved · Across comparable scans"** and **"0 new regressions"**. The true value is Unknown. Use `null` and render "—" plus FactType Unknown. |
| 4 | **High** | `components/workspace/insights-view.tsx:76-77` | `<strong>{model.ledger.resolved.length}</strong>` … "Across eligible scans" | The resolved/regressed stat cards render even when `!comparable` (the grid sits outside the `comparable` guard at :74). Unknown is shown as **0**. |
| 5 | Med | `lib/workspace/snapshots.ts:154`, `:244` | `coverage: toNumber(row.coverage) ?? 0` / `toNumber(job.score_coverage) ?? 0` | A legacy or failed job with null `score_coverage` becomes a **0% coverage** snapshot. Downstream (`insights-view.tsx:37,78,86`, `home-brief.tsx:175`, `select-workspace-page.tsx:89`) then says "Coverage 0%" instead of "unavailable". |
| 6 | Med | `components/workspace/home-brief.tsx:184` | `` `${sources?.measured ?? 0} measured` … `${(sources?.total ?? 4) - (sources?.measured ?? 0)} unavailable` `` | When `sources` is undefined, the page invents "0 measured · 4 unavailable" beside a real score. Hide the line when `sources` is missing. |
| 7 | Low | `components/workspace/home-brief.tsx:183` | `coverage={scorePercent(snapshot.coverage) ?? 0}` | `ScoreDial` accepts `coverage: number \| null` and hides null (`product-ui.tsx:154`). The `?? 0` defeats that and shows "0% coverage". Pass `scorePercent(...)` directly. |
| 8 | Low | `components/workspace/insights-view.tsx:106` | `Math.round((surface.points.at(-1)?.presenceRate ?? 0) * 100)` | Safe today, because points are filtered to length > 0 and `presenceRate` is a number. The `?? 0` is still a latent 0% fallback; prefer "—". |
| 9 | Low | `lib/workspace/metrics.ts:165` | `(num(p.like_count) ?? 0) + (num(p.comment_count) ?? 0)` | `ig.avg_engagement` counts posts with hidden or missing like counts as 0 engagement. That deflates the average. Exclude those posts, or mark the metric Estimated. |
| 10 | Low | `components/ui/progress.tsx:26` | `translateX(-${100 - (value ?? 0)}%)` | Vendored shadcn component. Only affects the scanning progress bar, which always passes a number. |

### A2. Numbers shown without source / observed_at / coverage nearby (guardrail 1)

| File:line | Number | Missing |
|---|---|---|
| `components/select-workspace-page.tsx:88-94` | `Score ${score} · Coverage ${coverage}%` per location | No observed date, no source. A stale snapshot reads as current. |
| `components/workspace/home-brief.tsx:171-185` (score card) | ScoreDial score/coverage/delta | Coverage is present and observed_at is in the page eyebrow (:106). The card has **no FactType**, though the proof card next to it has one. |
| `components/workspace/insights-view.tsx:75-78` | insight-stat cards (delta, resolved, regressed, coverage) | No FactType and no observed date on the cards. The date only appears in the series below. |
| `components/workspace/insights-view.tsx:62` | Per-location `score / 100` (all-locations view) | No observed date. |
| `components/workspace/actions-list-view.tsx:71` | `priorityFactors` points ("+15 · +8") | Labelled "Why this priority". There is no FactType Inference here, while the detail tab (`action-detail-client.tsx:1009`) does label it Inference. |
| `components/landing-page.tsx:647`, `public-demo-workspace.tsx:55` | `ScoreDial score={62} coverage={78} delta={-4}` | Demo surfaces with a DemoBadge (OK). There is no observed date for the sample snapshot. |

Report surfaces (`components/report/dashboard-metrics.tsx`, `scan-metrics.tsx`, `dashboard-summary.tsx`) are exemplary. Every metric has source, `<time>`, sample size, a ProviderBadge for non-measured modules and an explicit "unavailable" text.

### A3. Causal / outcome language

The grep covered en/zh-HK/zh-TW for caused, led to, boost, increase, grow revenue, 帶來, 提升, 令…增加, 更多客 and similar terms. No active causal claims were found. All "revenue/bookings" mentions are disclaimers, for example `home-brief.tsx:198`, `action-detail-client.tsx:1009` (FactType Unknown), `public-pages.tsx:147,151` and `assistant/templates.ts:80,117,123`.

Residual soft claims:

| File:line | Text | Note |
|---|---|---|
| `lib/copy-dictionaries.ts:1146` (zh-HK), `:1217` (zh-TW) | 「讓更多顧客找到你」 ("let more customers find you") | Implies an outcome on customers. The en version (`:1075`) says "Be easier to find", which is softer. The locales are not equivalent. Align zh with en. |
| `lib/copy-dictionaries.ts:1074/1145/1216` | "A clearer growth day…" / 增長 | Brand wording only; acceptable. |
| `components/landing-page.tsx:201` (en), `:170` (zh) | "Response rate **improved by 9 points after** the previous reply batch" — labelled `<FactType type="Observed" />` at `:648` | An action-linked change must be **Attributed** (guardrail 4), not Observed. |
| `components/landing-page.tsx:563` | Sample case labelled `Observed`, while its caveat (`:280`) says "temporal association" | Should be `Attributed`. The label and the caveat contradict each other. |
| `lib/copy-workspace.ts:398` | gbp-post: "a short update keeps it active in local results" | Unlabelled inference about ranking. |
| `lib/copy-workspace.ts:401` | ig-highlights: "answer the questions visitors ask first" | Asserts customer intent with no Unknown label. |
| Demo inconsistency | landing `22% → 31%` (`landing-page.tsx:558-560`) vs demo workspace `31% → 18%` (`public-demo-workspace.tsx:49`) | Same sample metric, contradictory story across demo surfaces. |

### A4. Fact-type labels

`<FactType>` is rendered in 13 files: home-brief (6), action-detail-client (6), report-view (4), scanning-page (3), dashboard-summary (3), insights-view (2), landing (2), and one each in create-view, actions-list-view, scan-stuck-card, dashboard-metrics, public-pages and public-demo-workspace.

Claims that lack a label:

- Home score card, month metrics and integration-health rows (`home-brief.tsx:170-221,260-268`).
- Insights stat cards and series/table (`insights-view.tsx:74-87`).
- Select-workspace score lines.
- Calendar (`calendar-view.tsx`) and Activity (factual logs, low risk).
- Action card priority factors (an Inference that is not labelled).
- `FactType` (`product-ui.tsx:298-303`) is a bare `<span>` with no `title` or `aria` description. Screen readers hear "Observed", but the meaning of the six levels is never explained in context.

### A5. Trend lines across non-comparable scans (guardrail 3)

- `insights-view.tsx:34` with `polish.css:1063-1074`: the connector is a solid `::before`, and `.is-gap` makes it dashed. **Correct.**
- Edge case: when `point.comparable` is true but the composite is withheld (`score === null`, `INSUFFICIENT_INDEPENDENT_CHANNELS`), a solid line still runs into "—". It should break or dash when either end's score is null.
- `lib/workspace/queries-pages.ts:737` (Home) and `:952` (Insights) fill the ledger from **any** diff (`diff ? {...}`) and do not gate on `diff.comparable`. Home then renders each item as "Regressed in the latest comparable scan" with FactType Observed (`home-brief.tsx:274-275`), next to a "Comparison unavailable" article (`:277`). This only matters if upstream ever writes non-empty `*_findings` on non-comparable diffs, so verify. Gate the ledger on `comparable` either way.
- Icons: `home-brief.tsx:171` and `insights-view.tsx:75` show `<TrendingUp />` whenever delta is null (no comparable scan). That is an upward-trend glyph on an Unknown. Use a neutral icon.

### A6. Demo data on non-demo pages (guardrail 12)

| File:line | Import | Verdict |
|---|---|---|
| `components/product-ui.tsx:42`, `components/scanning-page.tsx:14`, `lib/funnel/report-props.ts:8` | `import type { Capability, ProviderState } from "@/lib/demo-data"` | Type-only (erased at runtime). Hygiene issue: these should import from `@/lib/domain` (§3.4). |
| `lib/funnel/sample-report.ts:2` | runtime `actions, merchant, providers` from demo-data | Used by `/sample-report` only. OK. |
| `app/api/assistant/run/route.ts:12` | `createDemoAssistantRun` | Demo mode only, by design (§3.8). OK. |
| `components/landing-page.tsx:254-280, 556, 646` | Hard-coded 錦汶館 sample case/brief | Demo-labelled (DemoBadge / "Demo data" eyebrow). Acceptable under §5, but the numbers are hard-coded and not sourced from `lib/demo-data.ts`. |
| `components/public-pages.tsx:196-203` `SelectWorkspacePage` | "Signed in as owner · Demo" | Dead prototype export: the real route uses `components/select-workspace-page.tsx`. Delete it to avoid accidental reuse. |
| `components/workspace-shell.tsx:184` | `mode={workspace.assistant ? "live" : "demo"}` | A real workspace with no assistant context falls back to **demo** mode inside `/owner/*`. That would show Kam Man House answers in a real workspace. Verify `workspace.assistant` is always set for non-demo workspaces. |

---

## B. Missing states matrix

There are **no** `loading.tsx`, `error.tsx` or `global-error.tsx` files anywhere. The only special file is `app/not-found.tsx`. Every owner route is `force-dynamic`, and the layout performs three sequential awaits (`requireMembership` → `loadWorkspaceContext` → `countUrgentActions`) before any paint. On client navigation the old page stays frozen with no pending indicator. Any thrown query falls through to Next's default unstyled error page, which is not localised and has no retry.

Legend: ✓ present · ✗ missing · partial · n/a

| Page | Empty | Loading | Error + retry | Partial evidence | Permission (viewer / OOS manager) | Notes |
|---|---|---|---|---|---|---|
| `/` landing | n/a | ✗ (CSS entrance only) | ✗ | n/a | n/a | static |
| `/scan` | ✓ candidates "not my business" | partial (inline busy) | ✓ form errors + retry | ✓ manual entry path | n/a | client-heavy |
| `/scanning/[jobId]` | n/a | ✓ progress + polling | ✓ failed / stalled / dead-lettered cards | ✓ partial-result card | n/a | pulse keeps looping when **stalled** (C) |
| `/r/[slug]` | partial | ✗ | ✗ (notFound only) | ✓ "Partial evidence" badge, withheld score, ProviderBadges | ✓ public preview vs viewer/member | loader throw → default error page |
| `/r/[slug]/recover` | n/a | ✓ Suspense | ✓ | n/a | n/a | only route with Suspense |
| `/unlock/[slug]` | n/a | partial | ✓ form errors | n/a | n/a | |
| `/sample-report`, `/demo-workspace` | n/a | ✗ | ✗ | ✓ (sample) | n/a | fixed data |
| `/owner/sign-in` (+complete) | n/a | partial | ✓ (sign-in-flow) | n/a | n/a | |
| `/owner/onboarding` | ✓ | ✗ | partial — lookups `catch` + console.error, degrade silently | n/a | n/a | failures are invisible to the user |
| `/owner/select-workspace` | ✓ no-workspace copy | ✗ | ✗ | ✗ (no observed date) | ✓ `?denied=` alert | |
| `/owner/[ws]` Home | ✓ no snapshot / no location / no actions | ✗ | ✗ | ✓ withheld score, coverage, "Not comparable" | partial — role gates CTAs; **`?forbidden=1` from requireMembership is never read**, so the redirect is silent | |
| `…/actions` | ✓ "No actions match" | ✗ | partial — invalid cursor alert + "Refresh list"; other errors throw | ✗ | ✓ viewer banner; OOS manager — no list-level note | |
| `…/actions/[id]` | ✓ | partial (spinners, "Saving…") | ✓ toasts, 409 conflict, offline banner | partial | ✓ viewer + "outside your location scope" banner (:748) | most complete page |
| `…/create` | ✓ "No evidence-led goals" | partial | ✓ toasts + retry | ✗ | ✓ "Read only for this role or location scope" | |
| `…/insights` | ✓ no scan / no comparable | ✗ | ✗ | ✓ gap marks, coverage, withheld | n/a (read-only) | 0-for-Unknown cards (A1#4) |
| `…/assets` | ✓ "No assets yet" | partial (upload spinner) | ✓ client upload errors | n/a | ✓ viewer banner; OOS via `asset.inScope` | |
| `…/calendar` | ✓ no cadence / no due | ✗ | ✗ | n/a | n/a | |
| `…/activity` | ✓ "No events yet" | ✗ | ✗ | n/a | n/a | |
| `…/more` | n/a | ✗ | ✗ | n/a | ✗ — lists Integrations to every role, which then bounces managers/viewers | |
| `…/offers` | ✓ | partial | ✓ | partial | ✓ viewer banner | |
| `…/packs/[packId]` | partial | ✗ | ✓ `role=alert` + retry | n/a | ✓ `canAct` incl. inScope | |
| `settings/brand` | n/a | partial | ✓ client | n/a | ✓ role banner | |
| `settings/integrations` | partial | ✗ | partial (client) | ✓ website state from snapshot | ✗ — `minRole: "owner"` silently redirects to Home `?forbidden=1` with no message | |
| `settings/team` | ✓ | partial | ✓ client | n/a | ✓ read-only table + banner | |
| `settings/billing` | ✓ | ✗ | partial | n/a | ✓ "no billing authority" | |
| `settings/notifications` | ✓ (client) | partial | ✓ client | n/a | ✓ `mail.ownerOnly` note | |
| `/unsubscribe`, `/start/[slug]`, legal | n/a | ✗ | partial | n/a | n/a | |

Priorities:

1. Add `app/[locale]/owner/[workspaceSlug]/error.tsx` (localised, with "Try again" calling `reset()`) and `app/global-error.tsx`.
2. Add `loading.tsx` skeletons for the workspace segment and for `/r/[slug]`.
3. Make Home read `?forbidden=1` and show the existing `permission-banner`. Hide the Integrations link (More, Home "Manage" at `home-brief.tsx:261`) for non-owners.
4. Make onboarding lookup failures visible to the user.

---

## C. Motion

### C1. `components/motion-director.tsx`

This is a client component mounted only inside `PublicPageFrame` (`product-ui.tsx:280`), so it runs on public pages only, never in the workspace. It re-runs on every `pathname` change.

1. **Header scroll state.** A passive scroll listener toggles `data-scrolled` on `.public-header` when `scrollY > 8`. The CSS is `polish.css:137` and `editorial.css:1742`, with a box-shadow/background transition. It runs even under reduced motion. That is harmless, since it is a state change with no motion.
2. **Scroll reveal.** It only runs when `matchMedia("(prefers-reduced-motion: no-preference)")` matches and `IntersectionObserver` exists.
   - Targets: `.public-site main > section`, `main > div > section`, `.content-page > *` and `.report-page > section`.
   - Elements whose top is already within 92% of the viewport height are **never hidden**.
   - Elements further down get `data-reveal="pending"` and flip to `"in"` on intersection (`rootMargin -8%` bottom), then are unobserved.
   - Cleanup disconnects the observer and forces any still-pending element to `"in"`, so nothing stays invisible.
3. **Hero pointer light.** On `.landing-hero`, for fine pointers with motion allowed, `pointermove` is rAF-throttled and sets the `--mx`/`--my` custom properties.
   - The landing now renders `.ed-hero`, not `.landing-hero` (`landing-page.tsx:312`). This branch is probably **dead code**; verify.

**Test** (`motion-director.test.tsx`): four cases with a fake IntersectionObserver and matchMedia:

- An above-fold section is untouched and a below-fold one is pending.
- Intersection sets `"in"`.
- Reduced motion leaves no attributes and creates no observer.
- Unmount restores pending sections to `"in"`.

Not tested: the scroll header toggle, the pointer light, and the pathname re-run, where a previous route's `"in"` elements are re-queried.

### C2. CSS motion inventory

| Where | What | Reduced-motion | Notes |
|---|---|---|---|
| `polish.css:403-495` | `rise-in` .9s entrance on hero copy, search card, `.content-page-intro`, `.flow-layout` (staggered 0.06–0.28s) | gated `no-preference` ✓ | CSS-only, runs pre-hydration |
| `polish.css:425-466` | `[data-reveal]` opacity + translate3d reveal (0.9–1s) and grid-child cascade (0.08s steps); loop-ribbon draws left to right (0.06s steps) | gated ✓ | transform/opacity ✓ |
| `polish.css:475-480` | `.score-dial` sweeps the `--score` custom property over 1.6s (`@property`) | gated ✓ | Only inside `[data-reveal]` sections. Workspace and report dials never sweep (inconsistent). |
| `polish.css:483` | `.owner-story-sticker` `float-tilt` 6s **infinite** | gated ✓ | autoplaying loop on landing; `.owner-story-sticker` may no longer exist after the editorial redesign |
| `polish.css:486` | `.scan-pulse` `pulse-ring` 2.4s **infinite**, animating **box-shadow** (paint, not transform/opacity) | gated ✓ | Stopped for `ready / failed / dead_lettered` (`polish.css:1486`) but **not for `stalled`** (`ScanViewState` includes it, `scanning-page.tsx:299`), so it pulses "working" on a stalled scan. |
| `polish.css:718` | `.not-found-page > *` rise-in | gated ✓ | |
| `editorial.css:1616-1655` | `.ed-landing` section reveal (0.8/0.9s), grid cascade (0.07s steps), `ed-rise` hero entrance | gated ✓ | A second, parallel system with different durations, delays and easing token (`--ed-ease-out` vs `--ease-out`, same curve). |
| `editorial.css:297, 922, 1408` | hover lift `transform` + box-shadow 0.35–0.4s | **not gated** | |
| `ramp-refresh.css:80, 714, 1460, 2396`; `polish.css:161,171` | card/button hover transforms 0.18–0.45s | gated for some selectors only (`ramp-refresh.css:2222`) | `editorial.css` hovers are not covered |
| `globals.css:38` | Global `prefers-reduced-motion: reduce` kill switch: all animation/transition durations 0.01ms | ✓ | Backstop; makes most per-rule gating redundant |
| `globals.css:24` | `.goal-card { transition: .18s ease }` (= `all`) | via global | `all` can animate layout properties |
| `components/ui/sidebar.tsx:221,232,477` | `transition-[width]`, `[left,right,width]`, `[width,height,padding]` | via global | Layout properties. Inert here because `collapsible="none"` (`workspace-shell.tsx:120`). |
| `components/ui/progress.tsx:25` | `transition-all` on the indicator (transform) | via global | Scanning bar steps animate smoothly ✓ |
| tw-animate-css | `animate-in/out`, `fade-*`, `zoom-in-95`, `slide-in-from-*` only in vendored `components/ui/*` (dialog, sheet, dropdown, context-menu, menubar, navigation-menu, alert-dialog) | via global | No app component uses tw-animate directly |
| `animate-spin` | busy spinners: action-detail (9), offers (4), gbp-publish (4), team (3), notifications (3), assets (3), offer-promotion (2), integrations (2) | via global | Infinite, but only while busy ✓ |
| `sign-in.module.css:23`, `evidence-gallery.module.css:22`, `polish.css:1520` | local reduced-motion overrides | ✓ | |

### C3. Gaps and inconsistencies

- **Missing motion or feedback on key state changes.** Approve, export and copy rely on sonner toasts (41 toast calls in action-detail-client), with no in-place transition on the approval panel, version list or delivery card. The state flips instantly. The `delivery_state` change (Approved → Exported) has no visual confirmation beyond the toast.
- **Rescan complete.** `rescan-button.tsx` fires toasts; Home does not re-render or announce the new snapshot. There is no motion or live region when the scan lands.
- **Scan progress.** The Progress bar animates and `collector-list` is `aria-live="polite"` ✓. Collector cards swap state with no transition, and the `ready` state has no celebratory or confirming motion (the pulse just stops).
- **Workspace has zero motion layer.** MotionDirector is public-only. The workspace ScoreDial renders static, while public sections sweep. That is a deliberate calm for a work tool, but it is inconsistent.
- **Excess.** There are two parallel reveal systems with stacked grid cascades on landing (up to 0.32s delay plus 1s duration). Combined with hero entrance stagger, content finishes appearing about 1.3s after scroll. The infinite `float-tilt` sticker and `pulse-ring` are the only decorative loops.

---

## D. Accessibility (static)

| # | Sev | File:line | Issue |
|---|---|---|---|
| 1 | Med | `components/workspace/action-detail-client.tsx:862` | `<Textarea id="input-owner-review">` has **no label**: no `<Label htmlFor>`, no `aria-label`. Only a `<summary>` precedes it. Add `aria-labelledby` pointing at the summary, or a visible label. |
| 2 | Med | `components/ui/button.tsx:24-31` | Default button is `h-9` (36px), `sm` `h-8` (32px), `icon` `size-9`, `icon-xs` `size-6` (24px). There is no `pointer: coarse` override anywhere in `app/*.css`. `size="sm"` is used in action-detail (4), team (3), home-brief (3), fix-pack (2), brand (2), pack-items, offers, offer-promotion, gbp-publish. |
| 3 | Med | CSS targets < 44px | `polish.css:566` `.public-menu-trigger` 40px · `polish.css:826` `.action-tab-list > a` 40px · `polish.css:900` `.queue-pages > a` 40px · `polish.css:985-996` draft-editor/approval buttons 40px · `globals.css:16` sidebar menu-button 40px · `globals.css:76` `.locale-trigger` 40px · `ramp-refresh.css:180` `.public-nav a` 40px · `ramp-refresh.css:376` `.hero-links a` 40px · `ramp-refresh.css:2230` `.assistant-launcher` 42px · `editorial.css:306` `.ed-pill-icon` 37.6px (inside a larger pill, OK) · `workspace-shell.tsx:185` notification icon button `size="icon"` 36px. WCAG 2.2 AA (24px) passes; the 44px target fails. |
| 4 | Low | `app/editorial.css:530-537` | `.ed-field input:focus-visible { outline:none; box-shadow… }` is then overridden by `[aria-invalid="true"]` (same specificity, later rule). An invalid focused input loses its distinct focus ring. A box-shadow-only ring is also invisible in Windows High Contrast; add `outline: 2px solid transparent`. |
| 5 | Low | `components/auth/sign-in.module.css:9` | `.input:focus { outline:none }` replaced by box-shadow. Same forced-colors caveat. |
| 6 | Info | `polish.css:1477,1480,1482,1513`; `sign-in.module.css:27` | `outline:none` on programmatically focused headings, errors and main. Intentional (focus management targets); `.form-error:focus-visible` restores at :1478 ✓. |
| 7 | Low | `components/product-ui.tsx:298-303` | `FactType` badge has no accessible explanation (`title`/`aria-describedby`). "Attributed" or 「可能相關」 alone is jargon. |
| 8 | Low | `components/workspace/home-brief.tsx:171`, `insights-view.tsx:75` | Decorative trend icons are not `aria-hidden` and carry the wrong direction on null (A5). |
| 9 | Low | `components/report/evidence-gallery.tsx:49,57`; `components/workspace/evidence-gallery.tsx:30` | `alt` comes from scraped review/post text (`item.text?.slice(0,120)`). It is present but third-party text, possibly in another language with no `lang` attribute. |
| 10 | Info | Images | No `<img>` without `alt`. Landing `next/image` (`landing-page.tsx:358,395,399`) has alt ✓. Icon-only buttons: one (`workspace-shell.tsx:185`), and its inner `<Link>` has `aria-label` ✓. |
| 11 | Info | Headings | Multiple `<h1>` occur in `public-pages.tsx`, `auth/sign-in-flow.tsx` and `action-detail-client.tsx`, but in mutually exclusive branches or separate exported pages; no level skips detected. Workspace cards correctly use h2 under PageIntro's h1. |
| 12 | ✓ | Positive | Skip link (`polish.css:1497-1513`), `scroll-padding` for sticky bars, `role="img"` with a full aria-label on ScoreDial, `<meter>` with aria-labels in report bars, `aria-live` on scan collectors and the editor save status, accessible data table under the trend strip (`insights-view.tsx:83-87`). |

---

## Top 10 fixes (ordered)

1. OG card shows unmeasured modules as 0 (`lib/share.ts:63`).
2. `signed(Number(m.delta))` makes a null delta read as "0" (`action-detail-client.tsx:1010`).
3. Month and Insights resolved/regressed show 0 for Unknown (`queries-pages.ts:728-729`, `insights-view.tsx:76-77`).
4. Gate the ledger on `diff.comparable` (`queries-pages.ts:737,952`).
5. Add workspace `error.tsx` + `loading.tsx` and root `global-error.tsx`.
6. Surface `?forbidden=1` on Home, and hide owner-only links for managers/viewers.
7. Landing sample proof should be labelled `Attributed`, not `Observed` (`landing-page.tsx:563,648`). Align the zh hero with en ("讓更多顧客找到你").
8. Stop `.scan-pulse` on `stalled`.
9. Coverage `?? 0` in `snapshots.ts:154,244` and `home-brief.tsx:183-184`.
10. Label the owner-review textarea, and add a coarse-pointer 44px minimum for buttons and tabs.
