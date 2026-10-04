# Phase 4 report

Phase 4 of the owner-platform plan (Master Plan §7). Six slices are built: P4.4 (reusable workflow contract), P4.1 (confirmed offers and promotion copy), P4.2 (work packs: the visibility starter pack), P4.3 (the contextual assistant, without added authority), P4.5 (the conditional acquisition preview: one unsaved review-reply draft, off by default, DEC-12 decided 2026-10-04) and P4.6 (the conditional single publishing connector: one approved review reply to Google Business Profile, off by default, DEC-13 and DEC-14 decided 2026-10-04, activation needs a separate release approval). The earlier sections' "P4.6 not built" lines describe the state when they were written.

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

- **One pack per location, idempotent.** "Start your visibility starter pack" lists the three items and states the delivery unit first: "Creates up to 3 drafts. Nothing is counted until you approve and export a draft; each one you export counts as 1 delivery." (on a capped plan, followed by " This month: n of m used."). Start creates or reuses the three actions, then drafts them one at a time. Starting again while the pack is unfinished returns the same pack, and nothing is drafted automatically for a pack that already existed: the card shows it with Continue instead (final-review fix G4). Once every item's action is completed, dismissed, cancelled or expired, Home shows Start again with a "View last pack" link; the next Start closes that pack and opens a new one (G1).
- **Actions the scan already created are reused unchanged.** If an open action with the derivation key exists it is the pack item; otherwise a fresh action is created (source `owner_objective`) and a later scan refreshes its evidence through derivation's existing upsert without duplicating it or changing `source`. If a template's only action is finished, a fresh open action is created for the new pack and the finished one is untouched.
- **Nothing is re-spent on work that exists.** The loop skips any item whose action is finished or whose latest version is `draft`, `changes_requested` or `approved`.
- **The FAQ item usually stops at "needs your facts".** It needs three owner facts; that is a normal outcome (a link to its action page), not a failure.
- **Spend is refused mid-pack, once.** When an item's run answers `ai_paused` or `ai_budget_reached`, no further item is run, the existing pause or budget copy is shown once, and that item reads "Paused — continue later" (not a failure, no Retry).
- **Continue.** The card and the pack page offer Continue to an owner or in-scope manager when nothing is running, the pack is not finished, and some item is still waiting (not started or paused). It drafts those items in order: after a refusal, after a reload, or on a pack someone else started. Retry and Continue are hidden while any run is in flight (G2, G3).
- **Review stays per version.** "Review next" opens the first item with a draft to review, on its action page. The pack page is read-only for approval: Retry, Continue and links only, and a closed or finished pack runs nothing. A finished item with no version reads "Done" or "Dismissed" (G5).
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
| P6 | One final fix wave, G1–G6 (final review): all four important findings are fixed before merge although the feature ships dark, because they share one card and hook region and must be fixed before the flag is ever enabled. A refused row gets its own `paused` state; after a `created: false` start the client shows Continue instead of running the items. Four cheap minors are ruled in; the rest stay deferred. | A second owner who presses Start sees Continue rather than an automatic run: one extra click. |

Also recorded: the trailer on each commit names the model that wrote it (three Opus, five Sonnet, counting the spec and plan), as in P4.1 R13/R15; commits are not amended.

#### Deferred minor findings (not acted on in this slice)

Grouped from the task-by-task reviews. The three items that were marked FLAG for the final review, and three of the minors, were **fixed in the final-review fix wave** (G1–G5, below); they stay listed here, marked fixed, so the record of what was deferred stays readable.

- **Task 1 (migration):** the deferred-FK timing (error at `COMMIT`; an item delete plus an action delete in one transaction succeeds) is not pinned by a test; an item with a nonexistent `action_id` also fails only at commit (a note for Task 2); `work_packs.created_by ON DELETE SET NULL` is untested (as for `0010` and `0011`).
- **Task 2 (start and overview):** the second concurrency interleaving (two starts racing over a finished open pack) is reasoned, not tested; `nextToReview`'s position sort has no out-of-order unit case; **fixed (G5, `b92f7ee`):** `startPack` and the reads used to rethrow generic codes (`pack_start_failed`, `pack_read_failed`) without logging the cause; the audit label `入門套裝` is shown to zh-TW readers because the labels table has only `en` and `zh` slots (the zh-TW pack title is `入門套組`).
- **Task 3 (routes):** authorization sits inside the `try` in `GET /api/packs/[packId]` (an identity outage is 503) but outside it in the two workspace-packs handlers (500); the `[packId]` test does not assert that `loadWorkspaceContext` receives `auth.membership`.
- **Task 4 (card and page):**
  - **Fixed (G4, `ab3dffc`), was FLAG.** Two people pressing Start at once get one pack (Start is idempotent), but both clients then ran all three items. Now only the call that created the pack runs the items; a `created: false` start refreshes the pack and offers Continue.
  - **Fixed (G2, `4dae03a`, `0a6e615`), was FLAG.** Retry was shown on a failed row while `runAll` was still working, so a Retry click could overlap the loop and run an action twice. Now Retry is hidden while any run is in flight, and the loop skips an action whose row is no longer idle when it reaches it.
  - **Fixed (G3, `4dae03a`, `0a6e615`), was FLAG.** There was no "Continue" after `ai_paused` / `ai_budget_reached` or after a mid-run reload, and a refused item read "Failed — retry". Now the card and the pack page have Continue, and a refused item reads "Paused — continue later".
  - **Fixed (G5, `21cbde7`):** a finished item with no version showed "Not started".
  - Still deferred: the zh-TW pack copy uses 你 where the offers copy uses 您, and the stop-reason-to-status mapping is duplicated in `pack-card` and `pack-view`; the pack page maps a transient read error to 404, and multi-location Home costs three queries per location; `lib/workspace/packs.ts` imports page-context and a component type (layering).
- **Task 5 (flag-off safety):** the "flag unset" case stubs `""` rather than `undefined`; the flag-on case asserts exactly `["42P01"]`, which assumes one pack read; the test covers `getHomeBrief` and `loadHomeWorkPacks`, not `loadOwnerPage` or `loadWorkspaceProblems`.
- **Task 6 (acceptance):** Start (a mutating click) is driven by a hand-rolled retry rather than a single click after hydration (safe: Start is idempotent and the retry is guarded); the "no approve or export control on the card" assertion is not repeated after the export; the 180 s timeout headroom is tight.

#### Known limits

- **One fixed pack kind.** `visibility_starter` only, with exactly three items. No custom or owner-built packs, no bulk approval, no packs spanning locations, no offer packs, no regenerating every item at once.
- **The FAQ item usually needs owner facts.** Three owner facts are required before it can draft, so the starter pack typically ends with two drafts ready and the FAQ item waiting on the owner. That is the designed outcome.
- **A multi-location "all" view cannot start a pack.** With `?location=all` in a workspace with several locations there is no single location to start for. Home shows the open packs for the in-scope locations (and a workspace-wide pack) and the text "Choose a location to start a starter pack", with no Start button.
- **A workspace-wide pack needs a whole-workspace caller (Ruling P3).** A location-scoped manager cannot start one.
- **Ruling P2's deferred FK.** Deleting an action a pack points to fails at commit, not at the statement; an item with a missing action fails only at commit.
- **Continue on a pack another person is still running.** After the G4 fix a second Start runs nothing; it shows Continue for the items still waiting. Continue leaves alone any item already generating, but if the second person presses it before the first person's loop has reached an item, both browsers can draft that item. This takes a deliberate click (Ruling P6), and the server-side gates (budget, kill switch, pre-model gate) still apply to every run.
- **A finished pack stays open until the next Start.** Home shows Start and a "View last pack" link (G1); the pack is closed by that Start, as before.
- **Three-item cost model.** A pack is up to three drafts and up to three deliveries (DEC-14 safe default); each is counted only on first export of an approved version.
- **`neon:readiness` is unchanged** and does not check the pack tables beyond the journal.

#### Open questions (recorded, not resolved here)

- **DEC-14** (delivery units for multi-output promotions and packs) remains **open**; its safe default applies (each approved version counts once, on its first export). No counting code changed.

### Not run / blocked

- **The hosted migration: not run (DEC-11).** `0012` has never touched a Neon or any hosted database. `apply-0012.sql` was prepared and rehearsed on a local Docker `postgres:16` only.
- **A real-model evaluation: not run (DEC-04).** `EVAL_LIVE` was never set and no key was supplied. `eval:workflows -- --budget-usd 1` refused with exit 2 (`not_enabled`) and `eval:workflows -- --check-load` printed `load ok: 31 cases`. This slice adds no agent and no corpus case; the pack runs the existing agents.
- **P4.3 (contextual assistant): not started.** It follows in its own spec. P4.5 (preview) and P4.6 (publishing) are not built, blocked by DEC-12 and DEC-13, which are not authorized. Packs add no publishing.
- **Literal Turbopack `build`, `test:secret-boundary`, `e2e` and `e2e:acceptance` on this Windows machine: blocked** by the local `radix-ui` cascade, recorded at P3 and P4.4, not seen at P4.1, cause unconfirmed (`Module not found: Can't resolve '@radix-ui/react-dismissable-layer'`, raised from `@radix-ui/react-tooltip` through `components/ui/tooltip.tsx` → `components/ui/sidebar.tsx` → `components/product-ui.tsx` → `app/[locale]/owner/[workspaceSlug]/layout.tsx`; no file this branch changes is in the trace). CI on `ubuntu-latest` is the real gate. The `--webpack` diagnostics were run and are recorded separately in `PHASE-4-TEST-RESULTS.md`; they are **not** the literal gates.
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

### Final-review fix wave

The final whole-branch review (`a71c5df..02b5e70`) returned four important and six minor findings and accepted rulings P1–P5. The controller ruled one fix wave, G1–G6 (Ruling P6): all four important findings, four of the minors, and this documentation; the other deferred minors stay as listed above. Five code commits on top of `02b5e70`, then this documentation commit: `4dae03a`, `0a6e615`, `ab3dffc`, `21cbde7`, `b92f7ee`. No migration (`0012` untouched), no vendored-package edit, no prompt or snapshot change, no change to approval, export or counting. Each code change was written test-first (the new or changed tests failed before the fix and pass after it). The P4.1 `OfferPromotionPanel` keeps `stopOnRefusal: false`; its test file is unchanged and passes, and its only edit is the one-line `paused → failed` entry its status map needs to type-check (a row there is never `paused`).

| Finding | Fix | Commit | Covering tests |
|---|---|---|---|
| G1 (important) a finished pack could never be restarted from the UI | When the open pack is `finished`, the Home card shows the start state again (items, the exact disclosure, Start for those who can act) plus a "View last pack" link to the finished pack's page. Start calls `startPack`, which closes it and opens the next (server unchanged). | `ab3dffc` | `pack-card.test.tsx` "lets a finished pack be followed by a new one" (heading, disclosure, link to `pack-old`, no Continue, Start calls `startPack`, the new pack runs, "View pack" points at `pack-new`) and "shows a viewer the finished pack's link but no Start". |
| G2 (important) Retry offered while the loop runs, so one item could be drafted twice | `useSequentialRuns` reports `running`; Retry is hidden while any run is in flight (`canRetry={canAct && !running}`) on the card and the pack page, and `runAll` skips an action whose row is no longer idle (a paused row counts as idle) when the loop reaches it. | `4dae03a` (hook), `0a6e615` (UI) | `use-sequential-runs.test.tsx` "skips an action retried before the loop reached it" (calls `a, b, c`, was `a, b, b, c`) and "is running while a loop or a retry is in flight"; `pack-card.test.tsx` "renders no Retry and no Continue while a run is in progress"; `pack-view.test.tsx` "shows a refused item as paused with no Retry, and no Retry or Continue while a run is in progress". |
| G3 (important) no Continue after a refusal or reload; a refusal read as a failure | A row stopped by `ai_paused` / `ai_budget_reached` is `paused`, rendered "Paused — continue later" (zh-HK and zh-TW 已暫停，稍後可繼續) with no Retry; the pause or budget copy still shows once. Continue (繼續) on the card and the pack page, for an owner or in-scope manager, when nothing is running, the pack is not finished and some item is still waiting; it runs those items in order, then refreshes. "Waiting" is the `packActionsToDraft(pack)` list narrowed to items shown as not started or paused: a failed item keeps its own Retry, an item asking for facts needs the owner's facts rather than another run, and an item already generating elsewhere is left alone (so Continue never shows as a button that would run nothing). | `4dae03a`, `0a6e615` | `use-sequential-runs.test.tsx` "stops on ai_paused / ai_budget_reached" (row `paused`), "a refused retry is paused and reported once, not failed", "runs a paused row again when the loop is continued"; `pack-card.test.tsx` "shows a refused item as paused, not failed, with no Retry", "offers Continue on an open pack after a reload, and it runs only the idle items, in order" (`act-1`, `act-3`), "offers no Continue when nothing is left to run …"; `pack-view.test.tsx` "offers Continue for the idle items, runs them in order, then refreshes". |
| G4 (important) two clients pressing Start both drafted every item | After `startPack` the loop runs only when `created === true`; with `created: false` the card refreshes the pack and shows Continue. | `ab3dffc` | `pack-card.test.tsx` "runs nothing when Start joins a pack that already existed, refreshes it and offers Continue" (`runAction` not called, `getOpenPack` called, Continue then runs `act-2`, `act-3`). The older test "skips an item whose action is finished" now starts a `created: true` pack, since a joined pack no longer runs on its own (deliberate). |
| G5 (minor) finished item read "Not started" | A finished action with no version reads "Done" (completed) or "Dismissed" (dismissed, cancelled, expired); zh-HK and zh-TW 已完成 / 已略過. | `21cbde7` | `pack-view.test.tsx` "labels a finished item with no version Done or Dismissed, never Not started". |
| G5 (minor) pack page Retry/Continue on a finished, unclosed pack | `canAct` on the pack page also requires `!pack.finished`. | `21cbde7` | `pack-view.test.tsx` "offers no Retry or Continue on a finished pack that is not closed yet" (a completed action whose last run failed and whose only version was rejected: no button at all). |
| G5 (minor) deferred FK not visible in the schema mirror | Comment on `work_pack_items_action_id_fkey` in `lib/db/schema/business.ts`: the real constraint is `DEFERRABLE INITIALLY DEFERRED` (Ruling P2); the mirror is types-only. | `b92f7ee` | none (comment). |
| G5 (minor) start and read failures swallowed their cause | `packRepository` logs `console.error("[packs] start failed", { category: "pack_start_failed", code })` and `"[packs] read failed"` / `pack_read_failed` for `openPack`, `getPack` and `packScope`, where `code` is the failure's SQLSTATE or `"unknown"`, never the message; the thrown errors and the routes' answers are unchanged. | `b92f7ee` | new `lib/repositories/packs.test.ts` (3 tests: start, every read path, a cause without SQLSTATE; the database message never appears in the log). `neon-work-packs` and `neon-work-packs-flag-off` integration files re-run. |
| G6 (docs) | This subsection; the FLAG items above moved from open to fixed; the behaviour section, known limits and Ruling P6; the blocked-gate wording ("recorded at P3 and P4.4, not seen at P4.1, cause unconfirmed"); `IMPLEMENTATION-TRACEABILITY.md` (the partial-completion row, plus the two formerly open items, Retry overlap and concurrent Start, as their own fixed rows; there were no separate rows for them before); `PHASE-4-TEST-RESULTS.md` gate re-runs. | this commit | docs |

**Gate re-runs after the wave** (2026-10-03, sequential, on `b92f7ee`):

