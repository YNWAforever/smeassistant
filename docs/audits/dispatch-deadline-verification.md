# T-11 / F-09 / UC-17 — local dispatch deadline evidence

Baseline: d1cbc7bd8a2bc7989c774d15001f7971274bed8d. Cron remains absent from vercel.json under DEC-10. This document records local code/fixture verification, not deployed maintenance.

RED: `T11-mail-red.txt` (exit 1) reproduced ten serial 10-second sends, earlier work not charged, and a response body outliving its cleared timer. `T11-budget-red.txt` records the missing shared budget contract. Tests import real functions.

One monotonic 55-second budget now spans notify, awaited reclaim responses, auto-close, reconcile, website verification and mail. Headers and body use `min(existing timeout, remaining time)`. A request-scoped private pg pool bounds connection/queue waiting and SQL statement/lock waiting, destroys active sockets at expiry, and leaves the ordinary app pool independent. The route retains maxDuration=60. Bulk assignment uses this same cancellable request boundary and retains its 5-second statement / 1-second lock caps.

Only settlement/compensation may use the remaining five-second reserve; the global cutoff is never reset. Settlement starts a bounded reserve context near the deadline so a known result is not lost to a one-millisecond remaining statement timeout. No new claim or provider operation uses this reserve.

Mail claims at most ten rows, one at a time. A known claim whose provider operation never started is returned by exact lease-token CAS with its claim increment undone. Wrong/stale tokens and repeated compensation cannot change a newer lease. A started operation with an unknown result retains the existing dedupe key and retry/lease recovery. A lost claim response cannot safely be compensated without its token; lease expiry remains the fallback. No exactly-once or platform-termination guarantee is claimed.

Dispatch preserves completed step summaries and exposes `deferredSteps`; mail exposes `deferred`. A verification fetch that exhausts the shared budget does not invent measured results or stamp unseen actions. Existing authorization, provider dedupe, completion transaction/lease and unknown-result recovery remain in place.

Verified commands (exit 0):

- Selected unit: `node node_modules/vitest/vitest.mjs run lib/jobs/execution-budget.test.ts app/api/cron/dispatch/route.test.ts 'app/api/workspaces/[workspaceId]/actions/bulk/route.test.ts' lib/mail lib/website/checks.test.ts lib/verify/website-sweep.test.ts lib/scan/notify-due-schedules.test.ts lib/workspace/completion.test.ts --maxWorkers=1` — 187 tests / 17 files.
- Integration: `node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts test/integration/neon-execution-budget.integration.test.ts test/integration/neon-mail-outbox.integration.test.ts test/integration/neon-cron-dispatch.integration.test.ts test/integration/neon-bulk-action-updates.integration.test.ts` — 35 tests / 4 files. Identified owned network-none PostgreSQL fixtures only. Actual pg_sleep cancellation, rollback, no remaining active slow query, pool queue/row-lock bounds, reserved settlement and unattempted claim compensation are asserted.
- Scoped ESLint: see `remediation-evidence/T11-lint.txt`. Root typecheck: see `T11-typecheck.txt`.

Intermediate failures are retained: the cancellation fixture exposed double release and a too-short settlement context, both corrected before the final DB run. The new `deferred` contract required updating two existing integration expectations. Static mail mocks were changed to consume only the requested number of due rows; they do not return the entire queue forever.

Driver rationale: [pg pool queue/connection and client release APIs](https://node-postgres.com/apis/pool), [PostgreSQL statement and lock timeouts](https://www.postgresql.org/docs/16/runtime-config-client.html). Promise racing alone would leave server work running; the owned DB test checks actual server activity instead.

Rollback: revert the T-11 commit; no migration is added or changed. Keep cron disabled, preserve pending outbox/completion ledgers and inspect uncertain provider outcomes before any operational restart. Hosted timed ticks and monitoring are blocked by DEC-10, scheduler enablement authorization, journal/readiness and an approved monitoring destination.
