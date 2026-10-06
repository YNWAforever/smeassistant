# SMEAssistant 稽核整改進度

Plan: `docs/superpowers/plans/2026-10-07-smeassistant-audit-remediation.md`

Baseline: `d1cbc7bd8a2bc7989c774d15001f7971274bed8d` (local and remote main verified 2026-10-07 Asia/Hong_Kong).
Branch: `codex/smeassistant-audit-remediation-20261007`.
Worktree: `C:/Users/laich/Documents/smescanner/.worktrees/smeassistant-audit-remediation`.

## 基準及執行界線

- Handoff MANIFEST: 6/6 SHA256 matches. Original evidence MANIFEST: 28/28 matches. Original ZIPs and input documents remain unchanged; extracted copies are read-only inputs.
- Original `smescanner` checkout is a different repository and has user edits; it is not a code source. Correct `smeassistant` main was clean before isolation; remote main matches audit SHA.
- Node 24.18.0 / pnpm 9.12.0. Lockfile SHA256: C7C722C958A874DEEE76AB2B4FAAF654D985547A9D29EB256D8F6C9B848F63C6.
- Initial install: `corepack pnpm install --frozen-lockfile --ignore-scripts` exited 1, ERR_PNPM_ENOSPC (C: had 0 bytes free). Only this session's failed worktree node_modules was removed; reclaimed 1.75 GB.
- Ruling: reuse correct main's existing node_modules via a junction, after verifying identical lockfile hashes. This avoids duplicating dependencies; installation is not reported as passed. No .env files, provider keys or login cookies copied.
- Ruling: native worktree tool targets the chat's unrelated repo; use `git worktree add` from the correct repository instead. Local branch/commits are authorized; no push, PR, deployment, hosted mutation or paid/provider operation authorized.
- Ruling: retain T/F/UC IDs in this committed ledger rather than transform the supplied plan into skill-specific Task N briefs. Sequential execution and RED → GREEN evidence remain required.
- Existing flags and DEC-10 remain unchanged. T-01/T-04 retain historical baseline completion, not new fix/CI claims.

## 預檢相依介面

| Producer → consumer | Shared interface / decision |
|---|---|
| T-03 → T-18/T-15 | Shared report parser; claim is context, never membership. no_access remains a server result. |
| T-08 → T-07/T-14 | Valid requested source differs from collector measured outcome; preserve unknown outcomes. |
| T-06 → T-16 | Currency and both validity boundaries are deterministic acceptance warnings. |
| T-09 → T-10 → T-12 → T-13 | Sequential changes to queries-pages/workspace-read; preserve count scope, local month, canonical phase, authorization and bounded projection. |
| T-11 → T-02/T-21 | One cancellable budget; cron stays off; recovery evidence separate from scheduler activation. |
| T-19 → T-15/T-20 | 0014 first_published_at required even with publishing off; disposable verification differs from production journal. |

## 任務狀態

See `2026-10-07-remediation-tracker.csv` for all 21 tasks, with audit_status / implementation_status / hosted_status kept separate. New local evidence is stored in `remediation-evidence/`; raw test logs in the plan's `.superpowers/sdd/` scratch directory.

## 檢查紀錄

Batch 0: in progress. A1 starts with T-03 → T-18, then continues to A2, B, C1, C2, D and E. No product fix, new CI pass, hosted acceptance or production deployment is claimed at setup.

### A1 / T-03 / F-02 / UC-12