| Command | Exit | Result |
|---|---|---|
| `corepack pnpm typecheck` | 0 | **passed** (root and all four packages). |
| `corepack pnpm lint` | 0 | **passed**, `0 errors, 30 warnings` (unchanged; none in a file this wave touched). |
| `corepack pnpm test` | 0 | **passed on the first full run, no flake.** App part **335 files / 3,931 tests** (+1 file, +18 tests: hook +4, card +7, page +4, repository +3); `safe-media` 1 / 62; `region` 3 / 23; `scoring` 16 / 183; `contracts` 3 / 20; `scan-engine` 28 / 299. Total **386 files / 4,518 tests**. |
| `corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-work-packs.integration.test.ts test/integration/neon-work-packs-flag-off.integration.test.ts` | 0 | **passed**, 2 files / 19 tests (the files that exercise `lib/repositories/packs.ts`). The full `test:integration` suite was not re-run. |
| `corepack pnpm exec playwright test --config playwright.acceptance.config.ts work-pack.spec` (literal Turbopack) | 1 | **blocked**: `Acceptance service not healthy` (the local cascade above). Diagnostic with a temporary `--webpack` on the dev server in `test/e2e/environment.ts` (restored, not committed): **passed 1 / 1** (2.0 min). The fresh pack is `created: true`, so Start still drafts every item; on the reloaded Home no Continue appears (the remaining items are a draft and a needs-facts item), so the spec needed no change. |

Not re-run in this wave: `db:verify`, `build`, `test:secret-boundary`, `test:no-supabase`, `test:no-self-service-claim`, `eval:workflows`, the full `e2e` and `e2e:acceptance` suites (no migration, route, agent or build-configuration change; the Task 7 records stand). No real model was called.

## P4.3 — contextual assistant, without adding authority

