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
- Any end-to-end exercise of `source='verified'`. No verifier exists; the seam has insert-path and precedence unit coverage only. **Not run, because there is nothing to run.**
