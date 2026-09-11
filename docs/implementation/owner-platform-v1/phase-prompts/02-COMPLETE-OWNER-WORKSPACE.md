# Claude Code — Phase 2: Complete Owner Workspace

Paste this instruction for a scoped phase or later implementation session.

---

Read the current repository instructions and `docs/implementation/owner-platform-v1/MASTER-IMPLEMENTATION-PLAN.md`, the five original files in `sources/`, the traceability register and preceding phase reports. Re-baseline current HEAD against the historical `8f4c5b4` audit; preserve newer fixes and unrelated work. Do not replace working services just to follow old line numbers.

Use multiple reviewable changes to complete this whole phase. Implement regression tests with behavior. Preserve scanner/evidence/scoring, Neon/Auth, tenant/location boundaries, immutable versions and SQL approval/export accounting. The assistant cannot approve, publish, claim or change billing. No retired Supabase console, second scheduler, separate approval ledger, unsupported capability promise or destructive migration.

Production deployments/configuration/writes, hosted migrations, paid APIs, real mail/OAuth/Stripe and publishing require explicit authorization. Use fixtures and disabled features when access is unavailable. Do not merge to an auto-deploying branch as a test. Never print secrets or point test suites at production because the owned fixture is blocked.


Implement **all of Master Plan §5 (P2.1–P2.5)**, preserving Phase 1. The outcome is a simple daily workspace with three complete tasks and an operated assisted route for no-GBP/manual-entry businesses.

## Required implementation

- Reuse existing routes and simplify labels/navigation around Today / Tasks / Create / Results / More. One primary next action; evidence/limitations remain accessible and critical states visible. Keep mobile owner sign-in visible.
- Make review replies, FAQ/JSON-LD and website basics work through selected evidence, minimal confirmed inputs, actual saved versions, edit, exact approval and export. Google profile fix stays a checklist; photo brief stays a written brief. Do not quietly substitute either for an AI workflow.
- Persist and reuse authorized brand/business/location context and owner-confirmed facts. Do not repeatedly ask what is already known. Correct source-time/limitation presentation without inventing observation timestamps.
- Build assisted requests, owner status, a protected current-Neon operator queue, verification decision, atomic conflict-aware assignment/refusal and actual notifications. A request form alone is incomplete. Never enable the retired staff console or make every signed-in user an operator.
- Implement actual scoped invitations/application mail where authorized, notification mark-as-read and missing host audit events. Auth mail and transactional application mail remain separate. Report recovery must stay single-job and cannot create ownership. No assumed WhatsApp/LINE sender.

## Acceptance gate

All three workflows complete with real truthful state transitions, negative role/location/provider/missing-input cases and unchanged delivery usage rules. A named authorized no-GBP/manual case is independently reviewed and assigned; rejected and unauthorized-operator cases remain denied. Verify authorized invitation acceptance and any claimed mail/recovery path rather than just inserted rows.

Run the complete owner journey on mobile and desktop, including home, task list, Create, action details, insights, settings/More, loading, empty and failure states. Preserve Phase 1 security and identity evidence. Do not measure this release by screen count.

## Finish with evidence, not only code

Run focused tests, then the current complete applicable offline gate inventory on the final candidate. Reconcile the source documents' gate-count discrepancy against current scripts/CI rather than inventing results. Execute only explicitly authorized hosted tests. Preserve existing safety gates and all preceding phase regressions.

Write `PHASE-2-REPORT.md` and `PHASE-2-TEST-RESULTS.md` under the repository's implementation documentation. Update traceability and current release documentation. Include baseline/commit, code/migration changes, exact commands/exits/counts/skips, safe artifact references, scope completed, blockers, disabled capabilities, rollout and data-preserving rollback.

Use **passed / failed / blocked / not run** accurately. Separate implemented, locally verified and hosted verified. Finish all safe local work in this phase even when a hosted dependency is blocked; never bypass ownership, billing or provider permission to manufacture completion. Do not call the release ready until its applicable acceptance gate is genuinely satisfied.
