# Remediation evidence index

Latest complete verification: efd51ca source/fixture, all eleven gates exit 0; 5,352 units, 565 integration, 31 general E2E and 49 required acceptance. See the Latest independent-review section and verification-summary.json. Older results below are explicitly historical.

Later read-only continuation: `T19-T21-continuation-target-metadata.json` (2026-10-07 12:12 UTC) records an independently obtained named Neon candidate, exact branch/endpoint/database metadata, configured 6-hour history retention and an empty snapshot list. Production DATABASE_URL binding and application-role readiness access remain unconfirmed; no SQL, restore or hosted mutation occurred. Vercel alias still serves audit SHA. These metadata/document additions leave the verified efd51ca source/fixture unchanged and do not constitute a new CI run.

`T19-auth-association.json` (2026-10-07 12:53 UTC) adds a verified match between the current production-scoped Auth configuration and candidate Neon Auth hostname/database path. It does not prove DATABASE_URL binding, the frozen deployment environment, runtime DB privileges or hosted login. No full configuration value was stored/displayed, no DATABASE_URL was requested, and no SQL/Auth user operation occurred. The missing binding/read-only-role input remains required.

Original audit material is outside the implementation worktree and read-only. `manifest-final-verification.json` records 6 handoff and 28 evidence checksum matches; `input-integrity-final.json` binds the unchanged plan, lockfile, 21 historical audit statuses and old migrations.

Historical verification before the fresh independent review: the local application verification commit is `76404c43458e3bf614bd2ac2329655e265c74f79` (tree `9cc29f67569b7be35849ffe78e21da382917733b`). Fixture-only follow-up `6941ed7c24ab66593018ab40e3628d193056ed17` changes merchant-loop acceptance data and strict assertion/replay checks, with fresh full lint/typecheck and HK/TW 2-case browser verification. All application/unit/DB/build/general-E2E sources remain identical. `final-gates.jsonl` is append-only execution history: use the latest event for each gate and retain earlier failures. Documentation-only commits do not imply another deployment or remote CI run.

| Evidence | Meaning |
|---|---|
| `full-lint.txt`, `full-typecheck.txt`, `full-unit.txt` | Complete local lint/type/root and package units; 40 lint warnings retained, 5,325 unit tests passed |
| `full-secret-boundary.txt`, `full-no-supabase.txt`, `full-no-self-service-claim.txt` | Existing security/architecture contracts; 61 public artifacts checked |
| `full-db-verify.txt`, `full-integration.txt` | Owned disposable PostgreSQL only; 15 migrations, 52 integration files / 564 tests passed, no skips |
| `full-build.txt`, `full-e2e.txt`, `full-acceptance.txt` | Build exit 0, general E2E 31/31 and required acceptance 49/49, exit 0; no final failed/skipped |
| `*-red.*`, `*-green.*`, task-specific logs | Permanent defect regressions and targeted verification; excluded tests in a targeted RED run are not a full-suite skip/pass claim |
| `T12-benchmark-*.jsonl`, `T12-benchmark-indexed.jsonl` | Synthetic bounded-list costs; not a production latency measurement |
| `T05-*`, `T19-*metadata*`, `T02-platform-plan-metadata.json`, `hosted-baseline-final.json` | Sanitized read-only hosted observations; no environment values, credentials or setting mutations |

Preserved unsuccessful attempts:

- `full-unit-first-interrupted.txt`: interrupted/incomplete attempt with obsolete raw IG-label expectation. Full reruns check the visible localized label and pass.
- `full-integration-first.txt`: two explicit journal-count expectations still said 14 after the new 0015 migration. Corrected to 15 while retaining checksum/order/replay/rollback assertions; full rerun passes.
- `T13-T17-browser-junction-failure.txt`: Next startup rejected a borrowed dependency junction. Only the owned junction was removed, original dependencies preserved, then frozen dependencies installed inside this worktree.
- `T13-ui-jsx-failure.txt`: intermediate JSX syntax failure, corrected before fresh verification.
- `full-e2e-first-startup-failure.txt`, `e2e-startup-404-next.log`, `e2e-startup-404-app-paths.json`: zero browser assertions ran; Next's development manifest contained only `_not-found`. The resolved `.next/dev` cache was checked to be inside this isolated worktree and no owned Next process was running before its removal. No source/auth/locale change: rebuilt routes and 31/31 general E2E pass.
- Earlier setup/DB timeout logs remain readable; later full DB runs replace their blocked local status, without claiming hosted verification.
- `full-acceptance-first-fixture-failure.txt`, `full-acceptance-first-next.log`, `T15-merchant-*-red-trace.zip` and contexts: complete 47-pass/2-failure run. New merchant fixture omitted persisted required_inputs. Corrected only that synthetic setup, checking exact 201-create/200-replay and stored UUID/event; targeted HK/TW 2/2 pass. The final full rerun has its separate log.
- `T15-merchant-fixture-command-error.txt`: Windows pnpm.cmd pipe quoting failure, exit 255, zero browser tests. Safe literal filter used afterward.
- `T15-merchant-fixture-targeted-first-404.txt` plus server/context/trace: first HK detail request returned 404; TW passed. Verified owned cache reset, same unchanged fixture/app rerun 2/2 pass. This records dev-environment recovery; framework cold-start root cause is not claimed resolved.

