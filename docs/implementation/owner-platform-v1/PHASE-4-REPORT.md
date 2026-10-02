# Phase 4 report

Phase 4 of the owner-platform plan (Master Plan §7). Two slices are built so far: P4.4 (reusable workflow contract) and P4.1 (confirmed offers and promotion copy). P4.2 and P4.3 have not been started, and P4.5 and P4.6 are deliberately not built.

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

**Branch** `p41-offers`, base `dc55e02` (`origin/main`, PR #27, the merged P4.4 slice). Spec commit `d3ecd5f`, plan `5cb3256`, implementation commits `9eaf60f`..`31970f9` (12 commits, listed below), then this documentation commit. Committed diff before this commit: 92 files, 8,623 insertions, 67 deletions (two of the files are the spec and the plan). Worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p41-offers`. Node `v24.18.0`, pnpm `9.12.0` via corepack, Windows 11 Pro 10.0.26200, Docker Server `29.7.2`, `postgres:16` (server 16.15). Gates run 2026-10-02.

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

### Spec correction (made during the build)

Spec §1.3 said `createVersion` in `lib/workspace/versions.ts` is "the only writer" of version meta. That was wrong: an agent run writes its version through `finish`, which does not go through `createVersion`. Both converge on **`artifactRepository.createOutputVersion`**, so the revision-binding rule lives there. The spec sentence was corrected in the Task 6 commit (`4117750`). Without that, a run's version would have been the one path with no recorded revision, and so permanently stale.

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

- **An offer is a fact record the owner confirms.** Editing any fact bumps the revision, resets the offer to `draft` and clears the confirmation. Only a `confirmed`, unexpired offer can feed a draft.
- **A draft is bound to the offer revision it was written from.** If the offer is edited, expires (workspace-local date: usable through the whole of its `valid_until` day), is archived or is no longer confirmed, approving or exporting that draft answers 409, with owner copy telling them to generate a new draft. A hand edit of a stale draft does not make it current, and a forged `meta.offer_revision` is stripped.
- **The delivery unit is shown first.** The panel states "creates 2 drafts (Instagram, Google); nothing is counted until you approve and export a draft; each one you export counts as 1 delivery" (and, when the allowance is finite, how much of the month is used) before any request is sent.
- **Nothing about counting changed.** Each approved version counts once, on its first export; generation, edits and refusals cost nothing in usage. Spend budgets and the AI kill switch apply unchanged because runs go through the existing route.
- **Nothing is sent or published.** Drafts are copy or export text only.
- **With the flag off nothing is visible.** The page and every offer route answer 404 and the nav entry is hidden.

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

#### Deferred minor findings (not acted on in this slice)

Grouped from the task-by-task reviews. **The two items marked FLAG are the ones to look at in the final review.**

- **Task 1 (migration):** `scripts/neon/catalog.ts` checks only the existence of `offer_is_expired`, `confirm_offer` and `archive_offer` (their bodies are pinned by behaviour tests only); `neon-offers.integration.test.ts` applies migrations in the first `it`, so a single test selected with `-t` fails (order-dependent); `offers_terms_check` and the title/details upper bounds have no failing-insert test; `offers.location_id` has no SQL guarantee that the location belongs to the same workspace (the Task 4 route validates it).
- **Task 2 (approve/export guard):** no test pins the check order changed-before-expired (a draft that is both stale and expired answers `offer_changed`); the offer guard runs before the already-approved / `not_approved` / `version_closed` checks, so an idempotent re-approve of a stale offer draft returns `offer_changed` (plan-mandated placement; the owner copy handles it); `verifyCatalog`/`neon:readiness` check only existence of approve/export (R6); the serialize test's `finally` sends `ROLLBACK` after `COMMIT` (a harmless notice).
- **Task 3 (domain rules):** `parseOfferBody` counts UTF-16 units, not code points (strict side: an emoji-heavy title near 120 is rejected early); `hasAtMostTwoDecimals` is float-fragile above ~1e9 (use `Number(n.toFixed(2)) === n`); the 20-entry list cap is applied before trim/dedupe; year `0000` passes the parser but fails in Postgres (a 500); `canReadOffer(scopedManager, "L2")` is not asserted; `date::text` depends on `DateStyle` (ISO is the default); a no-op edit still bumps the revision and resets a confirmed offer to `draft` (spec-conformant).
- **Task 4 (routes):** the GET/POST workspace-offers handlers call `authorizeWorkspaceRequest` outside the `try`, so an identity or database outage is an unhandled 500 where the other handlers answer 503; `archive_offer` has no location guard (a millisecond TOCTOU against a concurrent owner relocation; PATCH and confirm are protected by `expected_revision`); `loadOfferScope` runs before auth, so 404 vs 401/403 is an existence oracle and costs one unauthenticated, unrate-limited read; PATCH returns `{error:"not_found"}` where confirm/archive return `offer_not_found`; test gaps: an unauthorized caller consuming no rate-limit token, the flag-off test not asserting the artifact/asset/limiter stay untouched, PATCH asset validity at the new location; the SQL-written `offer.confirmed`/`offer.archived` are labelled but not tied into `AUDIT_EVENTS` by `satisfies`.
- **Task 5 (agent and checks):** `offer_prohibited_term` duplicates the shared `prohibited_term:<x>` warning (the spec says "merged", so it conforms; a corpus assertion must be contains-style); price suffix forms `1280 HKD`, `1280港元` and `港幣1280` are not recognised (a noise warning rather than a false pass), a range checks only its first number, and `20% off` and `HK$ 1,280` have no explicit test; the month-word match uses `mon[a-z]*`, so `19 marinated` can satisfy `19 March` (anchor to real month names).
- **Task 6 (run path):** the `artifacts.ts` doc comment overstates "same client" on the route path (pool connections; safe because `offer_id` and the base meta are immutable); `ActionRow.offer_id` is optional, so a loader that omits the column fails closed; the runs test "never sees an offer's terms" is trivially true (it duplicates the throwing-`get` test); `asRecord(input.meta)` narrows a non-object meta to `{}` before SQL (no caller passes one).
- **Task 7 (corpus):** `malicious_review-05` "inside the fence" is non-positional (fence containment is proven only in `agents.test.ts:441-459`); `fabricated_claim-06/07/08` lack `warningsExclude` for sibling `offer_*` codes; `locale_market-03` has no `warningsExclude` (it tolerates a draft with warnings).
- **Task 8 (promotions route):**
  - **FLAG FOR FINAL REVIEW.** `canUseOffer` is checked on `scope.locationId` (read before authorization) but the action is created at `offer.locationId` from a second read, so a concurrent PATCH relocation opens a TOCTOU window. The fix is to run `canUseOffer` again on the offer as read.
  - **FLAG FOR FINAL REVIEW.** After an offer moves location and is re-confirmed, `/promotions` returns the **old** open action (still at the old location) as `created: false`, and `offerSatisfied` then refuses that action forever (location mismatch) with no explanation to the owner. The dedupe key does not include the location.
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
- **No assistant promotion intent** and no draft for a messaging channel; the assistant's rewrite path on an offer action inherits the base revision, so freshness still holds.
- **`neon:readiness` is weaker for approve/export** after R6 (existence only).

#### Open questions (recorded, not resolved here)

- **DEC-14** (delivery units for multi-output promotions and packs) remains **open**; its safe default applies (each approved version counts once, on its first export). No counting code changed.
- **The two Task 8 FLAG items** above need a decision before the flag is turned on for relocated offers: re-check `canUseOffer` on the offer as read, and decide whether a relocated offer should supersede its open action or surface a clear message.

### Not run / blocked

- **The hosted migration: not run (DEC-11).** `0011` has never touched a Neon or any hosted database. `apply-0011.sql` was prepared and rehearsed on a local Docker `postgres:16` only.
- **A real-model evaluation: not run (DEC-04).** `EVAL_LIVE` was never set and no key was supplied. `eval:workflows -- --budget-usd 1` refused with exit 2 (`not_enabled`) and `eval:workflows -- --check-load` printed `load ok: 31 cases`. The corpus proves the **pipeline** handles each offer case with canned outputs; it says nothing about how any model behaves with offers.
- **P4.2 (work packs), P4.3 (contextual assistant): not started.** They follow in their own specs.
- **P4.5 (preview) and P4.6 (publishing): not built**, blocked by DEC-12 and DEC-13, which are not authorized. Offers add no publishing.
- **Hosted verification of any kind:** no deployed request, no production Neon query, no real mail, Stripe or model call. `e2e:live`, `e2e:neon-auth` and `neon:readiness` were not run (they need keys or a hosted target).

### Owner actions

1. **Apply `0011` before deploying this code, not merely before enabling the flag.** Run [`rollout/apply-0011.sql`](rollout/apply-0011.sql) in the Neon SQL Editor as `neondb_owner`, on a Neon test branch of production first and then on production. It refuses unless the journal is exactly `0001`–`0010`, so `apply-0010.sql` must already be applied. **Why before the deploy:** the flag only hides the offers page and routes. The shared action queries (`ACTION_COLUMNS` in `lib/repositories/workspace-read.ts`) and the version-writing gateway (`artifactRepository.createOutputVersion`) select `actions.offer_id` unconditionally, so this code against a database without `0011` fails every action read and every version write. Applying `0011` ahead of the deploy changes nothing for owners: the column is nullable and every existing row is null.
2. **Deploy with `OFFER_PROMOTIONS_ENABLED` unset.** It defaults off and is blank in `.env.example`.
3. **Then set `OFFER_PROMOTIONS_ENABLED=true` and redeploy** (an environment variable change takes effect on the next deployment). Settle the two Task 8 FLAG items first if offers will be moved between locations.
4. **Rollback is the flag.** Unset it and redeploy: the page and every offer route answer 404 and the nav entry disappears; existing offers and drafts stay in the database and nothing is deleted. `0011` is additive and is not rolled back; the re-created approve/export functions behave exactly as before for any action without an `offer_id`.

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
