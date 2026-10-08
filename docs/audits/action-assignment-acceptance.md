# T-13 / F-10 / UC-18 and T-17 / UC-21 local evidence

Search is literal, trimmed and bounded to 200 characters; only visible localized action titles/summaries participate. Assignee (UUID/unassigned) and due (overdue/today/next_7_days/none) apply to the page and its counts. Overdue compares instants; today and the next seven days use half-open local midnight windows in the workspace IANA timezone. Date filters include a 25-hour America/New_York DST integration case. Cursors reset with filters and remain scoped.

Bulk is limited to 1–50 explicitly selected action IDs and assignee/due fields. No approve/publish/generate/complete/delete operation is accepted. ACTION_BULK_ASSIGN_ENABLED defaults off and is strictly `true`; only the owned loopback acceptance environment enables it. Existing flags and hosted values are unchanged.

Preview rereads accepted membership, action/evidence scope, target-member eligibility and current values; it returns a fresh exact timestamp token. Apply rechecks those facts plus open state/CAS. Eligible assignees are accepted owners/managers who can act on the action and its evidence. Each update and audit insert share a transaction. An already desired value gives no_change without an extra event. Foreign/deleted UUIDs give the same detail-free not_found. Legitimate updates are not automatically rolled back with code rollback.

UI selection survives page navigation up to 50; workspace/location/filter/role changes clear it. Preview is mandatory before confirmation. Per-item results declare partial completion. A conflict or unknown result requires a fresh preview; the retry sends failures only and retains successful outcomes. Dates use the workspace timezone; ambiguous/nonexistent DST inputs require a different time.

## Actual verification

| Gate | Result | Readable evidence |
| --- | --- | --- |
| Initial single date / missing bulk boundary | Expected failure, exit 1 | T13-boundary-red.txt |
| Ignored search / invalid filters | 2 expected failures, exit 1 | T13-search-red.txt |
| Service/API unit | 3 files / 30 passed, exit 0 | T13-service-unit.txt |
| Final list/UI unit | 6 files / 67 passed, exit 0 | T13-ui-final-unit.txt |
| Real PostgreSQL acceptance | 2 files / 12 passed, exit 0 | T13-acceptance-db.txt |
| Root typecheck and scoped lint | Exit 0 | T13-ui-typecheck.txt, T13-ui-lint.txt, T13-acceptance-lint.txt |
| Actual Chromium local journey | 2 passed, exit 0 | T13-T17-browser.txt |
| Frozen install after freed disk | Exit 0; lockfile unchanged | dependencies-frozen-install-retry.txt |

The browser used real Next 16.2.6, isolated identity/mail/LLM services and owned PostgreSQL, with outbound transport denied. At 375px it searched, selected by keyboard, opened the real dialog, closed with Escape and returned focus, previewed/applied 09:00 Hong Kong time, confirmed UTC 01:00 in the database and exactly one event, and checked page/dialog overflow. Viewer had no bulk checkboxes and received 403; a scoped manager could not list the other location's action. This proves the local action flow, not every mobile owner journey or HK field usability.

The first browser attempt failed before product assertions because Turbopack rejected the borrowed dependency junction; T13-T17-browser-junction-failure.txt preserves it. The junction alone was removed after target verification, original dependencies preserved, and frozen dependencies installed inside the worktree. The rerun used the original bundler/gates. An intermediate JSX typo is also preserved in T13-ui-jsx-failure.txt; final tests reran after correction.

No new remote CI, hosted acceptance or production deployment/enabling has occurred. HK field testing still needs participants and a dedicated authorized workspace. Hosted bulk acceptance needs approved identities, scope and target; index migration 0015 needs journal/readiness and explicit migration authorization. Cron remains off. Rollback: turn off the new entry flag or revert the three local T-13 commits in reverse order; change any legitimate assignments through the normal single-item service, not a blind data reversal.

## Independent-review follow-up at efd51ca

The fresh reviewer reproduced a misleading card: a successful named assignment persisted, but the refreshed list still said Unassigned. The actual list-function regressions failed twice, visible unavailable-member copy failed in three locales, and a real DB projection regression failed before the fix.

The bounded repository projection now resolves the label only from a matching accepted workspace member. The overview receives both assigned user ID and label. If membership is missing or revoked, the card retains assigned status and shows the localized unavailable-member label; it does not expose pending/foreign email or grant access. A truly unassigned action still shows Unassigned. Long member labels wrap at 375px.

Five selected unit/UI files passed 126 tests; two complete owned-DB files passed 13 tests, without skips. The first green attempt used a removable synthetic owner and correctly hit `owner_removal_forbidden`; only that fixture member changed to manager before rerunning. The production owner guard remains in place.

The three-case local Chromium file passed in 2.9m. Its main case now applies the actual accepted owner email and due date, checks the refreshed card, checks stored member and a single audit event, filters by that exact member, and checks keyboard/375px overflow. Existing viewer/scoped-manager denial and lost-response recovery cases remain. Evidence: `final-review-assignee-browser.txt`, `final-review-assignee-db-green.txt`, `final-review-selected-green.txt` and `final-review-targeted-commands.json` under remediation-evidence. This is synthetic local acceptance; fresh full-suite results are recorded separately in `final-review-gates.jsonl`. Rollback of this follow-up is a normal revert of efd51ca, without reversing legitimate assignments or altering hosted flags.
