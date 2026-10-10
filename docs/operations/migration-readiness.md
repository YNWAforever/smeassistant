# T-19 / UC-24 — independent read-only readiness

Production remains at audit SHA d1cbc7bd8a2bc7989c774d15001f7971274bed8d. Local remediation adds 0015_action_list_indexes.sql after 0014; no older migration is edited. Local disposable verification is reported in the final gate ledger separately from production.

At the initial preparation checkpoint, Vercel read-only variable metadata identified a production DATABASE_URL of type sensitive whose value/host/database could not be retrieved. Production DATABASE_URL_UNPOOLED, NEON_READINESS_HOST and NEON_READINESS_DATABASE were absent from the returned metadata. The unscoped Neon connector call required an explicit project ID and returned INVALID_ARGUMENT. No hosted DB query or migration was attempted. No ambient .env/provider key was used in a fixture. The later candidate metadata below narrows that discovery gap, while production binding remains unconfirmed.

Continuation at 2026-10-07 12:12 UTC: the installed, already-authenticated Neon CLI resolved a named candidate in organisation org-soft-sunset-25251479: project morning-hill-92255530 (Smeassistant), primary/default branch br-wandering-field-azdc91yj (production), endpoint ep-tiny-forest-azzm8bni, host ep-tiny-forest-azzm8bni.c-3.ap-southeast-1.aws.neon.tech, database neondb. These are provider identity metadata; the Vercel production DATABASE_URL binding remains unconfirmed. The owner name neondb_owner is not evidence of the application's runtime role. No SQL was sent to this candidate.

The Vercel connector env-list identity now returns 403; the same authorised metadata read succeeded with the existing CLI identity, using decrypt=false. DATABASE_URL remains sensitive with configurationId null. The connector-project list returns 404, which does not prove that no DB integration exists. Production alias still resolves to dpl_ARepQExFa36hUt1PzYcCzW4ECzCE / audit SHA. [Sanitised continuation evidence](../audits/remediation-evidence/T19-T21-continuation-target-metadata.json) preserves the access results and the unsuccessful Windows argument/implicit organisation attempts without environment values.

The next required input is confirmation that this exact project/branch/host/database is the deployed application's DATABASE_URL target, plus the configured application-role connection and independent read-only readiness access. Project-name similarity or the provider's default branch alone does not establish that binding. Stop before SQL until it is confirmed.

A further read-only check at 2026-10-07 12:53 UTC matched the project's current production-scoped NEON_AUTH_BASE_URL hostname and database path to this candidate's Better Auth metadata. This establishes an Auth configuration association, not the deployment's frozen environment, DATABASE_URL target, application DB role or a hosted login test. [Auth-association evidence](../audits/remediation-evidence/T19-auth-association.json) contains only safe metadata; the single configuration value was processed in memory and never written/displayed, and DATABASE_URL was not requested. All standard .env/context files in the correct repo/worktree and the four process DB/readiness inputs are absent. The production DB binding/read-only-role question remains pending; no SQL was sent.

Provide an explicitly identified host/database, application-role connection and appropriate separate direct read-only metadata access through the secret manager; never paste connection strings into this report. Record project/branch/endpoint IDs and their binding to the deployed production project. Canonical APP_ORIGIN and NEXT_PUBLIC_SITE_URL must match. Readiness also requires NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET through the current CLI's protected environment; these are configuration inputs, not an authorization to contact Auth or send mail.

Run `pnpm neon:readiness` only with the explicit NEON_READINESS_HOST / NEON_READINESS_DATABASE assertion and the intended deployed checkout. The current script opens READ ONLY transactions, verifies current_database, every committed migration name/order/checksum, required tables/functions, the actual first_published_at timestamptz catalog entry and the independent application's runtime privileges. It does not perform a full business-row/catalog parity sweep against production. Capture exit code and the safe JSON category/target. It does not apply migrations or prove hosted authentication.

Read-only checklist:

- Map production alias → deployment id → exact SHA → intended DB host/database/branch. Stop on ambiguity.
- Export journal ordinal/name/checksum for 0001–0014 at the current hosted baseline. Before releasing this branch, include 0015. Compare SHA256 to exact committed SQL; preserve originals.
- Check output_versions.first_published_at exists, the schema/catalog matches, and the runtime role is neither owner nor bypass/superuser. Check privileges on the actual application connection independently.
- Treat a missing/mismatched journal, checksum, column or unsafe role as a release blocker. Propose the exact next migration and disposable evidence; do not apply, fake history or alter old SQL.
- Record returned host/database only, never passwords, URLs, Auth cookies or provider keys. The empty hosted journal section is "not observed", not "zero migrations".

