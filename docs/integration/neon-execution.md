# Scan execution host contract

Task12 changes `processScan(jobId, runtime)` to require `runtime.store: ScanExecutionStore`, `collect`, and `persistEvidence(jobId, candidates)`. The store contract is exported from `@sme-scanner/scan-engine`; there is no database-client fallback or credential factory. Collection and scoring inputs are unchanged.

The Next app constructs the SQL store in `lib/scan/execution-store.ts`. Claim is one atomic UPDATE using the final historical lease semantics: queued jobs, or collecting/scoring/persisting jobs with fewer than three attempts whose non-null last attempt is strictly older than thirty minutes. Findings and terminal report data commit in one transaction after collection. The app supplies diff/AEO ports and the sharp-dependent evidence adapter explicitly.

Analytics storage and HTTP credentials belong to the app. Hosts that end work when a request returns must supply `waitUntil` to the app store (or an equivalent implementation of `recordTerminal`), registering both the entire event insertion promise and the later PostHog tail. The engine never waits for terminal analytics. Best-effort diff/AEO failures remain bounded at ten seconds and cannot change the scan result.

Intermediate release restrictions:

- `runScan` logs `neon_workspace_completion_pending` for executed jobs. Task13 must replace this explicit seam with Neon workspace completion before release. Legacy completion is never called for Neon job IDs.
- `seed:demo` fails before imports or writes with `demo_seed_neon_migration_pending`. Task15 owns the Neon demo fixture rewrite.
- External Cloudflare workers are outside this checkout. Their consumers must adopt this explicit store/analytics/evidence contract before rollout. The legacy `createServiceClient` export is removed. No external worker or provider was modified.
- Historical migrations are unchanged. Package dependency/lockfile cleanup and retained scheduler/worker deployment checks remain owned by later migration tasks.
