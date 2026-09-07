# Existing scan metrics verification

Status: verified at the corrected runtime head

Date: 2026-09-08

Worktree: `C:\Users\laich\Documents\smeassistant\.worktrees\neon-migration`

Branch: `codex/existing-scan-metrics`

Runtime tested SHA: `ac5e999f5173a2547b669edffa93835473637bc7`

## Verified scope

This slice derives and presents bounded metrics from existing stored report evidence. It does not add collection, provider calls, database schema or migration work, scoring changes, authorization changes, or competitor-comparison changes. Instagram engagement averages and follower-based engagement rates remain unavailable. Search visibility is separated by surface and uses conservative eligibility; ambiguous organic observations remain excluded or unavailable where the stored evidence cannot support a measured result.

The current implementation keeps the staff loader disabled and verifies staff model/props boundaries only. Public and locked report HTML, React Server Component responses, and serialized props omit the new metrics and private supporting evidence. The browser evidence verifies actual RSC response privacy; it does not claim client-router cache-transition behavior.

## Accepted review record

- Task 1 review (`56cedc0..ddf9b45`): approved, with the bounded sensitive-key regression resolved.
- Task 2 review (`ddf9b45..005abe9`): approved; independent organic-denominator concern was withdrawn after the producer regression established the required evidence boundary.
- Tasks 3 and 4: approved; staff proof remains model-only and the earlier locale-coverage minor was resolved in Task 5.
- Task 5: approved with no Critical or Important findings. Existing launcher `NO_COLOR`/`FORCE_COLOR` output is baseline harness noise.
- Final independent review: no Critical or Important findings. The impossible-calendar-date parsing minor was reproduced, fixed, and re-reviewed as resolved in `ac5e999`.

## Task 5 owned browser evidence

The owned acceptance fixture is explicitly illustrative and uses stored report evidence only. The final browser run passed:

`corepack pnpm e2e:acceptance e2e/acceptance/report-scan-metrics.spec.ts`

Result: 1 passed; no browser page errors or console warning/error diagnostics. The final focused unit run passed 4 files and 82 tests. `git diff --check` passed. Screenshots are recorded under `.superpowers/sdd/metrics/screenshots` for en, zh-HK, and zh-TW at 375px and 1440px. The initial browser timeout was a test cleanup-locator defect; the stable-set test-only correction passed on rerun and introduced no product change.

The browser flow verified separate organic, AI, and Maps denominators, localized historical/sample disclosures, no Instagram engagement percentage, keyboard disclosure controls, long-query wrapping, and no document overflow at both viewport widths. Public and revoked-viewer HTML and RSC payload probes omitted private query/post/summary sentinels and the metrics panel.

## Final full-gate evidence

The controller-owned normal repository gate completed at the corrected runtime head. The baseline is `origin/main` at `88b912d9e79a9191d4bde758e9d0407d24b0f948`; the tested SHA is `ac5e999f5173a2547b669edffa93835473637bc7`. All 14 recorded gate steps exited 0: install, lint, typecheck, unit, secret-boundary, retired-transport, Docker, fixture image, migrations, integration, build, browser install, public e2e, and acceptance.

Unit verification recorded 2,536 passing tests, broken down as `1979 + 62 + 23 + 183 + 20 + 269`. Lint exited 0 with 29 baseline warnings and no errors. Secret-boundary verification passed across 45 public artifacts. Docker used Linux engine 29.7.2 and the fixture image; migration verification reported an empty replay list, 34 tables, 403 columns, 151 constraints, 84 indexes, 7 triggers, 13 functions, zero seeded rows, and no deferred items.

The first SQL integration attempt recorded 240 passing tests and 1 failure: the existing analytics lock-observation test exceeded its 400ms polling window at test line 252. The source was unchanged. An isolated selected reproduction passed once with 13 name-filtered skips. The complete SQL rerun then passed 241 tests across 23 files with zero skips. This recovery is recorded explicitly; the gate did not have a blanket no-failure history. Public e2e passed 31 tests with zero skips; acceptance passed 20 tests with zero skips in 8.5 minutes. Build passed.

The separate pre-date-fix gate was intentionally interrupted and is not evidence of a full pass.

## Hosted and operational limitations

No live provider calls, real email delivery, shared database use or migration, production mutation, push, merge, deployment, or live seeding is included. Historical IG zero values are retained without averages; ambiguous organic observations remain conservatively unknown. Staff proof remains model-only. RSC response privacy is verified, while router-cache navigation is not claimed. Baseline launcher/Vite/DEP0190 warnings remain informational and do not affect the zero exit codes.

