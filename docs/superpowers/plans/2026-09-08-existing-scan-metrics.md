# Existing Scan Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present honest IG sample and separate search/AI appearance metrics from existing stored evidence.

**Architecture:** Pure server-side derivation precedes presentation truncation. Authorized report models carry bounded, sanitized metrics; dashboard components render counts and exclusions without recalculating eligibility. Existing collectors, scoring, authorization decisions, database schema, and competitor comparisons remain unchanged.

**Tech Stack:** TypeScript, Next.js 16, React 19, Vitest, Playwright, pnpm 9.12, owned Docker/PostgreSQL fixtures.

## Global Constraints

- Approved specification: ../specs/2026-09-08-existing-scan-metrics-design.md.
- Work only in C:/Users/laich/Documents/smeassistant/.worktrees/neon-migration, branch codex/existing-scan-metrics. Never edit Documents/smescanner.
- Baseline origin/main: 88b912d9e79a9191d4bde758e9d0407d24b0f948. Fetch and reconcile later main changes before execution; preserve unrelated work.
- No new collection, provider calls, database migration, scoring formula, or combined visibility index belongs to this slice.
- Keep engagement averages and follower-based engagement rates unavailable in this phase.
- Public and locked report HTML, React Server Component payloads, and props must omit new metrics and private supporting evidence.
- Retain en, zh-HK, and zh-TW. No extra dependencies. Keep current role/draft boundaries and existing share-route membership behavior.
- Use fixture-only tests. No paid provider, actual email, shared database, live seeding, push, merge, or deployment during implementation.
- Stage explicit files. Integrate and independently review one task at a time. Record RED/GREEN evidence and exact commit for each task; controller owns final heavy gates.

## File responsibilities and shared contracts

New files:
- lib/report/scan-metrics/types.ts: presentation contracts only; safe to import as types.
- lib/report/scan-metrics/instagram.ts and instagram.test.ts: IG identity, count-quality, and date sample derivation.
- lib/report/scan-metrics/search.ts and search.test.ts: stored observation validation and separate eligible denominators.
- lib/report/scan-metrics/derive.ts and derive.test.ts: module guard and aggregate composition.
- components/report/scan-metrics.tsx and scan-metrics.test.tsx: localized server presentation and disclosures.
- e2e/acceptance/report-scan-metrics.spec.ts: owned report/unlock/browser evidence.
- docs/integration/2026-09-08-existing-scan-metrics-verification.md: final executed evidence.

Existing integration points: lib/report/load-report.ts, lib/report/view-model.ts, lib/funnel/report-props.ts, components/report/dashboard-metrics.tsx, components/report/dashboard.module.css, lib/copy.ts. Existing focused tests: lib/report/load-report.test.ts, lib/report/view-model.test.ts, lib/funnel/report-dashboard.test.ts, components/report/dashboard.test.tsx. Follow their fixture conventions rather than restructuring them.

Shared types to create in Task 1:

```ts
export type Exclusion = 'unknown' | 'failed' | 'unsupported' | 'no_answer' | 'conflict' | 'unidentified';
export interface Coverage {
  inspected: number;
  duplicates: number;
  excluded: Record<Exclusion, number>;
  truncated: boolean;
  evidenceTruncated: boolean;
}
export interface IgObservation {
  identity: string | null;
  postedAt: string | null;
  likes: number | null;
  comments: number | null;
  ambiguousZero: boolean;
}
export interface IgSample {
  distinctPosts: number;
  datedPosts: number;
  earliest: string | null;
  latest: string | null;
  engagement: 'unavailable_historical_counts';
  coverage: Coverage;
  observations: IgObservation[];
}
export interface SearchObservation {
  query: string;
  observedAt: string | null;
  outcome: 'present' | 'absent' | Exclusion;
}
export interface SearchMetric {
  engine: string;
  queryType: string | null;
  context: string;
  surface: 'organic' | 'maps' | 'ai';
  numerator: number;
  denominator: number;
  state: 'measured' | 'unavailable';
  coverage: Coverage;
  observations: SearchObservation[];
}
export interface ScanMetrics {
  instagram: IgSample | null;
  search: SearchMetric[];
}
export const MAX_INPUT_RECORDS = 1000;
export const MAX_EVIDENCE_ROWS = 50;
export const MAX_SEARCH_GROUPS = 50;
```

