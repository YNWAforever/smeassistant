# Phase 19 — Streaming load characterisation and operational visibility

Status: **plan approved; P19.0 inventory started 2026-11-16.** No load run, capacity number or diagnostics change is claimed by this document. It authorises no production load, no paid provider call, no schema change and no hosted setting change on its own.

## Why this phase

Two records leave the same follow-up open:

- The [Conversation Studio roadmap](../implementation/owner-platform-v1/CONVERSATION-STUDIO-V1.1-ROADMAP.md) lists a **streaming load test** as outstanding under "Verification boundaries and remaining work" and "Test/a11y depth".
- [Phase 18](PHASE-18-STREAMING-RESILIENCE-PLAN.md) proved session/request composition under two deterministic owned-PostgreSQL schedules, but states it "establishes no production capacity claim" and lists signals the current usage report cannot show: rejected contenders, first-token latency, disconnects, session-release duration and pending provider attempts.

There is no streaming load-test harness or load-tooling dependency in the repository today. The existing assets this phase builds on are the owned PostgreSQL fixture (`test/integration/neon-database.ts`), the two Phase 18 composition cases (`test/integration/studio-resilience.integration.test.ts`: "retains a disconnected answer's real lock while an independent conversation completes, then recovers" and "destroys the real session at final cutoff and fences a held accounting transaction without converting unknown usage to zero"), the read-only [studio usage report](../operations/studio-usage.md), and the enabled browser/CI gates.

## Goal

Produce repeatable, recorded evidence of how the Studio turn path behaves as concurrency rises on a **documented machine**, derive honest operational thresholds from that evidence, and add only the content-free diagnostics the evidence demonstrates are missing.

Success is a falsifiable statement such as "on machine M with fixture provider P, the path kept invariant set I up to concurrency N; at N+1 the observed failure was F". It is **not** a throughput, SLA or production-capacity guarantee.

## Non-goals and boundaries

- **No production load.** The hosted check remains the read-only navigation matrix. No write, model or load traffic is sent to the deployed app.
- **No paid provider spend.** The load path uses a typed fixture for the LLM interface; remote cancellation/settlement stays out of scope.
- **No schema change by default.** Persisting new counters requires a separate, additive migration reviewed on its own. Log/audit-event-only diagnostics are preferred first.
- **No dependency, pinned-SDK, Auth, runtime-config or server-identity change.**
- **Not manual accessibility.** [Phase 17](PHASE-17-ACCESSIBILITY-VALIDATION.md) remains **Not tested** for NVDA, VoiceOver, real devices and actual microphone behaviour; this phase does not replace it.
- **No extrapolation.** Local PostgreSQL and fixture transport are not hosted Neon or a real gateway; results carry an environment block wherever they are quoted.

## Decisions needed before P19.2 (owner)

1. **Harness environment.** Default proposal: this Windows workstation, recorded as the environment. A dedicated Linux runner would make runs more comparable but needs provisioning.
2. **Whether any bounded production performance probe is ever allowed.** Default: **No**; load testing stays local with fixtures.
3. **Diagnostics persistence.** Default: derive from existing logs/audit events; propose an additive migration only if a required signal genuinely cannot be observed.
4. **Alert thresholds.** Derived from P19.2 data, then confirmed by the owner against an acceptable p95/cost policy; not guessed in advance.

## Work plan

### P19.0 — Inventory and metric definitions

- Confirm the coverage map: deadline and attempt caps, one-session ownership, provider dispatch, unknown-usage budget, queue/run states, disconnect and finalization path.
- Define the load metrics and invariants before writing the harness:

| Metric | Definition |
|---|---|
| admitted turns | requests that acquired a conversation session and dispatched work |
| refused contenders | requests answered busy/conflict without dispatch |
| provider dispatches | classifier and answer calls actually made |
| first-delta latency | POST entry to first streamed delta (fixture) |
| completion latency | POST entry to terminal persisted state |
| session release | admitted session to released/fenced session |
| unknown usage | turns whose usage remains unresolved at finalization |
| independence checks | foreign/independent conversation rows and audit attribution |

