# Scan execution host contract

Task12 changes `processScan(jobId, runtime)` to require `runtime.store: ScanExecutionStore`, `collect`, and `persistEvidence(jobId, candidates)`. The store contract is exported from `@sme-scanner/scan-engine`; there is no database-client fallback or credential factory. Collection and scoring inputs are unchanged.

The Next app constructs the SQL store in `lib/scan/execution-store.ts`. Claim is one atomic UPDATE using the final historical lease semantics: queued jobs, or collecting/scoring/persisting jobs with fewer than three attempts whose non-null last attempt is strictly older than thirty minutes. Findings and terminal report data commit in one transaction after collection. The app supplies diff/AEO ports and the sharp-dependent evidence adapter explicitly.

Analytics storage and HTTP credentials belong to the app. Hosts that end work when a request returns must supply `waitUntil` to the app store (or an equivalent implementation of `recordTerminal`), registering both the entire event insertion promise and the later PostHog tail. The engine never waits for terminal analytics. Best-effort diff/AEO failures remain bounded at ten seconds and cannot change the scan result.

Intermediate release restrictions:

- `runScan` invokes fenced Neon workspace completion after execution. Workspace effect failures remain retryable in the completion ledger independently of engine status. See `NEON-RUNNER-COMPATIBILITY.md` for the external receiver gate.
- `corepack pnpm seed:demo --owned-test` creates, seeds, verifies and destroys its own owned local PostgreSQL fixture. Ambient database URLs are ignored; arbitrary targets are refused. No managed Auth or persistent production seed is supported.
- External Cloudflare workers are outside this checkout. Their consumers must adopt this explicit store/analytics/evidence contract before rollout. The legacy `createServiceClient` export is removed. No external worker or provider was modified.
- Migrations 0001–0004 remain immutable. Task 16 local gates and independent review are approved, including the pinned Neon SDK/auth-js exception. Hosted retained scheduler/worker verification remains NOT RUN. See `NEON-CUTOVER.md` for Task 17 preparation and data-preserving recovery gates.

Raw scan thirty-minute/max-three-attempt claims do not provide a per-attempt fence for every engine write. The process route has a separate 300-second duration limit. Workspace completion effects have their own transactional token/lease fencing; do not infer that guarantee for all engine persistence.