These are upper bounds per input stream, not promises of complete collection. Report truncation explicitly. If more than 50 search groups exist, reserve the last displayed disclosure for a localized omitted-group count; add `omittedSearchGroups: number` to ScanMetrics in Task 2 and carry it throughout. Do not silently omit groups. Keep eligibility and evidence limits separate.

## Task 1: Derive an honest IG sample

**Files:** Create the types, instagram implementation and test files listed above.
**Consumes:** stored rawData.ig.posts as unknown.
**Produces:** `deriveInstagramSample(rawIg: unknown): IgSample | null`.

- [x] Read the approved spec and the collector's rawPosts construction. Do not change collectors. Add a failing fixture test:

```ts
import { expect, it } from 'vitest';
import { deriveInstagramSample } from './instagram';
it('does not turn historical zero into engagement', () => {
  const sample = deriveInstagramSample({ posts: [
    { id: 'a', posted_at: '2026-09-01T00:00:00Z', like_count: 0, comment_count: 0 },
    { id: 'b', posted_at: '2026-09-02T00:00:00Z', like_count: 12 },
  ] });
  expect(sample?.distinctPosts).toBe(2);
  expect(sample?.datedPosts).toBe(2);
  expect(sample?.engagement).toBe('unavailable_historical_counts');
  expect(sample?.observations[0].ambiguousZero).toBe(true);
  expect(sample?.observations[1].comments).toBeNull();
});
```

- [x] Run `corepack pnpm exec vitest run lib/report/scan-metrics/instagram.test.ts`; require the missing-module failure before implementation.
- [x] Implement type-safe unknown-object reads, finite nonnegative integer counts, strict ISO calendar date validation, and bounded strings. Reject dates that normalize impossible calendar days. Prefer a nonempty bounded ID; otherwise accept a canonical HTTPS Instagram post/reel URL without credentials or sensitive query parameters. Use a maximum 300-character identity and discard query/hash from accepted post URLs. Never identify by caption, index, or date.
- [x] Apply deterministic first-1000-record processing; group identities before counting. Exact normalized repeats increment duplicates. Conflicting dates/counts become null field-by-field; a conflicting identity still contributes once to distinctPosts, but conflict coverage increments once per identity. Unidentified records never contribute to distinctPosts or date span. Missing posts is null (unavailable); an explicitly empty stored array produces a zero-length captured sample, not a claim of account inactivity.
- [x] Use this count rule and retain historical zero provenance:

```ts
const count = (v: unknown): number | null =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
const ambiguousZero = (likes: number | null, comments: number | null) =>
  likes === 0 || comments === 0;
```

- [x] Add table cases for invalid/nonfinite/fractional/negative counts; malformed dates; duplicate/conflicting identities; ID-less rows; seven valid posts (all seven counted); 1001 rows (truncated true); more than 50 observations (evidenceTruncated true); and a separate reels list (not counted). Assert exact counts and ranges, not snapshots of implementation internals.
- [x] Run focused tests and `corepack pnpm typecheck`. Review diff; stage the three new files and commit `feat: derive honest stored Instagram samples`.

## Task 2: Derive separate search and AI denominators

**Files:** Create search.ts/search.test.ts; extend types.ts with omittedSearchGroups as described.
**Consumes:** rawData.aeo as unknown.
**Produces:** `deriveSearchMetrics(rawAeo: unknown): { groups: SearchMetric[]; omittedGroups: number }`.

- [x] Trace packages/scoring/src/types.ts MerchantPerformanceEvidenceRun, packages/scan-engine/src/serpapi-normalizers.ts, and the collector's stored raw_refs. Read only; do not import a collector into report rendering.
- [x] Add a failed-request regression before implementation:

```ts
import { expect, it } from 'vitest';
import { deriveSearchMetrics } from './search';
it('does not count a failed query as absence', () => {
  const result = deriveSearchMetrics({ merchant_performance: { runs: [{
    id: 'failed', query: 'fixture cafe', query_type: 'discovery', engine: 'google_maps',
    serpapi: { status: 'Error', error: 'fixture failure' },
    merchant_presence: { maps_rank: null },
  }] } });
  expect(result.groups[0]).toMatchObject({
    surface: 'maps', numerator: 0, denominator: 0, state: 'unavailable',
  });
  expect(result.groups[0].coverage.excluded.failed).toBe(1);
});
```

