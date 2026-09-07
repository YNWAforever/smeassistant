# Fresh application schema and atomic workflows

The four SQL migrations create 34 final business tables and 2 application identity tables on an empty PostgreSQL database. They never replay legacy account backfills or create managed Auth/storage schemas. The independently captured original catalog and source SHA-256 manifest live in `test/integration/fixtures/`.

The owner runs `applyMigrations` from `scripts/neon/migrations.ts`. The runner takes a migration-only pool, locks a transaction, validates the entire applied prefix with SHA-256, and commits DDL and journal together. Never edit applied migration files. Append an ordered migration instead. `drizzle.config.ts` describes the typed schema for inspection; the SQL migrations own the function/grant behavior and journal.

Before an authorized deployment, an administrator must provision the `sme_app_runtime` NOLOGIN group with NOSUPERUSER, NOCREATEDB, NOCREATEROLE, and NOBYPASSRLS, then grant it to a separate restricted server login. The owner must not be that runtime login or its member. No role credentials are committed. Only the application server receives the runtime login: its existing application authorization controls workspace access. Explicit role-targeted RLS policies permit server DML; browser/end-user and unrelated roles have no policy. Runtime has no table ownership, schema creation, truncation, or migration-journal access.

Local verification always creates a new labeled loopback Docker fixture and ignores ambient database URLs:

```powershell
corepack pnpm exec tsx scripts/neon/verify-migrations.ts
$env:NEON_INTEGRATION='1'
corepack pnpm test:integration -- test/integration/neon-schema.integration.test.ts
```

Retained ordinary invariants: `delete_orphaned_workspace` / `workspace_members_cleanup_orphan` and `touch_actions_updated_at` / `actions_touch_updated_at`. The cleanup function now also has an empty search path; both remain invoker functions.

Migration 0004 translates the eleven remaining final functions and five completion fence triggers. All thirteen application functions revoke PUBLIC execution and grant the runtime group explicitly. Former SECURITY DEFINER workflows now run as SECURITY INVOKER: the runtime login already has the required RLS-backed DML, so operations need no owner elevation. Nested fence triggers therefore see the actual inherited runtime login. The effective role guard uses pg_has_role(current_user, 'sme_app_runtime', 'USAGE'); comparing the login name with the NOLOGIN group would reject legitimate calls. All workflow search paths remain empty. Report-unlock hashing uses core PostgreSQL SHA-256 of UTF-8 bytes, preserving the original digest without the Supabase extensions schema.

The typed workflowRepository exposes the ten callable domain operations; the eleventh function is a trigger. Pass the PoolClient received by withCompletionContext(jobId, token, callback) into workflowRepository(client) for completion writes. The helper sets app.completion_job and app.completion_token transaction-locally on that exact client. Settings supply context only: the SQL still locks workspace before completion ledger and validates workspace, state, current lease/token, terminal job, location, measurement snapshot and newer-snapshot rules. No-context interactive writes retain their original behavior. Task 13 still owns completion orchestration.

Original SQL retry semantics remain intact. Concurrent same-key exports can raise PostgreSQL 23505 for the losing transaction; retrying after rollback returns the existing delivery and does not consume allowance again. Repository methods preserve SQL codes/messages and enforce scalar versus zero-or-one claim cardinality. Existing default arguments remain in SQL, including pending-workspace-completions' limit of five.

Private storage metadata and paths are retained. Storage provider replacement is pending; this slice is not a deployable replacement application or a storage-provider completion claim.
