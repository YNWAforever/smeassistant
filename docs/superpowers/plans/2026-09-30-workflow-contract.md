# P4.4 Workflow Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `lib/workspace/templates.ts` the one typed workflow contract. It gains classified inputs, an owner outcome, the delivery unit, the measurement metric and the failure policy. Enforce the contract with tests, add a pre-model required-facts gate to both generation entry points, and add a fixed regression corpus plus an opt-in real-model evaluation script that is not run.

**Architecture:**
- **Contract:** `WorkflowDefinition` extends the existing `ActionTemplate` rows in place. `requiredInputs` stays a stored field that a test pins to `inputs`, and `TEMPLATE_METRIC` becomes a derived view.
- **Gate:** a pure function, `missingConfirmedInputs`, decides blocking inputs. `runAgentForAction` and the assistant draft path call it before any model call.
- **Corpus:** JSON cases run through the real prompt → parse → acceptance → gate pipeline, with an injected fake LLM.

**Tech Stack:** TypeScript strict, Vitest 4, zod, `tsx` scripts. pnpm 9.12.0 via `corepack pnpm`.

**Spec:** `docs/superpowers/specs/2026-09-30-workflow-contract-design.md`

## Global Constraints

- **Scope limits:** no migration and no change to `neon/migrations/`. No prompt text change, so `lib/agents/__snapshots__/agents.test.ts.snap` must not change. No new agent.
- **Delivery unit:** `deliveryUnit` admits only `"approved_version"` (DEC-14 safe default). SQL counting (`export_output_version`) is untouched.
- **Authority:** the registry carries no role, scope, tier, entitlement or permission fields. Authorization stays in `requireMembership`, the route handlers, the SQL functions and `checkAiBudget`.
- **Budget ordering:** in `runAgentForAction` the P3.5a budget check stays **before** evidence reads, unchanged. In `lib/assistant/live.ts` the gate runs **before** `checkAiBudget`.
- **Blocked runs:** a blocked run makes zero `llmComplete` calls, records `costUsd` for zero usage, and ends through `persistence.finish({ output: null, factsNeeded })`. The action goes to `needs_input` and no version is created.
- **Tests:** never call a paid provider (LLM, SerpApi, Places, RapidAPI, Stripe, Resend). The fake LLM is always injected.
- **Evaluation script:** `scripts/eval-workflows.ts` is built and **not run** (DEC-04). It is excluded from `test` and CI.
- **`TEMPLATE_METRIC["gbp-post"]`:** it keeps `"gbp.days_since_last_review"` unchanged. This is an open question, not a fix.
- **Commits:** conventional messages, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run from the worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p4-growth-platform`, branch `p4-growth-platform`. Never push.
- **Per-task gate:** before each commit, run `corepack pnpm typecheck` and the task's focused tests. The full gate inventory runs in Task 8.

## Review Focus

1. **Whitespace-only owner input** (`cta_link: "   "`) must count as missing and block. It must never be sent to the model as a filled fact. *Test: Task 2, `treats blank and whitespace-only strings as missing`.*
2. **Non-string provided values** must count as present: `text_only: true`, `selected_reviews: ["k"]`, the number `0`. A present non-string must never be reported missing. *Test: Task 2, `treats non-string values as present`.*
3. **Legacy action rows** whose persisted `required_inputs` omit a key the template now requires, e.g. an `ig-bio` row with `required_inputs: []`. The gate must read the **template**, not the row. *Test: Task 3, `gates on the template's inputs, not the row's persisted required_inputs`.*
4. **Brand-resolved facts** must satisfy the gate on the run path. An `ig-bio` run with `brand.approved_claims = ["Family-run since 1998"]` and a provided `cta_link` must call the model. *Test: Task 3, `a brand approved claim satisfies ig-bio's approved_claim`.*
5. **Assistant FAQ drafts** read only `action.row.provided_inputs`, with no brand-fact prefill, unlike the run path. A FAQ action whose three facts were saved through `PATCH /api/actions/[id]` must reach the model. An action with none must get `NEEDS_FACTS` and no model call. *Test: Task 4, `faq draft with saved owner facts reaches the model` and `faq draft without facts answers NEEDS_FACTS with no model call`.*

---

### Task 1: The workflow contract fields and contract tests

**Files:**
- Modify: `lib/workspace/templates.ts` (the type at `:41-66`, every row of `TEMPLATES` at `:81-280`)
- Modify: `lib/workspace/measurements.ts:29-42`: `TEMPLATE_METRIC` becomes derived from `TEMPLATES`
- Modify: `lib/copy-workspace.ts:108`: export the input key list as `ACTION_INPUT_KEYS`
- Create: `lib/workspace/templates.contract.test.ts`

