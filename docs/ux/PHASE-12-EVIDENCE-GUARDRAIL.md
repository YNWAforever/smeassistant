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

PR/CI and hosted recheck results are recorded here as they complete.
