# Phase 4 report

Phase 4 of the owner-platform plan (Master Plan §7). One slice is built so far: P4.4. P4.1, P4.2 and P4.3 have not been started, and P4.5 and P4.6 are deliberately not built.

## P4.4 — reusable workflow contract

**Branch** `p4-growth-platform`, final HEAD = the final-review documentation commit on top of `0debe06`: 22 commits (`dc457ec`..HEAD) on top of base `c042b20`. The task-by-task record and the "Verification" table below are at `a5a2211` (14 commits); the final-review fix wave and its gate re-runs are in "Final-review fix wave" at the end. Base `c042b20` (`origin/main`, PR #26). Worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p4-growth-platform`. Node `v24.18.0`, pnpm `9.12.0` via corepack, Windows 11 Pro 10.0.26200, Docker Server `29.7.2`. Gates run 2026-10-01.

Built from `docs/superpowers/plans/2026-09-30-workflow-contract.md` (Tasks 1–8) against the design in [`docs/superpowers/specs/2026-09-30-workflow-contract-design.md`](../../superpowers/specs/2026-09-30-workflow-contract-design.md).

**Implemented and locally verified. Nothing here is hosted-verified.** There is **no migration**: the journal is still `0001`–`0010`, and `git diff origin/main --stat -- neon/migrations lib/agents/__snapshots__` prints nothing. Nothing was applied to a hosted database, deployed or pushed, and no paid provider was called.

### What this closes

Master Plan §7 P4.4: one typed internal definition per workflow (capability, owner outcome, permitted template and agent, required confirmed facts, evidence resolver, output validation, delivery unit, expected measurement, failure handling), with authorization, SQL approval/export and provider permission checks kept where they are, and a fixed regression corpus kept separate from any authorized real-model evaluation.

Before this slice the definition was spread over four tables nothing forced to agree (`TEMPLATES`, `AGENTS`, `CAPABILITIES`, `TEMPLATE_METRIC`). Required inputs were **not enforced on the server at run time** except the one social-post special case: a run missing a confirmed fact still called the model, which was merely asked in a guardrail line to report the gap in `facts_needed`. A model that ignored that line invented the fact, and the run was paid for. The assistant draft path had the same gap.

### Slice order

The user chose the Phase 4 order on 2026-09-30: **P4.4 contract → P4.1 offers and promotion copy → P4.2 work packs → P4.3 contextual assistant.** The contract goes first so the later slices add workflows on top of it. P4.5 (preview) and P4.6 (publishing) stay unbuilt and off.

### Decisions (user, 2026-09-30)

| Question | Decision |
|---|---|
| Where the contract lives | Extend the template table in place: `ActionTemplate` becomes `WorkflowDefinition` (with `ActionTemplate` kept as an alias). No second registry that could drift. |
| Gate strictness | Typed input kinds per template: `confirmed_fact` and `evidence` block while missing, `preference` never blocks. Only real facts stop a run. |
| Delivery unit | `deliveryUnit` admits only `"approved_version"` (DEC-14 safe default). SQL counting is untouched. |
| Real-model evaluation | Built, not run (DEC-04). |
| `gbp-post` metric | Recorded as an open question, not changed. |

### Planning revision

The spec's first draft had an `anyOf` group for the FAQ's three owner facts and an `unanswered_fact_answered` acceptance check. **Both were dropped during planning** (commit `2ffeb3f`): the FAQ prompt writes exactly three entries and returns an empty body plus `facts_needed` when any fact is missing, so a gate satisfied by fewer than three facts would still pay for a model call that ends in `needs_input`, and letting the owner answer only some questions would need a prompt change this slice rules out. Every owner fact is an individual `confirmed_fact`. The spec was corrected in the same commit.

### What changed, by task

Full diff against base: 66 files before this documentation commit, 2,666 insertions, 90 deletions.

| Task | Commit(s) | What it did |
|---|---|---|
| Design and plan | `dc457ec`, `2ffeb3f` | The spec, then the plan (and the spec's FAQ correction). |
| 1. Workflow contract fields and contract tests | `3914b7e` | `WorkflowDefinition` in `lib/workspace/templates.ts` gains `outcome`, `inputs` (typed `confirmed_fact` / `evidence` / `preference`), `deliveryUnit`, `measurement` (the `TEMPLATE_METRIC` values move here; `measurements.ts` derives `TEMPLATE_METRIC` from `TEMPLATES`) and `failure`. `requiredInputs` is kept and a test pins it equal to `inputs` keys. `lib/workspace/templates.contract.test.ts` (80 tests): agent/capability mapping, no publishing, inputs, triggers, delivery and measurement, no-authority keys, every agent in use. Server-side agent choice is **not** a contract test: the suite's header points at the existing `runs.test.ts` case ("refuses a registered agent that is not this action template's own agent"), which is where that rule is tested. `EVIDENCE_INPUT_KEYS` is exported from `lib/workspace/evidence-inputs.ts`; `ACTION_INPUT_KEYS` from `lib/copy-workspace.ts`. |
| 2. `missingConfirmedInputs` and `blockingInputs` | `4e7e8ba` | `lib/workspace/workflow-inputs.ts` (pure, no I/O, no clock): blank and whitespace-only strings are missing, non-string values (`true`, `["k"]`, `0`) are present, result ordered by `inputs` order. `buildActionOverview` gains `blockingInputs` (exposed, not yet displayed). 10 tests. |
| 3. Pre-model gate in `runAgentForAction` | `f30362a`, fixed by `acf5927` | A run missing a confirmed fact now ends through `persistence.finish({ output: null, factsNeeded })` with zero `llmComplete` calls and `costUsd` for zero usage; the action goes to `needs_input`, no version is created. The inline social-post branch is replaced by the same gate. The P3.5a budget check still precedes evidence reads. The gate reads the **template**, not the row's persisted `required_inputs`, so legacy rows are covered. `test/e2e/seed.ts` and two integration fixtures were updated to carry scanned review evidence (the seed change was reverted in the final-review fix wave; see below). |
| Gate helper | `9386dcc` | The satisfier-authoritative filtering moved into one helper (`gateBlockingInputs`) used by the run, the overview and the assistant, so the three can never disagree (see the second ruling below). |
| 4. Pre-model gate in assistant drafts | `84ff273` | `lib/assistant/live.ts` runs the same gate **before** `checkAiBudget`: missing facts return the existing `NEEDS_FACTS` answer with no `action_runs` row and no model call. Assistant FAQ drafts read only `action.row.provided_inputs`, with no brand-fact prefill (unlike the run path). |
| 5. `unexpected_link` and `unconfirmed_claim` acceptance checks | `964e6eb`, fixed by `031d9bc` | Shared checks composed in `defineAgent`, so every agent runs them with no duplicate warnings and agents lose their direct prohibited-term calls. Both are warnings, not blocks: the owner reviews before approval. The superlative regex is reachable for `#1`, and link matching is CJK-safe so an owner's own link in a zh draft does not warn. |
| 6. Regression corpus and its runner | `d51a5e4`, fixed by `3dfebe7` | `test/corpus/workflows/` (23 fixed JSON cases across the seven Master Plan categories) and a harness that runs each through the real pipeline with an injected fake LLM and canned outputs. Coverage assertions fail if a category falls below its minimum or a Live workflow with an agent has no case. 27 tests. A bad corpus file is named in the error. |
| 7. Opt-in real-model evaluation, refused by default | `4f55dc0`, fixed by `a5a2211` | `scripts/eval-workflows.ts`: refuses with exit 2 unless `EVAL_LIVE=1`, a key resolves and `--budget-usd` is positive; stops before the budget would be passed, fail-closed on unknown cost; writes git-ignored `eval-results/`. `--check-load` proves the live path loads under `tsx` without a key. `scripts/tsconfig.eval.json` aliases `server-only`; four production imports moved to package source subpaths so the script can load (see the rulings). 14 tests. |
| 8. Full gates and phase documentation | this commit | The gate run, the invariants, this report, `PHASE-4-TEST-RESULTS.md`, a traceability P4.4 row, and the stale migration name in the `lib/workspace/versions.ts` comment corrected to `neon/migrations/0004_atomic_operations.sql`. |

### Behaviour change for owners

**A run, or an assistant draft, that is missing a confirmed fact or scanned evidence now stops before the model and costs nothing.** The action moves to `needs_input` and the owner is told which facts are missing; no draft version is created and no AI spend is recorded. Previously the model was called anyway and could invent the missing fact. Concretely:

- an `ig-bio` run needs a call-to-action link and an approved claim (brand-resolved claims count);
- a `visibility-content` (FAQ) run needs all three owner facts;
- a `menu-translation` run needs the menu items;
- a `review-response` run needs a review to reply to: a scanned review without a reply, **or** review text the owner typed (the prompt uses typed text only when the scan kept no unanswered review, and labels it owner-supplied). *Corrected in the final-review fix wave: an earlier ruling refused typed text, which left this supported flow in a `needs_input` loop.*
- a `social-post` run needs an approved asset or the explicit text-only choice (unchanged in effect, now through the shared gate).

`preference` inputs (brand voice, language, channel, alt text) never block; a run with only those missing still calls the model. Nothing about approval, export, usage counting, authorization or SQL changed.

### Rulings, known limits and open questions

#### Rulings taken while building (from the execution ledger)

- **Pre-flight, Task 1:** the Files list includes `lib/workspace/evidence-inputs.ts` for `EVIDENCE_INPUT_KEYS`, because the Interfaces block mandates it.
- **Pre-flight, Task 5:** shared checks are composed inside `defineAgent` (`acceptance = dedupe([...sharedAcceptance, ...spec.acceptance])`) and agents drop their direct `prohibitedTermHits` calls. It is the only way every agent, including those without their own acceptance, runs the checks without duplicate warnings.
- **Pre-flight, Task 6:** the harness injects `assets: { get: async () => null }`, keeping the corpus database-free; asset-backed social cases are covered by `runs.test.ts`, not the corpus.
- **Task 3 review (evidence half REVERSED by the final review, see "Final-review fix wave"):** keys with a server satisfier (`asset_or_text_only`, and every `evidence`-kind input) are **satisfier-authoritative**. They are removed from `provided` before `missingConfirmedInputs`, so a persisted `asset_or_text_only` marker cannot bypass the approved-asset check and owner-typed text cannot satisfy an evidence input. If wrong, an owner who typed review text on a legacy row with no scanned reviews is blocked, which is correct under guardrail 14.
- **Task 3 review:** `satisfiedInputs` and `missingConfirmedInputs` run above `persistence.queue`, and only the blocking `finish` follows `start`. This matches P3.5a "a refusal leaves nothing behind" and means a satisfier I/O error cannot strand a started run.
- **Task 3 review (superseded by the final review):** an e2e or acceptance seed that relies on a provided `reviews_without_response` string with no scanned reviews gets scanned reviews added to the fixture, rather than the gate relaxed. (Applied to `test/e2e/seed.ts` and the two integration fixtures; the seed change is reverted in the fix wave, the integration fixtures keep their review because their actions carry no typed text.)
- **After Task 3:** the satisfier-authoritative filtering lives in one shared helper in `lib/workspace/workflow-inputs.ts` used by the run, the assistant and the overview. Otherwise the assistant would reopen Task 3's critical finding and the overview would show "no blocking inputs" where the run blocks.
- **Task 5 review:** both plan-mandated regexes were fixed (the `#1` alternative was unreachable behind `\b`; the link character class swallowed CJK text and full-width punctuation, so the owner's own link warned in zh drafts). The spec's intent is to flag superlatives and foreign links, and zh-HK is the default locale; advisory only.
- **Task 5 review:** `providedInputs` non-string values join the confirmed text through the same `asText` as `brand.facts`, removing a false `unconfirmed_claim` on array or number inputs.
- **Task 7 review:** the tsx-load fix is `scripts/tsconfig.eval.json` aliasing `server-only` (the `react-server` condition broke React) plus a deep import of `isSensitiveQueryName` from the scan-engine source file in `lib/report/sanitize-proof.ts` and `lib/evidence/load-authorized.ts`, and a key-free `--check-load` mode. A "built, not run" script that cannot load is not built.
- **Task 7 review:** a model result with no usage stops the run fail-closed with reason `cost_unknown`, and each call is pre-flighted against a worst-case estimate (`computeCostUsd({ inputTokens: prompt.length, outputTokens: AGENT_LLM_OPTIONS.maxTokens })`), because the spec says the run stops before the budget is passed.
- **Task 7 review:** `EvalReport` gains `promptVersions` (agent key → prompt version); the spec lists prompt versions explicitly and the brief's interface omitted them.
- **Task 7 acceptance:** the implementer's deviation was accepted: four production imports (`lib/report/sanitize-proof.ts`, `lib/evidence/load-authorized.ts`, `lib/workspace/evidence-inputs.ts`, `lib/workspace/templates.ts`) moved to package source subpaths. They are the same bindings, and the deep-subpath pattern already exists at `lib/workspace/metrics.ts:3`. **Verified in this task:** `next build --webpack` compiles with them, and the `--webpack` secret-boundary diagnostic passes across 139 artifacts. The literal Turbopack `build` and `test:secret-boundary` remain blocked by the Windows-only `radix-ui` cascade, which is unrelated to these imports; CI is the first Turbopack evidence.

#### Deferred minor findings (not acted on in this slice)

Grouped from the task-by-task reviews; the ledger is `.superpowers/sdd/2026-09-30-workflow-contract/progress.md`.

- **Contract test strength (Task 1):** the `TEMPLATE_METRIC` derivation test is near-tautological (pin a literal 12-entry map); nothing pinned each row's input kinds to the spec table, so a mis-tagged `preference` would pass (**fixed in the final-review wave, `acb3670`**); `DEFAULT_FAILURE` is one shared object reference across rows (`as const`, harmless); `EVIDENCE_INPUT_KEYS` is an alias of `SERVER_RESOLVABLE_INPUT_KEYS` (two names, one list).
- **Display versus gate (Tasks 2 and 4):** `overview.ts` `missingInputs` treats `"   "` as present while `blockingInputs` trims, so the two lists can disagree for whitespace-only values (`missingInputs` deliberately unchanged); `blockingInputs` over-estimates because it has no asynchronous asset satisfier and list pages lack `scanSatisfiedInputs`, so this must be documented or fixed before P4.3 renders it; `overview.test.ts` lacks cases for `scanSatisfiedInputs` removing a blocking key and for an unknown `template_key` returning `[]`.
- **Fail-open edges (Task 4; the fail-open and the missing `live.test.ts` case were fixed in the final-review wave, `4c58de7`):** `live.ts` `template ? gate : []` failed open if a `DRAFT_AGENTS` template key stops resolving (use `templateByKey` or add a resolve test); `live.ts` duplicates `asRecord(provided_inputs)`; `SERVER_SATISFIED_INPUT_KEYS` is exported without a consumer; there is no `live.test.ts` case for `draft_review_reply` blocked on `reviews_without_response` with no scanned reviews (only the Neon integration fixture covers it, and it passed in this run).
- **Persisted text-only marker (Tasks 3 and 4, pre-existing; fixed in the final-review wave, `29a937f`):** the action-detail UI persists `asset_or_text_only = "text_only"` but sends `text_only: true` only in that run's inputs, and `socialAssetSatisfied` accepts only `text_only === true`. A later regenerate without inputs is blocked by the server asset check, and the assistant social draft answers `NEEDS_FACTS` after an owner chose text-only. This predates the slice and is now more visible.
- **Seed and reconciliation (Task 3):** `test/e2e/seed.ts` inserts a done `audit_jobs` row with `workspace_id` and no `workspace_scan_completions` row, so `reconcileWorkspaceScans` would post-process it if an acceptance run hit the cron dispatch or the internal completion route. `e2e:acceptance` passed 38/38 in this run without hitting that path, so it is latent, not observed.
- **Acceptance-check precision (Task 5):** price confirmation is a bare digit-run substring (phone or year digits can confirm a price); CJK superlatives without a tail (`第一次`) false-positive (**fixed, `85fda81`**); the "exactly once" test is vacuous under `Set` dedupe; coverage gaps (negative schema.org, `最好`/`得獎`, `元`/`蚊`, `NT$`/`HKD`, clause-cut, a review quoting a reviewer's URL or price); a quadratic worst case on `\d[\d,.]*\s?(?:元|蚊)` (bounded by `maxTokens`); a CJK character in a URL path truncates the match (lenient, never a false warning).
- **Corpus (Task 6):** the harness uses `as unknown as` casts on its fake repository (matches `runs.test.ts` style); `malicious_review-01` and `-03` do not assert the injected text sits inside the fence; `uncertain_evidence-02` catches review text leaking into the generic evidence, provided or action blocks but not a `sampledReviews`-only leak (`gbp-post` never renders `sampledReviews`).
- **Evaluation script (Task 7):** `lib/llm.ts:143` `console.error(err)` may print `host:port` from a network error cause on the live path; the pre-flight estimate fell back to 0 when pricing is unconfigured (**fixed, `acb3670`**: the call is now refused up front with `cost_unknown`).
- **Observed e2e failure, cause not confirmed on base:** under the `--webpack` diagnostic dev server only, `e2e/owner-shell.spec.ts:16` failed because `getByRole("alert")` resolved to two elements (the page's `<p role="alert">` and `#__next-route-announcer__`). It is *inferred*, not confirmed, that this is independent of this branch: `e2e/owner-shell.spec.ts`, `components/sign-in-page.tsx`, `app/[locale]/owner/sign-in/` and `proxy.ts` (`git diff c042b20 --stat -- e2e components/sign-in-page.tsx "app/[locale]/owner/sign-in" proxy.ts` is empty) are byte-identical to `c042b20`, but the spec was never run on `c042b20`, and the failure was not seen under the gate runner (which cannot start here). Earlier phases recorded e2e passing in CI. Reported in `PHASE-4-TEST-RESULTS.md` ("e2e detail"); not changed.

#### Open questions (recorded, not resolved here)

- **`TEMPLATE_METRIC["gbp-post"] = "gbp.days_since_last_review"`.** A Google Business post does not change review recency, so a measurement row for an exported GBP post may attribute or observe a change the action could not have caused. This slice moved the value into `measurement` unchanged. Changing it alters measurement semantics and the meaning of existing `action_measurements` rows, so it needs its own decision: map it to `null`, or to a posts metric if the scan ever measures one.
- **`review-request.channel` is classified `preference`.** The draft is written for WhatsApp, LINE or a QR card when no channel is given. If the owner wants the channel to be a hard choice, it is a one-row reclassification in the template table.

### Not run / blocked

- **The real-model evaluation: not run.** Blocked by DEC-04 (provider and generation spend). `scripts/eval-workflows.ts` is built and its refusal (exit 2) and `--check-load` (`load ok: 23 cases`) were exercised; `EVAL_LIVE` was never set and no key supplied. The corpus proves the **pipeline** handles each behaviour with canned outputs; it does not show how any model behaves.
- **P4.1, P4.2 and P4.3: not started.** They follow in their own specs, on this contract.
- **P4.5 (preview) and P4.6 (publishing): not built**, blocked by DEC-12 and DEC-13, which are not authorized. The contract admits no `publish` delivery and a test pins it.
- **DEC-14 (delivery units for multi-output promotions and packs): open;** its safe default applies, `deliveryUnit` is `"approved_version"` only, and `export_output_version` counting is unchanged.
- **Literal `build`, `test:secret-boundary` and `e2e` on this machine:** blocked by the Windows-only Turbopack `radix-ui` cascade, as at every prior phase. The `--webpack` fallback build passed, and the `--webpack` secret-boundary and e2e diagnostics ran (30/31 and 38/38; the one failure was seen only under the diagnostic server, and is inferred, not confirmed on base, to be independent of this branch). CI on `ubuntu-latest` is the real gate. Nothing in the three diagnostics is claimed as a pass of the literal command.

### Verification

Full detail is in `PHASE-4-TEST-RESULTS.md`. One line per gate, run 2026-10-01 at `a5a2211`:

| Command | Result |
|---|---|
| `corepack pnpm typecheck` | **passed**, exit 0. |
| `corepack pnpm lint` | **passed**, exit 0, `0 errors, 30 warnings` (the same 30 as the P3.5c record). |
| `corepack pnpm test` | **passed**, 366 files / 4,085 tests, first run, no timeouts (P3.5c record: 362 / 3,885). |
| `corepack pnpm build` | **blocked** (Windows Turbopack `radix-ui`); `npx next build --webpack` **passed**. |
| `corepack pnpm test:secret-boundary` | **blocked** (same cause); `--webpack` diagnostic copy **passed**, 139 artifacts. |
| `corepack pnpm test:no-supabase` / `test:no-self-service-claim` | **passed** / **passed**. |
| `corepack pnpm db:verify` | **passed**, 0001–0010, replay empty, 37 tables / 444 columns unchanged. |
| `NEON_INTEGRATION=1 corepack pnpm test:integration` | **passed**, 39 files / 399 tests, first run. |
| `corepack pnpm e2e` | **blocked** (same cause); with a temporary `--webpack` dev server **30 passed, 1 failed** (`owner-shell.spec.ts:16`, seen only under the diagnostic server; its files are byte-identical to base, never run on base). `e2e:acceptance` the same way: **38 / 38 passed**. |
| `eval:workflows -- --budget-usd 1` / `-- --check-load` | refused, exit **2** / `load ok: 23 cases`, exit 0. |
| Invariants | `neon/migrations` and `lib/agents/__snapshots__` diff empty; no `task:` prompt line changed. |

### Final-review fix wave

The final whole-branch review (`c042b20..1c24773`) returned one critical, two important and eight minor findings. All eleven were fixed in one wave, in five code commits on top of `1c24773` plus this documentation commit: `4c58de7`, `85fda81`, `29a937f`, `acb3670`, `0debe06`. No migration, no vendored-package edit, no prompt text change (`lib/agents/__snapshots__/agents.test.ts.snap` is byte-identical to `c042b20`).

**Ruling reversed.** The Task 3 ruling made every `evidence`-kind input satisfier-authoritative, so owner-typed `reviews_without_response` could never satisfy `review-response`. The final review showed that this contradicts spec §2 (`missingConfirmedInputs` returns keys "neither in satisfied nor present in provided") and creates a dead loop in a supported base flow: the unchanged `review_reply` prompt uses owner-typed reviews only when the scanned sample is empty and labels them owner-supplied, derivation returns the action to `needs_input` when the scan kept no unanswered review, and the action page renders a textarea for exactly that text. The controller **reversed** the ruling for evidence keys: a present `provided` value satisfies them again. Satisfier authority stays only for `asset_or_text_only`.

| Finding | Fix | Commit |
|---|---|---|
| C1 owner-typed review text dead loop | `gateBlockingInputs` strips only `asset_or_text_only`. `workflow-inputs`, `runs` and `live` tests flipped to "passes and calls the model"; a no-typed-text, no-scanned-review case still blocks with zero calls (unit, live, corpus `uncertain_evidence-03`). Corpus `uncertain_evidence-04` now calls the model once and creates a version. `test/e2e/seed.ts` restored to base. The two Neon integration fixtures **keep** their scanned review: their actions carry no typed text, so any pre-model gate needs it; restoring base `raw_data` failed 19 integration tests under the corrected gate, so they were not "added only to satisfy the strict rule". Comments corrected. | `4c58de7` |
| I2 new warnings mislabelled | `unexpected_link` and `unconfirmed_claim` are `GuardrailCode`s; `guardrailText` takes the locale and gives each a zh-HK (審批) / zh-TW (核准) / en sentence. | `29a937f` |
| I3 `unconfirmed_claim` false positives | Bare `best` dropped (phrases `the best`, `best in`, `best-selling` kept); CJK `最佳\|首選\|得獎\|第一(?!次)`; prices and superlatives are also confirmed by the sampled review text and the evidence block. **Scope note:** the link check keeps owner-confirmed text only, because counting review text would let a link injected by a review pass (`malicious-review-evil-link` would fail); a new test pins that. | `85fda81` |
| M1 empty collections | `isPresent` treats `[]` and `{}` as missing; `POST /run` with `menu_items: []` or `{}` blocks. | `4c58de7` |
| M2 assistant gate fails open | `templateByKey` (throws) replaces `findTemplate`; `DRAFT_AGENTS` keys typed `TemplateKey`; a test resolves every key. | `4c58de7` |
| M3 timeout-shaped provider failure | Corpus `provider_failure-03`: the model call rejects; one call, run `failed`, reason `action_run_failed`, no version. Schema gains a `{ throws }` canned entry and `expect.reason`. The harness has no version store, so "prior draft untouched" is asserted as "the failing finish carries no output". | `acb3670` |
| M4 documentation overclaims | Agent-choice rule described as tested in `runs.test.ts` (the contract suite only points there); traceability warning claim tied to `29a937f`; evidence-gate rows corrected for the reversal; state-vocabulary note on the Phase 4 section; headers updated. | this commit |
| M5 deep imports unexplained | One-line why on each of the four `src/` subpath imports. | `0debe06` |
| M6 unpriced eval pre-flight | A null estimate refuses the call up front, halts, notes `cost_unknown`, fails the case, zero spend; `EvalDeps.costUsd` injectable for the test. | `acb3670` |
| M7 input kinds unpinned | `templates.contract.test.ts` pins every row to a literal copy of the spec table; re-tagging `ig-bio.cta_link` to `preference` was shown to fail. | `acb3670` |
| M8 text-only not persisted | The input form persists `text_only: true` beside `asset_or_text_only: "text_only"` (`ownerInputPatch`, unit tested); `socialAssetSatisfied` unchanged. | `29a937f` |

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
