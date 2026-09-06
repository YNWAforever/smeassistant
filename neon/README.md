# Fresh application schema (Task 3 foundation)

The three SQL migrations create 34 final business tables and 2 application identity tables on an empty PostgreSQL database. They never replay legacy account backfills or create managed Auth/storage schemas. The independently captured original catalog and source SHA-256 manifest live in `test/integration/fixtures/`.

The owner runs `applyMigrations` from `scripts/neon/migrations.ts`. The runner takes a migration-only pool, locks a transaction, validates the entire applied prefix with SHA-256, and commits DDL and journal together. Never edit applied migration files. Append an ordered migration instead. `drizzle.config.ts` describes the typed schema for inspection; the SQL migrations own the function/grant behavior and journal.

Before an authorized deployment, an administrator must provision the `sme_app_runtime` NOLOGIN group with NOSUPERUSER, NOCREATEDB, NOCREATEROLE, and NOBYPASSRLS, then grant it to a separate restricted server login. The owner must not be that runtime login or its member. No role credentials are committed. Only the application server receives the runtime login: its existing application authorization controls workspace access. Explicit role-targeted RLS policies permit server DML; browser/end-user and unrelated roles have no policy. Runtime has no table ownership, schema creation, truncation, or migration-journal access.

Local verification always creates a new labeled loopback Docker fixture and ignores ambient database URLs:

```powershell
corepack pnpm exec tsx scripts/neon/verify-migrations.ts
$env:NEON_INTEGRATION='1'
corepack pnpm test:integration -- test/integration/neon-schema.integration.test.ts
```

Retained ordinary invariants: `delete_orphaned_workspace` / `workspace_members_cleanup_orphan` and `touch_actions_updated_at` / `actions_touch_updated_at`. The cleanup function now also has an empty search path; both remain invoker functions.

Task 4 must translate eleven functions: `approve_output_version`, `claim_audit_job`, `claim_workspace_completion`, `complete_report_unlock`, `consume_rate_limit`, `create_output_version`, `decide_output_version`, `export_output_version`, `fence_workspace_completion_write`, `finish_workspace_completion`, and `pending_workspace_completions`. Five dependent triggers are deferred with fencing: `completion_fence_measurements`, `completion_fence_actions`, `completion_fence_audits`, `completion_fence_snapshots`, and `completion_fence_notifications`.

Private storage metadata and paths are retained. Storage provider replacement is pending; this foundation is not a deployable replacement application or a storage/atomic-workflow completion claim.
