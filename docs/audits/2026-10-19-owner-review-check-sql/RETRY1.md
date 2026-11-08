# Owner-check PostgreSQL fixture — second authorized attempt

Date: 2026-10-19, Asia/Hong_Kong. **Overall acceptance: BLOCKED / incomplete.**

This retains the second attempt's historical result. The subsequently approved
third fixture and final actual SQL/API acceptance are in [RETRY2.md](RETRY2.md).

The user explicitly authorized one additional PostgreSQL 16 container after the
first attempt was removed. That second container was created, passed the target
gate and existing migrations, then failed during the custom seed because the
test action omitted the mandatory `priority_score`. It was removed by the
then-current startup failure cleanup. No third container was created.

This was a test-harness omission, not evidence of a product owner-check failure.
The actual owner-check SQL/API cases still have no execution result. The 2/3
baseline was not established or measured.

## Current source

- Repository: `YNWAforever/smeassistant`.
- Branch: `codex/review-owner-check-20261019`.
- HEAD remains `838165393d7dafd6a5f3ac7302e6f571630e33b2`.
- Worktree: dedicated `smeassistant-local-seo-completed-state-20261018` checkout
  (personal workstation path omitted).
- Product source is unchanged against the previous 20-file feature manifest.
- Fixture/harness fixes and this report are uncommitted. No push, merge or
  deployment; no production UAT, Eldage, real Auth/Google or paid provider access.

## Actual execution and cleanup

Evidence directory: `test-results/owner-check-real-20261019-retry1/`.

| Item | Actual observation |
| --- | --- |
| Initial resource preflight | 3896 MiB free, below the preserved 4096 MiB gate; no container created |
| Gated launch | 4206 MiB free at `2026-10-19T10:18:43.293Z`; gate passed |
| Container ID | `25b661041b6b30907fd18d06c0094ae08dd1e136bd80f03cb58ec5ae72b09aab` |
| Name | `sme-neon-it-db-045929a5dcf2` |
| Database | `sme_neon_it_045929a5dcf2` |
| Actual server version | `160015` (PostgreSQL 16.15) |
| Image ID | `sha256:1a6ab3f5345eb6dbe04a1349529caabdb0ab09293a09590fad07b2246bfa4b54` |
| Isolation | `network=none`, no published ports, PGDATA 256 MiB tmpfs; independently checked before migration client |
| Startup | Existing migrations and local Next readiness completed before custom seed |
| Failure | `null value in column "priority_score" of relation "actions" violates not-null constraint` |
| Failure timestamp / host exit | `2026-10-19T10:19:20.029Z` / exit 1 |
| Cleanup | Exact container removed at `2026-10-19T10:19:22.396Z` |
| Independent cleanup readback | `2026-10-19T10:29:04.8400840Z`: target absent; all 18 original labelled containers retain ID/name/state |
| Product test calls | Zero owner-check operations and zero acceptance HTTP reads; the child acceptance runner was never started |

The read cap above refers to the prepared acceptance counter. Local startup
readiness probes are not a completed product/readback acceptance case.
`seed.json`, acceptance counters and successful case receipts were not produced.
No seed row-count or 2/3 usage receipt is claimed.

The original first attempt and its different parameter-inference error remain
in `REPORT.md` and `test-results/owner-check-real-20261019/`; neither was overwritten
by this attempt.

## Reproduction and smallest seed repair

Before changing the missing field, an offline test read the actual fixture INSERT
lists and compared them with the current authored Drizzle schema. It failed with:

```text
scripts/owner-check-isolated.ts: actions.priority_score
1 FAIL / 1 PASS, exit 1
```

The custom action INSERT now explicitly includes `priority_score=50`. No schema
default or product validation was relaxed. The test covers every INSERT in the
base seed, custom seed and this acceptance suite for known tables/columns and
NOT NULL columns that have no database default.

This schema test does not execute SQL or validate PostgreSQL values, enum/check
constraints, foreign keys or parameter inference. Its GREEN is separate from
the real SQL acceptance, which remains NOT_RUN.

## Avoid another disposable resource loss on custom seed errors

The custom seed is now in `test/integration/owner-check-seed.ts`, with its existing
single-connection transaction. The host generates fixed IDs once and records a
sanitized seed plan before custom writes.

