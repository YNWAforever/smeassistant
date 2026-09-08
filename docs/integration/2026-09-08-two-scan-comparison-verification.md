# Two-scan comparison verification

Verification target: runtime commit `855f647` on 2026-09-08. The final repository gate passed; the documentation commit is the commit containing this file. The owned test environment uses fixture scan sources, Docker PostgreSQL, and a local Next.js server. It does not run live scans, call paid or external providers, send real email, use a shared database, migrate production data, or deploy.

## Review outcome

Tasks 1-5 and the final whole-branch authorization/test review are approved through runtime commit `855f647`. The final review found and resolved two P2 defects:

- Commit `f47188f` retains failed, unknown, and conflicting stored query identities as unknown facts. They contribute to `omittedPrevious` and `omittedCurrent`, while remaining outside the comparable denominator and direction. Focused RED was 2 failed and 11 passed; focused GREEN was 4 files and 83 tests passed, with root TypeScript, scoped ESLint, and `git diff --check` also passing.
- The same commit keeps `history_limit` inside the selector and collapses it to `no_accessible_pair` at the authorized view-model and report-props boundaries. Empty, all-denied, and capped-denied history therefore serialize identically. Focused RED was 1 failed and 27 passed before the projection fix.

The earlier locked-route privacy review fix is commit `f7d69a4`. Its selected acceptance rerun passed 1/1 in 50.0 seconds, and TypeScript, scoped ESLint, and `git diff --check` passed.

Commit `855f647` corrects the stale `first_scan` unit expectation to the approved `not_evaluated` state and adds an explicit public-props comparison omission assertion. Focused RED was 1 failed and 6 passed; focused GREEN was 7 passed, scoped lint passed, and final review approved the correction.

## Task 5 browser evidence

The actual share-route acceptance fixture inserts current, earlier same-location, and different-location reports into its owned database. Before unlock, HTML and an explicit `RSC: 1` response omit comparison panel content, both historical job IDs, the earlier comparison date, and private query and summary sentinels. After granting only the current report through the existing local unlock endpoint, current private evidence renders while earlier and different-location IDs, dates, and sentinels remain absent from HTML and RSC. The panel shows the localized `no_accessible_pair` state.

The acceptance test exercised en, zh-HK, and zh-TW at widths 375 and 1440 and found no horizontal overflow. Six actual-route unavailable-state screenshots exist under `.superpowers/sdd/comparison/screenshots/`; only the zh-HK 375 and 1440 screenshots received manual visual inspection. The selected acceptance test passed 1/1 in 50.0 seconds after the locked-history assertion fix, with no skips.

The first Task 5 runs exposed fixture setup/model issues: an unseeded location foreign key, a sentinel placed in the intentionally public `business_name`, and an undefined test variable. These were corrections to the test setup and assertions, not production behavioral RED evidence.

## Reachability limitation

The default share route does not inject the membership resolver required to authorize an earlier report independently. A current-report grant is job-bound and does not authorize the earlier scan, so a successful pair is not reachable through that route. Available, unchanged, IG-only, and partial states are covered by component tests using the real `ScanComparisonPanel` and safe derived props.

No fixture-only browser rendering surface exists in the owned harness. There is therefore no successful-pair browser screenshot or browser proof of keyboard activation for its evidence disclosure. Component rendering verifies the native `details`/`summary` structure and exact evidence content. These remain release gaps; no production route or authentication behavior was widened to manufacture browser coverage.

## Repository gate evidence

Gate session `92325` ran against runtime commit `f47188f49558f145de7df2dcbf321195b27c056a`. Install, lint, and typecheck exited 0. The unit stage then exposed one stale test expectation in `tests/funnel-report-props.test.ts`: it expected the removed `first_scan` placeholder although approved real-report behavior is `not_evaluated`. The controller intentionally stopped the gate at that point. The unit suite did not complete, so it has no final pass/fail/skip count. This is interrupted pre-correction evidence, not a passed gate or a completed failed suite.

Fresh gate session `86634`, resumed as session `79856` after preserving the first integration attempt, completed against unchanged source commit `855f6475b5233d9c6f87742c2bcc59395a172490`. All 14 stages exited 0. The completed test suites reported 0 failures and 0 skips.

| Stage | Result | Exact evidence |
| --- | --- | --- |
| install | passed | Exit 0; 4.87 seconds |
| lint | passed with warnings | Exit 0; 29 warnings and 0 errors; 25.55 seconds |
| typecheck | passed | Exit 0; 21.12 seconds |
| unit tests | passed | 2,595 tests: root 2,038; safe-media 62; region 23; scoring 183; contracts 20; scan-engine 269; 325.80 seconds |
| secret boundary | passed | 45 public artifacts; 56.70 seconds |
| no Supabase | passed | No forbidden retired transport references; 2.02 seconds |
| Docker Linux engine | passed | Docker `linux`, version 29.7.2; 1.75 seconds |
| Docker PostgreSQL pull | passed | Owned `postgres:16` fixture image available; 7.68 seconds |
| database verification | passed | 4 migrations applied, replay empty, 34 tables, 403 columns, 151 constraints, 84 indexes, 7 triggers, 13 functions, 0 seeded rows; 10.47 seconds |
| integration tests | passed on full retry | 24 files, 243 tests, 0 failures, 0 skips; 318.27 seconds reported by Vitest |
| build | passed | Exit 0; 61.01 seconds |
| Chromium install | passed | Exit 0; 4.94 seconds |
| Playwright E2E | passed | 31/31, 0 skips; 1.6 minutes |
| acceptance E2E | passed | 21/21, 0 skips; 6.9 minutes |

Gate `30720` was intentionally stopped after install and lint passed at commit `7e950eb`, before the final privacy assertion and P2 fixes. It is archived pre-fix evidence and is not a passed full gate.

The first full integration attempt had 242 passes and 1 failure in `test/integration/neon-integrations.integration.test.ts:252`, `cancels locked analytics, frees its connection and never inserts after unlock`: after the existing 400 ms poll, the `pg_stat_activity` lock-wait count was 0 instead of 1. The unchanged focused test then passed once with 13 name-filtered skips in 21.06 seconds. The complete unchanged-source integration retry passed 243/243. The timeout was not relaxed, and the first failure evidence remains archived in `integration-attempt-1.log` and `status-attempt-1.json`.

Warnings were non-blocking and preserved: ESLint reported 29 existing warnings with no errors; unit logs reported the existing Vite native-config warning; process logs reported Node `DEP0190` and the `NO_COLOR`/`FORCE_COLOR` warning. No hosted CI or deployment was run.

After the gate, the controller confirmed zero owned PostgreSQL fixture containers and zero Next.js server processes remained. Generated snapshot rewrites were canonically identical to `HEAD` after normalization and their line-ending-only rewrites were restored, leaving only the three documentation files for this commit.

## Final checklist

- [x] Runtime implementation and review fixes recorded through `f47188f`.
- [x] Whole-branch authorization and test review approved through `855f647`.
- [x] Actual-route HTML/RSC privacy and unavailable-state evidence distinguished from component-only successful-pair evidence.
- [x] Successful-pair screenshot and keyboard gaps stated explicitly.
- [x] Interrupted gate `92325` recorded without claiming a complete unit result.
- [x] Corrected runtime commit `855f647` and focused RED/GREEN recorded.
- [x] Fresh gate `86634` exact stage results, counts, skips, warnings, and preserved integration retry transcribed.
- [x] Final documentation commit identified as the commit containing this file.
