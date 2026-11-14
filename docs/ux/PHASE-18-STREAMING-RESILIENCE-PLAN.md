# Phase 18 — Controlled streaming resilience

Status: planned, no new load-test result or production capacity claim.

## Scope and fixtures

Use owned PostgreSQL, local Auth and a controllable LLM transport. Production traffic, paid providers and business records are excluded. First inspect the existing deadline/session/provider-attempt regressions and Studio usage report; reuse their behavior and instrumentation rather than duplicating tests or adding a telemetry schema without a demonstrated gap.

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

## Operations and acceptance

Review current reporting for timeout, contention, latency and unknown-usage visibility. Add only diagnostics demonstrated necessary by the experiments, with no message content, credentials or business material in logs. A persistent schema change requires a separate concrete design and additive migration review.

Acceptance requires preserved conversation isolation, no duplicate provider effect caused by contention/retry, bounded work/finalization, correctly represented uncertainty and clear recovery instructions. Local fixture results establish these contracts within recorded conditions; they do not certify production throughput or guarantee remote lock release timing during a network partition.
