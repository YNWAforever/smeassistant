# Phase 3 test results — P3.1 scan scheduler dispatch

Candidate: branch `claude/session-development-6a86ea` at `5aad416ee985a29ea0fc4a7acca770cd96d2453f`. Environment: Windows 11, Node `v24.18.0`, pnpm `9.12.0` via corepack, this worktree at `C:\Users\laich\Documents\smeassistant\.claude\worktrees\session-development-6a86ea`. Docker confirmed available (`docker version --format '{{.Server.Version}}'` → Server `29.7.2`).

**Read this first.** Everything below is **locally verified**. **Nothing here is hosted-verified.** No `CRON_SECRET` was set anywhere, no Vercel Cron was registered against a live deployment, and nothing was pushed. See `PHASE-3-REPORT.md`'s "Hosted authorization" section for exactly what that gap still requires.

## Gate results (Task 8, full verification)

| # | Command | Result |
|---|---|---|
| 1 | `corepack pnpm typecheck` | **passed** — exit 0. Root `tsc --noEmit` plus `pnpm -r typecheck` across all 4 workspace packages (`region`, `scoring`, `contracts`, `scan-engine`), each reporting `Done`. |
| 2 | `corepack pnpm lint` | **passed** — exit 0, **30 warnings, 0 errors**. Identical count and identical file list to the baseline recorded in `PHASE-1-TEST-RESULTS.md` and `PHASE-2-TEST-RESULTS.md`; no new warnings from this work. |
| 3 | `corepack pnpm test` | **passed** — exit 0, zero FAIL lines, **313 files / 3,213 tests**. Breakdown below. |
| 4 | `corepack pnpm build` (`next build`, Turbopack — the literal gate command) | **blocked** — see "The build gate" below. Not worked around: no flag was substituted into the actual gate command, nothing was reinstalled or patched, no code changed to route around it. |
| 5 | `corepack pnpm test:integration` | **passed** — exit 0, **27 files / 277 tests**, 245.17s. Includes the new `test/integration/neon-cron-dispatch.integration.test.ts` (5/5, detailed below). |

### Test breakdown (gate 3)

`pnpm test` is three sequential commands (app suite split in two, then every workspace package):