| Invariant | Must always hold |
|---|---|
| single owner | a same-conversation contender is refused without a second dispatch |
| isolation | concurrent independent conversations never mix rows, scope or audit identity |
| boundedness | attempts, retries and finalization stay inside the existing cutoff |
| no duplicate effect | contention/retry never replays an ambiguous provider side effect |
| truthfulness | uncertain usage is preserved as unknown, never zeroed into permission |

- Exit: the metric/invariant table above is confirmed against the code and each existing test is mapped to the signal it covers.

### P19.1 — Deterministic load harness (opt-in)

- New harness (location to be decided in the PR: `test/load/` or `scripts/load/`) driven by one command, closed by an env flag, **not included in default `pnpm test` or CI**.
- Reuse the owned PostgreSQL fixture and the Phase 18 seams; local identity/briefing/provider fixtures; fresh single-connection pools per session.
- Bounded concurrency ladder (e.g. 1 → 2 → 4 → 8; stop when the machine, not the product, becomes the bottleneck) with fixed iteration counts, a warmup run and barrier/timer control. No arbitrary sleeps for ordering.
- Emit a JSON artifact with per-level counts, latency samples and invariant outcomes; fail the run on any invariant violation rather than on latency numbers.
- Exit: harness runs from a clean checkout on this machine; a second run gives the same invariant outcomes (latency may vary and is reported, not asserted).

### P19.2 — Characterisation and honest report

- Run the ladder, record exact Node/pnpm/PostgreSQL versions, CPU/RAM, pool settings, fixture delays and iteration counts.
- Report the highest level where every invariant held and the first observed failure/refusal boundary; keep raw JSON as evidence.
- State explicitly what the result does **not** show (production throughput, hosted Neon limits, remote provider behaviour, sustained-load durability).
- Exit: a results section in this phase report with the environment block and raw evidence path.

### P19.3 — Operational visibility from evidence

- Add only the diagnostics P19.2 shows are missing and needed, content-free: e.g. contention/refusal counts by category, first-delta latency samples, disconnect/finalization outcomes, pending attempts.
- Prefer existing audit events/logs; if persistence is approved, ship an additive migration with the §1.3.7 rules and separate review.
- Extend the read-only usage report only for data that exists and is useful; keep message text and business content out of every signal.
- Exit: tests and [studio usage docs](../operations/studio-usage.md) updated for any new field; no message content in logs or reports.

### P19.4 — Guardrails and CI

- Add one **fast, deterministic** scheduled case to CI only if it exercises a real composition gap; keep the heavier ladder opt-in and out of default gates.
- Confirm the existing 20 enabled browser cases, JS budgets and integration suite remain green and cost unchanged beyond minor runtime.
- Exit: CI runtime impact recorded; no existing gate weakened or skipped.

### P19.5 — Release and handoff

- Standard guarded process: reviewed PR, required CI, exact-commit merge and deployment, fresh read-only hosted matrix, release record.
- Phase report records environment, results, limits, diagnostics decisions and the unchanged manual-accessibility status.
- Exit: release identity and read-only hosted proof recorded; manual NVDA/VoiceOver/device/microphone status still explicitly **Not tested**.

## P19.0 — Inventory record (started 2026-11-16)

Status: the metric and invariant tables above are confirmed against the code. Existing tests are mapped below as **behaviour coverage, not measurements**: none of them records a load level, and none is a capacity number.

