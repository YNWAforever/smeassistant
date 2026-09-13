# Claude Code — Phase 3: Recurring and Commercial Service

Paste this instruction for a scoped phase or later implementation session.

---

Read the current repository instructions and `docs/implementation/owner-platform-v1/MASTER-IMPLEMENTATION-PLAN.md`, the five original files in `sources/`, the traceability register and preceding phase reports. Re-baseline current HEAD against the historical `8f4c5b4` audit; preserve newer fixes and unrelated work. Do not replace working services just to follow old line numbers.

Use multiple reviewable changes to complete this whole phase. Implement regression tests with behavior. Preserve scanner/evidence/scoring, Neon/Auth, tenant/location boundaries, immutable versions and SQL approval/export accounting. The assistant cannot approve, publish, claim or change billing. No retired Supabase console, second scheduler, separate approval ledger, unsupported capability promise or destructive migration.

Production deployments/configuration/writes, hosted migrations, paid APIs, real mail/OAuth/Stripe and publishing require explicit authorization. Use fixtures and disabled features when access is unavailable. Do not merge to an auto-deploying branch as a test. Never print secrets or point test suites at production because the owned fixture is blocked.


Implement **all of Master Plan §6 (P3.1–P3.5)**. The outcome is repeated useful work, honest re-scan comparison and a tested commercial contract, not just a calendar or pricing page.

## Required implementation

- Discover any existing executor first; implement one bounded durable job lifecycle and one scheduler using current Neon/Vercel boundaries. Include atomic lease, checkpoint, retry caps, deadline/finalization, stale-worker fencing, reaping and protected scheduling. Revisit architecture tests explicitly; no second scheduler or detached untracked work.
- Make comparisons reachable through server-side membership and authorization of both snapshots. Preserve coverage/scoring-version/decay gates. Keep exported, user-marked-applied, verified-applied and observed change distinct; no causal/revenue claim from timing alone.
- Resolve the approved commercial matrix before exposing paid behavior. Keep public copy, server policy and SQL allowance/seat enforcement consistent. Fix active-period allowance on tier change even when copy follows code. Test exhausted-lite upgrade, simultaneous exports, rollover/downgrade and invitation races where seat policy applies.
- Complete only authorized Stripe test-mode checkout/portal/webhook transitions, signature checks, duplicate/out-of-order events and controlled unconfigured behavior. No live charges or invented plan decision.
- Repair analytics reliability and explicit denominators. Primary metric is distinct businesses with a qualifying approved export in the reporting week, not generated drafts or repeat exports. Exclude demo/fixture events explicitly; separate location/business and workspace/account counts.
- Add provider/compute budgets distinct from delivery allowance, operator integration health, bounded retries, communication reliability and recovery/runbook controls.

## Acceptance gate

Demonstrate actual authorized scheduled/resumed work and a real successful comparable pair in a browser. Verify original export, separately identified application evidence and later observations without conflating them. Execute authorized Stripe transitions and upgrade-after-exhaustion. Record actual provider/usage/budget evidence and correct denied/no-pair states.

No paid launch until the approved contract, SQL enforcement and actual test billing agree. No automatic recheck promise until the configured executor really runs. No numerical growth targets before a measured baseline.

## Finish with evidence, not only code

Run focused tests, then the current complete applicable offline gate inventory on the final candidate. Reconcile the source documents' gate-count discrepancy against current scripts/CI rather than inventing results. Execute only explicitly authorized hosted tests. Preserve existing safety gates and all preceding phase regressions.

Write `PHASE-3-REPORT.md` and `PHASE-3-TEST-RESULTS.md` under the repository's implementation documentation. Update traceability and current release documentation. Include baseline/commit, code/migration changes, exact commands/exits/counts/skips, safe artifact references, scope completed, blockers, disabled capabilities, rollout and data-preserving rollback.

Use **passed / failed / blocked / not run** accurately. Separate implemented, locally verified and hosted verified. Finish all safe local work in this phase even when a hosted dependency is blocked; never bypass ownership, billing or provider permission to manufacture completion. Do not call the release ready until its applicable acceptance gate is genuinely satisfied.
