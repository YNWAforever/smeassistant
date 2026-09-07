# Scan Result Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text-heavy report with the approved direction A dashboard, using existing measurements and authorized photo evidence.

**Architecture:** Keep ReportPage a server-rendered composition over ReportProps. Add a pure presentation adapter and focused summary, statistics, comparison, priority, and gallery components. Preserve the existing server report projection; only the accessible gallery interaction needs a client component.

**Tech Stack:** Next.js 16.2.6, React 19.2.6, TypeScript, Tailwind 4, existing Radix UI, Vitest, Testing Library, Playwright, pnpm 9.12.0.

## Global Constraints

- Approved specification: docs/superpowers/specs/2026-09-07-scan-result-dashboard-design.md.
- Mockup numbers, competitors, targets, and image placeholders are illustrative only and must never become production fallback data.
- Missing, unavailable, failed, and measured zero remain distinct.
- Existing module scores are rubric scores, not market percentiles or industry averages.
- Do not send hidden full-report data to the browser or implement locking through CSS.
- This is a report presentation slice. Preserve scoring, authentication, unlock semantics, rate limiting, provider integrations, snapshot limits and retention, and existing authorization roles.
- Do not add paid provider usage, emails, shared database migration, deployment, domains, or historical photo backfill.
- Use fixture-only automated coverage. Do not call live providers or assume skipped E2E cases passed.
- Work in smeassistant, never Documents/smescanner. Preserve unrelated work; explicitly stage each task's files.

## Execution baseline

The spec commit is 70a5e46 on codex/neon-auth-request-proxy in C:/Users/laich/Documents/smeassistant/.worktrees/neon-migration. The prior implementation is already merged upstream. Before implementation, use using-git-worktrees to prepare an isolated codex/scan-result-dashboard branch from freshly fetched origin/main and bring across the spec and this plan. Reconcile intervening changes before edits; do not reset or overwrite the existing worktree. Read applicable repository instructions in the chosen checkout. Discover code through the project graph, with targeted fallback for files missing from its index.

Current ReportProps has no scan timestamp, canonical engagement value, or numeric module score field. Do not parse formatted module.value back into a number. Task 1 handles these gaps explicitly; this plan does not assume that optional metrics already exist.

## File map

- lib/funnel/report-props.ts: retain the current access-filtered boundary; add typed numeric score and optional timestamp presentation fields without changing authorization.
- lib/funnel/report-dashboard.ts: pure card and comparison derivation from ReportProps, never database/provider access.
- lib/funnel/report-dashboard.test.ts: deterministic measurements and public-boundary cases.
- components/report/dashboard-summary.tsx: existing score/comparison semantics and concise header.
- components/report/dashboard-metrics.tsx: metric cards, module bars and scoped competitor comparisons.
- components/report/dashboard-priorities.tsx: up to three existing priorities with detail anchors.
- components/report/evidence-gallery.tsx: authorized thumbnail groups and accessible preview.
- components/report/dashboard.test.tsx and evidence-gallery.test.tsx: rendering and interaction contracts.
- components/report-view.tsx: compose the sections and preserve full details in disclosures.
- lib/copy.ts: localized dashboard labels using its existing locale structure.
- app/globals.css: report-scoped responsive styles; preserve unrelated page styles.
- e2e/report-dashboard.spec.ts: local fixture page keyboard and layout checks.

## Task 1: Define truthful dashboard data

**Interfaces:** Export buildReportDashboard(props: ReportProps): ReportDashboard from lib/funnel/report-dashboard.ts. Reuse the existing ReportProofData and ReportComparison types. Use this discriminated metric contract:

```ts
export type DashboardMetric = {
  key: string;
  label: string;
  source: string;
} & (
  | { state: "measured"; value: number; unit: "count" | "rating" | "percent"; sampleSize: number | null }
  | { state: "unavailable"; reason: string }
);
export interface DashboardComparison {
  query: string;
  engine: string;
  observedAt: string;
  source: string;
  metric: "reviews" | "rating";
  sampleSize: number;
  rows: Array<{ name: string; value: number; currentBusiness: boolean }>;
}
export interface ReportDashboard {
  metrics: DashboardMetric[];
  comparisons: DashboardComparison[];
}
```

- [ ] Add failing tests to lib/funnel/report-dashboard.test.ts using a fully typed local ReportProps fixture: public access returns empty metrics/comparisons even if a caller supplies proof; null proof returns unavailable authorized cards; followers=0 remains measured; negative/nonfinite values are unavailable; absent Google reviews differs from zero.
- [ ] Run `corepack pnpm exec vitest run lib/funnel/report-dashboard.test.ts`; confirm the new module import or behavior fails.
- [ ] Implement the adapter's access guard first:

```ts
if (props.access === "public" || props.locked) {
  return { metrics: [], comparisons: [] };
}
```

