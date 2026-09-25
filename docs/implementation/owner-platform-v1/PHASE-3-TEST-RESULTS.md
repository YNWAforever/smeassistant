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

Candidate: branch `p32-comparison-states` at `f78174d`, 10 commits on top of `main` at `073c4ae` (PR #19, merged; `origin/main` still points there). The Task 5 results below were taken at `ede55de` (5 commits). The Task 8 results, taken at `f78174d` after the whole-branch review and Tasks 6–7, follow them. Design: [`docs/superpowers/specs/2026-09-24-comparison-states-design.md`](../../superpowers/specs/2026-09-24-comparison-states-design.md). Environment: Windows 11, Node `v24.18.0`, pnpm `9.12.0` via corepack, worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p32-comparison-states`. Docker Server `29.7.2`.

**Read this first.** Everything below is **locally verified**. **Nothing here is hosted-verified.** No migration was added. Nothing was deployed or pushed, and no paid provider was called. The acceptance route that carries the changed viewer expectation was **not run** locally, and no member sign-in was exercised in a browser. See the P3.2c section of `PHASE-3-REPORT.md` for the states, the privacy argument, the review, the membership wiring and the checklist.

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

### Gate results (Task 8, after the whole-branch review, at `f78174d`)

Run one at a time, in this order, from the worktree root, on 2026-09-25. `git rev-parse HEAD` = `f78174dcfc11bea26185f7258c8a9a2122e4205a`.

| # | Command | Result |
|---|---|---|
| 0 | `git diff --stat origin/main -- lib/report/comparison/projection.ts components/report/scan-comparison.tsx lib/funnel/report-props.ts lib/report/view-model.ts packages neon/migrations` | empty output (0 bytes) |
| 1 | `corepack pnpm typecheck` | **passed**: exit 0. Root `tsc --noEmit` plus `pnpm -r typecheck` across all 4 workspace packages, each reporting `Done`. |
| 2 | `corepack pnpm lint` | **passed**: exit 0, `✖ 30 problems (0 errors, 30 warnings)`, across 18 files. None of the 18 is among the 14 non-doc files this branch changes. |
| 3 | `corepack pnpm test` | **passed**: exit 0, zero failures, **324 files / 3,450 tests**. Breakdown below. |
| 4 | `corepack pnpm test:integration` | **passed**: exit 0, **30 files / 323 tests**, 158.70s. Unchanged from P3.4 and from Task 5. |
| 5 | `corepack pnpm build` (`next build`, Turbopack, the literal gate command) | **blocked**: exit 1, `Error: Turbopack build failed with 45 errors`. The same `Module not found: Can't resolve '@radix-ui/react-*'` cascade inside `radix-ui`'s barrel, with the same per-module counts as Task 5 (`react-roving-focus` 8, `react-dismissable-layer` 6, `react-collection` 6, …). The traces run mainly through `components/unlock-page.tsx`, `components/ui/radio-group.tsx` and `app/[locale]/unlock/[slug]/page.tsx`. `git diff --stat origin/main..HEAD -- package.json pnpm-lock.yaml next.config.ts components/ui components/unlock-page.tsx` is empty. Not worked around. |
| — | `npx next build --webpack` (diagnostic, **not** the gate) | **passed**: exit 0, `✓ Compiled successfully in 12.4s`, `Finished TypeScript in 18.0s`, `✓ Generating static pages using 11 workers (29/29)`, and `ƒ /[locale]/r/[slug]` in the route manifest. That is the page Task 6 changed. |

No run failed, so nothing was re-run. No flake was observed.

After gate 3, the two tracked snapshot files (`lib/agents/__snapshots__/agents.test.ts.snap`, `lib/pocket-assistant/__snapshots__/demo.test.ts.snap`) showed as modified. `git diff --ignore-cr-at-eol --stat` was empty, so the change was line endings only, and both were restored with `git restore`. One working-tree mishap is also recorded here: a per-file count attempted after gate 3 with `vitest list --json lib/auth.test.ts …` treated `lib/auth.test.ts` as the JSON output path and overwrote it. It was restored with `git restore lib/auth.test.ts` (back to 400 lines), and the counts below were then taken with `vitest run --reporter=json --outputFile=<scratch file>`. Gate 3 had already run on the committed file. `git status` was clean before the documentation edits.

#### Test breakdown (gate 3)

| Suite | P3.4 final (`5b8cc9d`) | Task 5 (`ede55de`) | Task 8 (`f78174d`) | Delta vs P3.4 |
|---|---|---|---|---|
| app (`vitest run --exclude lib/evidence/safe-media.test.ts`) | 272 / 2,827 | 272 / 2,852 | 273 / 2,863 | +1 / +36 |
| `lib/evidence/safe-media.test.ts` (run alone, by design) | 1 / 62 | 1 / 62 | 1 / 62 | 0 |
| `packages/region` | 3 / 23 | 3 / 23 | 3 / 23 | 0 |
| `packages/scoring` | 16 / 183 | 16 / 183 | 16 / 183 | 0 |
| `packages/contracts` | 3 / 20 | 3 / 20 | 3 / 20 | 0 |
| `packages/scan-engine` | 28 / 299 | 28 / 299 | 28 / 299 | 0 |
| **Total** | **323 / 3,414** | **323 / 3,439** | **324 / 3,450** | **+1 / +36** |

File by file against P3.4's 323 / 3,414. The Task 5 rows repeat the counts measured in Task 5. The Task 6–7 rows were measured in Task 8 with `vitest run --reporter=json`, at HEAD and with `lib/auth.test.ts` and `derive.test.ts` checked out at `ede55de` (restored from HEAD afterwards; `git status` clean). `lib/auth.test.ts` has no change in `073c4ae..ede55de`, so its `ede55de` count is also its P3.4 count.

| File | Before → after | Commit | What was added |
|---|---|---|---|
| `lib/report/comparison/load.test.ts` | 19 → 31 (+12) | `a7aa56d` | the `loadScanComparison states` block (Task 5 table above) |
| `lib/report/comparison/derive.test.ts` | 13 → 22 (+9) | `5238a7b` (+8), `f78174d` (+1) | 3 `compareScanMetrics` and 5 `hasUsableEvidence` cases, then the Instagram-overlap case (21 → 22) |
| `components/report/scan-comparison.test.tsx` | 10 → 14 (+4) | `a7aa56d` | the per-locale reason test (3) and the viewer test |
| `lib/report/load-report.test.ts` | 38 → 39 (+1) | `a7aa56d` | "tells a member there is no earlier scan when the location has none" |
| `lib/auth.test.ts` | 23 → 31 (+8) | `f5fdf84` | the `reportMembershipResolver` block: 5 `it` plus one `it.each` over owner, manager and viewer |
| `app/[locale]/r/[slug]/page.test.tsx` | new file, 0 → 2 (+2; +1 file) | `f5fdf84` | the resolver wiring test and the fresh-resolver-per-render test |
| **Total** | **+36 tests, +1 file** | | |

The integration suite has no file for this slice, and no integration test references `reportMembershipResolver`.

#### Mutation checks, re-run in Task 8 (Tasks 6–7)

The Task 6 and Task 7 implementers reported 5 mutation checks. Task 8 re-ran all 5 with a scratch script that applied each mutation by exact pattern (refusing to proceed unless every pattern matched exactly once), ran the named test file with Vitest's JSON reporter, wrote the original bytes back and compared them. Every file was restored **byte-identical**, and `git status` was clean afterwards.

| # | Mutation | Files run | Observed in Task 8 |
|---|---|---|---|
| M6.1 | key the memo by `job.id` (`byWorkspace.get(job.id)`, `byWorkspace.set(job.id, lookup)`) | `lib/auth.test.ts` | **killed**, 1/31: "reportMembershipResolver answers every job of one workspace identically, with one user lookup and one query" |
| M6.2 | replace the `catch { console.error(…); return null; }` with `finally {}`, so failures propagate | `lib/auth.test.ts` | **killed**, 1/31: "reportMembershipResolver fails closed to no membership, with a fixed log line, when identity or the query fails" |
| M6.3 | delete `if (!job.workspaceId) return null;` | `lib/auth.test.ts` | **killed**, 1/31: "reportMembershipResolver returns nothing for a job attached to no workspace, without asking who is signed in" |
| M6.4 | revert `page.tsx` to `loadReport(slug, locale)` | the Vitest filter `slug`, which selects `app/[locale]/r/[slug]/page.test.tsx` (2) and `lib/workspace/slug.test.ts` (12) | **killed**, 2/14: "loads the report with the session layer's workspace membership resolver" and "builds a fresh resolver for every render, so no membership outlives its request". The other 12 are `lib/workspace/slug.test.ts`, unrelated, and they passed. |
| M7.1 | delete the Instagram line at the top of `overlaps` (`derive.ts:50`) | `derive.test.ts` | **killed**, 1/22: "compareScanMetrics is insufficient evidence when both have an Instagram sample, one incomplete, and their searches differ" |

Every observation matches what the implementers reported. The first attempt at M6.4 passed a bracketed path filter through a shell, which matched no file (0/0 tests). That run proves nothing and is not counted. It was repeated with the filter `slug`, as recorded above. The RED-first observations of Task 6 (8 failing resolver tests with `reportMembershipResolver is not a function`, then 2 failing page tests with the resolver called 0 times) are the implementer's and were not repeated.

## What Task 8 did not run

- `corepack pnpm e2e` / `e2e:acceptance`: need a production build, which gate 5 cannot produce on this machine. **Not run.** CI runs both.
- `corepack pnpm test:secret-boundary`: inherits gate 5's blocker. **Not run.**
- `corepack pnpm db:verify`: no migration was added. **Not run.**
- A member sign-in on `/r/[slug]` in a browser, against any Auth target. **Not run**: hosted Auth is not chosen, and nothing here was deployed. The member path is proven at the unit layer only.
- Any hosted check, including the successful-pair browser artifact. **Not run.**

---

## P3.5a — spend budgets

Candidate: branch `p35a-spend-budgets` at `90ef323`, 14 commits on top of `main` at `96519fc` (PR #20, merged; `origin/main` still points there), plus the Task 10 documentation commit. Design: [`docs/superpowers/specs/2026-09-25-spend-budgets-design.md`](../../superpowers/specs/2026-09-25-spend-budgets-design.md). Plan: `docs/superpowers/plans/2026-09-25-spend-budgets.md`. Environment: Windows 11, Node `v24.18.0`, pnpm `9.12.0` via corepack, worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p35a-spend-budgets`, Docker Server `29.7.2`.

**Read this first.** Everything below is **locally verified**. **Nothing here is hosted-verified.** Migration `0009` was applied only to disposable Docker Postgres, by `db:verify`, by the integration harness and by the rollout rehearsal. Nothing was deployed or pushed, and no paid provider or model was called. `e2e` and `e2e:acceptance` were **not run** locally. See the P3.5a section of `PHASE-3-REPORT.md` for the decisions, the design as built, the checklist, the rollout statement and the runbook.

### Gate results (Task 10, full verification)

Run one at a time, in this order, from the worktree root, on 2026-09-25, at `90ef323`.

| # | Command | Result |
|---|---|---|
| 0 | `git diff --stat origin/main -- packages neon/migrations/0001_identity.sql neon/migrations/0002_business.sql neon/migrations/0003_workflows.sql neon/migrations/0004_atomic_operations.sql neon/migrations/0005_owner_removal_guard.sql neon/migrations/0006_action_applications.sql neon/migrations/0007_action_verification.sql neon/migrations/0008_workspace_internal.sql app/api/cron/dispatch/route.ts lib/repositories/scheduler.ts` | empty output (0 bytes), as the plan expects |
| 1 | `corepack pnpm typecheck` | **passed**: exit 0. Root `tsc --noEmit`, then `pnpm -r typecheck` across all 4 workspace packages, each reporting `Done`. |
| 2 | `corepack pnpm lint` | **passed**: exit 0, `✖ 30 problems (0 errors, 30 warnings)`, across 18 files, the same counts as the baseline. One of the 18, `app/api/scan/process/route.test.ts`, is touched by this branch (Task 5 appended tests). Its only warning, `945:34 '_input' is defined but never used`, was reproduced by linting the `origin/main` copy of that file: same line, same message. |
| 3 | `corepack pnpm test` (first run) | **failed**: exit 1, 1 failed / 2,964 passed in the app suite. The failure is `app/api/versions/[versionId]/versions.test.ts` > "POST /api/versions/[versionId]/approve > approves this exact version and reports idempotent on a repeat": `Error: Test timed out in 5000ms`, then `AssertionError: expected 503 to be 200`. It is the file's first test, and the file took 10.5 s. No commit on this branch touches `app/api/versions/**` or `lib/workspace/versions.ts`. |
| 3 | `corepack pnpm test` (re-run, once, as the plan allows) | **passed**: exit 0, zero failures, **329 files / 3,552 tests**. Breakdown below. |
| 4 | `corepack pnpm test:integration` | **passed**: exit 0, **33 files / 346 tests**, 232.79s. |
| 5 | `corepack pnpm db:verify` | **passed**: exit 0. JSON below. |
| 6 | `corepack pnpm build` (`next build`, Turbopack, the literal gate command) | **blocked**: exit 1, `Error: Turbopack build failed with 5 errors`. See "The build gate". Not worked around. |
| — | `npx next build --webpack` (diagnostic, **not** the gate) | **passed**: exit 0. See "The build gate". |

After each `test` run, the two tracked snapshot files (`lib/agents/__snapshots__/agents.test.ts.snap`, `lib/pocket-assistant/__snapshots__/demo.test.ts.snap`) showed as modified. `git diff --ignore-cr-at-eol --stat` was empty each time, so the changes were line endings only, and both files were restored with `git restore`. `git status` was clean apart from this task's files before the documentation edits. After the documentation edits, with `apply-0009.sql` and the `.gitattributes` line in the tree, `corepack pnpm test` was run once more: exit 0, 329 files / 3,552 tests, zero failures.

### Baseline, measured rather than taken from the plan

`origin/main` (`96519fc`) was checked out in a scratch worktree under the session scratchpad, with `node_modules` joined by directory junctions to this worktree's, and measured with Vitest's JSON reporter:

- app suite (`vitest run --exclude lib/evidence/safe-media.test.ts --reporter=json`): **273 files / 2,863 tests**, 0 failed;
- integration suite (`vitest run --config vitest.integration.config.ts --reporter=json`): **30 files / 323 tests**, 0 failed;
- `tsx scripts/neon/verify-migrations.ts`: 35 tables, 418 columns, 159 constraints, 87 indexes, 8 triggers, 14 functions, replay empty.

The package suites were not re-measured at `origin/main`: `git diff origin/main -- packages` is empty, and their counts at HEAD equal P3.2c's record. The scratch worktree was removed afterwards.

### Test breakdown (gate 3, re-run)

| Suite | `origin/main` (`96519fc`) | P3.5a (`90ef323`) | Delta |
|---|---|---|---|
| app (`vitest run --exclude lib/evidence/safe-media.test.ts`) | 273 / 2,863 | 278 / 2,965 | +5 / +102 |
| `lib/evidence/safe-media.test.ts` (run alone, by design) | 1 / 62 | 1 / 62 | 0 |
| `packages/region` | 3 / 23 | 3 / 23 | 0 |
| `packages/scoring` | 16 / 183 | 16 / 183 | 0 |
| `packages/contracts` | 3 / 20 | 3 / 20 | 0 |
| `packages/scan-engine` | 28 / 299 | 28 / 299 | 0 |
| **Total** | **324 / 3,450** | **329 / 3,552** | **+5 / +102** |

File by file, from the two JSON reports. Every other file has the same count on both sides.

| File | Before → after | Commit | What was added |
|---|---|---|---|
| `lib/budgets/config.test.ts` | new, 0 → 24 | `8b05abc` | defaults, `off`, valid values, 20 invalid-value cases, the variable list |
| `lib/budgets/scan.test.ts` | new, 0 → 18 | `18a1b14` | `admitScanJob` (10), `claimScanJob` (7), the shared "used" definition (1) |
| `lib/budgets/ai.test.ts` | new, 0 → 10 | `a02994f` | `checkAiBudget` (9), `AiBudgetRefusal` (1) |
| `lib/budgets/messages.test.ts` | new, 0 → 6 | `fa1416e` | English words, one string per locale (3), register separation, pass-through of other failures |
| `components/pocket-assistant/assistant-sheet.test.tsx` | new, 0 → 4 | `2c7328b` | the limit message in three locales, and any other failure still a failed run |
| `lib/assistant/live.test.ts` | 45 → 51 (+6) | `fe08cf8` | the `assistant drafts and the AI budget` block |
| `components/scanning-page.test.tsx` | 9 → 13 (+4) | `fa1416e` | the `at capacity` block (3 locales, and silence when the resume was accepted) |
| `tests/phase6-ui.test.tsx` | 7 → 11 (+4) | `fa1416e` | `rescanFailureMessage budget refusals` (3 locales, and the rate limit still reported as such) |
| `components/workspace/action-detail-client.test.tsx` | 25 → 28 (+3) | `2c7328b` | the AI drafting limit, 3 locales |
| `components/workspace/create-view.test.tsx` | 14 → 17 (+3) | `2c7328b` | the AI drafting limit, 3 locales |
| `lib/scan/execution-store.test.ts` | 2 → 5 (+3) | `7e23dd7` | the `budgeted claim` block |
| `lib/workspace/runs.test.ts` | 32 → 35 (+3) | `a02994f` | the `AI spend budget` block |
| `lib/scan/run.test.ts` | 17 → 19 (+2) | `7e23dd7` | `runScan budget refusal` (2) |
| `lib/workspace/rescan.test.ts` | 11 → 13 (+2) | `4b61855` | the two refusal mappings |
| `app/api/scan/process/route.test.ts` | 27 → 29 (+2) | `7e23dd7` | `scan process budget refusal` (2) |
| `app/api/workspaces/[workspaceId]/rescan/route.test.ts` | 13 → 15 (+2) | `4b61855` | the 503 and 429 mappings |
| `lib/scan/start-job.test.ts` | 23 → 24 (+1) | `4b61855` | the refusal pass-through |
| `app/api/scan/start/route.test.ts` | 26 → 27 (+1) | `4b61855` | the 503 answer |
| `app/api/actions/route.test.ts` | 8 → 9 (+1) | `a02994f` | the `201 { runError }` answer |
| `app/api/actions/[actionId]/run/route.test.ts` | 4 → 5 (+1) | `a02994f` | the 429 answer |
| `app/api/assistant/run/route.test.ts` | 17 → 18 (+1) | `fe08cf8` | the 429 answer |
| `app/api/cron/dispatch/route.test.ts` | 11 → 12 (+1) | `7e23dd7` | the skip-and-retry characterisation |
| **Total** | **+102 tests, +5 files** | | |

`tests/i18n.test.ts` changed (`budget` in `APP_NAMESPACES`) but its test count did not.

### The build gate (gate 6)

`next build` fails on this Windows machine with **`Error: Turbopack build failed with 5 errors`**, exit 1. It is the standing `Module not found: Can't resolve '@radix-ui/react-*'` cascade inside `radix-ui`'s barrel: `@radix-ui/react-dismissable-layer` (3) and `@radix-ui/react-visually-hidden` (2). The import traces run through `components/ui/{tooltip,sidebar,sheet,select}.tsx`, `components/product-ui.tsx`, `components/sign-in-page.tsx`, `components/public-pages.tsx`, `app/[locale]/owner/[workspaceSlug]/layout.tsx`, `app/[locale]/owner/sign-in/page.tsx` and `app/[locale]/trust/page.tsx`. The error count varies between runs, as recorded in every earlier section (33, 37, 72, 32, 45, now 5). Two checks confirm it is unrelated to this slice:

1. **No file this branch changes appears in any import trace**, and `git diff --stat origin/main..HEAD -- package.json pnpm-lock.yaml next.config.ts components/ui` is empty.
2. **The webpack fallback compiles clean.** `npx next build --webpack` → exit 0, `✓ Compiled successfully in 49s`, `Finished TypeScript in 38.8s`, `✓ Generating static pages using 11 workers (29/29)`, and a route manifest that includes `ƒ /[locale]/scanning/[jobId]`, `ƒ /api/scan/process` and `ƒ /api/assistant/run`, three of the routes this slice changes.

Recorded **blocked**, as this repository records it on this machine.

### Migration verification (gate 5)

```json
{
  "applied": ["0001_identity.sql", "0002_business.sql", "0003_workflows.sql", "0004_atomic_operations.sql",
    "0005_owner_removal_guard.sql", "0006_action_applications.sql", "0007_action_verification.sql",
    "0008_workspace_internal.sql", "0009_scan_attempts.sql"],
  "replay": [],
  "tables": 36, "columns": 422, "constraints": 162, "indexes": 92, "triggers": 8, "functions": 14,
  "seededRows": 0, "deferredFunctions": [], "deferredTriggers": []
}
```

Task 2 predicted 36 / 422 / 162 / 92 / 8 / 14, journal 9. Every number matches. Against `origin/main` (35 / 418 / 159 / 87 / 8 / 14): +1 table (`scan_attempts`), +4 columns (`id`, `job_id`, `workspace_id`, `attempted_at`), +3 constraints (the primary key and two foreign keys), +5 indexes (`scan_attempts_pkey`, `scan_attempts_attempted_idx`, `scan_attempts_workspace_idx`, `action_runs_created_idx`, `action_runs_workspace_created_idx`).

### Integration suite detail (gate 4)

+3 files and +23 tests against `origin/main`'s 30 / 323. Per file, measured with the JSON reporter on the six files involved (at HEAD, 6 files / 79 tests, 0 failed):

| File | Before → after | What it covers |
|---|---|---|
| `neon-scan-admission.integration.test.ts` *(new)* | 0 → 6 | the 24-hour window; pending jobs reserved, old ones not; workspace scoping; two requests racing for the last slot (exactly one admitted); a burst of eight at three free slots; refusal with no job, consent or `scan_started` row when the count cannot be read |
| `neon-scan-claim-budget.integration.test.ts` *(new)* | 0 → 9 | one attempt row per claim with the job's workspace; concurrent claims of one job, with and without the lock; no row for an unclaimed job; an admitted first attempt runs over budget; an over-limit retry left unclaimed; pending first attempts counted against a retry; workspace scoping; retries racing for the last slot; invalid configuration |
| `neon-ai-spend.integration.test.ts` *(new)* | 0 → 3 | the two sums in the window; zero rather than nothing; a failed read throws |
| `neon-assistant-live.integration.test.ts` | 34 → 38 (+4) | failed drafts (parse failure, facts needed) as exactly one failed run each that `aiSpend24h` counts; a null model result as `no_model_output` with a null cost; recorded failed-draft spend refusing the next draft before the model |
| `neon-schema.integration.test.ts` | 7 → 8 (+1) | "lets the runtime role log scan attempts, cascading with the job and outliving the workspace" |
| `neon-execution.integration.test.ts` | 15 → 15 | count unchanged; one test changed (below) |

**The two changed tests** (plan, "Where this plan departs from the spec", item 10):

- `neon-execution` "does not reclaim a lease exactly thirty minutes old". Same name, same expectation. It used to freeze `now()` by running the store's single `UPDATE` inside the test's own transaction. The claim now opens a transaction of its own, so the test calls `claimScanJob` on its transaction's client. Passed.
- `neon-assistant-live` "withholds nonempty facts-needed output and performs no artifact persistence" became "withholds nonempty facts-needed output, creates no artifact, and records the failed run with its cost". It used to assert that no `action_runs` row exists; it now expects exactly one `failed` run with its cost, and still no version and no audit event. Passed. It needed the Task 7 fixture fix (a real `app_users` row as the membership's `userId`), because `action_runs.requested_by` is a uuid FK to `app_users`.

### Mutation checks, re-run in Task 10

The implementers of Tasks 1–9 reported the mutation checks the plan names. Task 10 re-ran every one rather than take them on report. A scratch script applied each mutation by exact pattern, refusing to proceed unless every pattern matched exactly once (line-ending aware, because the working copies mix LF and CRLF). It ran the named test file(s) with Vitest's JSON reporter (`--config vitest.integration.config.ts` for integration files), wrote the original bytes back, and compared them. **All 48 runs killed; every file restored byte-identical; `git status` clean afterwards.** Where a mutation fails more tests than the plan names, all are listed.

| # | Mutation | Files run | Observed in Task 10 |
|---|---|---|---|
| T1.1 | `DEFAULT_SCAN_ATTEMPTS_GLOBAL_24H` 200 → 100 | `lib/budgets/config.test.ts` | **killed**, 1/24: "applies the conservative global defaults and leaves per-workspace limits off" |
| T1.2 | `POSITIVE_INTEGER` → `/^[0-9]+$/` | `config.test.ts` | **killed**, 2/24: the two `="0"` scan cases |
| T1.3 | drop `\|\| value <= 0` in the decimal branch | `config.test.ts` | **killed**, 3/24: `BUDGET_AI_USD_GLOBAL_24H="0"` and `="0.00"`, `BUDGET_AI_USD_WORKSPACE_24H="0"` |
| T1.4 | `if (raw === "off" \|\| raw === "") return null;` | `config.test.ts` | **killed**, 3/24: every `=""` case (scan global, scan workspace, AI global) |
| T2.1 | delete `scan_attempts_workspace_idx` from 0009 | `neon-schema` | **killed**, 1/8: "applies all final business objects…", on "all final indexes and predicates" |
| T2.2 | delete `ENABLE ROW LEVEL SECURITY` | `neon-schema` | **killed**, 1/8: the same test, on "business tables and RLS" |
| T2.3 | `workspace_id` `ON DELETE SET NULL` → `CASCADE` | `neon-schema` | **killed**, 2/8: the same test, on "constraints and deletion semantics", and "lets the runtime role log scan attempts, cascading with the job and outliving the workspace" |
| T3.1 | `admitScanJob`: delete the lock statement | `lib/budgets/scan.test.ts` | **killed**, 1/18: "takes the budget lock, then counts with one statement" |
| T3.2 | `admitScanJob`: `>=` → `>` | `scan.test.ts` | **killed**, 2/18: "refuses at the global limit with the fixed log line", "reports the global limit first when both are reached" |
| T3.3 | `admitScanJob`: `catch` sets `used` to zero | `scan.test.ts` | **killed**, 3/18: the three "refuses, with the check_failed line, when …" cases |
| T3.4 | `claimScanJob`: invalid configuration → both limits `null` | `scan.test.ts` | **killed**, 1/18: "refuses every retry, but not a first attempt, when the configuration is invalid" |
| T3.5 | delete the `attempt AS (…)` CTE | `scan.test.ts` | **killed**, 1/18: "one definition of used counts the same attempts and pending jobs at admission and at the claim" |
| T4.1 | `admitScanJob`: delete the lock statement | `neon-scan-admission` | **killed**, 2/6: "admits exactly one of two requests racing for the last slot" (`expected null to be 'scan_global'`), "lets a burst of eight admit exactly the three free slots" (`length of 3 but got 4`) |
| T4.2 | `usedSql`: pending subquery → `0` | `neon-scan-admission` | **killed**, 4/6: "admits under the limit and refuses at it…", "counts pending jobs as reserved attempts…", the race, and the burst (`length of 3 but got 8`) |
| T4.3 | `const scope = "";` (the plan's literal form) | `neon-scan-admission` | **killed**, 5/6, but mostly for a query error: `$1::uuid` is no longer in the SQL, so the count fails and admission refuses (`check_failed`). Failures include "refuses a rescan on its workspace limit…" (`expected 'scan_global' to be 'scan_workspace'`), a `ScanBudgetRefusal: at_capacity` and `current transaction is aborted` |
| T4.3v | `const scope = workspace ? \`${workspace} IS NOT NULL AND \` : "";` (valid-query variant: keeps the parameter, counts every workspace) | `neon-scan-admission` | **killed**, 1/6: exactly "refuses a rescan on its workspace limit, not another workspace's or a public scan" |
| T4.4 | `WINDOW_SQL` `'24 hours'` → `'48 hours'` | `neon-scan-admission` | **killed**, 2/6: "admits under the limit and refuses at it, counting attempts in the last 24 hours only", "counts pending jobs as reserved attempts, but not pending jobs older than the window" |
| T4.5 | `jobs.ts`: delete the `admitScanJob` call | `neon-scan-admission` | **killed**, 6/6: every refusal case |
| T4.6 | `start-job.ts`: delete the `ScanBudgetRefusal` pass-through | `lib/scan/start-job.test.ts` | **killed**, 1/24: "passes a budget refusal through as itself, not as a persistence failure" |
| T5.1 | `claimScanJob`: delete the lock statement | `neon-scan-claim-budget` | **killed**, 1/9: "serializes retries racing for the last slot" (`expected { …(9) } to be null`) |
| T5.2 | `(target_attempts = 0` → `(false` | `neon-scan-claim-budget` | **killed**, 2/9: "still runs an admitted first attempt when the budget is already spent", "claims first attempts but refuses retries when the configuration is invalid" |
| T5.3 | `usedSql`: pending subquery → `0` | `neon-scan-claim-budget` | **killed**, 1/9: "counts pending first attempts against a retry" |
| T5.4 | delete the `attempt AS (…)` CTE | `neon-scan-claim-budget` | **killed**, 4/9: "writes exactly one attempt row per claim…", "concurrent claims of one job write exactly one attempt row…", "still runs an admitted first attempt…", "serializes retries racing for the last slot" |
| T5.5 | claim counts: `usedSql("(SELECT target_workspace_id FROM target)")` → `usedSql(null)` | `neon-scan-claim-budget` | **killed**, 1/9: "applies the workspace limit only to that workspace's retries" (the `quiet` retry, `expected null not to be null`) |
| T5.6 | `execution-store.ts`: delete `options.onBudgetRefused?.(outcome.scope);` | `lib/scan/execution-store.test.ts` | **killed**, 1/5: "tells the host that a retry was refused on budget, and returns no job" |
| T5.7 | `run.ts`: delete the `at_capacity` line | `lib/scan/run.test.ts`, `app/api/scan/process/route.test.ts` | **killed**, 2/48: "reports at_capacity when the store refused the claim on budget, and completes nothing"; the process route's "answers 503 at_capacity when the store refused a retry on budget" |
| T5.8 | cron route: `.then` that logs a non-ok reclaim response | `app/api/cron/dispatch/route.test.ts` | **killed**, 1/12: "treats 503 at_capacity from scan/process as skip-and-retry: nothing logged, the job offered again next tick". The route was restored byte for byte. |
| T6.1 | `runs.ts`: move the budget check after `persistence.start` | `lib/workspace/runs.test.ts` | **killed**, 1/35: "refuses before any run row or model call once the global spend reaches the limit" |
| T6.2 | `aiSpend24h`: delete `FILTER (WHERE workspace_id=$1)` (the plan's literal form) | `neon-ai-spend` | **killed**, 2/3, for a query error: `$1` is unused, so both reads throw `artifact_operation_failed` ("sums recorded cost…", "reads zero, not nothing…") |
| T6.2v | `FILTER (WHERE $1::uuid IS NOT NULL)` (valid-query variant: keeps the parameter, filters nothing) | `neon-ai-spend` | **killed**, 1/3: "sums recorded cost in the last 24 hours, globally and for one workspace", with `{ globalUsd: 8, workspaceUsd: 8 }` against the expected `{ globalUsd: 8, workspaceUsd: 5 }`, the `workspaceUsd: 8` the plan predicts |
| T6.3 | `aiSpend24h`: delete the 24-hour `WHERE` | `neon-ai-spend` | **killed**, 1/3: the same test, with `{ globalUsd: 108, workspaceUsd: 105 }`, the `globalUsd: 108` the plan predicts |
| T6.4 | `checkAiBudget`: `>=` → `>` | `lib/budgets/ai.test.ts` | **killed**, 2/10: "refuses at the global limit with the fixed log line", "reports the global limit first when both are reached" |
| T6.5 | `checkAiBudget`: the spend-read `catch` allows | `ai.test.ts` | **killed**, 3/10: the three "refuses, with the check_failed line, when …" cases |
| T6.6 | run route: delete the `ai_budget_reached` line | `app/api/actions/[actionId]/run/route.test.ts` | **killed**, 1/5: "answers 429 ai_budget_reached before any run row or model call" |
| T7.1 | `draft()`: delete the two budget lines | `lib/assistant/live.test.ts` | **killed**, 1/51: "refuses a draft before the model when the recorded spend reaches the limit" |
| T7.2 | `draft()`: delete the `invalid_output` / `no_model_output` recording | `live.test.ts` | **killed**, 3/51: "records a parse failure as a failed run with its measured cost, then degrades", "records a draft whose model returned nothing as no_model_output with a null cost", "still answers when the failed run cannot be recorded" |
| T7.3 | `draft()`: delete the `facts_needed` recording | `live.test.ts` | **killed**, 1/51: "records a request for missing facts as a failed run too" |
| T7.3i | the same deletion | `neon-assistant-live` | **killed**, 2/38: "withholds nonempty facts-needed output, creates no artifact, and records the failed run with its cost", "records a facts_needed draft as exactly one failed run that aiSpend24h counts" |
| T7.4 | `recordFailedDraft`: remove the `try`/`catch` | `live.test.ts` | **killed**, 1/51: "still answers when the failed run cannot be recorded" |
| T7.5 | assistant route: delete the `AiBudgetRefusal` line | `app/api/assistant/run/route.test.ts` | **killed**, 1/18: "answers 429 ai_budget_reached when the live draft was refused, and records no run event" |
| T8.1 | delete the zh-TW `aiLimit` entry | `tests/i18n.test.ts`, `lib/budgets/messages.test.ts` | **killed**, 3/14: "share one key set across en, zh-HK and zh-TW", "maps each refusal to its own zh-TW string", "keeps zh-HK and zh-TW in their own registers" |
| T8.2 | `scanStartRefusal`: `error === "at_capacity"` → `error !== undefined` | `messages.test.ts` | **killed**, 1/6: "leaves every other failure to its existing message" |
| T8.3 | scanning page: delete `if (body?.error === "at_capacity") setAtCapacity(true)` | `components/scanning-page.test.tsx` | **killed**, 3/13: "says in en / zh-HK / zh-TW that a refused resume is saved and can be resumed later" |
| T8.4 | `rescanFailureMessage`: the `429` line moved above the workspace-budget line | `tests/phase6-ui.test.tsx` | **killed**, 3/11: "names the workspace limit and global capacity separately in en / zh-HK / zh-TW" |
| T9.1 | action detail: delete `else if (budgetRefusal) toast.error(budgetRefusal)` | `components/workspace/action-detail-client.test.tsx` | **killed**, 3/28: "says in en / zh-HK / zh-TW that today's drafting limit was reached" |
| T9.2 | Create: `runError === "ai_budget_reached"` → `"ai_budget"` | `components/workspace/create-view.test.tsx` | **killed**, 3/17: "says in en / zh-HK / zh-TW that the action exists but today's drafting limit was reached" |
| T9.3 | assistant sheet: delete the `if (refused) { … }` block | `components/pocket-assistant/assistant-sheet.test.tsx` | **killed**, 3/4: "shows the en / zh-HK / zh-TW limit message instead of a generic failure" |
| T9.4 | zh-HK `aiLimit` set to the zh-TW text | `messages.test.ts` | **killed**, 1/6: "keeps zh-HK and zh-TW in their own registers" |

Every observation matches the plan's named test. The two differences are T4.3 and T6.2, whose literal forms fail on a query error before reaching the behaviour they target. Their valid-query variants, T4.3v and T6.2v, fail exactly the named test on its assertion.

### Rollout rehearsal of `apply-0009.sql`

The statement was generated from the files on disk by a scratch script. It uses `loadMigrations()`, asserts the runner's lock key, refuses if the dollar tags occur in 0009, and self-checks that the embedded text hashes to the recorded checksum. After generation, every checksum was re-derived from the file bytes and found exactly once in the journal check, and the embedded 0009 text was confirmed byte-identical to `neon/migrations/0009_scan_attempts.sql`:

| Ordinal | File | sha256 |
|---|---|---|
| 1 | `0001_identity.sql` | `f2e65e08e94c6514735db9a7eb6b0dcc5ec522732e2fb3e573b02b62aedb60fa` |
| 2 | `0002_business.sql` | `34c46b53bc08e12d7c76d365c177877890ebadec27fbf4d7836e253d901021a1` |
| 3 | `0003_workflows.sql` | `b8f80980ab7758ae068bcab9dfea4ae0fcc6cc78b2ed49b6410c92b103a12ab1` |
| 4 | `0004_atomic_operations.sql` | `b24f2cbba79881d1f97118e05a5d7990a847fdaed6ecd5461682f404af076069` |
| 5 | `0005_owner_removal_guard.sql` | `c4349d2ba9a24a595b37ed547574e8231ee5ff0eb717ef8ffa5fad1fa093c26b` |
| 6 | `0006_action_applications.sql` | `ea0f7471c0b469a5e99b884557224b542b920a0aadc7f1f49223697334a4be47` |
| 7 | `0007_action_verification.sql` | `e9f8132aa98021c7f2861b9e3fdc2e0f3847445b91ee955683ce696770f43d11` |
| 8 | `0008_workspace_internal.sql` | `f9f03d6c1d70231871e2e683c9318c98f55afbd0fd125a43e712d328f019d678` |
| 9 | `0009_scan_attempts.sql` | `3c35ab9965be1d4821e885a2e43676c743e62f25435e4d59bd46d2c34a3d1768` |

The rehearsal ran on a disposable `postgres:16` container (server `16.15`), named `p35a-rehearsal-0009` and labelled `com.sme-scanner.rehearsal=0009`. It ran twice with identical results, the second time after the work was interrupted and resumed. Setup: `neondb_owner` LOGIN CREATEROLE owning `neondb`; `neondb_owner` created `smeassistant_migrator` NOLOGIN and `sme_app_runtime` NOLOGIN, and granted the migrator CREATE on the database and on schema `public`. 0001–0008 were applied as the migrator (a superuser session started with `-c role=smeassistant_migrator`, because the role cannot log in) through `applyMigrations(pool, migrations.slice(0, 8))`. The file was sent as one query from a `neondb_owner` connection. "Unchanged" compares a snapshot of every journal row and every relation (name, kind, owner) in `public` and `neon_migrations`, before and after.

| # | Check | Result |
|---|---|---|
| 5 | before the grant | `42501 permission denied to set role "smeassistant_migrator"`; 8 journal rows; `to_regclass('public.scan_attempts')` null; unchanged |
| — | `GRANT smeassistant_migrator TO neondb_owner WITH SET TRUE`, as `neondb_owner` | succeeded; `pg_auth_members` shows `set_option = true`, grantor `neondb_owner` |
| 1 | first run | success; the two notices; journal rows 1–9, row 9 `0009_scan_attempts.sql 3c35ab99…1768` |
| 2 | `applyMigrations(pool, all nine)` | `[]` |
| 3 | ownership and access | six relations (`scan_attempts`, `scan_attempts_pkey`, `scan_attempts_attempted_idx`, `scan_attempts_workspace_idx`, `action_runs_created_idx`, `action_runs_workspace_created_idx`) owned by `smeassistant_migrator`; `relrowsecurity` true; policy `server_application`; `has_table_privilege('sme_app_runtime', …)` SELECT true, INSERT true; under `SET LOCAL ROLE sme_app_runtime`, a workspace, a job and one attempt row inserted and read back (`current_user` `sme_app_runtime`, 1 row), then rolled back |
| 4 | second run | `P0001 apply-0009 refused: neon_migrations.journal is not exactly 0001-0008 with the expected checksums (it has 9 rows)`; 9 journal rows; unchanged |

Afterwards `docker ps -a --filter name=p35a` listed nothing. No other container was touched.

### What this did not run

- `corepack pnpm e2e` / `e2e:acceptance`: need a production build, which gate 6 cannot produce on this machine. **Not run.** CI runs both.
- `corepack pnpm test:secret-boundary`: shells out to `next build` and inherits gate 6's blocker. **Not run.**
- `apply-0009.sql` against any Neon branch, `neon:readiness` against any hosted target, and any deployed request. **Not run**: no hosted action is authorized by this task.
- A test for the `social_post`-without-asset refusal under a spent AI budget. **Not written**; recorded in the report's "does NOT prove".

### After the whole-branch review (`5971d55`, `b600e77`, `838888e`, `a10a7d8`)

A final review of the whole branch found one Critical and seven Minor findings. `PHASE-3-REPORT.md` ("Whole-branch review and its fixes") covers them and the four accepted residuals (M2, M5, M6, M7). **Correction to the section above:** at `90ef323` the global scan limit was not a hard bound, because the claim exempted every first attempt, however old its reservation (C1). It is a bound from `5971d55`. Each fix below was test-first: RED seen for the stated reason, GREEN after the fix, then the fix reverted to confirm the new test fails, and restored.

| Commit | Finding | Tests added or changed | RED | Mutation (fix reverted) |
|---|---|---|---|---|
| `5971d55` | C1: an expired reservation claimed unchecked | `neon-scan-claim-budget` +2: "meters a first attempt whose reservation has expired, like a retry", "claims an expired first attempt while the budget has room". The `job()` helper gained a `createdAge` option. `lib/budgets/scan.test.ts` +1: "exempts a first attempt at the claim only while its reservation is counted as pending". | the 25-hour-old job was claimed: `expected { business_name: 'Fixture', … } to be null` | `((target_attempts = 0 AND target_created_at > …)` → `(target_attempts = 0`: **killed**, 1/11, the expired-job test |
| `b600e77` | M1: reclaim order | `neon-cron-dispatch` +1: "offers first attempts before retries, oldest first, so refused retries cannot fill the batch" | the queued first attempt was not among the 20 returned (heap order) | delete `ORDER BY attempt_count, created_at, id`: **killed**, 1/6, on each of 3 consecutive runs |
| `838888e` | M3: raw reason codes; assistant drafts in "Task runs failed" | `action-detail-client.test.tsx` +3: "labels every reason code in en / zh-HK / zh-TW and leaves other errors as they are". `neon-value-report` +1: "leaves assistant drafts, failed or succeeded, out of the task-run counts" (rolled back). `tests/i18n.test.ts`: `draftFailure` added to `APP_NAMESPACES`, count unchanged. | the three labels missing in every locale; the report read `{ runs: 4, failed: 2 }` | component: both `runErrorLabel` calls removed → **killed**, 3/3. Report: `TASK_RUN` removed from `failed` only → **killed** (`failed: 2`); from `runs` only → **killed** (`runs: 4`) |
| `a10a7d8` | M4: the unmetered claim method | `tests/scan-claim-single-path.test.ts` (new, 4): the guard, the wrapper's own location, and self-tests of what does and does not match | n/a: a guard over the current tree, which passes | planted `repo.claimAuditJob("x")` in `lib/scan/claimable.ts` → **killed**; planted `"SELECT * FROM public.claim_audit_job($1)"` → **killed**; each removed |

After each `corepack pnpm test` the two tracked snapshot files again showed as modified with an empty `git diff --ignore-cr-at-eol --stat`, and were restored with `git restore`. They are in no commit.

| Gate, at `a10a7d8` | Result | vs `90ef323` |
|---|---|---|
| `corepack pnpm typecheck` | exit 0 | — |
| `corepack pnpm lint` | exit 0, 30 warnings / 0 errors | unchanged |
| `corepack pnpm test` | exit 0, **330 files / 3,560 tests** (app 279 / 2,973; safe-media 1 / 62; region 3 / 23; scoring 16 / 183; contracts 3 / 20; scan-engine 28 / 299) | +1 file / +8 tests: the new guard file (4), `action-detail-client.test.tsx` (3), `scan.test.ts` (1) |
| `corepack pnpm test:integration` | exit 0, **33 files / 350 tests**, 226.29s | +0 files / +4 tests: `neon-scan-claim-budget` 9 → 11, `neon-cron-dispatch` 5 → 6, `neon-value-report` 12 → 13 |

## P3.5b — failure and retry view

Candidate: branch `p35b-failure-view`, 15 commits on `main` at `8aad9a9` (stacked on `p35a-spend-budgets`, PR #21, not yet merged), plus this Task 13 documentation commit. Design: [`docs/superpowers/specs/2026-09-25-failure-retry-view-design.md`](../../superpowers/specs/2026-09-25-failure-retry-view-design.md). Plan: `docs/superpowers/plans/2026-09-25-failure-retry-view.md`. Environment: Windows 11, Node `v24.18.0`, pnpm `9.12.0` via corepack, worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p35b-failure-view`, Docker Server `29.7.2`. Run on 2026-09-26.

**Read this first.** Everything below is **locally verified**. **Nothing here is hosted-verified.** No migration exists in this branch. Nothing was deployed or pushed, and no paid provider or model was called. See the P3.5b section of `PHASE-3-REPORT.md` for the decisions, the deviations, the review-driven changes, the consent boundary, the owner actions and the known limits.

### Gate results (Task 13, full verification), run sequentially

| # | Command | Result |
|---|---|---|
| 1 | `corepack pnpm typecheck` | **passed**: exit 0. Root `tsc --noEmit`, then `pnpm -r typecheck` across `packages/{region,scoring,contracts,scan-engine}`, each `Done`. |
| 2 | `corepack pnpm lint` | **passed**: exit 0, `✖ 30 problems (0 errors, 30 warnings)`, across 18 files — identical counts and files to P3.5a's `a10a7d8` record. No file this branch touches carries a warning. |
| 3 | `corepack pnpm test` | **passed on the first run**: exit 0, zero failures, **340 files / 3,627 tests**. App suite `vitest run --exclude lib/evidence/safe-media.test.ts`: 289 files / 3,040 tests. `lib/evidence/safe-media.test.ts` run alone: 1 / 62. Packages: `region` 3 / 23, `scoring` 16 / 183, `contracts` 3 / 20, `scan-engine` 28 / 299. The known-intermittent `app/api/versions/[versionId]/versions.test.ts` did **not** fail this run; no re-run of that file alone was needed. |
| 4 | `NEON_INTEGRATION=1 corepack pnpm test:integration` | **passed**: exit 0, **36 files / 374 tests**, 244.70s. |
| 5 | `corepack pnpm db:verify` | **passed**: exit 0. JSON below — unchanged from P3.5a's `a10a7d8` record, because this branch adds no migration. |
| 6 | `corepack pnpm build` (`next build`, Turbopack, the literal gate command) | **blocked**: exit 1, `Error: Turbopack build failed with 5 errors`, the same standing `radix-ui` cascade recorded at every prior phase (`@radix-ui/react-dismissable-layer` ×3, `@radix-ui/react-visually-hidden` ×2), traced through `components/ui/{tooltip,sidebar}.tsx` → `components/product-ui.tsx` → `app/[locale]/owner/[workspaceSlug]/layout.tsx`. No file this branch changes appears in the import trace. |
| — | `corepack pnpm exec next build --webpack` (diagnostic, **not** the gate) | **passed**: exit 0, `✓ Compiled successfully`, `Finished TypeScript`. The route manifest includes `ƒ /[locale]/ops/failures` and `ƒ /api/ops/failures/scans/[jobId]/release`, two of the routes this slice adds. |

After the gate-3 run, the two tracked snapshot files (`lib/agents/__snapshots__/agents.test.ts.snap`, `lib/pocket-assistant/__snapshots__/demo.test.ts.snap`) showed as modified. `git diff --ignore-cr-at-eol --stat` was empty, confirming line-ending-only changes, and both were restored with `git checkout --`. `git status --short` was clean before and after, apart from this task's own documentation edits.

### Migration verification (gate 5)

```json
{
  "applied": ["0001_identity.sql", "0002_business.sql", "0003_workflows.sql", "0004_atomic_operations.sql",
    "0005_owner_removal_guard.sql", "0006_action_applications.sql", "0007_action_verification.sql",
    "0008_workspace_internal.sql", "0009_scan_attempts.sql"],
  "replay": [],
  "tables": 36, "columns": 422, "constraints": 162, "indexes": 92, "triggers": 8, "functions": 14,
  "seededRows": 0, "deferredFunctions": [], "deferredTriggers": []
}
```

Identical to P3.5a's record. This branch's file map (`docs/superpowers/plans/2026-09-25-failure-retry-view.md` lines 38-62) touches no file under `neon/migrations/` or `lib/db/schema/`, and the spec's §6 says so explicitly ("No migration. If implementation finds one is needed, stop and ask before adding it.") — no such stop occurred.

### Integration suite detail (gate 4)

Per file, from the full run (36 files / 374 tests):

| File | Tests | What it covers |
|---|---|---|
| `neon-dead-letter-condition.integration.test.ts` *(new, Task 1)* | 1 | every stale in-flight job is in exactly one of claimable and dead-lettered |
| `neon-dead-letter.integration.test.ts` *(new, Task 5)* | 11 | `closeExhausted` (24h grace, not at 23h, exactly one `scan_completed` + `scan.auto_closed`, never a claimable job, batch limit); `release` (grants one attempt, refuses when not dead-lettered, exactly one of two concurrent releases wins, makes the job claimable through the budgeted claim which logs one attempt, the grace window restarts from a released job's new attempt rather than its original stall, a release inside the grace window stops the auto-close) |
| `neon-failures.integration.test.ts` *(new, Tasks 3, 11)* | 13 | every source's rules (below) plus filtering, personal-field allowlist, health summary and the scoped-manager case |

Files this branch modified rather than created were not independently re-measured against a pre-branch baseline; the full-suite counts above are the record.

### Claims table — spec behaviour → named test → mutation check

Every test name below was found by `grep -n "it(" <file>` and quoted verbatim (occasional light punctuation collapsing aside). "Mutation check" reports what was done and observed; where the plan's Step number is named, that is where the check is written in the plan.

| Behaviour | Test file / test name | Mutation check |
|---|---|---|
| Dead-lettered = the exact complement of claimable (Task 1) | `lib/scan/claimable.test.ts` — "keeps the claimable condition byte-identical to the lease contract", "states dead-lettered as in flight, three or more attempts, and stale"; `test/integration/neon-dead-letter-condition.integration.test.ts` — "puts every stale in-flight job in exactly one of claimable and dead-lettered, and nothing else in dead-lettered" | `attempt_count>=3` → `attempt_count>=2` in `DEAD_LETTERED_JOB_CONDITION_SQL`: both the unit pin and the integration guard fail |
| `scan_failed`: category + correlation id, 30-day window | `test/integration/neon-failures.integration.test.ts` — "lists failed scans within 30 days, with the category and correlation id" | swapping `j.failure_correlation_id::text AS correlation_id` for `j.failure_category AS correlation_id` fails this test (Task 3 Step 5.3) |
| `scan_dead_lettered`: listed with the release action, claimable jobs excluded | `neon-failures.integration.test.ts` — "lists dead-lettered scans with the release action, and not claimable ones" | covered by the shared dead-letter condition mutation above |
| `draft_failed`: one item per action, newest reason, assistant drafts excluded, drops after a later success | `neon-failures.integration.test.ts` — "lists one failed draft per action with its audit reason, drops it after a later success, and ignores assistant drafts", "falls back to action_run_failed when a failed run has no audit reason" | removing `AND coalesce(r.input->>'source', '') <> 'assistant'` fails the ignores-assistant-drafts assertion (Task 3 Step 5.1) |
| **Fix: a later successful assistant run does not count as recovery** | `neon-failures.integration.test.ts` — "keeps a failed draft failed when only a later assistant run recovers it" | this test was RED (the item disappeared) before the `NOT EXISTS` recovery check excluded assistant-sourced successes, GREEN after |
| **Fix: search runs after `DISTINCT ON`, so an older superseded row can't surface** | `neon-failures.integration.test.ts` — "does not let a search on an older, superseded draft failure bypass the newest-wins rule", "does not let a search on an older, superseded Google connection bypass the newest-wins rule" | both were RED when the id filter sat inside the `DISTINCT ON` subquery (a stale row could survive as its group's only remaining row and match); GREEN once the filter moved to the outer query |
| `google_connection`: only `expired`/`error`, only the newest row, only without an active connection | `neon-failures.integration.test.ts` — "lists a broken Google connection only when it is the newest non-active row and no active one exists" | removing the outer `WHERE g.reason IN ('expired','error')` fails this test (Task 3 Step 5.2) |
| `workspace_processing`: retry state, `attempts >= 3` | `neon-failures.integration.test.ts` — "lists post-processing stuck in retry after three attempts" | covered by the source's own `WHERE c.state='retry' AND c.attempts>=3` clause |
| Filtering: workspace, kind, reference prefix, full id or correlation id | `neon-failures.integration.test.ts` — "filters by workspace, by kind, by reference prefix and by full id or correlation id" | — |
| Privacy: no personal fields in operator output | `neon-failures.integration.test.ts` — "never returns personal fields" | adding `r.error AS business_name` to `draft_failed` instead of `w.business_name` fails this test (Task 3 Step 5.4) |
| Operator health: 24h/7d counts, categories | `neon-failures.integration.test.ts` — "summarizes health: recent counts, open counts and failed scans by category" | — |
| Owner-action matrix: role × tier × scope, including the null-location rule | `lib/ops/owner-actions.test.ts` — "hides post-processing from everyone and other locations from a scoped manager", "keeps workspace-wide items on every location page, and everything on 'all'", "builds problems with the contact link only for contact_support"; `describe("ownerActionFor", …)` block for the tier/role matrix itself | collapsing `return ctx.tier === "paid" && item.locationId ? "rescan" : "contact_support";` to `return "rescan";` fails the lite-tier and no-location cases (Task 4 Step 10) |
| Owner-action matrix, scoped manager, through the real reader (Task 11) | `test/integration/neon-failures.integration.test.ts` — "never shows a scoped manager another location's problems, through the real reader" | `visibleTo`'s `return inScope(ctx, item.locationId);` → `return true;`: **RED reproduced this session** — `problems` gained the other location's `scan_failed` item, `expected […2 items] to equal […1 item]`; reverted and reconfirmed GREEN, 13/13 |
| Problem copy: every reason code labeled in every locale, generic fallback, dead-letter next-step wording | `lib/ops/problem-copy.test.ts` — "labels every known reason code in every locale, never echoing the code", "falls back to the generic line for an unknown or unsafe code", "titles each owner-visible kind", "uses the dead-letter line for a stuck scan whatever the action" | — |
| Reference formatting | `lib/ops/references.test.ts` — "formats run and connection references like the scan reference", "returns null for an empty or missing query", "maps a reference to its kinds and a lower-case hex prefix", "matches a full id across every kind", "rejects anything else" | — |
| Auto-close: 24h grace, not at 23h, never a claimable job, batch limit | `test/integration/neon-dead-letter.integration.test.ts` — "closes a scan stuck for over 24 hours as ATTEMPTS_EXHAUSTED, but not one at 23 hours", "never closes a claimable job, and respects the batch limit" | `interval '24 hours'` → `'22 hours'` in `AUTO_CLOSE_GRACE_SQL` fails the 23-hour case (Task 5 Step 6.1) |
| Auto-close writes exactly one `scan_completed` (failed, coverage 0) + one `scan.auto_closed`, even with no `scan_started` session | `neon-dead-letter.integration.test.ts` — "writes exactly one scan_completed under the scan's own session and one scan.auto_closed", "still records scan_completed when the scan has no scan_started session" | removing the `writeScanEventSafely` call fails "writes exactly one scan_completed…" (Task 5 Step 6.4) |
| Release: exactly one more attempt, refuses when not dead-lettered, exactly one of two concurrent releases wins | `neon-dead-letter.integration.test.ts` — "grants exactly one more attempt on the same job and records who released it", "refuses a job that is not dead-lettered", "lets exactly one of two concurrent releases win" | removing `AND ${DEAD_LETTERED_JOB_CONDITION_SQL}` from the release CTE fails "refuses a job that is not dead-lettered" (Step 6.2); setting the release to `attempt_count=3` instead of `2` fails "grants exactly one more attempt…" and "makes the job claimable once…" (Step 6.3) |
| Release makes the job claimable exactly once, through the budgeted claim, which logs one `scan_attempts` row | `neon-dead-letter.integration.test.ts` — "makes the job claimable once, through the budgeted claim, which logs one attempt" | — |
| Grace window: restart after release; a release inside the window stops the auto-close | `neon-dead-letter.integration.test.ts` — "stops the auto-close from closing a job released inside the grace window", "restarts the grace window from a released job's new attempt, rather than its original stall" | — |
| Cron isolation: the auto-close step is bounded, isolated, and reported in the summary | `app/api/cron/dispatch/route.test.ts` — "closes exhausted scans in batches of 20 and reports how many", "keeps the other steps running when the auto-close step fails" | — |
| Cron treats a budget-refused retry as skip-and-retry, unrelated to this branch's own change but re-verified | `app/api/cron/dispatch/route.test.ts` — "treats 503 at_capacity from scan/process as skip-and-retry: nothing logged, the job offered again next tick" | — |
| Release route codes: 404 non-operator, 404 bad id, 409 not-dead-lettered, 200 with dispatch attempted, 503 on failure | `app/api/ops/failures/scans/[jobId]/release/route.test.ts` — "answers 404 to a non-operator before touching the job", "answers 404 for an id that is not a uuid", "answers 409 not_dead_lettered when the guarded update matched nothing", "releases as the operator, dispatches, and says whether dispatch was attempted", "answers 503 without detail when the release itself fails" | — |
| Status route: `deadLettered` true/false | `app/api/scan/status/route.test.ts` — "reports a dead-lettered job", "reports deadLettered false otherwise" | — |
| Scanning page: stops polling for a dead-lettered scan, no Resume, shows the stuck card and a new-scan link | `components/scanning-page.test.tsx` — "shows the stuck card with a new-scan link, no Resume button, and stops polling" (describe block "ScanningPage dead-lettered state"); `components/scan-stuck-card.test.tsx` — "explains the stuck scan, gives the reference, and links to a new scan instead of Resume", "is localized" | **Fix mutation, Task 8:** removing the early `deadLettered` return from the polling loop made "shows the stuck card…" fail before the fix was written — it kept polling and offered Resume; fixed, then GREEN |
| Operator failures page: gated, shows health/row/reason/release, filter and search, explicit error (never an empty queue) | `app/[locale]/ops/failures/page.test.tsx` — "is operator-only", "shows health, the row, its reason meaning and the release control", "passes the kind filter and a parsed reference search to the reader", "explains an invalid search instead of querying", "shows an explicit error, never an empty queue, when the reader fails" | — |
| Owner loader degrades to `null` and logs on failure, never a false empty state | `lib/workspace/problems.test.ts` — "reads only owner kinds for this workspace and resolves actions", "returns null and logs, never an empty list, when the read fails" | — |
| Owner surfaces: Home card hidden with none, right button per role, no raw reason code | `components/workspace/problems.test.tsx` — "renders nothing without problems", "shows at most two problems and links to Activity", "renders the rescan control for rescan", "links to the action for open_action", "links to Google re-authorisation for reauthorise", "links to the contact channel for contact_support, and shows text only without one", "shows no button for none, and always shows the reference", "never shows a raw unknown reason code", "says there are no open problems only when it was given an empty list" | — |
| **Fix: Home renders the card after its `<h1>`, and its two reads run in parallel** | `components/workspace/home-brief.test.tsx` — "renders the problems slot after the page's `<h1>`, never before it", "renders nothing extra when problems is omitted" | source review: `app/[locale]/owner/[workspaceSlug]/page.tsx` awaits `getHomeBrief` and `loadWorkspaceProblems` inside one `Promise.all([...])`, confirmed by reading the file |
| Scanning page's `deadLettered` flag: terminal truth outranks it, absence keeps today's states | `tests/funnel-scan.test.ts` — "shows the dead-letter state for a stuck in-flight scan, over stalled", "lets a terminal status win over a stale dead-letter flag", "keeps today's states when the flag is absent" | — |
| No raw error code in the action-detail fallback toast (Task 12) | `components/workspace/action-detail-client.test.tsx` — describe "the fallback failure toast", `it.each` "in %s shows a friendly message with no raw error code" (en, zh-HK); asserts `JSON.stringify(...).not.toContain("weird_internal_code")` | reverting the fix (letting the raw `error` string reach the toast) reproduces the bug this test was written against; the test's own assertion is the guard |

### Not run

- **`corepack pnpm e2e` / `e2e:acceptance`**: need a production build, which gate 6 cannot produce on this machine. CI runs both.
- **Hosted verification of any kind**: no `neon:readiness`, no deployed request, no production Neon query. This branch has no migration to apply, but nothing else was checked hosted either — not authorized in this task.
- **Native review of the zh-HK/zh-TW copy** added in the `problems` namespace. It follows the repository's register rules (香港書面中文 / 台灣用語) by construction, as P3.5a's Chinese copy did, but has not been read by a native speaker.
- **`corepack pnpm test:secret-boundary`**: shells out to `next build` and inherits gate 6's Turbopack blocker on this machine, the same as every prior phase.