- [x] Run `corepack pnpm exec vitest run lib/report/scan-metrics/search.test.ts`; require RED.
- [x] Normalize from stored merchant runs, preserving success/error, engine, query type, settings context, requested_at, presence and raw_refs before any UI slices. Legacy serpapi_runs are fallback only when no merchant-run collection exists, and only explicit available true is successful. Do not reuse sanitizer's missing-availability-is-true fallback. Treat mixed unsupported schemas as unknown.
- [x] Define context with stable JSON of market/language/location/device/map anchor from existing settings, bounded per value. Identity is stable run ID plus context, otherwise exact query/engine/query-type/context/requested-at. Detect identity collisions with inconsistent query/engine/context as conflicts instead of merging favorable results. Do not expose search IDs, raw errors, credentials, or provider URLs in presentation rows.
- [x] Create organic groups for google, Maps groups for google_maps, and AI groups for google/google_ai_mode/google_ai_overview. A positive safe integer surface rank proves presence only after success. For absent rank, require stored surface results/snippets with the matching organic/maps source; an empty or missing list and null rank is unknown. Do not equate local-pack rank with Maps rank. This conservative rule is intentionally narrower than general request success.
- [x] For AI, use explicit returned-answer evidence: google requires ai_overview_triggered true with retained answer text/references; AI engines require retained nonempty answer text or references. Require an explicit boolean ai_mentioned. Missing answer is no_answer; missing boolean is unknown. Do not use found, confidence, citation, or false-by-default presentation flags as substitute measurements. Legacy AI data without equivalent proof remains unavailable.
- [x] Deduplicate identical validated observation records before grouping. Conflicting duplicates produce one excluded conflict for each affected group, never a success/absence. Use mutually exclusive exclusion reasons in order: unsupported, failed, unknown structural evidence, no_answer, unknown outcome. Apply conflict exclusion first. Duplicate count is separate from eligible/excluded count.
- [x] Aggregate only present/absent outcomes:

```ts
const eligible = rows.filter(r => r.outcome === 'present' || r.outcome === 'absent');
const numerator = eligible.filter(r => r.outcome === 'present').length;
const denominator = eligible.length;
const state = denominator > 0 ? 'measured' : 'unavailable';
```

- [x] Add fixtures yielding 1/2 organic, 0/2 Maps, 1/1 AI with another no-answer excluded; test omitted status, error with Success, null rank lacking surface proof, fractional rank, false/unknown mention, legacy fallback, duplicate conflicts, differing engines/contexts, missing date, and both input/evidence/group limits. Verify beyond-six observations are counted. Keep percentages out of this module.
- [x] Run focused tests and typecheck. Independent review must verify numerator/denominator provenance against producers. Commit `feat: derive scoped search observation metrics` with only task paths.

## Task 3: Integrate metrics through authorized projections

**Files:** Create derive.ts/derive.test.ts; modify load-report.ts, view-model.ts, report-props.ts and their existing tests.
**Consumes:** Task 1/2 derivation.
**Produces:** `deriveScanMetrics(rawData: unknown, measured: { ig: boolean; aeo: boolean }): ScanMetrics`; optional `scanMetrics?: ScanMetrics` on authorized source/viewer/member/staff model and full report props, never public model.

- [x] Add the module guard regression:

```ts
expect(deriveScanMetrics({ ig: { posts: [{ id: 'private' }] } },
  { ig: false, aeo: false })).toEqual({ instagram: null, search: [], omittedSearchGroups: 0 });
```

- [x] Run `corepack pnpm exec vitest run lib/report/scan-metrics/derive.test.ts`; require RED.
- [x] Compose the pure helpers; make absent/malformed raw data return empty/unavailable without throwing. In createReportLoader, call derivation only after the public early return, using authorizedJob.raw_data and moduleResults(job). Exact wiring:

