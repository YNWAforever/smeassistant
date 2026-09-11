# Claude Code — Phase 1: Safe Owner Activation

Paste this instruction for a scoped phase or later implementation session.

---

Read the current repository instructions and `docs/implementation/owner-platform-v1/MASTER-IMPLEMENTATION-PLAN.md`, the five original files in `sources/`, the traceability register and preceding phase reports. Re-baseline current HEAD against the historical `8f4c5b4` audit; preserve newer fixes and unrelated work. Do not replace working services just to follow old line numbers.

Use multiple reviewable changes to complete this whole phase. Implement regression tests with behavior. Preserve scanner/evidence/scoring, Neon/Auth, tenant/location boundaries, immutable versions and SQL approval/export accounting. The assistant cannot approve, publish, claim or change billing. No retired Supabase console, second scheduler, separate approval ledger, unsupported capability promise or destructive migration.

Production deployments/configuration/writes, hosted migrations, paid APIs, real mail/OAuth/Stripe and publishing require explicit authorization. Use fixtures and disabled features when access is unavailable. Do not merge to an auto-deploying branch as a test. Never print secrets or point test suites at production because the owned fixture is blocked.


Implement **all of Master Plan §4 (P1.1–P1.7)**. The outcome is an eligible legitimate owner completing scan → report/unlock → real sign-in → proven ownership → saved review reply → exact approval → first counted export.

## Required implementation

- Reconcile current deployment/architecture/runtime truth and gate inventory, without changing production exposure. Keep historical acceptance distinct from deployment existence.
- Close website SSRF through shared safe fetch, fail closed on provider spending, enforce concurrent-safe last-owner protection at the data boundary, verify database TLS and forbid email-only self-service claim mode.
- Repair coverage formatting, actual collector states, consent persistence and honest partial scans. Keep insufficient-score results null. Bound stalled polling and provide safe idempotent resume; do not promise unverified background completion.
- Add claim entries, preserve context including underscore/hyphen slugs, separate identity from managed-place proof, fix the actual Google sign-in failure and show recoverable outcomes. Repair WhatsApp/LINE unlock eligibility without treating email/recovery/grant as ownership.
- Persist brand voice/claims and derive onboarding resume from authorized server state. Keep market independent of locale.
- Reuse sampled reviews and let the owner select instead of retyping. Constrain agent/template mapping, bound prompts and deadlines, recover stuck runs, and show success only after the saved result exists on the action page, Create page and assistant sheet.
- Preserve SQL exact-version approval/export, edit-to-draft behavior, allowance checks and exactly-once usage. Remove unsupported commercial/delivery/Fix Pack promises pending real implementation and decisions.

## Minimum negative-path tests

Unsafe URLs/redirects, concurrent last-owner removal, missing rate-limit configuration, invalid/expired auth state, wrong business manager, no membership, WhatsApp/LINE contact with recovery identity, claim `_`/`-`, cross-workspace access, missing facts, LLM failure, failed save, stale run, arbitrary agent, edited-draft export, duplicate/concurrent export and exhausted allowance. Cover mobile sign-in and the full first task.

## Hosted acceptance gate

Subject to explicit authorization: R2 configuration inventory; HK and TW usable live scans; real magic-link delivery/redemption/expiry/replay/logout; completed Google sign-in; positive and visible negative claim; HK and TW review-draft approval/export and repeated export counted once; candidate launch check. No-GBP self-service and paid readiness are not Phase 1 claims.

Do not stop at the missing href or add more agents. A configured button and an auth redirect are not a completed owner journey.

## Finish with evidence, not only code

Run focused tests, then the current complete applicable offline gate inventory on the final candidate. Reconcile the source documents' gate-count discrepancy against current scripts/CI rather than inventing results. Execute only explicitly authorized hosted tests. Preserve existing safety gates and all preceding phase regressions.

Write `PHASE-1-REPORT.md` and `PHASE-1-TEST-RESULTS.md` under the repository's implementation documentation. Update traceability and current release documentation. Include baseline/commit, code/migration changes, exact commands/exits/counts/skips, safe artifact references, scope completed, blockers, disabled capabilities, rollout and data-preserving rollback.

Use **passed / failed / blocked / not run** accurately. Separate implemented, locally verified and hosted verified. Finish all safe local work in this phase even when a hosted dependency is blocked; never bypass ownership, billing or provider permission to manufacture completion. Do not call the release ready until its applicable acceptance gate is genuinely satisfied.