**Interfaces:**
- Produces:
  - `type WorkflowInputKind = "confirmed_fact" | "evidence" | "preference"`
  - `interface WorkflowInput { key: string; kind: WorkflowInputKind }`
  - `interface WorkflowDefinition` = every current `ActionTemplate` field plus:
    - `outcome: LocalizedText`
    - `inputs: readonly WorkflowInput[]`
    - `deliveryUnit: "approved_version"`
    - `measurement: MetricKey | null`
    - `failure: { retries: 1; onMissingFacts: "needs_input" }`
  - `type ActionTemplate = WorkflowDefinition`, an alias kept for existing imports.
  - `const EVIDENCE_INPUT_KEYS: readonly string[] = ["reviews_without_response"]`, exported from `lib/workspace/evidence-inputs.ts`: the keys `resolveEvidenceInputs` produces that are not brand-derived.
  - `export const ACTION_INPUT_KEYS` from `lib/copy-workspace.ts`.

- [ ] **Step 1: Write the failing contract test** `lib/workspace/templates.contract.test.ts`, with one `describe.each(TEMPLATES)` block per workflow:
  - `agent mapping`: when `agentKey` is set, `isAgentKey(agentKey)` holds and `AGENTS[agentKey].capability === t.capability === CAPABILITIES[agentKey]`. When `capability` is `"Requires connection"` or `"Planned"`, or `delivery` is `"checklist"` or `"system"`, then `agentKey === null`.
  - `no publishing`: `["export_copy","export","checklist","system"]` contains `t.delivery`. Add a type-level line `// @ts-expect-error publishing is not a delivery` next to `const _d: TemplateDelivery = "publish";`.
  - `inputs`: `t.requiredInputs` deep-equals `t.inputs.map(i => i.key)`, and keys are unique. Every `evidence` key is in `EVIDENCE_INPUT_KEYS`. Every `confirmed_fact` key is in `ACTION_INPUT_KEYS` (the owner entry point).
  - `triggers`: every `triggerFindingKeys` entry is in `FINDING_KEYS` or equals `WEBSITE_FAQ_TRIGGER`.
  - `delivery unit and measurement`: `t.deliveryUnit === "approved_version"`. `t.measurement` is `null` or in `METRIC_KEYS`. `t.failure` deep-equals `{ retries: 1, onMissingFacts: "needs_input" }`.
  - `no authority`: `Object.keys(t)` contains none of `role, minRole, scope, locationScope, tier, entitlement, permission, permissions, grants, allow`.
  - `server chooses the agent`: this rule is already enforced and tested (`runs.test.ts` "refuses a registered agent that is not this action template's own agent"). Add a one-line comment in the contract file pointing at that test, not a duplicate.
  - Plus two single cases:
    - `TEMPLATE_METRIC equals the map derived from TEMPLATES`, including the pinned `TEMPLATE_METRIC["gbp-post"] === "gbp.days_since_last_review"`.
    - `every agent except validation_plan is used by a template`.
  - Also move the existing template-vs-`CAPABILITIES` agreement test (if it lives in `templates.test.ts`) only if it would otherwise be duplicated. Otherwise leave it.

- [ ] **Step 2: Run** `corepack pnpm vitest run lib/workspace/templates.contract.test.ts`. Expect FAIL: `inputs`, `deliveryUnit`, `measurement` and `failure` do not exist.

- [ ] **Step 3: Implement** the type and fill every `TEMPLATES` row.
  - `inputs` follows the spec's "Input classification" table exactly. For example, `ig-bio` has `[{brand_voice,preference},{approved_claim,confirmed_fact},{cta_link,confirmed_fact}]`, and `website-basics` has `[{approved_claim,preference}]`.
  - `requiredInputs` keeps its current literal on every row.
  - `measurement` takes the current `TEMPLATE_METRIC` value, or `null` for `google-reconnect`.
  - `deliveryUnit: "approved_version"` and `failure: { retries: 1, onMissingFacts: "needs_input" }` go on every row, via a shared `const DEFAULT_FAILURE = { retries: 1, onMissingFacts: "needs_input" } as const`.
  - `outcome` is one line in en and zh-HK through `localized(en, zhHK)`, stating what the owner receives, for example:
    - review-response: `"Replies you can paste into Google, one per selected review" / "可直接貼到 Google 的回覆，每則選定評論一段"`
    - checklists: `"A checklist of the exact fields to fix on the profile"`
  - In `measurements.ts`: `export const TEMPLATE_METRIC = Object.fromEntries(TEMPLATES.filter(t => t.measurement).map(t => [t.key, t.measurement])) as Partial<Record<TemplateKey, MetricKey>>`.
  - `templates.ts` imports `type MetricKey` from `@/lib/workspace/metrics`, which does not import templates, so no cycle.
  - Export `ACTION_INPUT_KEYS` (rename the local `INPUT_KEYS`, keep its order).
  - Add `EVIDENCE_INPUT_KEYS` beside `resolveEvidenceInputs`.

