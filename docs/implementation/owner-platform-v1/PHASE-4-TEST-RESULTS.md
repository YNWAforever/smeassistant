# Phase 4 test results

Gate-by-gate record for Phase 4. Each slice has its own section. P4.4, P4.1 and P4.2 are built; P4.3 is not started.

## P4.4 — reusable workflow contract

Candidate: branch `p4-growth-platform`. The Task 8 record below is at HEAD `a5a2211` (14 commits `dc457ec`..`a5a2211`); the final-review fix wave (five code commits `4c58de7`..`0debe06` plus a documentation commit, 22 commits in all) re-ran its gates in "Final-review fix wave" at the end. Base `c042b20` (`origin/main`, PR #26). Spec: [`docs/superpowers/specs/2026-09-30-workflow-contract-design.md`](../../superpowers/specs/2026-09-30-workflow-contract-design.md). Plan: `docs/superpowers/plans/2026-09-30-workflow-contract.md`. Environment: Windows 11 Pro 10.0.26200, Node `v24.18.0`, pnpm `9.12.0` via corepack, Docker Server `29.7.2`. Run on 2026-10-01, every heavy gate sequentially.

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
| 10b | `corepack pnpm e2e`, with `--webpack` added to the `next dev` spawn in `test/e2e/environment.ts` **temporarily** (a one-word local edit, reverted with `git checkout`, never committed) | 1 | **30 passed, 1 failed (31)**. The failure is `e2e/owner-shell.spec.ts:16` "`/zh-HK/owner/sign-in?error=invalid_code` explains the failed link": `getByRole('alert')` resolves to **two** elements in strict mode, the page's own `<p role="alert">登入連結已過期或已被使用。</p>` **and** Next's `<div role="alert" id="__next-route-announcer__">`. It failed identically on two further isolated runs. Observed only under this `--webpack` diagnostic dev server. It is inferred, not confirmed on base, that the branch is not the cause: `e2e/owner-shell.spec.ts`, `components/sign-in-page.tsx`, `app/[locale]/owner/sign-in/` and `proxy.ts` (`git diff c042b20 --stat -- e2e components/sign-in-page.tsx "app/[locale]/owner/sign-in" proxy.ts` is empty) are byte-identical to `c042b20`, but the spec was never run on `c042b20`. Reported, not fixed, not weakened. See "e2e detail". |
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
- The one failure (`owner-shell.spec.ts:16`) is an observed failure under the `--webpack` diagnostic server: the spec asserts `page.getByRole("alert")` is visible, and the locator resolves to two elements in strict mode (the page's `<p role="alert">` and `#__next-route-announcer__`). It reproduced three times in a row (the full run and two isolated runs). Earlier phases recorded e2e passing in CI, so the cause is not established: it may depend on the dev server (webpack versus Turbopack), on timing, or on something else, and none of that was testable here. What is known is limited to file identity: `e2e/owner-shell.spec.ts`, `components/sign-in-page.tsx`, `app/[locale]/owner/sign-in/` and `proxy.ts` (`git diff c042b20 --stat -- e2e components/sign-in-page.tsx "app/[locale]/owner/sign-in" proxy.ts` is empty) are byte-identical to `c042b20`. The spec was never run on `c042b20`, so "independent of this branch" is an inference. A possible fix, if the failure is confirmed, is a selector change (scope the locator to the sign-in form, or exclude `#__next-route-announcer__`). It was left alone because the cause is unconfirmed and because "do not weaken any gate" applies to rewriting an assertion to make a run green.

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

### Final-review fix wave

Findings, rulings (including the reversed evidence-input ruling) and commits are in the "Final-review fix wave" section of `PHASE-4-REPORT.md`. New or changed tests: `workflow-inputs.test.ts` (flipped evidence case; empty array/object), `runs.test.ts` (typed reviews reach the model; `menu_items: []`/`{}` block), `live.test.ts` (review reply blocked with neither source, reaches the model with typed text; empty menu list; every `DRAFT_AGENTS` key resolves), `agents.test.ts` (four ordinary-copy probes; reviewer price; observed rank; review-carried link still flags), `version-meta.test.ts`, `action-detail-client.test.tsx` (three locales; `ownerInputPatch`), `templates.contract.test.ts` (13 spec-table rows + coverage), `eval-workflows.test.ts` (unpriced pre-flight), corpus `uncertain_evidence-04` (flipped) and `provider_failure-03` (new; 24 cases, 28 corpus tests).
**Gate re-runs after the wave** (2026-10-01, sequential, on `0debe06` plus the documentation edits):

| Command | Exit | Result |
|---|---|---|
| `corepack pnpm typecheck` | 0 | **passed** (root and all four packages). |
| `corepack pnpm lint` | 0 | **passed**, `0 errors, 30 warnings`, the same 18 files as before; none in a file this wave touched. |
| `corepack pnpm test` | 0 | **passed**: app 315 files / 3,540 tests, safe-media 1 / 62, `region` 3 / 23, `scoring` 16 / 183, `contracts` 3 / 20, `scan-engine` 28 / 299. **366 files / 4,127 tests** (+42 over `a5a2211`). A first run under machine load had 3 `Test timed out in 5000ms` failures in files this wave does not touch (`lib/identity/identity-sdk.test.ts`, `lib/report/competitor-invariance.test.ts`, `app/api/versions/[versionId]/versions.test.ts`); all three passed in isolation (20 / 20) and the full re-run above passed with zero failures. Recorded, not hidden. |
| `NEON_INTEGRATION=1 corepack pnpm test:integration` | 0 | **passed**, 39 files / 399 tests, first run. |
| `corepack pnpm e2e:acceptance` with the temporary `--webpack` dev-server edit in `test/e2e/environment.ts` (reverted with `git checkout --`, never committed) | 0 | **passed, 38 / 38** (14.5 min). This is the first run of the base-restored `test/e2e/seed.ts`. The literal `e2e` / `e2e:acceptance` with Turbopack stays **blocked** on this machine (radix-ui cascade); CI is the real gate. |
| `corepack pnpm db:verify` | 0 | **passed**: 0001–0010, replay `[]`, 37 tables / 444 columns / 172 constraints / 95 indexes / 8 triggers / 14 functions, `seededRows` 0. Unchanged. |
| `corepack pnpm eval:workflows -- --budget-usd 1` | **2** | refused, `not_enabled` (no `EVAL_LIVE`, no key). |
| `corepack pnpm eval:workflows -- --check-load` | 0 | `load ok: 24 cases`. |
| Invariants | — | prompt snapshot byte-identical to `c042b20` (vitest rewrote line endings only; restored with `git checkout --`); no migration; no `packages/**` edit. |

Not re-run in this wave: `build`, `test:secret-boundary`, `test:no-supabase`, `test:no-self-service-claim` and the literal `e2e` (not in the wave's gate list; the earlier Task 8 records stand for them). No real model was called and `EVAL_LIVE` was never set.

## P4.1 — confirmed offers and promotion copy

Candidate: branch `p41-offers`, HEAD `31970f9` (implementation) plus this documentation commit. Base `dc55e02` (`origin/main`, PR #27). Spec: [`docs/superpowers/specs/2026-10-01-offers-promotion-copy-design.md`](../../superpowers/specs/2026-10-01-offers-promotion-copy-design.md). Plan: `docs/superpowers/plans/2026-10-01-offers-promotion-copy.md`. Environment: Windows 11 Pro 10.0.26200, Node `v24.18.0`, pnpm `9.12.0` via corepack, Docker Server `29.7.2`, `postgres:16` (16.15). Run on 2026-10-02, every heavy gate sequentially. No code changed in the documentation task; every gate below ran against the implementation tree plus the documentation edits (`.env.example`, `docs/integration/DEPLOY.md`, `rollout/apply-0011.sql`, the three Phase 4 documents).

**Read this first.** Everything below is **locally verified**. **Nothing here is hosted-verified.** `0011_offers.sql` was applied only to owned, disposable local Docker Postgres fixtures (`db:verify`, `test:integration`, the `apply-0011.sql` rehearsal). Nothing was applied to any hosted database, nothing was deployed or pushed, and no paid provider, real model or mail was called: the fake LLM is injected in every test, and the evaluation script was never run live. See `PHASE-4-REPORT.md` for what changed, the rulings, the known limits and the owner actions.

### Gate results (Task 11, full inventory)

Every command in `.github/workflows/ci.yml` is in this table, plus `eval:workflows` (not in CI).

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `corepack pnpm typecheck` | 0 | **passed**. Root `tsc --noEmit`, then `packages/{region,scoring,contracts,scan-engine}` each `Done`. |
| 2 | `corepack pnpm lint` | 0 | **passed**: `✖ 30 problems (0 errors, 30 warnings)` across 18 files. The same count as the P4.4 record; none of the 18 files is a file this branch changed. |
| 3a | `corepack pnpm test`, **first run** | **1** | **FAILED, not passed**: 2 files failed with `Test timed out in 5000ms` under load (`tests/scan-claim-single-path.test.ts` > "no production source calls claimAuditJob or claim_audit_job outside the wrapper's definition"; `tests/scan-events-single-writer.test.ts` > "only lib/analytics/scan-events.ts inserts into scan_events"), each after its one retry (about 10 s). App part: 325 files passed, 2 failed; 3,820 tests passed, 2 failed. Because the script chains its stages with `&&`, `safe-media` and the packages did not run in this invocation. Both files are the known load-timeout flakes and are unrelated to offers. |
| 3b | The two failing files, **alone** | 0 | `corepack pnpm exec vitest run tests/scan-claim-single-path.test.ts tests/scan-events-single-writer.test.ts`: **passed**, 2 files / 7 tests, 527 ms. |
| 3c | `corepack pnpm test`, **full re-run** | 0 | **passed with zero failures**: app 327 files / 3,822 tests, `lib/evidence/safe-media.test.ts` 1 / 62, `region` 3 / 23, `scoring` 16 / 183, `contracts` 3 / 20, `scan-engine` 28 / 299. **Total 378 files / 4,409 tests.** Gate 3c is the pass; 3a is recorded as the flaky run it was. |
| 4 | `NEON_INTEGRATION=1 corepack pnpm test:integration` | 0 | **passed on the first run, no flakes: 41 files / 441 tests** (282.8 s). New over P4.4: `neon-offers`, `neon-offer-freshness` (and the cases added to existing files). |
| 5 | `corepack pnpm db:verify` | 0 | **passed**: `0001`–`0011` applied, replay `[]`, **38 tables / 465 columns / 188 constraints / 98 indexes / 8 triggers / 18 functions**, `seededRows` 0, no deferred functions or triggers. Against the P4.4 record (37 / 444 / 172 / 95 / 8 / 14): +1 table (`offers`), +21 columns (20 on `offers`, `actions.offer_id`), +16 constraints, +3 indexes, +4 functions. |
| 6 | `corepack pnpm test:secret-boundary` | 0 | **passed**: `Secret boundary passed across 56 public artifacts.` (a Node `DEP0190` deprecation warning about `shell: true` printed; it is pre-existing and not a failure). This is the **literal** gate, Turbopack. |
| 7 | `corepack pnpm test:no-supabase` | 0 | **passed**: "No forbidden retired transport references; only the approved pinned Neon transitive library is permitted". |
| 8 | `corepack pnpm test:no-self-service-claim` | 0 | **passed**: "OWNER_SELF_SERVICE_CLAIM is not enabled." |
| 9 | `corepack pnpm build` (`next build`, Turbopack, the literal gate) | 0 | **passed**: `✓ Compiled successfully in 13.3s`, TypeScript finished in 24.7 s, route manifest printed including `/[locale]/owner/[workspaceSlug]/offers`, `/api/offers/[offerId]` (+ `/archive`, `/confirm`, `/promotions`) and `/api/workspaces/[workspaceId]/offers`. **Not blocked on this run:** the Windows-only `radix-ui` Turbopack cascade recorded at every earlier phase did not occur, so no `--webpack` diagnostic was needed or run. |
| 10 | `corepack pnpm e2e` | 0 | **passed: 31 / 31** (1.3 min), the literal gate with Turbopack. This includes `e2e/owner-shell.spec.ts:16`, which failed once under the P4.4 `--webpack` diagnostic server (see below). |
| 11 | `corepack pnpm e2e:acceptance` | 0 on the third run; 1 on each of the first two | **passed on the third full run, 39 / 39** (5.8 min), including `offer-promotion.spec.ts`. **The first two full runs each had one failure, so this is not a clean first-run pass.** Run 1: 38 passed, 1 failed: `public-funnel.spec.ts:74` hk "manual scan reaches a report and unlocks it" (`the scan should reach a report`; the page stayed on `/zh-HK/scanning/<id>` for the 120 s poll). Run 2: 38 passed, 1 failed: `merchant-loop.spec.ts:54` "invalid LLM output cannot create or approve a version or charge usage" (`apiRequestContext.post: read ECONNRESET` on `POST /api/actions/<id>/run`). The two failures are in different specs, neither touches offers, and `offer-promotion.spec.ts` passed in all three runs. Each failing spec passed on its own: `public-funnel` 2 / 2 (1.2 min), `merchant-loop` 5 / 5 (1.8 min). The cause was not established; both look like timing or connection trouble on the Playwright-managed `next dev` server on a busy machine (dozens of unrelated node processes and other projects' Docker containers were running), and the third run passing is consistent with that, but that is an inference, not a diagnosis. Recorded, not hidden. Task 10 had one clean 39 / 39 run and one run with a different single failure (`claim-and-market.spec.ts:12`), so this suite has been intermittently flaky on this machine across runs; CI on `ubuntu-latest` is the real gate. |
| 12 | `corepack pnpm eval:workflows -- --budget-usd 1` | **2** | **refused, as designed**: `eval:workflows refused: not_enabled`. `EVAL_LIVE` was not set, no key was supplied. |
| 13 | `corepack pnpm eval:workflows -- --check-load` | 0 | **passed**: `load ok: 31 cases` (24 existing + 7 offer cases; R12). No key, no network call. |

**Blocked: none.** No gate was blocked on this run. The P4.4 record's `--webpack` diagnostics (build, secret-boundary, e2e) were not needed.

**Note on the earlier P4.4 e2e finding.** P4.4 recorded `e2e/owner-shell.spec.ts:16` failing **only** under a `--webpack` diagnostic dev server (`getByRole("alert")` resolved to two elements, the page's `<p role="alert">` and Next's `#__next-route-announcer__`), and inferred, without being able to prove it, that the branch was not the cause. On this run the literal Turbopack `e2e` passed 31 / 31 with that spec included. That is consistent with the inference, but it is evidence about this run only; it is not a proof about the P4.4 diagnostic.

### Invariants

| Check | Result |
|---|---|
| `git diff dc55e02..31970f9 --stat -- neon/migrations packages` | only `neon/migrations/0011_offers.sql`, 367 insertions: no `0001`–`0010` edit, no vendored-package edit. |
| `lib/agents/__snapshots__/agents.test.ts.snap` | 758 lines added, 0 removed (`--numstat`), and `--ignore-cr-at-eol` shows 0 removed: existing entries byte-identical (R5). |
| `git diff dc55e02 --diff-filter=M -- 'lib/agents/agents/*.ts' \| grep '^[-+].*task:'` | prints nothing: no existing agent's `task:` line changed. The only added agent file is `promotion-copy.ts`. |
| `lib/assistant/live.ts` | unchanged by this branch (`git diff dc55e02..31970f9 --stat -- lib/assistant` prints nothing). |

### Unit-test delta

| Measure | P4.4 final record (`0debe06` + docs) | This branch | Δ |
|---|---|---|---|
| App, excl. safe-media | 315 files / 3,540 tests | 327 files / 3,822 tests | **+12 files / +282 tests** |
| `lib/evidence/safe-media.test.ts` | 1 / 62 | 1 / 62 | 0 |
| `packages/region` | 3 / 23 | 3 / 23 | 0 |
| `packages/scoring` | 16 / 183 | 16 / 183 | 0 |
| `packages/contracts` | 3 / 20 | 3 / 20 | 0 |
| `packages/scan-engine` | 28 / 299 | 28 / 299 | 0 |
| **Total** | **366 files / 4,127 tests** | **378 files / 4,409 tests** | **+12 files / +282 tests** |

All four vendored packages are byte-unchanged (their counts are identical by construction). Integration: 39 files / 399 tests → **41 files / 441 tests** (+2 files, +42 tests).

### The `apply-0011.sql` rehearsal

Recorded in full in the "Runbook — `apply-0011.sql`" section of `PHASE-4-REPORT.md`: seven checks (pre-grant refusal, two wrong-journal refusals, first run, `applyMigrations` reporting nothing pending, ownership and runtime access under `SET ROLE sme_app_runtime`, second-run refusal), run twice on a disposable `postgres:16` with identical results. Commands, in order: `docker run` of a loopback-only `postgres:16` → create `neondb_owner` / `neondb`, `smeassistant_migrator`, `sme_app_runtime` → scratch script (outside the repo) → `applyMigrations(0001–0009)` as the migrator → `apply-0010.sql` as `neondb_owner` → `apply-0011.sql` and the checks → `docker rm -f`. `corepack pnpm db:verify` was part of the gate run above and still passes with `0001`–`0011`.

### Not run

- **A real-model evaluation of any kind** (DEC-04).
- **The hosted migration** (DEC-11): `0011` was never applied outside owned local Docker Postgres.
- **`corepack pnpm e2e:live`, `e2e:neon-auth`, `neon:readiness` and any hosted check**: need provider keys, a hosted identity target or a hosted database, none authorized.
- **Real mail, real Stripe, real model**: every test injects a fake.
- **P4.2, P4.3, P4.5, P4.6.**

### Final-review fix wave

Findings F1–F7, the commits (`d3bd7b4`, `a5e5ce8`, `941bfa2`, `de8dc18`, then a documentation commit) and the gate re-runs are in the "Final-review fix wave" section of the P4.1 part of `PHASE-4-REPORT.md`. Two records above are superseded by the wave: the invariant row "`lib/assistant/live.ts` unchanged by this branch" (F6 adds an offer-action refusal to its draft path; it still has no promotion intent), and the unit totals (app part now 327 files / 3,828 tests, **378 files / 4,415 tests** in all). New or changed tests: `app/api/offers/[offerId]/promotions/route.test.ts` (F2), `app/api/offers/offers.test.ts` (F1 audit payload, F5 no audit), `lib/workspace/runs.test.ts` (F4), `lib/assistant/live.test.ts` (F6), `test/integration/neon-offers.integration.test.ts` (F1 ×2, F5; 27 tests). `test/corpus/workflows/harness.ts` now passes `featureEnv: { OFFER_PROMOTIONS_ENABLED: "true" }`.

## P4.2 — work packs (visibility starter pack)

Candidate: branch `p42-work-packs`, HEAD `a071ff3` (implementation) plus this documentation commit. Base `a71c5df` (`origin/main`, PR #28). Spec: [`docs/superpowers/specs/2026-10-02-work-packs-design.md`](../../superpowers/specs/2026-10-02-work-packs-design.md). Plan: `docs/superpowers/plans/2026-10-02-work-packs.md`. Environment: Windows 11 Pro 10.0.26200, Node `v24.18.0`, pnpm `9.12.0` via corepack, Docker Server `29.7.2`, `postgres:16` (16.15). Run on 2026-10-03, every heavy gate sequentially, on a busy machine (dozens of unrelated node processes and other projects' Docker containers were running). No code changed in the documentation task; every gate below ran against the implementation tree plus the documentation edits (`.env.example`, `docs/integration/DEPLOY.md`, `rollout/apply-0012.sql`, the three Phase 4 documents).

**Read this first.** Everything below is **locally verified**. **Nothing here is hosted-verified.** `0012_work_packs.sql` was applied only to owned, disposable local Docker Postgres fixtures (`db:verify`, `test:integration`, the `apply-0012.sql` rehearsal). Nothing was applied to any hosted database, nothing was deployed or pushed, and no paid provider, real model or mail was called: the fake LLM is injected in every test, and the evaluation script was never run live. See `PHASE-4-REPORT.md` for what changed, the rulings, the known limits and the owner actions.

### Gate results (Task 7, full inventory)

Every command in `.github/workflows/ci.yml` is in this table (CI has no gate beyond this list), plus `eval:workflows` (not in CI).

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `corepack pnpm typecheck` | 0 | **passed**. Root `tsc --noEmit`, then `packages/{region,scoring,contracts,scan-engine}` each `Done`. |
| 2 | `corepack pnpm lint` | 0 | **passed**: `✖ 30 problems (0 errors, 30 warnings)` across 18 files; the same count as the P4.1 record, and none of the 18 files is a file this branch changed. |
| 3a | `corepack pnpm test`, **run 1** | **1** | **FAILED, not passed**: five files failed with `Test timed out in 5000ms` (after one retry each, 10–15 s): `tests/scan-claim-single-path.test.ts`, `tests/scan-events-single-writer.test.ts`, `app/api/actions/[actionId]/route.test.ts` ("dismisses an action and records action.dismissed"), `app/api/versions/[versionId]/versions.test.ts` ("approves this exact version and reports idempotent on a repeat"), `app/api/actions/[actionId]/versions/route.test.ts` ("saves a manual edit as v2 on top of v1 through the RPC"). App part: 329 files passed, 5 failed; 3,908 tests passed, 5 failed. Because the script chains its stages with `&&`, `safe-media` and the packages did not run in this invocation. |
| 3b | The five failing files, **alone** | 0 | `corepack pnpm exec vitest run` on the five paths: **passed**, 5 files / 34 tests. |
| 3c | `corepack pnpm test`, **run 2** | **1** | **FAILED**: `scan-claim-single-path` and `scan-events-single-writer` (the same timeout); 332 files / 3,911 tests passed, 2 failed. |
| 3d | `corepack pnpm test`, **runs 3 and 4** | **1** each | **FAILED**: `app/api/versions/[versionId]/versions.test.ts` > approve "reports idempotent on a repeat" timed out (5,000 ms), in both runs; 333 files / 3,912 tests passed, 1 failed each. The file alone: **passed**, 14 / 14 (2.0 s). |
| 3e | The stages the chained script skipped, run separately | 0 | `lib/evidence/safe-media.test.ts` 1 / 62; `packages/region` 3 / 23; `scoring` 16 / 183; `contracts` 3 / 20; `scan-engine` 28 / 299: all **passed**. |
| 3f | Diagnostic: `vitest run --exclude lib/evidence/safe-media.test.ts --testTimeout=30000` | 0 | **334 / 334 files, 3,913 / 3,913 tests passed** (72 s). **A diagnostic, not the gate**: it shows every failure above is the 5 s timeout under load, not a logic failure. The gate (3a, 3c, 3d) never passed clean on this machine; recorded, not hidden. Totals if every stage is counted once: **385 files / 4,500 tests**. |
| 4 | `NEON_INTEGRATION=1 corepack pnpm test:integration` | 0 | **passed on the first run, no flakes: 43 files / 463 tests** (517 s). New over P4.1: `neon-work-packs` (17), `neon-work-packs-flag-off` (2). |
| 5 | `corepack pnpm db:verify` | 0 | **passed**: `0001`–`0012` applied, replay `[]`, **40 tables / 477 columns / 198 constraints / 102 indexes / 8 triggers / 18 functions**, `seededRows` 0, no deferred functions or triggers. Against the P4.1 record (38 / 465 / 188 / 98 / 8 / 18): +2 tables, +12 columns, +10 constraints, +4 indexes. |
| 6 | `corepack pnpm test:no-supabase` | 0 | **passed**: "No forbidden retired transport references; only the approved pinned Neon transitive library is permitted". |
| 7 | `corepack pnpm test:no-self-service-claim` | 0 | **passed**: "OWNER_SELF_SERVICE_CLAIM is not enabled." |
| 8 | `corepack pnpm eval:workflows -- --check-load` | 0 | **passed**: `load ok: 31 cases` (unchanged: this slice adds no corpus case). No key, no network call. |
| 9 | `corepack pnpm build` (`next build`, Turbopack, the literal gate) | **1** | **blocked**: `Module not found: Can't resolve '@radix-ui/react-dismissable-layer'` raised from `@radix-ui/react-tooltip`, through `components/ui/tooltip.tsx` → `components/ui/sidebar.tsx` → `components/product-ui.tsx` → `app/[locale]/owner/[workspaceSlug]/layout.tsx`. The standing Windows-only local cascade; it did not occur in the P4.1 run, so it is intermittent. No file this branch changes is in the trace. |
| 10 | `corepack pnpm test:secret-boundary` (literal) | **1** | **blocked**: it shells out to the Turbopack build and inherits #9. |
| 11 | `corepack pnpm e2e` (literal) | **1** | **blocked**: the Playwright global setup failed, `Acceptance service not healthy: http://localhost:3100` (the Turbopack dev server cannot serve the owner shell; `test-results/fixture-next.log` shows the same radix error). |
| 12 | `corepack pnpm e2e:acceptance` (literal) | **1** | **blocked**: tests 1–8 each failed with `Acceptance service not healthy` after about 65 s; the run was **stopped by hand** (`taskkill` of the Playwright process tree) rather than wait out the remaining 32 timeouts. |

**`--webpack` diagnostics (not the literal gates).** As at P4.4, the blocked gates were repeated with webpack in place of Turbopack. These prove the code builds and behaves; they do not replace the Turbopack gates, and CI on `ubuntu-latest` is the real gate. The two temporary one-token edits (`"--webpack"` added to the build step of `scripts/assert-secret-boundary.mjs` and to the `next dev` arguments in `test/e2e/environment.ts`) were restored from HEAD and are not committed; `git status` shows neither file.

| # | Diagnostic | Result |
|---|---|---|
| 9d | `corepack pnpm exec next build --webpack` | **passed**: `✓ Compiled successfully in 41s`, TypeScript route-type check ran, route manifest printed including `/[locale]/owner/[workspaceSlug]/packs/[packId]`, `/api/packs/[packId]` and `/api/workspaces/[workspaceId]/packs`. |
| 10d | `test:secret-boundary` with `--webpack` | **passed**: `Secret boundary passed across 148 public artifacts.` (the webpack build emits more public artifacts than Turbopack's 56). |
| 11d | `e2e` with `--webpack` | **30 passed, 1 failed** (1.5 min). The failure is `e2e/owner-shell.spec.ts:16`, `getByRole("alert")` resolving to two elements (the page's `<p role="alert">` and Next's `#__next-route-announcer__`): the same failure recorded under P4.4 for the webpack dev server only, in a spec and files this branch does not touch; the literal Turbopack run passed it 31 / 31 under P4.1. |
| 12d | `e2e:acceptance` with `--webpack` | **passed 40 / 40 on the first run** (9.0 min), including `work-pack.spec.ts` ("the starter pack becomes drafts, one is approved and exported, and starting again returns the same pack"). Task 6 had seen 20 / 40 fail under load on a busier machine (all stuck at `/owner/sign-in/complete`, each passing alone), so this suite is load-sensitive on this machine. |

### Invariants

| Check | Result |
|---|---|
| `git diff a71c5df..a071ff3 --stat -- neon/migrations packages lib/agents/__snapshots__` | only `neon/migrations/0012_work_packs.sql`, 62 insertions: no `0001`–`0011` edit, no vendored-package edit, no agent-snapshot change. |
| Changed lines of the code diff that mention `agent_runs` | none (`grep '^[+-]'`); `lib/repositories/fix-pack.ts` and the fix-pack-drafts route are unchanged. |
| SQL touching usage or approve/export | none added; the only SQL added is `0012` (two tables). |
| Flag off | `neon-work-packs-flag-off` records every statement against a schema stopping at `0011`: zero mention a pack table. |

### Unit-test delta

| Measure | P4.1 final record | This branch | Δ |
|---|---|---|---|
| App, excl. safe-media | 327 files / 3,828 tests | 334 files / 3,913 tests | **+7 files / +85 tests** |
| `lib/evidence/safe-media.test.ts` | 1 / 62 | 1 / 62 | 0 |
| `packages/region` / `scoring` / `contracts` / `scan-engine` | 3 / 23, 16 / 183, 3 / 20, 28 / 299 | identical | 0 |
| **Total** | **378 files / 4,415 tests** | **385 files / 4,500 tests** | **+7 files / +85 tests** |

New test files: `app/api/packs/[packId]/route.test.ts`, `app/api/workspaces/[workspaceId]/packs/route.test.ts`, `components/workspace/pack-card.test.tsx`, `pack-view.test.tsx`, `lib/workspace/use-sequential-runs.test.tsx`, `home-packs.test.ts`, `packs.test.ts`; existing files extended: `fix-pack-card.test.tsx`, `home-brief.test.tsx`, `client.test.ts`, `more-view.test.tsx`, `test/e2e/safety.test.ts`. Integration: 41 files / 441 tests (the P4.1 Task 11 record; its fix wave then added three tests to `neon-offers` without a full re-run) → **43 files / 463 tests** (+2 files). All four vendored packages are byte-unchanged.

### The `apply-0012.sql` rehearsal

Recorded in full in the "Runbook — `apply-0012.sql`" section of `PHASE-4-REPORT.md`: seven checks (pre-grant refusal, two wrong-journal refusals, first run, `applyMigrations` reporting nothing pending, ownership and runtime access under `SET ROLE sme_app_runtime`, second-run refusal), run twice on a disposable `postgres:16` with identical results. Commands, in order: `docker run` of a loopback-only `postgres:16` → create `neondb_owner` / `neondb`, `smeassistant_migrator`, `sme_app_runtime` → scratch script (outside the repo) → `applyMigrations(0001–0009)` as the migrator → `apply-0010.sql` and `apply-0011.sql` as `neondb_owner` → `apply-0012.sql` and the checks → `docker rm -f`. `corepack pnpm db:verify` is part of the gate run above and passes with `0001`–`0012`.

### Not run

- **A real-model evaluation of any kind** (DEC-04).
- **The hosted migration** (DEC-11): `0012` was never applied outside owned local Docker Postgres.
- **The literal Turbopack `build`, `test:secret-boundary`, `e2e` and `e2e:acceptance`** on this machine (blocked, above); only their `--webpack` diagnostics ran.
- **`corepack pnpm e2e:live`, `e2e:neon-auth`, `neon:readiness` and any hosted check**: need provider keys, a hosted identity target or a hosted database, none authorized.
- **Real mail, real Stripe, real model**: every test injects a fake.
- **P4.3, P4.5, P4.6.**
