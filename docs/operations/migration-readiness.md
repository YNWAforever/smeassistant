# T-19 / UC-24 — independent read-only readiness

Production remains at audit SHA d1cbc7bd8a2bc7989c774d15001f7971274bed8d. Local remediation adds 0015_action_list_indexes.sql after 0014; no older migration is edited. Local disposable verification is reported in the final gate ledger separately from production.

The Vercel read-only variable metadata identifies a production DATABASE_URL of type sensitive whose value/host/database cannot be retrieved. Production DATABASE_URL_UNPOOLED, NEON_READINESS_HOST and NEON_READINESS_DATABASE are absent from the returned metadata. The Neon connector requires an explicit project ID and the unscoped metadata call returns INVALID_ARGUMENT; no project-to-deployment DB binding is independently available. No hosted DB query or migration was attempted. No ambient .env/provider key was used in a fixture.

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
