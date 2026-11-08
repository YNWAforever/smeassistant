# Owner-check PostgreSQL 16 acceptance — retry2

Date: 2026-10-19, Asia/Hong_Kong.

The resource-blocked quality gates below are historical checkpoints. The final
same-source compiler/linter/safe-build cohort has now passed; see
[FINALIZATION.md](FINALIZATION.md). No fixture or SQL/API acceptance was rerun
for that finalization.

**Actual isolated product SQL/API acceptance: 10 PASS / 0 FAIL on the final run,
exit 0, retry 0.** Independent final READ ONLY SQL readback also passed.
The single authorized container was removed; all 18 pre-existing labelled
container IDs/names/states were independently confirmed unchanged.

This proves the isolated SQL/application-permission slice with synthetic
identities. It is not real Neon Auth/Google, production UAT, browser hydration,
Safari, physical-device, external Google verification or publishing acceptance.

## Source and authorization

- Repo: `YNWAforever/smeassistant`.
- Worktree: dedicated `smeassistant-local-seo-completed-state-20261018` checkout
  (personal workstation path omitted).
- Branch: `codex/review-owner-check-20261019`.
- Feature HEAD before these harness changes:
  `838165393d7dafd6a5f3ac7302e6f571630e33b2`.
- Published baseline supplied for the feature:
  `c72d991ea8ff72ae7b73e80747c58152fed251db`. No production query/deployment
  verification was performed in this round.
- The user authorized exactly one `retry2` PostgreSQL 16 fixture, reuse on seed
  failure, and cleanup of that resource only.
- Bounds: at most 60 fixed fixture rows, 30 owner-check operations, 60 acceptance
  HTTP reads and 20 synthetic identity POSTs. No ambient DATABASE_URL fallback,
  real Auth/Google/email, paid provider, production UAT/Eldage, publishing,
  rescanning, secret/configuration change, push, merge or deployment.

Evidence directory: `test-results/owner-check-real-20261019-retry2/`.
The earlier two failed fixtures remain separately recorded in `REPORT.md` and
`RETRY1.md`. They were not silently retried or replaced under their consumed
approvals.

## Exact owned target

| Item | Actual |
| --- | --- |
| Resource gate | 4109 MiB free, preserved minimum 4096 MiB |
| Container | `2f00541efdce967d89f61a33c2e0c3451d0488ed393e51a56eb358acc44eceb2` |
| Name | `sme-neon-it-db-5f55a3d522da` |
| Database | `sme_neon_it_5f55a3d522da` |
| Actual server version | `160015` (PostgreSQL 16.15) |
| Image | `sha256:1a6ab3f5345eb6dbe04a1349529caabdb0ab09293a09590fad07b2246bfa4b54` |
| Network/storage | `network=none`, no published ports, PGDATA tmpfs 256 MiB; owned loopback exec relay |
| Identity gate | Actual Docker identity/labels/image/network/storage and SQL database/version checked before migration client |
| Initial fixed seed | 47 rows, two synthetic workspaces, existing owner/manager/viewer identities |
| Later fixed fixture row | One V3 draft, total fixed business fixtures 48/60 |
| Seed quota baseline | `2026-10`, used 2 / allowance 3 |

Owner-check audit receipts are expected test outputs, not extra base merchants
or duplicate seed rows. No real export or billing transaction established the
synthetic delivery baseline.

## Retained failed run and local correction

Run 1 actually passed SQL save/readback and untrusted SQL role refusal, then
failed `concurrency-duplicate-http` with `synthetic_mail_missing`. Its counters
were 1 owner operation, 1 acceptance read and 1 synthetic sign-in POST.
`run-1.json` is authoritative; it is not counted as the final acceptance run.

Two harness issues were identified:

1. `mergeConfig` concatenated the root unit `include` patterns into this SQL
   config. A new regression first failed with the six unwanted root patterns,
   then passed after replacing `include` after shared option merging.
   The final SQL command selects exactly the one acceptance spec and has no
   container-creating global setup.
2. The seed bound membership `user_id` but omitted `accepted_at`. The real
   application mail-eligibility guard correctly matched neither a pending
   invitation nor an accepted membership and returned its uniform 200 outcome.
   This was not fixed by weakening that guard.

