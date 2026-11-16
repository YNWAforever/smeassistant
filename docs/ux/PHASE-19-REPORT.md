# Phase 19 report — streaming load characterisation and operational visibility

Status: **complete as scoped on 2026-11-17.** The load harness is released and opt-in, the characterisation is recorded, and the missing runtime signals are shipped as content-free logs. P19.4 is recorded as a no-code decision. This phase makes **no capacity, throughput or latency claim** and authorises no production load, paid provider call, schema change or hosted setting change.

## What shipped

| Release | PR | Commit | Deployment | Scope |
|---|---|---|---|---|
| Phase 19 plan + P19.0 inventory | [#185](https://github.com/YNWAforever/smeassistant/pull/185) | `85859f4d` | `dpl_HtXwu7b6MmpoYdGf5iY139K3aV4M` | plan, decisions, signal inventory (docs only) |
| P19.1 opt-in load harness | [#186](https://github.com/YNWAforever/smeassistant/pull/186) | `003e88ca` | `dpl_2rLg75LRq3qa2mf25CWmvU6F2fCE` | harness, load config, default-suite exclusion, `pnpm load:studio` |
| P19.2 characterisation | [#187](https://github.com/YNWAforever/smeassistant/pull/187) | `a691dee5` | `dpl_4d6mS9UNjdYJRSGonBPijysNU4CR` | configurable ladder, refusal/boundary diagnostics, recorded result |
| P19.3 runtime turn signals | [#188](https://github.com/YNWAforever/smeassistant/pull/188) | `36e98225` | `dpl_CyZTt9YCHpXhZK4z7Cb4R2FPNo9w` | two content-free log lines, route tests, usage docs |
| P19.4/P19.5 decision + report | this PR | — | — | this report, plan status, README row, `verify` timeout headroom (45 → 60 minutes) |

Every code release passed the full guarded process: reviewed head merged with an identical tree, PR CI green, final-main CI green, exact-commit production deployment and alias, and a fresh **36-visit read-only** production matrix (3 locales × 3 widths × 4 surfaces) with **nine keyboard checks** and non-read methods blocked. P19.2 and P19.3 were docs/test/runtime-log changes; P19.1 and P19.2 were test/config/doc only.

## Environment (recorded, environment-scoped)

| Item | Value |
|---|---|
| Node | v24.21.0 |
| Platform | win32 x64 |
| CPU / RAM | 12 logical / 32 GB |
| PostgreSQL | owned `postgres:16` fixture on loopback, `max_connections=100` |
| Provider | typed local LLM fixture (remote transport replaced), 15 ms synthetic answer delay |
| Auth | typed local membership fixture (no HTTP Auth) |
| Rate limiter | stubbed allowed, to isolate the turn path |

## Characterisation result

| Concurrency | Admitted | Refused |
|---|---|---|
| 1, 2, 4, 8, 16, 32 | all | 0 |
| 48 | 42/48 | 6 × `503 unavailable` |
| 64 | 43/64 (one run); 105/128 (two repeats) | 21 / 23 × `503 unavailable`, one `429` once |

- Highest fully admitted level: **32**. First non-admitted level: **48**.
- Every refusal was **pre-stream** (`turn_lock_unavailable`); refused turns wrote zero message/audit rows and made zero provider dispatches. The contention schedule was 1 admitted / 7 `conversation_busy` / 0 refused dispatches in every run.
- The fixture runs PostgreSQL `max_connections=100`; refusals begin where 48–64 concurrent turns each hold a session connection, so the boundary is consistent with the **local fixture's connection ceiling**, not an application-capacity limit.
- Recorded first-stream-event p50 rose 205 → 1,444 ms and completion p50 258 → 1,764 ms from concurrency 1 → 32; admitted-only samples at 64 were 2,957/3,599 ms. These are local fixture observations, **not** service-level objectives.
- Invariants held in every valid run: single owner, isolation, boundedness, no duplicate effect, truthfulness. The only defect found while extending the ladder was in the harness itself (fixture keys `…-1`/`…-10` collided as substrings); it was fixed before recording and is not a product finding.

## Operational visibility (P19.3)

Shipped as content-free structured logs, documented in [studio usage](../operations/studio-usage.md):

```text
[api/studio/messages] refused { category: "conversation_busy", waitedMs }
[api/studio/messages] turn    { outcome, firstEventMs, completionMs, disconnected, code? }
```

No conversation/workspace id, message text, answer, evidence label or client address is logged. `firstEventMs` is stream start and is deliberately distinct from the persisted user→assistant adjacency latency. There is **no persistence change, no additive migration, no usage-report change and no alert threshold**: the plan's default (derive from existing logs) applied because characterisation did not demonstrate a need to store these signals.

## CI runtime and P19.4 decision

- Four successful `verify` jobs in this phase took **34.7, 36.5, 36.6 and 38.0 minutes**; later runs with slow first steps ran 40–59 minutes end-to-end (the final-main `verify` for this handoff PR took about 59 minutes), and some reached the previous 45-minute limit with merchant acceptance still running.
- Four attempts were cancelled by that limit with **no test failure**: three passed on a plain rerun of the same commit, and the fourth (this handoff PR) passed after the timeout headroom change. This is recorded as hosted-runner flakiness plus an undersized job limit, not a reason to weaken a gate.
- **P19.4 decision: add no new CI case; raise `verify` `timeout-minutes` from 45 to 60 only.** The load ladder stays opt-in because it needs a Docker PostgreSQL fixture and the heavy turn path, and the composition gaps it checks are already covered by cheaper existing gates: `turn-session`/`turn-lock`/orchestrator/route unit tests, `request-lifetime`/`deadline`, and the two Phase 18 resilience integration cases. P19.2 found no product invariant failure to justify a new scheduled guardrail. The timeout change adds headroom for the observed runtime; tests, scoping and failure conditions are unchanged. Existing gates, browser cases and JS budgets are unchanged.

## Limits — what this phase does not show

Production throughput, hosted Neon connection limits or latency, remote LLM provider behaviour, HTTP Auth/network effects, sustained-load durability, multi-instance deployment behaviour, or any service-level objective. No production performance probe was run (decision 2 default: no). No alert threshold is set (decision 4 remains owner-derived from real telemetry). No paid-model call or production business mutation was performed.

## Manual accessibility status

**NVDA, VoiceOver, real-device and actual microphone/speech-provider validation remain Not tested.** Automated accessibility coverage from phases 14 and 17 is unchanged; this phase did not claim or close the manual gate. Owner/tester action is still required before any accessibility-closed statement.

## Open owner decisions

1. Dedicated Linux runner for comparable load runs (default remains this workstation, recorded above).
2. Any bounded production performance probe (default: no).
3. Diagnostics persistence, only if a future signal genuinely cannot be observed from logs (none demonstrated here).
4. Alert thresholds, after real telemetry exists (not guessed in advance).

## Evidence (gitignored)

`work/phase-19/` — `P19.1-RESULTS.md`, `P19.2-RESULTS.md`, `P19.3-SCOPE.md`, `P19.4-SCOPE.md`, `load/studio-load-*.json` (raw harness records), `load-p192-run-*.log`, `harness-gates.log`, `p192-gates.log`, `p193-gates*.log`, `p191-release/`, `p192-release/`, `p193-release/` (release records, hosted proofs, deployment identity).
