# Owner check after applying a Google review reply

This is a local, bounded product slice. It extends the existing review-reply
action and verification panel; it does not continue the WebKit cold-compilation
investigation. The new code has not been pushed, merged or deployed.

## Baseline and scope

- Repository: `YNWAforever/smeassistant`.
- Worktree: `C:\Users\laich\Documents\smescanner\.worktrees\smeassistant-local-seo-completed-state-20261018`.
- Branch: `codex/review-owner-check-20261019`.
- Rechecked remote main and published baseline:
  `c72d991ea8ff72ae7b73e80747c58152fed251db`.
- Baseline tree: `88a38a2a5ac60267a3225cd2488a3a63b21f9724`.
- The previous branch's `2b6e056` tree equals that merge tree. A new local branch
  was created from the merge; no reset or replacement of old work occurred.
- The unrelated dirty outer `smescanner` checkout and existing untracked
  `.superpowers/sdd/` evidence remain untouched and outside this commit.
- This round made no production UAT/Eldage requests, database writes, real Auth
  requests, model calls, Google requests, rescan, publication or release action.

## Existing behavior and gaps

The app already had immutable saved versions, exact-version approval/export,
owner-applied claims, Completed views, scope checks, audit history and a scoped
independent-verification read model. Review replies correctly remained pending
when no source could verify their exact external reply.

The missing part was a version-bound owner check with explicit outcomes,
recorded notes/evidence references and a next step. There was no precise review
URL in the retained review model. The implementation does not infer one.

## Final behavior

1. The existing verification panel now offers a small owner-check section for
   an applied Google review-reply version, or to read retained check history.
   It shows the current merchant/branch identity and the saved reply. The owner
   must identify the review and confirm the business, review and reply before
   recording a positive check.
2. The business Maps reference comes from the action's authorized snapshot and
   the existing Google URL sanitizer. It is explicitly a business page, not an
   exact-review link. The UI says manual location is required. It uses a normal
   `noopener noreferrer` anchor: no background fetch, preview or Google action.
3. `checked`, `not_found`, `later` and explicit `retracted` entries append to
   existing `audit_events`; there is no new table or migration. Server recording
   time, member identity, action, version, prior check, note and optional existing
   approved-image reference are retained. No upload system was introduced.
4. All member checks remain `independent: false`, including screenshot
   references. Independent verification is still read through the existing
   source mechanism and is not inferred from the new audit event.
5. The next step changes with the owner outcome. A checked statement asks for
   independent confirmation; a mismatch asks the owner to locate/correct it;
   deferral does not create a schedule. A new draft never inherits an old
   version's check and cannot be checked as applied without its own application.
6. An action lock, latest-version token and per-version prior-record token fence
   stale submissions. A same-user request identity returns the original receipt
   only for the same command, before stale-token checks, so a response-lost retry
   does not append another event.
7. Corrections/retractions point to the prior check instead of updating it.
   History remains visible after the applied claim is withdrawn; retracting a
   historical check never reinstates that claim or completion.
8. Recent history is bounded to 100 rows plus each version's newest entry. Both
   queries scope workspace/action/location before the history limit. Audit bigint
   IDs remain exact decimal tokens; they are not rounded into JS numbers.
9. Saves show new-entry unsaved/saving/saved/error states. Failures retain inputs;
   a stale tab requires explicit reread. Double clicks share a pending guard and
   retry key. Scope/version changes remount the form, and late responses cannot
   refresh a different workspace.
10. The only new persistence mutation is an audit insert. The flow never creates
    versions, approvals, deliveries, applications, usage, scans or model runs.
    The existing owner/manager-in-location authorization and limiter are reused.

## Evidence layers

| Layer | Status and scope |
| --- | --- |
| Related unit/API/SSR/jsdom | PASS: 213 tests, 7 files, retry 0 |
| API authorization tests | Mock the existing authorization port; verify refusal before persistence and server-owned scope/actor |
| Repository tests | Offline PostgreSQL protocol double; exercise orchestration/CAS/append-only behavior, not a real SQL engine or locks |
| Offline Chromium | PASS: 6 tests, retry 0, 14.3s; real component/client/validator with a loopback memory HTTP port |
| Typecheck | PASS, root plus all four workspace packages |
| Lint | PASS, 0 errors and 40 existing warnings |
| SDK/ownership checks | PASS: no retired transport; self-service ownership claim remains disabled |
| Safe build | PASS, exit 0: Webpack plus 171 public artifacts; credential allowlist, synthetic DB/Auth sentinels and transport guard |
| Real PostgreSQL/API transaction/RLS | NOT_RUN, pending approval below |
| Real login/session readback | NOT_RUN; fresh offline browser context is not Auth acceptance |
| Real Google check / Safari / physical device | NOT_RUN |
| Production UAT / Eldage | Not accessed or changed this round |

The synthetic quota baseline is **2/3**. Unit protocol fixtures and offline
browser cases retain it before/after owner-check operations. This is not a new
production usage measurement, actual export, or real database accounting proof.

