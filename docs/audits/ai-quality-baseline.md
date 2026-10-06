# T-16 offline AI contract baseline

Baseline: d1cbc7bd8a2bc7989c774d15001f7971274bed8d. Registry read from `lib/agents/index.ts`; synthetic fixture authoring uses that registry and `TEMPLATES`.

These are injected-output guardrail/contract tests. No real model was called, no writing-quality or injection-resistance score is claimed, and no production feature flag was changed. Inputs contain only synthetic business facts and `.example.test` links. No ambient .env/provider key is loaded by the corpus.

| Tool | Registry capability | Workflow | HK / TW slots |
|---|---|---|---|
| review_reply | Live | review-response | 4 / 4 |
| review_request | Live | review-request | 4 / 4 |
| social_post | Live | social-post | 4 / 4 |
| ig_bio | Live | ig-bio | 4 / 4 |
| faq_jsonld | Live | visibility-content | 4 / 4 |
| website_basics | Live | website-basics | 4 / 4 |
| validation_plan | Live | none | N/A / N/A |
| gbp_post | Beta | gbp-post | 4 / 4 |
| photo_brief | Beta | gbp-photo-pack | 4 / 4 |
| local_seo_brief | Beta | local-seo-brief | 4 / 4 |
| menu_translation | Beta | menu-translation | 4 / 4 |
| promotion_copy | Beta | offer-instagram-post | 4 / 4 |

The 96 target slots comprise 88 named JSON fixtures and eight N/A slots for validation_plan (both markets, all four scenarios). It has no production action template and `resolveAgentKey` forbids substituting an unrelated agent. No fake routed success is added. Existing cases also cover offer-google-post.

Each applicable slot is named `audit-{tool}-{hk|tw}-{normal|missing-data|adversarial|recovery}`. Inputs, permitted facts, injected output and exact expected warnings / factsNeeded / version / call count are in the JSON. Normal cases use confirmed owner inputs; missing-data cases gate before calls when the template requires evidence/facts. Preference-only tools accept a schema-valid request for more facts, without an artifact version. Adversarial evidence is fenced and intentionally unsafe injected drafts must raise prohibited-term/unexpected-link warnings; promotion cases additionally contain wrong currency and year/missing end date. Recovery uses malformed schema followed by a valid second response. Provider null, rejected timeout, expired offers, missing sources and multilingual cases are also covered by existing cases and additional provider-recovery tests. An unsafe warning remains subject to human approval of the exact immutable version.

The existing `runCorpusCase` is the sole workflow runner. `generate-audit-fixtures.ts` only writes fixture JSON; it never generates drafts or performs I/O against a provider or database. Registry coverage tests fail when an applicable fixture is missing. `validation_plan` is explicitly unrouted, rather than counted as passed.

## Live evaluation manifest (blocked; DEC-04)

- Dataset: approved synthetic/reference dataset version and checksum required; name which fixtures are evaluation samples and which are pre-model gate controls. A gate control is not a model-quality result.
- Invocation after explicit session authorization only: existing `EVAL_LIVE=1 ... eval:workflows --budget-usd <approved-cap>`. Provider identity, exact model, configured input/output token prices, prompt versions and `AGENT_LLM_OPTIONS` must be recorded. Beta enablement and production actions are unnecessary.
- Parameters: jsonMode true, temperature 0.4, maxTokens 1200; each attempt stays inside the existing shared generation budget. Retain raw failures in the private evaluation output; never include keys or real customer data.
- Stop: before a call exceeding the approved cap; stop on unknown pricing, auth/provider identity mismatch, unexpected external effect, or repeated unavailable provider. No implicit budget increase.
- Record per tool and market: sample count, schema failure count, ungrounded claims, amount AND currency accuracy, both dates AND years accuracy, facts-needed correctness, recovery outcome, tokens, actual cost, and latency samples. Report p50/p95 only with sample counts and an explicit method; small samples do not establish stable p95.
- Human rubric: reviewer compares each statement to supplied evidence; checks localization without inferring currency, dates and offer status, missing-source honesty, no compensation/unsupported superlatives, no authorization instruction taken from source text, and actionable output. Product owner must approve quality thresholds/reference labels before a release decision.

Missing: explicit budget, model/provider authorization, approved dataset/reference labels, quality thresholds and human reviewer. Offline green does not clear these blockers. No live result, hosted acceptance, CI pass or production enablement is claimed.