- [ ] Derive followers, Google rating and review count from authorized proof, validating finite nonnegative numbers and rating <=5. Resolve labels through copy[props.locale].funnel.report. Keep unavailable reasons localized. Do not insert sample defaults.
- [ ] Trace existing canonical engagement and search measurement producers before exposing those two cards. Reuse their typed values and denominator if available through the authorized projection; otherwise emit unavailable. AEO runs with available=false cannot enter the denominator. Merchant runs lack an explicit availability field, so do not infer an aggregate success rate from found alone. Do not introduce a new formula or infer a metric from finding text.
- [ ] Derive comparisons per merchant run, keeping query, engine and source groups separate. Compare run.mapsRating or run.mapsReviews only with competitor values that explicitly identify the same Maps source and metric. Omit a group when the current business value is absent or no compatible competitor remains. Deduplicate exact same name/source observations within that run; sampleSize is the displayed row count. Keep different queries as separate groups; never call them industry averages.
- [ ] Extend ReportModuleRow with optional score: number | null, populated directly from preview.coverage.modules in buildReportProps. Missing scores render unavailable bars. Audit sample-report construction and all literal props fixtures for compatibility.
- [ ] Trace a real scan timestamp through the existing loader; add optional scannedAt only if an existing safe report field supports it. Missing time displays date unavailable. Merchant generatedAt labels that comparison only, not the whole scan.
- [ ] Run the focused test and existing report mapping/view-model tests, check the diff, and commit only this adapter/projection slice with message `feat: derive truthful report dashboard metrics`.

## Task 2: Render summary, cards and honest comparisons

**Consumes:** ReportProps; ReportDashboard from Task 1.
**Produces:** DashboardSummary({ report }: { report: ReportProps }) and DashboardMetrics({ report, dashboard }: { report: ReportProps; dashboard: ReportDashboard }).

- [ ] Add rendering tests in components/report/dashboard.test.tsx for numeric zero, unavailable cards without zero-width implied scores, first_scan without deltas, and incomparable reasons. Use renderToStaticMarkup for server components and Testing Library for interactive controls.
- [ ] Run `corepack pnpm exec vitest run components/report/dashboard.test.tsx`; confirm expected failures before implementation.
- [ ] Extract the score/title section into DashboardSummary, retaining ScoreDial, comparison.kind, sample badges and access notes. Show coverage and an existing supported summary; disclose long summary text. Never label an inference as a measured fact.
- [ ] Implement numeric cards and score bars in DashboardMetrics. Use this rendering rule, with localized labels and formatted numbers:

```tsx
{metric.state === "measured" ? (
  <strong>{new Intl.NumberFormat(report.locale).format(metric.value)}</strong>
) : (
  <p>{metric.reason}</p>
)}
```

- [ ] Render measured module scores with a native meter min=0 max=100 and a visible numeric label; leave unavailable modules as text. Render each competitor group with its query/engine/date/source/sample size and numeric row values. Scale review-count bars to that group's maximum; rating bars use max=5. Do not show competitor percentile, uplift or historical charts.
- [ ] Add zh-HK, zh-TW and en copy for key statistics, rubric score, observed search comparisons, unavailable measurement, sample size and unavailable date. Keep technical provider errors in expandable explanations with a concise friendly reason beside the metric.
- [ ] Add report-scoped CSS for a responsive metric grid, wrapping labels and visible focus; no chart dependency. At <=640px use one column. Keep essential uncertainty visible.
- [ ] Rerun rendering and adapter tests, then commit only this slice with message `feat: add visual report summary and benchmarks`.

## Task 3: Compact priorities and preserve detailed evidence

**Consumes:** ReportProps.priorities and findingGroups.
**Produces:** DashboardPriorities({ report }: { report: ReportProps }); stable anchors `report-detail-${module}` on authorized module disclosures.

- [ ] Add tests for zero/two/three priorities, preserved rank ordering, no fabricated actions, and public output excluding private evidence/action/draft content.
- [ ] Run `corepack pnpm exec vitest run components/report/dashboard.test.tsx`; confirm the expected failures.
- [ ] Extract priority cards using report.priorities.slice(0, 3), the existing localized labels and tone. Show a brief action/summary and a link to the corresponding module details when available. For locked reports link to the existing unlock URL; never create nonexistent evidence anchors.
- [ ] Compose ReportPage in approved order: summary, authorized statistics, module/competitor bars, priorities, authorized gallery, detailed disclosures. Preserve unlock CTA, sample badge, member/staff affordances, existing contact CTAs and assistant behavior.
- [ ] Wrap existing proof panels, findings and methodology/limitations in native details/summary. Keep all existing details reachable. Module deep links must open the corresponding disclosure when activated, or target a visible module heading immediately before it; do not scroll users into hidden content.
- [ ] Guard authorized components with `props.access !== "public" && !props.locked`; preserve the upstream projection guard rather than relying on this UI guard alone.
- [ ] Run rendering, report mapping and report-access tests; commit the slice with message `feat: simplify report priorities and detailed findings`.

## Task 4: Accessible photo evidence gallery

**Consumes:** items: ReportEvidenceItem[] and locale: ReportProps["locale"], passed only from the authorized report composition.
**Produces:** EvidenceGallery({ items, locale }) in components/report/evidence-gallery.tsx, a small client component. No database imports or full ReportProps client prop.