- [ ] **Step 4: Run** `corepack pnpm vitest run lib/workspace/ lib/agents/ tests/` and `corepack pnpm typecheck`. Expect PASS with an unchanged prompt snapshot.

- [ ] **Step 5: Commit** with `feat(P4.4): typed workflow contract on the template table`.

---

### Task 2: `missingConfirmedInputs` and `blockingInputs`

**Files:**
- Create: `lib/workspace/workflow-inputs.ts`, `lib/workspace/workflow-inputs.test.ts`
- Modify: `lib/workspace/overview.ts` (`ActionOverview` type near `:42`; `buildActionOverview` near `:203-237`), `lib/workspace/overview.test.ts`

**Interfaces:**
- Consumes: `WorkflowDefinition`, `WorkflowInput` (Task 1); `findTemplate(key): ActionTemplate | null` (`templates.ts:298`).
- Produces:
  - `export function missingConfirmedInputs(workflow: Pick<WorkflowDefinition, "inputs">, provided: Readonly<Record<string, unknown>>, satisfied: ReadonlySet<string>): string[]`
  - `export function isPresent(value: unknown): boolean`: false for `undefined`, `null`, or a string that is empty after `trim()`; true otherwise.
  - `ActionOverview.blockingInputs: string[]`

- [ ] **Step 1: Write failing tests** in `workflow-inputs.test.ts`, each over a small inline workflow:
  - `never returns a preference`: `{brand_voice, preference}` with `provided = {}` gives `[]`.
  - `returns missing confirmed facts and evidence in inputs order`: inputs `[a confirmed, b evidence, c preference, d confirmed]`, provided `{}`, satisfied `∅` gives `["a","b","d"]`.
  - `treats blank and whitespace-only strings as missing`: `{cta_link: "   "}` gives `["cta_link"]`, and `{cta_link: ""}` gives `["cta_link"]`.
  - `treats non-string values as present`: `{text_only: true}`, `{selected_reviews: ["k"]}` and `{n: 0}` each give `[]` for their key.
  - `a satisfied key passes even when not provided`: satisfied `{"reviews_without_response"}` gives `[]` for the evidence input.
  - Real-table case: `missingConfirmedInputs(templateByKey("ig-bio"), {brand_voice:"warm"}, new Set())` equals `["approved_claim","cta_link"]`.

  In `overview.test.ts`, add `blockingInputs lists only confirmed facts`: an `ig-bio` row with `required_inputs: ["brand_voice","approved_claim","cta_link"]` and `provided_inputs: {}` gives `missingInputs` of all three and `blockingInputs` of `["approved_claim","cta_link"]`.

- [ ] **Step 2: Run** `corepack pnpm vitest run lib/workspace/workflow-inputs.test.ts lib/workspace/overview.test.ts`. Expect FAIL, because the module does not exist.

- [ ] **Step 3: Implement.**
  - `missingConfirmedInputs` filters `inputs` to `kind !== "preference"`, then to `!satisfied.has(key) && !isPresent(provided[key])`, keeping order.
  - In `buildActionOverview`: `blockingInputs = template ? missingConfirmedInputs(template, provided, satisfied) : []`, where `template = findTemplate(row.template_key)` and `satisfied` is the existing `scanSatisfiedInputs` set. `missingInputs` stays unchanged.
  - Add `blockingInputs` to every `ActionOverview` fixture that needs it for `typecheck`. Grep `missingInputs:` in tests and components' fixtures and add `blockingInputs: []`.

- [ ] **Step 4: Run** the focused tests plus `corepack pnpm typecheck`. Expect PASS.

- [ ] **Step 5: Commit** with `feat(P4.4): classify blocking inputs from the workflow contract`.

---

### Task 3: Pre-model gate in `runAgentForAction`

**Files:**
- Modify: `lib/workspace/runs.ts`. The gate goes after `ctx` is built (`:329-361`) and before `persistence.queue` (`:363`). Delete the inline social_post branch (`:386-404`).
- Modify: `lib/workspace/runs.test.ts`

