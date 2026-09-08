# Two-Scan Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show changes between the displayed report and the most recent earlier authorized, comparable scan at the same location, using existing evidence only.

**Architecture:** A bounded server-side history reader supplies candidate metadata without raw evidence. The existing report authorizer independently authorizes each candidate before a pure comparison module consumes its metrics. A dedicated metric-comparison projection and component keep search changes separate from IG sample coverage and from the existing score-delta contract.

**Tech Stack:** TypeScript, Next.js 16, React 19, Vitest, Playwright, pg, pnpm 9.12; Node >=22.13.0; owned Docker PostgreSQL fixtures.

## Global Constraints

- Approved spec: docs/superpowers/specs/2026-09-08-two-scan-comparison-design.md, approved after commit 5130b21.
- Authoritative checkout: C:/Users/laich/Documents/smeassistant/.worktrees/neon-migration. Branch: codex/two-scan-comparison. Never edit Documents/smescanner.
- Baseline origin/main: be2107d429f2b924f3441765caa24a06a2a1fbac. Fetch and reconcile intervening changes before execution. Preserve unrelated work; stage exact paths only.
- Use existing stored scans only. No new collection, paid provider calls, emails, database migrations, scoring formulas, deployment, or domain changes.
- No arbitrary scan picker, timeline, rank/rating/review/score deltas, finding-resolution claims, or engagement averages/rates in this slice.
- Public and locked report projections omit private comparison data from props, HTML, and React Server Component payloads.
- Granting or unlocking the displayed report does not grant access to another report.
- Preserve accepted viewers and out-of-scope managers' existing evidence reads and all draft authority checks.
- Retain en, zh-HK, and zh-TW. No new runtime dependency. Fixture-only tests and owned local services.
- Each task records RED/GREEN evidence and receives independent authorization/test review where relevant. Integrate one reviewable slice at a time.

## Confirmed integration constraints

`lib/report/load-report.ts` has an early public return before private reads. Keep it. Its optional membership resolver defaults to no membership; the default share route does not supply a resolver. The single viewer cookie is job-bound. Staff loading is disabled by current policy. Consequently the deployed share route normally cannot authorize a historical pair today. It must show a neutral unavailable comparison while retaining the current report. Do not change cookies, session wiring, grant scope, or staff policy to make the feature appear available.

Successful pair integration can be exercised through createReportLoader with its existing injected membership resolver. Browser fixtures must prove the actual default route's unavailable/private behavior. A successful-pair component can be browser-tested through a fixture-only render harness; label that proof separately from actual route proof. Do not claim the default route supports a successful pair unless an existing production entry point independently supplies authorization for both scans.

`audit_jobs` already has workspace_id, location_id, completed_at, module_results and raw_data. `lib/repositories/reports.ts` selects workspace_id but not location_id. `PublicReportJob` is server metadata, not the public response contract. Extending its server-only location field must not add location or history metadata to public projections.

`SearchMetric.observations` is already presentation-bounded at 50 rows, queries are sanitized/truncated, and groups can be omitted. Never silently calculate a full cohort from that partial or lossy list. Task 1 adds a comparison-specific server projection from the same validated observations before presentation slicing; it retains exact matching keys. Existing display metrics remain unchanged.

## File responsibilities

New:
- lib/report/comparison/types.ts: safe output types and server comparison input contracts.
- lib/report/comparison/derive.ts and derive.test.ts: exact cohort matching and neutral coverage comparison.
- lib/report/comparison/load.ts and load.test.ts: ordered selection with independently authorized candidates.
- lib/report/comparison/copy.ts: comparison-specific localized copy.
- components/report/scan-comparison.tsx and scan-comparison.test.tsx: concise values, changes and evidence details.
- test/integration/neon-report-comparison.integration.test.ts: owned database location/order boundaries.
- e2e/acceptance/report-scan-comparison.spec.ts: actual share-route HTML/RSC privacy and unavailable state.
- docs/integration/2026-09-08-two-scan-comparison-verification.md: exact executed results and reachability limitations.

