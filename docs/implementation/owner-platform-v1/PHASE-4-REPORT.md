# Phase 4 report

Phase 4 of the owner-platform plan (Master Plan §7). Three slices are built so far: P4.4 (reusable workflow contract), P4.1 (confirmed offers and promotion copy) and P4.2 (work packs: the visibility starter pack). P4.3 has not been started, and P4.5 and P4.6 are deliberately not built.

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

## P4.1 — confirmed offers and promotion copy

**Branch** `p41-offers`, base `dc55e02` (`origin/main`, PR #27, the merged P4.4 slice). Spec commit `d3ecd5f`, plan `5cb3256`, implementation commits `9eaf60f`..`31970f9` (12 commits, listed below), then the Task 11 documentation commit `9ac1977`, then the final-review fix wave (four code commits and one documentation commit; see "Final-review fix wave" at the end of this section). Committed diff before this commit: 92 files, 8,623 insertions, 67 deletions (two of the files are the spec and the plan). Worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p41-offers`. Node `v24.18.0`, pnpm `9.12.0` via corepack, Windows 11 Pro 10.0.26200, Docker Server `29.7.2`, `postgres:16` (server 16.15). Gates run 2026-10-02.

Built from `docs/superpowers/plans/2026-10-01-offers-promotion-copy.md` (Tasks 1–11) against the design in [`docs/superpowers/specs/2026-10-01-offers-promotion-copy-design.md`](../../superpowers/specs/2026-10-01-offers-promotion-copy-design.md).

**Implemented and locally verified. Nothing here is hosted-verified.** One new migration, `neon/migrations/0011_offers.sql`, exists and has been applied **only** to owned, disposable local Docker Postgres fixtures (`db:verify`, `test:integration`, and the `apply-0011.sql` rehearsal). Nothing was applied to any hosted or Neon database, nothing was deployed or pushed, no paid provider or real model was called, and no mail was sent. The feature is behind `OFFER_PROMOTIONS_ENABLED`, which defaults off.

### What this closes

Master Plan §7 P4.1 (source E1): an `offers` model, where owner-confirmed offer facts (title, details, terms, price and currency, validity, claims and prohibited wording, optional rights-cleared photo) stay distinct from generated variants, and channel-specific **text** drafts are built through the existing path: action → run → immutable version → exact approval → export. The delivery unit is stated before generation. "A changed source offer never mutates an immutable prior output" is enforced in SQL: a draft written from an offer that has since changed, closed, expired or been archived can be neither approved nor exported.

Before this slice there was no offer model at all (no table, schema, route or page), and the `social_post`, `gbp_post` and shared guardrail prompts forbade inventing prices and offer dates, so an owner could not promote a real offer with any grounding.

### Decisions (user, 2026-10-01)

| Question | Decision |
|---|---|
| Channels in this slice | **Instagram post and Google Business post**: two drafts per offer. No WhatsApp/LINE message, because no sender exists. |
| How drafts are generated | **Two new template rows and one new `promotion_copy` agent**, which takes its channel from the template. The `social_post` and `gbp_post` prompts, snapshots and measurements stay untouched. |
| A draft whose offer later changed or expired | **Approve and export are refused**, enforced in SQL, with a reason the owner can act on (generate a new draft). |
| Who manages offers | **Owners, and managers for the locations in their scope.** Workspace-wide offers are owner-only. Viewers can read. |
| Delivery unit | The DEC-14 safe default, unchanged: each approved version counts once, on its first export. Two channel drafts are two deliveries if both are approved and exported. This is shown before generation. |

### Spec corrections

**§1.3 (made during the build).** Spec §1.3 said `createVersion` in `lib/workspace/versions.ts` is "the only writer" of version meta. That was wrong: an agent run writes its version through `finish`, which does not go through `createVersion`. Both converge on **`artifactRepository.createOutputVersion`**, so the revision-binding rule lives there. The spec sentence was corrected in the Task 6 commit (`4117750`). Without that, a run's version would have been the one path with no recorded revision, and so permanently stale.

**§6 (made in the final-review fix wave, Ruling R14).** Spec §6 said deploying the code before `0011` is applied is "inert". That was false: the shared action queries (`ACTION_COLUMNS` in `lib/repositories/workspace-read.ts`) and the version gateway (`artifactRepository.createOutputVersion`) select `actions.offer_id` unconditionally, so this code against a database without `0011` fails every action read and version write. R14 kept the unconditional reads and corrected the rollout order instead: apply `0011` (test branch, then production) **before** deploying, deploy with the flag unset, then set `OFFER_PROMOTIONS_ENABLED=true` and redeploy. §6 now says so, and its rollback bullet states exactly what turning the flag off stops and what stays (F4, below).

**§2.3 and §3.1 (final-review fix wave).** §3.1's PATCH bullets now describe the no-op save (F5) and the cancel-on-relocation rule (F1), and its `/promotions` bullet the scope re-check on the offer as read (F2); §2.3 now says the assistant's draft intents refuse an offer action (F6), where it used to describe a rewrite path drafting on one.

### What changed, by task

| Task | Commit(s) | What it did |
|---|---|---|
| Design and plan | `d3ecd5f`, `5cb3256` | The spec, then the plan. |
| 1. Migration `0011_offers.sql` | `9eaf60f` | `public.offers` (title/details/terms/price/currency/dates/claims/prohibited terms/asset/status/revision/confirmation, CHECKs for every limit, RLS + `server_application` policy + `sme_app_runtime` grants), `actions.offer_id` (`NO ACTION` FK, so deleting a workspace still cascades but deleting an offer a live action points to fails), `offer_is_expired(date, uuid)` (workspace-local date, unknown workspace fails closed), `confirm_offer` and `archive_offer` (all `SET search_path TO ''`, `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE … TO sme_app_runtime`). Drizzle schema, `db:types`, catalog and schema tests. |
| 2. Approve and export refuse a stale offer draft | `5d69375` (a Task 1 defect found while writing these tests), `a3223a5` | `offer_current_for_version(v)` locks the offer `FOR SHARE` and raises `offer_inactive` / `offer_changed` / `offer_expired`. `approve_output_version` and `export_output_version` are re-created as byte-identical copies of the `0004` bodies plus one inserted call; in export the call sits after the idempotency-key early return. `5d69375` made `archive_offer` clear `confirmed_at`/`confirmed_by` (it violated `offers_confirmed_check` on a confirmed offer). `lib/workspace/offer-sql.test.ts` diffs each new body against `0004`. |
| 3. Domain rules, repository and flag | `572115a` | `parseOfferBody` (mirrors the CHECKs; price read by value), `canReadOffer` / `canUseOffer` / `canManageOffer`, `offerRepository` (revision-guarded single-statement update; `confirm`/`archive` map SQL messages to `OfferError`), `offerPromotionsEnabled` (exactly `"true"`). |
| 4. Offer routes | `056648f` | `GET/POST /api/workspaces/[id]/offers`, `PATCH /api/offers/[id]`, `POST /api/offers/[id]/confirm`, `…/archive`. Flag 404 → validation → scope → authorize → rate limit → write. Asset must be rights-approved and usable at the offer's location. Audit events `offer.created`, `offer.updated`, and the SQL-written `offer.confirmed`, `offer.archived`. |
| 5. Templates, agent and offer checks | `ee384e2` | Template rows `offer-instagram-post` and `offer-google-post` (Beta, `promotion_copy`, `offer_id` a `confirmed_fact`, no trigger keys, Google measurement `null`); `promotion_copy` agent (prompt version `2026-10-01.1`); `offer_price_mismatch`, `offer_dates_missing`, `offer_prohibited_term` and per-channel length / hashtag checks; trilingual template copy. |
| 6. Run path: offer gate, evidence, revision binding | `4117750` | `offerSatisfied` (confirmed, unexpired, same location, usable under the caller's scope; read from the action's `offer_id` **column**); `offer_id` in `SERVER_SATISFIED_INPUT_KEYS`; the run reads the offer once, builds the fenced `offer` evidence and merges the offer's claims and prohibited terms; `bindOfferMeta` in the version gateway (agent run records the revision it read; every other version inherits only its base version's revision; incoming offer keys are stripped; no base means no revision, which is stale). `offer_changed`/`offer_inactive`/`offer_expired` mapped to 409. Spec §1.3 corrected. |
| 7. Corpus cases | `58ace05` | Seven offer cases in `test/corpus/workflows/` (draft and expired offers blocked before the model; price, date and prohibited-term warnings; TWD offer in a TW workspace; injected offer details stay inside the fence). `eval:workflows --check-load` now reports `load ok: 31 cases`. |
| 8. Promotions route | `34fc4ac` | `POST /api/offers/[id]/promotions`: one action per channel (default both), `dedupe_key = offer:<id>:<template>`, retry returns the same ids with `created: false`, never calls the model. Offer templates are reachable only through this route: `POST /api/actions` rejects them with 400 and the Create page no longer lists them. |
| 9. Owner UI | `8898f26`, fix `cbc5e1d` | Offers page (404 when the flag is off), offer form with two-step confirm and archive, promotion panel that states the delivery unit before anything runs and generates one draft at a time with per-channel states and per-draft retry, offer card and stale banner on the action page, trilingual owner copy for every refusal (no raw codes), and an "Offers" nav entry only when the flag is on. `cbc5e1d` fixed a review finding: the revision-conflict Reload kept the stale `expected_revision`, which produced a permanent 409 loop. |
| 10. Acceptance journey | `31970f9` | `e2e/acceptance/offer-promotion.spec.ts`: create, confirm, generate two drafts, approve and export one (usage 0 → 1), edit the price and re-confirm, then the other draft's approval answers 409 `offer_changed` with the zh-HK copy and stays a draft. |
| 11. Gates, rollout statement, phase record | this commit | The gate run below, `rollout/apply-0011.sql` with its rehearsal, `.env.example` and `docs/integration/DEPLOY.md`, this report, test results and the traceability row. |