```ts
const modules = moduleResults(job);
const scanMetrics = deriveScanMetrics(authorizedJob.raw_data, {
  ig: modules.ig?.status === 'measured',
  aeo: modules.aeo?.status === 'measured',
});
```

- [x] Put scanMetrics on AuthorizedReportSource and copy only into non-public variants in buildReportViewModel. Extend ReportViewModelLike/ReportProps with optional scanMetrics and map it only for `model.access !== 'public'`. Optional fields preserve existing sample callers; never synthesize sample metrics for real reports.
- [x] Add loader assertions that public access never reads authorized raw data; viewer/member/staff permitted projection contains metrics; revoked/foreign grants remain public. Add poisoned source/model tests proving public JSON omits new sentinel query strings and counts. Add dashboard module-state regression to suppress stale metrics passed directly in props.
- [x] Run `corepack pnpm exec vitest run lib/report/scan-metrics lib/report/load-report.test.ts lib/report/view-model.test.ts lib/funnel/report-dashboard.test.ts` and typecheck. Independently review access and tests. Commit `feat: project stored metrics only to authorized reports`.

## Task 4: Render localized samples and measurement coverage

**Files:** Create scan-metrics.tsx/scan-metrics.test.tsx; modify dashboard-metrics.tsx, dashboard.module.css, lib/copy.ts; extend dashboard.test.tsx.
**Consumes:** `report: ReportProps` including authorized scanMetrics.
**Produces:** `ScanMetricsPanel({ report }: { report: ReportProps })`, server presentation component.

- [x] Add renderToStaticMarkup tests for public/locked poisoned props, measured 0/2, unavailable 0/0, incomplete coverage, dates and omitted groups in all three locales. Require RED by running `corepack pnpm exec vitest run components/report/scan-metrics.test.tsx`.
- [x] Render no panel for public/locked props. Filter IG/search again against current report module states. Show IG distinctPosts, datedPosts/span, historical-count note, and bounded evidence disclosure. Keep the existing IG engagement card unavailable with a specific localized historical-data reason when applicable.
- [x] Replace the generic search-visibility placeholder with the scoped panel when groups exist; otherwise retain a localized unavailable explanation. Preserve followers, GBP numbers, rubric bars, and competitor comparisons. Place the new panel inside statistics before benchmarks; do not create a second page shell.
- [x] Use native meter and details elements. Core rendering formula:

```tsx
const format = new Intl.NumberFormat(report.locale, { maximumFractionDigits: 1 });
const percent = metric.denominator > 0
  ? format.format(100 * metric.numerator / metric.denominator) : null;
// Only render the meter for state === 'measured' and denominator > 0.
<meter min={0} max={metric.denominator} value={metric.numerator}
  aria-label={localizedSurfaceLabel} />
```

- [x] Add typed copy keys for surfaces, X-of-N, eligible/excluded, all exclusion reasons, historical zero, captured date span, date unavailable, incomplete sample, omitted groups and evidence rows. Chinese labels include 未能量度 and clearly distinguish Google 搜尋, Google 地圖, AI 提及. Use interpolated localized text, never raw error codes. Scan date and observation dates are separately labeled; no invented observation timestamp.
- [x] Use scoped existing CSS layout with min-width:0 and overflow-wrap:anywhere for long queries. Visible count labels accompany all bars. Details summaries remain keyboard accessible; no animation or chart dependency. Do not expose raw payload objects through data attributes.
- [x] Run component tests, dashboard tests, typecheck, and scoped ESLint. Review localization and access guards; commit `feat: display evidence-backed scan metrics`.

## Task 5: Verify the real report flow with owned fixtures

**Files:** Create e2e/acceptance/report-scan-metrics.spec.ts. Reuse test/e2e/fixtures.ts, test/e2e/environment.ts and the setup pattern in e2e/acceptance/report-dashboard.spec.ts; do not change provider setup.
**Consumes:** completed authorized rendering.
**Produces:** deterministic browser proof, including final runtime-error assertions.

- [x] Copy the existing owned report test's fixture/environment setup into the new spec; use a unique report slug and owned SQL fixture only. Seed eight identified posts and complete stored search metadata with distinct query sentinels: organic 1/2, Maps 0/2, AI 1/1 plus one no-answer. Include an IG ambiguous zero. Use real stored schema fields; never add an eligibility flag that producers do not store.
- [x] Add public response-body and DOM assertions before unlock:

```ts
expect(await response.text()).not.toContain('PRIVATE_METRIC_QUERY');
await expect(page.locator('[data-scan-metrics]')).toHaveCount(0);
```

- [x] Use the existing fixture signIn and /api/report-access/unlock grant flow. Assert visible 8-post sample, 1/2 organic, 0/2 Maps, and 1/1 AI separately; verify failed/no-answer exclusions and the historical IG note. No engagement percentage may appear.
- [x] Run `corepack pnpm e2e:acceptance e2e/acceptance/report-scan-metrics.spec.ts`. If it fails, preserve diagnostics and diagnose before changing expectations. Do not treat fixture harness problems as product success.
- [x] Exercise 375px and 1440px, en/zh-HK/zh-TW, Enter/Space disclosure toggling after hydration, long query wrapping and no horizontal overflow. Capture fixture-only screenshots. Assert collected pageerror/console errors at the end of interactions. Verify RSC navigation cannot expose metrics after a revoked viewer grant using the owned fixture's existing grant store.
- [x] Run focused browser and unit projection suites. Independent review must check stored-field realism, private-data exclusions, and denominators. Commit `test: verify stored scan metrics report flow`.

## Task 6: Full gate and reviewable handoff

**Files:** Create verification doc; update spec status and this plan's completed checkboxes only after execution.
**Consumes:** committed runtime code and task reviews.
**Produces:** exact verification record, final independent review, integration handoff.

- [x] Confirm clean intended scope and reconcile current origin/main without replacing unrelated edits. Record source SHA before the gate.
- [x] Run the normal repository sequence, stop and diagnose failures, retain per-command exit codes:

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

- [x] Require Docker Linux engine for database/browser suites. Keep fixture transport guards active. Missing Docker is an environment blocker, never permission to use shared Neon. Do not run e2e:live or provider-backed suites.
- [x] Request independent final review of the full runtime diff and test realism; resolve Critical/Important findings and rerun affected checks. Record optional findings separately.
- [x] Write docs/integration/2026-09-08-existing-scan-metrics-verification.md with base/tested SHA, exact test counts/skips, lint warnings, screenshots, independent review outcome, and hosted limitations. Do not reuse prior phase test counts as current results.
- [x] Mark the approved spec implemented only when all implementation work is verified. Run `git diff --check`; commit only the documentation paths as `docs: record stored metrics verification`.
- [x] Use finishing-a-development-branch to offer integration choices. Preserve this pre-existing worktree. No push/PR/deployment is authorized by this plan.

## Task 6 execution record

- Baseline: `88b912d9e79a9191d4bde758e9d0407d24b0f948`.
- Tested runtime: `ac5e999f5173a2547b669edffa93835473637bc7`.
- Final gate: all 14 steps exited 0. Unit total was 2,536 (`1979 + 62 + 23 + 183 + 20 + 269`); lint had 0 errors and 29 baseline warnings; SQL integration completed at 241 passing tests across 23 files with zero skips; public e2e completed 31 passing tests with zero skips; acceptance completed 20 passing tests with zero skips in 8.5 minutes; build passed.
- SQL deviation and recovery: the first attempt was 240 pass/1 fail on the existing analytics lock-observation 400ms poll at line 252, with source unchanged. The isolated selected reproduction passed once with 13 name-filtered skips. The full SQL rerun passed 241/241. The separate pre-date-fix gate was intentionally interrupted.
- Review: final independent review approved the corrected date validation; no Critical or Important findings remain. Baseline launcher/Vite/DEP0190 warnings remain informational.

## Plan self-review

Spec coverage: IG provenance and sample dates map to Task 1; search success, surfaces and denominators to Task 2; authorization and pre-display aggregation to Task 3; localization/coverage and UI to Task 4; fixture browser/access checks to Task 5; full repository evidence and independent review to Task 6. Contracts use the same function and property names throughout. Safety limits and partial coverage are explicit. No collector, schema, scoring, membership resolver, or paid-provider work is included.

Tasks 1-6 are implemented and fixture verified. The execution record above and the integration verification document record the actual checks and limitations.