Publishing flag-off does not remove the measurement dependency on 0014. The permanent pre-0014 fixture imports measurementRepository and must observe PostgreSQL undefined-column failure, while the fully migrated fixture must read first_published_at successfully with publishing off. Sequential review also reproduced readiness falsely returning ready after renaming that column while retaining every journal checksum. The CLI now checks the real catalog without DDL or business-row reads; the fixture restores the column and verifies recovery. Existing comparable-rescan tests verify missing metrics remain Unknown and do not establish revenue causation.

Rollback: this stage is read-only. For 0015, prefer reverting the application code while retaining harmless indexes; any later index removal is a separate authorized migration after EXPLAIN evidence. No production migration rollback has been run or authorized.

## 2026-10-09 — production binding confirmed; 0009–0014 applied (F-16)

**Symptom.** From the P4.1 release (#28, 2026-10-02) every owner-home render failed (`actions lookup failed`). After #45 added SQLSTATE logging and `69750c6` was deployed (`dpl_C2AK7xgGE8Pu8G4kySBWoDeyEDRh`), the log named it: `read: 'action list', code: '42703'` (undefined column, `actions.offer_id` from 0011).

**Binding.** Willy compared the compute endpoint in Vercel's Production `DATABASE_URL` with the Neon console. The first two databases he checked were **not** the production target. The production target is database `neondb` on the endpoint that matches `DATABASE_URL`.

| Field | Value |
|---|---|
| Neon project / branch / endpoint id | _to be recorded by the owner_ (match against `DATABASE_URL`; never paste the URL) |
| Database | `neondb` |
| Journal before | 0001–0008, every name and checksum equal to the committed files |
| Drift found | `scan_attempts` (0009) already existed, owned by `smeassistant_migrator`, with no journal row 9 |
| Missing before | 69 application columns from 0010–0014 (`docs/operations/check-missing-columns.sql`) |
| Applied | `rollout/apply-0009.sql` … `apply-0014.sql`, in order, by Willy in the Neon SQL Editor as `neondb_owner`, 2026-10-09 (~07:30 UTC) |
| After | Owner home renders on production; no `read failed` / `42703` in the deployment's logs |
| Post-apply check | `check-missing-columns.sql`: 0 rows (no application column missing); journal max ordinal 14 (owner-reported, 2026-10-09) |
| Still missing | 0015 (indexes only; the code does not depend on it). Rollout statement `rollout/apply-0015.sql` added 2026-10-10, rehearsed locally; **not applied** to any hosted database |

**Pre-apply evidence (local, disposable PostgreSQL 16 only).** The six statements were checked against `HEAD`: each requires exactly the previous journal (names and sha256), inserts the right row, and embeds its migration byte for byte. A rehearsal from a 0008 journal applied all six, reached journal 1–14 with 0 missing columns and matched a database migrated straight to 0014 on all 7 `catalogQueries`; a re-run of `apply-0011` was refused. With `scan_attempts` pre-created by the migrator, `apply-0009` succeeded; pre-created by `neondb_owner`, it refused ("must be owner") and rolled back.

**Other databases.** The two earlier attempts ran on databases that production does not use; one of them now has journal 1–14. Nothing was rolled back there. Record which branches they are before reusing them.

**Operator rule from now on**, for any rollout statement:

1. Match the Neon compute endpoint id and database name to Vercel's Production `DATABASE_URL`. Stop on any doubt.
2. Read-only: `SELECT ordinal, name FROM neon_migrations.journal ORDER BY ordinal;` and run `docs/operations/check-missing-columns.sql`.
3. Apply the `rollout/apply-00NN.sql` statements in order from the first missing ordinal. Each one refuses (and rolls back) if the journal is not exactly what it expects; a refusal or "must be owner" means stop and investigate, never edit the journal.
4. Re-run `check-missing-columns.sql`: 0 rows. Then check the owner home and the deployment logs.

`check-missing-columns.sql` is generated from `lib/db/schema` by `corepack pnpm db:missing-columns-sql`; `tests/missing-columns-sql.test.ts` fails if it falls out of date. `pnpm neon:readiness` performs the same column check (since #45) when credentials are available.