The browser fixture is visibly labelled **OFFLINE SYNTHETIC FIXTURE — no real
Auth / DB / Google**. It covers EN and zh-HK at 1440x900 and 390x844, saved-version
readback after reload and a fresh browser context, lost-response retry, stale-tab
correction and a new draft without inherited checks. No cookies are transferred.
The test fixture doubles HTTP only; real API contract validation and repository
orchestration are covered separately.

This browser configuration is an explicit local gate; no CI workflow was added
or run in this round. Independent read-only review found no remaining P1/P2
issues in the slice or its final label/ID delta. Review did not run services,
tests or external calls and does not close the real SQL/Auth acceptance gaps.

## Retained RED and failed attempts

- `red-panel.log`: missing owner-check section, 1 failing behavior test. The
  repository's default one retry was still active in this first run; later
  verification explicitly uses retry 0. The sandbox DNS attempt is separate.
- `red-contract.log` / `red-persistence-api.log`: new module/route absent during
  collection; not misreported as executed behavior assertions.
- `red-history-window.log`: 1 FAIL / 8 PASS when a version's newest receipt was
  buried outside the bounded window; repaired by scoped per-version head reads.
- `red-withdrawn-application.log`: 2 FAIL when historical checks could not be
  withdrawn after application withdrawal; repaired without changing completion.
- `red-next-step.log`: a checked owner statement still repeated the old Google
  check instruction; repaired while independent verification stays unknown.
- `focused-first.log`: 2 selector failures / 33 PASS because both current state
  and collapsed history intentionally carried the same label. Assertions were
  scoped to the current-state element; history is opened before visibility checks.
- `typecheck-first.log`: the initial UUID assumption for audit record IDs was
  incorrect. Reused bigint audit IDs as exact decimal tokens, including a
  precision regression. No schema change was made.
- `lint-first-failed.log`: 2 lint errors mistook Playwright's fixture callback
  named `use` for a React Hook. Renamed it `runFixture`; no rule suppression.
- `browser-first.log`: test collection failed on Node's deep TS import resolution;
  no browser case ran. The HTTP fixture now imports types only; product imports
  and the real browser validator remain unchanged.
- `browser-second.log`: 4 PASS / 2 FAIL; implicit textarea labels could not be
  resolved after retained input in retry/stale flows. Added explicit label/ID
  associations. `browser-guards.log` then passed both cases, unchanged assertions.

## Commands

The complete commands, exit codes and execution times are in `gates.json`,
`build-result.json` and `browser-result.json`.

```powershell
corepack pnpm exec vitest run lib/workspace/owner-review-check.test.ts lib/repositories/owner-review-check.test.ts 'app/api/actions/[actionId]/owner-check/route.test.ts' components/workspace/owner-review-check-panel.test.tsx components/workspace/action-detail-client.test.tsx lib/workspace/queries-pages.test.ts lib/report/sanitize-proof.test.ts --maxWorkers=1 --retry=0
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test:no-supabase
corepack pnpm test:no-self-service-claim
node test-results/webkit-reliability-20261019/run-build-boundary.cjs
corepack pnpm exec playwright test --config playwright.owner-check.config.ts --output test-results/owner-review-check-20261019/browser-final
git diff --check
```

The build runner's source is archived as `safe-build-runner.cjs.txt`. Browser
commands use the installed local Chromium and the existing transport guard.
No unrelated full WebKit investigation, hosted branch, real Auth fixture, paid
model, real email, real Google interaction or production rescan was run.

## Pending approval: real isolated database acceptance

No resource below has been created or written in this round.

- Target: one newly owned disposable PostgreSQL 16 Docker container created by
  `test/integration/neon-database.ts:startNeonDatabaseFixture("test")`.
  Name `sme-neon-it-db-<fresh-12-hex-id>`, database
  `sme_neon_it_<same-id>`, ownership/database labels verified against the actual
  returned container ID before clients, migrations or seeds. `network=none`,
  no published DB port; only the factory's owned loopback exec relay.
- Changes: apply the existing migrations inside that new container only.
  **No new migration/schema**, hosted Neon branch, expiry extension, production
  DATABASE_URL fallback or Auth-setting change.
- Fixtures: two synthetic workspaces with separate locations, owner/manager/viewer principals,
  a completed review action with saved V1/V2 and a second historical delivery
  to establish a real fixture `2/3` baseline. Foreign action/version/asset records
  belong to workspace B. Seed identifiers are fresh and recorded before writes.
  Synthetic verified-email states are not real email verification.
- Bound: at most 30 owner-check POSTs and 60 read requests; one fixed fixture seed
  of at most 60 rows. No generation/approval/export/copy/publish/rescan endpoints,
  real Auth, email, Google, model or paid API requests.
- Checks: actual SQL validity, transaction rollback, overlapping requests,
  workspace/location refusal, exact-version history, re-login via synthetic
  identity fixture separately labelled, and persisted usage/approval/delivery/
  completion before/after comparison.
- Cleanup: the factory verifies the exact owned ID and labels before removing
  its own container/relay. No blanket deletion, old-container cleanup or shared
  database truncate. Target identity failure stops before client construction.

Real Google/OTP session acceptance, a real Google reply comparison, actual Safari
and a physical phone need separate identities/targets and approval. None is
claimed from the offline emulation.

The local commit SHA is reported in the handoff. `tested-source.json` binds the
source files to the final verification cohort. No release is authorized here.