- [ ] Add evidence-gallery.test.tsx cases for stored thumbnails, metadata-only and failed items, broken-image fallback, six-item initial group limit, reveal remaining count, keyboard opening/closing and focus restoration.
- [ ] Run `corepack pnpm exec vitest run components/report/evidence-gallery.test.tsx`; confirm failures.
- [ ] Group by existing provider identifier without dropping other evidence providers. Display six thumbnails per provider initially and a localized reveal control for the rest. A failed or metadata-only item remains a labeled metadata card; only status=stored plus a nonnull mediaUrl may render a photo.
- [ ] Use the installed Radix Dialog primitive for previews and focus trapping. Each thumbnail is a button with a descriptive accessible name; Dialog.Title identifies the photo, Dialog.Close is keyboard accessible, Escape closes, and focus returns to the trigger. Use img onError to show the metadata fallback. Never request a fresh scan or fetch private storage directly.
- [ ] Keep source and captured/published timestamps available in the preview. Use lazy images with fixed aspect ratio and object-fit; wrap long captions in a disclosure. Validate source links with existing URL-safety handling.
- [ ] Add localized labels and reduced-motion styling. Run gallery tests and existing lib/evidence/load-authorized.test.ts, then commit with message `feat: present authorized report photo galleries`.

## Task 5: Fixture browser acceptance and boundary regression

**Files:** e2e/report-dashboard.spec.ts; components/report/dashboard.test.tsx; lib/funnel/report-dashboard.test.ts. Reuse the existing local sample report route and owned acceptance fixture setup; never create a production fixture route.

- [ ] Add semantic assertions to the existing sample-report browser journey. Determine its locale-prefixed path from the route graph before writing page.goto; use that route with the existing fixture server config.
- [ ] Add 375px and 1440px viewport checks. The overflow assertion is:

```ts
expect(await page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth
)).toBe(true);
```

- [ ] Assert summary/statistics precede long findings, disclosure controls work by keyboard, gallery preview closes with Escape and returns focus, and long Chinese/English fixture text wraps. Use local deterministic image fixtures; block external image/provider requests through existing transport guards.
- [ ] Extend projection tests with sentinel private values and assert those strings/URLs never appear in public serialized output. Cover viewer/member/staff full read access with existing authorization fixtures; do not change draft authority tests or roles.
- [ ] Ensure the scenario matrix covers full/partial/failed data, zero, unavailable metrics, absent benchmarks, first/comparable/incomparable scans, all three media states and all supported locales. Keep noninteractive edge cases in component tests; browser tests cover actual navigation/keyboard/layout.
- [ ] Run `corepack pnpm exec vitest run lib/funnel/report-dashboard.test.ts components/report/dashboard.test.tsx components/report/evidence-gallery.test.tsx lib/report/view-model.test.ts lib/evidence/load-authorized.test.ts` and `corepack pnpm exec playwright test e2e/report-dashboard.spec.ts`.
- [ ] Save labeled local fixture screenshots for desktop/mobile review; do not use screenshots alone as assertions. Commit tests with message `test: verify dashboard fixtures and report access boundaries`.

## Task 6: Normal repository gate and reviewable handoff

- [ ] Set the fixture environment in the chosen PowerShell session:

```powershell
$env:SCAN_SOURCES = 'fixture'
$env:VITEST_MAX_WORKERS = '1'
$env:NEON_INTEGRATION = '1'
$env:RATE_LIMIT_SECRET = 'ci-rate-limit-secret-not-for-production'
$env:NEXT_PUBLIC_SITE_URL = 'http://localhost:3100'
```

- [ ] Run the current CI sequence, stopping to diagnose each failure before dependent steps:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:secret-boundary
corepack pnpm test:no-supabase
docker info
docker pull postgres:16
corepack pnpm db:verify
corepack pnpm test:integration
corepack pnpm build
corepack pnpm exec playwright install chromium
corepack pnpm e2e
corepack pnpm e2e:acceptance
```

- [ ] Require Docker's Linux engine for owned fixture suites; never replace it with a shared database. Linux CI uses `playwright install --with-deps chromium`; preserve that workflow. Capture exact exit codes and test totals, including skips and environment blockers. Do not claim hosted acceptance from fixture results.
- [ ] Review the final diff against the spec: access boundary, sample denominators, comparison source grouping, null-versus-zero, no invented statistics, accessible gallery and mobile overflow. Follow the selected execution workflow's reviewer requirements; integrate one task at a time.
- [ ] Run `git diff --check` and verify only intended files changed. Record validation and remaining operational gates in the implementation handoff. Do not automatically deploy, merge, submit contact forms, or call providers. Use finishing-a-development-branch after verification to offer integration options.

## Plan self-review

All six approved page sections map to Tasks 2-4. Measurement and authorization rules map to Tasks 1 and 5. Missing model fields are explicitly unavailable unless backed by existing canonical data. Accessibility, locale, photo failures and responsive layout map to Tasks 2, 4 and 5. Task 6 reproduces the current repository gate and separates fixture verification from hosted actions. This document is an execution plan, not evidence that any implementation or test has passed.
