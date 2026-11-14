# Phase 18 — Controlled streaming resilience

Status: two deterministic owned-PostgreSQL composition experiments passed locally. Independent review completed without a concrete blocking finding, and all 671 tests across 64 owned-PostgreSQL integration files passed. This establishes no production capacity claim; no production runtime, schema or Auth changes are introduced.

## Scope and fixtures

The composition cases use owned PostgreSQL with local principal, preflight and controllable LLM interface fixtures. Production traffic, paid providers and business records are excluded. Existing deadline/session/provider-attempt regressions and the Studio usage report supply the lower-level coverage and reporting context; the new cases fill the real session-composition gap without a telemetry schema change.

## Experiment matrix

| Scenario | Required evidence |
|---|---|
| Concurrent turns in one conversation | One turn owns the session; contenders receive the existing busy/conflict outcome without provider dispatch or interleaved durable writes. |
| Independent conversations | Controlled parallel answer turns complete without sharing a conversation lock or mixing scope/messages/audit identity. Preserve the intentional global unknown-usage budget refusal; unresolved draft accounting may legitimately deny a different conversation before its lock is acquired. |
| Slow classifier and provider | Total admitted work respects the original cutoff; retry/fallback cannot reset it; classifier attempts stay at most two. |
| Client disconnect | Response delivery stops while admitted persistence/usage completion retains the conversation session through cleanup. |
| Partial output and delayed usage | Partial answer remains truthful; observed usage is retained; uncertain usage does not become zero or permission to dispatch again. |
| Held database operation | No escaped client or late completion writes after session fencing; uncertain commit is not reported as successful persistence. |
| Transport recovery | Subsequent independent requests can proceed after owned fixture recovery without replaying an ambiguous provider side effect. |

Record concurrency, number of iterations, fixture delays, resource limits, elapsed-time measurement, outcome counts and accounting/lock invariants for every experiment. Deterministic barriers should coordinate contention; do not depend on arbitrary sleeps or copy implementation assertions into tests. Establish a small repeatable baseline before increasing concurrency, and stop when results become resource-contention measurements of the test machine.

## Initial implementation scope

A read-only coverage inventory identified the missing layer as real Studio session/request composition under controlled concurrency. Existing unit cases already cover deadline and disconnect ordering, while existing database conversation tests exercise sequence allocation rather than the full lock/lifetime composition.

Start with two owned integration cases: an admitted answer turn held by a keyed barrier while its reader disconnects, a same-conversation contender is refused, and an independent answer completes; then a draft accounting transaction held across controlled work/finalization cutoffs while separate real sessions probe lock ownership and eventual reacquisition. Keep real request lifetime, orchestration, persistence and session code; substitute only local identity/briefing/provider fixtures and fresh single-connection pool inputs. Do not share a pool that session cleanup will close.

Use test-local request identifiers and entered/release promises. The existing HTTP LLM fixture's global hold and output FIFO cannot safely correlate independent simultaneous conversations; extending production telemetry or shared fixture endpoints is unnecessary for the initial tests. Drive only the deadline's controlled monotonic clock and budget signals; do not fake PostgreSQL's native timers. A pending draft's intentional global unknown-usage refusal must remain separate from conversation-lock contention.

## Local observations

The [two integration cases](../../test/integration/studio-resilience.integration.test.ts) exercise the real messages POST, request lifetime, orchestrator, live draft, lock-owning session, repositories and accounting/audit writes. Identity, briefing, limiter and LLM interfaces use local typed fixtures; this is not HTTP Auth/provider acceptance. Fresh single-connection application pools are injected through the existing session seam, and source-identity assertions prove the isolated worktree's application code is exercised despite shared third-party dependencies.

The first schedule holds answer A after a delivered delta, cancels its reader and proves a same-conversation contender receives 409 without another provider dispatch or user message. An independent conversation in the same workspace and a foreign-workspace control finish while A remains held. Distinct answer/token signatures, message sequences and audit attribution verify scope isolation; A later drains and accepts a recovery turn. Four admitted turns make eight classifier/answer calls; the refused contender makes none.

The second schedule commits one draft reservation before dispatch, then executes actual unknown-usage and audit writes inside a held transaction. Its own connection sees unknown usage and one observation audit; an independent connection still sees the committed pending reservation and no observation audit. Logical clock advancement through the original work/finalization cutoffs destroys the backend, rolls back those writes and releases the conversation lock. The late query is fenced, no draft version/message is saved, and the durable run remains running with pending usage and null tokens/cost. The real action queue rejects redispatch with `action_run_in_flight`; no second draft is sent.

The accounting distinction matters: this running/pending run is protected by the in-flight action fence. The global unknown-usage guard covers unknown/partial states and terminal runs with pending usage; these are separate boundaries.

One execution of each final controlled schedule passed on Node 24.21.0 in 12.21 seconds total, including fixture setup. Case bodies took 1,497 ms and 671 ms. Those durations describe a local fixture run, not a wall-clock 55-second benchmark or sustained-load result. PostgreSQL/socket timers remain real. Scoped lint and strict application TypeScript passed. Independent source review found no concrete blocking flaw in either controlled schedule and confirmed cleanup of retained work, pools and the owned fixture. The full integration suite subsequently passed 671 tests across 64 files, including both new cases, in 327.79 seconds.

The provider transport itself is replaced by a typed timeout fixture: these cases prove production orchestration/accounting/session composition, not remote provider cancellation or settlement. The held PostgreSQL callback is idle in a transaction, so local backend termination/rollback is covered; cancellation of a statement executing in PostgreSQL belongs to the existing execution-budget integration cases. Pool construction and connection-string selection are bypassed by fresh injected pools. The retry check calls the real queue repository directly, rather than sending another full POST. Per-message token attribution is checked; aggregate billing reconciliation is not. These distinctions limit the claims without weakening the verified session and persistence boundaries.

## Operational interpretation

The existing [usage report](../../lib/operations/studio-usage.ts) and [read-only CLI](../../scripts/ops/studio-usage.ts) can report persisted conversation/message counts, reported tokens/cost, adjacent user-to-assistant message latency and daily activity. Its `failedTurns` counts any warning-bearing assistant message, not a specific timeout or contention category. Its `unknownCostMessages` counts assistant messages with null cost; it is not an unresolved action-attempt counter. Rejected contenders, first-token latency, disconnects, session-release duration and pending provider attempts require separate evidence.

For an authorized, explicitly selected operator target, the existing command can scope the read-only report to a workspace and window:

```text
corepack pnpm ops:studio-usage --days 1 --workspace-id <workspace-uuid>
```

For a repeated busy response, distinguish an active conversation session from an in-flight action or terminal unknown-usage refusal before retrying. Preserve unknown values and the committed reservation; do not reset usage to zero or replay an ambiguous provider request. Use observed attempt/lock state and content-free request outcomes to investigate. The tests add only local barrier order, dispatch counts, backend lifecycle and durable-row assertions; no production telemetry schema was needed. Configure report thresholds from representative operational evidence rather than these two logical-cutoff schedules.

## Operations and acceptance

Review current reporting for timeout, contention, latency and unknown-usage visibility. Add only diagnostics demonstrated necessary by the experiments, with no message content, credentials or business material in logs. A persistent schema change requires a separate concrete design and additive migration review.

Acceptance requires preserved conversation isolation, no duplicate provider effect caused by contention/retry, bounded work/finalization, correctly represented uncertainty and clear recovery instructions. Local fixture results establish these contracts within recorded conditions; they do not certify production throughput or guarantee remote lock release timing during a network partition.