| Signal | Source of truth | Existing evidence |
|---|---|---|
| Turn session and ownership | `acquireStudioTurnSession` (`lib/studio/turn-session.ts`) | `lib/studio/turn-session.test.ts` (8 cases: work/finalization lifetime, serialized transactions, destroy at final cutoff, rolled-back commit not reported as success, unknown-unlock reuse, busy close, bounded lock query, late connection) |
| Same-conversation refusal | advisory lock returns false → `conversation_busy` (`lib/studio/turn-lock.ts`; route line 217) | `lib/studio/turn-lock.test.ts` (5 cases); `lib/studio/orchestrator.test.ts` "answers 409 conversation_busy without writing or calling a model when the turn lock is held" |
| Pre-stream order and statuses | route comment lines 36–40: flag → body → membership → scope → rate limit → AI budget → conversation 404/409 → turn lock 409 busy | `app/api/studio/conversations/[conversationId]/messages/route.test.ts` (27 cases incl. 429 `studio_message` at 60/h, 409 archived/busy, 503 lock/briefing, SSE frames, audit row with enumerated fields only) |
| Turn deadline | `createStudioDeadline` — work 50 s, finalization 55 s (`lib/studio/deadline.ts`) | `deadline.test.ts` (3 cases); `request-lifetime.test.ts` (4 cases incl. retained settlement after response) |
| Provider-attempt accounting | `lib/workspace/provider-attempt.ts`; `actionRunRepository.observeProviderAttempt` (`lib/repositories/artifacts.ts`) | `lib/workspace/provider-attempt.test.ts`; `lib/assistant/live.test.ts` call assertion |
| Partial text and unknown usage | orchestrator cutoff path | `lib/studio/orchestrator.test.ts` "persists partial text and unknown output usage when the answer reaches the cutoff"; Phase 18 case 2 |
| Disconnect with independent completion | Phase 18 schedule A | `test/integration/studio-resilience.integration.test.ts` case 1 |
| Held transaction, final cutoff, fencing | Phase 18 schedule B | `test/integration/studio-resilience.integration.test.ts` case 2 |
| Persisted usage/latency series | `lib/operations/studio-usage.ts`; [studio usage docs](../operations/studio-usage.md) | `lib/operations/studio-usage.test.ts`; `test/integration/studio-usage.integration.test.ts` |
| Enabled end-to-end journey | `e2e/acceptance/conversation-studio.spec.ts` (20 cases) | Phase 17/18 release runs |

The Phase 18 observability gap is confirmed against the current code: **rejected contenders, first-delta latency, disconnect/finalization outcomes, session-release duration and pending provider attempts are not in the existing report.** The harness (P19.1/P19.2) must measure them directly; only P19.3 evidence decides whether any needs persistence.

P19.0 exit: the tables above are confirmed and the gap list is recorded; harness work can start. Decisions 1–4 in “Decisions needed before P19.2” remain open.

## Acceptance criteria

1. One command reproduces the load record on a documented machine; the environment and raw JSON are preserved.
2. Every invariant above holds at every recorded level, and the first failure boundary is described, not hidden.
3. The report makes a falsifiable, environment-scoped statement and claims no production capacity or SLA.
4. Diagnostics added are demonstrated necessary, content-free, tested and documented; any schema change is additive and separately reviewed.
5. Required repository, CI and read-only hosted gates pass on the exact released commit; the existing Phase 17 manual status is unchanged.

## Sequencing and rough size

```
P19.0 inventory ── P19.1 harness ── P19.2 characterisation ── P19.3 visibility ── P19.4 CI ── P19.5 release
```

Rough size: P19.0 half a day; P19.1 one to two days; P19.2 one day; P19.3 one to two days; P19.4 half a day; P19.5 the usual release cycle. Sizes are planning estimates, not commitments.

## Risks and limits

- **Test-machine contention**: timing and failure boundaries are properties of this machine and fixture delays; do not cite them as product limits. Stop increasing concurrency when results measure resource contention.
- **Flakiness**: barriers and fixed iterations, never sleeps; invariant failures fail the run, latency numbers are recorded not asserted.
- **Fixture provider**: no remote cancellation, gateway routing or cost/settlement behaviour is exercised.
- **Local PostgreSQL ≠ hosted Neon**: connection, pool and network limits differ; no hosted load is authorised here.
- **Scope creep**: a new telemetry schema or dashboard is not implied; only demonstrated gaps qualify, and each needs its own review.

## Parallel owner-authorised tracks (not part of this phase)

- **Release hardening**: branch protection and an exact-SHA deployment check are still unimplemented; see [release gates](../operations/release-gates.md). This needs explicit owner authorisation and an actually attempted denied-promotion drill, not a settings guess.
- **Manual accessibility validation**: [the Phase 17 checklist](PHASE-17-ACCESSIBILITY-VALIDATION.md) and the [results form](../../work/phase-17/MANUAL-RESULTS.md) wait for an equipped tester; automation in this phase does not close them.