Earlier failed ledger entries retain the path used when they ran; corresponding immutable saved failures are `full-e2e-first-startup-failure.txt` and `full-acceptance-first-fixture-failure.txt`. Later green/current runs use the normal full-e2e/full-acceptance filenames. The final summary maps each historical failure to its retained log.

Fixture logs can contain synthetic mail links, IDs and loopback addresses. The fixture rejects ambient `.env`, constructs an allowlisted environment and denies external transports. No original customer/provider secret is included. Existing feature flags, DEC-10 cron-off state, production migrations and production aliases were not changed.

Readable task summaries and rollback are in `../2026-10-07-remediation-handoff.md`, `../2026-10-07-remediation-progress.md` and `../2026-10-07-remediation-tracker.csv`.

`verification-summary.json` contains all eleven final gate commands/exit codes/source bindings and test totals. All historical audit statuses are preserved in the 21-row tracker. Remote CI for this remediation, hosted acceptance, deployment/activation, production migration, live AI/HK field/restore remain unexecuted rather than inferred from local success.

## Latest independent-review fix and complete verification

The latest application and fixture verification commit is `efd51ca1a68ba9f9d3c56ea726b008b97d400328` (tree `6650a61c31826d044d0f9fe572b031aa031220a8`). All eleven CI-order local gates passed at that immutable source, sequentially: 5,352 units, 52 integration files/565 tests, 31 general E2E and 49 required acceptance. No final failed/skipped tests; lint retains 40 warnings. The previous table and attempts above are historical evidence, not a claim that the older source verifies this follow-up.

| Evidence | Meaning |
|---|---|
| `final-review-gates.jsonl`, `final-review-full-*.txt` | Exact latest commands, exit codes, times and source SHA; all eleven gates exit 0 |
| `verification-summary.json` | Latest complete source/fixture binding and actual test totals |
| `pre-review-verification-summary.json`, original `final-gates.jsonl` | Previous source/fixture verification preserved |
| `../final-independent-review.md`, `final-review-targeted-commands.json` | One fresh review, two Important and one in-scope P3, one RED/GREEN fix pass, actual commands and rollback |
| `final-review-list-benchmark.jsonl` | Label-inclusive bounded projection: 1,000 actions gives 2 queries/27 rows/23,133 bytes; indexed member lookup 26 loops; local fixture only |
| `final-review-manifest-verification.json`, `final-review-local-integrity.json` | Reverified original 6/28 checksum matches, unchanged plan/lock/old migrations, frozen source and preserved workspaces |
| `continuation-hosted-baseline.json` | Read-only main/production alias snapshot still at audit SHA; no new deployment/setting mutation |
| `continuation-local-verification.json` | Explicitly a pre-review snapshot; does not verify the newer fix |
| `final-review-interrupted-attempt.json`, `final-review-full-test-interrupted.txt` | Incomplete full unit attempt, no footer/exit code/pass claim; full unit and remaining gates subsequently rerun |
| `final-review-assignee-db-setup-timeout.txt` | Setup timeout before assertions; not a defect RED |
| `final-review-assignee-db-first-green-fixture-error.txt` | 12 passed/1 fixture owner_removal_forbidden; synthetic removable role corrected, real owner guard retained |
| `final-review-full-db-verify.txt`, `final-review-full-db-verify-retry-1.txt`, `final-review-docker-recovery.json` | First attempt failed before fixture creation because local Docker daemon was stopped; engine/cached image recovered and unfinished gate resumed without overwriting the failure |
| `final-review-acceptance-econnreset.json`, `final-review-acceptance-econnreset-next.log`, `final-review-acceptance-econnreset-context.md`, `final-review-acceptance-econnreset-trace.zip` | First fresh complete acceptance 48 passed/1 failed; unavailable LLM request read ECONNRESET before response; root cause unconfirmed |
| `final-review-unavailable-llm-isolated.json`, `final-review-unavailable-llm-isolated.txt` | Original source/assertion isolated case 1/1 passed in 37.6s; no request retry/config/source change; full required suite then rerun |
| `final-review-failed-fixture-cleanup.json` | Exact owned failed fixture re-identified before cleanup; unrelated containers preserved |

Hosted acceptance, remote CI for this unpushed branch, production migration, flags/cron activation, live AI, HK field test and restore remain unexecuted. All 21 historical audit statuses are preserved. Current per-task local/hosted status, concrete blockers and rollback are in the tracker and handoff.