Modify only integration surfaces needed by these files:
- lib/report/scan-metrics/search.ts and search.test.ts: reuse validated pre-display observations for exact comparison input.
- lib/report/scan-metrics/derive.ts and derive.test.ts: reuse measured-module gates.
- lib/report/store.ts and lib/repositories/reports.ts: location metadata and bounded historical candidate query.
- lib/report/load-report.ts and load-report.test.ts: authorization adapter and comparison invocation.
- lib/report/view-model.ts and view-model.test.ts: authorized-only projection.
- lib/funnel/report-props.ts: metric comparison field and honest non-first-scan state.
- components/report/dashboard-summary.tsx, dashboard.module.css and dashboard.test.tsx: mount comparison without a score delta.

## Shared interfaces

Create these contracts in Task 1. Input keys are server-only and never serialized into the report.

```ts
export interface QueryFact {
  query: string; observedAt: string | null;
  outcome: 'present' | 'absent' | 'unknown';
}
export interface QueryCohort {
  key: string; // exact JSON tuple [engine, queryType, gl, hl, location, device, ll, surface]
  engine: string; surface: 'organic' | 'maps' | 'ai';
  label: string; queryType: string; gl: string; hl: string;
  location: string; device: string; ll: string | null;
  facts: QueryFact[]; complete: boolean;
}
export interface ComparisonInput {
  scannedAt: string;
  cohorts: QueryCohort[];
  ig: { definition: 'stored-post-sample-v1'; posts: number; complete: boolean } | null;
}
export interface MetricChange {
  key: string; engine: string; surface: 'organic' | 'maps' | 'ai';
  queryType: string; gl: string; hl: string; location: string;
  device: string; ll: string | null;
  previous: number; current: number; denominator: number;
  deltaPercentagePoints: number;
  direction: 'increased' | 'decreased' | 'unchanged';
  evidence: Array<{ query: string; previous: boolean; current: boolean;
    previousObservedAt: string | null; currentObservedAt: string | null }>;
  omittedPrevious: number; omittedCurrent: number;
}
export interface PairChanges {
  previousScannedAt: string; currentScannedAt: string;
  rows: MetricChange[];
  counts: { increased: number; decreased: number; unchanged: number };
  ig: { previous: number; current: number; delta: number } | null;
  unavailableGroups: number;
}
export type ScanComparison =
  | { kind: 'available'; changes: PairChanges }
  | { kind: 'unavailable'; reason: 'no_accessible_pair' | 'missing_location'
      | 'invalid_current_scan' | 'lookup_failed' | 'history_limit' };
```

`history_limit` is an internal selector state only. Authorized view-model and report-props projections must collapse it to `no_accessible_pair`, making empty, all-denied, and capped-denied history indistinguishable in serialized output.

An IG-only compatible pair is valid, but yields zero search-change counts and a neutral sample-coverage card. UI says no comparable search measurements, not no business change. Query labels and scope fields in output must use current safe text conventions; exact query and raw cohort identity stay server-side. Unknown or conflicting facts remain represented internally so omission counts are truthful, but they never enter the comparable denominator or direction. The output key must be an opaque deterministic row index, not the raw settings tuple.

### Task 1: Derive exact common-cohort changes

**Files:** comparison/types.ts, comparison/derive.ts, comparison/derive.test.ts; scan-metrics/search.ts, search.test.ts, derive.ts, derive.test.ts under lib/report.

**Consumes:** stored evidence accepted by deriveScanMetrics and matching measured-module flags.
**Produces:** `deriveComparisonInput(rawData: unknown, measured: { ig: boolean; aeo: boolean }, scannedAt: string): ComparisonInput` and `compareScanMetrics(previous: ComparisonInput, current: ComparisonInput): PairChanges | null`.

- [ ] Add regression tests proving mismatched queries/settings cannot produce a delta and that a common cohort uses the same denominator. Use this concrete assertion shape:

