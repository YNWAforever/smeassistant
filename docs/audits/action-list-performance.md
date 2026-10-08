# T-12 / F-10 / UC-18 bounded action list evidence

Local disposable PostgreSQL only. No hosted migration, deployment or CI result is implied.

Default 25, maximum 50. The repository returns at most pageSize + 1 metadata rows, plus one aggregate counts row. Cursor order is priority score DESC, updated_at DESC, id DESC. Scope fingerprints include workspace, authorized locations, channel, explicit status, tab and actor/role. Changed scope rejects the old cursor. UTC timestamps preserve six PostgreSQL fractional digits. Filter and tab navigation clears the cursor; a refresh link restarts the list. Concurrent changes can move actions between pages; this is not a snapshot guarantee.

The home brief reads the same bounded projection while showing the full authorized open count. Action detail retains full history. Neither list nor counts selects output body/meta or run input/output/error. SQL phase membership is tested against the imported displayPhaseKey for lifecycle, approval, delivery, application and measurement combinations.

## Measured read cost

Fixture: each action has 10 versions (2 KB body plus 1 KB metadata) and 5 runs. Fixed synthetic data; owned postgres:16 container, network-none, Docker Desktop loopback relay. Bytes are JSON serialized result size, not wire traffic. Queries exclude authentication/context reads common to both paths.

| Actions | Before queries / rows / bytes | After queries / rows / bytes | After initial sample ms | Five warm samples ms |
| --- | --- | --- | --- | --- |
| 10 | 3 / 160 / 267,416 | 2 / 11 / 8,726 | 5.48 | 50.67, 4.12, 3.88, 48.02, 4.04 |
| 100 | 3 / 1,600 / 2,673,927 | 2 / 27 / 22,562 | 6.11 | 7.59, 50.10, 51.27, 6.95, 44.59 |
| 1,000 | 3 / 16,000 / 26,739,928 | 2 / 27 / 22,589 | 10.82 | 9.96, 48.99, 11.56, 10.26, 53.40 |

The first sample follows seeding and is not a cold-cache measurement. Five warm samples do not establish p95 or a hosted SLO. Counts necessarily aggregate the authorized dataset; returned data is bounded, not every database operation constant time.

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON), parameters and measurements are in remediation-evidence/T12-benchmark-final.jsonl. The pre-index run (T12-benchmark.jsonl) showed each latest-run lateral lookup filtering a workspace-wide bitmap heap scan; the 1,000-action warm samples were 805–1,551 ms. New migration 0015 adds composite latest-run, latest-version and action keyset indexes, with metadata INCLUDE columns. All existing migrations are unchanged. Both pre-index and indexed runs passed correctness; only disposable DB applied 0015.

## Verification and release prerequisites

- T12-red.txt: original list returned 31 rather than 25 and accepted invalid pagination (exit 1).
- T12-final-unit.txt: 4 files / 70 tests, exit 0. T12-typecheck.txt and T12-lint.txt: exit 0.
- T12-db-final.txt: 6 real DB tests, exit 0. Fixed tied tuples paginate without omission/duplication; counts stay stable; viewer, scoped manager, global actions and foreign tenants retain scope; full histories remain available in detail.
- T12-integration.txt preserves an intermediate failure from changing a loaded module during a run. Final verification was rerun with stable source.
- Hosted 0015 journal/checksum/readiness and deployment require identified target and explicit authorization. New CI and hosted acceptance have not run.

Rollback: revert the T-12 application commit. Existing bounded-list data needs no rewrite. Indexes may remain after application rollback; do not edit or delete an applied migration or journal. Any later index removal must be a separately authorized forward migration.

## Independent-review follow-up at efd51ca

The cursor decoder now rejects impossible calendar dates before PostgreSQL receives them. Three actual-import regressions first failed; two full decoder/list files then passed 68 tests. Valid leap days and the original microsecond timestamp string remain intact. The real scope integration also sends an otherwise scope-matching cursor with an impossible day.

The bounded page projection now includes the assigned accepted member's label, matched by both workspace and user ID. Pending/foreign membership cannot supply a label. No all-member map or history body was added; counts remain a separate aggregate query. The member index lookup executes for the bounded page: the 1,000-action EXPLAIN has 26 lookup loops.

Fresh owned-DB measurements, including the additional label field:

| Actions | Before queries / rows / bytes | After queries / rows / bytes | After initial sample ms |
| --- | --- | --- | --- |
| 10 | 3 / 160 / 267,416 | 2 / 11 / 8,936 | 6.96 |
| 100 | 3 / 1,600 / 2,673,927 | 2 / 27 / 23,108 | 15.32 |
| 1,000 | 3 / 16,000 / 26,739,928 | 2 / 27 / 23,133 | 37.33 |

Raw plans, parameters and warm samples are in `remediation-evidence/final-review-list-benchmark.jsonl`. These are synthetic serialized-result measurements, not hosted latency. The earlier measurements above remain historical evidence. The follow-up adds no migration; rollback is `git revert efd51ca1a68ba9f9d3c56ea726b008b97d400328`. Fresh full-gate results are recorded separately in `remediation-evidence/final-review-gates.jsonl`.