`createOwnerCheckSeedSession` returns a failed attempt without disposing of the
owned environment. The host enters its command loop after such a failure:

- `seed` explicitly retries the custom seed in the **same** independently
  verified container, loading the repaired module with a fresh module identity.
- The two base merchants and fixed identifiers are retained; no replacement
  resource or automatic seed retry is created.
- Concurrent seed requests share one attempt; after a successful seed, another
  `seed` command reuses the receipt rather than inserting again.
- There are at most three custom seed attempts. Product `run` commands remain
  blocked until setup succeeds.
- `cleanup`, EOF or an unrecoverable host error retains exact-ID cleanup. Ending
  without any committed seed returns a nonzero host exit status.

These recovery changes have pure unit tests. Two actual local `tsx` imports with
distinct attempt URLs also returned different seed function identities without
invoking the seed or constructing database clients. That is an offline module
reload check, **not** proof of recovery against a running PostgreSQL fixture.

The previous `retry1` container was already gone before these changes. They do
not retroactively preserve it or authorize another resource.

## Final local checks

Exact commands, exit codes and timestamps are retained in
`corrected-gates.json`, `final-source-gates.json` and the associated logs.
Corepack network access was disabled.

| Command / check | Result |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run test/integration/owner-check-target.test.ts test/integration/neon-database.test.ts test/integration/owner-check-seed-contract.test.ts test/integration/owner-check-seed-session.test.ts --retry=0 --maxWorkers=1` | 25 PASS / 0 FAIL, four files, exit 0 |
| `corepack pnpm typecheck` | PASS, root and four workspace packages, exit 0 |
| `corepack pnpm lint` | Exit 0, 0 errors / 40 existing warnings |
| `node node_modules/eslint/bin/eslint.js scripts/owner-check-isolated.ts` | PASS, exit 0 |
| Offline module reload | Exports available and identities distinct; zero seed invocations / DB clients |
| `git diff --check` | Exit 0 |
| Previous feature source hashes | 20/20 unchanged; final harness hashes recorded separately |

Retained failed checks:

- `seed-contract-red.log`: 1 expected assertion FAIL / 1 PASS before the repair.
- `typecheck-final.log`: two errors from a too-narrow inferred schema-map key;
  repaired with `Map<string, PgTable>`. No runtime assertion was removed.
- `host-failure.json`: the actual PostgreSQL startup seed error.

The earlier feature's 213 related tests, six offline Chromium cases and safe
Webpack build were not rerun in this fixture round. Full unit, browser,
build/security-bundle and real hosted tests are NOT_RUN here; historical results
remain separately labelled.

## Actual feature acceptance still NOT_RUN

All ten prepared cases remain blocked before execution:

1. Runtime SQL save and fresh-connection receipt readback.
2. Untrusted SQL role refusal.
3. Concurrent identical HTTP commands and one durable receipt.
4. Conflicting compare-and-set commands.
5. Real row lock and rollback behavior.
6. Application membership/location permissions using synthetic identities.
7. Foreign workspace version/asset and forged verification flag refusal.
8. Fresh synthetic session, bilingual action readback and persisted 2/3 billing.
9. New draft rejects stale-tab submissions and inherited check state.
10. Historical correction/retraction without changing original approval,
    delivery, applied/completed state and usage invariants.

Real Auth/Google, real provider verification, production UAT, Safari and physical
devices were not used. Synthetic identity fixtures do not establish real Auth
or per-user PostgreSQL RLS acceptance.

## Pending permission

The latest one-container authorization is consumed and its exact resource was
removed. Another actual SQL run therefore needs explicit approval for **one**
further identical fixture; none has been launched. Proposed namespace: `retry2`.

Retain all limits: at most 60 fixed seed rows, 30 owner-check operations, 60
acceptance HTTP reads and 20 synthetic identity POSTs. The previous two startup
attempts used zero product acceptance calls. Recheck the 4 GiB resource gate,
exact container/image/labels/network/storage/database identity, then use this
one live target for explicit in-scope retries and final exact-ID cleanup.

No production UAT/Eldage, real Auth/Google, paid services, plan/quota changes,
secrets, authentication settings, push, merge, deployment or publishing.
