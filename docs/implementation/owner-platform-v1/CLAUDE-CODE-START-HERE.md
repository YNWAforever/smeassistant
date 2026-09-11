# Claude Code — Master Implementation Instruction

Copy the kit contents into `docs/implementation/owner-platform-v1/` in the existing repository, then paste the following instruction. The complete technical detail is in the master plan; this prompt makes execution outcome-based rather than audit-only.

---

Work in the existing `YNWAforever/smeassistant` repository. This is an **implementation assignment**, not a request for another audit, a replacement application, or a homepage-only redesign.

Read, in order:

1. The current repository's `CLAUDE.md`, architecture, deployment, migration and vendoring instructions.
2. `docs/implementation/owner-platform-v1/MASTER-IMPLEMENTATION-PLAN.md`.
3. All five documents under `docs/implementation/owner-platform-v1/sources/`.
4. `IMPLEMENTATION-TRACEABILITY.md`, `BUSINESS-AND-HOSTED-DECISIONS.md` and `RELEASE-EVIDENCE-TEMPLATE.md` in the same kit directory.
5. The matching prompt under `phase-prompts/` when starting each phase.

The supplied audit was baselined to `8f4c5b4`, not necessarily today's HEAD. Establish the current branch/commit, understand uncommitted changes, compare the relevant code, and preserve newer fixes and unrelated work. If a finding is already fixed, prove that with the current implementation/tests and record it; do not revert the fix to match an old line reference.

## Build four larger outcome-based phases

**Phase 1 — Safe owner activation.** Repair deployment truth, SSRF, fail-open spending, last-owner deletion, scan coverage/consent/partial results and bounded recovery. Fix the actual Google sign-in failure, not only its diagnostics. Connect scan/report/unlock to verified ownership, handle WhatsApp/LINE unlock eligibility without weakening ownership proof, persist/resume onboarding context, and complete the review-reply workflow through saved version → exact approval → first counted export. Make all failure/success states truthful and sign-in visible on mobile.

**Phase 2 — Complete owner workspace.** Simplify existing pages around today's next action and complete review replies, FAQ/JSON-LD and website basics. Reuse stored business facts and collected evidence. Implement a real assisted ownership request/review/assignment path with protected operator access and visible status, plus actual invitations/notifications and audited actions. Do not deliver just a form that nobody can operate.

**Phase 3 — Recurring and commercial service.** Implement a bounded durable lifecycle with one scheduler, reachable authorized re-scan comparison, approved pricing/allowance/seat rules, mid-period entitlement repair, tested billing and reliable analytics/operating controls. Separate exported, owner-marked-applied, verified application and observed change. No recurring or paid-readiness claim without its hosted evidence.

**Phase 4 — Reusable growth platform.** Add confirmed offers, promotion-copy workflows, work packs using existing version/approval records, contextual assistant suggestions and a reusable typed workflow contract. A safe unsaved preview and a single publishing connector are conditional sub-releases—not default permissions or assumed functionality.

Start with Phase 1 and finish its complete local vertical slice, tests and evidence report. Continue through the phases in dependency order. A hosted blocker does not prevent safe independent local work or later disabled code, but it does prevent calling that release hosted-verified or enabling dependent features. Keep the phase boundaries and reports explicit instead of producing one giant unreviewable change.

## Non-negotiable implementation rules

- Preserve scanner routes/modules, evidence provenance, coverage-aware scoring, comparability, workspace/location permissions, Neon PostgreSQL/Auth and the existing package manager.
- Preserve SQL authority over immutable-version approval, export idempotency and approved-delivery counting. Generation/revision/failure/rescan never consumes delivery allowance.
- Preserve the repaired claim parser and current sign-in flow improvements. Authentication, report access and ownership are separate proofs. Never enable `OWNER_SELF_SERVICE_CLAIM` or turn an email match into ownership.
- Pocket Assistant stays context-aware and read-only in authority. Only explicit owner actions through authorized host routes may mutate state; the assistant cannot approve, export, publish, claim or change billing independently.
- No unsupported image generation, WhatsApp/LINE sending, publishing, background completion or automatic re-scan promises. An agent label/button is not implementation evidence.
- Do not rewrite the repository, revive the retired Supabase console, replace authentication, add a second scheduler, rename internal products/routes/packages, or create a second output/approval ledger.
- Append migrations at the next available number. Preserve existing migrations and audit/billing/output history. Use concurrency-safe database invariants, not UI-only guards.
- Keep new unfinished features disabled. Commercial decisions remain explicit. Pending approval, remove inaccurate paid promises and leave checkout unavailable rather than guessing new prices, quotas or seat rules.
- Treat production deployment, environment changes, migrations, paid APIs, real emails, OAuth consent, Stripe events and publishing as separately authorized actions. Do not print secrets, send unsolicited messages, change production protection, or merge to an auto-deploying branch to test.

## Execution and verification

Implement behavior and regression tests together in coherent commits. Run focused tests during development, then discover and run the repository's complete applicable offline gate inventory on the final candidate. Reconcile the sources' “ten gates” wording against the real scripts/CI; do not invent a passing gate. Never substitute a random/production database when the owned fixture is blocked.

Test happy paths and negative paths: unsafe URL rejection, concurrent last-owner removals, unauthorized cross-workspace/location reads, missing facts, provider failure, incompatible agent, stale runs, failed saves, edited-draft export refusal, repeated/concurrent export and allowance exhaustion. Expand mobile browser coverage through the complete owner journey.

Hosted acceptance must use approved targets, test identities/businesses and explicit budgets. Record actual commands, commit, deployment ID, environment, results and safe evidence references. A fixture identity, mocked LLM, local HTTP success or screenshot of a button is not hosted completion.

For each phase, produce:

- `PHASE-N-REPORT.md` with scope completed, source IDs, code/data changes, current baseline, decisions and unresolved blockers.
- `PHASE-N-TEST-RESULTS.md` with exact commands, exits, counts/skips and artifacts.
- Updated traceability and actual repository release documentation.
- Rollout/default-off flags and a data-preserving rollback plan.

Use statuses **passed / failed / blocked / not run** accurately, and distinguish implemented, locally verified and hosted verified. Do not stop after an audit summary, a TODO list, one button or the first small repair. Complete the selected phase's entire achievable owner journey and report exactly what remains gated.

---

## For a later session

Paste the applicable file from `phase-prompts/` and retain the master plan plus all preceding phase reports. These scoped prompts carry the same safety and verification requirements.
