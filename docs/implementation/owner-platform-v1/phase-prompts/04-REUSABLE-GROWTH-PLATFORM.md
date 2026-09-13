# Claude Code — Phase 4: Reusable Growth Platform

Paste this instruction for a scoped phase or later implementation session.

---

Read the current repository instructions and `docs/implementation/owner-platform-v1/MASTER-IMPLEMENTATION-PLAN.md`, the five original files in `sources/`, the traceability register and preceding phase reports. Re-baseline current HEAD against the historical `8f4c5b4` audit; preserve newer fixes and unrelated work. Do not replace working services just to follow old line numbers.

Use multiple reviewable changes to complete this whole phase. Implement regression tests with behavior. Preserve scanner/evidence/scoring, Neon/Auth, tenant/location boundaries, immutable versions and SQL approval/export accounting. The assistant cannot approve, publish, claim or change billing. No retired Supabase console, second scheduler, separate approval ledger, unsupported capability promise or destructive migration.

Production deployments/configuration/writes, hosted migrations, paid APIs, real mail/OAuth/Stripe and publishing require explicit authorization. Use fixtures and disabled features when access is unavailable. Do not merge to an auto-deploying branch as a test. Never print secrets or point test suites at production because the owned fixture is blocked.


Implement **the core of Master Plan §7 (P4.1–P4.4)**, with **P4.5–P4.6 conditional and disabled unless separately authorized**. The outcome is reusable business context and coherent work, not an unbounded agent platform.

## Core implementation

- Add owner-confirmed scoped offers where no current model exists: facts, valid period, terms, currency, confirmation and optional rights-cleared assets. No invented prices, ingredients, allergens or claims.
- Reuse existing suitable generation capabilities for promotion **copy**, preserving actions/runs/immutable versions and exact approval/export. Do not imply image generation or channel sending. Make multi-output delivery units explicit under existing accounting.
- Implement idempotent work packs grouping ordinary actions/versions. Adapt or retire the disconnected Fix Pack surface explicitly while preserving history. No parallel output/approval/billing ledger or approval of unseen mutable content.
- Derive assistant questions/suggestions from authorized current tasks, evidence and missing inputs. Keep read-only authority; host routes execute explicit authorized owner actions. No arbitrary SQL/tools or assistant-driven approval/export/publishing/claim/billing.
- Add a typed reusable workflow contract and regression corpus. Capability metadata never grants authority. Distinguish deterministic fixtures from actual model evaluations.

## Conditional sub-releases

A provisional preview requires a purpose-limited completed-scan grant, owner-supplied text only, one unsaved labelled preview, no protected evidence/workflow records/approval/export, and atomic fail-closed generation budgets.

A publishing connector requires a separate explicit decision naming one provider/operation/account/test destination, budget and permission. It must bind explicit owner confirmation to the exact approved immutable version, verify account/location scopes, store tokens safely, deduplicate dispatch, reconcile uncertain outcomes and record actual provider receipts. Export is not publishing, and accounting cannot change without its own approved contract.

## Acceptance gate

One confirmed offer generates grounded channel-copy versions; packs are idempotent, per-item failures recover, approvals remain exact and exports count correctly. The assistant stays inside authorization boundaries. Existing three workflows and recurring/billing behavior still pass.

The core may ship without preview/publishing. A disabled adapter, mock receipt or marketing label must never be called a delivered connector. Do not introduce an image generator, omnichannel sender or agent marketplace as incidental work.

## Finish with evidence, not only code

Run focused tests, then the current complete applicable offline gate inventory on the final candidate. Reconcile the source documents' gate-count discrepancy against current scripts/CI rather than inventing results. Execute only explicitly authorized hosted tests. Preserve existing safety gates and all preceding phase regressions.

Write `PHASE-4-REPORT.md` and `PHASE-4-TEST-RESULTS.md` under the repository's implementation documentation. Update traceability and current release documentation. Include baseline/commit, code/migration changes, exact commands/exits/counts/skips, safe artifact references, scope completed, blockers, disabled capabilities, rollout and data-preserving rollback.

Use **passed / failed / blocked / not run** accurately. Separate implemented, locally verified and hosted verified. Finish all safe local work in this phase even when a hosted dependency is blocked; never bypass ownership, billing or provider permission to manufacture completion. Do not call the release ready until its applicable acceptance gate is genuinely satisfied.