- RED: actual onboarding dropped `3cuOKFmHdiYf00BOs27E_NO1`; accepted 5/65-character claims. 3 failed / 8 passed, exit 1. Separate imported parser-boundary regression exposed whitespace trimming (2 failed / 5 passed, exit 1).
- Fix: one strict 6–64 ASCII report parser across sign-in, onboarding, Google claim start/callback, magic link and claim body. Duplicate/array claim context fails closed; report context never grants membership. Repository ports in page tests are offline stubs.
- GREEN: `node node_modules/vitest/vitest.mjs run lib/report-access/slug.test.ts lib/report-access/slug-boundaries.test.ts lib/identity/sign-in-flow.test.ts app/[locale]/owner/onboarding/page.test.tsx app/api/oauth/google/claim/start/route.test.ts app/api/oauth/google/claim/callback/route.test.ts app/api/owner/magic-link/route.test.ts app/api/workspaces/claim/route.test.ts --maxWorkers=1`: exit 0, 8 files / 106 tests. Root `tsc --noEmit`: exit 0. Source lint is recorded separately.
- Evidence: `remediation-evidence/T03-red.txt`, `T03-boundaries-red.txt`, `T03-green.txt`, `A1-typecheck.txt`. Rollback: revert this task's local commit; stored report slugs remain unchanged.
- Hosted: not run; dedicated identities/workspace and explicit hosted authorization missing. New CI is not claimed.

### A1 / T-18 / F-14 / UC-08, UC-22

- RED: the actual completion card lacked the own-status link in all three locales (4 failed / 10 passed, exit 1).
- Fix: add localized explicit navigation to `/{locale}/owner/select-workspace`; retain scan and change-account paths. No redirect loop, completion replay or membership mutation. Page boundaries use verified session user id even with another id/email in the query.
- GREEN: `vitest run app/[locale]/owner/onboarding/page.test.tsx app/[locale]/owner/select-workspace/page.test.tsx components/auth/sign-in-completion.test.tsx lib/workspace/my-access-request.test.ts --maxWorkers=1`: exit 0, 35 tests. Scoped eslint: exit 0. `vitest run --config vitest.integration.config.ts test/integration/neon-assisted-assignment.integration.test.ts test/integration/neon-owner-sign-in-completion.integration.test.ts`: exit 0, 7 real PostgreSQL tests, only harness-owned loopback targets.
- Browser: `playwright test --config playwright.acceptance.config.ts e2e/acceptance/guided-sign-in.spec.ts --grep 'an accepted fixture account'`: exit 1, owned fixture setup exceeded 240 seconds before Next/page startup; not a witnessed product assertion failure. The stalled owned `pg_isready` child was ended; its label-verified fixture container was removed. Keep this environment limitation visible and retry during final acceptance.
- Evidence: `remediation-evidence/T18-red.txt`, `A1-green.txt`, `A1-integration.txt`, `A1-browser.txt`, `T18-lint.txt`. Rollback: revert T-18 local commit; no data/migration change. Hosted not run.
- Copied plan Markdown hard-break whitespace and raw test output are preserved; source diff whitespace checks exclude those evidence documents.

### A2 / T-08, T-07, T-14 / F-06, F-05, F-11 / UC-03, UC-04, UC-05, UC-10

- T-08 RED: 9 failed / 3 passed (exit 1), malformed/credential URLs accepted by real client/server functions. Fix: shared optional HTTP(S) parser, 2048 bound, no credentials, path/query preserved, candidate fallback validated, explicit invalid input never replaced. Wizard stays on step 3, focuses the field, associates localized errors, and excludes invalid websites from source count. Route refusal occurs before limiter/quota/job insertion.
- T-07 RED: 7 failed (exit 1). Stage progression and legacy terminal state no longer imply any measured collector; explicit measured outcome alone produces done. Awaiting-result, not-provided (explicit DTO only), unavailable/unsupported, failed and stalled are distinct and localized.
- T-14 RED: 6 failed / 33 passed (exit 1). Owner presentation maps known limitation codes, hides unmeasured raw provider notes, adds relevant next steps, and uses localized generic unknown-code text. Raw codes remain in source evidence; zero values remain measured when evidenced.
- Final targeted command: `node node_modules/vitest/vitest.mjs run lib/scan/website-url.test.ts lib/scan/website-boundaries.test.ts lib/scan/start-job.test.ts app/api/scan/start/route.test.ts components/scan-page.test.tsx components/scan-page.website.test.tsx lib/funnel/collector-outcomes.test.ts lib/funnel/scan-progress.test.ts components/scanning-page.test.tsx lib/funnel/report-labels.test.ts components/report/dashboard.test.tsx components/report/evidence-gallery.test.tsx tests/funnel-scan.test.ts lib/report/view-model.test.ts --maxWorkers=1`: exit 0, 14 files / 245 tests. Root `tsc --noEmit`: exit 0. Scoped eslint: exit 0.
- Evidence: `remediation-evidence/T08-red.txt`, `T07-red.txt`, `T14-red.txt`, `A2-final-green.txt`, `A2-lint.txt`, `A2-typecheck.txt`. Scan disposable integration is separately in progress; no hosted journey/production claim. Rollback: revert A2 local commit; no stored data or migrations changed.

