# Phase 4 test results

Gate-by-gate record for Phase 4. Each slice has its own section. Only P4.4 exists so far.

## P4.4 — reusable workflow contract

Candidate: branch `p4-growth-platform`, HEAD `a5a2211` (14 commits `dc457ec`..`a5a2211` on top of base `c042b20` = `origin/main`, PR #26). Spec: [`docs/superpowers/specs/2026-09-30-workflow-contract-design.md`](../../superpowers/specs/2026-09-30-workflow-contract-design.md). Plan: `docs/superpowers/plans/2026-09-30-workflow-contract.md`. Environment: Windows 11 Pro 10.0.26200, Node `v24.18.0`, pnpm `9.12.0` via corepack, Docker Server `29.7.2`. Run on 2026-10-01, every heavy gate sequentially.

**Read this first.** Everything below is **locally verified**. **Nothing here is hosted-verified.** No migration exists in this slice (journal still 0001–0010), nothing was applied to any hosted database, nothing was deployed or pushed, and no paid provider was called: the fake LLM is injected in every test, and the evaluation script was never run live (see "Evaluation script"). See `PHASE-4-REPORT.md` for what changed, the rulings, the known limits and the open questions.

### Gate results (Task 8, full verification)

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `corepack pnpm typecheck` | 0 | **passed**. Root `tsc --noEmit`, then `packages/{region,scoring,contracts,scan-engine}` each `Done`. |
| 2 | `corepack pnpm lint` | 0 | **passed**: `✖ 30 problems (0 errors, 30 warnings)` across 18 files. This is the same 30 warnings and the same file set as the P3.5c record; no file this branch touches carries a warning. |
| 3 | `corepack pnpm test` | 0 | **passed on the first run, no timeouts**: app 315 files / 3,498 tests, `lib/evidence/safe-media.test.ts` 1 / 62, packages `region` 3 / 23, `scoring` 16 / 183, `contracts` 3 / 20, `scan-engine` 28 / 299. **Total 366 files / 4,085 tests, zero failures.** Delta against the P3.5c record in the table below. |
| 4a | `corepack pnpm build` (`next build`, Turbopack, the literal gate) | 1 | **blocked**, by the standing local `radix-ui` cascade recorded at every prior phase: `Module not found: Can't resolve '@radix-ui/react-visually-hidden'` and `'@radix-ui/react-dismissable-layer'`, raised from inside `node_modules/.pnpm/@radix-ui+react-tooltip@…/dist/index.mjs`, traced through `components/ui/tooltip.tsx` → `components/ui/sidebar.tsx` → `components/product-ui.tsx` → `components/public-pages.tsx` → `app/[locale]/trust/page.tsx`. No file this branch changes appears in the trace. P1's CI run established this is Windows-only (`ubuntu-latest` builds with Turbopack). |
| 4b | `npx next build --webpack` (the recorded fallback; **not** the literal gate) | 0 | **passed**: `✓ Compiled successfully in 40s`, the TypeScript route-type check ran, and the full route manifest printed. This build contains the four production imports Task 7 repointed to package source subpaths (`lib/report/sanitize-proof.ts`, `lib/evidence/load-authorized.ts`, `lib/workspace/evidence-inputs.ts`, `lib/workspace/templates.ts`). |
| 5a | `corepack pnpm test:secret-boundary` (literal gate) | 1 | **blocked**: the script shells out to `next build` (Turbopack), so it inherits blocker 4a. The failure is the `execFileSync` of that build, before any artifact scan. |
| 5b | The same script, run as a **diagnostic copy** with `next build --webpack` and the repo root passed as `process.cwd()` (copy kept outside the repo; the committed script is unchanged) | 0 | **passed**: `Secret boundary passed across 139 public artifacts.` All 14 sentinel secrets and their env-var names were absent from every client chunk and rendered artifact, with the four Task 7 import changes in the bundle. This is evidence about this branch's bundle, **not** a pass of the literal gate. |
| 6 | `corepack pnpm test:no-supabase` | 0 | **passed**: "No forbidden retired transport references; only the approved pinned Neon transitive library is permitted". |
| 7 | `corepack pnpm test:no-self-service-claim` | 0 | **passed**: "OWNER_SELF_SERVICE_CLAIM is not enabled." |
| 8 | `corepack pnpm db:verify` | 0 | **passed**: `0001`–`0010` applied, replay `[]`, 37 tables / 444 columns / 172 constraints / 95 indexes / 8 triggers / 14 functions, `seededRows` 0. Identical to the P3.5c record, as required for a slice with no migration. |
| 9 | `NEON_INTEGRATION=1 corepack pnpm test:integration` | 0 | **passed on the first run, no flakes: 39 files / 399 tests.** This was the first execution of the fixtures Tasks 3 and 4 edited (`neon-artifact-runtime.integration.test.ts`, `neon-assistant-live.integration.test.ts`); both passed unchanged. |
| 10a | `corepack pnpm e2e` (literal gate) | 1 | **blocked**: the Playwright global setup starts `next dev` (Turbopack) and polls `/en/owner/sign-in`; the page returns 500 with the same `radix-ui` `Module not found` (`components/sign-in-page.tsx` → `components/product-ui.tsx` → `components/ui/sidebar.tsx` → `components/ui/tooltip.tsx`), so the readiness check throws `Acceptance service not healthy: http://localhost:3100`. No spec ran. |
| 10b | `corepack pnpm e2e`, with `--webpack` added to the `next dev` spawn in `test/e2e/environment.ts` **temporarily** (a one-word local edit, reverted with `git checkout`, never committed) | 1 | **30 passed, 1 failed (31)**. The failure is `e2e/owner-shell.spec.ts:16` "`/zh-HK/owner/sign-in?error=invalid_code` explains the failed link": `getByRole('alert')` resolves to **two** elements in strict mode, the page's own `<p role="alert">登入連結已過期或已被使用。</p>` **and** Next's `<div role="alert" id="__next-route-announcer__">`. It failed identically on two further isolated runs. Not caused by this branch: `git diff c042b20 --stat -- e2e components/sign-in-page.tsx "app/[locale]/owner/sign-in" proxy.ts` is empty, so the spec, the page and the proxy are byte-identical to the base. Reported, not fixed, not weakened. See "e2e detail". |
| 10c | `corepack pnpm e2e:acceptance`, same temporary `--webpack` dev-server edit (reverted) | 0 | **passed: 38 / 38** (9.5 min). This config is the only consumer of `test/e2e/seed.ts`, so this was the first execution of the done `audit_jobs` row and the backdated `scan_snapshots` row Task 3 added; it includes `merchant-loop.spec.ts` (approval, export and usage against the fixture LLM server) and `permissions.spec.ts`. The brief lists `e2e`, not `e2e:acceptance`; this run is additional evidence, not a substitute for gate 10a. |
| 11 | `corepack pnpm eval:workflows -- --budget-usd 1` | **2** | **refused, as designed**: `eval:workflows refused: not_enabled`. `EVAL_LIVE` was not set, no key was supplied. |
| 12 | `corepack pnpm eval:workflows -- --check-load` | 0 | **passed**: `load ok: 23 cases`. The live pipeline module graph loads under `tsx` without a key and without a network call. |

After gates 3 and 10, `lib/agents/__snapshots__/agents.test.ts.snap` and `lib/pocket-assistant/__snapshots__/demo.test.ts.snap` showed as modified (vitest rewrites their line endings in this CRLF working copy). `git diff --ignore-cr-at-eol --stat` was empty both times and both were restored with `git checkout --`. `git status --short` was clean before the documentation edits.

### Invariants (Task 8 Step 2)

| Check | Result |
|---|---|
| `git diff origin/main --stat -- neon/migrations lib/agents/__snapshots__` | **prints nothing**: no migration file added or edited, prompt snapshots unchanged. |
| `git diff origin/main -- 'lib/agents/agents/*.ts' \| grep '^[-+].*task:'` | **prints nothing**: no agent's `task:` prompt text changed. |
| `git diff origin/main --stat` | 66 files before this task's documentation, 2,666 insertions, 90 deletions. |

### Unit-test delta

| Measure | P3.5c record (`aab7aa4`) | This branch (`a5a2211`) | Δ |
|---|---|---|---|
| App, excl. safe-media | 311 files / 3,298 tests | 315 files / 3,498 tests | **+4 files / +200 tests** |
| `lib/evidence/safe-media.test.ts` | 1 / 62 | 1 / 62 | 0 |
| `packages/region` | 3 / 23 | 3 / 23 | 0 |
| `packages/scoring` | 16 / 183 | 16 / 183 | 0 |
| `packages/contracts` | 3 / 20 | 3 / 20 | 0 |
| `packages/scan-engine` | 28 / 299 | 28 / 299 | 0 |
| **Total** | **362 files / 3,885 tests** | **366 files / 4,085 tests** | **+4 files / +200 tests** |

The P3.5c total was recorded before its final-review fix wave, which added a few unit cases without re-recording a total, so a small part of the +200 is not this branch's. The four new files are exactly this branch's: `lib/workspace/templates.contract.test.ts` (80 tests), `lib/workspace/workflow-inputs.test.ts` (10), `test/corpus/workflows/corpus.test.ts` (27: 23 cases plus the coverage assertions), `scripts/eval-workflows.test.ts` (14). The rest of the increase is new cases in existing files: `lib/workspace/runs.test.ts`, `lib/assistant/live.test.ts`, `lib/agents/agents.test.ts`, `lib/workspace/overview.test.ts`, `components/workspace/action-detail-client.test.tsx`. The eight files named above ran together as 326 tests, all passing. All four vendored packages are byte-unchanged (their counts are identical by construction).

### Integration delta

P3.5c recorded 39 files / 398 tests, and its fix wave then added one case to `neon-mail-outbox` (20 tests), making the base 39 / 399. This branch adds **no** integration file and **no** integration case: it edited the seeded fixtures in two existing files, and 39 / 399 is the unchanged count.

### e2e detail

The literal `corepack pnpm e2e` cannot start on this machine, for the same reason as `build`: the e2e environment launches the app with `next dev`, and Turbopack cannot resolve `radix-ui`'s sub-packages here. To obtain evidence anyway, the dev server was run with `--webpack` through a one-word change to `test/e2e/environment.ts`, reverted after the runs (`git status --short` showed only the intended documentation edits afterwards). Under that diagnostic:

- 30 of 31 public/owner-shell/report/smoke specs passed, including all `owner-shell` redirect specs, the public funnel manual-entry spec and the report dashboard layout specs in two locales and two widths.
- The one failure (`owner-shell.spec.ts:16`) is a strict-mode locator defect in a spec this branch does not touch: the spec asserts `page.getByRole("alert")` is visible, and Next injects a second `role="alert"` element (`__next-route-announcer__`) after hydration, so the locator matches two nodes. It reproduced three times in a row. It might not occur under Turbopack, whose runtime-created DOM may differ; that was not testable here. The fix, if wanted, is a one-line selector change (scope the locator to the sign-in form, or exclude `#__next-route-announcer__`). It was left alone because a spec/product defect that predates this branch is not this task's to alter, and because "do not weaken any gate" applies to rewriting an assertion to make a run green.

### Evaluation script ("built, not run", DEC-04)

`scripts/eval-workflows.ts` is registered as `corepack pnpm eval:workflows`. Neither `test` nor CI invokes it; only its fake-injected unit test (`scripts/eval-workflows.test.ts`, picked up by the `scripts/**` include this branch added to `vitest.config.ts`) runs in `test`. The only things exercised in this run were its two key-free paths:

- **Refusal.** `corepack pnpm eval:workflows -- --budget-usd 1` with no `EVAL_LIVE` printed `eval:workflows refused: not_enabled` and exited **2**.
- **Load check.** `corepack pnpm eval:workflows -- --check-load` printed `load ok: 23 cases` and exited **0**, proving the live pipeline (`runCorpusCase` and its imports) loads under `tsx` with `scripts/tsconfig.eval.json`.

`EVAL_LIVE` was never set, no key was supplied, no model was called, and nothing was written to `eval-results/`. The logic of the live path (refusal reasons, budget pre-flight, fail-closed unknown cost, report shape) is covered by `scripts/eval-workflows.test.ts` against an injected fake. **A real-model evaluation has never been run; it is blocked by DEC-04.**

### Not run

- **A real-model evaluation of any kind** (DEC-04).
- **`corepack pnpm build` (Turbopack), `corepack pnpm test:secret-boundary` and `corepack pnpm e2e` as literal gates**: blocked locally by the `radix-ui` Windows/Turbopack cascade. The `--webpack` build, the `--webpack` secret-boundary diagnostic and the `--webpack` e2e diagnostics above are the practical local evidence; CI on `ubuntu-latest` is the real gate for all three.
- **`corepack pnpm e2e:live`, `e2e:neon-auth`, `neon:readiness` and any hosted check**: need provider keys, a hosted identity target or a hosted database, none authorized.
- **Hosted verification of any kind.** No deployed request, no production Neon query.
- **Real mail, real Stripe, real model**: every test injects a fake.

### Known limits

See "Rulings, known limits and open questions" in the P4.4 section of `PHASE-4-REPORT.md`; the deferred minor findings are grouped there.