The same live container was independently rechecked before a tightly scoped
fixture transaction supplied `accepted_at` for its seven existing, already
bound synthetic principals. All seven were verified against synthetic
`auth_identities`; no identities, roles or rows were added. Usage was read before
and after and remained 2/3. `membership-fixture-repair.json` records this actual
SQL correction.

The authored custom seed now supplies these acceptance timestamps and checks
that exactly seven synthetic memberships satisfy the accepted identity state
before committing. Its new first-boot path was not run against a replacement
container; this final acceptance used the same repaired target. The real API
cases and independent SQL validate that repaired state. No replacement resource
was created to conceal the setup problem.

A pre-case observation of missing counters became stale while run 1 finished.
By the time the child-stop inventory ran, that child had exited; zero PIDs were
killed and the host/container stayed alive. The later `run-1.json` receipt,
rather than the earlier observation, supplies the actual case/call counts.

## Final actual SQL/API cases

Command inside the existing host:

```text
node node_modules/vitest/vitest.mjs run --config vitest.owner-check.config.ts --bail=1
```

Config: retry 0, one worker, file parallelism disabled, no global setup.
The child uses the private in-process owned-target descriptor; connection
strings, cookies, synthetic links and tokens are not written to evidence.

| Case | Final result / observation |
| --- | --- |
| `sql-runtime-and-receipt` | PASS: non-superuser/non-bypass runtime role saves, fresh SQL connection reads the exact version-bound receipt |
| `sql-untrusted-role-denied` | PASS: untrusted built-in SQL role gets `42501` |
| `concurrency-duplicate-http` | PASS: simultaneous identical requests return 201/200, same receipt ID, one matching audit row |
| `concurrency-conflicting-http` | PASS: same expected head gives one 201 and one 409 `stale_check` |
| `sql-row-lock-and-rollback` | PASS: real PostgreSQL Lock wait observed; invalid JSONB NUL fails with `22P05`, leaves no receipt and pool stays usable |
| `permissions-api-membership-and-location` | PASS: in-scope manager 201; out-of-scope manager/viewer/foreign owner 403; anonymous request refused |
| `permissions-foreign-version-and-evidence` | PASS: foreign version/asset refused; forged verified flag 400; wrong-workspace repository load returns no rows |
| `readback-fresh-synthetic-session-and-usage` | PASS: new synthetic session reads EN/zh-HK saved content and SQL-backed 2/3 billing |
| `version-new-draft-rejects-old-tab-and-inheritance` | PASS: V3 draft rejects stale V2-tab command and unapplied V3 check; no inherited application/check |
| `history-retraction-after-application-withdrawal` | PASS: append-only correction/retraction preserves the original main-action invariants |

Permission evidence is scoped precisely: the in-workspace manager/viewer pages
returned 200 under existing read rules while mutation permissions differed.
The foreign owner page returned 307 and did not include workspace A's saved reply.
This report does not claim out-of-scope same-workspace reads are denied, or that
the server application role proves per-user PostgreSQL RLS.

Final run receipt: `run-2.json`, `2026-10-19T12:36:23.707Z`.

| Cumulative counter, including run 1 | Actual / maximum |
| --- | --- |
| Owner-check operations (direct repository and HTTP) | 20 / 30 |
| Acceptance HTTP reads | 38 / 60 |
| Synthetic identity POSTs | 13 / 20 |

Local startup readiness probes and SQL metadata queries are not presented as
completed product readback cases.

## Independent final READ ONLY SQL

`final-independent-sql-readback.json`, `2026-10-19T12:39:15.907Z`, PASS:

- V2: version 2, approved, exported, approval timestamp present.
- Main action: completed with completion timestamp; one active V2
  `owner_asserted` application.
- V3: draft / not_requested; zero application and owner-check records.
- Two counted delivery rows; original three non-owner-check audit rows retained.
- Eight owner-check audit records across both runs and the explicit history case.
- Usage remains `2026-10`: **2/3**.
- Zero action runs and zero independently verified applications.

`invariants.json` has identical before/after SHA256:
`43e7756f1c85c490f951fb35cb8328731c04bbdbd2de0532d56f067653e43cc4`.
It covers original versions/approvals, both deliveries, original main action
application/completion, original audit, usage and zero runs/verified applications.
The separate historical fixture's explicit application withdrawal is expected;
it is not a reversal of the original main action.

