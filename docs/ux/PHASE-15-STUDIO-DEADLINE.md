# Phase 15 — Shared Studio turn deadline

Status: implementation, independent review, lint, strict types and all 7,600 unit/component tests passed. The production build, bundle boundary checks, 669 database integration tests and 17 enabled browser journeys passed. No Phase 15 release is claimed yet.

## Behavior and ownership

Studio captures one monotonic clock at POST entry, before parsing, authorization and preflight. Generation and preflight use the first 50 seconds. Terminal persistence, provider usage, audit and cleanup share the original 55-second cutoff within the unchanged 60-second platform duration. Every provider dispatch and fallback receives the smaller of its existing cap and the remaining work time. Classifier failures and exceptions count toward the same maximum of two attempts.

A timeout preserves collected answer text and observed usage. Unknown usage remains unknown. A committed provider reservation whose work allowance expires before dispatch is recorded as rejected with zero usage: no request was sent. Reservations still commit before an external provider effect.

The route returns streaming headers while retaining its execution scope through durable completion. Vercel `waitUntil` owns that completion after a client disconnect. Delivery can close independently. The finalizer drains deferred usage settlements before releasing the conversation session, including settlements registered after the response was returned. Noncooperative preflight promises cannot resume the next route stage after the work deadline.

Studio uses a private application connection for the advisory lock and all message, draft, usage and audit writes. Short transactions are serialized on that same session; provider work never runs inside a long outer transaction. Session admission closes before release, queued transactions drain before unlock, and the connection is destroyed at the final cutoff. Escaped transaction clients cannot submit later statements. An uncertain COMMIT does not become a successful saved result.

For canonical Neon pooled application URLs, Studio derives the matching direct endpoint while preserving application identity, database and TLS settings. Ordinary pooled traffic is unchanged. Routing or identity query overrides and percent-encoded hostnames fail closed; DNS case and trailing root dots are normalized before endpoint detection. There is no migration-credential fallback and no fallback to the pooler after a direct-connection error. Other PostgreSQL deployments must provide a session-affine application endpoint.

## Verification and review

The initial combined foundation suite passed 130 tests. Live draft and provider reservation propagation passed 122 tests, including 14 new regressions. The integrated route, orchestrator, request lifetime, endpoint parsing and session suite subsequently passed 110 tests with strict root TypeScript checks.

Focused cases cover elapsed preflight, 30 seconds of classification leaving 20 seconds for a draft, expiration during committed reservation, ignored fetch/JSON/stream cancellation, a fallback receiving only the remaining second, partial timeout output, serialized transactions, held queries, late connections, cancelled response delivery, held audit work and deferred usage after terminal output.

Independent read-only review identified two defects before release:

- Route cleanup could release the session before deferred usage finished. Release now belongs exclusively to the lifetime finalizer after settlement drain. A route regression verifies audit, late usage and release in that order.
- PostgreSQL URL parsing preserves hostname spelling differently from the driver. Uppercase suffixes, trailing root dots and encoded hostname characters could retain the pooler. Normalization and fail-closed validation now have real `pg.Client` configuration tests without opening connections.

Follow-up review found no further confirmed introduced high-priority correctness issue in the reviewed deadline, transport and persistence paths. A subsequent local audit additionally bounded lock acquisition by the work cutoff and checked the absolute clock when a database result settles; the corresponding held-lock regression is included in the full gate run.

The final local unit/component run passed 7,600 tests: 7,013 root tests across 578 files, 62 separately isolated media tests and 525 workspace-package tests. This includes the final held-lock and persistence-reserve adapter cases. Full lint passed with zero errors and 14 existing warnings; root and all four workspace typechecks passed. Retired-transport and ownership-boundary checks passed. The final delta review found no further correctness issue.

The Next.js 16.2.6 Turbopack production build passed. Its secret-boundary scan passed across 109 public artifacts, and all 45 route JavaScript budgets passed; the canonical conversation route is 253 KB against a 300 KB budget.

Owned PostgreSQL verification passed: all 22 migrations applied, replay was empty, and the catalog contained 49 tables with no business seed rows. All 669 database integration tests across 63 files passed.

Enabled Studio and contextual-assistant browser acceptance passed all 17 cases with none skipped, covering all three locales and mobile/tablet/desktop layouts. This exercised streamed responses, retained history/evidence, draft persistence, approval/export boundaries, sharing and member isolation through the updated server path.

Pending: green CI, guarded merge and exact-commit read-only hosted verification. Release identities will be recorded after those gates finish.

## Limits and subsequent work

Destroying the local session fences further local writes and preserves same-session write/unlock ordering. A network partition prevents guaranteeing the exact remote instant at which PostgreSQL releases its lock. A missing acknowledgement remains an uncertain outcome.

No schema, Auth SDK, provider selection, ownership, approval, export or publishing changes are introduced. Hosted Auth redirect investigation and actual NVDA/VoiceOver/mobile accessibility checks remain subsequent phases.