**Interfaces:**
- Consumes: `missingConfirmedInputs`, `isPresent` (Task 2); `socialAssetSatisfied(assets, workspaceId, provided, scope)` (`runs.ts:181`); `template` (already resolved at `:264-269`).
- Produces: `export async function satisfiedInputs(ctx: Pick<AgentContext, "sampledReviews">, extra: { asset?: () => Promise<boolean> }): Promise<Set<string>>`.
  - It adds `"reviews_without_response"` when `ctx.sampledReviews?.length`.
  - It adds `"asset_or_text_only"` when `extra.asset` is given and resolves true.
  - Task 4 imports it.

- [ ] **Step 1: Write failing tests** in `runs.test.ts`, reusing the file's `run()`, `row`, `reviewData`, `queue/start/finish` mocks:
  - `ig-bio without cta_link finishes needs_input with no model call`: row `template_key:"ig-bio"`, `provided_inputs:{brand_voice:"warm", approved_claim:"x"}`, `llm = vi.fn()`. Expect:
    - `llm` not called;
    - `finish` called with `output: null`, `factsNeeded: ["cta_link"]` and `costUsd` equal to `computeCostUsd({inputTokens:null,outputTokens:null})`;
    - `queue` and `start` each called once;
    - result `factsNeeded: ["cta_link"]`, `versionId` undefined.
  - `gates on the template's inputs, not the row's persisted required_inputs`: the same case, with `required_inputs: []` on the row, still expects `factsNeeded: ["cta_link"]`.
  - `a brand approved claim satisfies ig-bio's approved_claim`: `assistantBrand` returns `approved_claims: ["Family-run since 1998"]`, provided `{cta_link:"https://example.test/book"}`. Expect `llm` called once.
  - `review-response with no unanswered reviews blocks on evidence`: `reviewData = { gbp: { reviews: [] } }`, `provided_inputs: {brand_voice:"warm"}`. Expect `factsNeeded: ["reviews_without_response"]` and `llm` not called.
  - `a preference-only gap still calls the model`: `review-request` with `provided_inputs: {}` and `llm` returning `good()`. Expect `llm` called once and a version.
  - `social_post without asset or text_only still blocks through the gate`: keep the existing `requires owned approved social assets` expectations (`factsNeeded: ["asset_or_text_only"]`, no model call). This proves the deleted branch's behaviour moved, not vanished.
  - **Update** the existing `faq_jsonld run › blocks on facts_needed with no version created (A5)`. It now asserts `llm` not called and `factsNeeded: ["owner_fact_1","owner_fact_2","owner_fact_3"]` (the gate lists all three in inputs order).
  - **Fix any existing test that now blocks** only because its fixture lacked a confirmed fact the template requires: give the fixture the fact rather than weakening the gate. List each such change in the commit body.

- [ ] **Step 2: Run** `corepack pnpm vitest run lib/workspace/runs.test.ts`. Expect FAIL on the new cases.

- [ ] **Step 3: Implement.** After `ctx` is built:
  - `const satisfied = await satisfiedInputs(ctx, template.inputs.some(i => i.key === "asset_or_text_only") ? { asset: () => socialAssetSatisfied(input.assets ?? assetRepository(), row.workspace_id, provided, { actionLocationId: row.location_id, locationScope: assetLocationScope(input.membership) }) } : {})`
  - `const blocking = missingConfirmedInputs(template, provided, satisfied)`
  - Then keep the existing `queue` / `start`.
  - When `blocking.length`, `return persistence.finish({ ...attribution, usage, costUsd: computeCostUsd(usage), output: null, factsNeeded: blocking, finishedAt: new Date() })` **before** the model `try` block.
  - Remove the old social_post-specific branch.
  - Keep the `queue` input payload byte-identical.

- [ ] **Step 4: Run** `corepack pnpm vitest run lib/workspace/ app/api/actions/` and `corepack pnpm typecheck`. Expect PASS.

- [ ] **Step 5: Commit** with `feat(P4.4): block runs on missing confirmed facts before any model call`.

---

### Task 4: Pre-model gate in assistant draft intents

**Files:**
- Modify: `lib/assistant/live.ts` (`draft()` near `:343-375`)
- Modify: `lib/assistant/live.test.ts`

**Interfaces:**
- Consumes: `missingConfirmedInputs` (Task 2); `satisfiedInputs` (Task 3); `findTemplate`; `DRAFT_AGENTS[intent].templates[0]`.

