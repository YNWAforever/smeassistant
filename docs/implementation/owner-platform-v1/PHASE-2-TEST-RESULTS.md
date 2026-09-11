# Phase 2 gate results

Gate-by-gate record for the Phase 2 gap-register work (all 24 findings plus P1 and P3). The Phase 1 counterpart is `PHASE-1-TEST-RESULTS.md`; the decisions behind each fix are in `PHASE-2-GAP-REGISTER.md`.

**Branch** `claude/sme-assistant-phase-1-e83fdc` · **HEAD** `7f93c25` · Node **24.18.0**, pnpm **9.12.0** via corepack, Windows 11.

The gate table's counts are from the clean run at `d514e3d` (287 files / 2,929 tests). P2 added one guard case since, so the current totals are **287 files / 2,930 tests**; typecheck, lint (30/0) and the guard were re-run green at `7f93c25`.

**Read this first.** Everything below is **locally verified**. **Nothing here is hosted-verified.** No deployment, migration, paid provider call, real email, OAuth consent or Stripe event was attempted, and nothing was pushed — CLAUDE.md §0.1 makes each of those a separately authorized action. Three gates could not run on this machine at all; they are recorded as blocked, not as passing.

## Gates

| # | Gate | Result |
|---|---|---|
| 1 | `corepack pnpm typecheck` | **passed** — exit 0 (`tsc --noEmit` + `pnpm -r typecheck`). |
| 2 | `corepack pnpm lint` | **passed** — exit 0, **30 warnings, 0 errors**, the unchanged baseline. |
| 3 | `corepack pnpm test` | **passed** — exit 0, **zero FAIL lines**, **287 files / 2,929 tests**. Breakdown below. |
| 4 | `corepack pnpm build` | **passed via `next build --webpack`** (compile **and** the generated route-type gate). Turbopack — the Next 16 default — remains **blocked on this machine only**; see below. |
| 5 | `corepack pnpm test:no-supabase` | **passed** — "No forbidden retired transport references; only the approved pinned Neon transitive library is permitted". |
| 6 | `corepack pnpm test:no-self-service-claim` | **passed** — "OWNER_SELF_SERVICE_CLAIM is not enabled." (guardrail 15). |
| 7 | `corepack pnpm test:secret-boundary` | **blocked locally** — the script hard-codes `next build`, so it inherits the Turbopack blocker. Green in CI. |
| 8 | `corepack pnpm db:verify` | **blocked** — needs Docker, absent from this machine. |
| 9 | `corepack pnpm test:integration` | **blocked** — needs Docker. |
| 10 | `corepack pnpm e2e` | **not run locally** — needs a production build plus a served origin. |

### Test breakdown (gate 3)

`pnpm test` is three sequential commands, and the split matters:

| Suite | Files | Tests |
|---|---|---|
| app (`vitest run --exclude lib/evidence/safe-media.test.ts`) | 236 | 2,342 |
| `lib/evidence/safe-media.test.ts` (run alone, by design) | 1 | 62 |
| `packages/region` | 3 | 23 |
| `packages/scoring` | 16 | 183 |
| `packages/contracts` | 3 | 20 |
| `packages/scan-engine` | 28 | 299 |
| **Total** | **287** | **2,929** |

**A count discrepancy I raised and then resolved.** A raw `vitest run` (no `--exclude`) reports **2,404**; `pnpm test`'s first command reports **2,342**. That is 2,342 + 62 — the same tests counted under two different scopes, not tests going missing. Flagging the gap before checking was right; the first conclusion drawn from it was not.

## Two known-flaky behaviours, both timing, neither a regression

**1. Repo-walking specs time out under full parallel load.** In two raw `vitest run` passes, two tests failed per run with `Test timed out in 5000ms` — and **a different pair each time**: first `lib/identity/identity-sdk.test.ts` + `lib/report/competitor-invariance.test.ts`, then `tests/unhonoured-promises.test.ts` + `competitor-invariance.test.ts`. All pass in isolation (15/15 for the three together). The signature — non-repeating membership, always a timeout, always a spec that walks the source tree — is contention, not breakage. The canonical `pnpm test` run was clean, because keeping the heavy `safe-media` file out of the parallel pool is exactly what that `--exclude` is for.