### B / T-06 / F-04 / UC-14

- RED: 12 currency/date boundary failures; 3 actual warning classification/localization failures (exit 1).
- Fix: compare amount AND explicit currency; ambiguous bare $/元 warns. Require both validity boundaries and correct explicit years; enforce calendar validity, cross-year disambiguation, full ISO/slash/CJK/English dates. Locale never determines currency.
- UI: offer_price_mismatch / offer_dates_missing / offer_prohibited_term are classified warnings with actionable three-language copy. Warnings do not bypass exact-version human approval.
- GREEN: `vitest run lib/agents/offer-boundaries.test.ts lib/agents/offer-checks.test.ts lib/agents/agents.test.ts test/corpus/workflows/corpus.test.ts lib/workspace/offer-warning-copy.test.ts lib/workspace/version-meta.test.ts components/workspace/action-detail-client.test.tsx --maxWorkers=1`: 7 files / 251 tests, exit 0. Root typecheck and scoped eslint: exit 0.
- Evidence: T06-red.txt, T06-warning-red.txt, T06-final-green.txt, T06-typecheck.txt, T06-lint.txt. Rollback: revert this local task commit; no data or migration change. Hosted not run; flags unchanged.
- A2 scan integration finished exit 1: disposable fixture beforeAll exceeded 120 seconds, 19 tests skipped, no product assertion reached. T-08 local validation remains verified; database acceptance remains blocked. Evidence: T08-integration.txt. A2 SHA: 3ea795dc62fa0e199fd0e299e83f003cf2aff4ae.

### B / T-16 / UC-14, UC-19

- Registry: 12 agents, 7 Live / 5 Beta. Added 88 named HK/TW normal/missing-data/adversarial/recovery JSON fixtures using the existing harness. Eight validation_plan slots are explicitly N/A: no production template routes that agent; server substitution remains forbidden.
- RED coverage: missing named fixtures (exit 1). Additional true-pipeline provider regression: rejected timeout made one call instead of the contracted budget-bounded retry (2 failures, exit 1). Fix: retry rejection inside the existing maximum-two-attempt deadline; clear failure reason on recovery; preserve final persistence and authorization.
- Tests exposed two pre-existing assertions swallowed inside provider mocks. Assertions now inspect actual prompt evidence after successful execution; owner input remains fenced data and cannot widen collected reviews. Facts-needed output can exist without an artifact version; the harness assertion now checks this actual contract.
- GREEN: `vitest run test/corpus/workflows/corpus.test.ts test/corpus/workflows/audit-matrix.test.ts test/corpus/workflows/provider-recovery.test.ts scripts/eval-workflows.test.ts lib/workspace/runs.test.ts --maxWorkers=1`: 5 files / 213 tests, exit 0. Scoped eslint and root typecheck: exit 0.
- Evidence: T16-red.txt, T16-provider-red.txt, T16-green.txt (intermediate harness mismatch), T16-final-verification.txt, T16-final-lint.txt, T16-typecheck.txt; coverage and live manifest: ai-quality-baseline.md. Guardrail/contract coverage only; no real-model writing quality, CI or hosted claim.
- Live blocked by DEC-04 budget/model/provider authorization, approved dataset/reference labels, quality thresholds and human reviewer. Rollback: revert this local commit; no provider/DB/hosted state changed.