## Cleanup

The same host received `cleanup` after the independent readback and exited 0.
`cleanup.json` records exact-ID removal. An independent Docker inventory at
`2026-10-19T12:41:23.3617944Z` confirms:

- Exact retry2 container absent.
- All 18 pre-existing labelled containers retain ID, name and state.
- No other fixture/container was created, started, stopped or removed by cleanup.
- The host also stopped its owned local Next/identity/LLM fixture processes and relay.

No authenticated session file, cookie/token export, real email or Google
interaction was created by this run.

## Initial code verification checkpoint

Local gates are separate from the ten actual SQL/API cases:

| Gate | Actual result and source boundary |
| --- | --- |
| `corepack pnpm test` | PASS / exit 0: 6,334 tests across root and four packages |
| Final five-file harness unit run, retry 0 / one worker | PASS: 26 tests after the last cosmetic config export cleanup |
| `corepack pnpm typecheck` | PASS / exit 0 before the cosmetic default-export cleanup |
| `corepack pnpm lint` | Exit 0: 0 errors / 41 warnings, including 40 existing warnings and one new anonymous-default-export warning |
| New export warning | Changed the anonymous object export to a named constant; the final 26 harness tests passed afterwards |
| Final exact-source typecheck/lint rerun | BLOCKED before process start: available memory below preserved 4 GiB gate |
| `corepack pnpm test:no-supabase` | PASS / exit 0 |
| `corepack pnpm test:no-self-service-claim` | PASS / exit 0 |
| Current safe Webpack / secret-boundary build | NOT_RUN / resource-blocked; the earlier feature's build remains historical |
| `git diff --check` | PASS |

Full unit groups: root 5,747; isolated safe-media 62; region 23; scoring 183;
contracts 20; scan-engine 299. The repository's existing unit retry setting was
unchanged; two root cases retried. This is not the retry-0 real SQL run.

The ten SQL cases and full unit gate preceded the final cosmetic config export
cleanup. No include/retry/worker/global-setup behavior changed in that cleanup;
the 26 final harness cases include the exact-config regression. The real
acceptance spec and product source are unchanged. This does not turn the
blocked final compiler/linter/build steps into a PASS.

At `2026-10-19T13:00:03.861Z`, independent resource readback was **2370 MiB**
available versus **4096 MiB** required. No unrelated process was stopped and no
threshold was lowered. The final gate attempt and resource blocker are retained
alongside the prior successful gate receipts.

Gate JSON/log files and `all-unit-summary.json` retain commands, timestamps,
exit codes and counts. The final source manifest records the feature and
harness hashes. **No new harness commit was made** while the final static/build
gates are resource-blocked; HEAD remains `8381653`. All unrelated user files
remain preserved.

### Subsequent finalization resource check

The user requested another resource check followed by the final compiler,
linter and safe Webpack gates, with a local commit only after all pass.
At `2026-10-19T13:08:49.551Z` free memory was 2264 MiB. After a bounded wait,
the second check at `2026-10-19T13:11:37.643Z` was 1549 MiB, still below the
preserved 4096 MiB gate. None of the three gates started and no commit was made.
No matching workspace Node processes were found in a read-only process
inventory; no unrelated processes were stopped. All 13 harness source files
still match the preceding source manifest and the Git index is empty.
Evidence: `test-results/owner-check-real-20261019-retry2/finalization/`.
No fixture, production connection, push, merge or deployment was performed.

## Remaining acceptance

NOT_RUN by scope: real Neon Auth/OTP/Google, hosted/production UAT, external
Google review comparison, independent verification from Google, actual Safari,
physical devices, production billing and external publishing.
No newly authenticated browser hydration/screenshots are claimed from the
APIRequestContext HTML reads. Earlier offline UI screenshots remain historical.

The first complete boot of the newly strengthened accepted-membership seed
also remains unverified from a new empty database. It needs a separately
authorized disposable target if requested; the current SQL/API outcome does not
require or authorize that additional resource.

The next smallest real UAT, only after separate approval, is one dedicated
merchant's already-applied saved review reply: open the verified Google anchor
by explicit user click, locate the exact review manually when no precise URL is
available, record one owner-check result, then reload it. It must remain an owner
statement with independent verification pending; no AI/export/publish/rescan.
