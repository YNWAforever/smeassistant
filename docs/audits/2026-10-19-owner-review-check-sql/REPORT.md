# Owner review check — isolated PostgreSQL acceptance checkpoint

Date: 2026-10-19 (Asia/Hong_Kong). This is a local acceptance checkpoint.

This file retains the initial fixture attempt. The separately authorized second
fixture and its subsequent local corrections are recorded in [RETRY1.md](RETRY1.md).
The approved third fixture completed the ten real SQL/API cases; see
[RETRY2.md](RETRY2.md) for its final acceptance and cleanup evidence.
The subsequently completed compiler/linter/safe-build gates are recorded
separately in [FINALIZATION.md](FINALIZATION.md).

**Overall: BLOCKED / incomplete.** The one approved PostgreSQL container was
created and independently verified, then removed after a startup seed failure.
The ten product SQL/API acceptance cases did not start. No second container was
created. The seed correction has static verification only.

## Source and scope

- Repository: `YNWAforever/smeassistant`.
- Worktree: dedicated `smeassistant-local-seo-completed-state-20261018` checkout
  (personal workstation path omitted).
- Branch: `codex/review-owner-check-20261019`.
- HEAD: `838165393d7dafd6a5f3ac7302e6f571630e33b2`.
- Published baseline previously reported: PR #91 merge
  `c72d991ea8ff72ae7b73e80747c58152fed251db`. No production query or deployment
  verification was performed during this database-testing round.
- All 20 files in the existing owner-check tested-source manifest match their
  previous hashes. Current differences are test infrastructure, not product
  behavior. The unrelated `.superpowers/sdd/` files are preserved.
- The current harness changes are uncommitted; no push, merge or deployment.

The approval permits one disposable PostgreSQL 16 fixture, fixed synthetic seed
of at most 60 rows, at most 30 owner-check operations and 60 HTTP reads. The
prepared harness additionally caps synthetic identity POSTs at 20. No real
Auth/Google, production UAT, Eldage, paid provider, AI, export, publishing,
rescanning or authentication-setting change is part of this execution.

## Actual fixture and cleanup evidence

Evidence: `test-results/owner-check-real-20261019/`.

| Item | Actual result |
| --- | --- |
| Container | `6c7452e386dfce7b4fa9319aae785003573317f87374e7fd0e0372262919818f` |
| Container name | `sme-neon-it-db-9ac8e8bc8000` |
| Database | `sme_neon_it_9ac8e8bc8000` |
| Server version | `160015` (PostgreSQL 16.15), queried inside the verified target |
| Image ID | `sha256:1a6ab3f5345eb6dbe04a1349529caabdb0ab09293a09590fad07b2246bfa4b54` |
| Isolation | `network=none`, no published ports, PGDATA tmpfs 256 MiB |
| Target gate | PASS before the migration client; actual ID, labels, image, database and loopback relay inspected |
| Setup | Existing migrations and local app startup reached; custom merchant seed failed before READY |
| Product acceptance | NOT_RUN; zero owner-check test operations or acceptance HTTP reads |
| Cleanup | Exact container removed at `2026-10-19T10:02:42.675Z` (18:02:42 HKT) |
| Other resources | All 18 previously existing labelled container IDs/names/states preserved |

`target-before-migrations.json` records the independent gate. `cleanup.json`
records exact removal and preservation. `creation-started.json` remains in place
to refuse a second creation under the initial run. The seed row count and 2/3
baseline were **not** successfully established or measured; no `seed.json`,
acceptance counters or successful case receipts were produced.

An independent read-only Docker inventory at `2026-10-19T10:15:04.1787574Z`
again confirmed the exact container absent and all 18 original labelled
containers unchanged. This is recorded in `cleanup-independent-readback.json`;
the readback created, started and removed zero resources.

## Failure and correction

The host reported:

```text
HOST_FAILED: inconsistent types deduced for parameter $1
```

The custom seed reused a parameter as an inferred UUID column value and as an
explicit text value (action dedupe key / existing asset storage reference).
Both seed statements now explicitly cast UUID positions, including the first
occurrence of `$1`, and retain the text conversion where needed.

