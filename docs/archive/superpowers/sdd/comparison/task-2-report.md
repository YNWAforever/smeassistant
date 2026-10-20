# Task 2 report: authorized location history

## Implemented

- Added the server-only optional `location_id` field to `PublicReportJob` and the paged `readEarlierReportJobs(jobId, offset)` store contract.
- Added a parameterized PostgreSQL history query anchored to the displayed job. It scopes candidates to the same persisted workspace and location, accepts only done/partial jobs, requires strictly earlier completion, sorts by `completed_at DESC, id DESC`, and uses `LIMIT 25 OFFSET $2`.
- Added `loadScanComparison`, which validates the current scan, defensively revalidates every candidate, authorizes before reading comparison evidence, skips non-comparable authorized candidates, and stops at the first comparable pair.
- Bounded candidate processing at 1000, followed by one metadata-only page to distinguish exhaustion from `history_limit`; contained all operational failures as `lookup_failed`.
- Updated existing `ReportStore` test doubles only for the new method.

## TDD evidence

RED: `corepack pnpm exec vitest run lib/report/comparison/load.test.ts` failed before implementation with `Cannot find module './load'`. This was expected because the loader export did not exist.

GREEN:

- `corepack pnpm exec vitest run lib/report/comparison/load.test.ts lib/report/store.test.ts` — 2 files, 25 tests passed.
- `corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-report-comparison.integration.test.ts` — owned Docker PostgreSQL, 1 file, 2 tests passed.
- `corepack pnpm exec tsc --noEmit` — passed.
- `corepack pnpm exec eslint lib/report/comparison/load.ts lib/report/comparison/load.test.ts lib/report/store.ts lib/repositories/reports.ts lib/report/store.test.ts lib/report/load-report.test.ts test/integration/neon-report-comparison.integration.test.ts` — passed with no output.
- `git diff --check` — passed; Git emitted only existing Windows line-ending notices.

## SQL fixture coverage

The owned database test proves persisted workspace/location isolation even when location and business names match, strictly earlier timestamps, done/partial inclusion, unfinished/failed and future exclusion, deterministic tied-date ID ordering, 25-row pagination, and missing anchor behavior. Candidate projection excludes `raw_data`.

## Files changed

- `lib/report/comparison/load.ts`
- `lib/report/comparison/load.test.ts`
- `lib/report/store.ts`
- `lib/repositories/reports.ts`
- `lib/report/store.test.ts`
- `lib/report/load-report.test.ts`
- `test/integration/neon-report-comparison.integration.test.ts`

## Self-review

All Task 2 behaviors and boundaries in the brief are covered. Candidate columns are qualified with `candidate`, including both float casts and the completed timestamp text cast. Authorization occurs before evidence reads, and the post-1000 probe calls only `list`. No provider, shared database, email, migration, deployment, or Task 3 integration was added.

## Concerns

None.

## Review fix: strict calendar timestamps

Reviewer requested rejection of impossible calendar dates that JavaScript `Date.parse` normalizes. Added boundary regressions for current metadata, current comparison input, candidate metadata before authorization, and authorized candidate input before comparison. Added positive coverage for PostgreSQL `completed_at::text` values with a space delimiter, six fractional digits and `+00`, plus leap days and ISO timezone offsets.

RED: `corepack pnpm exec vitest run lib/report/comparison/load.test.ts` failed on impossible current metadata, current input, and candidate metadata because the loader accepted normalized February 31 values. The candidate-input equivalent-instant regression exercises the same parser after authorization and before comparison.

GREEN:

- `corepack pnpm exec vitest run lib/report/comparison/load.test.ts` — 19/19 passed.
- `corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-report-comparison.integration.test.ts` — owned Docker PostgreSQL 2/2 passed, confirming real SQL timestamp text compatibility.
- `corepack pnpm exec tsc --noEmit` — passed.
- `corepack pnpm exec eslint lib/report/comparison/load.ts lib/report/comparison/load.test.ts` — passed with no output.

Self-review: parser checks the calendar date, clock ranges and timezone ranges before parsing, accepts required database and ISO forms, and preserves instant-equivalence checks. No other Task 2 behavior changed.