### Behaviour change for owners

With the flag on, an owner (or a manager, for their locations) can record an offer, confirm it, and generate two channel drafts from it. Concretely:

- **An offer is a fact record the owner confirms.** Editing any fact bumps the revision, resets the offer to `draft` and clears the confirmation; saving the form with nothing changed keeps the revision and the confirmation, so existing drafts stay current. Only a `confirmed`, unexpired offer can feed a draft.
- **Moving an offer to another location cancels its open promotion actions.** They were created at the old location, where the run gate would refuse them; after re-confirming, "Create promotion drafts" creates fresh actions at the new location. Drafts already written on the cancelled actions stay in history.
- **A draft is bound to the offer revision it was written from.** If the offer is edited, expires (workspace-local date: usable through the whole of its `valid_until` day), is archived or is no longer confirmed, approving or exporting that draft answers 409, with owner copy telling them to generate a new draft. A hand edit of a stale draft does not make it current, and a forged `meta.offer_revision` is stripped.
- **The delivery unit is shown first.** The panel states "creates 2 drafts (Instagram, Google); nothing is counted until you approve and export a draft; each one you export counts as 1 delivery" (and, when the allowance is finite, how much of the month is used) before any request is sent.
- **Nothing about counting changed.** Each approved version counts once, on its first export; generation, edits and refusals cost nothing in usage. Spend budgets and the AI kill switch apply unchanged because runs go through the existing route.
- **Nothing is sent or published.** Drafts are copy or export text only.
- **With the flag off nothing new can be made.** The page and every offer route answer 404, the nav entry is hidden, and a run on an existing offer action answers `agent_unavailable` before any model call. Offer actions that already exist stay listed, and their existing versions stay approvable and exportable under the SQL freshness guard (see Owner actions, rollback).

### Rulings, known limits and open questions

#### Rulings taken while building (from the execution ledger, `.superpowers/sdd/2026-10-01-offers-promotion-copy/progress.md`)

Each ruling is followed by what it costs if it is wrong.