**2. `safe-media.test.ts` starves when it is not given the machine.** Its first run this session took **138 s and failed**, with `TEST_HUNG` sentinels and 5 s timeouts across the decoder-lease and WebP-decode cases; re-run clean it was **62/62 in 5.65 s**. This is the "timing starvation" already documented in `PHASE-1-TEST-RESULTS.md`, and is why the script runs the file on its own. The file has not been touched since `aac32e6` (Phase 1) and nothing in Phase 2 reaches it.

Neither is a reason to relax a timeout. Both are reasons not to read a single loaded full-suite run as authoritative.

**3. One of them was mine, and it is fixed at the cause.** Adding P2's retention entry to `tests/unhonoured-promises.test.ts` made that file fail under load — three of its cases timing out in one run. Every `PROMISES` entry independently walked the whole source tree *and* read every file under `app/` and `lib/` for its detector, so each new promise the guard learns to catch multiplied the I/O. The walks and reads are now memoized and shared, with the one-off cost moved into a `beforeAll` carrying its own declared 60 s budget. **No test timeout was relaxed** — this guard is a filesystem scan whose cost scales with the repo, and widening the tests would hide a genuine hang behind the same number. Isolated: **4.66 s → 0.43 s**, and the file has not appeared in a failure set since (`7f93c25`).

**How often, honestly.** Across six canonical/raw runs at the end of this session the failure count went 0, 2, 2, 4, 1, 5, 4 — always timeouts, always in repo-walking specs or the documented `approve` case, and **never the same set twice**. The machine had been running heavy suites continuously for hours by then; the one clean `pnpm test` (exit 0, zero FAIL lines) came earliest, when it was freshest. Re-running until green would have proved nothing, so the range is recorded instead. CI, on a fresh Linux runner, is the authority.

## The Turbopack blocker (gate 4, and therefore gate 7)

`next build` fails on this Windows machine with 33 `Module not found` errors for `@radix-ui/react-*`, raised from inside `node_modules/.pnpm/radix-ui@1.6.7_.../dist/index.mjs`. It is **not** a broken install: all 55 declared dependencies are correctly symlinked, `createRequire` from that exact file resolves every one, and `next build --webpack` compiles the same tree. CI's `build` step passes with Turbopack on `ubuntu-latest`, so this is Windows-only.

**Deliberately not worked around.** Switching the production bundler, or making `scripts/assert-secret-boundary.mjs` pass `--webpack`, would change what ships to suit one developer machine — and the secret-boundary gate's whole value is that it inspects the bundle production actually serves. The gate stays blocked here and green in CI.

## Standing blockers (unchanged, and none of them mine to lift)

- **Docker** absent locally → `db:verify` and `test:integration` cannot run here. CI runs both. Every integration case written during this work was written blind against that constraint, and where a Docker-gated test pins behaviour I could not execute, the fix was shaped not to disturb it — finding 18 is the clearest case, where `neon-completion.integration.test.ts` mocks the website module to throw and asserts it is never called.
- **Hosted acceptance** — no authorized credentials, budget or test identities have been requested or granted, and none were used.
- **CI** — the last green run on this branch (all 18 steps) was `34461794233` at `2fc35aa`. The Phase 2 commits have **not** been through CI, because nothing has been pushed.

## Schema

No migration was added by any Phase 2 fix. Every column written — `action_runs.*` for the operator-draft custody, `locations.is_primary` / `place_id` for the second-claim fix, `scan_snapshots.website_checks` for the website-evidence fix — already exists. `scripts/neon/catalog.ts` deep-equals the frozen catalog, so this is worth stating rather than assuming: a Phase 2 fix that needed a schema change would have failed `db:verify`, which cannot run here.

---

# Phase 2 "Complete owner workspace" — gate results (2026-09-12)

