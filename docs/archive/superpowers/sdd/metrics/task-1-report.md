# Task 1 report: honest stored Instagram sample

## Status

Implemented and committed on `codex/existing-scan-metrics`.

Exact commit: `4c6085d` (`feat: derive honest stored Instagram samples`)

## Files committed

- `lib/report/scan-metrics/types.ts`
- `lib/report/scan-metrics/instagram.ts`
- `lib/report/scan-metrics/instagram.test.ts`

## Contract delivered

- Pure `deriveInstagramSample(rawIg: unknown): IgSample | null` helper.
- Missing/non-array `posts` is unavailable; an explicit empty array is a captured zero-length sample.
- Deterministic first-1,000 input bound and independent 50-row evidence bound.
- Stable bounded ID identity first, then canonical safe HTTPS Instagram post/reel URL.
- Exact identity deduplication, field-by-field conflict nulling, and one conflict exclusion per affected identity.
- Strict ISO date parsing rejects impossible normalized calendar days.
- Counts accept only finite nonnegative safe integers.
- Historical zero remains marked `ambiguousZero`; engagement remains `unavailable_historical_counts`.
- Separate `reels` input is ignored.
- Shared presentation contracts and bounds are exported. `ScanMetrics.omittedSearchGroups` is included for Task 2's planned disclosure.

## TDD evidence

RED command:

`corepack pnpm exec vitest run lib/report/scan-metrics/instagram.test.ts`

RED result: exit 1; 1 failed test file, 0 tests collected. Expected cause: `Cannot find module './instagram'`.

GREEN command:

`corepack pnpm exec vitest run lib/report/scan-metrics/instagram.test.ts`

GREEN result: exit 0; 1 test file passed, 13 tests passed, 0 failed, 0 skipped.

## Type verification

Command:

`corepack pnpm typecheck`

Result: exit 0. Root `tsc --noEmit` passed; workspace typechecks passed for region, scoring, contracts, and scan-engine.

## Self-review

- Confirmed collector provenance: historical missing likes/comments are stored as zero, so no engagement aggregation is exposed.
- Confirmed all aggregate counts are calculated before evidence slicing.
- Confirmed unidentified rows remain supporting observations but do not affect distinct count/date span.
- Confirmed date spans include only identified records with one non-conflicting valid date.
- Confirmed URL credentials and sensitive query keys are rejected; accepted URLs discard query/hash.
- `git diff --cached --check` passed before commit.
- No collector, caller, database, provider, route, scoring, or presentation files changed.

## Concerns

No blocking concerns. Task 2 must initialize and carry the required `omittedSearchGroups` field when constructing `ScanMetrics`.


## Review fix: credential query matcher

- Finding: the Instagram URL guard used a substring regex that rejected harmless query names such as `monkey` and `keyboard` because they contain `key`.
- RED command: `corepack pnpm exec vitest run lib/report/scan-metrics/instagram.test.ts`
- RED result: exit 1; 1 failed test (`allows harmless key-containing query names but rejects credential names`), with the pre-fix matcher identifying 0 safe URLs instead of 2.
- Fix: replaced the substring regex with the repository policy's delimiter-aware exact-part and compact-name semantics locally in `instagram.ts`, avoiding a heavy server collector import.
- GREEN command: `corepack pnpm exec vitest run lib/report/scan-metrics/instagram.test.ts`
- GREEN result: exit 0; 1 test file passed, 14 tests passed, 0 failed.
- Scoped lint: `corepack pnpm exec eslint lib/report/scan-metrics/instagram.ts lib/report/scan-metrics/instagram.test.ts` exit 0.
- Typecheck: `corepack pnpm typecheck` exit 0; root and all workspace package checks passed.
- Commit: recorded below after staging the explicit report and two source/test paths.
