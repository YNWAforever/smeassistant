# P4.4 — Reusable workflow contract and regression corpus: design

**Date:** 2026-09-30 · **Branch:** `p4-growth-platform` (from `origin/main` at `c042b20`, PR #26) · **Status:** approved in brainstorming, awaiting spec review

## Why

Master Plan §7 P4.4: "Use one typed internal definition for capability key, owner outcome, availability evidence, permitted template/agent mapping, required confirmed facts, evidence resolver, output validation, review/delivery unit, expected measurement and failure handling. Keep actual authorization, SQL approval/export and provider permission checks centralized. Registry metadata must not grant permissions. Add contract tests so a new workflow cannot claim unsupported publishing, bypass required inputs or choose any arbitrary agent." It also asks for "a fixed regression corpus", with deterministic local tests kept separate from authorized real-model evaluations.

This is the first Phase 4 slice. The user chose the order: P4.4 contract → P4.1 offers and promotion copy → P4.2 work packs → P4.3 contextual assistant. P4.5 (preview) and P4.6 (publishing) stay unbuilt and off, because DEC-12 and DEC-13 are not authorized. The later slices will add workflows, and the contract is built first so that they are built on it.

The baseline at `c042b20`:

- **The workflow definition is spread over four tables that nothing forces to agree:**
  - `TEMPLATES` in `lib/workspace/templates.ts:81-280`: trigger keys, capability, `agentKey`, `requiredInputs: string[]`, delivery, channel, `verifyChecks`, copy.
  - `AGENTS` in `lib/agents/index.ts:21-33`: 11 implemented agents, with 7 Live and 4 Beta.
  - `CAPABILITIES` in `lib/capabilities.ts:9-25`.
  - `TEMPLATE_METRIC` in `lib/workspace/measurements.ts:29-42`.
- **Required inputs are not enforced on the server at run time.** `runAgentForAction` (`lib/workspace/runs.ts:249-456`) never compares `requiredInputs` with what it resolved. The one exception is social_post: with no usable asset and no `text_only`, it finishes with `factsNeeded: ["asset_or_text_only"]` (`runs.ts:392-404`). Every other missing fact is left to the model, which a guardrail line asks to report missing facts in `facts_needed` (`lib/agents/guardrails.ts:58`). A model that ignores that line invents the fact, and the run is still paid for.
- **The assistant draft path** (`lib/assistant/live.ts`, `DRAFT_AGENTS`) has the same gap: it calls `llmComplete` and only then reads `facts_needed`.
- **Regression tests exist but are scattered.** They are deterministic unit tests in `lib/agents/agents.test.ts`: fence, injection scenario A7, acceptance checks, FAQ missing-fact prompts. There is no corpus and no real-model evaluation harness.

## Decisions (user, 2026-09-30)

1. **Contract home: extend the template table in place.** `ActionTemplate` becomes the exported `WorkflowDefinition` in `lib/workspace/templates.ts`. There is no second registry that could drift from it (Master Plan §8.1, "change existing seams before introducing new architecture").
2. **Gate strictness: typed input kinds.** Each input is tagged per template as `confirmed_fact` (blocks while missing), `evidence` (resolved from the scan; blocks while unresolved) or `preference` (has a safe default or is optional; never blocks). Only real facts stop a run, so current flows that rely on defaults keep working.
3. **Delivery unit stays per approved version.** DEC-14 (delivery units for multi-output promotions and packs) is open, so its safe default applies. The type admits only `"approved_version"`, and SQL counting (`export_output_version`, `neon/migrations/0004_atomic_operations.sql:422-501`) is unchanged.
4. **The real-model evaluation is built but not run.** DEC-04 (provider and generation spend) does not authorize live generations.
5. **The `gbp-post` metric is recorded, not changed.** See "Open questions".

## 1. The contract — `lib/workspace/templates.ts`

`ActionTemplate` is renamed `WorkflowDefinition`. `ActionTemplate` stays as a type alias, so existing imports compile, and every existing field is kept. `TEMPLATES` keeps its name and order.

Fields added:

| Field | Type | Meaning |
|---|---|---|
| `outcome` | `LocalizedText` | One line on what the owner gets, e.g. "Replies you can paste into Google, one per selected review". It is distinct from `summary`, which describes the problem. Copy is en and zh-HK; zh-TW falls back through `localized()` as elsewhere in the table. |
| `inputs` | `readonly WorkflowInput[]` | `{ key: string; kind: "confirmed_fact" \| "evidence" \| "preference" }`. It is classified per template, not per key, because `approved_claim` is a hard fact for `ig-bio` and only a preference for `website-basics`. |
| `anyOf` | `readonly (readonly string[])[]` (optional) | Groups of `confirmed_fact` keys where at least one key per group satisfies the requirement. The group members are then not individually required. |
| `deliveryUnit` | `"approved_version"` | The billable unit (DEC-14 safe default). |
| `measurement` | `MetricKey \| null` | This moves `TEMPLATE_METRIC` here. `measurements.ts` keeps exporting `TEMPLATE_METRIC`, derived from `TEMPLATES`, so its callers do not change. |
| `failure` | `{ retries: 1; onMissingFacts: "needs_input" }` | The current behaviour stated as data: one retry on invalid or empty output, and missing facts leave the action in `needs_input`. It is literal-typed so it cannot drift silently. |

`requiredInputs` is kept as a plain field whose value equals `inputs.map(i => i.key)`, and a contract test asserts the equality. It must stay a stored list because derivation writes it verbatim into `actions.required_inputs` (`lib/repositories/action-derivation.ts:105`). Persisted rows, derivation SQL and `buildActionOverview`'s "missing" display are therefore unchanged.

### Input classification

| Template | Agent | Inputs (kind) | `anyOf` |
|---|---|---|---|
| review-response | review_reply | brand_voice (preference), reviews_without_response (evidence), language (preference) | — |
| review-request | review_request | brand_voice (preference), channel (preference) | — |
| gbp-profile-fix | — (checklist) | opening_hours (confirmed_fact), categories (confirmed_fact) | — |
| gbp-photo-pack | photo_brief | — | — |
| gbp-post | gbp_post | brand_voice (preference) | — |
| social-post | social_post | asset_or_text_only (confirmed_fact), alt_text (preference) | — |
| ig-bio | ig_bio | brand_voice (preference), approved_claim (confirmed_fact), cta_link (confirmed_fact) | — |
| ig-highlights | — (checklist) | — | — |
| visibility-content | faq_jsonld | owner_fact_1, owner_fact_2, owner_fact_3 (confirmed_fact) | `[[owner_fact_1, owner_fact_2, owner_fact_3]]` |
| website-basics | website_basics | approved_claim (preference; the prompt uses it "only if it fits naturally") | — |
| local-seo-brief | local_seo_brief | — | — |
| menu-translation | menu_translation | menu_items (confirmed_fact) | — |
| google-reconnect | — (system) | google_account_owner (confirmed_fact) | — |

**FAQ answers the owner did not give are left out, never invented.** The prompt already shows an unanswered question as "(not provided)" (`agents.test.ts` "still shows a missing fact as missing"). A `faq_jsonld` acceptance check is added: output that answers a question whose fact is missing gets the warning `unanswered_fact_answered`.

**The checklist and system gates only affect display.** Those templates have no agent, so the run gate never reaches them. Their `confirmed_fact` tags only drive what the overview shows as missing.

### What the contract does not carry

The contract has no role, membership, location-scope, tier, entitlement or provider-permission fields. Authorization stays in:

- `requireMembership` (`lib/auth.ts`);
- the route handlers;
- SQL approval and export (`approve_output_version`, `export_output_version`);
- the spend budget (`checkAiBudget`);
- the provider connection checks.

A contract test enforces this (§3).

## 2. The pre-model gate

### `lib/workspace/workflow-inputs.ts` (new, pure)

```ts
export function missingConfirmedInputs(
  workflow: WorkflowDefinition,
  provided: Readonly<Record<string, unknown>>,
  satisfied: ReadonlySet<string>,   // scan-resolved (resolveEvidenceInputs) + custom satisfiers
): string[]
```

It returns the `confirmed_fact` and `evidence` keys that are neither in `satisfied` nor present in `provided`. Present means not `undefined`, not `null`, and not a string that is empty after trimming. For each `anyOf` group that has no member present, it returns the group's first missing key, so the owner sees one prompt for the group rather than three. `preference` keys are never returned. The function uses no I/O and reads no clock.

`buildActionOverview` (`lib/workspace/overview.ts:204`) keeps its current `missingInputs` computation, which lists every required key for display. It gains one field:

- `blockingInputs: string[]` = `missingConfirmedInputs(...)`.

The UI can then say which missing inputs stop a draft. Wiring that into the view is P4.3's job (the contextual assistant). This slice only exposes it and covers it with tests.

### `runAgentForAction` (`lib/workspace/runs.ts`)

After `provided` is assembled (`runs.ts:301-306`) and **before** `persistence.queue`, it computes:

```ts
const satisfied = new Set([...scanSatisfied, ...(await customSatisfiers(...))]);
const blocking = missingConfirmedInputs(template, provided, satisfied);
```

`scanSatisfied` is the set `resolveEvidenceInputs` already produces for the action's snapshot. `customSatisfiers` holds the one existing special case: `asset_or_text_only` is satisfied when `socialAssetSatisfied(...)` is true. The inline social_post branch at `runs.ts:392-404` is removed in favour of this.

When `blocking` is non-empty, the run follows the existing short-circuit shape:

- **Records and states:** `queue` → `start` → `finish({ output: null, factsNeeded: blocking, usage: { null, null }, costUsd: computeCostUsd(zero usage) })`. `finish` already sets the action to `needs_input` and creates no version (`lib/repositories/artifacts.ts:367-384`).
- **Spend:** no `checkAiBudget` spend and no `llmComplete` call.
- **Audit:** the run's audit events are unchanged (`run.started`, `run.succeeded` with `facts_needed`), so the Activity page shows why nothing was drafted.

Keeping the run row, rather than returning 422 before any row exists, matches today's social_post behaviour and the §3.2.3 contract: "facts_needed non-empty → action.action_state = 'needs_input', run 'succeeded' with output.facts_needed".

### Assistant draft intents (`lib/assistant/live.ts`)

Before `checkAiBudget`, the draft branch calls the same `missingConfirmedInputs`:

- the template is `DRAFT_AGENTS[intent].templates[0]`, resolved through `findTemplate`;
- `provided` is `agentCtx.providedInputs`;
- `satisfied` comes from the same satisfier set, and the existing social asset check folds into it.

When facts are missing, it returns the existing `NEEDS_FACTS` answer listing the blocking keys. It writes no `action_runs` row and makes no model call. `recordFailedDraft` exists to charge post-model spend, and here nothing was spent. The route's `assistant.run` audit event still fires. The assistant still never mutates actions or versions.

## 3. Contract tests — `lib/workspace/templates.contract.test.ts`

For every entry in `TEMPLATES`:

1. **Agent mapping:**
   - if `agentKey` is set, `isAgentKey(agentKey)` holds and `AGENTS[agentKey].capability === capability`, which must also equal `CAPABILITIES[agentKey]`;
   - if `capability` is `Requires connection` or `Planned`, then `agentKey === null`;
   - if `delivery` is `checklist` or `system`, then `agentKey === null`.
2. **No publishing:** `delivery` is one of `export_copy | export | checklist | system`. A type-level assertion (`// @ts-expect-error` on a `"publish"` literal) plus a runtime check stop anyone widening the union without failing this test.
3. **Inputs:**
   - `requiredInputs` deep-equals `inputs.map(i => i.key)`, and keys are unique;
   - every `anyOf` member is a `confirmed_fact` input of the same workflow;
   - every `evidence` key is one `resolveEvidenceInputs` can produce;
   - every `confirmed_fact` key has an owner entry point: an input field label in the action-detail inputs copy (`lib/copy-workspace.ts`), a brand field, or a custom satisfier.
4. **Triggers:** every `triggerFindingKeys` entry is in `FINDING_KEYS` or is `WEBSITE_FAQ_TRIGGER`. The existing "all 38 keys mapped" test is kept.
5. **Delivery and measurement:**
   - `deliveryUnit === "approved_version"`;
   - `measurement` is `null` or a known `MetricKey`;
   - `TEMPLATE_METRIC` equals the map derived from `TEMPLATES`.
6. **No authority:** the definition's own keys (`Object.keys`) include none of `role`, `minRole`, `scope`, `locationScope`, `tier`, `entitlement`, `permission`, `permissions`, `grants`, `allow`.
7. **Server choice:** a client-supplied agent key that differs from the template's agent is rejected. The existing `runs.ts:112-122` behaviour gets a test in the contract suite that names the rule.
8. **Every agent is in use:** each `AgentKey` other than `validation_plan` is referenced by some template. `validation_plan` is used only by the assistant and is listed as a deliberate exception.

Gate unit tests go in `lib/workspace/workflow-inputs.test.ts`:

- a `preference` never blocks;
- blank strings count as missing;
- the `anyOf` group is satisfied by one member;
- scan-satisfied `evidence` passes;
- the output is ordered by `inputs` order.

`runs.test.ts` and `live.test.ts` each get a case proving that a blocked run or draft makes **zero** `llmComplete` calls and zero budget reads, and that a `preference`-only gap still calls the model.

## 4. Regression corpus — `test/corpus/workflows/`

The corpus is one JSON file per case. It is kept small, fixed and reviewed, and it covers the seven categories the Master Plan names:

| Category | Cases (minimum) | Asserted behaviour |
|---|---|---|
| Malicious review instructions | 3 (instruction to promise a refund, to reveal the system prompt, to append a link) | The prompt fences the text as UNTRUSTED EVIDENCE. A canned output that obeys the instruction is flagged by acceptance (the existing `compensation_promise` and `prohibited_term:*`, plus a new `unexpected_link`: a URL in the body that is not in `providedInputs` or `brand.facts`), and a clean output passes. |
| Missing facts | 3 (ig-bio without `cta_link`, menu without items, FAQ with no facts) | The gate blocks before the model. The fake LLM records 0 calls, `factsNeeded` equals the expected keys, and no version is created. |
| Locale/market mismatch | 2 (zh-TW locale on an hk workspace, en locale on tw) | The prompt names the workspace market (`MARKET_LABEL[ctx.market]`, `lib/agents/guardrails.ts:15`), never the locale-derived one (guardrail 11), and the locale only picks the language instruction. Prompts do not state a currency today; P4.1 adds it with offers. |
| Fabricated business claims | 2 (a canned output asserting a price or an award absent from brand facts) | Acceptance flags `unconfirmed_claim` (new check: a currency amount or superlative not present in `brand.approvedClaims`, `brand.facts` or `providedInputs`). It is a warning, not a block, because the owner reviews before approval. |
| Uncertain evidence | 2 (IG `unavailable`, a review sample below its population) | The evidence block carries the limitation, and the prompt contains no invented metric. |
| Provider failure | 2 (`llmComplete → null` twice; a timeout) | One retry, then run `failed` with the friendly error. No version is created, and any prior draft is untouched. |
| Invalid output | 2 (non-JSON; JSON with neither body nor facts_needed) | `parseAgentOutput` rejects it, and the result is the same as a provider failure. |

The case shape is:

```json
{ "id": "malicious-refund-01", "category": "malicious_review", "workflow": "review-response",
  "context": { "...AgentContext overrides..." }, "provided": { }, "cannedOutputs": ["...model text..."],
  "expect": { "llmCalls": 1, "factsNeeded": [], "warningsInclude": ["compensation_promise"], "promptIncludes": [], "promptExcludes": [] } }
```

`test/corpus/workflows/corpus.test.ts` runs every case through the **real** pipeline:

- `buildPrompt`, `parseAgentOutput`, `acceptance`, `missingConfirmedInputs`;
- `runAgentForAction` with injected persistence and a fake `llmComplete` that returns `cannedOutputs` in order.

It needs no network and no key, and it runs in `corepack pnpm test`. The test file states that canned outputs prove the **pipeline** handles each behaviour. They do not prove any model will behave.

A coverage test fails if a category has fewer cases than the minimum, or if a Live workflow with an agent has no case at all.

## 5. Real-model evaluation — `scripts/eval-workflows.ts` (built, not run)

It is invoked as `corepack pnpm eval:workflows -- --budget-usd <n>`. It refuses and exits 2 unless all of these hold:

- `EVAL_LIVE=1` is set;
- an LLM key resolves through the existing precedence (`OPENCODE_API_KEY → LLM_API_KEY → OPENROUTER_KEY`);
- `--budget-usd` is a positive number.

It runs each corpus case once against the real model, **without** canned outputs. It stops when the accumulated `computeCostUsd` would pass the budget, and it writes `eval-results/<date>-<model>.json`, which is git-ignored. The file records model, base URL host, `AGENT_LLM_OPTIONS`, prompt versions, per-case pass/fail and total cost. It never touches a database.

The script is excluded from `test` and from CI. The phase report records it as **not run**, blocked by DEC-04.

## 6. Error handling

- **Unknown template on an action row** (a legacy or hand-edited `template_key`): the run route already refuses because `findTemplate` returns undefined. The gate adds no new failure mode.
- **Custom satisfier fails with an I/O error** (the asset lookup): the error propagates the same way `socialAssetSatisfied` does today, so the route returns 500 with no run row. It never falls open to calling the model.
- **The gate and the model disagree** (the gate passes, the model still returns `facts_needed`): the existing post-model path is kept unchanged. The gate is a floor, not a replacement.

## 7. Testing and gates

- **New:** `templates.contract.test.ts`, `workflow-inputs.test.ts`, `test/corpus/workflows/corpus.test.ts` and its coverage test, the new cases in `runs.test.ts` and `live.test.ts`, and the new acceptance checks (`unanswered_fact_answered`, `unconfirmed_claim`, `unexpected_link`) in `agents.test.ts`. All three are warnings, not blocks.
- **Prompt snapshots** (`lib/agents/__snapshots__/agents.test.ts.snap`) must not change, because this slice changes no prompt text. A snapshot diff is a regression.
- **E2E:** `e2e/` specs that run a draft with fixture inputs are checked for reliance on the model being called while a `confirmed_fact` is missing. Any such spec is updated to provide the fact, and the change is recorded in the report.
- **Full offline gate inventory on the final candidate:** `typecheck`, `lint`, `test`, `build` (the known Windows Turbopack blocker; `next build --webpack` as the recorded fallback), `test:integration`, `test:secret-boundary`, `db:verify` (no migration expected, run to prove the corpus is unchanged) and `e2e`.

## 8. What this slice does not do

- It adds no migration or schema change and no new agent, and no prompt text changes.
- UI changes are limited to what an existing surface already renders. `blockingInputs` is exposed but not yet displayed; that is P4.3.
- It makes no delivery-counting change (DEC-14) and no live model run (DEC-04).
- Offers (P4.1), packs (P4.2) and contextual assistant suggestions (P4.3) follow in their own specs.
- **Traceability:** `IMPLEMENTATION-TRACEABILITY.md` gains a P4 section with a P4.4 row, and `PHASE-4-REPORT.md` / `PHASE-4-TEST-RESULTS.md` are started with this slice's entries.

## Open questions (recorded, not resolved here)

- **`TEMPLATE_METRIC["gbp-post"] = "gbp.days_since_last_review"`** (`lib/workspace/measurements.ts:35`). A Google Business post does not change review recency, so a measurement row for an exported GBP post may attribute or observe a change the action could not have caused. This slice moves the value into `measurement` unchanged and records it here and in the phase report. Changing it alters measurement semantics and existing `action_measurements` meaning, so it needs its own decision: map it to `null`, or to a posts metric if the scan ever measures one.
- **`review-request.channel` is classified `preference`.** The draft is written for WhatsApp, LINE or a QR card when no channel is given. If the owner wants the channel to be a hard choice, it is a one-row reclassification.
