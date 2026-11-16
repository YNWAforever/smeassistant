# Phase 19 — Streaming load characterisation and operational visibility

Status: **complete 2026-11-17 — P19.0–P19.5 done; P19.4 recorded as a no-code decision.** Final report: [PHASE-19-REPORT.md](PHASE-19-REPORT.md). No capacity number is claimed by this document. It authorises no production load, no paid provider call, no schema change and no hosted setting change on its own.

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

- Harness: `test/load/studio-turn-load.test.ts`, run by `vitest.load.config.ts` via `pnpm load:studio`. It is closed by a dedicated config rather than an env flag, because `pnpm test`/CI use `vitest.config.ts`, which now excludes `test/load/**` (verified: the default suite reports no test files there). This is the recorded deviation from the "env flag" wording.
- Reuses the owned PostgreSQL fixture and the Phase 18 seams; typed local identity/briefing/provider fixtures; the real messages POST, request lifetime, orchestrator, turn session and persistence. The rate limiter is stubbed allowed so the run isolates the turn path; its own policy is covered separately.
- Bounded ladder `1 → 2 → 4 → 8` with a one-turn warm-up, one same-conversation contention schedule (8 contenders), fixed fixture delay and no ordering sleeps. It writes `work/phase-19/load/studio-load-*.json` (gitignored) and fails on any invariant violation; latency is recorded, never asserted.
- Local result (2026-11-16): two runs produced identical invariants — all 15 ladder turns admitted, exactly `classify,answer` each, correct rows/audits per conversation, and 1 admitted / 7 `conversation_busy` / 0 refused dispatches in contention. Recorded first-chunk p50 rose 206 → 379 ms and completion p50 264 → 462 ms from concurrency 1 to 8 on a 12-CPU/32 GB Windows machine with the 15 ms fixture delay. These are local fixture observations, not service-level objectives.
- Exit: met — the harness runs from a clean checkout on this machine and the second run gave the same invariant outcomes.

### P19.2 — Characterisation and honest report

- The ladder is configurable without editing the harness: `LOAD_LEVELS=1,2,4,8,16,32,64`, `LOAD_REPEATS=1..3`, `LOAD_STOP_ON_FAILURE=0|1`. The record includes the configuration, PostgreSQL `max_connections`, per-level refusal statuses/counts and the residual connection count.
- Result (2026-11-16, local fixture; raw JSON in `work/phase-19/load/`, summary in `work/phase-19/P19.2-RESULTS.md`):
  - Levels **1–32 admitted every turn with zero refusals** in every run (1/1, 2/2, 4/4, 8/8, 16/16, 32/32; repeats=1). Recorded first-chunk p50 rose 205 → 1,444 ms and completion p50 258 → 1,764 ms from 1 → 32.
  - First non-admitted level: **48** (42/48 admitted, 6 refused) in a targeted run. At **64**, 43/64 admitted in one run and 105/128 admitted across two repeats in another, so roughly a third were refused.
  - Every refusal was a **pre-stream `503 unavailable`** with category `turn_lock_unavailable`; one `429` (budget check) appeared once. Refused turns wrote no message or audit row and dispatched no provider call, so the contention-safety invariants held at every level, including 64.
  - The owned fixture runs PostgreSQL `max_connections=100`; refusals appear once 48–64 concurrent turns each hold a session connection, so the boundary is consistent with the **local fixture's connection ceiling**, not an application-capacity limit. The harness cannot separate the two yet, and this is recorded as a limit.
- Honest report: the highest fully admitted level on this machine is **32**; the first refusal is between 32 and 48, caused by a local fixture resource bound. This is **not** production capacity, hosted Neon behaviour, remote provider behaviour, sustained-load durability or the effect of real HTTP Auth/network.
- Harness defect found during characterisation and fixed before recording: the first extended run used fixture keys `ladder-16-0-1 … -15`, where `…-1` is a substring of `…-10`; the fixture correlator therefore rejected turns 10–15 as uncorrelated. Keys are now zero-padded, and the defective run is kept only as evidence of the defect, not as a boundary.
- Exit: met — results, environment block and raw evidence paths are recorded here and in `work/phase-19/P19.2-RESULTS.md`.

### P19.3 — Operational visibility from evidence

- P19.2 showed four gaps: contested 409 refusals, first-stream-event latency, disconnect/deadline outcomes and pre-stream failure duration had no signal; only the `turn_lock_unavailable` failure category was logged.
- Implemented the minimum, content-free diagnostics in the messages route: a `refused` line (`category`, `waitedMs`) when a contender loses the session race, and one `turn` line per admitted turn (`outcome`, `firstEventMs`, `completionMs`, `disconnected`, optional enumerated `code`). No conversation/workspace id, text, answer, evidence label or client address is logged.
- No persistence change. Decision 3's default applies: the proven gaps are runtime observations, not persisted rows, so the read-only usage report is unchanged and no additive migration was needed. `failedTurns`, `unknownCostMessages` and adjacency latency remain the persisted view; `firstEventMs` is stream start, deliberately distinct from adjacency latency.
- Thresholds remain owner-derived; P19.2 gives local fixture observations, not a production SLO, so no alert threshold is set in code or docs.
- Exit: met — route tests cover the answered `turn` line, the contended `refused` line and `disconnected: true` after a cancelled stream, and assert that no secret text or identifiers appear. [studio usage docs](../operations/studio-usage.md) documents the fields and their limits.

### P19.4 — Guardrails and CI

- **Decision: add no new CI case.** The ladder needs a Docker PostgreSQL fixture and the heavy turn path, so it is not fast or deterministic on hosted CI. The composition gaps it checks are already covered by cheaper gates: `turn-session`/`turn-lock`/orchestrator/route unit tests, `request-lifetime`/`deadline`, and the two Phase 18 resilience integration cases. P19.2 found no product invariant failure (only a harness defect, fixed), so there is no evidence for a new scheduled guardrail.
- Recorded CI baseline: four successful `verify` jobs this phase took 34.7, 36.5, 36.6 and 38.0 minutes; later runs reached the previous 45-minute job limit with merchant acceptance still running (observed end-to-end 40–47 minutes). Five attempts were cancelled by that limit with no test failure; each passed on a plain rerun of the same commit, so no test or scope was weakened. The only CI change is raising the `verify` `timeout-minutes` from 45 to 60 for headroom.
- Existing browser cases, JS budgets and integration suite are unchanged.
- Exit: met — CI runtime recorded; no existing gate weakened or skipped.

### P19.5 — Release and handoff

- Standard guarded process applied to P19.1, P19.2 and P19.3: reviewed PRs, required CI, exact-commit merges with identical trees, exact deployments and fresh 36-visit read-only hosted matrices (nine keyboard checks each).
- [PHASE-19-REPORT.md](PHASE-19-REPORT.md) records environment, results, limits, diagnostics decisions, CI baseline, open owner decisions and the unchanged manual-accessibility status. All release identities and deployment ids are in that report; the plan docs and README row are updated.
- Exit: met — release identities and read-only hosted proofs recorded; manual NVDA/VoiceOver/device/microphone status remains explicitly **Not tested**.

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