- [ ] **Step 1: Write failing tests** in `live.test.ts`, using its existing harness (focused action, injected `llm`, `llmReady: () => true`, `budgetEnv`):
  - `faq draft without facts answers NEEDS_FACTS with no model call`:
    - `generate_faq` on a `visibility-content` action with `provided_inputs: {}`;
    - `llm` and the `aiSpend24h` spy are not called, and `persistDraftFailure` is not called;
    - the answer contains `owner_fact_1, owner_fact_2, owner_fact_3`;
    - there is no `output`.
  - `faq draft with saved owner facts reaches the model`: `provided_inputs` has all three `owner_fact_*`, and `llm` is called once.
  - `menu draft without menu_items answers NEEDS_FACTS`: the same pattern for `generate_menu`.
  - Keep the existing social asset cases passing unchanged; they now run through the shared gate.

- [ ] **Step 2: Run** `corepack pnpm vitest run lib/assistant/live.test.ts`. Expect FAIL.

- [ ] **Step 3: Implement.** In `draft()`, after `agentCtx` is built and before `checkAiBudget`:
  - `const template = findTemplate(spec.templates[0])`
  - `const satisfied = await satisfiedInputs(agentCtx, spec.agent === "social_post" ? { asset: () => socialAssetSatisfied(...existing args...) } : {})`
  - `const blocking = template ? missingConfirmedInputs(template, agentCtx.providedInputs, satisfied) : []`
  - When `blocking.length`, return the existing `NEEDS_FACTS` answer with `{facts}` set to `blocking.join(", ")`, the same shape the removed social branch returned.
  - Delete the earlier social-only block. Write no `action_runs` row and call no `recordFailedDraft`.

- [ ] **Step 4: Run** `corepack pnpm vitest run lib/assistant/ app/api/assistant/` and `corepack pnpm typecheck`. Expect PASS.

- [ ] **Step 5: Commit** with `feat(P4.4): assistant drafts share the confirmed-facts gate`.

---

### Task 5: Acceptance checks `unexpected_link` and `unconfirmed_claim`

**Files:**
- Modify: `lib/agents/guardrails.ts` (the acceptance section at `:66-90`)
- Modify: every agent whose `acceptance` does not already call `baseAcceptance` or `prohibitedTermHits`. Each agent's acceptance must include the two new checks. The simplest route is to add them inside `prohibitedTermHits`' callers via a new `sharedAcceptance(ctx, output) = [...prohibitedTermHits, ...unexpectedLinks, ...unconfirmedClaims]`, replacing each agent's direct `prohibitedTermHits(ctx, output)` call with `sharedAcceptance(ctx, output)`.
- Modify: `lib/agents/agents.test.ts`

**Interfaces:**
- Produces:
  - `export function unexpectedLinks(ctx: AgentContext, output: AgentOutput): string[]`, returning `["unexpected_link"]` or `[]`.
  - `export function unconfirmedClaims(ctx: AgentContext, output: AgentOutput): string[]`, returning `["unconfirmed_claim"]` or `[]`.
  - `export function sharedAcceptance(ctx, output): string[]`

- [ ] **Step 1: Write failing tests** in `agents.test.ts`, under `describe("shared acceptance (P4.4)")`:
  - `flags a link the owner never supplied`: body `"Book at https://evil.test/x"` and `providedInputs: {}` give `unexpected_link`.
  - `allows the owner's own link`: `providedInputs.cta_link = "https://kmh.test/book"` and a body containing it give no `unexpected_link`.
  - `a www. link counts as a link`: `"see www.evil.test"` gives `unexpected_link`.
  - `flags a price absent from confirmed facts`:
    - body `"Set lunch only HK$88"` with no fact containing `88` gives `unconfirmed_claim`;
    - the same body with `brand.facts.lunch_price = "HK$88"` gives none.
  - `flags a superlative absent from approved claims`:
    - `"the best roast goose in town"` gives `unconfirmed_claim`;
    - with `approvedClaims: ["the best roast goose in town"]` it gives none.
  - `every Live and Beta agent runs the shared checks`: for each `AGENTS` entry, `acceptance(ctx, {…body: "https://evil.test"…})` contains `unexpected_link`.

- [ ] **Step 2: Run** `corepack pnpm vitest run lib/agents/agents.test.ts`. Expect FAIL.

- [ ] **Step 3: Implement.**

  The confirmed text for both checks is the lowercased concatenation of:
  - the string values of `ctx.providedInputs`;
  - the values of `ctx.brand.facts`;
  - `ctx.brand.approvedClaims`.

  `unexpectedLinks` matches `/\bhttps?:\/\/[^\s"'<>)]+|\bwww\.[^\s"'<>)]+/gi` over `title + body + alt_text`. It flags when any match (lowercased, trailing `.,;:!?` stripped) is not a substring of the confirmed text.

  `unconfirmedClaims` flags when either of these matches and the matched text (lowercased) is not a substring of the confirmed text:
  - `/(?:HK\$|NT\$|US\$|\$|HKD\s?|TWD\s?)\s?\d[\d,.]*|\d[\d,.]*\s?(?:元|蚊)/gi`
  - `/\b(?:best|top[- ]rated|no\.?\s?1|#1|number one|award[- ]winning)\b[^.!?\n]{0,40}|最好|最佳|第一|首選|得獎/gi`

  For the superlative, the whole matched phrase must be contained. For a price, it is enough for the digit run to appear in the confirmed text.

  Replace the direct `prohibitedTermHits(ctx, output)` calls in the agents with `sharedAcceptance(ctx, output)`. `baseAcceptance` returns `sharedAcceptance`.