```ts
const base = input([fact('q1', 'present'), fact('q2', 'absent')]);
const head = input([fact('q1', 'absent'), fact('q3', 'present')]);
const result = compareScanMetrics(base, head)!;
expect(result.rows[0]).toMatchObject({ previous: 1, current: 0,
  denominator: 1, deltaPercentagePoints: -100, direction: 'decreased',
  omittedPrevious: 1, omittedCurrent: 1 });
expect(result.counts).toEqual({ increased: 0, decreased: 1, unchanged: 0 });
```

Define local fixture helpers explicitly in derive.test.ts:

```ts
const fact = (query: string, outcome: QueryFact['outcome']): QueryFact =>
  ({ query, outcome, observedAt: null });
const input = (facts: QueryFact[]): ComparisonInput => ({
  scannedAt: '2026-09-08T00:00:00Z', ig: null,
  cohorts: [{ key: JSON.stringify(['google', 'discovery', 'hk', 'en',
    'Hong Kong', 'desktop', null, 'organic']), engine: 'google',
    surface: 'organic', label: 'Hong Kong', facts, complete: true }],
});
```

- [ ] Run `corepack pnpm exec vitest run lib/report/comparison/derive.test.ts`; expect failure from the missing derivation export, not test configuration.
- [ ] Refactor the existing private search validation into a shared internal result consumed by both display and comparison derivation. Keep display output byte-for-byte equivalent on existing fixtures. Capture exact raw query/settings before text truncation. Require nonempty engine/query/query type/gl/hl/location/device; ll may be explicit null. Missing context excludes the cohort. Do not invent missing context from defaults.
- [ ] Fold repeated identical query outcomes to one fact. Retain a valid query identity with `outcome: 'unknown'` when its stored observations are unknown or conflicting, so it contributes to omission totals while remaining excluded from the comparable denominator and direction. Observation timestamps are preserved only when unambiguous and identical across collapsed facts; otherwise null. Apply the existing organic success/presence rules before folding. No time-based cherry-picking.
- [ ] Compute per-group intersection of eligible exact query keys. Sum previous/current booleans over that intersection. Difference is `100 * (current - previous) / denominator`; compare integer counts for direction. Output exactly one row per cohort, never separate numerator and percentage rows.
- [ ] Enforce existing 1000-input and 50-group bounds. Mark an affected cohort incomplete and withhold its delta if input/group truncation prevents complete matching. Cap comparable cohort evidence at 50 queries by withholding an oversized cohort, rather than computing a hidden partial intersection. Sanitize display strings only after identity matching. Count withheld groups separately.
- [ ] Compare IG counts only when both measured samples are complete and use stored-post-sample-v1. Return null if there is neither a search row nor comparable IG coverage. Keep IG out of direction counts.
- [ ] Add assertions for genuine zero, no common query, changed context, unknown metadata, duplicates/conflicts, long queries sharing a prefix, input/group/evidence bounds, IG-only pair, stale module data, and historical organic ambiguity. Run `corepack pnpm exec vitest run lib/report/comparison/derive.test.ts lib/report/scan-metrics` and expect all selected tests to pass.
- [ ] Independently review measurement semantics; fix findings; commit only this task's files as `feat: derive comparable changes from stored scan evidence`.

### Task 2: Read and select authorized location history

**Files:** lib/report/comparison/load.ts, load.test.ts; lib/report/store.ts; lib/repositories/reports.ts; test/integration/neon-report-comparison.integration.test.ts.

**Consumes:** PublicReportJob and Task 1 contracts.
**Produces:** optional `location_id?: string | null` on PublicReportJob and these store/loader interfaces:

```ts
// Add to ReportStore, with implementations on every test double.
readEarlierReportJobs(jobId: string, offset: number): Promise<PublicReportJob[]>;
// New comparison/load.ts contract.
export interface ComparisonPorts {
  list: (jobId: string, offset: number) => Promise<PublicReportJob[]>;
  authorize: (candidate: PublicReportJob) => Promise<boolean>;
  readInput: (candidate: PublicReportJob) => Promise<ComparisonInput>;
}
export function loadScanComparison(current: PublicReportJob,
  input: ComparisonInput, ports: ComparisonPorts): Promise<ScanComparison>;
```

