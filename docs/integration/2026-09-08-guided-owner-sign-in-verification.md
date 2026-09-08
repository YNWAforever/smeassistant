# Guided owner sign-in verification

Date: 2026-09-09
Tested source SHA: `0851cfb44b5438a83b359f14551d491a8e6283d8`
Status: Local implementation evidence is incomplete. The branch is not release-ready.

## Scope and environment

All automation used `SCAN_SOURCES=fixture`, `NEON_INTEGRATION=1`, and `VITEST_MAX_WORKERS=1` where relevant, without a real environment file, live provider, email delivery, shared database migration, deployment, or domain action. Docker reported `linux` (exit 0). The four disposable containers labelled `com.sme-scanner.integration=neon-postgres` created by this worktree were removed. No guided-sign-in Next, Playwright, Vitest, or identity-fixture process remained.

## Current gate evidence

| Command | Exit/result | Evidence |
| --- | --- | --- |
| `corepack pnpm install --frozen-lockfile` | 0 | Lockfile current; dependencies installed. |
| `corepack pnpm lint` | 0 | Reran after the review correction; ESLint completed. |
| `corepack pnpm typecheck` | 0 | Reran after the review correction; root and four workspace packages completed. |
| `corepack pnpm test` | no valid result | The execution watchdog detached the Vitest parent after it began; its runner continued without emitting test totals. It was stopped and recorded as `INTERRUPTED_BY_EXECUTION_WATCHDOG_NO_TEST_RESULT`. This is not a pass. Dependent normal-gate stages were not run. |
| `corepack pnpm exec vitest run app/auth/callback/route.test.ts components/auth/sign-in-completion.test.tsx` | 0 | 2 files, 15 tests passed after the review correction. |
| `docker info --format '{{.OSType}}'` | 0 | `linux`. |
| `git diff --check` | 0 before committing `0851cfb` | No whitespace errors. |

Because the root test command lacks a valid exit, this record does not claim success for `test:secret-boundary`, `test:no-supabase`, `db:verify`, `test:integration`, `build`, Playwright installation, `e2e`, or `e2e:acceptance` as a Task 6 normal gate. They must be run with valid captured exits before a release decision.

## Focused evidence from reviewed slices

- Task 1: callback diagnostics and callback regressions: 19 tests; SDK transport: 4; callback/identity focused suite: 82 tests; owned Neon identity integration: 5 tests, with no relevant skips.
- Task 2: flow-context, callback, auth proxy, mail-route, and hydration suite: 15 files, 120 tests.
- Task 3: completion, callback handoff, and identity suite: 16 files, 115 tests; owned Neon completion/identity/membership integrations: 27 tests, with no relevant skips.
- Task 4: guided UI, hydration, callback, handoff, SDK, completion route, and domain suite: 8 files, 42 tests; TypeScript passed.
- Task 5: required combined acceptance command passed 24/24 in 2.1 minutes. The locale/viewport matrix passed 6/6 in 34.5 seconds. The isolated returning-viewer rerun passed 1/1 in 17.5 seconds. Its earlier combined attempt had one transient `ECONNRESET`; the recorded rerun is the valid evidence.

These are focused fixture checks, not substitutes for the unfinished root gate.

## Authorization and privacy coverage

The reviewed tests cover managed callback cookie preservation only through the exact clean callback handoff; same-origin and Fetch Metadata checks before completion POST parsing; fresh-session invalidation versus service-failure session preservation; validated local destinations and context propagation; non-enumerating email responses; atomic pending-membership binding; claim constraints; and no-access only after successful authorization. Browser fixtures cover controlled Google-style completion, cancellation, unavailable/revoked and mapping/binding recovery, changed account, consumed email link, empty access, cross-origin POST rejection, and the absence of membership or draft-authority mutation on failure.

The current callback diagnosis remains unresolved at the hosted Google boundary. Production evidence showed failure after Google account selection, but did not distinguish verifier exchange, fresh-session lookup, identity mapping, invitation binding, workspace lookup, or claim resolution. Local diagnostics now produce only an allowlisted stage and opaque correlation identifier. Fixture SDK exchange and owned SQL mapping pass, but neither proves the production Google return is fixed.

## Independent review and correction

Tasks 1 through 5 each received an independent slice review recorded as clean before the next task. The post-Task-5 final authorization/test review identified two corrections:

1. Router ref assignment ran during component render. Commit `0851cfb` moves that assignment to an effect without changing the one-request completion behavior.
2. The owned fixture verifier exchange can return `null`, but the callback passed it to the response-only handoff helper. Commit `0851cfb` now fails closed to the generic invalid-code recovery, with a regression covering the null exchange.

The focused callback and completion suite passed 15/15, and lint and typecheck passed after that correction. A fresh whole-branch independent re-review is still required after `0851cfb`.

## Browser evidence and live limits

The owned browser fixture generated six ignored locale/viewport screenshots and automated keyboard-focus, Enter activation, processing-state, navigation, and overflow assertions. Automated capture completion was inspected through the test results. Manual bitmap inspection was blocked by the host ACL, so no visual conclusion relies on an uninspected image.

No live Google account completion, live email receipt, provider configuration change, deployment, or production diagnostic release was attempted. A future authorized diagnostic/release step must verify the deployed SHA, collect only safe stage/correlation evidence, and have a user complete the Google flow after account selection. Reaching Google's account picker is insufficient evidence of a completed sign-in.

## Release status

Not release-ready. The remaining release conditions are a valid full normal-gate run, a whole-branch independent review after `0851cfb`, and separately authorized hosted diagnostic/live verification. This record grants no deployment authority.