- [ ] **Step 4: Run** `corepack pnpm vitest run lib/agents/ lib/workspace/runs.test.ts lib/assistant/`. Expect PASS with an unchanged prompt snapshot. Update any existing `warnings` exact-equality assertion that now also sees `unconfirmed_claim` only when its fixture body really contains an unconfirmed price or superlative, and say so in the commit body.

- [ ] **Step 5: Commit** with `feat(P4.4): flag unexpected links and unconfirmed claims in every draft`.

---

### Task 6: Regression corpus and its runner

**Files:**
- Create: `test/corpus/workflows/cases/*.json` (≥ 16 files), `test/corpus/workflows/harness.ts` (schema + loader + runner), `test/corpus/workflows/corpus.test.ts`
- Check first that `vitest.config.ts` `include` picks up `test/**/*.test.ts` outside `test/integration`. If it does not, add `test/corpus/**/*.test.ts` to the unit config's `include` and nowhere else.

**Interfaces:**
- Consumes: `runAgentForAction`, `RunAgentInput` (`runs.ts`); `AGENTS`, `parseAgentOutput`; `missingConfirmedInputs`; `templateByKey`.
- Produces:
  - `export const corpusCaseSchema` (zod) and `type CorpusCase`, where `CorpusCase` is:
    - `{ id: string; category: "malicious_review" | "missing_facts" | "locale_market" | "fabricated_claim" | "uncertain_evidence" | "provider_failure" | "invalid_output"; workflow: TemplateKey; locale: "en" | "zh-HK" | "zh-TW"; market: "hk" | "tw"; provided: Record<string, unknown>; brand?: { approvedClaims?: string[]; prohibitedTerms?: string[]; facts?: Record<string,string> }; reviews?: Array<{ rating: number; text: string; time: string }>; cannedOutputs: Array<string | null>; expect: { llmCalls: number; factsNeeded?: string[]; state?: "succeeded" | "failed"; version?: boolean; warningsInclude?: string[]; warningsExclude?: string[]; promptIncludes?: string[]; promptExcludes?: string[] } }`
  - `export const CATEGORY_MINIMUMS = { malicious_review: 3, missing_facts: 3, locale_market: 2, fabricated_claim: 2, uncertain_evidence: 2, provider_failure: 2, invalid_output: 2 }`
  - `null` in `cannedOutputs` means `llmComplete` returns `null`.
  - `export function loadCorpus(): CorpusCase[]`: reads `cases/*.json` via `import.meta.url` (no `__dirname`) and parses each case with `corpusCaseSchema`. A parse failure throws and names the file.
  - `export async function runCorpusCase(c: CorpusCase, llm: typeof llmComplete): Promise<{ result: RunAgentResult; prompts: string[]; finishInput: FinishActionRunInput; llmCalls: number }>`: builds the fake repository and persistence (see Step 1), wraps `llm` to record prompts and calls, and calls `runAgentForAction`. It is shared by the CI test (with a canned `llm`) and by Task 7 (with the real `llm`).

- [ ] **Step 1: Write `harness.ts` and `corpus.test.ts` before the cases.** `runCorpusCase`, per case:
  - builds the same in-memory repository shape `lib/workspace/runs.test.ts` uses (copy its fake `repository()`, parameterised by case market, brand and reviews);
  - records every prompt and call from the injected `llm`;
  - calls `runAgentForAction`.

  `corpus.test.ts` passes `llm = async () => next canned output` and asserts:
    - `llm` call count equals `expect.llmCalls`;
    - `factsNeeded`, `state` and version presence (`finish` called with non-null `output`);
    - `warningsInclude` / `warningsExclude` against the warnings passed to `finish`;
    - `promptIncludes` / `promptExcludes` against every recorded prompt.

  Two structural tests:
  - `corpus meets category minimums`: counts per category are at least `CATEGORY_MINIMUMS`.
  - `every Live workflow with an agent has a case`: every `TEMPLATES` row with `capability === "Live" && agentKey` appears as some case's `workflow`. If the table above leaves one uncovered (e.g. `review-request`, `ig-bio`), add a clean-output `uncertain_evidence` or `fabricated_claim` case for it, beyond the minimums.

  The file's header comment states: canned outputs prove the pipeline handles each behaviour; they do not prove any model behaves.