| # | Ruling | If wrong |
|---|---|---|
| R1 | The `promotion_copy` agent defines no `evidence` hook; the offer reaches the prompt only through `ctx.evidence.offer` (set by the run path and spread by `evidenceBlock`). Avoids a duplicated key in the fenced JSON. | The offer would be missing from the prompt; Task 5's fence test catches it. |
| R2 | `offer_id` is listed in `ACTION_INPUT_KEYS` (`lib/copy-workspace.ts`) with trilingual label copy, because the P4.4 contract test requires every `confirmed_fact` key there. | One extra label exists. |
| R3 | The promotions route persists `required_inputs` **without** `offer_id` (the action's `offer_id` column answers it server-side); the UI never renders an `offer_id` input. The template row keeps `offer_id`, so the gate still reads it. | The overview's missing list omits a key the gate still enforces. No safety loss. |
| R4 | Task 2's "non-offer action unchanged" test asserts the exact `0004` return JSON shapes instead of building a second `0010` database; the body-diff test proves the text is otherwise identical. | A non-textual behaviour difference would go unnoticed; none is possible with text-identical bodies. |
| R5 | Existing entries in `lib/agents/__snapshots__/agents.test.ts.snap` stay byte-identical; only additions (verified: 758 added lines, none removed). | None. |
| R6 | Task 2 moved `approve_output_version` and `export_output_version` from `verifyCatalog`'s retained-legacy deep-equal set into its changed set in `scripts/neon/catalog.ts`, because `0011` legitimately re-defines them. Their bodies are pinned instead by the body-diff test and the freshness integration tests; `readiness.ts` still checks they exist. | The catalog check loses a structural pin the body-diff test does not replace. In practice it does replace it (text-identical bar one line), but a hosted text drift in these two billing functions would now go unnoticed by `neon:readiness`. |
| R7 | Task 2 edited the already-committed `0011_offers.sql` (appended the helper and the re-created functions, and fixed `archive_offer`). Accepted: the "never edit a committed migration" rule protects applied or replayed migrations, and `0011` exists only on this unmerged branch and has never been applied anywhere. | None: no journal has `0011`. |
| R8 | An archived offer has `confirmed_at`/`confirmed_by` NULL (archive clears confirmation, required by `offers_confirmed_check`). Later tasks must not read `confirmed_by` off archived offers. | None; it follows the CHECK. |
| R9 | `PATCH /api/offers/[id]` authorizes `canManageOffer` on **both** the stored offer's location and the body's new `location_id`, and validates that the new location belongs to the workspace. | An extra 403 on a legitimate relocation by a scoped manager, which spec §3.3 forbids anyway. |
| R10 | `OfferError` `offer_not_found` maps to 404, not 409, in the offer routes. | A client expecting 409 sees 404; no state impact. |
| R11 | Offer templates are reachable only through `POST /api/offers/[id]/promotions`: the Create page excludes them, `POST /api/actions` rejects them with 400 `template_key is invalid`, and `offer_id` is server-satisfied so typed text never answers it. The pinned create-view test changed deliberately to "every agent-backed template except offer-backed ones (reached from Offers)". | An owner could not start a promotion from Create; they use Offers instead. |
| R12 | `eval:workflows --check-load` reports `load ok: 31 cases`: the corpus had 24 cases, not 23, before Task 7, so the plan's "30" was an arithmetic slip. | None. |
| R13 | The Task 7 commit carries a `Co-Authored-By: Claude Sonnet 5.5` trailer (the implementing model) instead of the Opus line; accepted as truthful, not amended. | One trailer differs. |
| R14 | Spec §6's claim that deploying before `0011` is "inert" is false: `ACTION_COLUMNS` and `artifactRepository.createOutputVersion` select `actions.offer_id` unconditionally, so `0011` **must** be applied before deploying (as for `0006`–`0010`). Ruled: keep the unconditional reads, and correct spec §6 and every rollout document to "apply `0011`, then deploy, then (optionally) set the flag"; the final fix wave edited spec §6. Schema-conditional reads would have added risk to every action read for one deploy window. | If the deploy runs first, workspace action pages 500 until `0011` is applied, exactly the 2026-09-24 nadagogo failure mode; mitigated by the `apply-0011.sql` header, `DEPLOY.md` and the owner actions below. |
| R15 | R13 extends to every subagent commit: the `Co-Authored-By` trailer names the model that actually wrote the commit (Sonnet or Opus); not amended. | Trailers differ across commits. |
| R16 | The final-review fix wave is F1–F7: moving an offer to another location cancels its open actions inside `offerRepository.update` (atomic, same predicate as `archive_offer`); `/promotions` re-checks `canUseOffer` on the offer it read; with the flag off, offer-template runs are refused with `agent_unavailable` while approve/export stay allowed; a no-op save keeps the offer confirmed; assistant draft intents refuse offer actions; docs corrected. The `/promotions`-versus-archive orphan race and the Task 9 UI nits stay deferred. | A move discards drafts the owner wanted kept (they regenerate at the new location), and a flag-off rollback stops AI drafting for existing offer actions. |

#### Deferred minor findings (not acted on in this slice)

Grouped from the task-by-task reviews. **The two items marked FLAG are the ones to look at in the final review.**

- **Task 1 (migration):** `scripts/neon/catalog.ts` checks only the existence of `offer_is_expired`, `confirm_offer` and `archive_offer` (their bodies are pinned by behaviour tests only); `neon-offers.integration.test.ts` applies migrations in the first `it`, so a single test selected with `-t` fails (order-dependent); `offers_terms_check` and the title/details upper bounds have no failing-insert test; `offers.location_id` has no SQL guarantee that the location belongs to the same workspace (the Task 4 route validates it).
- **Task 2 (approve/export guard):** no test pins the check order changed-before-expired (a draft that is both stale and expired answers `offer_changed`); the offer guard runs before the already-approved / `not_approved` / `version_closed` checks, so an idempotent re-approve of a stale offer draft returns `offer_changed` (plan-mandated placement; the owner copy handles it); `verifyCatalog`/`neon:readiness` check only existence of approve/export (R6); the serialize test's `finally` sends `ROLLBACK` after `COMMIT` (a harmless notice).
- **Task 3 (domain rules):** `parseOfferBody` counts UTF-16 units, not code points (strict side: an emoji-heavy title near 120 is rejected early); `hasAtMostTwoDecimals` is float-fragile above ~1e9 (use `Number(n.toFixed(2)) === n`); the 20-entry list cap is applied before trim/dedupe; year `0000` passes the parser but fails in Postgres (a 500); `canReadOffer(scopedManager, "L2")` is not asserted; `date::text` depends on `DateStyle` (ISO is the default); a no-op edit still bumped the revision and reset a confirmed offer to `draft` (**fixed in the final-review fix wave, F5**).
- **Task 4 (routes):** the GET/POST workspace-offers handlers call `authorizeWorkspaceRequest` outside the `try`, so an identity or database outage is an unhandled 500 where the other handlers answer 503; `archive_offer` has no location guard (a millisecond TOCTOU against a concurrent owner relocation; PATCH and confirm are protected by `expected_revision`); `loadOfferScope` runs before auth, so 404 vs 401/403 is an existence oracle and costs one unauthenticated, unrate-limited read; PATCH returns `{error:"not_found"}` where confirm/archive return `offer_not_found`; test gaps: an unauthorized caller consuming no rate-limit token, the flag-off test not asserting the artifact/asset/limiter stay untouched, PATCH asset validity at the new location; the SQL-written `offer.confirmed`/`offer.archived` are labelled but not tied into `AUDIT_EVENTS` by `satisfies`.
- **Task 5 (agent and checks):** `offer_prohibited_term` duplicates the shared `prohibited_term:<x>` warning (the spec says "merged", so it conforms; a corpus assertion must be contains-style); price suffix forms `1280 HKD`, `1280港元` and `港幣1280` are not recognised (a noise warning rather than a false pass), a range checks only its first number, and `20% off` and `HK$ 1,280` have no explicit test; the month-word match uses `mon[a-z]*`, so `19 marinated` can satisfy `19 March` (anchor to real month names).
- **Task 6 (run path):** the `artifacts.ts` doc comment overstates "same client" on the route path (pool connections; safe because `offer_id` and the base meta are immutable); `ActionRow.offer_id` is optional, so a loader that omits the column fails closed; the runs test "never sees an offer's terms" is trivially true (it duplicates the throwing-`get` test); `asRecord(input.meta)` narrows a non-object meta to `{}` before SQL (no caller passes one).
- **Task 7 (corpus):** `malicious_review-05` "inside the fence" is non-positional (fence containment is proven only in `agents.test.ts:441-459`); `fabricated_claim-06/07/08` lack `warningsExclude` for sibling `offer_*` codes; `locale_market-03` has no `warningsExclude` (it tolerates a draft with warnings).
- **Task 8 (promotions route):**
  - **FLAG FOR FINAL REVIEW, fixed (F2).** `canUseOffer` was checked on `scope.locationId` (read before authorization) but the action is created at `offer.locationId` from a second read, so a concurrent PATCH relocation opened a TOCTOU window. The route now runs `canUseOffer` again on the offer as read.
  - **FLAG FOR FINAL REVIEW, fixed (F1).** After an offer moved location and was re-confirmed, `/promotions` returned the **old** open action (still at the old location) as `created: false`, and `offerSatisfied` then refused that action forever (location mismatch) with no explanation. A relocating edit now cancels the offer's open actions in the same statement, so `/promotions` creates fresh ones at the new location.
  - Also: 400 body validation precedes 404/403; the rate-limit token is consumed on a 409; the "no LLM" test greps source (brittle).
- **Task 9 (UI):** Retry can overlap the sequential generation loop (disable while any row generates); a failed usage read silently omits the month sentence (it then looks like unlimited); Approve and Export stay enabled while the derived stale banner shows (the server still refuses); the export-path 409 `offer_*` mapping is untested (only approve is); the offers page ignores `?location=` and the new-offer form defaults to the first manageable location; accessibility nits (an `aria-label` on a `div`, `role=status` on a `ul`); price comma stripping turns `12,80` into 1280; the zh-TW register mixes 您 (new offers copy) with 你 (existing templates) on one screen; if the edited offer vanishes from props after a refresh the editor stays non-null and New/Edit stay disabled until reload; after Reload, typed text overwrites another user's concurrent edit on save (by design; the "changed elsewhere" details are not shown).
- **Task 10 (acceptance):** the post-refusal banner assertion is vacuous (the banner is already rendered on load), so the 409 and database assertions carry the weight; `clickUntil` has no comment restricting it to non-mutating openers; the scalar SQL assertions assume one offer and one template per workspace.

#### Known limits

- **Asset rights are not re-checked at approval or export.** Rights are checked when the offer is saved and when a draft is generated; the exported text carries only the alt text, never the image. An asset whose rights are later revoked does not invalidate an approved draft.
- **No Google post measurement.** `offer-google-post` has `measurement: null`: the scan does not measure Google Business posts, so an exported Google draft produces no `action_measurements` row. (`offer-instagram-post` reuses `ig.days_since_last_post`.)
- **`offer_prohibited_term` duplicates the shared prohibited-term warning.** The merged offer-plus-brand list also trips P4.4's shared `prohibited_term:<x>` check, so the approver sees both. Intentional (spec says "merged"); noise rather than a gap.
- **Two drafts are two deliveries.** If both channel drafts are approved and exported they count as two (DEC-14 safe default; the panel says so before generation).
- **A stale-and-expired draft reports `offer_changed`** (check order), and an idempotent re-approve of a stale draft also reports `offer_changed`, not "already approved".
- **Offers are archived, never deleted.** No delete route exists.
- **No assistant promotion intent** and no draft for a messaging channel. The assistant's draft intents refuse an offer action (F6); an offer action is drafted only through the run route.
- **Deleting a location that offers point to.** `offers.location_id` is `ON DELETE CASCADE` while `actions.offer_id` is `NO ACTION`, so deleting a location fails when one of its offers has an action, and silently deletes the offer when none has. No application path deletes locations today; revisit in a later migration (the fix wave made no migration change).
- **Relocation cancels open actions, including ones with drafts.** An owner who moves an offer loses the open promotion actions at the old location (their versions stay in history) and regenerates at the new one (R16).
- **Rollback leaves existing offer drafts approvable.** With the flag off, existing offer actions stay listed and their versions stay approvable and exportable (SQL freshness still applies); only new AI drafts and runs are refused; hand-edited versions can still be saved, under the same guard (F4).
- **`neon:readiness` is weaker for approve/export** after R6 (existence only).

#### Open questions (recorded, not resolved here)

- **DEC-14** (delivery units for multi-output promotions and packs) remains **open**; its safe default applies (each approved version counts once, on its first export). No counting code changed.
- The two Task 8 FLAG items were settled in the final-review fix wave (F1, F2; Ruling R16): the scope is re-checked on the offer as read, and a relocated offer's open actions are cancelled.

### Not run / blocked

- **The hosted migration: not run (DEC-11).** `0011` has never touched a Neon or any hosted database. `apply-0011.sql` was prepared and rehearsed on a local Docker `postgres:16` only.
- **A real-model evaluation: not run (DEC-04).** `EVAL_LIVE` was never set and no key was supplied. `eval:workflows -- --budget-usd 1` refused with exit 2 (`not_enabled`) and `eval:workflows -- --check-load` printed `load ok: 31 cases`. The corpus proves the **pipeline** handles each offer case with canned outputs; it says nothing about how any model behaves with offers.
- **P4.2 (work packs), P4.3 (contextual assistant): not started.** They follow in their own specs.
- **P4.5 (preview) and P4.6 (publishing): not built**, blocked by DEC-12 and DEC-13, which are not authorized. Offers add no publishing.
- **Hosted verification of any kind:** no deployed request, no production Neon query, no real mail, Stripe or model call. `e2e:live`, `e2e:neon-auth` and `neon:readiness` were not run (they need keys or a hosted target).

### Owner actions

1. **Apply `0011` before deploying this code, not merely before enabling the flag.** Run [`rollout/apply-0011.sql`](rollout/apply-0011.sql) in the Neon SQL Editor as `neondb_owner`, on a Neon test branch of production first and then on production. It refuses unless the journal is exactly `0001`–`0010`, so `apply-0010.sql` must already be applied. **Why before the deploy:** the flag only hides the offers page and routes. The shared action queries (`ACTION_COLUMNS` in `lib/repositories/workspace-read.ts`) and the version-writing gateway (`artifactRepository.createOutputVersion`) select `actions.offer_id` unconditionally, so this code against a database without `0011` fails every action read and every version write. Applying `0011` ahead of the deploy changes nothing for owners: the column is nullable and every existing row is null.
2. **Deploy with `OFFER_PROMOTIONS_ENABLED` unset.** It defaults off and is blank in `.env.example`.
3. **Then set `OFFER_PROMOTIONS_ENABLED=true` and redeploy** (an environment variable change takes effect on the next deployment).
4. **Rollback: unset the flag and redeploy.** That **stops** the offers page and nav entry, every offer route (create, edit, confirm, archive and `/promotions` answer 404), and every new AI draft or run on an existing offer action (`POST /api/actions/[id]/run` answers 409 `agent_unavailable` before any model call or run row). It does **not** remove what exists: offer actions already created stay listed, and their existing versions stay approvable and exportable through the normal version routes, and a hand-edited version can still be saved (`POST /api/actions/[id]/versions` is not flag-gated; it inherits the base version's offer revision), all under the SQL freshness guard (a draft whose offer changed, expired, was archived or is no longer confirmed is still refused). With edit and archive off too, an approved draft of a current offer can still be exported and counted. Nothing is deleted. `0011` is additive and is not rolled back; the re-created approve/export functions behave exactly as before for any action without an `offer_id`.

DEPLOY.md carries the same order ([`docs/integration/DEPLOY.md`](../../integration/DEPLOY.md), "P4.1 offers and promotion copy: migration 0011 and the flag").

### Runbook — `apply-0011.sql`

The statement is [`rollout/apply-0011.sql`](rollout/apply-0011.sql). It was generated from the migration files on disk by a scratch script (kept outside the repository) that imports the repository's own `loadMigrations()` and hashes each file's text exactly as `applyMigrations` does; nothing embedded was typed. It is one `DO $apply$ … $apply$;` block that
- runs `SET LOCAL ROLE smeassistant_migrator`, and refuses unless `current_user` is that role;
- takes the runner's lock, `pg_advisory_xact_lock(1936549221, 3)` (`scripts/neon/migrations.ts`);
- refuses unless `neon_migrations.journal` is **exactly** ordinals 1–10 with the names and sha256 checksums of `neon/migrations/0001…0010`, as `loadMigrations()` computes them;
- `EXECUTE`s the exact text of `0011_offers.sql` inside `$m0011$` (0011 uses `$function$` dollar quotes, so the outer tags differ and cannot collide; the generator also refuses if the text contained `$m0011$` or `$apply$`);
- inserts journal row `(11, '0011_offers.sql', '5d5a01b5796f579884de31b31aece3d54159f0b42a06042f7b228b93b0eb9449')`.

After generation every checksum was re-derived independently with `sha256sum` over the file bytes and each appears in the statement. Rows 1–9 are identical to `apply-0010.sql`'s, and row 10 carries the checksum `apply-0010.sql` records. The embedded text between the `$m0011$` tags is byte-identical to `0011_offers.sql` (16,365 bytes, ASCII, no CR). The existing `.gitattributes` line `docs/implementation/owner-platform-v1/rollout/*.sql text eol=lf` already covers the new file (`git check-attr eol` reports `lf`).

**Rehearsal (2026-10-02, disposable `postgres:16`, server 16.15, run twice, identical results after masking generated ids).** The roles matched production, as in the earlier rehearsals: `neondb_owner` LOGIN CREATEROLE owning database `neondb`; `neondb_owner` created `smeassistant_migrator` NOLOGIN and `sme_app_runtime` NOLOGIN, and granted the migrator CREATE on the database and USAGE, CREATE on schema `public`. `0001`–`0009` were applied as the migrator through the repository's own `applyMigrations` (a pool whose connections `SET ROLE smeassistant_migrator`). `0010` was then applied by running `apply-0010.sql` itself as `neondb_owner`, the way production gets it. The container is bound to `127.0.0.1` only and was removed afterwards. Each block was sent as one query, as `neondb_owner`:

| # | Check | Result |
|---|---|---|
| 1 | Before `GRANT smeassistant_migrator TO neondb_owner WITH SET TRUE` | **refused**: `42501 permission denied to set role "smeassistant_migrator"`. Catalog and journal snapshot unchanged. |
| — | The grant, run as `neondb_owner` | succeeded (`set_option = true`, `inherit_option = true`, grantor `neondb_owner`) |
| 2 | Wrong journal: `0001`–`0009` only (`0010` not applied) | **refused**: `P0001 apply-0011 refused: neon_migrations.journal is not exactly 0001-0010 with the expected checksums (it has 9 rows)`. Snapshot unchanged. |
| — | `apply-0010.sql`, as `neondb_owner` | applied, with its documented notices; journal 10 rows |
| 3 | Wrong journal: rows 1–10 present, row 10's checksum altered (inside a transaction, rolled back) | **refused**: `P0001 apply-0011 refused: … (it has 10 rows)`. No `offers` table; snapshot unchanged after the rollback. |
| 4 | First run (journal exactly `0001`–`0010`) | **applied**, with notices `policy "server_application" for relation "public.offers" does not exist, skipping` and `apply-0011: applied 0011_offers.sql and recorded journal row 11`. Journal rows 1–11 with the expected names, every checksum equal to `loadMigrations()`'s, row 11 `5d5a01b5…9449`. `offers` exists; `actions.offer_id` is `uuid`, nullable. |
| 5 | `applyMigrations` with all eleven, as the migrator | returned `[]`: nothing pending, so the runner accepts the journal's checksums |
| 6 | Ownership and runtime access | `offers`, `offers_pkey`, `offers_workspace_idx` and `actions_offer_idx` are owned by `smeassistant_migrator`; `offers` has RLS on with policy `server_application` (`ALL`, `sme_app_runtime`). `sme_app_runtime` has SELECT, INSERT, UPDATE and DELETE on `offers`; `PUBLIC` has none. All six functions (`offer_is_expired`, `confirm_offer`, `archive_offer`, `offer_current_for_version`, and the re-created `approve_output_version` and `export_output_version`) are owned by the migrator, carry `search_path=""`, grant EXECUTE to `sme_app_runtime` and not to `PUBLIC`; the two re-created bodies both contain the offer guard and differ from the `0004` bodies. Under `SET ROLE sme_app_runtime` (rolled back): `confirm_offer` returned `confirmed`, approving a current draft returned `approved`, approving a draft after the offer was edited answered `offer_changed`, after the offer ended answered `offer_expired`, and after it reverted to draft answered `offer_inactive`; `archive_offer` returned `archived` with `cancelled_actions: 1`; `offer_is_expired(yesterday)` was `true`. |
| 7 | Second run | **refused**: `P0001 apply-0011 refused: … (it has 11 rows)`. Snapshot unchanged. |

The snapshot is an md5 over every relation (kind, owner, RLS, ACL), column, constraint, policy, index and function (signature, owner, body md5, ACL) in `public` and `neon_migrations`, plus the journal rows. After the rehearsal `corepack pnpm db:verify` was re-run (gate below): `0001`–`0011`, replay `[]`. The generator and the rehearsal script were scratch files and are **not committed**. **`apply-0011.sql` has never been run against any Neon database.**

### Verification

Full detail is in `PHASE-4-TEST-RESULTS.md`. One line per gate, run 2026-10-02 at `31970f9` plus the documentation edits (no code changed in this task):

| Command | Result |
|---|---|
| `corepack pnpm typecheck` | **passed**, exit 0. |
| `corepack pnpm lint` | **passed**, exit 0, `0 errors, 30 warnings` (same 30 as the P4.4 record; none in a file this branch changed). |
| `corepack pnpm test` | **first run FAILED** (exit 1): 2 known load-timeout flakes, `tests/scan-claim-single-path.test.ts` and `tests/scan-events-single-writer.test.ts` (`Test timed out in 5000ms`); 325 app files / 3,820 tests passed. The two files **alone** passed (2 / 7). The **full re-run passed with zero failures**: 378 files / 4,409 tests (P4.4 record: 366 / 4,127; +12 / +282). |
| `NEON_INTEGRATION=1 corepack pnpm test:integration` | **passed**, 41 files / 441 tests, first run (P4.4: 39 / 399). |
| `corepack pnpm db:verify` | **passed**, `0001`–`0011`, replay empty, 38 tables / 465 columns / 188 constraints / 98 indexes / 8 triggers / 18 functions (P4.4: 37 / 444 / 172 / 95 / 8 / 14). |
| `corepack pnpm test:no-supabase` / `test:no-self-service-claim` | **passed** / **passed**. |
| `corepack pnpm build` | **passed**, literal Turbopack gate (`Compiled successfully in 13.3s`); not blocked this run. |
| `corepack pnpm test:secret-boundary` | **passed**, literal gate, 56 public artifacts. |
| `corepack pnpm e2e` | **passed**, 31 / 31, literal Turbopack gate. |
| `corepack pnpm e2e:acceptance` | **passed on the third full run, 39 / 39. The first two runs each had one different failure** (`public-funnel` hk timeout waiting for the report; `merchant-loop` `ECONNRESET`), each passing alone; `offer-promotion.spec.ts` passed in all three. Not a clean first-run pass; cause not established (see `PHASE-4-TEST-RESULTS.md`). |
| `eval:workflows -- --budget-usd 1` / `-- --check-load` | refused, exit **2** / `load ok: 31 cases`, exit 0. |
| Rehearsal | `apply-0011.sql` on a disposable `postgres:16`: seven checks, run twice, identical (see the runbook above). |
| Blocked | **none** on this run. The P4.4 `--webpack` diagnostics were not needed. |

### Invariants

- `git diff dc55e02..31970f9 --stat -- neon/migrations packages` lists only `neon/migrations/0011_offers.sql` (367 insertions): no `0001`–`0010` edit, no vendored-package edit.
- `lib/agents/__snapshots__/agents.test.ts.snap`: 758 lines added, **0 removed** (R5). No existing agent's `task:` prompt line changed (`git diff dc55e02 --diff-filter=M -- 'lib/agents/agents/*.ts' | grep '^[-+].*task:'` prints nothing; the only `task:` added is in the new `promotion-copy.ts`).
- `lib/assistant/live.ts` gained no promotion intent. No counting code changed: the only SQL touching usage is the unchanged `export_output_version` body plus one inserted line.

### Final-review fix wave

The final whole-branch review (`dc55e02..9ac1977`) returned four important and five minor findings and challenged no ruling. The controller ruled seven items in (F1–F7, Ruling R16) and kept the rest deferred, including the `/promotions`-versus-archive orphan race (a millisecond window; the orphaned action behaves as cancelled because the run gate refuses an archived offer) and the Task 9 UI nits. Four code commits on top of `9ac1977`, then this documentation commit: `d3bd7b4`, `a5e5ce8`, `941bfa2`, `de8dc18`. No migration (`0011` untouched), no vendored-package edit, no prompt or snapshot change. Each code change was written test-first (the new or changed tests failed before the fix and pass after it).

| Finding | Fix | Commit | Covering tests |
|---|---|---|---|
| F1 (important) relocating an offer strands its promotion actions | `offerRepository.update` is one statement over a `FOR UPDATE`-locked row: a CTE compares the body with the stored facts in SQL (`IS DISTINCT FROM`, by value), updates only when something changed, and when `location_id` changed cancels the offer's open actions (`action_state` not in `completed`/`dismissed`/`cancelled`/`expired`), mirroring `archive_offer`. The result carries `cancelledActions`; `offer.updated` records `cancelled_actions`. | `a5e5ce8` | `neon-offers.integration.test.ts`: "relocating an offer cancels its open actions; an edit that keeps the location does not (F1)" (open and in-progress cancelled, completed and other offers' actions untouched, widening to workspace-wide counts, a stale-revision save cancels nothing) and "relocate, re-confirm, promote: the new action is created at the new location (F1)" (`created: true`, old action `cancelled` at L1, new one at L2); `offers.test.ts` "records how many open actions a relocation cancelled (F1)". |
| F2 (important) `/promotions` scope check vs second read | After the offer read, `if (!canUseOffer(auth.membership, offer.locationId)) return 403`. | `d3bd7b4` | `promotions/route.test.ts` "refuses a scoped manager when the offer read moved it out of scope after the scope check (F2)": scope read L1, offer read L2, manager scoped to L1 → 403, no action, no audit. |
| F3 (important) spec §6 contradicted R14 | Spec §6 rewritten: apply `0011` (test branch, then production) before deploying; deploy with the flag unset; set the flag and redeploy to enable; rollback as F4. Second spec-correction paragraph and R14/R15 added above. | this commit | docs |
| F4 (important) "rollback = flag off" overstated containment | `runAgentForAction` refuses offer templates (`isOfferTemplate`) with `RunError("agent_unavailable")` while `offerPromotionsEnabled()` is false, before the budget read, any offer read, run row or model call. `RunAgentInput.featureEnv` (defaults to `process.env`); the corpus harness runs with the flag on. Approve/export unchanged. `DEPLOY.md`, spec §6, the behaviour section and owner action 4 now state what the flag stops and what stays. | `941bfa2` (code), this commit (docs) | `runs.test.ts` "refuses with agent_unavailable while the flag is off …(F4)" (`featureEnv: {}`, `"TRUE"`, and the `process.env` default; zero model calls, no offer read, no budget read, no run row, no finish) and "still runs a non-offer action while the flag is off"; corpus and `eval-workflows` tests unchanged and passing. |
| F5 (minor) a no-op edit un-confirmed the offer | Same statement as F1: when no field differs it returns the current row with `changed: []`, `cancelledActions: 0`, without bumping the revision or touching status or confirmation. The PATCH route records no `offer.updated` event for an empty `changed`. The old test that pinned the bump was replaced deliberately. | `a5e5ce8` | `neon-offers.integration.test.ts` "an unchanged save keeps the revision and the confirmation (F5)" (price written as `1280.0` reads as 1280; `confirmed_by` kept; stale revision still `revision_changed`); `offers.test.ts` "answers 200 with the unchanged offer and records no audit row when nothing changed (F5)". |
| F6 (minor) assistant draft intents on an offer action | `draft()` in `lib/assistant/live.ts` answers an offer action, focused or implicitly selected, with the existing `NO_ACTION_FOR_DRAFT` / `explain_limits` shape: no budget read, model call or run row. No new copy. | `de8dc18` | `live.test.ts` "refuses every draft intent on an offer action, focused or implicit, before the model (F6)" (all five draft intents × explicit and implicit context). |
| F7 (minor, docs) traceability preface; location-delete footgun | Traceability Phase 4 preface names `p41-offers` / `dc55e02` for P4.1, and the P4.1 rows record F1/F2/F4/F5/F6; the known limits above add the `offers.location_id ON DELETE CASCADE` + `actions.offer_id NO ACTION` footgun (no migration change). | this commit | docs |

**Gate re-runs after the wave** (2026-10-02, sequential, on `de8dc18` plus the documentation edits):

| Command | Exit | Result |
|---|---|---|
| `corepack pnpm typecheck` | 0 | **passed** (root and all four packages). |
| `corepack pnpm lint` | 0 | **passed**, `0 errors, 30 warnings` (unchanged; none in a file this wave touched). |
| `corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-offers.integration.test.ts test/integration/neon-offer-freshness.integration.test.ts` | 0 | **passed**, 2 files / 45 tests (`neon-offers` 27, was 24: three new tests; the no-op half of the old update test moved into the F5 test). The full `test:integration` suite was not re-run; only these two files touch the changed repository statement. |
| `corepack pnpm test` | **1** on each of four full runs | **Not a clean full pass on this machine (113 node processes running).** Every failure was `Test timed out in 5000ms` in a file this wave did not touch, except two offer route files that timed out once under the heaviest load. Run 1: `lib/identity/identity-sdk.test.ts`; run 2: `tests/scan-events-single-writer.test.ts`; run 3: six files (`scan-claim-single-path`, `scan-events-single-writer`, `app/api/assistant/run/route.test.ts`, `app/api/versions/[versionId]/versions.test.ts`, and the flag-off cases of `app/api/offers/[offerId]/promotions/route.test.ts` and `app/api/workspaces/[workspaceId]/offers/route.test.ts`); run 4: `tests/scan-events-single-writer.test.ts` only, app part **326 / 327 files, 3,827 / 3,828 tests**. Each failing file passed alone (`identity-sdk` 7 / 7; `scan-events-single-writer` 3 / 3; the six run-3 files together 6 files / 85 tests). Because the script chains its stages with `&&`, the later stages were run separately: `lib/evidence/safe-media.test.ts` 1 / 62, `region` 3 / 23, `scoring` 16 / 183, `contracts` 3 / 20, `scan-engine` 28 / 299, all passed. Totals: **378 files / 4,415 tests** (+6 tests over the Task 11 record). Recorded, not hidden. |
| `corepack pnpm eval:workflows --check-load` | 0 | `load ok: 31 cases`. |
| Invariants | — | `git diff 9ac1977 --stat -- neon/migrations packages lib/agents/__snapshots__` prints nothing. |

Not re-run in this wave: `db:verify`, `build`, `test:secret-boundary`, `test:no-supabase`, `test:no-self-service-claim`, `e2e` and `e2e:acceptance` (no migration change; the Task 11 records stand for them). No real model was called and `EVAL_LIVE` was never set.

## P4.2 — work packs (visibility starter pack)

**Branch** `p42-work-packs`, base `a71c5df` (`origin/main`, PR #28, the merged P4.1 slice). Spec commit `a4fa0b1`, plan `b0b32d5`, implementation commits `06ae80a`..`a071ff3` (six commits, listed below), then this Task 7 documentation commit. Committed diff before this commit: 46 files, 4,055 insertions, 62 deletions (two of the files are the spec and the plan). Worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p42-work-packs`. Node `v24.18.0`, pnpm `9.12.0` via corepack, Windows 11 Pro 10.0.26200, Docker Server `29.7.2`, `postgres:16` (server 16.15). Gates run 2026-10-03.

Built from `docs/superpowers/plans/2026-10-02-work-packs.md` (Tasks 1–7) against the design in [`docs/superpowers/specs/2026-10-02-work-packs-design.md`](../../superpowers/specs/2026-10-02-work-packs-design.md).

**Implemented and locally verified. Nothing here is hosted-verified.** One new migration, `neon/migrations/0012_work_packs.sql`, exists and has been applied **only** to owned, disposable local Docker Postgres fixtures (`db:verify`, `test:integration`, and the `apply-0012.sql` rehearsal). Nothing was applied to any hosted or Neon database, nothing was deployed or pushed, no paid provider or real model was called (the fake LLM is injected in every test and the acceptance journey), and no mail was sent. The feature is behind `WORK_PACKS_ENABLED`, which defaults off.

### What this closes

Master Plan §7 P4.2 (sources E3, F-30, and the remaining part of F-29): a **pack is a grouping of ordinary evidence-linked actions** and their existing immutable versions, not a second output, approval or billing system. This slice ships one fixed pack, the **visibility starter pack**, per location: reply to reviews, FAQ plus JSON-LD, and website basics (`review-response`, `visibility-content`, `website-basics`, in that order).

- **Idempotent generation.** `startPack` creates or reuses each item's action through the existing `createObjective` with the same `dedupe_key` scan derivation uses, inside one transaction guarded by a unique partial index on the open pack, so two people pressing Start at once get one pack and the same id, and a retry never duplicates the three actions. It never calls a model.
- **Approval and export stay exact.** The pack stores no approval, delivery, run or output state: an item's status is always derived from its action, its latest run and its latest version. No approve or export control is rendered on any pack surface; both happen only on the action's own page, on the exact version.
- **Partial progress.** Each item has its own state and its own Retry, and retrying one item runs only that action. A refused spend (paused AI, budget reached) stops the loop and shows the existing owner copy once.
- **The legacy Fix Pack card.** F-30: the card was disconnected (no generator in this repository; only staff tooling writes `agent_runs`). With the flag on, Home shows the pack card, and pending staff drafts remain reviewable under "Earlier staff drafts" through the existing routes, review controls and audit, only while at least one is pending. `agent_runs` is never written, rewritten or relabelled, and no changed line in this branch's code diff mentions it. F-29 was already closed at the baseline (approving or rejecting a Fix Pack draft writes an audit row); this slice keeps it reachable.

Before this slice there was no pack model (no table, route or page), and the Home Fix Pack card could only ever show staff-written drafts.

### Decisions (user, 2026-10-02)

| Question | Decision |
|---|---|
| What goes into a pack | **One fixed "visibility starter pack"** per location: review replies, FAQ + JSON-LD and website basics, reusing the open actions the scan created. Owners do not assemble anything. |
| The legacy Fix Pack card | **Replace it, keep history.** Home shows the pack card. Pending staff drafts in `agent_runs` stay reviewable in an "Earlier staff drafts" section while any are pending. `agent_runs` rows are never rewritten or relabelled. |
| What starting a pack runs | **Create, then draft each item.** Create or reuse each item's action, then run a draft for each, one at a time, with independent failure and retry. |
| Storage | **New tables** (migration `0012`) for idempotency, per-item membership and pack history. |
| Delivery unit | Unchanged DEC-14 safe default: each approved version counts once on its first export. A three-item pack is up to three deliveries. This is shown before anything runs. |

### What changed, by task

| Task | Commit(s) | What it did |
|---|---|---|
| Design and plan | `a4fa0b1`, `b0b32d5` | The spec, then the plan. |
| 1. Migration `0012_work_packs.sql` | `06ae80a` | `public.work_packs` (workspace, location, `kind` CHECK `visibility_starter`, creator, `closed_at`) and `public.work_pack_items` (PK `(pack_id, template_key)`, position 1–3, template CHECK), the unique partial index `work_packs_open_idx` on `(workspace_id, coalesce(location_id, zero-uuid), kind) WHERE closed_at IS NULL` that makes Start idempotent, RLS, the `server_application` policy and `sme_app_runtime` grants as `0010`/`0011`. `work_pack_items.action_id` is `DEFERRABLE INITIALLY DEFERRED` (Ruling P2). Drizzle mirrors, `db:types`, the catalog fixture (+196 lines, insertions only), and the schema test counts (tables 38→40, columns 465→477, constraints 188→198, indexes 98→102, journal 11→12). `neon-offers.integration.test.ts` now applies through `0011` explicitly (a bare `applyMigrations` would have applied `0012` too). |
| 2. Definition, overview and idempotent start | `e567e7b` | `workPacksEnabled` (exactly `"true"`); `STARTER_PACK`, `isPackFinished`, pure `buildPackOverview` (counts, `nextToReview`, `finished`) and `loadPackOverview`; `packRepository` with `startPack` in one transaction (lock and reuse an unfinished pack, close a finished one, insert on a savepoint so a concurrent 23505 on `work_packs_open_idx` returns the winner with `created: false`, create or reuse each action through `createObjective`, three item rows, `pack.started` audit event), plus `openPack`, `getPack`, `packScope`. Audit label `pack.started` and the trilingual pack title. |
| 3. Pack routes | `55cfedc` | `POST`/`GET /api/workspaces/[id]/packs` and `GET /api/packs/[packId]`. Order: flag (404) → UUID and body → scope read → authorize → location scope → location-in-workspace → rate limit → work. A repository failure is 503 with no message. Ruling P3. |
| 4. Home card, pack page, runner, earlier drafts | `836cc62` | `PackCard` (replaces `FixPackCard` when the flag is on), the pack page `/[locale]/owner/[workspaceSlug]/packs/[packId]` (flag off → `notFound()` before any read), `FixPackCard mode="earlier"`, the shared sequential runner `useSequentialRuns` extracted from the P4.1 promotion panel, `loadHomeWorkPacks` (Ruling P1), the leaf `packs-model.ts` (Ruling P4), `stopOnRefusal` (Ruling P5), the item skip rule `packActionsToDraft`, `startPack` and `getOpenPack` client helpers, and trilingual copy including the exact disclosure. |
| 5. Flag-off safety | `6891a58` | `neon-work-packs-flag-off.integration.test.ts`: against a database whose schema stops at `0011`, with the flag unset, the Home brief, `loadHomeWorkPacks` and the actions list succeed and **zero** recorded statements mention a pack table; with the flag on the same read fails with `42P01` on `work_packs`, so the gate is the only thing standing between the app and the missing table. |
| 6. Acceptance journey | `a071ff3` | `e2e/acceptance/work-pack.spec.ts` (and `WORK_PACKS_ENABLED=true` in `test/e2e/safety.ts`): disclosure shown with no pack rows → Start → three items in order, one open pack, two drafts, usage 0, no approve or export control on the card → Review next → approve and export on the action page (usage 1) → Home shows review-response exported and website-basics draft ready → a repeat `POST` returns 201 `created: false` with the same pack id, still one open pack, three items, usage 1. |
| 7. Gates, rollout statement, phase record | this commit | The gate run below, `rollout/apply-0012.sql` with its rehearsal, `.env.example` and `docs/integration/DEPLOY.md`, this report, test results and the traceability rows. |

### Behaviour change for owners

With the flag on, an owner (or a manager, for the locations in their scope) sees the visibility starter pack on Home. Concretely:

- **One pack per location, idempotent.** "Start your visibility starter pack" lists the three items and states the delivery unit first: "Creates up to 3 drafts. Nothing is counted until you approve and export a draft; each one you export counts as 1 delivery." (on a capped plan, followed by " This month: n of m used."). Start creates or reuses the three actions, then drafts them one at a time. Starting again while the pack is unfinished returns the same pack. Once every item's action is completed, dismissed, cancelled or expired, the next Start closes that pack and opens a new one.
- **Actions the scan already created are reused unchanged.** If an open action with the derivation key exists it is the pack item; otherwise a fresh action is created (source `owner_objective`) and a later scan refreshes its evidence through derivation's existing upsert without duplicating it or changing `source`. If a template's only action is finished, a fresh open action is created for the new pack and the finished one is untouched.
- **Nothing is re-spent on work that exists.** The loop skips any item whose action is finished or whose latest version is `draft`, `changes_requested` or `approved`.
- **The FAQ item usually stops at "needs your facts".** It needs three owner facts; that is a normal outcome (a link to its action page), not a failure.
- **Spend is refused mid-pack, once.** When an item's run answers `ai_paused` or `ai_budget_reached`, no further item is run and the existing pause or budget copy is shown once.
- **Review stays per version.** "Review next" opens the first item with a draft to review, on its action page. The pack page is read-only for approval: Retry and links only.
- **Earlier staff drafts.** The Fix Pack list appears under that heading only while a pending `agent_runs` draft exists, with the existing review controls.
- **Nothing is sent or published, and nothing about counting changed.** Generation, retries and refusals cost nothing in usage.
- **With the flag off nothing changes.** Home is today's, with the `FixPackCard` unchanged (asserted by `outerHTML` equality), the pack page and every pack route answer 404, and no code path issues SQL against the pack tables.

### Rulings, known limits and open questions

#### Rulings taken while building (from the execution ledger, `.superpowers/sdd/2026-10-02-work-packs/progress.md`)

Each ruling is followed by what it costs if it is wrong. The pre-flight scan (task interfaces checked against each other) found one gap, P1; P2–P5 arose during the build.

| # | Ruling | If wrong |
|---|---|---|
| P1 | Task 4 puts the flag-gated Home pack data assembly in one exported server function, `loadHomeWorkPacks(ctx, membership, location)` in `lib/workspace/packs.ts`. It returns `undefined` with zero SQL when the flag is off; `page.tsx` calls it and Task 5's test calls the same function. Without it, the assembly could have been inlined in the page JSX and Task 5 would have had nothing callable to test. | A later reader finds one extra exported function. |
| P2 | `work_pack_items_action_id_fkey` is `DEFERRABLE INITIALLY DEFERRED` (delete rule still `NO ACTION`) instead of the spec's immediate `NO ACTION`. With an immediate FK, deleting a workspace cascades into `actions` first (the older table's trigger fires first) and fails 23503 on the pack items that still exist. Deferred, the check runs at commit, by which point the cascade has removed the items too. Deleting an action a pack points to still fails, with 23503, at commit. | A statement-time error becomes a commit-time one: a transaction that deletes a referenced action sees 23503 at `COMMIT`, not at the `DELETE`, so later code must not rely on a mid-transaction 23503. Also an item whose `action_id` names no action fails only at commit. Not pinned by a test (deferred, below). |
| P3 | `POST /api/workspaces/[id]/packs` with `location_id: null` (a workspace-wide pack) requires an owner, or a manager whose `location_scope` is null (the whole workspace). A location-scoped manager gets 403 there. `startPack` reads the newest snapshot for a null location without a membership check, so this keeps that evidence read inside the caller's scope (mirrors `POST /api/actions`' 403). | A scoped manager in a workspace with no location split cannot start the pack; the owner can. |
| P4 | The pure definitions (`STARTER_PACK`, `PackKind`, `StarterItemKey`, `WorkPack`, `PackItem`, `PackOverview`, `isPackFinished`, `buildPackOverview`) live in a leaf module `lib/workspace/packs-model.ts` with no server imports. `lib/workspace/packs.ts` re-exports them and keeps `loadPackOverview` and `loadHomeWorkPacks`; the repository and every client component import from the leaf. This avoids the `packs.ts` ↔ `repositories/packs.ts` import cycle and server code in client bundles. | One extra module. |
| P5 | `useSequentialRuns` takes `stopOnRefusal` (default true; the pack surfaces stop on `ai_paused` and `ai_budget_reached`), and the P4.1 `OfferPromotionPanel` passes `false` to keep its existing, tested behaviour of continuing to the next channel after a refusal. P4.1's tests must pass unchanged. | The promotion panel would keep calling `/run` after a budget refusal; each call is refused server-side at zero cost. |

Also recorded: the trailer on each commit names the model that wrote it (three Opus, five Sonnet, counting the spec and plan), as in P4.1 R13/R15; commits are not amended.

#### Deferred minor findings (not acted on in this slice)

Grouped from the task-by-task reviews. **The three items marked FLAG are the ones to look at in the final review.**

- **Task 1 (migration):** the deferred-FK timing (error at `COMMIT`; an item delete plus an action delete in one transaction succeeds) is not pinned by a test; an item with a nonexistent `action_id` also fails only at commit (a note for Task 2); `work_packs.created_by ON DELETE SET NULL` is untested (as for `0010` and `0011`).
- **Task 2 (start and overview):** the second concurrency interleaving (two starts racing over a finished open pack) is reasoned, not tested; `nextToReview`'s position sort has no out-of-order unit case; `startPack` and the reads rethrow generic codes (`pack_start_failed`, `pack_read_failed`) without logging the cause; the audit label `入門套裝` is shown to zh-TW readers because the labels table has only `en` and `zh` slots (the zh-TW pack title is `入門套組`).
- **Task 3 (routes):** authorization sits inside the `try` in `GET /api/packs/[packId]` (an identity outage is 503) but outside it in the two workspace-packs handlers (500); the `[packId]` test does not assert that `loadWorkspaceContext` receives `auth.membership`.
- **Task 4 (card and page):**
  - **FLAG FOR FINAL REVIEW.** Two people pressing Start at once get one pack (Start is idempotent), but **both clients then run all three items**: the skip rule reads the overview's latest version, not `runState` `queued`/`running`, so concurrent loops can spend twice on the same items.
  - **FLAG FOR FINAL REVIEW.** Retry is shown on a failed row while `runAll` is still working, so a Retry click can overlap the sequential loop and run an action twice.
  - **FLAG FOR FINAL REVIEW.** There is no "Continue" after `ai_paused` / `ai_budget_reached` or after a mid-run reload; a refused item reads "Failed — retry" rather than "paused".
  - Also: a finished item with no version shows "Not started"; the zh-TW pack copy uses 你 where the offers copy uses 您, and the stop-reason-to-status mapping is duplicated in `pack-card` and `pack-view`; the pack page maps a transient read error to 404, and multi-location Home costs three queries per location; `lib/workspace/packs.ts` imports page-context and a component type (layering).
- **Task 5 (flag-off safety):** the "flag unset" case stubs `""` rather than `undefined`; the flag-on case asserts exactly `["42P01"]`, which assumes one pack read; the test covers `getHomeBrief` and `loadHomeWorkPacks`, not `loadOwnerPage` or `loadWorkspaceProblems`.
- **Task 6 (acceptance):** Start (a mutating click) is driven by a hand-rolled retry rather than a single click after hydration (safe: Start is idempotent and the retry is guarded); the "no approve or export control on the card" assertion is not repeated after the export; the 180 s timeout headroom is tight.

#### Known limits

- **One fixed pack kind.** `visibility_starter` only, with exactly three items. No custom or owner-built packs, no bulk approval, no packs spanning locations, no offer packs, no regenerating every item at once.
- **The FAQ item usually needs owner facts.** Three owner facts are required before it can draft, so the starter pack typically ends with two drafts ready and the FAQ item waiting on the owner. That is the designed outcome.
- **A multi-location "all" view cannot start a pack.** With `?location=all` in a workspace with several locations there is no single location to start for. Home shows the open packs for the in-scope locations (and a workspace-wide pack) and the text "Choose a location to start a starter pack", with no Start button.
- **A workspace-wide pack needs a whole-workspace caller (Ruling P3).** A location-scoped manager cannot start one.
- **Ruling P2's deferred FK.** Deleting an action a pack points to fails at commit, not at the statement; an item with a missing action fails only at commit.
- **Concurrent Start can double-run items** and **Retry can overlap a running loop** (two FLAG items above); the server-side gates (budget, kill switch, pre-model gate) still apply to every run, but the same item may be drafted twice.
- **Three-item cost model.** A pack is up to three drafts and up to three deliveries (DEC-14 safe default); each is counted only on first export of an approved version.
- **`neon:readiness` is unchanged** and does not check the pack tables beyond the journal.

#### Open questions (recorded, not resolved here)

- **DEC-14** (delivery units for multi-output promotions and packs) remains **open**; its safe default applies (each approved version counts once, on its first export). No counting code changed.

### Not run / blocked

- **The hosted migration: not run (DEC-11).** `0012` has never touched a Neon or any hosted database. `apply-0012.sql` was prepared and rehearsed on a local Docker `postgres:16` only.
- **A real-model evaluation: not run (DEC-04).** `EVAL_LIVE` was never set and no key was supplied. `eval:workflows -- --budget-usd 1` refused with exit 2 (`not_enabled`) and `eval:workflows -- --check-load` printed `load ok: 31 cases`. This slice adds no agent and no corpus case; the pack runs the existing agents.
- **P4.3 (contextual assistant): not started.** It follows in its own spec. P4.5 (preview) and P4.6 (publishing) are not built, blocked by DEC-12 and DEC-13, which are not authorized. Packs add no publishing.
- **Literal Turbopack `build`, `test:secret-boundary`, `e2e` and `e2e:acceptance` on this Windows machine: blocked** by the standing local `radix-ui` cascade recorded at every earlier phase (`Module not found: Can't resolve '@radix-ui/react-dismissable-layer'`, raised from `@radix-ui/react-tooltip` through `components/ui/tooltip.tsx` → `components/ui/sidebar.tsx` → `components/product-ui.tsx` → `app/[locale]/owner/[workspaceSlug]/layout.tsx`; no file this branch changes is in the trace). P4.1's run was not blocked, so this is intermittent on this machine; CI on `ubuntu-latest` is the real gate. The `--webpack` diagnostics were run and are recorded separately in `PHASE-4-TEST-RESULTS.md`; they are **not** the literal gates.
- **Hosted verification of any kind:** no deployed request, no production Neon query, no real mail, Stripe or model call. `e2e:live`, `e2e:neon-auth` and `neon:readiness` were not run (they need keys or a hosted target).

### Owner actions

1. **Apply `0012`** by running [`rollout/apply-0012.sql`](rollout/apply-0012.sql) in the Neon SQL Editor as `neondb_owner`, on a Neon test branch of production first and then on production. It refuses unless the journal is exactly `0001`–`0011`, so `apply-0011.sql` must already be applied.
2. **Deploy.** Unlike `0011`, deploying before `0012` is harmless while `WORK_PACKS_ENABLED` is unset: no code path reads or writes the pack tables (proved by `test/integration/neon-work-packs-flag-off.integration.test.ts` against a schema that stops at `0011`). So the order of steps 1 and 2 is free; both must precede step 3.
3. **Set `WORK_PACKS_ENABLED=true` and redeploy** (an environment variable change takes effect on the next deployment). Set it only after `0012` is applied: with the flag on and no `0012`, Start fails and the pack routes answer 503.
4. **Rollback: unset the flag and redeploy.** Home returns to the Fix Pack card, and the pack page and every pack route answer 404. Packs and their items stay in the database; the actions they point to are ordinary actions that stay listed and workable (draft, approve, export) on the actions pages. Nothing is deleted and `agent_runs` is untouched. `0012` is additive and is not rolled back.

DEPLOY.md carries the same order ([`docs/integration/DEPLOY.md`](../../integration/DEPLOY.md), "P4.2 visibility starter pack: migration 0012 and the flag").

### Runbook — `apply-0012.sql`

The statement is [`rollout/apply-0012.sql`](rollout/apply-0012.sql). It was generated from the migration files on disk by a scratch script (kept outside the repository) that imports the repository's own `loadMigrations()` and hashes each file's text exactly as `applyMigrations` does; nothing embedded was typed. It is one `DO $apply$ … $apply$;` block that
- runs `SET LOCAL ROLE smeassistant_migrator`, and refuses unless `current_user` is that role;
- takes the runner's lock, `pg_advisory_xact_lock(1936549221, 3)` (`scripts/neon/migrations.ts`);
- refuses unless `neon_migrations.journal` is **exactly** ordinals 1–11 with the names and sha256 checksums of `neon/migrations/0001…0011`, as `loadMigrations()` computes them;
- `EXECUTE`s the exact text of `0012_work_packs.sql` inside `$m0012$` (the generator also refuses if the text contained `$m0012$` or `$apply$`);
- inserts journal row `(12, '0012_work_packs.sql', 'e7933f6caac57dbc7384aae24c0fd86316cf3b521167432fe483df58cc9b7289')`.

After generation every checksum was re-derived independently with `sha256sum` over the file bytes and each appears in the statement. Rows 1–11 are identical to `apply-0011.sql`'s (row 11 carries the checksum `apply-0011.sql` records). The embedded text between the `$m0012$` tags is byte-identical to `0012_work_packs.sql` (3,760 bytes, ASCII, no CR; checked with a byte comparison). The existing `.gitattributes` line `docs/implementation/owner-platform-v1/rollout/*.sql text eol=lf` already covers the new file (`git check-attr eol` reports `lf`).

**Rehearsal (2026-10-03, disposable `postgres:16`, server 16.15, run twice, identical results after masking the container name).** The roles matched production, as in the earlier rehearsals: `neondb_owner` LOGIN CREATEROLE owning database `neondb`; `neondb_owner` created `smeassistant_migrator` NOLOGIN and `sme_app_runtime` NOLOGIN, and granted the migrator CREATE on the database and USAGE, CREATE on schema `public`. `0001`–`0009` were applied as the migrator through the repository's own `applyMigrations` (a pool whose connections `SET ROLE smeassistant_migrator`). `0010` and `0011` were then applied by running `apply-0010.sql` and `apply-0011.sql` themselves as `neondb_owner`, the way production gets them. The container was bound to `127.0.0.1` only and removed afterwards. Each block was sent as one query, as `neondb_owner`:

| # | Check | Result |
|---|---|---|
| 1 | Before `GRANT smeassistant_migrator TO neondb_owner WITH SET TRUE` | **refused**: `42501 permission denied to set role "smeassistant_migrator"`. Catalog and journal snapshot unchanged. |
| — | The grant, run as `neondb_owner` | succeeded (`set_option = true`, `inherit_option = true`, grantor `neondb_owner`) |
| 2 | Wrong journal: `0001`–`0009` only (`0010` and `0011` not applied) | **refused**: `P0001 apply-0012 refused: neon_migrations.journal is not exactly 0001-0011 with the expected checksums (it has 9 rows)`. Snapshot unchanged. |
| — | `apply-0010.sql` then `apply-0011.sql`, as `neondb_owner` | applied, with their documented notices; journal 11 rows |
| 3 | Wrong journal: rows 1–11 present, row 11's checksum altered (inside a transaction, rolled back) | **refused**: `P0001 apply-0012 refused: … (it has 11 rows)`. No `work_packs` table; snapshot unchanged after the rollback. |
| 4 | First run (journal exactly `0001`–`0011`) | **applied**, with notices `policy "server_application" for relation "public.work_packs" does not exist, skipping`, the same for `public.work_pack_items`, and `apply-0012: applied 0012_work_packs.sql and recorded journal row 12`. Journal rows 1–12 with the expected names, every checksum equal to `loadMigrations()`'s, row 12 `e7933f6c…7289`. Both tables exist. |
| 5 | `applyMigrations` with all twelve, as the migrator | returned `[]`: nothing pending, so the runner accepts the journal's checksums |
| 6 | Ownership and runtime access | `work_packs`, `work_pack_items`, both primary-key indexes, `work_packs_open_idx` and `work_pack_items_action_idx` are owned by `smeassistant_migrator`; both tables have RLS on with policy `server_application` (`ALL`, `sme_app_runtime`). `sme_app_runtime` has SELECT, INSERT, UPDATE and DELETE on both; `PUBLIC` has none. `work_pack_items_action_id_fkey` is deferrable, initially deferred, `NO ACTION`; the other FKs are `CASCADE` (pack, workspace, location) and `SET NULL` (`created_by`). Under `SET ROLE sme_app_runtime` (rolled back): a pack and three items inserted, a second open pack for the same workspace, location and kind failed `23505 work_packs_open_idx`, an unknown kind failed `23514 work_packs_kind_check`, deleting an action a pack points to failed `23503 work_pack_items_action_id_fkey`, and deleting the workspace cascaded through packs, items and actions (0 / 0 / 0 remaining). |
| 7 | Second run | **refused**: `P0001 apply-0012 refused: … (it has 12 rows)`. Snapshot unchanged. |

The snapshot is an md5 over every relation (kind, owner, RLS, ACL), column, constraint, policy, index and function (signature, owner, body md5, ACL) in `public` and `neon_migrations`, plus the journal rows. After the rehearsal `corepack pnpm db:verify` was part of the gate run below: `0001`–`0012`, replay `[]`. The generator and the rehearsal script were scratch files and are **not committed**. **`apply-0012.sql` has never been run against any Neon database.**

### Verification

Full detail is in `PHASE-4-TEST-RESULTS.md`. One line per gate, run 2026-10-03 at `a071ff3` plus the documentation edits (no code changed in this task):

| Command | Result |
|---|---|
| `corepack pnpm typecheck` | **passed**, exit 0 (root and all four packages). |
| `corepack pnpm lint` | **passed**, exit 0, `0 errors, 30 warnings` across 18 files (the same 30 as the P4.1 record; none of the 18 files is a file this branch changed). |
| `corepack pnpm test` | **Not a clean pass: four full runs, each failed (exit 1), every failure a 5,000 ms load timeout** in the known flakes. Run 1: five files (`scan-claim-single-path`, `scan-events-single-writer`, `app/api/actions/[actionId]/route.test.ts`, `app/api/versions/[versionId]/versions.test.ts`, `app/api/actions/[actionId]/versions/route.test.ts`). Run 2: `scan-claim-single-path`, `scan-events-single-writer`. Runs 3 and 4: `app/api/versions/[versionId]/versions.test.ts` only. All five run-1 files **alone**: 5 files / 34 tests passed. Because the script chains its stages with `&&`, the later stages were run separately and all passed: `safe-media` 1 / 62, `region` 3 / 23, `scoring` 16 / 183, `contracts` 3 / 20, `scan-engine` 28 / 299. A diagnostic app run with `--testTimeout=30000` (not the gate) passed 334 / 334 files, 3,913 / 3,913 tests. App part: 334 files / 3,913 tests (+7 / +85 over the P4.1 record), **385 files / 4,500 tests** in all. Recorded, not hidden. |
| `NEON_INTEGRATION=1 corepack pnpm test:integration` | **passed**, 43 files / 463 tests, first run (P4.1 record: 41 / 441). |
| `corepack pnpm db:verify` | **passed**, `0001`–`0012`, replay empty, **40 tables / 477 columns / 198 constraints / 102 indexes / 8 triggers / 18 functions** (P4.1: 38 / 465 / 188 / 98 / 8 / 18). |
| `corepack pnpm test:no-supabase` / `test:no-self-service-claim` | **passed** / **passed**. |
| `corepack pnpm eval:workflows -- --check-load` | `load ok: 31 cases`, exit 0 (no pack case was added). The live evaluation was not run (DEC-04). |
| `corepack pnpm build` (literal, Turbopack) | **blocked**, exit 1: the `radix-ui` cascade above. Diagnostic `next build --webpack`: **passed**, `Compiled successfully in 41s`, route manifest includes `/[locale]/owner/[workspaceSlug]/packs/[packId]`, `/api/packs/[packId]` and `/api/workspaces/[workspaceId]/packs`. |
| `corepack pnpm test:secret-boundary` (literal) | **blocked**, exit 1 (it shells out to the Turbopack build). Diagnostic with a temporary `--webpack` on its build step (reverted): **passed**, `Secret boundary passed across 148 public artifacts.` |
| `corepack pnpm e2e` (literal) | **blocked**, exit 1: `Acceptance service not healthy: http://localhost:3100` (the Turbopack dev server answers 500 on `/en/owner/sign-in`). Diagnostic with a temporary `--webpack` on the dev server in `test/e2e/environment.ts` (reverted): **30 / 31 passed**; the one failure is `owner-shell.spec.ts:16`, the same diagnostic-only failure recorded under P4.4 (`getByRole("alert")` resolves to the page's `<p role="alert">` and Next's `#__next-route-announcer__`); neither file is changed by this branch, and the literal Turbopack run passed it 31 / 31 under P4.1. |
| `corepack pnpm e2e:acceptance` (literal) | **blocked**: the first eight tests each failed with `Acceptance service not healthy` (about 65 s each), and the run was stopped by hand (taskkill of the Playwright process tree) rather than burn the remaining 32 timeouts; exit 1 is the stopped run's. Diagnostic with the same temporary `--webpack` (reverted): **passed 40 / 40 on the first run** (9.0 min), including `work-pack.spec.ts`. |
| Rehearsal | `apply-0012.sql` on a disposable `postgres:16`: seven checks, run twice, identical (see the runbook above). |
| Blocked | The literal `build`, `test:secret-boundary`, `e2e` and `e2e:acceptance` (local Windows Turbopack only). |

### Invariants

- `git diff a71c5df..a071ff3 --stat -- neon/migrations packages lib/agents/__snapshots__` lists only `neon/migrations/0012_work_packs.sql` (62 insertions): no `0001`–`0011` edit, no vendored-package edit, no agent snapshot change.
- No added or removed line of the code diff mentions `agent_runs` (`git diff a71c5df..a071ff3 -- . ':!docs' ':!.superpowers' | grep '^[+-]' | grep -i agent_runs` prints nothing; three unchanged context lines name it); `lib/repositories/fix-pack.ts` and the fix-pack-drafts route are unchanged.
- No counting code changed: no migration touches `export_output_version`, `approve_output_version` or `workspace_usage`. The only SQL added is the two new tables.
- With the flag off, no code path issues SQL against `work_packs` or `work_pack_items` (Task 5's recorded-statement test).
- No approve, export, reject or bulk control exists on the pack card or page in any state or locale (component tests), and the acceptance journey asserts it before the export.
