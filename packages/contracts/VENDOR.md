# VENDOR.md — @sme-scanner/contracts

- Source: https://github.com/YNWAforever/sme-scanner at b9b4151fb89217a926e38f187873b5ff9f10f90f (2026-08-27), files
  `apps/web/lib/types.ts` → `src/types.ts` (import `./db/job-state` → `./job-state`),
  `apps/web/lib/db/job-state.ts` (+ test) → `src/job-state.ts`,
  `apps/web/lib/evidence/types.ts` → `src/evidence-types.ts`,
  `apps/web/lib/scanner/ig-search/types.ts` → `src/ig-search-types.ts` (import `../serpapi-outcome` → `./serpapi-outcome`),
  `apps/web/lib/scanner/serpapi-outcome.ts` (+ test) → `src/serpapi-outcome.ts`.
- Vendored: 2026-09-03. `src/index.ts` and `src/index.test.ts` are local.

Purpose: the pure types `@sme-scanner/scan-engine` used to reach into `apps/web` for; the app imports row types from here too.