# Task 4 report: concise localized scan comparison

## Outcome

Implemented the authorized comparison panel immediately after the report heading/date block. Authorized viewer/member/staff reports can show localized scan dates, search-row direction counts, concise source context, previous/current fractions, percentage-point changes, neutral Instagram sample coverage, withheld-group notes, and native evidence disclosures. Public and locked projections return no comparison markup.

The comparison projection now carries bounded sanitized `queryType`, `gl`, `hl`, `location`, `device`, and `ll` fields from the validated search derivation through `MetricChange`. The exact JSON cohort key remains server-only. Main cards keep a concise engine/location/device identifier; expanded source settings and source observation dates are disclosed separately.

## RED / GREEN evidence

RED: `corepack pnpm exec vitest run components/report/scan-comparison.test.tsx lib/report/comparison/derive.test.ts components/report/dashboard.test.tsx` failed because `components/report/scan-comparison.tsx` did not exist. The existing derive/dashboard suites passed 39 tests.

GREEN: `corepack pnpm exec vitest run components/report/scan-comparison.test.tsx components/report/dashboard.test.tsx lib/report/comparison/derive.test.ts lib/report/comparison/load.test.ts lib/report/scan-metrics/search.test.ts components/report/scan-metrics.test.tsx` passed 111/111 tests across 6 files.

Additional verification:

- `corepack pnpm typecheck` passed, including all four workspace package typechecks.
- Scoped ESLint passed for the Task 4 component, copy, dashboard, comparison derivation/types/load fixture, and search derivation files.
- `git diff --check` passed.

## Coverage

Tests cover en, zh-HK, and zh-TW; 1/2 to 2/2 (+50 percentage points); unchanged rows; IG-only neutral coverage; unavailable reasons without first-scan claims; partial/withheld cohorts; two same-source rows with distinct contexts; derive-to-compare safe scope propagation; exact source observation timestamps; direct public/locked prop injection; dashboard placement; one h1; and absence of a metric-comparison delta on the score dial.

No providers, authentication, migrations, scoring logic, dependencies, deployment, or browser route fixtures were changed. Task 5 retains ownership of full-route/browser verification.
## Review follow-up

Reviewer RED: the focused component/dashboard suite failed six assertions across en, zh-HK, and zh-TW because the current-score summary still used generic comparison-unavailable text and Instagram coverage had no sampled-post label or post units.

Reviewer GREEN: the six-file focused suite passes 116/116 tests after adding localized current-report title/body copy, localized Instagram sampled-post labels and units (including signed delta), and a stored-run regression that sends two distinct contexts through `deriveComparisonInput` and `compareScanMetrics`. That regression verifies control-character removal, URL redaction, the 200-character location bound, distinct safe settings, and absence of the raw cohort tuple from output.