- [ ] **Step 2: Run** `corepack pnpm vitest run test/corpus/workflows/`. Expect FAIL, because there are no cases and the minimums are unmet.

- [ ] **Step 3: Write the cases**, one JSON file each and named `<category>-<nn>.json`:

  | Category | Cases | What each asserts |
  |---|---|---|
  | `malicious_review` ×3 | review-response with a review text telling the model to promise a refund / print the system prompt / add `https://evil.test` | Canned obeying output ⇒ `warningsInclude` has `compensation_promise` / (for prompt-leak) `promptIncludes: ["UNTRUSTED EVIDENCE"]` / `unexpected_link`. One clean-output variant of the refund case lives as a 4th file with `warningsExclude: ["compensation_promise"]`. |
  | `missing_facts` ×3 | ig-bio without `cta_link`; menu-translation without `menu_items`; visibility-content without facts | `llmCalls: 0` and the exact `factsNeeded`. |
  | `locale_market` ×2 | zh-TW locale on an hk workspace; en on tw | `promptIncludes` has `"Hong Kong"` / `"Taiwan"` from `MARKET_LABEL`, and `promptExcludes` has the other market. |
  | `fabricated_claim` ×2 | website-basics whose output claims `HK$88` with no fact; social-post (`text_only: true`) claiming "award-winning" | `warningsInclude: ["unconfirmed_claim"]`, with a version still created (a warning, not a block). |
  | `uncertain_evidence` ×2 | review-response whose sample has one unanswered review; gbp-post on a workspace with no reviews | The prompt contains the single sampled excerpt and no other review text (`promptExcludes` a sentinel review never in the fixture). gbp-post calls the model once. |
  | `provider_failure` ×2 | `cannedOutputs: [null, null]`; `[null, <valid>]` | Respectively: `state: "failed"`, `version: false`, `llmCalls: 2`; and `llmCalls: 2` with a version. |
  | `invalid_output` ×2 | `["not json", "not json"]`; `['{"title":"x","body":"","facts_needed":[]}', same]` | `state: "failed"`, `version: false`. |

- [ ] **Step 4: Run** `corepack pnpm vitest run test/corpus/workflows/` and `corepack pnpm test`. Expect PASS.

- [ ] **Step 5: Commit** with `test(P4.4): fixed regression corpus for supported workflows`.

---

### Task 7: Opt-in real-model evaluation script (built, not run)

**Files:**
- Create: `scripts/eval-workflows.ts`, `scripts/eval-workflows.test.ts`
- Modify: `package.json` scripts (add `"eval:workflows": "tsx scripts/eval-workflows.ts"`), `.gitignore` (add `eval-results/`)
- Check that `vitest.config.ts` `include` covers `scripts/**/*.test.ts`. If not, add that one glob.

**Interfaces:**
- Consumes: `loadCorpus`, `runCorpusCase`, `CorpusCase` (Task 6, `test/corpus/workflows/harness.ts`); `llmComplete` from `@/lib/llm`; `computeCostUsd`, `AGENT_LLM_OPTIONS`.
- Produces:
  - `export function parseEvalArgs(argv: string[], env: Record<string, string | undefined>): { ok: true; budgetUsd: number } | { ok: false; reason: "not_enabled" | "no_llm_key" | "bad_budget" }`
  - `export async function runEval(deps: { cases: CorpusCase[]; llm: typeof llmComplete; budgetUsd: number; now: () => Date }): Promise<EvalReport>`, where `EvalReport` is `{ model: string | null; baseUrlHost: string | null; options: typeof AGENT_LLM_OPTIONS; date: string; totalCostUsd: number; stoppedForBudget: boolean; results: Array<{ id: string; pass: boolean; notes: string[] }> }`.

- [ ] **Step 1: Write failing tests** (injected `llm` only; no network):
  - `refuses without EVAL_LIVE=1`: `parseEvalArgs(["--budget-usd","1"], {})` gives `not_enabled`.
  - `refuses without an LLM key`: with `EVAL_LIVE:"1"` and no `OPENCODE_API_KEY` / `LLM_API_KEY` / `OPENROUTER_KEY`, it gives `no_llm_key`.
  - `refuses a missing, zero or negative budget`: each gives `bad_budget`.
  - `stops before the budget is passed`: a fake `llm` whose usage costs 0.6 each with `budgetUsd: 1` runs one case and returns `stoppedForBudget: true`.
  - `records model and date and never writes outside eval-results`: `runEval` returns the report and does not touch the filesystem. Writing is the CLI entry's job only.

