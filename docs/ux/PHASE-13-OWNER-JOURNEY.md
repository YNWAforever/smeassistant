# Phase 13 — complete the owner’s Kinnso-to-task journey

Approved 2026-11-13. Baseline: PR #175, merge `b99365f9543ef3e5dc2bbcf292ec56f1bc298a46`.

## Outcome

Keep the owner’s conversation, location and exact draft version intact through Today → Kinnso → saved draft → review → approve → copy/export → return to the same conversation. Required CI must exercise the enabled chat experience as well as the existing disabled configuration.

## Delivery sequence

1. **Enabled Kinnso CI:** dedicated isolated acceptance job for the Studio and contextual-entry specs, with both conversation flags on, a no-skips report gate and exclusive tests forbidden. Preserve the general verification job and disabled-configuration coverage.
2. **Conversation continuity:** carry the originating conversation identifier through the draft card’s exact-version review URL. Authorize the return context on the task page; inaccessible, malformed, archived or mismatched conversations fall back to the ordinary Kinnso entry. Preserve valid return context through version restoration. New revision requests retain their intentional fresh-thread behaviour.
3. **Journey verification and roadmap:** test two-conversation continuity, refresh, retries, denied access, exact-version approval and delivery behaviour; verify supported languages and mobile/desktop layouts; reconcile stale roadmap status with shipped capabilities.

Approval and export remain on the task page. URL parameters grant no authority. Existing immutable-version, role, location and delivery-count boundaries remain in force. No database migration or provider change is planned.

## PR 1 implementation

The dedicated `Kinnso enabled acceptance` CI job runs with an owned PostgreSQL/Auth/mail/scripted-LLM environment. The fixture explicitly propagates the Studio flag and enables the conversation home flag. The standard verification job retains its existing flag-off environment.

The GitHub classic branch-protection endpoint reports `Branch not protected` for `main`. This job is an unconditional CI release gate; it is not a claim that GitHub branch protection enforces it. The guarded merge must wait for both CI jobs. Repository access-policy changes are outside this PR.

The report gate rejects empty suites, skipped tests, expected failures, missing successful executions and global errors. Configured retries remain visible as flaky results, consistent with the existing acceptance configuration. `--forbid-only` prevents focused tests from silently reducing the selected suite. Job diagnostics have a separate artifact name.

Enabled coverage includes persistent streaming/reload, draft saving and version handoff, browser-note import, action deep links, sharing/viewer restrictions, conversation privacy and allowlisted Today/task entry links. Document-attachment browser coverage is not established by these eight cases; it remains a follow-up within the phase verification work.

Re-enabling the dormant suite exposed stale UI expectations: the canonical conversation URL need not add the default location query, and transcript export/sharing now live inside the overflow menu. Tests follow those current interactions while preserving their persistence and authorization assertions.

## Verification status

- Initial seven-case enabled Studio run: 7 passed in 1.6 minutes; no skips.
- Report-gate unit tests: 8 passed, covering passing/retried results and empty/skipped/failed/incomplete/global-error reports.
- Typecheck, changed-file lint and whitespace checks: passed.
- Full eight-case enabled command, including contextual entry links: 8 passed in 1.3 minutes, no skips. The report guard passed on the generated Playwright JSON.
- Independent read-only review identified two omissions: the contextual-entry spec and exclusive-test protection. Both were added before the final eight-case run; no other actionable findings were reported.
- PR CI, merge and deployment: pending.

## Release boundary

After required CI passes, land through reviewed PRs and verify deployed routes/layout read-only. A new hosted generation/approval/export exercise needs a designated test workspace and explicit authorization for production writes and model spend. Local isolated acceptance provides automated behavioural proof without those effects.