- [ ] Write a loader fixture with two candidates: newest denied, next authorized. Assert `readInput` is never called for denied ID and selected data contains only authorized dates/evidence. Add denied-all, missing location, cross-location injected row, invalid timestamp, same timestamp, current incomplete, thrown query, no common metrics, and 1000-candidate bound tests.
- [ ] Run `corepack pnpm exec vitest run lib/report/comparison/load.test.ts`; expect missing export failure.
- [ ] Add location_id to the existing publicColumns server query and type. Implement parameterized history SQL anchored to the displayed job, not request-supplied location. Use page size 25, offset checked as a nonnegative integer, limit 25. Candidate order is completed_at DESC, id DESC:

```sql
SELECT candidate.id
FROM audit_jobs candidate JOIN audit_jobs current ON current.id=$1
WHERE current.workspace_id IS NOT NULL AND current.location_id IS NOT NULL
  AND candidate.workspace_id=current.workspace_id
  AND candidate.location_id=current.location_id
  AND candidate.status IN ('done','partial')
  AND candidate.completed_at < current.completed_at
ORDER BY candidate.completed_at DESC, candidate.id DESC
LIMIT 25 OFFSET $2
```

The actual SELECT must include all PublicReportJob columns, each qualified with candidate, preserving float/text casts in reportsRepository. No raw_data, findings or grants are part of candidate reads.

- [ ] Validate current status done/partial and valid completed timestamp/location/workspace. In the loader recheck each candidate's same workspace/location, done/partial status, and strictly earlier valid timestamp even though SQL constrains them. Authorize before readInput. Compare in query order and return the first non-null result. After 1000 candidates, fetch one more metadata page to distinguish internal exhaustion from `history_limit`; do not authorize or read extra evidence. Collapse that internal reason to `no_accessible_pair` at every outward projection. Catch failures as lookup_failed without exception text or IDs. Empty, all-denied, and capped-denied history serialize identically.
- [ ] Run the loader tests to green. Add owned SQL fixtures for another workspace, another location, identical names, tied dates, partial completion, incomplete jobs, and pagination. Use the existing owned integration harness, never DATABASE_URL from a shared environment. Run `corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-report-comparison.integration.test.ts`; require NEON_INTEGRATION=1 and Docker Linux before execution.
- [ ] Obtain independent authorization/SQL review, fix findings, and commit explicit files as `feat: select independently authorized report history`.

### Task 3: Integrate comparison without broadening access

**Files:** lib/report/load-report.ts and load-report.test.ts; lib/report/view-model.ts and view-model.test.ts; lib/funnel/report-props.ts; lib/funnel/report-dashboard.test.ts; update explicit ReportStore test doubles.

**Consumes:** loadScanComparison, deriveComparisonInput, ScanComparison.
**Produces:** optional `scanComparison?: ScanComparison` on authorized source/model/props only. Public types have no such field.

- [ ] Add tests with current member access and independently denied candidate membership. Assert no private candidate read. Add successful injected membership for both jobs, viewer token bound only to current job, candidate revoked/expired grant, public early return, and comparison query failure while current report still loads.
- [ ] Run `corepack pnpm exec vitest run lib/report/load-report.test.ts lib/report/view-model.test.ts lib/funnel/report-dashboard.test.ts`; expect assertions for missing comparison behavior to fail.
- [ ] Refactor the existing authorizeReport call into a loader-local `authorizeJob(candidate: PublicReportJob)` that always normalizes candidate.workspace_id to null, resolves membership for that candidate, and scopes findViewerGrant/markViewerGrantUsed to candidate.id. Preserve the same viewer token and staff session identity for the request. Do not reuse current access as historical access.
- [ ] Invoke comparison only after the existing public return and the current authorized raw-data read. The ports are concrete adapters:

```ts
const scanComparison = await loadScanComparison(job,
  deriveComparisonInput(authorizedJob.raw_data, {
    ig: modules.ig?.status === 'measured', aeo: modules.aeo?.status === 'measured',
  }, job.completed_at ?? ''), {
    list: (id, offset) => deps.store.readEarlierReportJobs(id, offset),
    authorize: async candidate => (await authorizeJob(candidate)).kind !== 'public',
    readInput: async candidate => {
      const data = await deps.store.readAuthorizedJobData(candidate.id);
      const measured = moduleResults(candidate);
      return deriveComparisonInput(data.raw_data, {
        ig: measured.ig?.status === 'measured', aeo: measured.aeo?.status === 'measured',
      }, candidate.completed_at ?? '');
    },
  });
```

Do not call loadReport recursively: that would add summary work and risk recursion. Historical selection reads no summaries, findings, agent runs or media.

- [ ] Attach scanComparison beside scanMetrics in authorized source and mirror the current authorized-only scanMetrics projection. Map to props only for nonpublic access. Use a new legacy comparison state `{ kind: 'not_evaluated' }` for real reports instead of the hardcoded first_scan. Keep illustrative sample behavior explicit; never populate comparable.delta from metric differences.
- [ ] Re-run selected tests and existing report-access tests with `corepack pnpm exec vitest run lib/report lib/report-access lib/funnel/report-dashboard.test.ts`. Record exact counts. Have an independent reviewer inspect both-scan access, public HTML/RSC exposure tests, and draft regression preservation. Commit as `feat: project authorized scan comparisons into reports`.

### Task 4: Render concise localized changes

**Files:** lib/report/comparison/copy.ts; components/report/scan-comparison.tsx, scan-comparison.test.tsx; dashboard-summary.tsx, dashboard.module.css, dashboard.test.tsx.

**Consumes:** ReportProps.scanComparison.
**Produces:** `ScanComparisonPanel({ report }: { report: ReportProps })`.

- [ ] Write component tests for all three locales: 1/2 to 2/2 gives +50 percentage points and one increased row; unchanged pair; IG-only neutral coverage; unavailable reason; partial/withheld cohorts; direct public/locked props injection. Assert score dial receives no metric delta.
- [ ] Run `corepack pnpm exec vitest run components/report/scan-comparison.test.tsx components/report/dashboard.test.tsx`; require a behavior failure before implementation.
- [ ] Add a component that returns null when access is public or locked, reads only safe props, and mounts immediately after the report heading/date block in DashboardSummary, before the current score/coverage section. Preserve one h1. For available pairs render both dates, three direction counts, then compact rows and native details/summary evidence. Use previous/current X/N, percentage-point delta and locale-aware number formatting. A direction count is a count of search rows only.
- [ ] Implement copy in en/zh-HK/zh-TW for: Changes since the previous comparable scan / 與上次可比較掃描的變化 / 與上次可比較掃描的變化; Increased / 上升 / 上升; Decreased / 下降 / 下降; Unchanged / 不變 / 不變; Sample coverage / 樣本涵蓋範圍 / 樣本涵蓋範圍. Include fully localized previous/current dates, source labels, percentage points, omitted queries, evidence, no comparable search measurements, and neutral unavailable explanations. Never use no_accessible_pair copy to assert a first scan.
- [ ] Add grid styles using `repeat(auto-fit, minmax(min(100%, 16rem), 1fr))`, `min-width: 0`, `overflow-wrap: anywhere`, and visible focus for disclosures. Text labels accompany every directional indicator. Put IG count changes in coverage, without improvement colors. Render exact source observation dates separately from scan dates.
- [ ] Teach DashboardSummary about not_evaluated using a neutral current-report title/body; keep failed/score-withheld explanations. Do not reuse a score-comparison title for the new panel. Run component/report tests and `corepack pnpm typecheck`. Commit after review as `feat: show changes-first scan comparison cards`.

### Task 5: Verify real-route privacy and fixture presentation

**Files:** e2e/acceptance/report-scan-comparison.spec.ts; component browser fixture using the existing local fixture mechanism if one is available; docs/integration/2026-09-08-two-scan-comparison-verification.md.

**Consumes:** integrated loader and panel. **Produces:** browser evidence that distinguishes route capability from fixture-only display proof.