A second body of work under the same phase number, and worth separating from
everything above: the sections before this record the **gap-register** run (24
audit findings). This one records the commissioning plan's Phase 2 proper —
`phase-prompts/02-COMPLETE-OWNER-WORKSPACE.md` and Master Plan §5, tracked in
`PHASE-2-BACKLOG.md`.

**Branch** `claude/development-continuation-b3cbc1` · **HEAD** `9a749ca` · Node **24.18.0**, pnpm **9.12.0** via corepack, Windows 11.

Base: `main` at `11033fb` (PR #13) merged with the eight unpushed commits from
`claude/sme-assistant-phase-1-e83fdc`, which carried the audit kit and backlog
items 2, 3 and 4. Eight further backlog items landed here (1, 6, 9, 10, 12, 15,
24, 25 — 6 and 12 are one defect).

**Everything below is locally verified. Nothing is hosted-verified.** No
deployment, migration, paid provider call, real email, OAuth consent or Stripe
event was attempted, and nothing was pushed.

## Gates

| # | Gate | Result |
|---|---|---|
| 1 | `corepack pnpm typecheck` | **passed** — exit 0 (`tsc --noEmit` + `pnpm -r typecheck`). |
| 2 | `corepack pnpm lint` | **passed** — **30 warnings, 0 errors**, the unchanged baseline. |
| 3 | `corepack pnpm test` | **passed** — exit 0, **293 files / 3,037 tests**. Breakdown below. |
| 4 | `corepack pnpm build` | **not run** — the Windows-only Turbopack blocker on `radix-ui` is unchanged; see the section above. |
| 5 | `corepack pnpm test:no-supabase` | **passed** — "No forbidden retired transport references; only the approved pinned Neon transitive library is permitted". |
| 6 | `corepack pnpm test:no-self-service-claim` | **passed** — "OWNER_SELF_SERVICE_CLAIM is not enabled." |
| 7 | `corepack pnpm test:secret-boundary` | **blocked locally** — shells out to `next build`, so it inherits the Turbopack blocker. |
| 8 | `corepack pnpm db:verify` | **blocked** — needs Docker, absent from this machine. No migration was added, so no new schema object needs it. |
| 9 | `corepack pnpm test:integration` | **blocked** — needs Docker. |
| 10 | `corepack pnpm e2e` | **not run** — needs a production build plus a served origin. |

### Test breakdown (gate 3)

| Suite | Files | Tests |
|---|---|---|
| app (`vitest run --exclude lib/evidence/safe-media.test.ts`) | 242 | 2,450 |
| `lib/evidence/safe-media.test.ts` (run alone, by design) | 1 | 62 |
| `packages/region` | 3 | 23 |
| `packages/scoring` | 16 | 183 |
| `packages/contracts` | 3 | 20 |
| `packages/scan-engine` | 28 | 299 |
| **Total** | **293** | **3,037** |

Against the gap-register run's 287 / 2,929 that is six new test files and ~107
new cases: `create-view`, `action-detail-client`, `agents/jsonld`,
`notifications` route, `notifications-list` (this session) and `more-view` (the
merged predecessor commits).

## A measurement mistake worth recording

An earlier reading of this gate said the suite failed with "4 files / 5 tests".
It was run as `corepack pnpm test 2>&1 | tail -12`, and **a pipeline's exit
status is `tail`'s**, so the harness reported exit 0 for a run that had
actually failed — and the failing file names were outside the twelve lines
kept. Re-run with the output redirected to a file rather than piped, the same
command exits 0 with 242/242 and 2,450/2,450.

The failures in that loaded run are the starvation flakiness already documented
above: `lib/identity/identity-sdk.test.ts` was one of them, and it passes 7/7 in
isolation. Its cause is now identified rather than just observed — the test
builds a session-cache JWT with a 60-second `exp`, so a starved run lets the
fixture expire mid-test and the SDK falls back to the network, breaking
`expect(transport).not.toHaveBeenCalled()`. Fixing that is filed separately; no
commit here touches `lib/identity/` or `proxy.ts`.

## Schema

No migration was added by any item in this run. Every column written —
`workspace_notifications.read_at`, `actions.action_state` / `provided_inputs`,
`audit_events.*` — already exists.

---

# P2.4 — operated assisted ownership assignment (2026-09-12)

The third body of work under this phase number. The first section records the
gap-register run; the second, the first batch of backlog items; this one records
**P2.4 — items 19–23, which also unblocked 27 and 28**.

**Branch** `claude/development-continuation-b3cbc1` · **HEAD** `1c25db9` · Node **24.18.0**, pnpm **9.12.0** via corepack, Windows 11.

Built from `docs/superpowers/plans/2026-09-12-assisted-ownership-assignment.md`
(15 tasks, TDD throughout), against the design in
`docs/superpowers/specs/2026-09-12-assisted-ownership-assignment-design.md`.

**Locally verified. Not hosted-verified.** No deployment, migration, paid
provider call, real email, OAuth consent or Stripe event was attempted, and
nothing was pushed. **Both new variables ship unset, so merging this changes no
behaviour** until someone deliberately sets `OPERATOR_EMAILS` and
`ASSISTED_ASSIGNMENT_ENABLED`.

## Gates

| # | Gate | Result |
|---|---|---|
| 1 | `corepack pnpm typecheck` | **passed** — exit 0. |
| 2 | `corepack pnpm lint` | **passed** — exit 0, **30 warnings, 0 errors**, the unchanged baseline. |
| 3 | `corepack pnpm test` | **254 files / 2,540 tests; 2,539 passed, 1 failed under load.** The one failure is `lib/identity/identity-sdk.test.ts`, which passes **7/7 in isolation** — see below. |
| 4 | `corepack pnpm build` | **blocked** — the Windows-only Turbopack `radix-ui` blocker, unchanged. |
| 5 | `corepack pnpm test:no-supabase` | **passed**. |
| 6 | `corepack pnpm test:no-self-service-claim` | **passed** — "OWNER_SELF_SERVICE_CLAIM is not enabled." |
| 7 | `corepack pnpm test:secret-boundary` | **blocked locally** — shells out to `next build`. |
| 8 | `corepack pnpm db:verify` | **blocked** — needs Docker. **No migration was added**, so nothing new depends on it. |
| 9 | `corepack pnpm test:integration` | **blocked** — needs Docker; the run hangs waiting for it. The four new acceptance cases were written against that constraint and first run in CI. |
| 10 | `corepack pnpm e2e` | **not run**. |

## The one failing test

`lib/identity/identity-sdk.test.ts` fails only under full parallel load and
passes 7/7 alone. **No commit in this release touches `lib/identity/` or
`proxy.ts`.**

Its cause is identified rather than merely observed: the test builds a
session-cache JWT with `exp: now + 60`, so a starved run lets the fixture expire
mid-test, the SDK falls back to the network, and
`expect(transport).not.toHaveBeenCalled()` fails. Filed as separate work; it is
a wall-clock defect in the fixture, not a regression here.

## Schema

**No migration.** Every column written already existed:
`workspace_access_requests(resolved_at, resolved_by_staff_user_id)` and
`audit_events(workspace_id, entity_type, entity_id, payload, idempotency_key)`.
The `idempotency_key` unique index had no writer before this release and is what
now makes a terminal decision exactly-once.

Two typed writers were widened to accept a null workspace id — `AuditEventInput`
and `ClaimAuditEvent`. The SQL column was always nullable; only TypeScript
required one. The compiler found the second writer after the first was changed.

## What is deliberately still off

DEC-06 remains pending. `OPERATOR_EMAILS` unset means nobody can open the queue;
`ASSISTED_ASSIGNMENT_ENABLED` unset means the decision route answers 404 to
everyone, including an allowlisted operator. The queue pages are readable with
the flag off by design, because DEC-06's recorded safe default is to build the
protected request, status and queue code and withhold only real approvals.
