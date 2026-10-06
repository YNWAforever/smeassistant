# Sequential review follow-up — T-13 / T-15 / T-17 / T-19 / T-20

Application and fixture follow-up after the main remediation batches; no external change. The current full lint/typecheck/unit/security/disposable-migration gates passed. Full DB/build/browser acceptance continues, with its final result separately recorded rather than presumed here.

## Reproduced defects and minimal corrections

- T-13 visible list freshness: completed bulk requests retained old server cards/counts. Permanent component regression expected refresh once after partial apply but observed zero (T13-refresh-red.txt, exit 1). Refresh after apply, including unknown response; preserve per-item successes, selection and failed-only re-preview. Selected 14 tests passed (T13-refresh-green.txt, exit 0). Browser asserts the actual card date after closing and commits through the real server before losing a response; its final gate remains pending.
- T-19 readiness: renaming first_published_at while keeping every journal checksum intact returned ready. Actual owned DB RED exit 1 (T19-readiness-column-red.txt); the other cases were excluded by the targeted filter. Minimal pg_attribute read requires the actual timestamptz column before declaring readiness. Three full DB files / 51 tests passed, including healthy recovery and flag-off pre-0014 measurement failure (T19-readiness-column-green.txt, exit 0). No hosted DB connection or DDL.
- New 0015 verifier expectations: full catalog RED identified exactly three added indexes. Preserve independently captured legacy catalog and all previous migrations; check the three new definitions exactly. Prefix tests separately apply through 0013/0014/0015; journal count assertions remain explicit 15 while checksum/order/missing-history/interruption/cancellation/rollback checks remain intact. Final migration verification exit 0. Full integration before readiness follow-up: 52 files / 563 tests exit 0 after two stale count expectations were corrected.
- Existing visible mapping expectation: full unit exposed an obsolete raw IG label; the regression now checks the localized Instagram handle label. Final unit exit 0, root 4738 + isolated safe-media 62; packages 23/183/20/299. Max workers honors the already-existing CI variable; no test or CI gate removed.

## Acceptance additions awaiting final browser evidence

- T-03 legal 3cuOKFmHdiYf00BOs27E_NO1 sign-in/onboarding preservation without ownership assignment.
- T-15 persisted brand/onboarding resume, repeat completion without duplicate membership/snapshot; HK/TW missing fact entered via the real PATCH UI and checked in DB/audit before generation.
- Exact immutable version edit/approval/export, repeated export usage, repeated applied assertion with one row/event; edited version still requires its own approval.
- T-13 lost apply response: actual server mutation, browser unknown state, refreshed read/re-preview, no_change retry and one audit event. No fabricated provider result or swallowed assertion in a transport callback.
- Existing T-18 browser checkpoint navigates no_access to own selector while accepted membership remains zero; broader 375px locale/metrics/keyboard cases remain in the required suite.

Acceptance inventory: 49 cases / 14 files load, exit 0. Inventory does not mean acceptance passed. The final gate ledger binds actual outcomes to the unchanged code tree; any failure will be preserved and fixed before delivery.

Rollback: revert the follow-up application/fixture commit. It has no migration SQL, dependency or flag change; existing legitimate assignments, immutable versions and uncertain ledgers are not erased. Prepared operations documents have their separate documentation commit and rollback.
