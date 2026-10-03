# Phase 4 test results

Gate-by-gate record for Phase 4. Each slice has its own section. P4.4, P4.1, P4.2, P4.3 and P4.5 are built.

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
| 9 | `corepack pnpm build` (`next build`, Turbopack, the literal gate) | **1** | **blocked**: `Module not found: Can't resolve '@radix-ui/react-dismissable-layer'` raised from `@radix-ui/react-tooltip`, through `components/ui/tooltip.tsx` → `components/ui/sidebar.tsx` → `components/product-ui.tsx` → `app/[locale]/owner/[workspaceSlug]/layout.tsx`. The Windows-only local cascade, recorded at P3 and P4.4, not seen at P4.1, cause unconfirmed. No file this branch changes is in the trace. |
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

### Final-review fix wave

Findings G1–G6 (Ruling P6), the commits (`4dae03a`, `0a6e615`, `ab3dffc`, `21cbde7`, `b92f7ee`, then a documentation commit), each fix with its covering tests, are in the "Final-review fix wave" subsection of the P4.2 part of `PHASE-4-REPORT.md`. Gate re-runs, 2026-10-03, sequential, on `b92f7ee`:

| # | Command | Exit | Result |
|---|---|---|---|
| F1 | `corepack pnpm typecheck` | 0 | **passed** (root and all four packages). |
| F2 | `corepack pnpm lint` | 0 | **passed**, `✖ 30 problems (0 errors, 30 warnings)`, the same 18 files as above; none touched by the wave. |
| F3 | `corepack pnpm test` | 0 | **passed on the first full run, no flake.** App part **335 files / 3,931 tests**; `safe-media` 1 / 62; `region` 3 / 23; `scoring` 16 / 183; `contracts` 3 / 20; `scan-engine` 28 / 299. Total **386 files / 4,518 tests** (+1 file / +18 tests over the Task 7 record of 385 / 4,500). New file: `lib/repositories/packs.test.ts` (3); extended: `use-sequential-runs.test.tsx` (+4), `pack-card.test.tsx` (+7), `pack-view.test.tsx` (+4). The P4.1 `offer-promotion-panel.test.tsx` is unchanged and passes. |
| F4 | `corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-work-packs.integration.test.ts test/integration/neon-work-packs-flag-off.integration.test.ts` | 0 | **passed**, 2 files / 19 tests. Only these files exercise `lib/repositories/packs.ts`; the full `test:integration` suite was not re-run. |
| F5 | `corepack pnpm exec playwright test --config playwright.acceptance.config.ts work-pack.spec` (literal Turbopack) | 1 | **blocked**: `Acceptance service not healthy: http://localhost:55139` (the local cascade, #9 above). |
| F5d | The same with a temporary `--webpack` on the `next dev` arguments in `test/e2e/environment.ts` (restored; `git status` clean) | 0 | **passed 1 / 1** (2.0 min): Start on a fresh (`created: true`) pack still drafts all three items; the spec is unchanged. A diagnostic, not the literal gate. |

Unit and line-ending hygiene: the two snapshot files that Windows unit runs rewrite (`lib/agents/__snapshots__/agents.test.ts.snap`, `lib/pocket-assistant/__snapshots__/demo.test.ts.snap`) were restored with `git restore` and are not part of any commit. Not re-run in this wave: `db:verify`, `build`, `test:secret-boundary`, `test:no-supabase`, `test:no-self-service-claim`, `eval:workflows`, the full `e2e` and `e2e:acceptance` suites (no migration, route, agent or build-configuration change; the Task 7 records above stand).

## P4.3 — contextual assistant

Candidate: branch `p43-contextual-assistant`, HEAD `02b5577` (implementation) plus this documentation commit. Base `ecc60df` (`origin/main`, PR #29). Spec: [`docs/superpowers/specs/2026-10-03-contextual-assistant-design.md`](../../superpowers/specs/2026-10-03-contextual-assistant-design.md). Plan: `docs/superpowers/plans/2026-10-03-contextual-assistant.md`. Environment: Windows 11 Pro 10.0.26200, Node `v24.18.0`, pnpm `9.12.0` via corepack, Docker Server `29.7.2`, `postgres:16`. Run on 2026-10-03, every heavy gate sequentially, on a machine at about 99 % CPU for much of the run (other projects' test runs, dev servers and Docker containers were running); that matters for the timeout failures recorded below. No code changed in the documentation task; every gate below ran against the implementation tree plus the documentation edits (`.env.example`, `docs/integration/DEPLOY.md` and the three Phase 4 documents).

**Read this first.** Everything below is **locally verified**. **Nothing here is hosted-verified.** There is no migration in this slice (the journal is still `0001`–`0012`), nothing was applied to any hosted database, nothing was deployed or pushed, and no paid provider, real model or mail was called: the fake LLM is injected wherever a route is exercised, and the two new intents never reach a model. See `PHASE-4-REPORT.md` for what changed, the rulings, the known limits and the owner actions.

**The run was interrupted once.** A usage limit stopped the session after the unit, integration, `db:verify`, `no-supabase`, `no-self-service-claim`, `eval:workflows`, `build` and webpack `build`/`secret-boundary`/`e2e` results and part of the first `--webpack` acceptance run had been recorded (each to its own log). After the reset the acceptance results were re-checked, the failed acceptance specs were re-run alone, and the literal `e2e` and `e2e:acceptance` runs were made after the temporary `--webpack` edits were restored. Nothing recorded before the interruption was assumed; every row below has a log behind it.

### Gate results (Task 7, full inventory)

Every command in `.github/workflows/ci.yml` is in this table (CI has no gate beyond this list), plus `eval:workflows` (not in CI).

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `corepack pnpm typecheck` | 0 | **passed**. Root `tsc --noEmit`, then `packages/{region,scoring,contracts,scan-engine}` each `Done`. |
| 2 | `corepack pnpm lint` | 0 | **passed**: `✖ 30 problems (0 errors, 30 warnings)`, the same count as the P4.2 record; none of the files this branch changed carries one. |
| 3a | `corepack pnpm test`, run 1 | **1** | **FAILED, not passed**: two files failed with `Test timed out in 5000ms`: `tests/scan-claim-single-path.test.ts` ("no production source calls claimAuditJob or claim_audit_job outside the wrapper's definition") and `app/api/versions/[versionId]/versions.test.ts` ("approves this exact version and reports idempotent on a repeat"). Root part: **341 files; 339 passed, 2 failed; 4,081 tests, 4,079 passed, 2 failed.** Because the script chains its stages with `&&`, `safe-media` and the packages did not run in this invocation. |
| 3b | The two failing files, **alone** | 0 | **passed**, 2 files / 18 tests. |
| 3c | The stages the chained script skipped, run separately | 0 | `lib/evidence/safe-media.test.ts` 1 / 62; `corepack pnpm -r test`: `packages/region` 3 / 23, `scoring` 16 / 183, `contracts` 3 / 20, `scan-engine` 28 / 299: all **passed**. |
| 3d | Total if every stage is counted once, all tests passing | — | **392 files / 4,668 tests** (341 + 1 + 3 + 16 + 3 + 28 files; 4,081 + 62 + 23 + 183 + 20 + 299 tests). The gate itself did not pass clean on this machine in the one full run made; recorded, not hidden. |
| 3e | The P4.3 assistant files in one run (`lib/assistant`, `app/api/assistant`, `components/pocket-assistant`, `action-detail-version-param`, `lib/pocket-assistant`, `test/e2e/safety.test.ts`) | 0 | **passed**, 14 files / 308 tests. |
| 4 | `NEON_INTEGRATION=1 corepack pnpm test:integration` | 0 | **passed on the first run, no flakes: 45 files / 478 tests.** New over P4.2 (43 / 463): `neon-assistant-signals` and `neon-assistant-flag-off` (+2 files, +15 tests). |
| 5 | `corepack pnpm db:verify` | 0 | **passed**: `0001`–`0012` applied, replay `[]`, **40 tables / 477 columns / 198 constraints / 102 indexes / 8 triggers / 18 functions**, `seededRows` 0, no deferred functions or triggers. Identical to the P4.2 record: this slice adds no schema. |
| 6 | `corepack pnpm test:no-supabase` | 0 | **passed**: "No forbidden retired transport references; only the approved pinned Neon transitive library is permitted". |
| 7 | `corepack pnpm test:no-self-service-claim` | 0 | **passed**: "OWNER_SELF_SERVICE_CLAIM is not enabled." |
| 8 | `corepack pnpm eval:workflows -- --check-load` | 0 | **passed**: `load ok: 31 cases` (unchanged: this slice adds no corpus case). No key, no network call. |
| 9 | `corepack pnpm build` (`next build`, Turbopack, the literal gate) | **1** | **blocked**: `Turbopack build failed with 51 errors`, each `Module not found: Can't resolve '@radix-ui/react-*'` raised from `radix-ui/dist/index.mjs` (the same Windows-only local cascade recorded at P3, P4.4 and P4.2; cause unconfirmed). No file this branch changes is in the trace. |
| 10 | `corepack pnpm test:secret-boundary` (literal) | **1** | **blocked**: it shells out to the Turbopack build and inherits #9. |
| 11 | `corepack pnpm e2e` (literal) | **1** | **blocked**: the Playwright global setup failed, `Acceptance service not healthy: http://localhost:3100` (the Turbopack dev server cannot serve the owner shell). |
| 12 | `corepack pnpm e2e:acceptance` (literal) | **124** (stopped by timeout) | **blocked**: the first tests each failed with `Acceptance service not healthy` on the Turbopack dev server (`test-results/fixture-next.log` shows the same radix `Can't resolve` errors, 13,566 lines); the run was stopped at its 240 s limit (exit 124 from `timeout`, then `taskkill` of this worktree's Playwright and `next` processes) rather than wait out the remaining timeouts. |

**`--webpack` diagnostics (not the literal gates).** As at P4.4 and P4.2, the blocked gates were repeated with webpack in place of Turbopack. These prove the code builds and behaves; they do not replace the Turbopack gates, and CI on `ubuntu-latest` is the real gate. The two temporary one-token edits (`"--webpack"` added to the build step of `scripts/assert-secret-boundary.mjs` and to the `next dev` arguments in `test/e2e/environment.ts`) were restored with `git restore` before the literal runs above and are not committed; `git status` shows neither file.

| # | Diagnostic | Result |
|---|---|---|
| 9d | `corepack pnpm exec next build --webpack` | **passed**: `✓ Compiled successfully in 43s`, the TypeScript route-type check ran, and the route manifest includes `/api/assistant/run` and `/api/assistant/suggestions`. |
| 10d | `test:secret-boundary` with `--webpack` | **passed**: `Secret boundary passed across 149 public artifacts.` (P4.2 record: 148). |
| 11d | `e2e` with `--webpack` | **30 passed, 1 failed** (1.7 min). The failure is `e2e/owner-shell.spec.ts:16`, `getByRole("alert")` resolving to two elements (the page's `<p role="alert">` and Next's `#__next-route-announcer__`): the same diagnostic-only failure recorded at P4.4 and P4.2, in a spec and files this branch does not touch; the literal Turbopack run passed it 31 / 31 under P4.1. |
| 12d-1 | `e2e:acceptance` with `--webpack`, run 1 | **40 passed, 1 failed** (17.5 min). The failure: `permissions.spec.ts:4` "viewer: accepted evidence reads, omitted/spoofed context denial, revocation", an assistant draft call answering 500 where the test expects 403, on a machine at about 99 % CPU. The file **alone**: **7 passed** (3.1 min). `contextual-assistant.spec.ts` and `work-pack.spec.ts` passed in this run. |
| 12d-2 | `e2e:acceptance` with `--webpack`, run 2 | **35 passed, 6 failed** (29.0 min). Failures: `claim-and-market.spec.ts` (existing assigned owner succeeds; viewer cannot finalize an assigned owner's claim), `permissions.spec.ts` (viewer and manager, one a 180 s `apiRequestContext.post` timeout), `report-dashboard.spec.ts`, `report-scan-comparison.spec.ts`: five are `expect(page).toHaveURL` failures at the sign-in handoff, the load-sensitivity pattern recorded at P4.2. The four spec files **alone**: **13 passed** (6.2 min). `contextual-assistant.spec.ts` and `work-pack.spec.ts` passed again. |
| 12d-3 | Reading of 12d | The full suite did not pass clean in either run on this machine, and this is recorded, not hidden: run 1 lost one test and run 2 six to load timeouts and handoff races, each failing spec passed when re-run alone, and the one spec that failed in both runs, `permissions.spec.ts`, failed differently each time (a 500 in run 1, a 180 s request timeout in run 2) and passed alone: 7 / 7, and later 13 / 13 as part of the four previously failing files run together. It did not reproduce in any of the three other runs of that file. The final review traced the 500: in `app/api/assistant/run/route.ts` a viewer's draft call reaches `authorizeWorkspaceRequest` with the manager floor at :70-72, outside the `try` that starts at :87; the route's own `catch` maps failures to 503, so a 500 can only come from an identity-fixture or database failure inside that authorization, or from the framework (a Next dev compile race). That authorization was already outside the `try` at `ecc60df` (:58-60, `try` at :75), and this branch added only pure statements before the `try` (origin handling and the flag gate). Conclusion: a pre-existing, load-triggered path; the next full acceptance run should capture dev-server logs to tell the two causes apart. Taken together every one of the 41 acceptance tests has passed on this tree under `--webpack`, including the new `contextual-assistant.spec.ts` ("an owner with a waiting draft continues from the assistant to the exact version", also 1 passed in 55.9 s in Task 6). |

### Invariants

| Check | Result |
|---|---|
| `git diff ecc60df..HEAD --stat -- neon/migrations packages lib/agents/__snapshots__` | prints nothing: no migration, no vendored-package edit, no agent-snapshot change. |
| New or changed SQL | none: the only new queries are the two read-only reads in `lib/repositories/artifacts.ts` (`assistantWaitingVersions`, `assistantGoogleConnection`). `neon-assistant-flag-off` asserts a flag-on suggestions fetch runs no `insert`, `update` or `delete`. |
| Writes to `actions`, `action_runs`, `output_versions`, `deliveries`, `workspace_usage` | none added; the acceptance spec asserts the version, delivery and run counts, the version's state and `workspace_usage` are unchanged after the journey and that no approve, request-changes, reject, export or publish route was requested. |
| Flag off | `neon-assistant-flag-off` records every statement against a full-migration schema: zero for the suggestions route and for both new intents on the run route (flag values `""`, `false`, `TRUE`, `1` for the suggestions route; `""` for the two run intents), with a flag-on contrast so the recorder is not silent. |
| Model | the two new intents never call `llmComplete` or read the budget (`lib/assistant/live.test.ts`, `app/api/assistant/run/route.test.ts`, including `AI_DRAFTS_PAUSED=true`). |

### Unit-test delta

| Measure | P4.2 final record | This branch | Δ |
|---|---|---|---|
| App, excl. safe-media | 335 files / 3,931 tests | 341 files / 4,081 tests | **+6 files / +150 tests** |
| `lib/evidence/safe-media.test.ts` | 1 / 62 | 1 / 62 | 0 |
| `packages/region` / `scoring` / `contracts` / `scan-engine` | 3 / 23, 16 / 183, 3 / 20, 28 / 299 | identical | 0 |
| **Total** | **386 files / 4,518 tests** | **392 files / 4,668 tests** | **+6 files / +150 tests** |
| Integration | 43 files / 463 tests | 45 files / 478 tests | +2 files / +15 tests |

New unit test files: `lib/assistant/flag.test.ts` (2), `lib/assistant/next-step.test.ts` (8), `lib/assistant/signals.test.ts` (29), `lib/assistant/suggestions.test.ts` (10), `app/api/assistant/suggestions/route.test.ts` (22), `components/workspace/action-detail-version-param.test.tsx` (8). Existing files extended: `lib/assistant/templates.test.ts` (29), `lib/assistant/live.test.ts` (72), `app/api/assistant/run/route.test.ts` (32), `components/pocket-assistant/assistant-sheet.test.tsx` (27), `lib/pocket-assistant/demo.test.ts` (47, plus its snapshot), `lib/pocket-assistant/request.test.ts` (7), `test/e2e/safety.test.ts` (9); the counts are each file's current total, not the delta. New integration files: `neon-assistant-signals.integration.test.ts`, `neon-assistant-flag-off.integration.test.ts`. New acceptance spec: `e2e/acceptance/contextual-assistant.spec.ts`. All four vendored packages are byte-unchanged.

### Not run

- **Hosted acceptance of any kind: NOT RUN.** No deployed request, no production Neon query, no hosted identity target.
- **A real-model evaluation of any kind** (DEC-04).
- **The literal Turbopack `build`, `test:secret-boundary`, `e2e` and `e2e:acceptance`** on this machine (blocked, above); only their `--webpack` diagnostics ran, and the full acceptance suite did not pass clean in one invocation.
- **`corepack pnpm e2e:live`, `e2e:neon-auth`, `neon:readiness` and any hosted check**: need provider keys, a hosted identity target or a hosted database, none authorized.
- **Real mail, real Stripe, real model**: every test injects a fake.
- **P4.5, P4.6.**

## P4.5 — conditional acquisition preview (one unsaved review-reply draft)

Candidate: branch `p45-preview-draft`. The Task 6 record below is at HEAD `c57d87a` (implementation) plus its documentation commit `2987427`; the final-review fix wave (code commit `117ff00` plus a documentation commit) re-ran its gates in "Final-review fix wave" at the end of this section. Base `8582a7c` (`origin/main`, PR #30). Spec: [`docs/superpowers/specs/2026-10-04-preview-draft-design.md`](../../superpowers/specs/2026-10-04-preview-draft-design.md). Plan: `docs/superpowers/plans/2026-10-04-preview-draft.md`. Environment: Windows 11 Pro 10.0.26200, Node `v24.18.0`, pnpm `9.12.0` via corepack, Docker Server `29.7.2`, `postgres:16` (16.15). Run on 2026-10-04 between 03:55 and 04:52 HKT, every gate sequentially, never two heavy gates at once, on a machine with other projects' dev servers and Docker containers running. No code changed in the documentation task; every gate below ran against the implementation tree plus the documentation edits (`.env.example`, `docs/integration/DEPLOY.md`, `rollout/apply-0013.sql`, `PREVIEW-METRICS.md`, `INCIDENT-RUNBOOK.md`, `BUSINESS-AND-HOSTED-DECISIONS.md`, `IMPLEMENTATION-TRACEABILITY.md` and the two Phase 4 documents).

**Read this first.** Everything below is **locally verified**. **Nothing here is hosted-verified.** `0013_preview_events.sql` was applied only to owned, disposable local Docker Postgres fixtures (`db:verify`, `test:integration`, the acceptance fixtures, the `apply-0013.sql` rehearsal and the `PREVIEW-METRICS.md` query check). **Nothing was applied to any hosted database, and hosted acceptance was NOT RUN.** Nothing was deployed or pushed, and no paid provider, real model or mail was called: the fake LLM is injected in every unit and integration test, and the acceptance suite uses its fixture LLM server. See `PHASE-4-REPORT.md` ("P4.5") for what changed, the rulings, the known limits and the owner actions.

### Gate results (Task 6, full inventory)

Every command in `.github/workflows/ci.yml` is in this table, in CI order where it matters (CI has no gate beyond this list), plus `eval:workflows` (not in CI). Each ran alone, one after another.

| # | Command | Exit | Result |
|---|---|---|---|
| 0 | `corepack pnpm install --frozen-lockfile` | 0 | lockfile up to date, nothing changed (10 s). |
| 1 | `corepack pnpm lint` | 0 | **passed**: `✖ 30 problems (0 errors, 30 warnings)` across 18 files, the same count as the P4.3 record. The only file in that list this branch touched is `lib/security/rate-limit.test.ts`, whose four warnings (`_functionName`, `_params` at :117-118 and :200-201) predate the branch; its one added line carries none. |
| 2 | `corepack pnpm typecheck` | 0 | **passed**. Root `tsc --noEmit`, then `packages/{region,scoring,contracts,scan-engine}` each `Done`. |
| 3a | `corepack pnpm test` | **1** | **FAILED, not passed**: four files failed with `Test timed out in 5000ms`, each on its first test: `app/api/actions/[actionId]/versions/route.test.ts` ("saves a manual edit as v2 on top of v1 through the RPC"), `app/api/offers/[offerId]/promotions/route.test.ts` ("answers 404 before any lookup when the flag is off"), `app/api/packs/[packId]/route.test.ts` ("answers 404 when the flag is off, with neither the repository nor auth called") and `app/api/workspaces/[workspaceId]/packs/route.test.ts` ("answers 404 on GET and POST when the flag is not exactly true, touching nothing"). Root part: **350 files; 346 passed, 4 failed; 4,230 tests, 4,226 passed, 4 failed** (116 s). Because the script chains its stages with `&&`, `safe-media` and the packages did not run in this invocation. None of the four files is changed by this branch; all four were seen timing out under load in earlier P4.5 task runs. |
| 3b | The four failing files, **alone** | 0 | **passed**, 4 files / 58 tests (16 s). |
| 3c | The stages the chained script skipped, run separately | 0 | `lib/evidence/safe-media.test.ts` 1 / 62; `corepack pnpm -r test`: `packages/region` 3 / 23, `scoring` 16 / 183, `contracts` 3 / 20, `scan-engine` 28 / 299: all **passed**. |
| 3d | Total if every stage is counted once, all tests passing | — | **401 files / 4,817 tests** (350 + 1 + 3 + 16 + 3 + 28 files; 4,230 + 62 + 23 + 183 + 20 + 299 tests). The gate itself did not pass clean in the one full run made; recorded, not hidden. |
| 3e | The P4.5 unit files and the files it extended, in one run | 0 | **passed**, 14 files / 265 tests (listed under "Unit-test delta"). |
| 4 | `corepack pnpm test:secret-boundary` (literal) | **1** | **blocked**: it shells out to the Turbopack build and inherits #9 (`Turbopack build failed with 5 errors`, `Can't resolve '@radix-ui/react-dismissable-layer'`). |
| 5 | `corepack pnpm test:no-supabase` | 0 | **passed**: "No forbidden retired transport references; only the approved pinned Neon transitive library is permitted". |
| 6 | `corepack pnpm test:no-self-service-claim` | 0 | **passed**: "OWNER_SELF_SERVICE_CLAIM is not enabled." |
| 7 | `corepack pnpm db:verify` | 0 | **passed**: `0001`–`0013` applied, replay `[]`, **41 tables / 486 columns / 203 constraints / 106 indexes / 8 triggers / 20 functions**, `seededRows` 0, no deferred functions or triggers. Against the P4.3 record (40 / 477 / 198 / 102 / 8 / 18): +1 table, +9 columns, +5 constraints, +4 indexes, +2 functions (`claim_preview_slot`, `finish_preview_slot`). |
| 8 | `NEON_INTEGRATION=1 corepack pnpm test:integration` | 0 | **passed on the first run, no flakes: 47 files / 497 tests** (402 s). New over P4.3 (45 / 478): `neon-preview-events` (11) and `neon-preview-flag-off` (8). |
| 9 | `corepack pnpm build` (`next build`, Turbopack, the literal gate) | **1** | **blocked**: `Turbopack build failed with 5 errors`, each `Module not found: Can't resolve '@radix-ui/react-*'` (here `react-dismissable-layer`) raised from inside a `@radix-ui` package, import trace `@radix-ui/react-dialog` → `components/ui/sheet.tsx` → `components/product-ui.tsx` → `app/[locale]/owner/[workspaceSlug]/layout.tsx`. The same Windows-only local cascade recorded at P3, P4.4, P4.2 and P4.3, cause unconfirmed; the files in the reported trace are unchanged by this branch. |
| 10 | `corepack pnpm e2e` (literal) | **1** | **blocked**: the Playwright global setup failed, `Acceptance service not healthy: http://localhost:3100` (the Turbopack dev server cannot serve the owner shell), after 96 s. |
| 11 | `corepack pnpm e2e:acceptance` (literal) | **124** (stopped by timeout) | **blocked**: the first tests each failed with `Acceptance service not healthy` on the Turbopack dev server; the run was stopped at its 300 s limit (exit 124 from `timeout`) during test 4 of 42 rather than wait out the remaining timeouts. One owned fixture container the stopped run left behind (`sme-neon-it-db-479b7306555c`, labelled as an integration fixture, created inside the stopped run's window, with no other test process running) was removed with `docker rm -f`; no other container was touched. |
| 12 | `corepack pnpm eval:workflows -- --check-load` | 0 | **passed**: `load ok: 31 cases` (unchanged: this slice adds no corpus case). No key, no network call. |

**`--webpack` diagnostics (not the literal gates).** As at P4.4, P4.2 and P4.3, the blocked gates were repeated with webpack in place of Turbopack. They prove the code builds and behaves; they do not replace the Turbopack gates, and CI on `ubuntu-latest` is the real gate. The two temporary one-token edits (`"--webpack"` added to the build step of `scripts/assert-secret-boundary.mjs`, and to the `next dev` arguments in `test/e2e/environment.ts`) were each reverted with `git restore` straight after their runs (`git status` showed no change to either file afterwards) and are not committed.

| # | Diagnostic | Exit | Result |
|---|---|---|---|
| 9d | `corepack pnpm exec next build --webpack` | 0 | **passed**: `✓ Compiled successfully in 60s`, the TypeScript route-type check ran, and the route manifest includes `ƒ /[locale]/start/[slug]` and `ƒ /api/start/[slug]/preview`. |
| 10d | `test:secret-boundary` with `--webpack` | 0 | **passed**: `Secret boundary passed across 151 public artifacts.` (P4.3 record: 149). |
| 11d | `e2e` with `--webpack` | 1 | **30 passed, 1 failed** (2.4 min). The failure is `e2e/owner-shell.spec.ts:16`, `strict mode violation: getByRole('alert') resolved to 2 elements` (the page's `<p role="alert">` and Next's `#__next-route-announcer__`): the same diagnostic-only failure recorded at P4.4, P4.2 and P4.3, in a spec and files this branch does not touch. |
| 12d-1 | `e2e:acceptance` with `--webpack`, full suite, flag on (`PREVIEW_DRAFT_ENABLED=true` in `test/e2e/safety.ts`) | 1 | **37 passed, 5 failed** of 42 (23.8 min). Every failure is the sign-in handoff race recorded at P4.2 and P4.3: `signIn` in `test/e2e/fixtures.ts:41` timed out on `expect(page).toHaveURL(/\/en\/owner\/…/)` with the page still at `/en/owner/sign-in/complete?returnTo=…&method=email`. Failed: `report-dashboard.spec.ts:6`, **`report-scan-comparison.spec.ts:21`**, **`report-scan-metrics.spec.ts:22`**, and `returning-sign-in.spec.ts:7` (owner and viewer). `preview-draft.spec.ts` ("an unlocked viewer gets one unsaved reply draft"), `contextual-assistant.spec.ts`, `work-pack.spec.ts` and `public-funnel.spec.ts` passed. |
| 12d-2 | The four failing files **alone**, with `--webpack` (`playwright test --config playwright.acceptance.config.ts report-scan-metrics.spec report-scan-comparison.spec report-dashboard.spec returning-sign-in.spec`) | 0 | **5 passed** (3.9 min). |

**The two report specs that now render the preview card.** With the flag on in acceptance, `report-scan-metrics.spec.ts` and `report-scan-comparison.spec.ts` render "Try one AI reply draft (not saved)" for their signed-out unlocked viewer, which no earlier run had exercised (Task 5 review: the 375 px overflow and the console-diagnostics assertions had never run with the card present). Their results, explicitly:

- **Full run (12d-1): both failed, and not on the card.** Each failed at its later `signIn(page, environment, merchant, 'viewer')` step (`report-scan-metrics.spec.ts:113`, `report-scan-comparison.spec.ts:92`), the handoff race above. Every assertion before that step passed, including the viewer-state checks after the unlock at 375 px and 1440 px with the card on the page (`document.documentElement.scrollWidth <= window.innerWidth`, `report-scan-metrics.spec.ts:102`, `report-scan-comparison.spec.ts:85`). The console-diagnostics assertion (`expect(diagnostics).toEqual([])`, :123 and :102) comes after the sign-in step, so it was not reached in this run.
- **Alone (12d-2): both passed in full,** including the 375 px and 1440 px no-overflow checks with the card rendered and the final `expect(diagnostics).toEqual([])`: no `pageerror`, console warning or console error was collected (the two diagnostics files each spec writes were empty).
- So both specs have passed end-to-end with the card present, under the `--webpack` diagnostic. They have not been run under the literal Turbopack server on this machine (blocked, #11).

### The `apply-0013.sql` rehearsal

Recorded in full in the "Runbook — `apply-0013.sql`" section of the P4.5 part of `PHASE-4-REPORT.md`: seven checks (pre-grant refusal, two wrong-journal refusals, first run, `applyMigrations` reporting nothing pending, ownership and runtime access under `SET ROLE sme_app_runtime` including both **SECURITY INVOKER** functions, second-run refusal), run twice on a disposable `postgres:16` with identical results. Commands, in order: `docker run` of a `postgres:16` published on `127.0.0.1` only → create `neondb_owner` / `neondb`, `smeassistant_migrator`, `sme_app_runtime` → scratch script (outside the repository) → `applyMigrations(0001–0009)` as the migrator → `apply-0010.sql` and `apply-0011.sql` as `neondb_owner` → the wrong-journal check → `apply-0012.sql` → the remaining checks → `docker rm -f`. `corepack pnpm db:verify` is part of the gate run above and passes with `0001`–`0013`.

### `PREVIEW-METRICS.md` query check

Every query in `PREVIEW-METRICS.md` (seven) was run inside `BEGIN READ ONLY … ROLLBACK` against a disposable `postgres:16` (`127.0.0.1` only, removed afterwards) with `0001`–`0013` applied by the repository runner and synthetic rows: seven jobs, their grants, `generated`, `failed` (`invalid_output`, `stale`) and `refused` (`already_used`, `daily_limit`) events at fixed ages, two Google-verified claims (one before and one after the preview), one `workspace.assigned` audit row after the preview, and one attached job with no preview. Every query returned the counts the fixture implies: for example generated today 3 and yesterday 1; refusals `already_used` 1 and `daily_limit` 1; failures `invalid_output` 1 (US$0.0005) and `stale` 1; US$0.0045 and 3 slots in the last 24 hours; claim-after-preview 2 of 4 (50.0 %) with 1 attached before its preview; baseline 1 of 3 unlocked jobs without a preview attached (33.3 %). No hosted database was queried. The queries changed in the final-review fix wave (R11, R12) and were re-run; see "Final-review fix wave".

### Invariants

| Check | Result |
|---|---|
| `git diff 8582a7c..c57d87a --stat -- neon/migrations packages lib/agents/__snapshots__` | only `neon/migrations/0013_preview_events.sql`, 138 insertions: no `0001`–`0012` edit, no vendored-package edit, no agent-snapshot change. |
| Added SQL writes | four, all in `0013` and all to `public.preview_events` (two `insert`, two `update`). No added line outside tests names `actions`, `action_runs`, `output_versions`, `deliveries` or `workspace_usage`; the one added mention is the acceptance spec's `UNTOUCHED` list. |
| No text stored | `preview_events` has no text column for the review, reply or prompt; the acceptance journey's `json_agg` over the job's rows contains neither. |
| Flag off | `neon-preview-flag-off` records every statement against a schema stopping at `0012`: zero for the route (flag unset, `""`, `"false"`) and for the card decision, with a flag-on contrast (one `SELECT … FROM audit_jobs`, no write) so the recorder is not silent. |
| Functions | `claim_preview_slot` and `finish_preview_slot` are `SECURITY INVOKER` (`prosecdef = false`) with `search_path=""`, EXECUTE for `sme_app_runtime` only (`neon-preview-events` access test and the rehearsal). |

### Unit-test delta

| Measure | P4.3 record | This branch | Δ |
|---|---|---|---|
| App, excl. safe-media | 341 files / 4,081 tests | 350 files / 4,230 tests | **+9 files / +149 tests** |
| `lib/evidence/safe-media.test.ts` | 1 / 62 | 1 / 62 | 0 |
| `packages/region` / `scoring` / `contracts` / `scan-engine` | 3 / 23, 16 / 183, 3 / 20, 28 / 299 | identical | 0 |
| **Total** | **392 files / 4,668 tests** | **401 files / 4,817 tests** | **+9 files / +149 tests** |
| Integration | 45 files / 478 tests | 47 files / 497 tests | +2 files / +19 tests |

New unit test files (nine, 129 tests): `app/[locale]/start/[slug]/page.test.tsx` (7), `app/api/start/[slug]/preview/route.test.ts` (32), `components/preview/preview-draft-form.test.tsx` (42), `components/report-view.test.tsx` (4), `lib/preview/context.test.ts` (5), `eligibility.test.ts` (8), `flag.test.ts` (3), `input.test.ts` (11), `limits.test.ts` (17). Existing files extended (current totals): `app/[locale]/r/[slug]/page.test.tsx` (3), `lib/agents/agents.test.ts` (98), `lib/llm.test.ts` (11), `lib/security/rate-limit.test.ts` (15), `test/e2e/safety.test.ts` (9). New integration files: `neon-preview-events.integration.test.ts` (11), `neon-preview-flag-off.integration.test.ts` (8); `neon-schema`, `neon-catalog` and `neon-work-packs` were adjusted for `0013`. New acceptance spec: `e2e/acceptance/preview-draft.spec.ts`. All four vendored packages are byte-unchanged.

Line-ending hygiene: the two snapshot files Windows unit runs rewrite (`lib/agents/__snapshots__/agents.test.ts.snap`, `lib/pocket-assistant/__snapshots__/demo.test.ts.snap`) were restored with `git restore` and are not part of the commit.

### Not run

- **Hosted acceptance of any kind: NOT RUN.** No deployed request, no production Neon query, no hosted identity target.
- **The hosted migration** (DEC-11): `0013` was never applied outside owned local Docker Postgres.
- **A real-model evaluation of any kind** (DEC-04), including the visitor variant of the `review_reply` prompt.
- **The literal Turbopack `build`, `test:secret-boundary`, `e2e` and `e2e:acceptance`** on this machine (blocked, above); only their `--webpack` diagnostics ran, and the full acceptance suite did not pass clean in one invocation.
- **`corepack pnpm e2e:live`, `e2e:neon-auth`, `neon:readiness` and any hosted check**: need provider keys, a hosted identity target or a hosted database, none authorized.
- **Real mail, real Stripe, real model**: every test injects a fake.
- **P4.6.**

### Final-review fix wave

Findings (Important 1 and 2, R12, R13 and the ledger's "final wave" minors), the rulings R10–R13 and each change with its covering tests are in the "Final-review fix wave" subsection of the P4.5 part of `PHASE-4-REPORT.md`. Code commit `117ff00`; this documentation commit follows it. Gate re-runs, 2026-10-04 between 05:15 and 05:55 HKT, sequential, on `117ff00` (the code was identical to the working tree each gate ran on):

| # | Command | Exit | Result |
|---|---|---|---|
| F1 | `corepack pnpm exec vitest run lib/preview app/api/start components/preview "app/[locale]/start" "app/[locale]/r"` | 0 | **passed**, 9 files / 141 tests (Task 6 record for these files: 128; +13: `route.test.ts` 34 (+2), `context.test.ts` 8 (+3), `flag.test.ts` 4 (+1), `r/[slug]/page.test.tsx` 4 (+1), `start/[slug]/page.test.tsx` 7 (0, one case rewritten), `preview-draft-form.test.tsx` 48 (+6)). |
| F2 | `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-preview-events.integration.test.ts test/integration/neon-preview-flag-off.integration.test.ts test/integration/neon-schema.integration.test.ts test/integration/neon-catalog.integration.test.ts` | 0 | **passed**, 4 files / 40 tests (32.6 s). `neon-preview-events` is now 16 tests (+5). Red first: against the old `0013` the two new counting tests failed (2 of 16). |
| F3 | `corepack pnpm db:verify` | 0 | **passed**: `0001`–`0013`, replay `[]`, 41 tables / 486 columns / 203 constraints / 106 indexes / 8 triggers / 20 functions (unchanged: only a function body changed). |
| F4 | `corepack pnpm typecheck` | 0 | **passed** (root and all four packages). |
| F5 | `corepack pnpm lint` | 0 | **passed**, `✖ 30 problems (0 errors, 30 warnings)`, unchanged. |
| F6 | `corepack pnpm test` | **1** | **Not a clean pass:** the root part ran 350 files / 4,243 tests, 4 failed, all known load-timeout files on their first test: `tests/scan-claim-single-path.test.ts`, `tests/scan-events-single-writer.test.ts`, `lib/identity/identity-sdk.test.ts` and `app/api/versions/[versionId]/versions.test.ts` (none touched by this wave). The chained stages did not run in that invocation. |
| F6b | The four files alone | 1, then 0 | First rerun: 3 of 4 files failed again (timeouts, the machine busy); **second rerun: 4 files / 28 tests passed**. |
| F6c | `vitest run lib/evidence/safe-media.test.ts && corepack pnpm -r test` | 0 | **passed**: `safe-media` 1 / 62; `region` 3 / 23, `scoring` 16 / 183, `contracts` 3 / 20, `scan-engine` 28 / 299. Total counted once, all passing: **401 files / 4,830 tests** (Task 6: 401 / 4,817; +13, no new file). |
| F7 | `corepack pnpm exec playwright test --config playwright.acceptance.config.ts preview-draft.spec` (literal Turbopack) | 1 | **blocked**: `Acceptance service not healthy` (`Module not found: Can't resolve '@radix-ui/react-dismissable-layer'` in `test-results/fixture-next.log`), the local cascade (#9 above). |
| F7d | The same with a temporary `--webpack` added to the `next dev` arguments in `test/e2e/environment.ts` (restored with `git restore`; `git status` clean for the file) | 0 | **passed, 1 / 1** (1.8 min), including the `toMatch(/\S/)` body check. A diagnostic, not the literal gate. |
| F8 | `apply-0013.sql` regeneration | — | the Task 6 scratch generator, re-run, produced a file byte-identical (`cmp`) to the committed one: 11,784 bytes, embedded 0013 6,658 bytes, row 13 checksum `98ec68e18a5281885ac12497af8328c3c7300ce7adfd1869f74f62912160cf24` (= `sha256sum` of the committed migration). |
| F9 | `apply-0013.sql` rehearsal (the Task 6 scratch script, with R11 runtime checks added) | 0, 0 | run twice, identical JSON: pre-grant refusal 42501; `apply-0010`/`0011`; journal-0011 refusal; `apply-0012`; altered-checksum refusal (no table after rollback); first run applied with its two notices; journal 1–13 matches `loadMigrations()`; `applyMigrations` → `[]`; ownership, RLS, policy, grants, `SECURITY INVOKER` functions; as `sme_app_runtime`: a grant's fourth attempt after three failures → `already_used`, `daily_limit` at `p_global_daily` 4 with four non-refused rows, allowed at 5; cascade; second run refused. Every refusal left the catalog snapshot unchanged. |
| F10 | `PREVIEW-METRICS.md`, all seven queries, `BEGIN READ ONLY … ROLLBACK`, on a fresh disposable `postgres:16` fixture (`0001`–`0013` by the repository runner) | 0 | every count matched the fixture: 5 jobs with a generated preview; `slots_finished` 8 and `still_claimed` 1 today, `slots_finished` 1 for the 30-hour-old row; refusals `already_used` 1, `daily_limit` 1; failures `facts_needed` 1 (US$0.0010), `no_output` 1 (US$0.0013), `stale` 1; last 24 h US$0.0443 and 9 slots (`claimed` 1 + `generated` 5 + `failed` 3; the US$0.50 row 30 h old is outside); claim-after-preview: 5 jobs, `excluded_attached_before_preview` 1, `excluded_attach_unrecorded` 1, `eligible_jobs` 3, `claimed_after_preview` 2 (one by a claim event, one by `workspace.assigned`), **66.7 %**; baseline 1 of 3 (33.3 %). The fixture was stopped afterwards. |

Line-ending hygiene: the two snapshot files Windows unit runs rewrite were restored with `git restore` and are not part of any commit. Not re-run in this wave: the full `test:integration` suite, `build`, `test:secret-boundary`, `test:no-supabase`, `test:no-self-service-claim`, `eval:workflows` and the full `e2e` and `e2e:acceptance` suites; the Task 6 records above stand for them. The older `sme-neon-it-db-*` containers on this machine (created 2026-09-12 to 2026-10-03) predate this session and were not touched. Nothing was applied to a hosted database, deployed or pushed.
