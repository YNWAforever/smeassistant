# Remediation evidence index

Original audit material is outside the implementation worktree and read-only. `manifest-final-verification.json` records 6 handoff and 28 evidence checksum matches; `input-integrity-final.json` binds the unchanged plan, lockfile, 21 historical audit statuses and old migrations.

The local application verification commit is `76404c43458e3bf614bd2ac2329655e265c74f79` (tree `9cc29f67569b7be35849ffe78e21da382917733b`). Fixture-only follow-up `6941ed7c24ab66593018ab40e3628d193056ed17` changes merchant-loop acceptance data and strict assertion/replay checks, with fresh full lint/typecheck and HK/TW 2-case browser verification. All application/unit/DB/build/general-E2E sources remain identical. `final-gates.jsonl` is append-only execution history: use the latest event for each gate and retain earlier failures. Documentation-only commits do not imply another deployment or remote CI run.

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
