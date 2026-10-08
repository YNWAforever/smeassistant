# T-19 / UC-24 — PostgreSQL 18 catalog verification

The retained PostgreSQL 16 legacy catalog contains column nullability but no table NOT NULL rows in pg_constraint. PostgreSQL 18 also records these as type n ([official catalog definition](https://www.postgresql.org/docs/18/catalog-pg-constraint.html)). The original verifier rejected an otherwise matching freshly migrated PostgreSQL 18 database.

The verifier now validates every additional NOT NULL row against the complete public pg_attribute non-null column list before comparing the legacy constraint representation. Each row must be validated, enforced and single-column; missing, duplicate or mismatched mappings fail. Business column nullability, types and defaults remain exact. Foreign-key deletion semantics, other constraints, indexes, RLS, function security/search paths, grants and empty-fixture checks retain their existing comparisons. PostgreSQL 16 keeps its original representation.

Permanent tests import verifyCatalog. The new metadata regression first failed for the original constraints comparison (1 failed / 9 passed); after the repair, all 10 cases passed. The owned integration test additionally drops a business NOT NULL requirement, checks rejection, restores it and checks recovery. The complete integration gate passed 52 files / 566 tests; the full unit command passed 5,362 tests.

An independent fresh network-none PostgreSQL 18.6 fixture called the original verifyCatalog directly, without a query adapter. RED reproduced the type-n mismatch. GREEN validated 279 public NOT NULL catalog rows, 204 comparable business constraints, all 15 immutable migrations and empty replay. Both fixtures were destroyed and their absence independently checked. These counts describe synthetic disposable catalog metadata, not hosted application evidence.

No committed migration, dependency, auth boundary, application feature, workflow gate or deployment hold changes in this follow-up. Shared database readiness, hosted acceptance, deployment and operational enablement are separate gates. Revert this verifier/test documentation batch to roll back the code; no shared database write or schema rollback accompanies it.

The final local gate record binds each original CI-order command and exit code to the verified source fingerprints in remediation-evidence/T19-pg18-verifier-gates.json. Remote CI, if executed, must separately bind its actual checkout and candidate SHA.