- [ ] Extend the owned acceptance pattern from report-scan-metrics.spec.ts. Seed current/earlier jobs with private sentinel strings and cached summaries into environment.db only. Create a third job in a different location. Use SCAN_SOURCES=fixture. Do not invoke scan creation or send actual mail.
- [ ] Before unlocking, fetch the actual report HTML and RSC response with `RSC: 1`; assert neither contains comparison dates, query sentinels, earlier IDs, or panel content. Unlock current only through the existing local endpoint. Assert the current evidence renders, but earlier sentinels remain absent in HTML/RSC and the comparison is unavailable. The local member sign-in alone must not be treated as share-route membership support.
- [ ] Cover en, zh-HK, zh-TW at widths 375 and 1440, keyboard activation of disclosures, no horizontal overflow, and current report survival when no pair is available. Record screenshots under .superpowers/sdd/comparison/screenshots.
- [ ] Exercise available/unchanged/IG-only/partial states with the real component and safe derived fixture props. If no existing fixture-only browser rendering surface exists, use component tests for these states and record the successful-pair browser gap explicitly rather than adding a production route or changing authentication. This gap is a release limitation, not a passed browser case.
- [ ] Run `corepack pnpm exec playwright test --config playwright.acceptance.config.ts e2e/acceptance/report-scan-comparison.spec.ts`. Expected: selected real-route tests pass, no hidden skips. Populate the verification document with executed commit, counts, fixture scope, and successful-pair reachability limitation. Independently review browser assertions and commit as `test: verify report comparison privacy and presentation`.

### Task 6: Review and run the repository gate

**Files:** docs/integration/2026-09-08-two-scan-comparison-verification.md only unless a verified defect requires a new focused fix.

- [ ] Fetch current main and reconcile intervening changes without overwriting unrelated work. Review the final branch diff against the approved spec. Obtain an independent agent review of authorization and tests; resolve findings with targeted RED/GREEN checks before broad gates.
- [ ] Check `docker info --format '{{.OSType}}'` returns linux. Use the existing owned Docker test harness; never migrate a shared DB. In PowerShell set only task environment variables:

```powershell
$env:SCAN_SOURCES = 'fixture'
$env:VITEST_MAX_WORKERS = '1'
$env:NEON_INTEGRATION = '1'
$env:RATE_LIMIT_SECRET = 'comparison-local-fixture-only'
$env:NEXT_PUBLIC_SITE_URL = 'http://localhost:3100'
```

- [ ] Execute the normal CI gate in order, checking each process exit before continuing:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:secret-boundary
corepack pnpm test:no-supabase
docker pull postgres:16
corepack pnpm db:verify
corepack pnpm test:integration
corepack pnpm build
corepack pnpm exec playwright install chromium
corepack pnpm e2e
corepack pnpm e2e:acceptance
```

On Linux CI the browser installation uses --with-deps as in .github/workflows/ci.yml. Do not run e2e:live. Existing migration verification is a replay on an owned local database, not a migration authoring task.

- [ ] Record exact unit/integration/browser passes, failures, skips, warnings, runtime commit and final doc commit. If a baseline test is flaky, preserve first failure evidence, reproduce specifically, and report retry separately. Do not weaken tests to achieve green. Distinguish successful loader/component comparison proof from the default share route's lack of pair authorization.
- [ ] Self-review docs for claims stronger than evidence. Commit only the verification document as `docs: record two-scan comparison verification`. Hand off a clean reviewable branch with limitations and next task. No push, PR, merge or deployment is part of this plan execution unless separately authorized.

## Plan self-review

Every spec area maps to Tasks 1-6: measurement and coverage (1), location/date selection (2), independent access and projection (3), concise localization/accessibility (4), fixture and browser evidence (5), independent review and full gate (6). Types and function names are shared above. Proposed APIs are explicitly new; existing APIs were checked in source. The default route limitation is deliberate and remains visible in acceptance criteria. No task assumes the earlier phases' tests are current or that skipped cases passed.