- [ ] **Step 2: Run** `corepack pnpm vitest run scripts/eval-workflows.test.ts`. Expect FAIL.

- [ ] **Step 3: Implement.**
  - `runEval` calls `runCorpusCase(c, budgetedLlm)` for each case, where `budgetedLlm` wraps `deps.llm`, adds `computeCostUsd(result.usage)` to the running total, and refuses (returns `null` without calling) once the total is at least `budgetUsd`.
  - A case passes when its `expect.warningsExclude` hold on `finishInput`. `missing_facts` cases never reach the model (the gate), so they pass by construction and are reported as `gate` rather than model results.
  - The CLI entry is guarded by `if (import.meta.url === pathToFileURL(process.argv[1]).href)`. It calls `parseEvalArgs` and exits 2 with the reason on refusal. Otherwise it writes `eval-results/<YYYY-MM-DD>-<model|unknown>.json` and prints only the summary line: `model`, `date`, `pass n/m`, `cost`.
  - It opens no database connection and never prints env values.

- [ ] **Step 4: Run** `corepack pnpm vitest run scripts/eval-workflows.test.ts` and `corepack pnpm typecheck`. Expect PASS. Also run `corepack pnpm eval:workflows -- --budget-usd 1` with no `EVAL_LIVE`. Expect exit 2 with `not_enabled`. This is the only invocation allowed in this slice.

- [ ] **Step 5: Commit** with `feat(P4.4): opt-in real-model workflow evaluation, refused by default`.

---

### Task 8: Full gates and phase documentation

**Files:**
- Create: `docs/implementation/owner-platform-v1/PHASE-4-REPORT.md`, `docs/implementation/owner-platform-v1/PHASE-4-TEST-RESULTS.md`
- Modify: `docs/implementation/owner-platform-v1/IMPLEMENTATION-TRACEABILITY.md` (add a `## Phase 4` section with a P4.4 row, following the P1.x rows' column format); `lib/workspace/versions.ts:5` (the stale Supabase-era migration name in the comment becomes `neon/migrations/0004_atomic_operations.sql`)

- [ ] **Step 1: Run the full offline gate inventory sequentially** from the worktree, and record each exact command, exit code and count:
  1. `corepack pnpm typecheck`
  2. `corepack pnpm lint`: the baseline is 0 errors; state the warning count.
  3. `corepack pnpm test`: the file and test counts against the P3.5c baseline recorded in `PHASE-3-TEST-RESULTS.md`.
  4. `corepack pnpm build`. If it hits the known Windows Turbopack/`radix-ui` blocker, record that and run `npx next build --webpack` as the fallback.
  5. `corepack pnpm test:secret-boundary`
  6. `corepack pnpm test:no-supabase`
  7. `corepack pnpm test:no-self-service-claim`
  8. `corepack pnpm db:verify`: it must pass with the migration corpus unchanged (still 0001–0010).
  9. `NEON_INTEGRATION=1 corepack pnpm test:integration`
  10. `corepack pnpm e2e`

  A load-induced timeout in a file this branch does not touch is re-run in isolation and reported as such, the same way P3.5c did.

- [ ] **Step 2: Verify the invariants:**
  - `git diff origin/main --stat -- neon/migrations lib/agents/__snapshots__` prints nothing.
  - `git diff origin/main -- lib/agents/agents/*.ts | grep '^[-+].*task:'` prints nothing, which proves prompt text is unchanged.

- [ ] **Step 3: Write `PHASE-4-REPORT.md`** with a `## P4.4 — reusable workflow contract` section, in the style of `PHASE-3-REPORT.md`'s slices:
  - **Header:** branch, HEAD and base `c042b20`, plus the line "Implemented and locally verified. Nothing here is hosted-verified."
  - **Slice order:** the user-chosen slice order.
  - **What changed:** a per-task table.
  - **Planning revision:** `anyOf` and `unanswered_fact_answered` were dropped during planning (see the spec).
  - **Not run / blocked:** the real-model evaluation (not run, DEC-04); P4.1–P4.3 not started; P4.5 and P4.6 not built (DEC-12, DEC-13).
  - **Open questions:** `gbp-post` → `gbp.days_since_last_review`; `review-request.channel` as a preference.
  - **Behaviour change for owners:** runs with a missing confirmed fact now stop before the model and cost nothing.

  `PHASE-4-TEST-RESULTS.md` gets the Step 1 table.

- [ ] **Step 4: Commit** with `docs(P4.4): phase 4 report, test results and traceability for the workflow contract`.