**Branch** `p43-contextual-assistant`, base `ecc60df` (`origin/main`, PR #29, the merged P4.2 slice). Spec commit `e6cd0ae`, plan `d36b12a`, implementation commits `9958bdb`..`02b5577` (nine, listed below), then this Task 7 documentation commit. Worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p43-contextual-assistant`. Node `v24.18.0`, pnpm `9.12.0` via corepack, Windows 11 Pro 10.0.26200, Docker Server `29.7.2`, `postgres:16`. Gates run 2026-10-03.

Built from `docs/superpowers/plans/2026-10-03-contextual-assistant.md` (Tasks 1–7) against the design in [`docs/superpowers/specs/2026-10-03-contextual-assistant-design.md`](../../superpowers/specs/2026-10-03-contextual-assistant-design.md).

**Implemented and locally verified. Nothing here is hosted-verified.** There is **no migration**: the journal is still `0001`–`0012`, and `git diff ecc60df..HEAD --stat -- neon/migrations packages` prints nothing. Nothing was applied to a hosted database, deployed or pushed, and no paid provider, real model or mail was called. The feature is behind `CONTEXTUAL_ASSISTANT_ENABLED`, which defaults off. This is the last Phase 4 core slice; P4.5 (preview) and P4.6 (publishing) stay unbuilt.

### What this closes

Master Plan §7 P4.3 (Capability Matrix §2 supporting mechanisms; the existing read-only assistant boundary). Before this slice the assistant sheet offered a fixed question list per surface. It never looked at the workspace's state, nothing answered "What detail do you need?" or "Where do I continue?", and an answer ended in a plain-text sentence the owner had to act on by finding the control themselves.

- **Suggestions from state.** When the sheet opens in a real workspace it asks `GET /api/assistant/suggestions` and shows up to three "Needs you now" questions above the usual list: an action that is missing inputs, a draft version waiting for approval, and a Google connection that is missing, expired, revoked or errored. They come from rows the caller is already authorized to read, in that order, each at most once.
- **Two new deterministic questions.** `explain_missing_inputs` ("What detail do you need?") and `where_to_continue` ("Where do I continue?") join the template intents. They never call the model, never read the AI budget and are allowed while AI is paused. With `explain_priority` ("Why this task?") and `explain_change` ("What changed?") all four owner questions are answered from authorized evidence and persisted versions.
- **Link to the real control.** An answer can carry a typed `nextStep` (`provide_inputs`, `review_version`, `open_integrations`, `open_action`, `open_actions`). The server never returns a URL: the browser maps the kind to a link in one pure function, `nextStepHref`, and only when the ids are UUIDs. The link opens the action page at the input form (`#inputs`), at the exact version (`?version=`), or Settings → Integrations. Viewers see the same questions without a link, and an answer that tells them to ask an owner or manager.
- **No new authority.** Nothing in this slice writes to `actions`, `action_runs`, `output_versions`, `deliveries` or `workspace_usage`. A link is navigation; every state change still happens on the page it opens, under that page's own server checks. The intent allowlist is unchanged except for the two read-only additions; there is no new tool, SQL path or cross-workspace read.
- **Minimal audit.** `assistant.run` gains only `origin` (`suggested` or `fixed`) and `next_step_kind`. It never carries answer text, input values or labels. The suggestions route writes no audit row.

### Decisions (user, 2026-10-03)

| Question | Decision |
|---|---|
| How far "suggest the next step" goes | **Link to the right page.** The answer ends with a link button to the exact place. The owner uses the real control there. The assistant gains no mutation power. |
| Which signals raise a suggestion | **Missing inputs, drafts awaiting approval, Google connection broken.** Pack and offer signals are out of scope. |
| How suggestions sit with today's questions | **Suggestions first, fixed list below.** Up to three "Needs you now" questions, then the page's existing questions with duplicates removed. With no signals the sheet looks as it does today. |
| Architecture | **A suggestions endpoint** the sheet calls when it opens, two new deterministic intents, and a typed `nextStep` that the browser maps to a link. |
| Migration | **None.** Every signal reads tables that already exist. |
| Rollout | Flag **`CONTEXTUAL_ASSISTANT_ENABLED`**, on only for the exact string `true`. |

**Plan addition.** `AssistantSuggestion` carries a `kind` (`"missing_inputs" | "review_version" | "google"`) that the spec's type did not have, so the sheet picks a label without parsing `id`. It is a contract addition recorded in the plan (Task 1), not a ruling.

### What changed, by task

| Task | Commit(s) | What it did |
|---|---|---|
| Design and plan | `e6cd0ae`, `d36b12a` | The spec, then the plan. |
| 1. Contract, flag, next-step links | `9958bdb` | `explain_missing_inputs` and `where_to_continue` added to `demoQuestionIds` (the demo runner and the sheet's label table each answer both); `nextStepKinds`, `AssistantNextStep`, `AssistantOrigin`, `AssistantSuggestion`, `nextStep?` on the run response, `origin?` on the request; `contextualAssistantEnabled` (`lib/assistant/flag.ts`, exactly `"true"`); `nextStepHref` (`lib/assistant/next-step.ts`, the only place a kind becomes a URL, `null` on a missing or non-UUID id). |
| 2. Signals and suggestions | `85e4c34` | Pure `buildSuggestions` (`lib/assistant/signals.ts`): order missing inputs → review version → Google, cap 3, each once, role and location scope (§3.9), Google for owners only, viewers without `nextStep`, offer actions excluded; `loadSuggestions` and `loadSignalRows` (`lib/assistant/suggestions.ts`); two read-only repository queries, `assistantWaitingVersions` and `assistantGoogleConnection` (`lib/repositories/artifacts.ts`); `AssistantAccessError` moved to `lib/assistant/errors.ts` (Ruling R1). |
| 3. The two answers | `aa3bc4a`, then the fix round `7dbc0a6`, `852f68b` | Both intents in `lib/assistant/templates.ts` and `lib/assistant/live.ts`, in en, zh-HK and zh-TW; `explain_priority` gains `nextStep: open_action` and `explain_change` gains `open_actions` with their answer text unchanged; answered before the snapshot early return, so they work with no snapshot. Review fix round: Rulings R3–R6 and R6a, and the approval wording scoped to the version rather than the queue. |
| 4. Routes | `3529e48` | `GET /api/assistant/suggestions` (flag off → `200 {"suggestions":[]}` before any auth or SQL; UUID validation; `authorizeWorkspaceRequest`; rate limit scope `assistant_suggestions`, 120/h per user, fail-closed; `Cache-Control: no-store`; no audit row); the run route gates the two intents behind the flag (`404 {"error":"not_enabled"}` before auth), takes membership only (no manager floor, no pause or budget check), validates `origin`, and audits `origin` and `next_step_kind`. Ruling R2: `loadSuggestions` refuses a membership from another workspace before any read. |
| 5. Sheet, mounts, action page | `00712ac`, then the fix `a9fc5ae` | "Needs you now" section above the fixed list, fixed questions with a duplicate intent dropped, suggested questions asked with their own context and `origin: "suggested"`, a "Continue here" link only when `nextStepHref` returns a URL (never in demo mode), a silent fall back to the fixed list on any failed or malformed fetch; the five live mounts pass `basePath`; the action page reads `?version=` (only an id in that action's versions is honoured) and the input form carries `id="inputs"`. Ruling R7. Fix round: a "Continue here" link to another version of the same action selects it, though the page stays mounted. |
| 6. Acceptance journey | `02b5577` | `e2e/acceptance/contextual-assistant.spec.ts` (and `CONTEXTUAL_ASSISTANT_ENABLED=true` in `test/e2e/safety.ts`): an owner with a draft waiting opens the sheet on Home, sees "Where do I continue?", asks it, clicks "Continue here" and lands on `…/actions/{id}?version={versionId}`; no approve, request-changes, reject, export or publish route is requested, and the version, delivery, run and usage counts are unchanged. |
| 7. Gates, rollout, phase record | this commit | The gate run in `PHASE-4-TEST-RESULTS.md`, `.env.example`, `docs/integration/DEPLOY.md`, this report and the traceability rows. |

### Behaviour change for owners

With the flag on:

- **The sheet leads with what needs you.** Opening it in an owner workspace can show up to three "Needs you now" questions: "What detail do you need for {title}?" (an action that cannot draft without your facts), "Where do I continue?" (a draft or requested-changes version waiting for an authorised person), and "Why reconnect Google?" (owners only). With no signals the sheet is as before.
- **Answers point at the exact place.** "Continue here" opens the input form, the exact version, or Settings → Integrations. The sheet closes when the link is followed.
- **Nothing is guessed.** The missing-inputs answer lists the owner-facing labels of what the template needs and says nothing is invented. The review answer says an authorised person must approve this exact version and that this version has not been approved or sent.
- **Viewers and out-of-scope managers.** A viewer sees the first two questions with an answer that says to ask an owner or manager, and no link. An out-of-scope manager gets no suggestion for rows outside their locations; a focused out-of-scope item is still answered, read-only, without a link (Ruling R4).
- **Allowed while AI is paused.** The two new answers are deterministic and cost nothing.

With the flag off nothing changes: the suggestions route returns `[]` with no auth and no SQL, the two new questions answer 404 `not_enabled`, no response carries `nextStep`, and the audit rows are the ones `ecc60df` wrote (Ruling R7). The sheet still makes one suggestions call per open, which returns `[]` at no cost.

### Rulings, known limits and open questions

#### Rulings taken while building (from the execution ledger, `.superpowers/sdd/2026-10-03-contextual-assistant/progress.md`)

Each ruling is followed by what it costs if it is wrong. R1 came from the pre-flight scan (task interfaces checked against each other); the rest arose from reviews.

| # | Ruling | If wrong |
|---|---|---|
| R1 | `AssistantAccessError` moves to a new `lib/assistant/errors.ts` in Task 2, and `lib/assistant/live.ts` re-exports it, so existing importers keep working. `suggestions.ts` imports it from `./errors`, never from `./live`. Task 3 makes `live.ts` import `loadSignalRows` from `suggestions.ts`; importing the error class back from `live.ts` would have created an import cycle. | One extra 10-line file. |
| R2 | Task 4 adds to `loadSuggestions` a guard that throws `AssistantAccessError("forbidden")` when `membership.workspaceId !== context.workspaceId`, before any read, and extends `suggestions.test.ts` so each `not_found` case also asserts that no actions, waiting-version or Google reads happened. Defence in depth on the route it wires. | Two lines and one test. |
| R3 | `lib/assistant/live.ts` refuses a `context.locationId` that is not one of the workspace's locations, with `AssistantAccessError("not_found")`, for `explain_missing_inputs` and `where_to_continue`, matching `loadSuggestions`. A foreign id used to produce a false "nothing waiting" answer. | A 404 where a degraded answer used to be. |
| R4 | A focused out-of-scope item (action or version) is answered read-only, without `nextStep`, in both new intents; unfocused lists stay scope-filtered. §3.9 lets out-of-scope managers read, and one rule beats two. | An out-of-scope manager sees a version number they could already open read-only. |
| R5 | "Nothing waiting" and "no action needs details" answers name the location only when no rows were scope-filtered; otherwise they say "in your locations" (zh-HK 「你負責的地點」, zh-TW 「你負責的據點」). This avoids a false statement about a location the manager cannot fully see. | Slightly vaguer copy. |
| R6 | For an explicitly focused action, `explain_missing_inputs` lists `action.missingInputs` minus `offer_id` regardless of `actionState` (offer templates still excluded); the `needs_input` gate stays for the unfocused fallback. It keeps the answer consistent with `explain_priority` on the same action. | An `in_progress` action may list inputs the run gate would satisfy server-side. |
| R6a | Amends R6: for an explicitly focused action, offer templates are **not** excluded; list their `missingInputs` minus `offer_id` (for example `brand_voice`). The offer exclusion stays only in the unfocused fallback and in the signals. R6 as first written made a focused offer action that was missing `brand_voice` say "nothing is missing". | An offer action may list an input the offer page also asks for. |
| R7 | With the flag off, the run route ignores `origin` entirely (no validation, not written to the audit payload), so flag-off audit rows equal `ecc60df`'s; with the flag on, behaviour is as built. The run-route tests stub `CONTEXTUAL_ASSISTANT_ENABLED` explicitly so no test depends on the ambient environment. Done in Task 5, because the rollback promise is "identical to today". | A bogus `origin` is silently ignored while the flag is off. |

#### Deferred minor findings (not acted on in this slice)

Grouped from the task-by-task reviews. The items marked "carried" were fixed by a ruling (R2, R7) and are not open; those marked "fixed in the final-review wave" are listed under the next heading.

- **Task 1 (contract):** the English demo `nextAction` for the two new intents is the generic "Review the evidence…" override (`lib/pocket-assistant/demo.ts`, about line 246), contradicting "no evidence here" (the zh answer says to sign in and ask again) (fixed in the final-review wave); zh-TW reused zh-HK wording for the new sheet labels (fixed in the final-review wave; the demo answers still share zh text, as the existing intents do); no test guarded that the new intents stay out of `surfaceQuestions` (fixed in the final-review wave); the demo no-`nextStep` assertion runs for zh-HK and en only (zh-TW is covered by the snapshot). The run route accepted the new ids from Task 1 and fell through to `explain_limits` until Task 4's flag gate landed (no release in between).
- **Task 2 (signals):** `loadSuggestions` lacked the workspace guard `runLiveAssistant` has, and no test pinned scope-before-read (carried into Task 4 by R2, fixed); a manager scoped away from the primary location sees only workspace-wide rows unless the caller passes its location (spec-mandated; the topbar mount passes the shell's default, i.e. primary, location, so this is not always the manager's own: see Known limits); the `ACTION_SCOPE_PREDICATE` exclusion is untested for `assistantWaitingVersions`; full-suite load-timeout flakes on unrelated files (pass alone).
- **Task 3 (answers):** `oldestFirst` is duplicated and `visible()` re-derives `inScope` (both could be exported from `signals.ts`); `loadSignalRows` re-reads the locations and actions `resolveContext` already read, two extra queries per signal-intent run; the narrowed no-snapshot loop excludes two string literals where an exported snapshot-free key list would be better; copy nit: "The Google Business connection is not connected." for the `none` state (fixed in the final-review wave); no live-level test of a new intent with `assistantLatestSnapshot` returning `null`; `app/api/assistant/run/route.test.ts` timed out once under full-suite load (it is not on the known-flake list; it passed in every later run).
- **Task 4 (routes):** `origin` was validated and audited even with the flag off (carried into Task 5 by R7, fixed); the run-route tests depended on the ambient flag (R7, fixed); there is no route-level end-to-end assertion that a flag-off `explain_priority` has no `nextStep` (covered by composition in `live.test.ts`); the run-route flag-off integration case covers the empty string only at the route level. **Demo mode answers the two new ids with fixed text even with the flag off** (spec §1 makes the demo lines unconditional; at `ecc60df` those ids were `400 invalid_intent`).
- **Task 5 (sheet):** suggestions are not cleared when the context key changes while the sheet is open (stale suggestions linger until the refetch, and are kept if the refetch fails); no test for a stale first suggestions response arriving after close and reopen (the code is safe); the `selected` state is shared between suggestion ids and intent ids (an `aria-pressed` ambiguity if the ids ever collide); a `?version=` id not yet in `versions` when the prop changes is not retried later, and re-linking to the same `?version=` after a manual pick does not re-select it (prop-change design).
- **Task 6 (acceptance):** see the first known limit below; the spec's "Version 1 pressed" check cannot fail by construction.

#### Final-review fix wave (R9)

One commit, `fix(P4.3): zh-TW suggestion copy, capped waiting count and the final-review record`, closed the findings of the whole-branch review:

- **zh-TW sheet copy.** The three suggestion labels, the "Needs you now" heading and the labels of `explain_missing_inputs` and `where_to_continue` are locale-keyed via `localized()`; zh-TW reads 「為何要重新連線 Google？」, 「我應該從哪裡繼續？」 and 「…還需要什麼資料？」. Pre-P4.3 strings and demo labels for other intents are unchanged. The "Ask an owner or manager" answers keep 店主或經理 in zh-TW, as the existing zh-TW copy does (`lib/copy-workspace.ts`, offers viewer body).
- **No Google connection.** With no connection row the answer reads "There is no Google Business connection." (zh-HK 「目前沒有 Google 商戶 的連接。」, zh-TW 「目前沒有 Google 商家 的連線。」).
- **Capped waiting count.** `assistantWaitingVersions` reads at most 20 rows; when 20 come back, `where_to_continue` says "20 or more versions are waiting" (or "{n} or more" for the in-scope part), in all three locales. The SQL is unchanged.
- **Demo English next step.** The two new intents now say "Sign in to your workspace and ask again." in English, matching the Chinese.
- **Tests and records.** A test pins that the two new intents are in no `surfaceQuestions` list; the acceptance spec explains why its "Version 1 pressed" check does not isolate `?version=`; the `permissions.spec.ts` 500 trace and the out-of-scope-manager wording are corrected below.

#### Known limits

- **A waiting version is always its action's newest.** `create_output_version` supersedes earlier `draft` and `changes_requested` rows, so the waiting version of an action is its latest, and `?version=` selects something other than the default only in the same-page case (Task 5's fix: following "Continue here" to another version of the action already open). The acceptance spec's "Version 1 pressed" assertion therefore cannot fail, since version 1 is both the default and the target. The same-page landing is pinned by `components/workspace/action-detail-version-param.test.tsx`; the spec now carries a comment at that assertion pointing there (final-review fix wave).
- **Three signals only.** Missing inputs, waiting drafts and a broken Google connection. No pack or offer signal, no free-text question, no model-written explanation, no in-sheet button that runs, saves, approves or exports anything.
- **The suggestions call costs one request per open when the flag is off.** It returns `[]` with no auth and no SQL.
- **Out-of-scope managers.** A manager scoped away from the primary location sees only workspace-wide rows unless the caller passes a location. Not every mount passes the member's own location: the topbar mount sends the shell's default location (`lib/workspace/shell.ts:105`, the primary location). For a manager scoped away from the primary location, the scoped "in your locations" answers (R5) are then computed over the primary location's rows, so they can be untrue about the location the manager actually manages. This is reachable only when a suggestion's subject has vanished between suggestion and question, or through a crafted request; it grants no access (out-of-scope rows stay hidden and carry no `nextStep`). No code change in this slice.
- **The 20-row waiting read at the cap.** When the read returns 20 rows and every one is outside a scoped manager's locations, the answer still says nothing is waiting "in your locations", although an in-scope row past the 20th may exist. The SQL is unchanged by ruling; the in-scope count otherwise reads "{n} or more" at the cap.
- **Labels in zh-TW.** The pre-P4.3 intent labels keep one shared Chinese string, as before. The P4.3 strings in the sheet (the three suggestion labels, the "Needs you now" heading and the labels of the two new intents) are locale-keyed, and zh-TW says 什麼, 從 and 連線 (final-review fix wave).
- **Hosted behaviour is unverified.** The suggestions route's rate limit, authorization against the hosted identity service and the sheet against a real deployment have not been exercised.

#### Open questions (recorded, not resolved here)

None new. DEC-14 (delivery units) is untouched: no counting code changed.

### Not run / blocked

- **Hosted acceptance: NOT RUN.** No deployed request, no production Neon query, no real mail, Stripe or model call. `e2e:live`, `e2e:neon-auth` and `neon:readiness` were not run (they need keys or a hosted target). This slice needs no hosted migration.
- **A real-model evaluation: not run (DEC-04).** The two new intents never call a model, and no agent or corpus case was added; `eval:workflows -- --check-load` reports `load ok: 31 cases`.
- **P4.5 (preview) and P4.6 (publishing)** are not built, blocked by DEC-12 and DEC-13, which are not authorized. The assistant adds no publishing.
- **Literal Turbopack `build`, `test:secret-boundary`, `e2e` and `e2e:acceptance` on this Windows machine: blocked** by the local `radix-ui` resolve cascade recorded at P3, P4.4 and P4.2 (`Module not found: Can't resolve '@radix-ui/react-*'`, raised from `radix-ui/dist/index.mjs`; no file this branch changes is in the trace). CI on `ubuntu-latest` is the real gate. The `--webpack` diagnostics were run and are recorded separately in `PHASE-4-TEST-RESULTS.md`; they are **not** the literal gates.

### Owner actions

1. **No migration to apply.** The journal stays `0001`–`0012`.
2. **Deploy** with `CONTEXTUAL_ASSISTANT_ENABLED` unset. Behaviour is identical to the previous build.
3. **Set `CONTEXTUAL_ASSISTANT_ENABLED=true` and redeploy** (an environment variable change takes effect on the next deployment). The flag is on only for the exact string `true`.
4. **Rollback: unset the flag and redeploy.** Suggestions return `[]`, the two new questions are refused with 404 `not_enabled`, and no link renders. Nothing persisted depends on the flag, and no audit row is removed.

DEPLOY.md carries the same steps ([`docs/integration/DEPLOY.md`](../../integration/DEPLOY.md), "P4.3 contextual assistant: no migration, one flag").

### Phase 4 core acceptance gate (Master Plan §7.2)

The core release: "a confirmed offer produces reusable, correctly scoped promotion drafts; pack generation is idempotent; pack review preserves exact-version approval and per-version delivery counting; the assistant provides authorized context without mutation authority; existing three workflows still pass."

| Clause | Slice | State |
|---|---|---|
| A confirmed offer produces reusable, correctly scoped promotion drafts | P4.1 | built, locally verified; `0011` is hosted-unapplied (DEC-11) |
| Pack generation is idempotent | P4.2 | built, locally verified; `0012` is hosted-unapplied (DEC-11) |
| Pack review preserves exact-version approval and per-version delivery counting | P4.2 | built, locally verified; no counting code changed |
| **The assistant provides authorized context without mutation authority** | **P4.3** | **built, locally verified** (below) |
| Existing three workflows still pass | P4.4 and every slice | the regression corpus (31 cases, `load ok`), the unit and integration suites pass, and every acceptance spec has passed under the `--webpack` diagnostic, though the full acceptance suite did not pass clean in one invocation on this loaded machine (`PHASE-4-TEST-RESULTS.md`). `permissions.spec.ts` failed in both full runs (first a 500 where a 403 was expected on a viewer's draft call to `/api/assistant/run`, then a 180 s request timeout) and passed alone: 7 / 7, and later 13 / 13 as part of the four previously failing files run together. The final review traced the 500: in `app/api/assistant/run/route.ts` a viewer's draft call reaches `authorizeWorkspaceRequest` with the manager floor at :70-72, outside the `try` that starts at :87; the route's own `catch` maps failures to 503, so a 500 can only come from an identity-fixture or database failure inside that authorization, or from the framework (a Next dev compile race). That authorization was already outside the `try` at `ecc60df` (:58-60, `try` at :75), and this branch added only pure statements before the `try` (origin handling and the flag gate). Conclusion: a pre-existing, load-triggered path. The next full acceptance run should capture dev-server logs to tell the two causes apart. |

The assistant clause maps to the authority tests:

- **No writes by construction.** `neon-assistant-flag-off.integration.test.ts` records every SQL statement a flag-on suggestions fetch issues and asserts none is an `insert`, `update` or `delete`; both new intents are deterministic and never reach `llmComplete` or the budget (`lib/assistant/live.test.ts`, `app/api/assistant/run/route.test.ts`, including a paused-AI run that still answers).
- **No new authority route.** The acceptance spec records every request after the draft exists and asserts none hits approve, request-changes, reject, export or publish, and that the version, delivery and run counts, the version's `approval_state` and `workspace_usage` are unchanged after the journey.
- **Authorized context only.** `signals.test.ts`, `suggestions.test.ts` and `neon-assistant-signals.integration.test.ts` pin workspace, location-scope and role filtering (an out-of-scope manager gets nothing, Google is owner-only, viewers get no `nextStep`, a foreign workspace or location is refused before any read); the suggestions route refuses a mismatched or foreign id with 404.
- **Allowlist preserved.** The contract adds only the two read-only intents; the `nextStep` kinds are a closed list; the server returns no URL.

**Status: the core release is built and locally verified. It is not hosted-verified, and hosted acceptance was NOT RUN.** The preview and publishing sub-releases are not built and are labelled as such. Before Phase 4 core is released, `0011` and `0012` still need their hosted application (DEC-11) and the flags need the owner's decision.

### Verification

Full detail is in `PHASE-4-TEST-RESULTS.md`. One line per gate, run 2026-10-03 at `02b5577` plus the documentation edits (no code changed in this task):

| Command | Result |
|---|---|
| `corepack pnpm typecheck` | **passed**, exit 0 (root and all four packages). |
| `corepack pnpm lint` | **passed**, exit 0, `0 errors, 30 warnings` (the same 30 as the P4.2 record; none in a file this branch changed). |
| `corepack pnpm test` | **Not a clean pass: the one full run failed (exit 1), two files, each a 5,000 ms load timeout** (`tests/scan-claim-single-path.test.ts`, `app/api/versions/[versionId]/versions.test.ts`; 339 of 341 root files, 4,079 of 4,081 root tests passed). Both files **alone**: 2 files / 18 tests passed. The stages the chained script skipped were run separately and passed: `safe-media` 1 / 62, `region` 3 / 23, `scoring` 16 / 183, `contracts` 3 / 20, `scan-engine` 28 / 299. Total counted once, all passing: **392 files / 4,668 tests** (P4.2: 386 / 4,518). |
| `NEON_INTEGRATION=1 corepack pnpm test:integration` | **passed**, 45 files / 478 tests, first run (P4.2 record: 43 / 463). |
| `corepack pnpm db:verify` | **passed**, `0001`–`0012`, replay empty, **40 tables / 477 columns / 198 constraints / 102 indexes / 8 triggers / 18 functions** (identical to P4.2: no schema change). |
| `corepack pnpm test:no-supabase` / `test:no-self-service-claim` | **passed** / **passed**. |
| `corepack pnpm eval:workflows -- --check-load` | `load ok: 31 cases`, exit 0. The live evaluation was not run (DEC-04). |
| `corepack pnpm build` (literal, Turbopack) | **blocked**, exit 1: 51 `Can't resolve '@radix-ui/react-*'` errors from `radix-ui/dist/index.mjs`. Diagnostic `next build --webpack`: **passed**, `Compiled successfully in 43s`, route manifest includes `/api/assistant/run` and `/api/assistant/suggestions`. |
| `corepack pnpm test:secret-boundary` (literal) | **blocked**, exit 1 (it shells out to the Turbopack build). Diagnostic with a temporary `--webpack` on its build step (reverted): **passed**, `Secret boundary passed across 149 public artifacts.` |
| `corepack pnpm e2e` (literal) | **blocked**, exit 1: `Acceptance service not healthy: http://localhost:3100`. Diagnostic with a temporary `--webpack` on the dev server in `test/e2e/environment.ts` (reverted): **30 / 31 passed**; the one failure is `owner-shell.spec.ts:16`, the diagnostic-only failure recorded at P4.4 and P4.2 (`getByRole("alert")` resolves to two elements). |
| `corepack pnpm e2e:acceptance` (literal) | **blocked**: `Acceptance service not healthy` on the Turbopack dev server; the run was stopped at 240 s rather than wait out the timeouts. Diagnostic with the same temporary `--webpack` (reverted), **not a clean pass in either full run on a machine at about 99 % CPU**: run 1 **40 passed, 1 failed** (`permissions.spec.ts:4` viewer, a 500 on a draft call), run 2 **35 passed, 6 failed** (load timeouts and sign-in handoff races in four spec files). The failing files re-run alone: `permissions.spec` 7 / 7 after run 1; after run 2 the four failing files together 13 / 13. The new `contextual-assistant.spec.ts` and `work-pack.spec.ts` passed in both full runs. **`permissions.spec.ts` failed in both full runs**: first a 500 where a 403 was expected on a viewer's draft call to `/api/assistant/run`, then a 180 s request timeout. The final review traced the 500 to a pre-existing, load-triggered path (authorization outside the route's `try`, unchanged since `ecc60df`); see the "Existing three workflows still pass" row. |
| Blocked | The literal `build`, `test:secret-boundary`, `e2e` and `e2e:acceptance` (local Windows Turbopack only). |
| Interruption | A usage limit interrupted the Task 7 run once; every recorded result has its own log, and the acceptance results were re-checked after the reset (see `PHASE-4-TEST-RESULTS.md`). |

### Invariants

- `git diff ecc60df..HEAD --stat -- neon/migrations packages lib/agents/__snapshots__` prints nothing: no migration, no vendored-package edit, no agent snapshot change.
- No added SQL beyond the two read-only reads in `lib/repositories/artifacts.ts`; no counting code, `approve_output_version` or `export_output_version` change.
- Nothing in the slice writes `actions`, `action_runs`, `output_versions`, `deliveries` or `workspace_usage` (the acceptance journey asserts the counts and states are unchanged and that no authority route was requested).
- With the flag off, the suggestions route and both new intents run zero SQL (`neon-assistant-flag-off.integration.test.ts`) and the audit rows equal `ecc60df`'s (Ruling R7).
- The two new intents never reach `llmComplete` or the budget, including while AI is paused.

## P4.5 — conditional acquisition preview: one unsaved review-reply draft

**Branch** `p45-preview-draft`, base `8582a7c` (`origin/main`, PR #30, the merged P4.3 slice). Spec commit `404353b`, plan `13b299a`, implementation commits `9fcd467`..`c57d87a` (eight, listed below), then the Task 6 documentation commit `2987427`, then the final-review fix wave: code commit `117ff00` and its documentation commit (see "Final-review fix wave" at the end of this section). Committed diff before the Task 6 commit: 45 files, 3,603 insertions, 20 deletions (two of the files are the spec and the plan). Worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p45-preview-draft`. Node `v24.18.0`, pnpm `9.12.0` via corepack, Windows 11 Pro 10.0.26200, Docker Server `29.7.2`, `postgres:16` (server 16.15). Gates run 2026-10-04.

Built from `docs/superpowers/plans/2026-10-04-preview-draft.md` (Tasks 1–6) against the design in [`docs/superpowers/specs/2026-10-04-preview-draft-design.md`](../../superpowers/specs/2026-10-04-preview-draft-design.md).

**Implemented and locally verified. Nothing here is hosted-verified.** One new migration, `neon/migrations/0013_preview_events.sql`, exists and has been applied **only** to owned, disposable local Docker Postgres fixtures (`db:verify`, `test:integration`, the acceptance fixtures and the `apply-0013.sql` rehearsal). **Nothing was applied to any hosted or Neon database**, nothing was deployed or pushed, **hosted acceptance was NOT RUN**, no paid provider or real model was called (a fake LLM is injected in every test and the acceptance journey uses the fixture LLM server), and no mail was sent. The feature is behind `PREVIEW_DRAFT_ENABLED`, which defaults off.

### What this closes

Master Plan §7 P4.5 (source: Blueprint §5's proposed `/{locale}/start/[jobId]`), new and off by default. A visitor who has **unlocked** a report (the existing viewer grant for that job) may paste one customer review, optionally with a star rating, and get **one** AI review-reply draft that is shown once and **never stored**. It is labelled 「未認領草稿 · 未儲存」 / "Unclaimed draft · not saved", has no version number, approval, export, regenerate or save control, and its only next step is the normal sign-in and verified-claim path.

- **The grant is the capability.** The page and the route are addressed by the report's `share_slug`; only `authorizeReport(...).kind === "viewer"` for that job's own grant, on a `done` or `partial` job, qualifies. Anything else, including a guessed slug, a member or staff session alone, an expired or revoked grant, or another job's grant, is a 404.
- **Owner text only.** The model gets the locale, the market (from the job's `region`), the business name, a default brand and the one pasted review, fenced as untrusted data. Nothing from the report, snapshot, findings or raw data is read; the preview reads only `id, status, region, business_name` of the job.
- **Outside the ledger.** No write to `actions`, `action_runs`, `output_versions`, `deliveries`, `workspace_usage`, workspaces, members, claims or audit tables. The only record is `preview_events` (migration `0013`), which has no text column.
- **Atomic, fail-closed budgets.** 1 per grant, 3 per job, 5 per IP per day, and by default 50 previews and US$2 per rolling 24 hours across all jobs, claimed atomically under one advisory lock before the model call. A failed generation releases its slot, but every model call, failed or not, counts toward the daily limit and a grant gets at most three attempts (Ruling R11); any limit, configuration or check failure refuses. A repeat from the same grant always answers `already_used`.
- **Measures.** DEC-12's success and failure measures are read-only SQL in [`PREVIEW-METRICS.md`](PREVIEW-METRICS.md), including the claim-after-preview rate.

Before this slice there was no preview: an unlocked visitor's only way to see a draft was to sign in and complete a verified claim.

### Decisions (user, 2026-10-04)

DEC-12 is now recorded as decided in `BUSINESS-AND-HOSTED-DECISIONS.md`.

| DEC-12 question | Decision |
|---|---|
| Eligible traffic / grant | **Unlocked report viewers only.** The existing viewer grant for *that* job is the capability. Members, staff and the public view are not eligible. |
| What is generated | **One review reply.** The visitor pastes one customer review and may add a star rating. |
| Budget | **Tight trial:** 1 per grant; 3 per job across grants; 5 per IP per day; 50 per day globally; US$2 per day globally, summed from the preview's own cost records. Any limit or check failure refuses. |
| Hand-off | **Nothing carried over.** The draft is shown once and never stored. The CTA leads to the normal sign-in/claim path, and after a verified claim the owner uses the normal review-reply workflow. |
| Architecture | A **`preview_events` table** (migration `0013`, events only, no text) with an atomic `claim_preview_slot`. Per-IP uses `consume_rate_limit`. Flag `PREVIEW_DRAFT_ENABLED`, off unless exactly `true`. |

**Spec deviations taken as rulings.** The spec and plan said both slot functions are "security definer"; Ruling R2 made them **`SECURITY INVOKER`** with `SET search_path = ''` (the Neon convention of `0004` and `0011`, `neon/README.md`), and every description of `0013` in this record says `SECURITY INVOKER`. The spec's §2.5 step 7 said a limiter refusal is `ip_limit`; Ruling R6 answers a limiter **outage** with `unavailable`. The zh-TW boundary note's 發佈 became 發布 (Ruling R9), applied in the final-review fix wave. The final review added four more rulings (R10–R13, below): the preview prompt carries the default brand's voice and language (spec §2.3 said `providedInputs: {}`), and `0013` was edited on-branch so failed calls count toward the daily limit.

### What changed, by task

| Task | Commit(s) | What it did |
|---|---|---|
| Design and plan | `404353b`, `13b299a` | The spec, then the plan. |
| 1. Migration `0013_preview_events.sql` and the repository | `9fcd467`, then `35d7b69` (Ruling R2) | `public.preview_events` (no text column; `job_id` `ON DELETE CASCADE`, `grant_id` `ON DELETE SET NULL`; outcome CHECK `claimed`/`generated`/`failed`/`refused`; cost CHECK; three indexes), RLS, the `server_application` policy and `sme_app_runtime` grants as `0012`. `claim_preview_slot(p_job, p_grant, p_ip_hash, p_global_daily, p_usd_daily)`: one global `pg_advisory_xact_lock`; `claimed` rows older than 5 minutes become `failed`/`stale`; then it refuses in order `already_used`, `job_limit`, `daily_limit`, `budget` (each refusal inserts a `refused` row), otherwise inserts `claimed`; null targets or non-positive limits raise 22023. `finish_preview_slot(p_event, p_outcome, p_reason, p_cost)` moves only a `claimed` row to `generated` or `failed`. Both are `SECURITY INVOKER`, `SET search_path = ''`, EXECUTE revoked from PUBLIC and granted to `sme_app_runtime`. `lib/repositories/previews.ts` (`previewJob`, `claimSlot`, `finishSlot`); the Drizzle mirror, `db:types`, the catalog fixture (+135 lines, insertions only), `scripts/neon/catalog.ts` additional functions (18 → 20) and the schema test counts (tables 40 → 41, columns 477 → 486, constraints 198 → 203, indexes 102 → 106, journal 12 → 13). `neon-work-packs.integration.test.ts` now applies through `0012` explicitly. |
| 2. Flag, limits, input, context, eligibility | `f6b868e`, then `0a1d64e` (Ruling R4) | `previewDraftEnabled` (exactly `"true"`); `readPreviewLimits` (defaults 50 / 2, blank = default, any other invalid value throws); `parsePreviewInput` (review 10–1,500 code points after trim, rating absent or an integer 1–5, a supported locale); `buildPreviewContext` (exactly the spec §2.3 keys) and `previewMarket`; `authorizePreview` (status before the grant lookup, viewer grant only); rate-limit scope `preview_draft` (5 per 24 h). R4: `AgentContext.sampledReviewsSource`, so a pasted review is described as `visitor_supplied`, never scan evidence; the scan prompt and its snapshots are byte-identical. |
| 3. `POST /api/start/[slug]/preview` | `0f0c309`, then `fcb8e6f` (fix round) | The route, in order: flag → body → eligibility → AI pause → limits → per-IP limiter → context → claim → one `llmComplete` → finish. Every refusal is `200 { state: "refused", reason }`, malformed input `400 invalid_input`, ineligibility `404`; `Cache-Control: no-store`. Rulings R1, R3, R5–R8. Fix round: `llmComplete` gains an opt-in `redactErrors`, which the route uses, so a provider error body (which can echo the pasted review) never reaches the logs; the context is built before the claim. `neon-preview-flag-off.integration.test.ts`. |
| 4. Page, form, report card, copy | `b6d647f` | `/{locale}/start/[slug]` (flag → `notFound()` before any cookie read; eligibility as in the route; noindex), `PreviewDraftForm` (live code-point counter, optional 1–5 rating, one submit, the result with badge, warnings, Copy, the "not kept" line and the claim CTA; fixed refusal copy that never echoes input), the report card for viewers only (`previewDraftHrefFor`), and the trilingual `funnel.preview` copy. |
| 5. Acceptance journey | `c57d87a` | `e2e/acceptance/preview-draft.spec.ts` and `PREVIEW_DRAFT_ENABLED=true` in `test/e2e/safety.ts`: unlock → card → `/start` → paste and rate → draft with badge and CTA → a reload and second submit answer `already_used` → a cookie-less context gets 404; the protected tables' counts are unchanged and `preview_events` holds exactly one `generated` and one `refused` row containing no review or reply text. |
| 6. Rollout, metrics, records, gates | this commit | `rollout/apply-0013.sql` and its rehearsal, `PREVIEW-METRICS.md`, DEC-12 recorded as decided, `.env.example`, `docs/integration/DEPLOY.md`, the `AI_DRAFTS_PAUSED` note in `INCIDENT-RUNBOOK.md`, this report, the test results and the traceability rows. No code change. |

### Behaviour change for visitors and owners

With the flag on:

- **An unlocked viewer sees one extra card** on their report of a `done` or `partial` scan: "Try one AI reply draft (not saved)" (zh-HK and zh-TW 「試寫一則 AI 評論回覆（不會儲存）」). Members, staff, the public preview, `/sample-report` and a report whose scan is not finished never see it.
- **`/{locale}/start/{slug}`** shows the badge, the boundary note ("Only the text you type here is used. Nothing from your report is used, and nothing is saved, approved or published. One preview per unlocked report."), a review box with a live character count, an optional 1–5 star rating and "Draft a reply".
- **The result** is the reply under the badge, any warnings (the agents' guardrail codes in plain words, for example "Appears to promise compensation, a refund or a discount."; a code the page does not know is not shown), a Copy button, "This draft is not kept. Copy it now if you want it." and "Verify ownership to save and approve drafts", which opens the normal sign-in with `?claim={slug}`. Reloading loses the draft; a new attempt answers "already used" with the same CTA. When the report's three previews are used up the visitor sees the job limit, which now also says "Verify ownership to draft replies in a workspace." and shows the same CTA.
- **Refusals** use fixed copy per reason in three locales and never repeat the input: `already_used`, `job_limit`, `ip_limit`, `daily_limit`, `budget`, `paused`, `unavailable`, `invalid_input`.
- **Owners** see nothing new in the workspace: no preview reaches a workspace, and the review-reply workflow is unchanged.

With the flag off nothing changes: no card, `/start` is a 404, the route answers `404 not_enabled`, and none of them runs SQL.

### Rulings, known limits and open questions

#### Rulings taken while building (from the execution ledger, `.superpowers/sdd/2026-10-04-preview-draft/progress.md`)

Each ruling is followed by what it costs if it is wrong, as the ledger records it. R1 came from the pre-flight scan (task interfaces checked against each other); the rest arose from implementer concerns and reviews.

| # | Ruling | If wrong |
|---|---|---|
| R1 | The route computes `ip_hash` with the existing `ipHashFor(request)` (`lib/workspace/audit.ts`, returns null on failure) rather than calling `requestFingerprint` directly; the per-IP limit itself stays enforced by `enforceRateLimit` (fail-closed). A missing fingerprint secret must not turn into an unhandled 500 after the limiter already passed. | An event row may carry a null `ip_hash`. |
| R2 | `claim_preview_slot` and `finish_preview_slot` are **`SECURITY INVOKER`** with `SET search_path = ''`, EXECUTE revoked from PUBLIC and granted to `sme_app_runtime`, matching `0004`/`0011`. The spec and plan's "security definer" wording came from the Supabase-era rule that the Neon contract superseded; the runtime role already holds RLS-backed DML on `preview_events`, so owner elevation buys nothing. | None for security (no elevation), only a wording mismatch with the spec. |
| R3 | `finishSlot`'s reason parameter is narrowed to `"no_output" \| "invalid_output" \| "facts_needed" \| null` (`lib/repositories/previews.ts`), so no caller can pass free text into `preview_events.reason`; the "no text stored" promise is enforced by types. | A later failure reason needs a one-line union edit. |
| R4 | `AgentContext` gains optional `sampledReviewsSource?: "scan" \| "visitor_pasted"` (absent = `"scan"`, today's behaviour byte-identical, existing agent snapshots unchanged); `review_reply` renders provenance source `visitor_supplied` and a task sentence saying the review was pasted by the visitor and is not verified as coming from the merchant's profile; `buildPreviewContext` sets `"visitor_pasted"`. The model must not be told false provenance; the fence still treats the text as data. | One optional field on `AgentContext` and one branch in `review_reply`. |
| R5 | The preview's synthetic action row is seeded with evidence `{ factType: "Unknown", source: "visitor_supplied" }` in `lib/preview/context.ts`, so the prompt never labels pasted text "Observed" (guardrail 4: six fact types). | One fixture line and one test. |
| R6 | A limiter outage (`enforceRateLimit` unavailable) answers `unavailable`, not `ip_limit`. Still fail-closed (no claim, no model), and it does not blame the visitor for an outage; spec §2.5 step 7 literally says `ip_limit`. | An outage shows "temporarily unavailable" instead of "limit reached". |
| R7 | An eligibility lookup that throws answers 404 and logs `preview_eligibility_failed`, keeping the pre-authorization surface uniform (spec: auth/eligibility failures → 404) while operators still see the outage. | A database outage looks like "not found" to the visitor. |
| R8 | Fix round 1 also moves `buildPreviewContext` above `claimSlot` (no I/O; closes the claimed-slot-leak window) and adds status and `no-store` assertions to the limiter-unavailable test. Same files, zero risk. | None. |
| R9 | The zh-TW boundary note uses 發布 (Taiwan usage, as the existing zh-TW copy at `lib/copy.ts:982`), not the spec's 發佈. A §3.2 typo-level deviation in favour of the copy rule "zh-TW uses Taiwanese terms". **Applied in the final-review fix wave** (`117ff00`); it was the only 發佈 in the new zh-TW preview copy. | One character. |
| R10 | (Final review.) `buildPreviewContext` sets `providedInputs` via `resolveBrandProvidedInputs({ voice: "warm", languages: [locale], approvedClaims: [] })`, the same helper the normal run path uses (default brand values only, no report data), deviating from spec §2.3's literal `providedInputs: {}`. The normal workflow always passes these; "(not provided)" invites `facts_needed` failures that waste money. `ctx.evidence` stays `{}`. | The preview prompt carries two default brand inputs. |
| R11 | (Final review.) `0013` is edited on-branch (unapplied anywhere hosted, as R2 did): `daily_limit` and `budget` count every non-refused row (`claimed`, `generated`, `failed`, stale included); a grant is capped at 3 non-refused rows → `already_used` (in addition to any `claimed`/`generated` row → `already_used`); the per-job limit keeps 3 `claimed`/`generated`. When usage is null the route records `computeCostUsd({ inputTokens: ceil(prompt.length / 2), outputTokens: AGENT_LLM_OPTIONS.maxTokens }) ?? 0`. This bounds model calls to about 50 a day, and spend even without usage reporting, while keeping "a failure doesn't burn your try" within 3 attempts. `apply-0013.sql` was regenerated; the catalog fixture captures no preview function definition, so it needed no change. | An unlucky visitor with 3 failures sees `already_used`; the daily cap fills faster on failures. |
| R12 | (Final review.) `PREVIEW-METRICS.md`'s claim-after-preview rate excludes jobs attached before their first `generated` preview from **both** the numerator and the denominator (prose and query), so it measures activation that happened after the preview. | A slightly smaller denominator. |
| R13 | (Final review.) The fix wave also takes the cheap minors: warning codes in the form are translated (reusing the workspace guardrail copy), the report card requires job status `done` or `partial`, `/start`'s `generateMetadata` is gated on the flag, and a 4-grant parallel-claim integration test is added. | None. |

Also recorded: the trailer on each commit names the model that wrote it; commits are not amended.

#### Deferred minor findings (not acted on in this slice)

Grouped from the task-by-task reviews. Items marked "final wave" were routed by the controller to the final-review fix wave; **all of them are fixed** in `117ff00` (details in "Final-review fix wave" below). The rest stay deferred.

- **Task 1 (migration):** **fixed in the final wave:** failed and stale rows are now tested under `job_limit` (they do not count) and under `daily_limit` and `budget` (they do), alongside the new 3-attempt grant cap and a 4-grant parallel claim. Still deferred: the fail-closed 22023 argument guards (null grant, non-positive limits) are untested; `claim_preview_slot` does not check that `p_grant` belongs to `p_job` (the route authorizes it; a SQL guard would make the ledger self-consistent). `finish_preview_slot` storing any `p_reason` text was closed by R3 at the type level; the SQL itself still accepts any text.
- **Task 2 (flag, limits, input, context):** zero-width and combining characters (U+200B, U+200D, U+2060, U+0301) pass the 10-code-point floor (a UX guard only; every budget still applies); the shared `review_reply` text still frames reviews as "public Google reviews" / "read from the profile" (R4's visitor sentence outweighs it); the `review_reply` `promptVersion` was not bumped for the visitor variant (record `sampledReviewsSource` if telemetry ever needs it). The `factType: "Observed"` default was closed by R5.
- **Task 3 (route):** with `redactErrors` on, a non-2xx body is never read or cancelled (the socket is released by GC or abort; optional `resp.body?.cancel()`); `buildPreviewContext` can throw `review_response_template_missing` before the claim, which would be Next's default 500 without `no-store` (impossible in practice: the template is static). The runbook note that a paused preview logs `preview_paused`, not `[pause] refused`, was done in Task 6 (`INCIDENT-RUNBOOK.md`, `AI_DRAFTS_PAUSED` row).
- **Task 4 (page, form, card, copy):** **fixed in the final wave:** zh-HK 今日…明日 (not 明天) in `ip_limit`, `daily_limit` and `budget`; zh-HK `ratingLabel` 「選填」; `job_limit` now says "Verify ownership to draft replies in a workspace." (zh-HK and zh-TW 「…驗證擁有權後，即可在工作台草擬回覆。」) and shows the claim CTA; a test for `navigator.clipboard` undefined (an insecure context); the over-limit counter turns `text-destructive` and the textarea gets `aria-invalid`; zh-HK 「此報告的試用機會已經用過」 and zh-TW 「此報告的試用機會已使用過」. Still deferred: the flag-off integration case for `previewDraftHrefFor` is near-tautological (pure functions; the page-props unit test is the real guard).
- **Task 5 (acceptance):** **fixed in the final wave:** `preview-draft.spec.ts` asserts `toMatch(/\S/)` on the body, which an undefined body fails.
- **Task 6 (records):** **fixed in the final wave:** the `PREVIEW-METRICS.md` claim-after-preview prose and query (R12), the `model_calls_finished` column renamed `slots_finished`, the `IMPLEMENTATION-TRACEABILITY.md` citation for `previewJob` (added in `9fcd467`), and the rehearsal table below now lists the `apply-0010.sql`/`apply-0011.sql` step.

#### Known limits

- **Refusals before the claim are only in the logs.** `paused`, `ip_limit`, `unavailable` (invalid overrides, a limiter outage, a claim error), `invalid_input` and every 404 happen before `claim_preview_slot`, so `preview_events` has no row for them; they are logged as `{ category: "preview_<reason>" }`. `PREVIEW-METRICS.md` says so.
- **The per-IP limit counts attempts, not drafts.** The limiter runs before the claim, so an attempt that the claim then refuses (for example `already_used`) still uses one of the five daily attempts for that IP. Visitors behind one shared address share the five.
- **The daily count bounds model calls, not drafts** (Ruling R11). Every claimed slot, whatever its outcome (stale included), counts toward `PREVIEW_DRAFT_DAILY_LIMIT`, so at most that many model calls start per rolling 24 hours however many fail; failures fill the cap faster. A grant gets at most three attempts, so a visitor whose three attempts all fail sees `already_used` without ever getting a draft.
- **The US$ budget is checked, not reserved.** Claims are serialized, but model calls run after the claim, so calls already in flight can each pass the check and together finish slightly over the cap; the overshoot is bounded by the calls in flight (at most `maxTokens` 1,200 each) and by the daily count limit. A call whose provider reports no usage, or that returned nothing, is recorded at a conservative estimate (`ceil(prompt length / 2)` input tokens and 1,200 output tokens at the configured rates), not at 0; the estimate can overstate a cheap call and is not a measured cost.
- **One global lock.** Every claim takes the same advisory lock. Volume is bounded by the daily limit (default 50), so contention is not expected.
- **Drafts are lost on reload,** by design (DEC-12 "Nothing carried over"); the page tells the visitor to copy it.
- **The card shows for every unlocked viewer of a `done` or `partial` report** while the flag is on (Ruling R13 added the status check, matching the page and the route), including on reports whose job already belongs to a workspace (a viewer grant can exist for such a job). The claim CTA then follows the normal path, which does not let a second person take over an owned workspace.
- **No real-model evaluation of the visitor variant** of the `review_reply` prompt (DEC-04). No corpus case was added.
- **Hosted behaviour is unverified:** the per-IP limiter against hosted traffic, the real model cost per preview, and the card on a deployed report have never been exercised.
- **`neon:readiness` against a hosted target fails until `0013` is applied** (it expects the repository's full journal); that is the expected signal, not a defect.

#### Open questions (recorded, not resolved here)

None new. DEC-14 (delivery units) is untouched: the preview counts nothing. P4.6 still needs DEC-13 and separate authorization.

### Not run / blocked

- **The hosted migration: not run (DEC-11).** `0013` has never touched a Neon or any hosted database. `apply-0013.sql` was prepared and rehearsed on a local Docker `postgres:16` only.
- **Hosted acceptance: NOT RUN.** No deployed request, no production Neon query, no real mail, Stripe or model call. `e2e:live`, `e2e:neon-auth` and `neon:readiness` were not run (they need keys or a hosted target).
- **A real-model evaluation: not run (DEC-04).** Only `eval:workflows -- --check-load` was run (below).
- **P4.6 (publishing): not built**, blocked by DEC-13. The preview adds no publishing.
- **Literal Turbopack `build`, `test:secret-boundary`, `e2e` and `e2e:acceptance` on this Windows machine: blocked** by the local `radix-ui` resolve cascade recorded at P3, P4.4, P4.2 and P4.3 (`Module not found: Can't resolve '@radix-ui/react-*'`; no file this branch changes is in the trace). CI on `ubuntu-latest` is the real gate. The `--webpack` diagnostics were run and are recorded separately in `PHASE-4-TEST-RESULTS.md`; they are **not** the literal gates.

### Owner actions

1. **Apply `0013`** by running [`rollout/apply-0013.sql`](rollout/apply-0013.sql) in the Neon SQL Editor as `neondb_owner`, on a Neon test branch of production first and then on production (a DEC-11 owner action). It refuses unless the journal is exactly `0001`–`0012`, so `apply-0012.sql` must already be applied.
2. **Deploy.** Deploying before `0013` is **harmless while the flag is off**: the card, the `/start` page and the route check the flag first and run no SQL (proved for the route and the card by `test/integration/neon-preview-flag-off.integration.test.ts` against a schema that stops at `0012`, and for the page by its unit test). So the order of steps 1 and 2 is free; both must precede step 3.
3. **Set `PREVIEW_DRAFT_ENABLED=true` and redeploy** (an environment variable change takes effect on the next deployment), optionally with `PREVIEW_DRAFT_DAILY_LIMIT` and `PREVIEW_DRAFT_USD_DAILY`. Set it only after `0013` is applied: with the flag on and no `0013`, every submitted preview answers `unavailable`.
4. **Rollback: unset the flag and redeploy.** The card disappears, `/start` and the route answer 404, and no new event is written. `preview_events` rows stay for the metrics; they hold no text, and no draft was ever stored. `0013` is additive and is not rolled back.

DEPLOY.md carries the same order ([`docs/integration/DEPLOY.md`](../../integration/DEPLOY.md), "P4.5 unsaved preview draft: migration 0013 and the flag"); the measures are in [`PREVIEW-METRICS.md`](PREVIEW-METRICS.md).

### Runbook — `apply-0013.sql`

The statement is [`rollout/apply-0013.sql`](rollout/apply-0013.sql). It was generated from the migration files on disk by a scratch script (kept outside the repository) that imports the repository's own `loadMigrations()` and hashes each file's text exactly as `applyMigrations` does; nothing embedded was typed. It is one `DO $apply$ … $apply$;` block that
- runs `SET LOCAL ROLE smeassistant_migrator`, and refuses unless `current_user` is that role;
- takes the runner's lock, `pg_advisory_xact_lock(1936549221, 3)` (`scripts/neon/migrations.ts`);
- refuses unless `neon_migrations.journal` is **exactly** ordinals 1–12 with the names and sha256 checksums of `neon/migrations/0001…0012`, as `loadMigrations()` computes them;
- `EXECUTE`s the exact text of `0013_preview_events.sql` inside `$m0013$` (the generator also refuses if the text contained `$m0013$` or `$apply$`; the migration's own `$function$` bodies nest inside it);
- inserts journal row `(13, '0013_preview_events.sql', '98ec68e18a5281885ac12497af8328c3c7300ce7adfd1869f74f62912160cf24')`.

**Regenerated in the final-review fix wave.** Ruling R11 edited `0013` on-branch (it has never been applied to any hosted database), so the statement was rebuilt by re-running the same scratch generator; its output is byte-identical (`cmp`) to the committed file. The previous checksum `122fc89e…3467` belongs to the superseded text and must not be used.

After generation every checksum was re-derived independently with `sha256sum` over the file bytes and each appears in the statement. Rows 1–11 are identical to `apply-0012.sql`'s, and row 12 carries the checksum `apply-0012.sql` records for `0012_work_packs.sql` (`e7933f6c…7289`). The embedded text between the `$m0013$` tags is byte-identical to `0013_preview_events.sql` (6,658 bytes, ASCII, no CR; checked with a byte comparison). The statement is 11,784 bytes. The existing `.gitattributes` line `docs/implementation/owner-platform-v1/rollout/*.sql text eol=lf` covers the new file (`git check-attr eol` reports `lf`).

**Rehearsal (2026-10-04, disposable `postgres:16`, server 16.15, run twice, identical results; re-run twice on the regenerated statement in the final-review fix wave, identical again, with the R11 runtime checks added to check 6).** The roles matched production, as in the earlier rehearsals: `neondb_owner` LOGIN CREATEROLE owning database `neondb`; `neondb_owner` created `smeassistant_migrator` NOLOGIN and `sme_app_runtime` NOLOGIN, and granted the migrator CREATE on the database and USAGE, CREATE on schema `public`. `0001`–`0009` were applied as the migrator through the repository's own `applyMigrations` (a pool whose connections `SET ROLE smeassistant_migrator`). `0010`, `0011` and `0012` were then applied by running `apply-0010.sql`, `apply-0011.sql` and `apply-0012.sql` themselves as `neondb_owner`, the way production gets them, each with its documented notices. The container was published on `127.0.0.1` only and removed afterwards. Each block was sent as one query, as `neondb_owner`:

| # | Check | Result |
|---|---|---|
| 1 | Before `GRANT smeassistant_migrator TO neondb_owner WITH SET TRUE` | **refused**: `42501 permission denied to set role "smeassistant_migrator"`. Catalog and journal snapshot unchanged. |
| — | The grant, run as `neondb_owner` | succeeded (`set_option = true`, `inherit_option = true`, grantor `neondb_owner`) |
| — | `apply-0010.sql`, then `apply-0011.sql`, as `neondb_owner` | applied, each with its documented notices; journal 11 rows |
| 2 | Wrong journal: `0001`–`0011` only (`0012` not applied) | **refused**: `P0001 apply-0013 refused: neon_migrations.journal is not exactly 0001-0012 with the expected checksums (it has 11 rows)`. Snapshot unchanged. |
| — | `apply-0012.sql`, as `neondb_owner` | applied, with its documented notices; journal 12 rows |
| 3 | Wrong journal: rows 1–12 present, row 12's checksum altered (inside a transaction, rolled back) | **refused**: `P0001 apply-0013 refused: … (it has 12 rows)`. No `preview_events` table after the rollback; snapshot unchanged. |
| 4 | First run (journal exactly `0001`–`0012`) | **applied**, with notices `policy "server_application" for relation "public.preview_events" does not exist, skipping` and `apply-0013: applied 0013_preview_events.sql and recorded journal row 13`. Journal rows 1–13 with the expected names, every checksum equal to `loadMigrations()`'s, row 13 `98ec68e1…cf24` (fix-wave rerun; the first rehearsal recorded the superseded `122fc89e…3467`). |
| 5 | `applyMigrations` with all thirteen, as the migrator | returned `[]`: nothing pending, so the runner accepts the journal's checksums |
| 6 | Ownership and runtime access | `preview_events`, its primary key and its three indexes are owned by `smeassistant_migrator`; RLS on, with policy `server_application` (`ALL`, `sme_app_runtime`, `true`/`true`). `sme_app_runtime` has SELECT, INSERT, UPDATE and DELETE; `PUBLIC` has none. Both functions are owned by the migrator, `prosecdef = false` (**SECURITY INVOKER**), `proconfig = {search_path=""}`, EXECUTE for `sme_app_runtime`, none for `PUBLIC`. FKs: `job_id` CASCADE, `grant_id` SET NULL. Under `SET ROLE sme_app_runtime` (rolled back): a job and a grant inserted; the first claim `allowed` with an `event_id`; a second claim for the same grant `{"allowed": false, "reason": "already_used"}`; `finish_preview_slot(…, 'generated', NULL, 0.0012)` set `generated`, cost `0.0012` and `finished_at`; a second grant's claim finished as `failed`/`no_output` let that grant claim again. Fix-wave rerun (R11): that grant's third attempt was allowed and, after it failed too, a fourth answered `{"allowed": false, "reason": "already_used"}`; with four non-refused rows (one `generated`, three `failed`) a new grant's claim with `p_global_daily` 4 answered `daily_limit` and with 5 was allowed (failed rows count toward the daily limit, not toward the job limit). Deleting the job cascaded all its events (0 remaining). |
| 7 | Second run | **refused**: `P0001 apply-0013 refused: … (it has 13 rows)`. Snapshot unchanged. |

The snapshot is an md5 over every relation (kind, owner, RLS, ACL), column, constraint, policy, index and function (signature, owner, security, body md5, ACL, config) in `public` and `neon_migrations`, plus the journal rows. `corepack pnpm db:verify` is part of the gate run below: `0001`–`0013`, replay `[]`. The generator and the rehearsal script were scratch files and are **not committed**. **`apply-0013.sql` has never been run against any Neon database.** The fix-wave rerun left no container of its own (the script runs `docker rm -f` in its `finally`); the older `sme-neon-it-db-*` containers on this machine predate this session and were not touched.

### Verification

Full detail is in `PHASE-4-TEST-RESULTS.md` ("P4.5"). One line per gate, run 2026-10-04, sequentially, at `c57d87a` plus the documentation edits (no code changed in this task):

| Command | Result |
|---|---|
| `corepack pnpm install --frozen-lockfile` | exit 0, nothing changed. |
| `corepack pnpm lint` | **passed**, exit 0, `0 errors, 30 warnings` across 18 files (the same 30 as the P4.3 record; none on a line this branch added). |
| `corepack pnpm typecheck` | **passed**, exit 0 (root and all four packages). |
| `corepack pnpm test` | **Not a clean pass: the one full run failed (exit 1), four files, each a 5,000 ms load timeout on its first test** (`app/api/actions/[actionId]/versions/route.test.ts`, `app/api/offers/[offerId]/promotions/route.test.ts`, `app/api/packs/[packId]/route.test.ts`, `app/api/workspaces/[workspaceId]/packs/route.test.ts`; 346 of 350 root files, 4,226 of 4,230 root tests passed). The four files **alone**: 4 files / 58 tests passed. The stages the chained script skipped were run separately and passed: `safe-media` 1 / 62, `region` 3 / 23, `scoring` 16 / 183, `contracts` 3 / 20, `scan-engine` 28 / 299. Total counted once, all passing: **401 files / 4,817 tests** (P4.3: 392 / 4,668). |
| `NEON_INTEGRATION=1 corepack pnpm test:integration` | **passed**, 47 files / 497 tests, first run (P4.3: 45 / 478). |
| `corepack pnpm db:verify` | **passed**, `0001`–`0013`, replay empty, **41 tables / 486 columns / 203 constraints / 106 indexes / 8 triggers / 20 functions** (P4.3: 40 / 477 / 198 / 102 / 8 / 18). |
| `corepack pnpm test:no-supabase` / `test:no-self-service-claim` | **passed** / **passed**. |
| `corepack pnpm eval:workflows -- --check-load` | `load ok: 31 cases`, exit 0. The live evaluation was not run (DEC-04). |
| `corepack pnpm build` (literal, Turbopack) | **blocked**, exit 1: `Turbopack build failed with 5 errors`, `Can't resolve '@radix-ui/react-dismissable-layer'`. Diagnostic `next build --webpack`: **passed**, `Compiled successfully in 60s`, route manifest includes `/[locale]/start/[slug]` and `/api/start/[slug]/preview`. |
| `corepack pnpm test:secret-boundary` (literal) | **blocked**, exit 1 (it shells out to the Turbopack build). Diagnostic with a temporary `--webpack` on its build step (reverted): **passed**, `Secret boundary passed across 151 public artifacts.` |
| `corepack pnpm e2e` (literal) | **blocked**, exit 1: `Acceptance service not healthy: http://localhost:3100`. Diagnostic with a temporary `--webpack` on the dev server in `test/e2e/environment.ts` (reverted): **30 / 31 passed**; the one failure is `owner-shell.spec.ts:16`, the diagnostic-only failure recorded at P4.4, P4.2 and P4.3 (`getByRole("alert")` resolves to two elements). |
| `corepack pnpm e2e:acceptance` (literal) | **blocked**: `Acceptance service not healthy` on the Turbopack dev server; stopped at its 300 s limit (exit 124) during test 4 of 42. Diagnostic with the same temporary `--webpack` (reverted), flag on: **37 passed, 5 failed** of 42 (23.8 min), every failure the sign-in handoff race recorded at P4.2 and P4.3 (stuck at `/en/owner/sign-in/complete`), in `report-dashboard`, `report-scan-comparison`, `report-scan-metrics` and `returning-sign-in` (two). The four files alone: **5 / 5 passed**. `preview-draft.spec.ts` passed in the full run. |
| **`report-scan-metrics.spec.ts` and `report-scan-comparison.spec.ts`** (they now render the preview card for signed-out viewers) | In the full run both failed only at their later sign-in step; their unlocked-viewer checks at 375 px and 1440 px with the card present (no horizontal overflow) passed before that, and their console-diagnostics assertion was not reached. **Alone, both passed end-to-end**, including the 375 px overflow checks and `expect(diagnostics).toEqual([])` (no page error, console warning or console error). |
| Rehearsal | `apply-0013.sql` on a disposable `postgres:16`: seven checks, run twice, identical (see the runbook above). |
| Metrics | Every query in `PREVIEW-METRICS.md` returned the expected counts against a disposable `postgres:16` with synthetic rows, in a read-only transaction. |
| Blocked | The literal `build`, `test:secret-boundary`, `e2e` and `e2e:acceptance` (local Windows Turbopack only). |

### Invariants

- `git diff 8582a7c..c57d87a --stat -- neon/migrations packages lib/agents/__snapshots__` lists only `neon/migrations/0013_preview_events.sql` (138 insertions): no `0001`–`0012` edit, no vendored-package edit, no agent snapshot change (R4 keeps the scan prompt byte-identical). After the fix wave (`8582a7c..117ff00`) it still lists only that file, now 144 insertions.
- The only added SQL writes are to `preview_events`, all inside `0013` (`git diff 8582a7c..c57d87a`, excluding docs and tests: two `insert into public.preview_events` and two `update public.preview_events`). No added line outside tests names `actions`, `action_runs`, `output_versions`, `deliveries` or `workspace_usage`; the one added mention is the acceptance spec's `UNTOUCHED` list, which asserts their counts are unchanged.
- `preview_events` has no text column for the review, reply or prompt; the acceptance journey reads the full `json_agg` of the job's rows and finds none of them.
- With the flag off, the route and the card decision run zero SQL (`neon-preview-flag-off.integration.test.ts`) and `/start` calls `notFound()` before reading a cookie (`page.test.tsx`).
- Logs carry only `{ category }`; provider error text is redacted for the preview's model call (`route.test.ts`, `lib/llm.test.ts`).

### Final-review fix wave

The final whole-branch review (`8582a7c..2987427`) returned "ready to merge with fixes": two Important findings and the routed minors. Rulings R10–R13 (table above) decided them; one implementer fixed all of them in code commit `117ff00` plus this documentation commit. TDD throughout: each new or changed test was run red before the code change (the R11 integration tests failed 2 of 16 against the old `0013`; the route, context, card, metadata and form tests failed before their fixes).

| Finding | Change | Covering tests |
|---|---|---|
| Important 1 / R11: failed calls escaped the daily cap; calls without usage cost 0 | `0013` `claim_preview_slot`: `daily_limit` counts `claimed`/`generated`/`failed` (stale included); 3 non-refused rows for a grant → `already_used`; job limit unchanged; header comment rewritten. The route records `computeCostUsd({ inputTokens: ceil(prompt.length / 2), outputTokens: 1200 })` when the result is null or its usage is (partly) missing, the real cost otherwise. `apply-0013.sql` regenerated (`98ec68e1…cf24`); catalog fixture and `db:types` unchanged (no preview function definition is captured; no column changed). | `neon-preview-events.integration.test.ts` (+5: failed and stale rows under `daily_limit`; under `budget`; not under `job_limit`; 1 or 2 failures allow a retry and the third makes the grant `already_used`; 4 grants in parallel on 4 pool connections → exactly 3 allowed, 5 rounds). `route.test.ts` (null result, a throwing call, missing and partly missing usage record the estimate; reported usage records the real cost). |
| Important 2 / R10: `providedInputs {}` rendered "(not provided)" | `lib/preview/context.ts`: `providedInputs = resolveBrandProvidedInputs({ voice: "warm", languages: [locale], approvedClaims: [] })`; `evidence` stays `{}`. | `context.test.ts` (+3: per locale, `brand_voice` "warm" and the language label 廣東話 / 國語 / English, no "(not provided)" in the prompt; the existing no-report-data test now expects those two inputs and still finds no snapshot, metric or finding key). |
| R12: claim-after-preview | `PREVIEW-METRICS.md`: the query reports `excluded_attached_before_preview` and `excluded_attach_unrecorded` and divides `claimed_after_preview` by `eligible_jobs` (both exclusions out of numerator and denominator); prose rewritten; `model_calls_finished` renamed `slots_finished`; the R11 counting and cost estimate described. | Every query re-run on a disposable database (`PHASE-4-TEST-RESULTS.md`, "Final-review fix wave"). |
| R13: warning codes | The workspace guardrail copy moved verbatim from `action-detail-client.tsx` to `lib/workspace/guardrail-text.ts` (approver wording unchanged), with a visitor wording for the two "check before approving" lines; `visitorWarningTexts` translates known codes, collapses repeats and drops unknown codes and `prohibited_term` (the preview brand has none, so only model text could raise it). `classifyGuardrailWarning` is exported from `version-meta.ts`. | `preview-draft-form.test.tsx` (+4: three locales translate `compensation_promise`, `unexpected_link`, `unconfirmed_claim` and a length code, drop `check_tone` and raw text, never show a raw code; no warnings box when every warning is unknown). The workspace suites (`components/workspace`, `version-meta`) pass unchanged. |
| R13: card job status | `previewDraftHrefFor` takes `status` and links only `done`/`partial`; the report page passes `model.preview.status`. | `flag.test.ts` (+1), `app/[locale]/r/[slug]/page.test.tsx` (+1). |
| R13: `/start` metadata | `generateMetadata` returns only `robots` (noindex) when the flag is off. | `app/[locale]/start/[slug]/page.test.tsx` (the metadata case now covers on and four off values). |
| Copy (ledger → final wave) | zh-HK 明日 ×3, 「選填」, 「試用機會已經用過」; zh-TW 「試用機會已使用過」, 發布 (R9); `job_limit` next step in three locales and the CTA. | `preview-draft-form.test.tsx` (new copy case; the refusal matrix now expects the CTA for `job_limit`), `page.test.tsx` (the zh-TW boundary string). |
| Over-limit counter | `aria-invalid` on the textarea and `text-destructive` on the counter above 1,500 code points. | `preview-draft-form.test.tsx` (over and back under the limit). |
| Clipboard undefined (ledger) | No code change needed (the `try` already catches it). | `preview-draft-form.test.tsx` (+1). |
| `preview-draft.spec.ts:94` | `expect(first.body).toMatch(/\S/)`. | The acceptance run below. |
| Traceability citation | `IMPLEMENTATION-TRACEABILITY.md`: `previewJob` cites `9fcd467`; R10–R13 reflected in the P4.5 rows. | — |
| Deploy note | `docs/integration/DEPLOY.md`: the limits line now says 50 model calls a day (failed ones included), at most 3 attempts per grant, and the cost estimate. | — |

Gate re-runs, 2026-10-04, sequential, on `117ff00` (full detail in `PHASE-4-TEST-RESULTS.md`, "Final-review fix wave"):

| Command | Result |
|---|---|
| The P4.5 unit set (`lib/preview`, `app/api/start`, `components/preview`, `app/[locale]/start`, `app/[locale]/r`) | **passed**, 9 files / 141 tests. |
| `NEON_INTEGRATION=1 … vitest run --config vitest.integration.config.ts` on `neon-preview-events`, `neon-preview-flag-off`, `neon-schema`, `neon-catalog` | **passed**, 4 files / 40 tests. |
| `corepack pnpm db:verify` | **passed**, `0001`–`0013`, replay `[]`, 41 / 486 / 203 / 106 / 8 / 20 (unchanged). |
| `corepack pnpm typecheck` / `lint` | **passed** / **passed**, `0 errors, 30 warnings` (unchanged). |
| `corepack pnpm test` | **Not a clean pass:** 4 known load-timeout files failed in the full run (`scan-claim-single-path`, `scan-events-single-writer`, `identity-sdk`, `app/api/versions/[versionId]/versions.test.ts`); 346 of 350 root files, 4,239 of 4,243 tests. The four alone: 3 failed on the first rerun, **all 28 passed on the second**. `safe-media` 1 / 62 and the packages (23 / 183 / 20 / 299) passed. |
| `preview-draft.spec.ts` (literal Turbopack) | **blocked**, `Acceptance service not healthy` (the local `@radix-ui/react-dismissable-layer` cascade). |
| `preview-draft.spec.ts` with a temporary `--webpack` (restored) | **passed**, 1 / 1 (1.8 min). A diagnostic, not the literal gate. |
| `apply-0013.sql` rehearsal | regenerated statement rehearsed twice, identical (runbook above). |
| `PREVIEW-METRICS.md` | all seven queries re-run read-only on a disposable database; every count matched. |

Not re-run in this wave: the full `test:integration` suite, `build`, `test:secret-boundary`, `test:no-supabase`, `test:no-self-service-claim`, `eval:workflows` and the full `e2e`/`e2e:acceptance` suites; the Task 6 records above stand for them. Nothing was applied to a hosted database, deployed or pushed.

## P4.6 — conditional single publishing connector: Google Business Profile review reply

**Branch** `p46-gbp-reply-publish`, base `cef0a4d` (`origin/main`, PR #32). Design commit `abde11a`, plan `cb9e40b`, implementation commits `ebc8dd5`..`95a766d` (eleven, listed below), then the Task 8 documentation commit. Committed diff before the Task 8 commit: 54 files, 8,235 insertions, 103 deletions (two of the files are the spec and the plan). Worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p46-gbp-reply-publish`. Node `v24.18.0`, pnpm `9.12.0` via corepack, Windows 11 Pro 10.0.26200, Docker Server `29.8.1`, `postgres:16` (server 16.15). Gates run 2026-10-04.

Built from `docs/superpowers/plans/2026-10-04-gbp-reply-publish.md` (Tasks 1–8) against the design in [`docs/superpowers/specs/2026-10-04-gbp-reply-publish-design.md`](../../superpowers/specs/2026-10-04-gbp-reply-publish-design.md).

**Implemented and locally verified. Nothing here is hosted-verified.** One new migration, `neon/migrations/0014_publish_reply.sql`, exists and has been applied **only** to owned, disposable local Docker Postgres fixtures (`db:verify`, `test:integration` and the `apply-0014.sql` rehearsal). **Nothing was applied to any hosted or Neon database**, nothing was deployed or pushed, **hosted acceptance was NOT RUN**, and **no Google API was called**: every Google call in every test goes through an injected `fetchImpl` or a fake. The feature is behind `GBP_REPLY_PUBLISH_ENABLED`, which defaults off, and turning it on needs a separate release approval (DEC-13).

### What this closes

Master Plan §7 P4.6 (source E4; Blueprint §2.3 keeps publishing restricted in v1), "NEW, SEPARATE AUTHORIZATION". With the flag on, an owner, or a manager in the action's location scope, can post **one approved review-reply version** as the owner's reply to **one** Google review they pick, after confirming the exact version and the review. The server checks the version, the location binding and the role, records one delivery, reads the review before writing, writes once, and marks the delivery published only after a read-back shows the same text. Only the owner can delete a published reply.

- **One provider, one operation** (DEC-13): Google Business Profile v4, `PUT …/reviews/{id}/reply`. A review has at most one reply, so each publish targets one resource. An existing different reply is never overwritten (`already_replied`); an existing identical reply counts as published.
- **Counted once per version** (DEC-14): at the version's first export **or** first verified publish, whichever comes first, enforced in SQL. `export_output_version` is re-created so an export of an already published version never counts again. Nothing in the application increments usage.
- **Honest uncertainty.** A timeout, 5xx or network error on or after the PUT, or a read-back that fails or differs, leaves the delivery `publishing` ("Couldn't confirm"). It is settled only by a read-only reconcile (automatic once on page load, or **Check on Google**), never by a second write.
- **Separate states.** Exported, user-marked-applied and provider-verified-published stay separate facts: `first_exported_at`, the action applications of `0006`, and `first_published_at`.

Before this slice nothing in the product wrote to Google, and the stored Google tokens had never been read back.

### Decisions (user, 2026-10-04)

DEC-13 and DEC-14 are now recorded as decided in `BUSINESS-AND-HOSTED-DECISIONS.md` ("DEC-13 and DEC-14 — decided 2026-10-04").

| Question | Decision |
|---|---|
| DEC-13 provider and operation | **Google Business Profile: reply to one review** (v4 `PUT …/reviews/{id}/reply`). A review has at most one reply, so the operation targets one resource. |
| Destination | The owner **picks from a live list** of the location's newest 50 *unreplied* reviews. The best match is pre-selected, and an explicit confirmation is still required. |
| Existing reply | **Never overwrite.** If the review already has a reply with different text, refuse ("already replied on Google"). If its text equals our approved version, treat it as published. |
| Authority | Owner, or manager in location scope, may publish (the same rule as export). **Deleting** a published reply is **owner only** and audited. |
| DEC-14 counting | **Once per approved version**, at its first export **or** first verified publish, whichever comes first. Enforced in SQL. |
| Test destination | A Fimmick-owned GBP listing, under a separate release approval. |
| Architecture | **Synchronous publish plus reconcile, no background worker.** Flag `GBP_REPLY_PUBLISH_ENABLED`, off unless exactly `"true"`. Migration `0014`. |

### What changed, by task

| Task | Commit(s) | What it did |
|---|---|---|
| Design and plan | `abde11a`, `cb9e40b` | The spec, then the plan. |
| 1. Migration `0014` and the publishing repository | `ebc8dd5` | `deliveries.target_ref`, `provider_receipt`, `failure_reason`, `verified_at`; `output_versions.first_published_at`; the guarded `deliveries_publish_target_check` (`mode <> 'publish' OR target_ref IS NOT NULL`); partial unique indexes `deliveries_active_publish_version_key` and `deliveries_active_publish_target_key` (`mode='publish' AND state IN ('publishing','published')`). `begin_publish_output_version` (same key → `existing`; version lock; offer guard; `not_approved`; `already_publishing` with the in-flight delivery id in the error detail; `target_busy`; allowance checked, nothing counted), `finish_publish_output_version` (a second finisher is a no-op; `published` counts a never-counted version unconditionally; `failed` restores `export_ready` or `exported`), `cancel_published_reply` (no refund), and `export_output_version` re-created with exactly the changes (a)–(c) of spec §1.5. All four are `SECURITY INVOKER`, `SET search_path = ''`, EXECUTE revoked from PUBLIC and granted to `sme_app_runtime`. `lib/repositories/publishing.ts` (`begin`, `finish`, `cancel`, `publishDeliveryIds`, `getDelivery`), the Drizzle mirror, the catalog fixture, `scripts/neon/catalog.ts` additional functions (20 → 23) and the schema counts (columns 486 → 491, constraints 203 → 204, indexes 106 → 108, journal 13 → 14). `lib/workspace/publish-sql.test.ts` pins the new `export_output_version` body and its diff from `0011`. |
| 2. Google reviews client | `bec4a2c`, then `1ef1e18` (fix round) | `lib/oauth/google-reviews.ts`: `findLocationForPlace` (reusing the account and location paging, now exported from `google-business-profile.ts` as `listManagedLocations`, whose old output is unchanged), `listUnrepliedReviews` (newest first, at most 3 pages, at most 50), `getReview`, `putReply`, `deleteReply`, `sameReply` (CRLF → LF, trim, NFC, exact) and `reviewNameIsUnder`. Every call has a 10 s timeout; errors carry only a code (`unauthorized`, `forbidden`, `not_found`, `rate_limited`, `provider_error`, `timeout`, `network`), never the token or a body. Fix round: a 2xx body that fails to parse is `provider_error`, not a raw `SyntaxError`. |
| 3. Flag, eligibility, limits, preselection, capability | `155544d` | `gbpReplyPublishEnabled` (exactly `"true"`); `publishEligibility` (`flag_off`, `not_review_response`, `not_approved`, `no_location_listing`, `connection_missing`, `too_long` over 4,096 UTF-8 bytes, `empty_body`); `consumePublishLimits` over the new scopes `gbp_publish` (20 per workspace per day), `gbp_publish_global` (200 per day), `gbp_targets` (60 per workspace per hour), `gbp_reconcile` (30 per delivery per day), keyed without the IP fingerprint and failing closed; `preselectTarget` (normalized first 40 characters against the action's sampled reviews, else the newest); `googleBusinessPublishCapability` (`"Beta"` only when the flag is on and the connection active). `defaultRateLimitClient()` extracted from `enforceRateLimit`, behaviour unchanged. |
| 4. Token access | `6f42dec` | `lib/publishing/connection.ts` `withGbpAccessToken`: the first production read of the stored tokens. No active row or no `business.manage` → `connection_missing`; a token due for refresh is refreshed once and only the new access token and `expires_at` are stored, under the workspace lock; a failed refresh or a second 401 marks the row `expired` (`connection_expired`); a 403 never touches the row (P3); a decrypt failure is `token_unreadable`. Repository methods `activeGbpConnection`, `storeRefreshedToken`, `markConnectionExpired`. |
| 5. Targets and publish routes | `2b8351a`, `bcbc41c`, `e97277d` | The delivery and allowance notices moved out of the export route into `lib/workspace/delivery-notices.ts` (export behaviour unchanged). Raced begins that hit a unique index map to `already_publishing` / `target_busy`; `finish` takes only the closed `PublishFailureReason` set. `GET /api/versions/[versionId]/publish/targets` and `POST /api/versions/[versionId]/publish` (flag → subject → authorization → eligibility → `version_changed` → location binding → limits → `begin` → `runPublish`). `runPublish`: pre-read, one PUT, read-back; uncertain outcomes stay `publishing`. A counted publish sends the notice "Approved reply published to Google". |
| 6. Reconcile, delete and the flag-off proof | `bd2e22e` | `POST /api/deliveries/[deliveryId]/reconcile` (no flag check, owner or in-scope manager, 15 s settle window, read-only) and `DELETE /api/deliveries/[deliveryId]/reply` (flag, owner only, refuses `reply_changed_on_google`, a 404 on the reply counts as already deleted, then `cancel_published_reply`). `neon-publish-flag-off.integration.test.ts` proves the flag-off paths on a `0013` schema. |
| 7. The publish card and copy | `62a8776`, then `95a766d` (fix round) | `lib/publishing/page-state.ts` `loadPublishPanel` and `components/workspace/gbp-publish-card.tsx` on the action detail page: the confirm dialog (radio list, full approved text with "Version N · approved", the required confirmation, a fresh idempotency key per opening and per review change), the states Published on Google / Couldn't confirm / Failed / Deleted from Google, owner-only **Delete reply**, one automatic reconcile on load, and trilingual copy in `lib/copy-workspace.ts`. Fix round: the tick clears when the selected review changes; viewers and out-of-scope managers get the read-only banner instead of an owner-only link; stale 409s refresh the page; the radios are disabled while busy. |
| 8. Rollout, records, gates | this commit | `rollout/apply-0014.sql` and its rehearsal, DEC-13 and DEC-14 recorded as decided, `HOSTED-ACCEPTANCE-CHECKLIST.md` §22, `.env.example`, `docs/integration/DEPLOY.md`, this report, the test results and the traceability rows. One comment fixed in `app/api/workspaces/[workspaceId]/google-connection/route.ts`: it still said the stored tokens are write-only and `decryptToken` has no production call site; `lib/publishing/connection.ts` now reads them. No behaviour change. |

### Behaviour change for owners

With the flag on, on the action detail page of a `review-response` action whose current version is approved:

- **Owners and in-scope managers** see **Publish to Google**. The dialog lists the location's newest 50 unreplied reviews (stars, reviewer, date, excerpt) with the best match preselected, shows the full approved reply with "Version N · approved", and keeps **Publish** disabled until a review is selected and "I confirm this exact approved version will be posted publicly as the owner's reply to the selected review." is ticked. Changing the review clears the tick.
- **After publishing**, the card shows **Published on Google** with the verified time, **Couldn't confirm** ("We couldn't confirm Google received it. Nothing will be sent again automatically.") with **Check on Google**, or **Failed** with the reason in plain words. Export and copy stay available beside it, and exporting a published version does not count again.
- **Owners** also get **Delete reply**, behind a confirmation; the card then shows **Deleted from Google**, usage is not refunded, and publishing the same version again never counts again.
- **Viewers and out-of-scope managers** see the existing read-only permission copy, never a publish or delete control. Without an active Google connection the card names the missing connection, and only an owner sees the link to the integrations settings.
- **Usage**: a never-exported version counts one approved delivery when its publish is verified; the allowance is checked before Google is called.

With the flag off nothing changes for anyone: **Publish to Google** is never offered, and the targets, publish and delete routes answer `404 not_enabled` before any SQL. Reconcile stays available (it only reads), so a delivery left uncertain before a rollback can still be settled.

### Rulings, known limits and open questions

#### Rulings made in the design (spec §10)

| # | Ruling | If wrong |
|---|---|---|
| P1 | Synchronous publish plus reconcile, no worker. One write per review makes the operation naturally targetable, and the uncertain state is honest and recoverable. | A slow Google request ties up a request of up to 30 s, which the UI shows as uncertain. |
| P2 | The allowance is checked at `begin`; the increment at `finish` is unconditional. Refusing to count something already public would be dishonest, and the overshoot is bounded by in-flight publishes, at most one per version. | A lite workspace could exceed 3 by a concurrent publish in the same instant. |
| P3 | A 403 does not change the connection row. A 403 can mean the GCP project is not approved or the API is not enabled; marking connections revoked would push every merchant into a pointless reconnect. | A merchant who truly lost access sees `provider_forbidden` rather than a reconnect prompt. |
| P4 | Reconcile works while the flag is off. It only reads from Google, and never stranding an uncertain delivery outweighs keeping the switch absolute. | One read-only Google call per uncertain delivery after a rollback. |
| P5 | Never a blind re-PUT. A PUT replaces any reply, including one another person posted after our timeout, so recovery always reads first. | An owner whose PUT failed silently presses **Check on Google** before publishing again. |

#### Rulings taken while building (from the execution ledger, `.superpowers/sdd/2026-10-04-gbp-reply-publish/progress.md`)

| # | Ruling | If wrong |
|---|---|---|
| E1 | `already_publishing` carries the in-flight delivery id in the SQL error detail (spec §1.2), surfaced as an optional `deliveryId` on `PublishError`. It supersedes the pre-flight ruling that would have dropped it. A raced begin caught by the version index has no id (null). | None beyond an optional field. |
| E2 | "Safe before 0014": no `0014` column is read on the flag-off path unless a publish row was first found by a pre-`0014` query (`publishDeliveryIds`, `getDelivery`'s first check, `publishSubject`, `activeGbpConnection`), so the code can deploy before the migration. Proven on a `0013` schema by `neon-publish-flag-off.integration.test.ts`. | Extra pre-check queries. |
| E3 | Publish limits are keyed per workspace (and `"all"`, and per delivery for reconcile) **without** the IP fingerprint that `enforceRateLimit` always adds; `consumePublishLimits` calls `consumeRateLimit` directly. | One IP cannot be singled out, but the per-workspace and global caps still bound abuse. |
| E4 | A token decrypt failure is a plain `Error("token_unreadable")`, the connection row is untouched, and the routes answer 503. A missing or short encryption key is a deployment fault, not a merchant's expired connection. | A genuinely corrupt stored token shows "unavailable" rather than a reconnect prompt. |
| E5 | A refresh stores only the new access token and `expires_at`; the stored refresh token is never rotated (Google omits it on refresh). | A rotated refresh token from Google would be ignored. |
| E6 | A 401 on a token refreshed just before the call is terminal: the row is marked `expired` and the result is `connection_expired`. It is the "401 twice" case. | A one-off Google 401 right after a refresh forces a reconnect. |
| E7 | Spec §2.3 kept literal: `refreshAccessToken` returning null, which also covers a Google token-endpoint outage or missing OAuth client configuration, marks the connection `expired`. It fails closed to a reconnect prompt; distinguishing an outage would change the shared OAuth module outside this plan. **Revisit if seen in hosted acceptance.** | A transient token-endpoint outage pushes merchants to reconnect. |
| E8 | Once `begin` succeeds, the publish route always answers 200 with `{ state, counted, reason? }` (failed and uncertain included). Before `begin`, a connection error is 409 with its code, a Google error 502 with the §5 reason, and anything unknown (including `token_unreadable`) 503. | A client relying on the HTTP status alone would miss failures after `begin`. |
| E9 | `loadPublishPanel` failures hide the card (it returns null and logs one category) instead of failing the page: the action detail page must never 500 because of an optional panel. | A broken panel is silent except for a category log. |
| E10 | The confirmation tick clears whenever the selected review changes, because the confirmation covers the exact version **and** the destination; the integrations link is owner-only, and viewers and out-of-scope managers get the read-only copy. | One extra small fix round (taken in `95a766d`). |

Also recorded: every subagent ran on Opus because the Sonnet weekly limit was exhausted (cost if wrong: higher spend per task). The trailer on each commit names the model that wrote it; commits are not amended.

#### Deferred minor findings (not acted on in this slice)

Grouped from the task-by-task reviews. None is Critical or Important; all are left for a later slice or the final review's triage.

- **Task 1 (migration):** no DEC-14 test for begin → export → finish (an export during an in-flight publish), and that export flips `delivery_state` from `publishing` to `exported` mid-publish (the finish then sets `published`); `begin`'s idempotency lookup is not filtered by `mode='publish'`, so reusing an export key answers `unexpected_publish_result`; the integration tests depend on their order (house style, as `neon-preview-events`).
- **Task 2 (client):** the timeout test asserts a signal, not the 10,000 ms value; eight `no-unused-vars` warnings from `_input`/`_init` parameters in `google-reviews.test.ts` (lint 30 → 38 warnings); a repeated inline location type could be a named interface.
- **Task 3 (limits):** `limits.test.ts` sets `RATE_LIMIT_SECRET` without restoring it; a global-bucket refusal still spends the workspace token; the bare `catch` in `consumePublishLimits` maps programming errors to `unavailable`; preselect excerpts shorter than 40 code points match only identical text, untested.
- **Task 4 (tokens):** `inTransaction`'s pool detection also matches a bare `pg.Client`; one overlong comment line in `lib/repositories/claims.ts`; `justRefreshed` in `connection.ts` could be named `refreshedBeforeCall`. The stale comment in the `google-connection` route was fixed in Task 8.
- **Task 5 (publish):** an idempotent replay with a different review answers with the earlier delivery (the card mints a new key on every review change, E10); the Google location lookup runs before the publish limit (spec §3.2 order), so `location_not_managed` / `target_not_in_location` requests are not rate-limited; the publish notice is skipped if the usage read fails after a counted publish; `connection_missing` after `begin` is recorded as `connection_expired`; the export route now answers 200 instead of 503 when the notification repository cannot be constructed (the notices are post-commit and best-effort).
- **Task 6 (reconcile, delete):** deleting when the review itself is gone answers `502 review_not_found` and the delivery stays `published` (cannot be cancelled) — the final review should triage this; `lib/publishing/reconcile.ts` imports `gbpReason` from a module that imports `next/server`; a reconcile `existing` answer for a stored `failed` row carries no reason until reload.
- **Task 7 (card):** the reconcile-on-load guard is per mount, so switching tabs can re-POST reconcile (bounded and read-only; viewers get 403); a JSDoc comment in `lib/copy-workspace.ts` attaches to the wrong block; `canDelete` is the "is owner" proxy for the integrations link; the card is not keyed by version, so a notice can outlive a version switch.

#### Known limits

- **No Google API call has ever been made.** The reviews API paths, paging, error mapping and reply comparison are built from Google's documented v4 contract and tested only against fakes. The GCP project has no approved Business Profile API access yet (quota 0), so the first real call is part of the separate release approval.
- **Uncertain deliveries need a human or a page load.** There is no worker: a `publishing` delivery is settled when someone opens the action page (one automatic reconcile) or presses **Check on Google**. A delivery left uncertain blocks a second publish of the same version and review until then (by design).
- **The allowance can be overshot by in-flight publishes** (P2), at most one per version.
- **A refresh failure is treated as revocation** (E7), including a Google token-endpoint outage.
- **The reply on Google can change after publishing.** We record what we verified; a later edit by someone in Google is not detected until the owner tries **Delete reply** (`reply_changed_on_google`).
- **No acceptance (e2e) spec** covers the card in a browser (spec §7); the component tests and route tests carry it. The card has not been seen in a browser with the flag on.
- **Hosted behaviour is unverified:** the limiter against hosted traffic, Google's real responses, latency and quota, and the token refresh against Google.
- **`neon:readiness` against a hosted target fails until `0014` is applied** (it expects the repository's full journal); that is the expected signal, not a defect.

#### Open questions (recorded, not resolved here)

- Whether the production flag is ever turned on, and for which workspaces: a further owner decision after the non-production release approval passes.
- E7: whether a token-endpoint outage should be told apart from a revocation, if hosted acceptance shows it.
- Task 6 minor: what a delete should do when the review itself has been removed on Google (today the delivery cannot be cancelled).

### Not run / blocked

- **The hosted migration: not run (DEC-11).** `0014` has never touched a Neon or any hosted database. `apply-0014.sql` was prepared and rehearsed on a local Docker `postgres:16` only.
- **Hosted acceptance: NOT RUN.** No deployed request, no production Neon query, no Google call, no real mail. `HOSTED-ACCEPTANCE-CHECKLIST.md` §22 is the prepared run.
- **No Google API call of any kind**, real or sandboxed.
- **Literal Turbopack `build`, `test:secret-boundary` and `e2e` on this Windows machine: blocked** by the local `radix-ui` resolve cascade recorded at P3, P4.4, P4.2, P4.3 and P4.5. CI on `ubuntu-latest` is the real gate. The `--webpack` diagnostics were run and are recorded separately in `PHASE-4-TEST-RESULTS.md`; they are **not** the literal gates. `e2e:acceptance` was not run: this slice adds no acceptance spec and changes no acceptance path while the flag is off.

### Owner actions

1. **Request Google Business Profile API access** for the GCP project behind `GOOGLE_OAUTH_CLIENT_ID`. Quota stays at 0 until Google approves it. No reconnect is needed: the scope is already `business.manage`.
2. **Apply `0014`** by running [`rollout/apply-0014.sql`](rollout/apply-0014.sql) in the Neon SQL Editor as `neondb_owner`, on a Neon test branch of production first and then on production (a DEC-11 owner action). It refuses unless the journal is exactly `0001`–`0013`. That is the expected baseline on both hosted databases: the owner reported on 2026-10-04 that `0013` was applied on the Neon test branch and on production (journal `0001`–`0013`; not verified from this repository).
3. **Deploy** with `GBP_REPLY_PUBLISH_ENABLED` unset. Deploying before `0014` is **harmless while the flag is off** (proved by `test/integration/neon-publish-flag-off.integration.test.ts` against a schema that stops at `0013`), so the order of steps 2 and 3 is free; both must precede step 4.
4. **Separate release approval, non-production:** set `GBP_REPLY_PUBLISH_ENABLED=true` on a non-production deployment only, redeploy, and run `HOSTED-ACCEPTANCE-CHECKLIST.md` §22 against the Fimmick-owned listing (publish, read-back, reconcile, delete). Record the approval and the listing first.
5. **The production flag decision:** setting the flag in production is a further explicit owner decision after step 4 passes.
6. **Rollback: unset the flag and redeploy.** Publishing and deleting stop; replies already published stay on Google and can be removed there; reconcile keeps working; `0014` is additive and is not rolled back.

DEPLOY.md carries the same order ([`docs/integration/DEPLOY.md`](../../integration/DEPLOY.md), "P4.6 Google review-reply publishing: migration 0014 and the flag").

### Runbook — `apply-0014.sql`

The statement is [`rollout/apply-0014.sql`](rollout/apply-0014.sql). It was generated from the migration files on disk by a scratch script (kept outside the repository) that imports the repository's own `loadMigrations()` and hashes each file's text exactly as `applyMigrations` does; nothing embedded was typed. It is one `DO $apply$ … $apply$;` block that
- runs `SET LOCAL ROLE smeassistant_migrator`, and refuses unless `current_user` is that role;
- takes the runner's lock, `pg_advisory_xact_lock(1936549221, 3)` (`scripts/neon/migrations.ts`);
- refuses unless `neon_migrations.journal` is **exactly** ordinals 1–13 with the names and sha256 checksums of `neon/migrations/0001…0013`, as `loadMigrations()` computes them;
- `EXECUTE`s the exact text of `0014_publish_reply.sql` inside `$m0014$` (the generator refuses if the text contains `$m0014$` or `$apply$`; the migration's own `$guard$` and `$function$` blocks nest inside it);
- runs the post-apply checks of spec §1.6 and raises (rolling everything back) if any fails: the five new columns; the check constraint; both indexes as partial unique indexes on `deliveries`; the four functions owned by `smeassistant_migrator`, `SECURITY INVOKER`, `search_path=""`, EXECUTE for `sme_app_runtime` and none for `PUBLIC`; and `md5(prosrc)` of `export_output_version` equal to `33952a4e8f01eb27e5078bfad12163bc`, the md5 of the body between its `$function$` tags in `0014`;
- inserts journal row `(14, '0014_publish_reply.sql', 'e2c181b78e1e2015cf624e4465b0b392b02db2ac74c157f4cb5679e0233097a3')`.

Its header says, as required: `0014` is **not** required before deploying the P4.6 code; it **is** required before setting the flag; it re-creates `export_output_version`, but until a publish has finished `first_published_at` is null on every row, so exports count exactly as before; and a second run refuses with the journal message.

After generation every checksum was re-derived independently with `sha256sum` over the file bytes and each appears in the statement. Rows 1–12 are identical to `apply-0013.sql`'s, and row 13 carries the checksum `apply-0013.sql` records for `0013_preview_events.sql` (`98ec68e1…cf24`). The embedded text between the `$m0014$` tags is byte-identical to `0014_publish_reply.sql` (16,994 bytes, UTF-8 (it contains `§`), no CR; checked with a byte comparison). The statement is 26,056 bytes. The existing `.gitattributes` line `docs/implementation/owner-platform-v1/rollout/*.sql text eol=lf` covers the new file (`git check-attr eol` reports `lf`).

**Rehearsal (2026-10-04, disposable `postgres:16`, server 16.15, run twice, byte-identical JSON results).** The roles matched production, as in the earlier rehearsals: `neondb_owner` LOGIN CREATEROLE owning database `neondb`; `neondb_owner` created `smeassistant_migrator` NOLOGIN and `sme_app_runtime` NOLOGIN, and granted the migrator CREATE on the database and USAGE, CREATE on schema `public`. `0001`–`0009` were applied as the migrator through the repository's own `applyMigrations` (a pool whose connections `SET ROLE smeassistant_migrator`). `0010`–`0013` were then applied by running `apply-0010.sql` … `apply-0013.sql` themselves as `neondb_owner`, the way production gets them, each with its documented notices. The container was published on `127.0.0.1` only and removed afterwards (`docker rm -f` in a `finally`; no `rehearse-0014-*` container remained). Each block was sent as one query, as `neondb_owner`:

| # | Check | Result |
|---|---|---|
| 1 | Before `GRANT smeassistant_migrator TO neondb_owner WITH SET TRUE` | **refused**: `42501 permission denied to set role "smeassistant_migrator"`. Catalog and journal snapshot unchanged. |
| — | The grant, run as `neondb_owner` | succeeded (`set_option = true`, `inherit_option = true`, grantor `neondb_owner`) |
| — | `apply-0010.sql`, `apply-0011.sql`, `apply-0012.sql`, as `neondb_owner` | applied, each with its documented notices; journal 12 rows |
| 2 | Wrong journal: `0001`–`0012` only (`0013` not applied) | **refused**: `P0001 apply-0014 refused: neon_migrations.journal is not exactly 0001-0013 with the expected checksums (it has 12 rows)`. Snapshot unchanged. |
| — | `apply-0013.sql`, as `neondb_owner` | applied, with its two documented notices; journal 13 rows |
| — | Baseline on `0013`, under `SET ROLE sme_app_runtime` (rolled back) | an approved version's first export `counted: true`, a second export (copy) `counted: false`, usage 1, `delivery_state` `exported` (the `0011` body). |
| 3 | Wrong journal: rows 1–13 present, row 13's checksum altered (inside a transaction, rolled back) | **refused**: `P0001 apply-0014 refused: … (it has 13 rows)`. No `first_published_at` column after the rollback; snapshot unchanged. |
| 4 | First run (journal exactly `0001`–`0013`) | **applied**, with exactly one notice, `apply-0014: applied 0014_publish_reply.sql and recorded journal row 14` (every post-apply check passed). Journal rows 1–14 with the expected names, every checksum equal to `loadMigrations()`'s, row 14 `e2c181b7…97a3`. |
| 5 | `applyMigrations` with all fourteen, as the migrator | returned `[]`: nothing pending, so the runner accepts the journal's checksums |
| 6 | Objects, ownership and grants | Columns `deliveries.target_ref` text, `provider_receipt` jsonb, `failure_reason` text, `verified_at` timestamptz, `output_versions.first_published_at` timestamptz, all nullable. `deliveries_publish_target_check` = `CHECK (((mode <> 'publish'::text) OR (target_ref IS NOT NULL)))`. Both indexes `UNIQUE … WHERE ((mode = 'publish'::text) AND (state = ANY (ARRAY['publishing'::text, 'published'::text])))`, owned by the migrator. `begin_publish_output_version`, `finish_publish_output_version`, `cancel_published_reply` and `export_output_version`: owned by the migrator, `prosecdef = false` (**SECURITY INVOKER**), `proconfig = {search_path=""}`, EXECUTE for `sme_app_runtime`, none for `PUBLIC`. `export_output_version` `md5(prosrc)` = `33952a4e8f01eb27e5078bfad12163bc`, equal to the md5 computed independently from the migration file and to the value embedded in the statement. |
| 7 | Runtime smoke under `SET ROLE sme_app_runtime` (rolled back) | A lite workspace, location, review-response action and approved v1: `begin` → `{kind: begun, state: publishing}` with usage still 0; `finish(published)` → `{kind: finished, state: published, counted: true}`, usage 1; the delivery `mode publish`, `channel google_business`, `state published`, `counted true`, `verified_at` set, receipt present. Exporting v1 afterwards → `counted: false`, usage still 1, the version's `delivery_state` stays `published` with both `first_exported_at` and `first_published_at` set. A never-published v2: first export `counted: true`, a second (copy) `counted: false`, usage 2, `delivery_state` `exported` — the same as the `0013` baseline. No publish delivery remained after the rollback. |
| 8 | Second run | **refused**: `P0001 apply-0014 refused: … (it has 14 rows)`. Snapshot unchanged. |

The snapshot is an md5 over every relation (kind, owner, RLS, ACL), column, constraint, policy, index and function (signature, owner, security, body md5, ACL, config) in `public` and `neon_migrations`, plus the journal rows. `corepack pnpm db:verify` is part of the gate run below: `0001`–`0014`, replay `[]`. The generator and the rehearsal script were scratch files and are **not committed**. **`apply-0014.sql` has never been run against any Neon database.** The post-apply checks' failure branches were not exercised (on a correct apply every check passes); each raises inside the same transaction, so a failure rolls the migration back with the journal.

### Verification

Full detail is in `PHASE-4-TEST-RESULTS.md` ("P4.6"). One line per gate, run 2026-10-04, sequentially, at `95a766d` plus the Task 8 edits (documentation, the rollout statement and one code comment):

| Command | Result |
|---|---|
| `corepack pnpm install --frozen-lockfile` | exit 0, nothing changed. |
| `corepack pnpm typecheck` | **passed**, exit 0 (root and all four packages). |
| `corepack pnpm lint` | **passed**, exit 0, `0 errors, 38 warnings` across 19 files (P4.5: 30; +8, all unused fake-`fetch` parameters in the new `lib/oauth/google-reviews.test.ts`). |
| `corepack pnpm test` | **Not a clean pass: the one full run failed (exit 1), four files, each a 5,000 ms load timeout on its first test** (`identity-sdk`, `app/api/versions/[versionId]/versions.test.ts`, `scan-claim-single-path`, `scan-events-single-writer`, the same four as the P4.5 fix wave; 360 of 364 root files, 4,416 of 4,420 root tests passed). The four alone: 2 failed on the first rerun, **all 28 passed on the second**. The skipped stages passed separately: `safe-media` 1 / 62, `region` 3 / 23, `scoring` 16 / 183, `contracts` 3 / 20, `scan-engine` 28 / 299. Total counted once, all passing: **415 files / 5,007 tests** (P4.5 fix wave: 401 / 4,830). The P4.6 unit set alone: 17 files / 209 tests. |
| `corepack pnpm db:verify` | **passed**, `0001`–`0014`, replay empty, **41 tables / 491 columns / 204 constraints / 108 indexes / 8 triggers / 23 functions** (P4.5: 41 / 486 / 203 / 106 / 8 / 20). |
| `NEON_INTEGRATION=1 corepack pnpm test:integration` | **passed**, 49 files / 536 tests, first run (P4.5: 47 / 497). |
| `corepack pnpm test:secret-boundary` (literal) | **blocked**, exit 1 (it shells out to the Turbopack build). Diagnostic with a temporary `--webpack` on its build step (reverted): **passed**, `Secret boundary passed across 155 public artifacts.` |
| `corepack pnpm build` (literal, Turbopack) | **blocked**, exit 1: `Turbopack build failed with 45 errors`, `Can't resolve '@radix-ui/react-*'`; no file this branch adds or changes is in the traces. Diagnostic `next build --webpack`: **passed**, `Compiled successfully in 96s`, route manifest includes the four new routes. |
| `corepack pnpm e2e` (literal) | **blocked**, exit 1: `Acceptance service not healthy: http://localhost:3100`. The `--webpack` diagnostic first failed the same way because an unrelated local server (another project's `next start -p 3100`) held port 3100; on port 3197 (temporary edits, reverted): **30 / 31 passed**, the one failure `owner-shell.spec.ts:16`, the diagnostic-only failure recorded at P4.4–P4.5. |
| `corepack pnpm test:no-supabase` / `test:no-self-service-claim` | **passed** / **passed**. |
| Rehearsal | `apply-0014.sql` on a disposable `postgres:16`: eight checks plus a `0013` baseline, run twice, byte-identical results (see the runbook above). |
| Not run | `e2e:acceptance` (no new acceptance spec), `eval:workflows` (no new corpus case), and every hosted check. |
| Blocked | The literal `build`, `test:secret-boundary` and `e2e` (local Windows Turbopack only). |

### Invariants

- `git diff cef0a4d..95a766d --stat -- neon/migrations packages lib/agents/__snapshots__` lists only `neon/migrations/0014_publish_reply.sql` (359 insertions): no `0001`–`0013` edit, no vendored-package edit, no agent snapshot change.
- Usage is incremented only in SQL: `approved_deliveries + 1` appears only in `0004`, `0011` and `0014`; no application file counts a delivery.
- No delivery column holds review text, a reviewer name or reply text; `provider_receipt` holds `{ review_name, reply_update_time }`, `failure_reason` a closed code.
- With the flag off, the targets, publish and delete routes run zero SQL and call neither authorization, the limiter nor `fetch`, and nothing reads a `0014` column on a `0013` schema (`neon-publish-flag-off.integration.test.ts`).
- Logs carry only `{ category }` with a delivery or version id; tokens, review text, reply text and Google response bodies never reach a log or an error (log and error tests in the route, connection, client, limits and page-state suites).