Custom seed statements now execute on one checked-out connection in
BEGIN/COMMIT/ROLLBACK. The existing two base `seedMerchant` calls remain separate
setup steps. A seed failure still triggers exact fixture cleanup; the transaction
does not claim to preserve a running fixture or roll back those base calls.

The first host catch printed the failure but returned process exit code 0.
The harness now sets a nonzero exit status and writes a sanitized
`host-failure.json` on future failures. That new runtime error path has not been
executed against another container.

The original failure was observed during the initial execution, before this
checkpoint report was written; it is not a new reproduction or a copied raw
log artifact. A real SQL GREEN is pending. Typecheck and pure tests do not prove
PostgreSQL parameter inference or transaction behavior.

## Current static verification

Final harness evidence: `test-results/owner-check-real-static-final-20261019/`.
Corepack network access was explicitly disabled for typecheck/lint.
`source-final.json` records the uncommitted harness file hashes and HEAD.

| Command | Exit | Result / limits |
| --- | --- | --- |
| `node node_modules/vitest/vitest.mjs run test/integration/owner-check-target.test.ts test/integration/neon-database.test.ts --retry=0 --maxWorkers=1` | 0 | 20 PASS, 2 files; pure guards/mocked Docker, no actual DB |
| `corepack pnpm typecheck` | 0 | Root and all four workspace packages PASS |
| `corepack pnpm lint` | 0 | 0 errors, 40 existing warnings |
| `git diff --check` | 0 | Tracked diff whitespace check |
| SHA256 comparison with previous product manifest | 0 | 20/20 files unchanged |

Failed preliminary attempts are retained separately:

- Guard test collection in the filesystem sandbox failed with Vite temporary
  file `EPERM`; no test ran in that attempt. The same command outside the
  sandbox passed all 20 tests without retrying assertions.
- Sandboxed typecheck and lint could not access the cached pinned pnpm with
  Corepack network disabled. The same commands outside the sandbox used the
  existing cache, retained disabled network and exited 0.
- Earlier `owner-check-real-preflight-20261019/` checks preceded the final
  seed correction; they are not the final static cohort.

The earlier feature report's 213 related tests, six offline Chromium cases and
safe Webpack build remain historical feature evidence. They were not rerun or
promoted to real PostgreSQL/Auth/browser acceptance in this checkpoint.

## Product acceptance status

All cases below are **NOT_RUN**, blocked by startup seed failure:

1. Runtime-role SQL save and independent connection receipt readback.
2. Untrusted database role cannot access audit rows.
3. Concurrent identical HTTP submissions return one original receipt.
4. Concurrent conflicting commands enforce compare-and-set.
5. Actual row-lock waiting and rollback after rejected JSONB insertion.
6. Real API membership/location guards with synthetic owner/manager/viewer and
   foreign-workspace identities.
7. Foreign version/asset and forged independent-verification flag refusal.
8. Fresh synthetic session, EN/zh-HK action readback and SQL-backed 2/3 billing.
9. New draft rejects stale-tab submission and does not inherit the old check.
10. Append-only historical retraction after the applied claim is withdrawn,
    while original approval/delivery/completion/usage invariants stay unchanged.

Even after those pass, synthetic Auth is not real email/OTP/Google verification,
and an application runtime role is not proof of per-user PostgreSQL RLS.
Production UAT, real Google comparison, hosted Auth, Safari and physical devices
remain NOT_RUN.

## Concrete pending approval

One **additional** identical owned PostgreSQL 16 container is needed because the
sole authorized resource was already removed by safety cleanup. The proposed
evidence namespace is `retry1`; the original creation marker and evidence will
remain untouched. The namespace is not authorization and has not been launched.

Keep the same limits: at most 60 fixed seed rows, 30 owner-check operations,
60 acceptance HTTP reads and 20 synthetic identity POSTs. The initial attempt
used zero product acceptance calls. Recheck resources and exact target identity
before setup. Reuse the same live fixture for any in-scope targeted retry, then
remove only its verified exact container ID and relay.

No production UAT/Eldage, real Auth/Google, paid services, credentials, settings,
plan/production quota changes, push, merge, deployment or publishing is needed.
No new local commit is made while the requested real SQL acceptance is incomplete.
