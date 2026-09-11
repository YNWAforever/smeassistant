# Phase 2 gate results

Gate-by-gate record for the Phase 2 gap-register work (all 24 findings plus P1 and P3). The Phase 1 counterpart is `PHASE-1-TEST-RESULTS.md`; the decisions behind each fix are in `PHASE-2-GAP-REGISTER.md`.

**Branch** `claude/sme-assistant-phase-1-e83fdc` · **HEAD at time of run** `d514e3d` · Node **24.18.0**, pnpm **9.12.0** via corepack, Windows 11.

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

## The Turbopack blocker (gate 4, and therefore gate 7)

`next build` fails on this Windows machine with 33 `Module not found` errors for `@radix-ui/react-*`, raised from inside `node_modules/.pnpm/radix-ui@1.6.7_.../dist/index.mjs`. It is **not** a broken install: all 55 declared dependencies are correctly symlinked, `createRequire` from that exact file resolves every one, and `next build --webpack` compiles the same tree. CI's `build` step passes with Turbopack on `ubuntu-latest`, so this is Windows-only.

**Deliberately not worked around.** Switching the production bundler, or making `scripts/assert-secret-boundary.mjs` pass `--webpack`, would change what ships to suit one developer machine — and the secret-boundary gate's whole value is that it inspects the bundle production actually serves. The gate stays blocked here and green in CI.

## Standing blockers (unchanged, and none of them mine to lift)

- **Docker** absent locally → `db:verify` and `test:integration` cannot run here. CI runs both. Every integration case written during this work was written blind against that constraint, and where a Docker-gated test pins behaviour I could not execute, the fix was shaped not to disturb it — finding 18 is the clearest case, where `neon-completion.integration.test.ts` mocks the website module to throw and asserts it is never called.
- **Hosted acceptance** — no authorized credentials, budget or test identities have been requested or granted, and none were used.
- **CI** — the last green run on this branch (all 18 steps) was `34461794233` at `2fc35aa`. The Phase 2 commits have **not** been through CI, because nothing has been pushed.

## Schema

No migration was added by any Phase 2 fix. Every column written — `action_runs.*` for the operator-draft custody, `locations.is_primary` / `place_id` for the second-claim fix, `scan_snapshots.website_checks` for the website-evidence fix — already exists. `scripts/neon/catalog.ts` deep-equals the frozen catalog, so this is worth stating rather than assuming: a Phase 2 fix that needed a schema change would have failed `db:verify`, which cannot run here.
