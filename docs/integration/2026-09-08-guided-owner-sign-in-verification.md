# Guided owner sign-in verification

Date: 2026-09-09
Tested source SHA: 194662c3d7160bf3ed75e167157293e84e34b0f2
Source corrections reviewed in this slice: 0851cfb, b79e4fb, 7a5f14a, 194662c.
Evidence commit originally created at 04dc0b7; this record is updated after the final reruns.

Status: local implementation and the normal fixture gate are complete. The hosted Google callback diagnosis remains unresolved, so the branch is not release-ready pending a separately authorized hosted diagnostic and live verification.

## Scope and environment

All automated work used SCAN_SOURCES=fixture, NEON_INTEGRATION=1, and VITEST_MAX_WORKERS=1 where relevant. No real environment file, live provider, email delivery, shared database migration, deployment, or domain action was used. Docker reported linux. The final cleanup check found zero containers with the repository's Neon integration labels and zero owned Next, Playwright, Vitest, or identity-fixture Node processes.

## Final gate evidence

| Command | Exit/result | Evidence |
| --- | --- | --- |
| corepack pnpm install --frozen-lockfile | 0 | Lockfile current; dependencies installed. |
| corepack pnpm lint | 0 | Final-head rerun; 0 errors and 30 existing warnings. |
| corepack pnpm typecheck | 0 | Final-head root and four workspace packages passed. |
| corepack pnpm test | 0 | Final valid rerun: 218 files and 2,102 root tests passed; safe-media 1 file/62 tests; workspace suites region 23, scoring 183, contracts 20, scan-engine 269. |
| corepack pnpm test:secret-boundary | 0 | Final build scan passed across 46 public artifacts. |
| corepack pnpm test:no-supabase | 0 | No forbidden retired transport references. |
| docker info --format '{{.OSType}}' | 0 | linux. |
| corepack pnpm db:verify | 0 | 4 migrations applied, replay 0, 34 tables, 403 columns, 151 constraints, 84 indexes, 7 triggers, 13 functions, 0 seeded rows. |
| corepack pnpm test:integration | 0 | Clean rerun: 25 files and 249 tests passed, with no skips. The earlier clean-state attempt was 247/249 because two analytics cases returned backend_unavailable; after removing a stale labeled fixture container, the rerun passed. |
| corepack pnpm build | 0 | Final-head Next build and TypeScript passed; 27 static pages generated. |
| corepack pnpm exec playwright install chromium | 0 | Chromium available for the fixture browser gates. |
| corepack pnpm e2e | 0 | Final rerun: 31/31 passed. |
| corepack pnpm e2e:acceptance | 0 | Final rerun: 38/38 passed. |
| git diff --check | 0 | Final worktree check passed. |

The first final-head unit attempt had one unrelated versions mutation test timeout and was stopped after no aggregate result; the isolated test then passed 11/11, and the required full command was rerun successfully. This record reports the valid rerun, not the interrupted attempt.

## Corrections made during the gate

- 0851cfb moves a router ref write out of React render and fails closed when a fixture verifier exchange returns null; focused callback/completion coverage is 15/15.
- b79e4fb moves the viewer-grant fixture test to the current holdsViewerGrant and completion boundaries. The stale route test reproduced 8/8 failures; the corrected focused test passes 8/8 while retaining exact job/grant binding, invalid and revoked rejection, malformed-cookie no-lookup, and generic SQL-failure recovery.
- 7a5f14a updates only the owner-shell fixture selectors to the current guided sign-in DOM. The prior full E2E result was 28/31; the final rerun is 31/31.
- 194662c adds Next's documented data-scroll-behavior attribute to the root html element. The prior acceptance result was 35/38 with three identical missing-data-scroll-behavior diagnostics; the final rerun is 38/38.
- The initial integration attempt left no running fixture after teardown but exposed a stale labeled disposable container from an earlier run. The labeled container was removed, and the clean integration rerun passed 249/249.

## Independent authorization and privacy review

A fresh whole-branch reviewer returned CLEAN after the final source/test corrections. The review inspected callback cookie preservation, same-origin completion POST validation, session-preservation policy, destination validation, account enumeration, identity mapping, invitation/member binding, claim/draft authority, and no-access paths. The reviewer also reran an 8-file focused suite: 50/50 passed in 14.06 seconds, and git diff --check passed.

The reviewed implementation preserves managed-auth Set-Cookie headers only through the exact clean callback handoff. Application authorization occurs through the same-origin completion POST. Invalid sessions clear credentials; provider and database failures preserve a valid session while returning recovery. Destinations and claim context are server-validated, and viewer or out-of-scope manager fixtures retain read-only evidence access while draft mutations remain denied.

## Browser evidence and live limits

The owned browser fixture covered Google-style start, single-use verifier handoff, processing, cancellation, mapping/binding/upstream/revoked failures, changed account, consumed email link, no-access, cross-origin completion rejection, membership binding, and the locale/viewport keyboard matrix. The final browser gates were 31/31 E2E and 38/38 acceptance. Six ignored screenshots were generated for en, zh-HK, and zh-TW at 375 and 1440 pixels; automated focus, Enter activation, status, navigation, and overflow assertions passed. Manual bitmap inspection remains blocked by the host ACL, so no visual conclusion relies on an uninspected image.

The hosted production failure is still only localized to the callback period after Google account selection. Existing production evidence does not distinguish verifier exchange, fresh-session lookup, identity mapping, invitation binding, workspace lookup, or claim resolution. The local diagnostic stages and fixture RED/GREEN coverage do not prove which hosted boundary failed or that a deployed fix resolves it. A future authorized step must verify the deployed SHA, collect only allowlisted stage/correlation evidence, and have the user complete the Google flow after account selection. Reaching the Google account picker is not completion evidence.

## Release status

Local verification is complete and independent review is clean. The branch remains not release-ready because hosted diagnostic/live Google and email verification has not been authorized or performed. This evidence record grants no deployment, provider, email, migration, or domain authority.