| Suite | Files | Tests |
|---|---|---|
| app (`vitest run --exclude lib/evidence/safe-media.test.ts`) | 262 | 2,626 |
| `lib/evidence/safe-media.test.ts` (run alone, by design — this repo's documented CPU-starvation isolation) | 1 | 62 |
| `packages/region` | 3 | 23 |
| `packages/scoring` | 16 | 183 |
| `packages/contracts` | 3 | 20 |
| `packages/scan-engine` | 28 | 299 |
| **Total** | **313** | **3,213** |

All six sub-runs reported zero failures on this run. No flake was observed in this pass (contrast with the intermittent timing-starvation flakes documented for full parallel loads in `PHASE-1-TEST-RESULTS.md` / `PHASE-2-TEST-RESULTS.md` — none reproduced here).

### The build gate (gate 4)

`next build` (Turbopack, the actual `package.json` `build` script) fails on this Windows machine with **"Turbopack build failed with 37 errors"** — a cascade of `Module not found: Can't resolve '@radix-ui/react-*'` inside `radix-ui`'s own barrel export (`node_modules/.pnpm/radix-ui@1.6.7.../node_modules/radix-ui/dist/index.mjs`), traced through `components/ui/progress.tsx` → `components/scanning-page.tsx` → `app/[locale]/scanning/[jobId]/page.tsx`.

This is **the same standing, pre-existing, Windows-only Turbopack/radix-ui blocker** already recorded in `PHASE-1-TEST-RESULTS.md` (gate 9: fails on `@radix-ui/react-toolbar`/`-tooltip`/`-visually-hidden`, "not caused by any change in this phase"), `PHASE-1-REPORT.md` ("The Turbopack blocker" section: "fails on this Windows machine with 33 `Module not found` errors"), and `PHASE-2-TEST-RESULTS.md` (gate 4: "not run — the Windows-only Turbopack blocker on `radix-ui` is unchanged"). It is not new, and two independent checks confirm it is unrelated to the P3.1 work:

1. **No P3.1 commit touches the failure's chain.** `git diff --stat 943281b..5aad416` (the full P3.1 range: design doc through the final concurrency test) lists 22 files changed, none of them `package.json`, `pnpm-lock.yaml`, `next.config.ts`, any `radix-ui` import, `components/ui/progress.tsx`, or `components/scanning-page.tsx`. The most recent commit touching `package.json` at all is `547da68` (2026-09-10), four days before P3.1's design doc (`7aa26bc`, 2026-09-13).
2. **The webpack fallback compiles clean.** `npx next build --webpack` → exit 0, `✓ Compiled successfully in 29.8s`, a full TypeScript pass (`Finished TypeScript in 15.9s`), 29/29 static pages generated, and the complete route manifest — including the new `/api/cron/dispatch` route — with zero errors anywhere in the output. This is the same diagnostic `PHASE-1-TEST-RESULTS.md` used ("passed via `next build --webpack`") to establish that the codebase itself is sound and the failure is an environment-specific (Windows + Turbopack + this worktree's pnpm symlink layout) module-resolution quirk, not a code defect. CI builds with Turbopack on `ubuntu-latest` and has historically passed this exact gate (`PHASE-1-TEST-RESULTS.md`'s hosted-CI table, run `34461794233`).

Recorded **blocked**, matching this repo's established convention of leaving the gate honestly blocked on this machine and green in CI, rather than substituting a different bundler into the gate itself.

### Integration suite detail (gate 5)

`test/integration/neon-cron-dispatch.integration.test.ts` run in isolation, verbose:

```
✓ finds a due schedule, notifies its paid opted-in workspace, and advances next_run_at        113ms
✓ locks a due schedule so a concurrent tick's dueSchedules call excludes it,
  per FOR UPDATE OF s SKIP LOCKED                                                              106ms
✓ advances a lite-tier workspace's schedule without creating a notification                     25ms
✓ ignores a schedule that is not yet due                                                        10ms
✓ finds a fresh queued job and a stale mid-collection job, but not a fresh in-flight one         11ms

Test Files  1 passed (1)
     Tests  5 passed (5)
```

The second case is the concurrency proof added in the final commit (`5aad416`): two real `PoolClient` connections, one holding a row lock inside an open transaction, the other's `dueSchedules()` call proven to exclude that row — run against real Postgres in Docker, not mocked.

## What Task 8 did not run

- `corepack pnpm e2e` / `e2e:acceptance` — needs a production build, which gate 4 cannot produce on this machine; outside Task 8's own scope.
- `corepack pnpm test:secret-boundary` — shells out to `next build` internally and inherits gate 4's blocker; unrelated to what P3.1 changed.
- `corepack pnpm db:verify` — no migration was added by any P3.1 commit (confirmed: no `neon/migrations/*.sql` file appears in the 22-file diff), so nothing new depends on it. Not run as part of this task; the schema is unchanged.
- Any hosted check (a real Vercel Cron firing, `CRON_SECRET` in a live environment) — see `PHASE-3-REPORT.md`.

---

# P3.2 applied evidence — test results

Candidate: branch `worktree-p32-rescan-reachability` at `dea6785`, based on `main` at `84bae0b` (PR #15, merged — P3.1). Environment: Windows 11, Node `v24.18.0`, pnpm `9.12.0` via corepack, worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p32-rescan-reachability`. Docker Server `29.7.2`.

**Read this first.** Everything below is **locally verified**. **Nothing here is hosted-verified.** Migration `0006` was applied only to disposable Docker Postgres by `db:verify` and by the integration harness — never to a hosted database. Nothing was deployed or pushed, and no paid provider was called. See the P3.2 section of `PHASE-3-REPORT.md` for what remains a documented manual step.

## Gate results (Task 10, full verification)

| # | Command | Result |
|---|---|---|
| 1 | `corepack pnpm typecheck` | **passed** — exit 0. Root `tsc --noEmit` plus `pnpm -r typecheck` across all 4 workspace packages (`region`, `scoring`, `contracts`, `scan-engine`), each reporting `Done`. |
| 2 | `corepack pnpm lint` | **passed** — exit 0, **30 warnings, 0 errors**. Identical count to the standing baseline in `PHASE-1-TEST-RESULTS.md`, `PHASE-2-TEST-RESULTS.md` and P3.1 above; all 30 are the same pre-existing `@typescript-eslint/no-unused-vars` warnings under `packages/**`. No new warning from this work. |
| 3 | `corepack pnpm test` | **passed** — exit 0, zero FAIL lines, **316 files / 3,264 tests**. Breakdown below. |
| 4 | `corepack pnpm build` (`next build`, Turbopack — the literal gate command) | **blocked** — see "The build gate" below. Not worked around: no flag was substituted into the gate command, nothing was reinstalled or patched, no code changed to route around it. |
| 5 | `corepack pnpm test:integration` | **passed** — exit 0, **28 files / 285 tests**, 136.33s. Includes the new `test/integration/neon-action-applications.integration.test.ts` (8/8, detailed below). |
| 6 | `corepack pnpm db:verify` | **passed** — exit 0. Detail below. |
| — | `npx next build --webpack` (diagnostic, **not** the gate) | **passed** — exit 0. See "The build gate". |

### Test breakdown (gate 3)

`pnpm test` is three sequential commands (app suite split in two, then every workspace package):

| Suite | Files | Tests |
|---|---|---|
| app (`vitest run --exclude lib/evidence/safe-media.test.ts`) | 265 | 2,677 |
| `lib/evidence/safe-media.test.ts` (run alone, by design — this repo's documented CPU-starvation isolation) | 1 | 62 |
| `packages/region` | 3 | 23 |
| `packages/scoring` | 16 | 183 |
| `packages/contracts` | 3 | 20 |
| `packages/scan-engine` | 28 | 299 |
| **Total** | **316** | **3,264** |

Delta against the P3.1 baseline of 313 files / 3,213 tests: **+3 files, +51 tests**, entirely in the app suite — every workspace package's counts are unchanged. The three new files are `lib/workspace/applications.test.ts`, `app/api/actions/[actionId]/applied/route.test.ts` and `components/workspace/home-brief.test.tsx`; the rest of the +51 comes from cases added to existing suites (`measurements`, `overview`, `format`, `queries-pages`, `i18n`, `action-detail-client`, `agents`). The fourth new test file, `test/integration/neon-action-applications.integration.test.ts`, belongs to gate 5 and is counted there. All six sub-runs reported zero failures; no flake was observed in this pass.

### The build gate (gate 4)

`next build` (Turbopack, the actual `package.json` `build` script) fails on this Windows machine with **"Turbopack build failed with 72 errors"** — the same cascade of `Module not found: Can't resolve '@radix-ui/react-*'` inside `radix-ui`'s own barrel export (`node_modules/.pnpm/radix-ui@1.6.7.../node_modules/radix-ui/dist/index.mjs`), here traced through `components/ui/separator.tsx` → `components/ui/sidebar.tsx` → `components/product-ui.tsx` → `components/public-pages.tsx` → `app/[locale]/pricing/page.tsx`.

This is **the same standing, pre-existing, Windows-only blocker** recorded in `PHASE-1-TEST-RESULTS.md` (gate 9), `PHASE-1-REPORT.md` ("The Turbopack blocker"), `PHASE-2-TEST-RESULTS.md` (gate 4) and P3.1 above. The error count varies between runs (33, 37, now 72) because it is a resolution cascade through a barrel file, not a fixed set of defects. Two checks confirm it is unrelated to P3.2:

1. **No P3.2 commit touches the failure's chain.** The 37-file diff `84bae0b..dea6785` contains no `package.json`, no `pnpm-lock.yaml`, no `next.config.ts`, no `radix-ui` import, and none of `components/ui/separator.tsx`, `components/ui/sidebar.tsx`, `components/product-ui.tsx` or `components/public-pages.tsx`.
2. **The webpack fallback compiles clean.** `npx next build --webpack` → exit 0, `✓ Compiled successfully in 34.7s`, a full TypeScript pass (`Finished TypeScript in 18.4s`), 29/29 static pages generated, and the complete route manifest — including the new `ƒ /api/actions/[actionId]/applied` route — with zero errors. This is the same diagnostic P3.1 and Phase 1 used to establish that the codebase itself is sound and the failure is environment-specific (Windows + Turbopack + this worktree's pnpm symlink layout).

Recorded **blocked**, matching this repo's convention of leaving the gate honestly blocked on this machine and green in CI, rather than substituting a different bundler into the gate itself.

### Migration verification (gate 6)

`corepack pnpm db:verify` — exit 0. The verifier applies the whole corpus against disposable Docker Postgres three times over (proving `IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` re-runnability), then checks every FK states an explicit `ON DELETE`. Final catalog:

```
applied:      0001_identity.sql, 0002_business.sql, 0003_workflows.sql,
              0004_atomic_operations.sql, 0005_owner_removal_guard.sql,
              0006_action_applications.sql
replay:       []
tables 35 · columns 416 · constraints 159 · indexes 86 · triggers 8 · functions 14
seededRows 0 · deferredFunctions [] · deferredTriggers []
```

`0006` is the only new migration; `0001`–`0005` were not edited. This proves the migration applies and re-applies cleanly against a disposable database. It says nothing about any hosted database — none was contacted.

### Integration suite detail (gate 5)

`test/integration/neon-action-applications.integration.test.ts`, verbose:

```
✓ records an assertion and completes the action in one transaction              166ms
✓ refuses to assert on a dismissed action and writes nothing                     42ms
✓ retraction stamps rather than deletes, and reopens the action                  52ms
✓ an ordinary assertion does not trip fence_workspace_completion_write           32ms
✓ tells a duplicate submit apart from a closed action                            37ms
✓ reports a genuinely closed action as closed, not duplicate                     26ms
✓ retraction stamps EVERY live owner assertion, not just the newest              58ms
✓ the sme_app_runtime grant from 0006 actually took                              24ms

Test Files  1 passed (1)
     Tests  8 passed (8)
```

The fourth case is the one that needed a real Postgres: `fence_workspace_completion_write` is a live trigger on `actions`, and the design's claim that an ordinary owner request does not trip it is proven here rather than argued from reading the function. The last case proves `0006`'s own `GRANT ... TO sme_app_runtime` took effect — necessary because `0003_workflows.sql`, which holds every other table's grant, is immutable.

## What Task 10 did not run

- `corepack pnpm e2e` / `e2e:acceptance` — needs a production build, which gate 4 cannot produce on this machine. **Not run.**
- `corepack pnpm test:secret-boundary` — shells out to `next build` internally and inherits gate 4's blocker. **Not run.**
- Any hosted check. In particular the plan's acceptance artifact — a real comparable pair proven in a browser, plus negative authorization examples — needs hosted access and explicit authorization from the repo owner and is **not run**, remaining a documented manual step alongside P3.1's unset `CRON_SECRET`.
- Any end-to-end exercise of `source='verified'`. No verifier exists; the seam has insert-path and precedence unit coverage only. **Not run, because there is nothing to run.** *(Closed for website templates by the website verifier slice below — see "What this did not run" there for what that closure does and does not extend to.)*

---

# Website verifier — test results

Candidate: branch `website-verifier` at `45c2746`, based on the P3.2 slice at `5a52c5e`. Environment: Windows 11, Node `v24.18.0`, pnpm `9.12.0` via corepack, worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p32-rescan-reachability`. Docker Server `29.7.2`.

**Read this first.** Everything below is **locally verified**. **Nothing here is hosted-verified.** Migration `0007` was applied only to disposable Docker Postgres by `db:verify` and by the integration harness — never to a hosted database. No live customer website was fetched: every `fetch` in the suite is injected. Nothing was deployed or pushed, and no paid provider was called. See the P3.2b section of `PHASE-3-REPORT.md` for what remains a documented manual step.

## Gate results (Task 8, full verification)

| # | Command | Result |
|---|---|---|
| 1 | `corepack pnpm typecheck` | **passed** — exit 0. Root `tsc --noEmit` plus `pnpm -r typecheck` across all 4 workspace packages (`region`, `scoring`, `contracts`, `scan-engine`), each reporting `Done`. |
| 2 | `corepack pnpm lint` | **passed** — exit 0, **30 warnings, 0 errors**. Exactly the standing baseline of `PHASE-1-TEST-RESULTS.md`, `PHASE-2-TEST-RESULTS.md`, P3.1 and P3.2 — the same pre-existing `@typescript-eslint/no-unused-vars` warnings under `packages/**`. Neither more nor fewer: no new warning from this work, and none of the standing ones disappeared. |
| 3 | `corepack pnpm test` | **passed** — exit 0, zero FAIL lines, **318 files / 3,298 tests**. Breakdown below. |
| 4 | `corepack pnpm build` (`next build`, Turbopack — the literal gate command) | **blocked** — exit 1, "Turbopack build failed with 72 errors". See "The build gate" below. Not worked around: no flag was substituted into the gate command, nothing was reinstalled or patched, no code changed to route around it. |
| 5 | `corepack pnpm test:integration` | **passed** — exit 0, **29 files / 300 tests**, 104.44s. Includes the new `test/integration/neon-website-verification.integration.test.ts` (15/15, detailed below). |
| 6 | `corepack pnpm db:verify` | **passed** — exit 0. Detail below. |
| — | `npx next build --webpack` (diagnostic, **not** the gate) | **passed** — exit 0. See "The build gate". |

### Test breakdown (gate 3)

`pnpm test` is three sequential commands (app suite split in two, then every workspace package):

| Suite | Files | Tests |
|---|---|---|
| app (`vitest run --exclude lib/evidence/safe-media.test.ts`) | 267 | 2,711 |
| `lib/evidence/safe-media.test.ts` (run alone, by design — this repo's documented CPU-starvation isolation) | 1 | 62 |
| `packages/region` | 3 | 23 |
| `packages/scoring` | 16 | 183 |
| `packages/contracts` | 3 | 20 |
| `packages/scan-engine` | 28 | 299 |
| **Total** | **318** | **3,298** |

Delta against the P3.2 baseline of 316 files / 3,264 tests: **+2 files, +34 tests**, entirely in the app suite — every workspace package's counts are unchanged, as expected for a slice that adds no package code. The two new files are `lib/verify/decide.test.ts` and `lib/verify/website-sweep.test.ts`; the rest of the +34 comes from cases added to existing suites (`templates`, `overview`, `queries-pages`, `action-detail-client`, `cron/dispatch/route`, `i18n`, `agents`). The third new test file, `test/integration/neon-website-verification.integration.test.ts`, belongs to gate 5 and is counted there. All six sub-runs reported zero failures; no flake was observed in this pass.

*A note on the plan's own numbers:* the plan text (written before Tasks 6–7 landed) cites an integration baseline of 28 files / 285 tests and says Task 7 would add "10 tests". The observed reality is 29 files / 300 tests, i.e. Task 7's file ended at **15** cases, not 10 — the extra five came from two review rounds that closed real gaps (the two untested eligibility filters, and then the timing gate, `retracted_at`, `markChecked`'s exact value, the ordering tiebreaker and the evidence round-trip). The plan was not retro-edited; the observed counts are recorded here.

### The build gate (gate 4)

`next build` (Turbopack, the actual `package.json` `build` script) fails on this Windows machine with **"Turbopack build failed with 72 errors"** — the same cascade of `Module not found: Can't resolve '@radix-ui/react-*'` inside `radix-ui`'s own barrel export (`node_modules/.pnpm/radix-ui@1.6.7.../node_modules/radix-ui/dist/index.mjs`), traced through `components/ui/separator.tsx` → `components/ui/sidebar.tsx` → `components/product-ui.tsx` → `components/public-pages.tsx` → `app/[locale]/pricing/page.tsx` — byte-for-byte the same chain and the same error count P3.2 recorded.

This is **the same standing, pre-existing, Windows-only blocker** recorded in `PHASE-1-TEST-RESULTS.md` (gate 9), `PHASE-1-REPORT.md` ("The Turbopack blocker"), `PHASE-2-TEST-RESULTS.md` (gate 4), P3.1 and P3.2. Two checks confirm it is unrelated to this work:

1. **No commit in this slice touches the failure's chain.** The 36-file diff `5a52c5e..45c2746` contains no `package.json`, no `pnpm-lock.yaml`, no `next.config.ts`, no `radix-ui` import, and none of `components/ui/separator.tsx`, `components/ui/sidebar.tsx`, `components/product-ui.tsx` or `components/public-pages.tsx`. The only component file it touches is `components/workspace/action-detail-client.tsx`, which is not in the trace.
2. **The webpack fallback compiles clean.** `npx next build --webpack` → exit 0, `✓ Compiled successfully in 18.4s`, a full TypeScript pass (`Finished TypeScript in 16.2s`), 29/29 static pages generated, and the complete route manifest — including `ƒ /api/cron/dispatch`, the route this slice extends — with zero errors anywhere in the output. This slice adds no new route, so there is no new manifest entry to look for; the extended one is present and compiles.

Recorded **blocked**, matching this repo's convention of leaving the gate honestly blocked on this machine and green in CI, rather than substituting a different bundler into the gate itself.

### Migration verification (gate 6)

`corepack pnpm db:verify` — exit 0. The verifier applies the whole corpus against disposable Docker Postgres three times over (proving `IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` re-runnability), then checks every FK states an explicit `ON DELETE`. Final catalog:

```
applied:      0001_identity.sql, 0002_business.sql, 0003_workflows.sql,
              0004_atomic_operations.sql, 0005_owner_removal_guard.sql,
              0006_action_applications.sql, 0007_action_verification.sql
replay:       []
tables 35 · columns 417 · constraints 159 · indexes 87 · triggers 8 · functions 14
seededRows 0 · deferredFunctions [] · deferredTriggers []
```

Delta against P3.2's catalog (35 / 416 / 159 / 86): **+1 column** (`actions.verification_checked_at`) and **+1 index** (`actions_verification_sweep_idx`), with table, constraint, trigger and function counts unchanged — exactly what `0007` adds and nothing else. `0007` is the only new migration; `0001`–`0006` were not edited. This proves the migration applies and re-applies cleanly against a disposable database. It says nothing about any hosted database — none was contacted.

### Integration suite detail (gate 5)

`test/integration/neon-website-verification.integration.test.ts`, verbose:

```
✓ returns an action with a live owner_asserted application                                      115ms
✓ returns an action with an exported approved version but no assertion                           21ms
✓ does NOT return an action with neither an assertion nor an exported version                    20ms
✓ does NOT return an action that already has a live verified row (permanent exclusion)           18ms
✓ a retracted owner_asserted application does not count as engagement                            17ms
✓ a retracted verified row does NOT exclude an otherwise-eligible action                         18ms
✓ does NOT return a location whose website_url is null, the empty string, or whitespace-only     30ms
✓ does NOT return a location whose action has no source_snapshot_id -- and actionsForLocations
  independently gives back nothing for it                                                        16ms
✓ excludes an action checked 1 hour ago and includes one checked 25 hours ago                    29ms
✓ markChecked stamps only the ids passed, with the exact value given, paired with the right
  workspace_id                                                                                  143ms
✓ produces one location row from dueLocations and two action rows from actionsForLocations       30ms
✓ recordApplication with source 'verified' lands a row that forActions returns, with its
  evidence intact                                                                                20ms
✓ a never-checked location sorts ahead of a mixed location, which sorts ahead of a
  fully-checked location with an older oldest-check                                              48ms
✓ records an Attributed measurement with attribution_basis 'verified' when the verified row
  precedes the head job's start                                                                  44ms
✓ records an Observed measurement with no attribution when the verified row is dated AFTER
  the head job's start                                                                           43ms

Test Files  1 passed (1)
     Tests  15 passed (15)
```

The last two are the pair that needed a real database: they prove the P3.2 timing gate still holds when the application row's `source` is `verified` rather than `owner_asserted` — a verification dated after the head scan started yields `Observed` with no basis, not a free `Attributed`.

## What this did not run

- `corepack pnpm e2e` / `e2e:acceptance` — needs a production build, which gate 4 cannot produce on this machine. **Not run.**
- `corepack pnpm test:secret-boundary` — shells out to `next build` internally and inherits gate 4's blocker. **Not run.**
- **`runWebsiteVerification` and `decideVerification` at the integration level.** The integration file exercises the repository's selection queries, `markChecked`, and the measurement/attribution path against real Postgres, but never calls the sweep or the decision rule. Both are covered by unit tests only (`lib/verify/website-sweep.test.ts`, `lib/verify/decide.test.ts`), with an injected `fetch` and an injected `record`. **Not run at that level** — a deliberate seam, recorded so nobody reads the 15 green integration cases as end-to-end proof of the sweep.
- Any real outbound fetch of a customer website. **Not run**, by design.
- Any hosted check: no deploy, no `CRON_SECRET` in a real environment, no observed live cron invocation of the new concern. **Not run**, the same outstanding step P3.1 recorded.

---

# P3.4 reliable events and the value metric — test results

Candidate: branch `p34-reliable-events` at `d734dd7`, 19 commits on top of `main` at `ed23418` (PR #18, merged). Environment: Windows 11, Node `v24.18.0`, pnpm `9.12.0` via corepack, worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p34-reliable-events`. Docker Server `29.7.2`.

**Read this first.** Everything below is **locally verified**. **Nothing here is hosted-verified.** Migration `0008` was applied only to disposable Docker Postgres by `db:verify` and by the integration harness, never to a hosted database. `report:value` was run only on its refusal path, with no database configured. Nothing was deployed or pushed, and no paid provider was called. See the P3.4 section of `PHASE-3-REPORT.md` for the runbook and what remains a manual step.

## Gate results (Task 10, full verification)

Run one at a time, in this order, from the worktree root.

| # | Command | Result |
|---|---|---|
| 1 | `corepack pnpm typecheck` | **passed**: exit 0. Root `tsc --noEmit` plus `pnpm -r typecheck` across all 4 workspace packages (`region`, `scoring`, `contracts`, `scan-engine`), each reporting `Done`. |
| 2 | `corepack pnpm lint` | **passed**: exit 0, **30 warnings, 0 errors**. Compared against `origin/main` in this task (see "Baseline" below): the same 18 files and the same 30 messages. The only difference is a line number: `app/api/scan/process/route.test.ts` `'_input' is defined but never used` moved from 914 to 945 because P3.4 added 31 lines above it. No new warning. *Correction to earlier sections:* the 30 warnings are not all under `packages/**`. Six of the 18 files are; the other twelve are app files (for example `lib/auth/staff.ts`, `lib/security/rate-limit.test.ts`). |
| 3 | `corepack pnpm test` | **passed**: exit 0, zero FAIL lines, **323 files / 3,413 tests**. Breakdown and baseline below. |
| 4 | `corepack pnpm build` (`next build`, Turbopack, the literal gate command) | **blocked**: exit 1, `Error: Turbopack build failed with 32 errors`. See "The build gate" below. Not worked around: no flag was substituted into the gate command, nothing was reinstalled or patched, no code changed to route around it. |
| 5 | `corepack pnpm test:integration` | **passed**: exit 0, **30 files / 324 tests**, 130.04s. Breakdown and baseline below. |
| 6 | `corepack pnpm db:verify` | **passed**: exit 0, `columns: 418`. Detail below. |
| — | `npx next build --webpack` (diagnostic, **not** the gate) | **passed**: exit 0. See "The build gate". |
| — | `corepack pnpm report:value` with `DATABASE_URL`, `VALUE_REPORT_HOST` and `VALUE_REPORT_DATABASE` unset (the plan's Task 9 Step 6 refusal check) | exit 1, stderr exactly `report:value failed: configuration`. No database was contacted. |

No run failed, so nothing was re-run. No flake was observed in this pass.

### Baseline, measured rather than taken from the plan

The plan cites pre-P3.4 baselines of **319 files / 3,311 tests** (unit) and **29 files / 301 tests** (integration). To find out what those numbers count, both suites were run at `origin/main` (`ed23418`) in a temporary worktree (`git worktree add` into the session scratchpad, `corepack pnpm install --frozen-lockfile`, then `corepack pnpm test` and `corepack pnpm test:integration`). The worktree was removed afterwards.

| Suite | `origin/main` `ed23418` | P3.4 `d734dd7` | Delta |
|---|---|---|---|
| app (`vitest run --exclude lib/evidence/safe-media.test.ts`) | 268 / 2,724 | 272 / 2,826 | +4 / +102 |
| `lib/evidence/safe-media.test.ts` (run alone, by design) | 1 / 62 | 1 / 62 | 0 |
| `packages/region` | 3 / 23 | 3 / 23 | 0 |
| `packages/scoring` | 16 / 183 | 16 / 183 | 0 |
| `packages/contracts` | 3 / 20 | 3 / 20 | 0 |
| `packages/scan-engine` | 28 / 299 | 28 / 299 | 0 |
| **`corepack pnpm test` total** | **319 / 3,311** | **323 / 3,413** | **+4 / +102** |
| **`corepack pnpm test:integration`** | **29 / 301** | **30 / 324** | **+1 / +23** |

Both plan baselines reproduce exactly, and they count the same six sub-runs the earlier sections of this file count. (The website-verifier section above recorded 318 / 3,298. The extra 1 file and 13 tests landed on `main` after that section was written and before P3.4 began. They were not attributed file by file here.)

The per-file delta comes from `vitest list --json` in both trees, grouped by file.

**Unit (+4 files, +102 tests):**

| File | Before → after | What it covers |
|---|---|---|
| `tests/neon-target.test.ts` | new, 50 | every branch of `safeName`, `canonicalHost`, `assertDatabaseUrl` and `assertTarget`, including the `4e82805` first-label and lowercase rules |
| `tests/value-report-cli.test.ts` | new, 20 | `configure` refusals, `formatText` columns and wording, `runReport` read-only ordering, database mismatch, failure categories and cleanup |
| `lib/analytics/scan-events.test.ts` | new, 12 | event builders, fixed dedupe keys, `insertScanEvent` on the caller's client, `writeScanEventSafely` savepoint, lock timeout and logging |
| `tests/value-report-week.test.ts` | new, 11 | ISO weeks in Hong Kong time, half-open boundaries, week 53, a 2024–2028 self-consistency walk |
| `app/api/scan/process/route.test.ts` | 24 → 27 | the consent gate gets the resolved analytics session; the cookie on a 403 and not on a 503 |
| `app/api/scan/start/route.test.ts` | 23 → 26 | forwarding goes through `after()`, not a bare promise; the job is still returned when forwarding never settles or `after()` throws; nothing is forwarded when the job was not created |
| `lib/db/transaction.test.ts` | 3 → 5 | `COMMIT` returning `ROLLBACK` rejects with `transaction_rolled_back`; a real commit returns the value |
| `lib/scan/start-job.test.ts` | 22 → 23 | an invalid event is refused before the transaction opens |

Five more unit files were rewritten with their test counts unchanged: `lib/scan/execution-store.test.ts`, `lib/scan/run.test.ts` (tests renamed from "pending insertion" to "never inserts from recordTerminal"), `lib/workspace/rescan.test.ts`, `lib/scan/consent-gate.test.ts` and `tests/neon-scan-unavailable.test.ts`.

**Integration (+1 file, +23 tests):**

| File | Before → after |
|---|---|
| `test/integration/neon-value-report.integration.test.ts` | new, 10 |
| `test/integration/neon-execution.integration.test.ts` | 7 → 15 |
| `test/integration/neon-scan-start.integration.test.ts` | 14 → 19 |

`neon-rescan` (4 tests) gained a `scan_started` assertion inside an existing test, and `neon-schema` updated its baselines. Neither changed its count. Subtracting the value-report file gives 324 − 10 = **314**. That is the integration count before Task 8, and it matches the 314 seen in a mid-phase run. The plan expected 9 value-report tests. There are 10, because the cross-tenant case was added in `173e287`.

### The build gate (gate 4)

`next build` (Turbopack, the actual `package.json` `build` script) fails on this Windows machine with **`Error: Turbopack build failed with 32 errors`**, exit 1. It is the same cascade of `Module not found: Can't resolve '@radix-ui/react-*'` inside `radix-ui`'s own barrel export (`node_modules/.pnpm/radix-ui@1.6.7.../node_modules/radix-ui/dist/index.mjs`). This run it was traced through `components/ui/alert-dialog.tsx` → `components/workspace/rescan-button.tsx` → `components/workspace/home-brief.tsx` → `app/[locale]/owner/[workspaceSlug]/page.tsx`. The unresolved modules were `react-roving-focus` (10), `react-dismissable-layer` (7), `react-visually-hidden` (4), `react-toggle-group` (3), and one each of `react-accessible-icon`, `-alert-dialog`, `-aspect-ratio`, `-context-menu`, `-dropdown-menu`, `-navigation-menu`, `-one-time-password-field` and `-password-toggle-field`.

This is **the same standing, pre-existing, Windows-only blocker** recorded in `PHASE-1-TEST-RESULTS.md` (gate 9), `PHASE-2-TEST-RESULTS.md` (gate 4), P3.1, P3.2 and the website verifier above. The error count varies between runs (33, 37, 72, now 32) because it is a resolution cascade through a barrel file. Two checks confirm it is unrelated to P3.4:

1. **No P3.4 commit touches the failure's chain.** The 43-file diff `ed23418..d734dd7` contains no `pnpm-lock.yaml`, no `next.config.ts`, no `radix-ui` import and no file under `components/`. It touches `package.json` by exactly one line, the new `"report:value": "tsx scripts/report/value.ts"` script entry. No dependency was added or changed.
2. **The webpack fallback compiles clean.** `npx next build --webpack` → exit 0, `✓ Compiled successfully in 27.2s`, `Finished TypeScript in 13.4s`, `✓ Generating static pages using 11 workers (29/29)`, and the full route manifest, including the two routes this phase changed (`ƒ /api/scan/start`, `ƒ /api/scan/process`), with zero errors.

Recorded **blocked**, matching this repo's convention of leaving the gate honestly blocked on this machine rather than substituting a different bundler into the gate itself. (An attempt to run the gate at `origin/main` for comparison, inside the temporary baseline worktree, failed for a different reason: Turbopack could not infer the workspace root from a directory under `%TEMP%`. It is not evidence either way and is not counted.)

### Migration verification (gate 6)

`corepack pnpm db:verify`: exit 0. Final catalog:

```
applied:      0001_identity.sql, 0002_business.sql, 0003_workflows.sql,
              0004_atomic_operations.sql, 0005_owner_removal_guard.sql,
              0006_action_applications.sql, 0007_action_verification.sql,
              0008_workspace_internal.sql
replay:       []
tables 35 · columns 418 · constraints 159 · indexes 87 · triggers 8 · functions 14
seededRows 0 · deferredFunctions [] · deferredTriggers []
```

The delta against the verifier's catalog (35 / 417 / 159 / 87) is **+1 column** (`workspaces.is_internal`) and nothing else. That is exactly the delta the design predicted before running it: "+1 column, +0 indexes". `0008` is the only new migration, and `0001`–`0007` were not edited. This proves the migration applies and re-applies cleanly against a disposable database. It says nothing about any hosted database, because none was contacted.

### Integration suite detail (gate 5)

The four integration files P3.4 touches, run together with `--reporter=verbose` (`4 passed (4)`, `48 passed (48)`). The new or changed event cases:

```
neon-execution
✓ persist writes exactly one scan_completed for done inside its transaction          17ms
✓ persist writes exactly one scan_completed for partial inside its transaction       17ms
✓ persist writes exactly one scan_completed for failed inside its transaction        16ms
✓ a retried persist leaves one scan_completed, because the dedupe key now conflicts  25ms
✓ recordTerminal still reaches PostHog and never writes a second row                 18ms
✓ persist still commits the scan when its event cannot be written                    26ms
✓ fail() writes one failed scan_completed only when its status guard matched         23ms
✓ persist does not wait on a blocked scan_events insert                             556ms
✓ fail() still marks the job failed when its event cannot be written                 30ms

neon-scan-start (scan-time consent)
✓ writes exactly one scan_started inside the job's own transaction                   11ms
✓ writes no scan_started when the job transaction fails before reaching it            6ms
✓ still creates the job when its scan_started cannot be written                      22ms
✓ failQueued fails a queued job with exactly one scan_completed, and leaves a
  non-queued one untouched
✓ failQueued still fails a queued job when its event cannot be written               22ms

neon-rescan
✓ enqueues actual TW jobs and server-attributed audit, then monthly schedule once    61ms

neon-value-report
✓ counts distinct locations with a counted delivery, excluding demo and internal     17ms
✓ states how many workspaces were excluded                                           14ms
✓ separates first, repeat and draft steps per location                               14ms
✓ reads scans from audit_jobs, excluding scans claimed by an internal workspace      14ms
✓ reconciles every job against scan_events, internal included                        14ms
✓ splits supported and assisted claims and excludes internal ones                    14ms
✓ counts first sign-ins, task failures and current missing input                     14ms
✓ never reports paid conversion as a number                                          13ms
✓ does not count a delivery whose version or action belongs to another workspace     21ms
✓ runs under a read-only transaction that Postgres enforces                           4ms
```

"persist does not wait on a blocked scan_events insert" took **556 ms** in this run. A second connection holds `ACCESS EXCLUSIVE` on `scan_events`, and `persist()` gives up after the 500 ms `lock_timeout` (SQLSTATE `55P03`, logged with the job id), then commits the job as `done`. The test's own ceiling is 5 s.

### Mutation checks performed in Task 10

Each mutation was applied by a scratch script, the named file was run on its own, and the original text was written back before the next one. `git status` was clean afterwards (apart from the two line-ending-only snapshot files, restored before the commit). Integration mutations ran against disposable Docker Postgres.

| # | Mutation | File run | Observed |
|---|---|---|---|
| E1 | `insertScanEvent` passes `null` instead of the dedupe key | `neon-execution` | **killed**, 5/15 failed, including "a retried persist leaves one scan_completed…": `expected [ …, … ] to have a length of 1 but got 2` |
| E2 | `recordTerminal` goes back to the engine's `recordEvent` | `neon-execution` | **killed**, 1/15: "recordTerminal still reaches PostHog and never writes a second row" |
| E3 | `fail()` writes the event whether or not its `UPDATE` matched | `neon-execution` | **killed**, 2/15: "fail() writes one failed scan_completed only when its status guard matched" (`expected true to be false` on the already-`done` job), plus "rolls back findings when result persistence fails…" |
| E4 | `SAVEPOINT` / `ROLLBACK TO` / `RELEASE` removed from `writeScanEventSafely` | `neon-execution` | **killed**, 3/15: "persist still commits the scan when its event cannot be written", "persist does not wait on a blocked scan_events insert", "fail() still marks the job failed when its event cannot be written" |
| S1 | the same savepoint removal | `neon-scan-start` | **killed**, 2/19: "still creates the job when its scan_started cannot be written", "failQueued still fails a queued job when its event cannot be written" |
| E5 | `SET LOCAL lock_timeout` removed | `neon-execution` | **killed**, 1/15: "persist does not wait on a blocked scan_events insert" |
| U1 | `withTransaction`'s `COMMIT`-tag guard removed | `lib/db/transaction.test.ts` | **killed**, 1/5: "rejects when COMMIT reports that the transaction was rolled back" |
| U2 | `after(() => …)` in `scan/start` replaced by an immediately invoked bare promise | `app/api/scan/start/route.test.ts` | **killed**, 1/26: "hands PostHog forwarding to after() instead of a bare promise" |
| V1 | `ELIGIBLE` drops `is_internal` | `neon-value-report` | **killed**, 4/10, including "counts distinct locations with a counted delivery, excluding demo and internal" |
| V2 | `ELIGIBLE` drops `is_demo` | `neon-value-report` | **killed**, 3/10, including the same primary-metric test |
| V3 | primary query ignores `d.counted` | `neon-value-report` | **killed**, 2/10, including the primary-metric test |
| V4 | `first_export` keeps NULL-location deliveries | `neon-value-report` | **killed**, 2/10, including "separates first, repeat and draft steps per location" |
| V5 | `started_events` counts `count(*)` instead of `count(DISTINCT e.job_id)` (the seed keeps a duplicate since `5e81fdf`) | `neon-value-report` | **killed**, 1/10: "reconciles every job against scan_events, internal included" |
| V6 | delivery → version tenant match removed from `DELIVERY_JOIN` | `neon-value-report` | **killed**, 1/10: "does not count a delivery whose version or action belongs to another workspace" |
| V7 | version → action tenant match removed from `DELIVERY_JOIN` | `neon-value-report` | **killed**, 1/10: the same cross-tenant test |
| V8 | the scans line drops `is_internal` | `neon-value-report` | **killed**, 1/10: "reads scans from audit_jobs, excluding scans claimed by an internal workspace" |
| V9 | the scans line drops `is_demo` | `neon-value-report` | **survived** at `d734dd7`, 0/10 failed, because the seed attached no scan to the demo workspace. **Closed in `65b6546`** (see the follow-up below): now **killed**, 1/10. |
| C1 | `BEGIN TRANSACTION READ ONLY` → `BEGIN` | `tests/value-report-cli.test.ts` | **killed**, 2/20: "opens a read-only transaction, checks the database, reports, then rolls back and closes", "stops at a different database before any report query" |
| C2 | the `current_database()` check removed | `tests/value-report-cli.test.ts` | **killed**, 1/20: "stops at a different database before any report query" |
| C3 | `assertTarget` removed from `configure` | `tests/value-report-cli.test.ts` | **killed**, 1/20: "refuses a DATABASE_URL pointing somewhere other than the named target" |
| C4 | an unparseable `DATABASE_URL` attached as `cause` | `tests/value-report-cli.test.ts` | **killed**, 1/20: "never attaches the unparseable URL as a cause, because it would carry the password" |
| C5 | the plan's original `line()` (`padEnd(26)` / `padEnd(28)`, no gap) | `tests/value-report-cli.test.ts` | **killed**, 3/20: "separates the longest label from its value", "keeps label, value and note in separate columns on every row", "keeps a value wider than its column apart from the note" |
| T1 | `canonicalHost` restored to its pre-`4e82805` form | `tests/neon-target.test.ts` | **killed**, 2/50: "strips -pooler from the first label only", "lowercases, because postgres: URLs keep the host's case and DNS ignores it" |

The commits record two earlier mutation checks. `5e81fdf` made the duplicate `scan_started` a permanent part of the seed. Task 8 had checked V5 with a temporary duplicate and then removed it, which left the suite unable to detect the mutation. `d404f04` renamed the scan-start rollback test after finding that it cannot exercise "written, then rolled back". The other mutation checks the plan asked for at Tasks 3, 5 and 8 left no recorded observations in the commits. The table above is what Task 10 observed itself.

### Follow-up after Task 10: V9 closed (`65b6546`)

The review of Task 10 closed V9 rather than leave it open. The change touches only the test.

- **Seed.** `neon-value-report` seeds one `done` scan in W38 attached to the demo workspace, next to the one attached to the internal workspace.
- **Scans.** The expectation is unchanged at `{started: 4, completedFull: 1, completedPartial: 1, failed: 1, inProgress: 1}`, because the demo scan is excluded. The test is renamed "reads scans from audit_jobs, excluding scans claimed by an internal or demo workspace".
- **Reconciliation.** This check covers every job, internal and demo included, so it re-derives from `{5, 3, 4, 1}` to `{jobsStarted: 6, startedEvents: 3, jobsTerminal: 5, completedEvents: 1}`. The demo scan is one more started job and one more terminal job, with no events. The test is renamed "reconciles every job against scan_events, internal and demo included".
- **Observed.**
  - The file passes 10/10.
  - V9 reapplied (`coalesce(w.is_demo OR w.is_internal, false)` → `coalesce(w.is_internal, false)`) fails 1/10, on the renamed scans test. The query was then restored.
  - `corepack pnpm test:integration` exits 0 with **30 files / 324 tests**, the same count as in Task 10.

The test names in the Task 10 output and mutation table above are the names at `d734dd7`.

### After the whole-branch review (`f4c4613`, `5b8cc9d`)

A final review of the whole branch found one Important and four Minor findings. `PHASE-3-REPORT.md` covers them. These are the test changes and the observations:

- **`f4c4613`: the dead F-34 writer was removed.**
  - Deleted `lib/analytics/events-repository.test.ts`, along with the file it tested.
  - Removed three `neon-integrations` tests that exercised only `recordEvent` + `eventRepository`:
    - "cancels locked analytics, frees its connection and never inserts after unlock";
    - "records analytics through Neon and suppresses duplicate provider effects";
    - "captures analytics once after persistence and fails open without capturing on database failure".
  - Added `tests/scan-events-single-writer.test.ts`. A planted `insert\n INTO scan_events` string in `lib/analytics/posthog.ts` failed it and named that file. The string was then restored.
  - `lib/scan/run.test.ts` replaced a vacuous "insert mock not called" assertion. It now asserts exactly one `scan_events` insert statement and no `backend_unavailable` report. Pointing `recordTerminal` at the engine's `recordEvent` failed it. That change was then restored.
- **`5b8cc9d`: the location hops are now tenant-matched.** It adds two rolled-back cross-tenant tests to `neon-value-report`:
  - **(a)** A demo workspace's counted W37 delivery on an action pointing at L1. `repeatWeeklyExport` must stay 1. With the EXISTS workspace match reverted, it became 2.
  - **(b)** Counted W38 deliveries on actions pointing at a demo location: one in E1, and one in a fresh eligible workspace E3, whose only delivery it is. Locations must stay 2 and workspaces 2, with eligibleWorkspaces 3. With `LOCATION_MATCHED` reverted, locations and workspaces both became 3.
  - The other 10 tests kept their expectations.

| Suite at `5b8cc9d` | Files / tests | vs `d734dd7` |
|---|---|---|
| `corepack pnpm test` (all six sub-runs) | **323 / 3,414**, exit 0 | +0 files / +1 test. The added guard file and the deleted repository test file net to zero files. The test count is the net of tests added and removed across those two files and `run.test.ts`. |
| `corepack pnpm test:integration` | **30 / 323**, exit 0 | −1 test: 3 removed from `neon-integrations`, 2 added to `neon-value-report` (which now has 12) |
| `corepack pnpm typecheck` | exit 0 | — |
| `corepack pnpm lint` | 30 warnings / 0 errors | unchanged |

## What Task 10 did not run

- `corepack pnpm e2e` / `e2e:acceptance`: need a production build, which gate 4 cannot produce on this machine. **Not run.**
- `corepack pnpm test:secret-boundary`: shells out to `next build` internally and inherits gate 4's blocker. **Not run.**
- `corepack pnpm report:value` against any real database. Only the refusal path was run. **Not run**, by design: it needs `0008` applied (DEC-11) and an explicit target.
- `corepack pnpm neon:readiness` against any target. Its unit suite (`tests/neon-readiness.test.ts`, unchanged by P3.4) passes inside gate 3. **Not run** against a database.
- Any hosted check: no deploy, no migration applied anywhere real, no observed reconciliation gap on real traffic. **Not run.**

---

# P3.2c honest comparison states — test results

## P3.2c — honest comparison states

Candidate: branch `p32-comparison-states` at `ede55de`, 5 commits on top of `main` at `073c4ae` (PR #19, merged). Design: [`docs/superpowers/specs/2026-09-24-comparison-states-design.md`](../../superpowers/specs/2026-09-24-comparison-states-design.md). Environment: Windows 11, Node `v24.18.0`, pnpm `9.12.0` via corepack, worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p32-comparison-states`. Docker Server `29.7.2`.

**Read this first.** Everything below is **locally verified**. **Nothing here is hosted-verified.** No migration was added. Nothing was deployed or pushed, and no paid provider was called. The acceptance route that carries the changed viewer expectation was **not run** locally. See the P3.2c section of `PHASE-3-REPORT.md` for the states, the privacy argument and the checklist.

### Gate results (Task 5, full verification)

Run one at a time, in this order, from the worktree root.

| # | Command | Result |
|---|---|---|
| 0 | `git diff --stat origin/main -- lib/report/comparison/projection.ts components/report/scan-comparison.tsx lib/funnel/report-props.ts lib/report/view-model.ts packages neon/migrations` | empty output (0 bytes), as the plan expects |
| 1 | `corepack pnpm typecheck` | **passed**: exit 0. Root `tsc --noEmit` plus `pnpm -r typecheck` across all 4 workspace packages, each reporting `Done`. |
| 2 | `corepack pnpm lint` | **passed**: exit 0, **30 warnings, 0 errors**, across 18 files. The same counts as P3.4. None of the 18 files is touched by this branch. |
| 3 | `corepack pnpm test` | **passed**: exit 0, zero failures, **323 files / 3,439 tests**. Breakdown below. |
| 4 | `corepack pnpm test:integration` | **passed**: exit 0, **30 files / 323 tests**, 126.75s. Unchanged from P3.4's final count, as expected for a slice with no repository or SQL change. |
| 5 | `corepack pnpm build` (`next build`, Turbopack, the literal gate command) | **blocked**: exit 1, `Error: Turbopack build failed with 45 errors`. See "The build gate" below. Not worked around. |
| — | `npx next build --webpack` (diagnostic, **not** the gate) | **passed**: exit 0. See "The build gate". |

No run failed, so nothing was re-run. No flake was observed in this pass.

### Test breakdown (gate 3)

| Suite | P3.4 final (`5b8cc9d`) | P3.2c (`ede55de`) | Delta |
|---|---|---|---|
| app (`vitest run --exclude lib/evidence/safe-media.test.ts`) | 272 / 2,827 | 272 / 2,852 | 0 / +25 |
| `lib/evidence/safe-media.test.ts` (run alone, by design) | 1 / 62 | 1 / 62 | 0 |
| `packages/region` | 3 / 23 | 3 / 23 | 0 |
| `packages/scoring` | 16 / 183 | 16 / 183 | 0 |
| `packages/contracts` | 3 / 20 | 3 / 20 | 0 |
| `packages/scan-engine` | 28 / 299 | 28 / 299 | 0 |
| **Total** | **323 / 3,414** | **323 / 3,439** | **0 / +25** |

The per-file delta comes from `vitest list --json` on the four changed test files, at HEAD and with those files and their sources checked out at `origin/main`. They were restored from HEAD afterwards and `git status` was clean.

| File | Before → after | What was added |
|---|---|---|
| `lib/report/comparison/load.test.ts` | 19 → 31 (+12) | the `loadScanComparison states` block: two viewer tests, two `no_earlier_scan` cases, staff, `not_comparable`, `insufficient_evidence`, two precedence cases, the unusable-current-scan trio |
| `lib/report/comparison/derive.test.ts` | 13 → 21 (+8) | 3 `compareScanMetrics` cases (different sources, unknown shared query, no usable evidence) and 5 `hasUsableEvidence` cases |
| `components/report/scan-comparison.test.tsx` | 10 → 14 (+4) | "renders every unavailable reason in %s…" (3 locales) and "tells a viewer how to get history…" |
| `lib/report/load-report.test.ts` | 38 → 39 (+1) | "tells a member there is no earlier scan when the location has none" |
| **Total** | **+25** | |

No test file was added or removed, so the file count is unchanged. The acceptance spec is a Playwright file and is not in this count. The integration suite has no file for this slice.

### The build gate (gate 5)

`next build` fails on this Windows machine with **`Error: Turbopack build failed with 45 errors`**, exit 1. It is the same cascade of `Module not found: Can't resolve '@radix-ui/react-*'` inside `radix-ui`'s own barrel export (`node_modules/.pnpm/radix-ui@1.6.7.../node_modules/radix-ui/dist/index.mjs`). This run it was traced mainly through `components/ui/radio-group.tsx` → `components/unlock-page.tsx` → `app/[locale]/unlock/[slug]/page.tsx`. The unresolved modules were `react-roving-focus` (8), `react-dismissable-layer` (6), `react-collection` (6), `react-visually-hidden` (4), `react-focus-scope` (4), `react-toggle-group` (3), `react-collapsible` (3), and one each of `-accessible-icon`, `-alert-dialog`, `-aspect-ratio`, `-context-menu`, `-dropdown-menu`, `-hover-card`, `-navigation-menu`, `-one-time-password-field`, `-password-toggle-field`, `-radio-group` and `-scroll-area`.

This is **the same standing, pre-existing, Windows-only blocker** recorded in `PHASE-1-TEST-RESULTS.md`, `PHASE-2-TEST-RESULTS.md`, P3.1, P3.2, the website verifier and P3.4 above. The error count varies between runs (33, 37, 72, 32, now 45). Two checks confirm it is unrelated to this slice:

1. **No commit in this slice touches the failure's chain.** `git diff --stat origin/main..HEAD -- package.json pnpm-lock.yaml next.config.ts components/ui components/unlock-page.tsx` is empty. No file this branch changed appears in any import trace in the build output.
2. **The webpack fallback compiles clean.** `npx next build --webpack` → exit 0, `✓ Compiled successfully in 26.0s`, `Finished TypeScript in 13.1s`, `✓ Generating static pages using 11 workers (29/29)`, and the full route manifest, including `ƒ /[locale]/r/[slug]`, the route whose loader this slice changed, with zero errors.

Recorded **blocked**, matching this repo's convention of leaving the gate honestly blocked on this machine rather than substituting a different bundler into the gate itself.

### Mutation checks, re-run in Task 5

The implementers of Tasks 1–3 reported 11 mutation checks. Task 5 re-ran all 11 rather than take them on report. A scratch script applied each mutation by exact pattern (refusing to proceed unless the pattern matched exactly once), ran the named test files with Vitest's JSON reporter, wrote the original bytes back, and compared them. Every file was restored **byte-identical**, and `git status` was clean afterwards. T3.1 was run by hand, because it needs `tsc`.

| # | Mutation | Files run | Observed in Task 5 |
|---|---|---|---|
| T1.1 | drop the `hasUsableEvidence` guard from `compareScanMetrics`' fallback (keep only `overlaps`) | `derive.test.ts` | **killed**, 1/21: "is insufficient evidence when either scan has no usable evidence at all" |
| T1.2 | `overlaps` returns `false` | `derive.test.ts` | **killed**, 2/21: "is insufficient evidence when the only shared query is unknown on one side", and "reports changed context as not comparable, and incomplete or oversized cohorts as insufficient evidence" |
| T1.3 | drop `cohort.complete` from `hasUsableEvidence` | `derive.test.ts` | **killed**, 1/21: "hasUsableEvidence rejects an incomplete cohort" |
| T1.4 | drop `ig.complete` from `hasUsableEvidence` | `derive.test.ts` | **killed**, 1/21: "accepts a complete Instagram sample and rejects an incomplete one" |
| T2.1 | delete the `reader === 'viewer'` shortcut | `load.test.ts`, `load-report.test.ts` | **killed**, 5/70: the two loader viewer tests and all three load-report viewer cases |
| T2.2 | `load-report.ts` passes `'member'` instead of `access.kind` | `load-report.test.ts` | **killed**, 3/39: the three load-report viewer cases |
| T2.3 | swap the `sawInsufficient` branch in `exhausted()` | `load.test.ts`, `load-report.test.ts` | **killed**, 4/70: both "prefers insufficient evidence over not comparable…" cases, "reports not comparable when every authorized earlier scan measured different searches", and "reports insufficient evidence when an authorized earlier scan overlaps but is incomplete" |
| T2.4 | delete the `if (!currentUsable) return …` line | `load.test.ts`, `load-report.test.ts` | **killed**, 1/70: "reports insufficient evidence for a current scan without usable evidence, reading no earlier scan", on its `readInput` assertion (`expected "vi.fn()" to not be called at all, but actually been called 1 times`) |
| T2.5 | move `sawValid = true` after the `authorize` check | `load.test.ts`, `load-report.test.ts` | **killed**, 4/70: "returns no accessible pair when all candidates are denied", "reports exhaustion after exactly 1000 denied candidates", "keeps no accessible pair when a current scan without usable evidence has only denied history", and the load-report member-denied test "authorizes each historical candidate by its own membership before reading private data" |
| T3.1 | delete the zh-TW `not_comparable` entry | `npx tsc --noEmit`, `scan-comparison.test.tsx` | **killed**: `tsc` exit 2, `lib/report/comparison/copy.ts(27,5): error TS2741: Property 'not_comparable' is missing…`; Vitest 1/14: "renders every unavailable reason in zh-TW, never claiming a first scan" |
| T3.2 | en `no_earlier_scan` → "This is the first scan of this location." | `scan-comparison.test.tsx` | **killed**, 2/14: "renders every unavailable reason in en, never claiming a first scan", "tells a viewer how to get history, and the others why there is none" |

Every observation matches what the implementers reported. The only difference is detail: T1.2 also fails a second, renamed test that the implementer's report did not name.

### The plan defect, re-checked

`PHASE-3-REPORT.md` records why Tasks 2 and 3 landed together in `a7aa56d`. Re-checked here: with `lib/report/comparison/copy.ts` checked out at `origin/main` and everything else at HEAD, `npx tsc --noEmit` exits 2 with `components/report/scan-comparison.tsx(31,79): error TS7053`, the same error in `scan-comparison.test.tsx(70,48)`, and `TS2339` in `e2e/acceptance/report-scan-comparison.spec.ts(79,74)`. `copy.ts` was restored from HEAD.

## What Task 5 did not run

- `corepack pnpm e2e` / `e2e:acceptance`: need a production build, which gate 5 cannot produce on this machine. **Not run.** CI runs both: `.github/workflows/ci.yml` runs `pnpm e2e`, then `pnpm e2e:acceptance`, and `playwright.acceptance.config.ts` points at `./e2e/acceptance`. The changed expectation in `e2e/acceptance/report-scan-comparison.spec.ts` (`no_history_access` for the current-only-unlocked viewer), and its unchanged HTML and RSC privacy assertions, are proven only where CI runs them.
- `corepack pnpm test:secret-boundary`: shells out to `next build` internally and inherits gate 5's blocker. **Not run.**
- `corepack pnpm db:verify`: no migration was added (`git diff origin/main -- neon/migrations` is empty). **Not run.**
- Any hosted check, including the successful-pair browser artifact. **Not run**: it needs hosted access and the repository owner's authorization.
