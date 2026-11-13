# Phase 12 — recorded finding evidence guardrail

The 2026-11-13 signed-in Eldage walkthrough found that Today displayed a saved review-volume explanation as Observed, including unverified claims about customer behaviour, ranking and click-through effects.

## Cause

Action derivation copied `audit_findings.owner_message_en/zh/tw` into the action's `evidence.detail` and assigned Observed. That explanatory prose may combine facts, advice and possible business effects. The shared action read model then trusted it on Today, Tasks, task detail and downstream action context.

An owner-objective task can also acquire scan evidence through the existing derivation upsert while retaining its original source. Protecting only rows with `source=finding` misses those legacy tasks.

## Change

- Newly derived finding tasks describe only the recorded rules, using the scoring catalog's exact finding keys and controlled translated labels. The local website FAQ check is explicitly supported. Raw owner-message prose is not copied into observed action detail.
- The shared action read model rebuilds that description for existing finding tasks and any task with attached finding keys, including refreshed owner objectives. It does not update persisted rows.
- Missing and unknown keys produce Unknown with an unavailable description; message-key aliases, malformed prefixes and raw keys are not accepted as observations.
- Values, sources, observation timestamps, freshness, recurrence references, priority and task/version state are preserved. Genuine objectives and integration-health tasks with no finding keys retain their existing evidence.
- Today's Why disclosure separately labels customer/ranking/click effects as Unknown. It no longer unconditionally prints an Observed timestamp prefix beside other fact types.

No migration, scorer, prompt, permission, approval, export or provider setting changes are part of this fix. The original scan finding records remain untouched. This is an action-evidence presentation guardrail; other report surfaces that independently display original scan explanations are outside this change.

## Regression coverage

- The hosted causal review-volume wording is replaced on read without mutating the stored input or changing its value/source/time.
- New derivation ignores explanatory owner prose in all three languages.
- Legacy owner objectives carrying finding evidence receive the same protection; genuine objectives without findings remain unchanged.
- Missing, unknown and malformed finding keys fail closed; duplicate labels and the local FAQ rule are handled.
- Today's limitation is labelled Unknown in English, Cantonese and Taiwanese copy.

## Release evidence

- Final local full unit suite: 567 test files / 6,904 tests passed.
- Independent read-only review identified exact-key aliasing and refreshed owner-objective compatibility gaps; both were addressed with regression tests.

- Final typecheck and lint on changed source/tests passed.
- Final production build and all route JavaScript budgets passed (Today 231/300 KB; task detail 272/300 KB).
- Focused owned-database merchant acceptance: 4/4 passed (46.2s), covering the saved-draft approval journey and Today at 375px in all three locales. The legacy causal prose is seeded with an exact finding key and must be replaced; the empty base fixture must show Unknown/unavailable instead of Observed.
- The first PR CI run was cancelled after stale acceptance expectations were identified. Those expectations were corrected and locally verified before restarting CI; no gate was bypassed.

- Shipped through [PR #174](https://github.com/YNWAforever/smeassistant/pull/174), merge commit `9d6fc02c6b9b73944d8c0955225701ce0e02578a`. The merge tree is identical to the tested PR head `19cc8ca14572db31facd072dd3381e277ca83a40`.
- [PR CI 43396744313](https://github.com/YNWAforever/smeassistant/actions/runs/43396744313) passed, including 124 merchant acceptance tests and 8 configured Studio skips.
- [Main CI 43401378994](https://github.com/YNWAforever/smeassistant/actions/runs/43401378994) passed. Merchant acceptance reported 123 clean passes, 1 pass on retry and 8 configured skips. The lost-generation-response test retried after the shared hydration helper read `dataset` from a transiently null document element; the retry passed. No CI gate was bypassed.
- Production deployment `dpl_5Nu5oNzzBJFnvPoVvdKDMShuhCZ3` was verified Ready with the production alias `https://smeassistant.vercel.app`, created 2026-11-13 17:26:45 SGT.
- Signed-in owner verification at 17:28 SGT covered Today, the matching Tasks card and task-detail source context in en/zh-HK/zh-TW at 1440px and 390px: 18 page visits, all HTTP 200, with no JavaScript page errors or horizontal overflow. The existing Eldage task showed “The scan flagged: Review Freshness; Review Count.” and a separate Unknown limitation; the old causal wording was absent from all three evidence surfaces.
- Hosted verification was read-only with application mutations blocked. No production generation, edit, approval, export, scan or import was performed. Browser checks used desktop Chrome; mobile coverage is viewport emulation.
- Fresh captures and machine-readable results are retained locally outside Playwright's disposable output directory and are excluded from Git. The earlier temporary walkthrough screenshots were cleared by a local acceptance run; the committed walkthrough report remains the historical record.
