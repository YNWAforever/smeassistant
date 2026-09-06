# Task 2 report: Connection boundary and PostgreSQL-only fixture infrastructure

Status: DONE

## Scope delivered

- Added pure validated database configuration with sanitized error codes and separate application/migration URLs.
- Added lazy shared `pg` pool, Vercel `attachDatabasePool` lifecycle registration, lazy Drizzle construction, and same-client transaction handling.
- Added an explicit `NEON_INTEGRATION=1` PostgreSQL-only Docker mode with a generated loopback URL and database, ownership labels, `NODE_ENV=test` fencing, and no process/hosted URL fallback.
- Preserved the default PostgREST harness. Default integration collection skips the opt-in Neon suite; Neon mode collects only `neon-*.integration.test.ts`.
- Pinned `pg@8.23.0`, `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `@types/pg@8.23.1`, `@vercel/functions@3.9.5`, and `@neondatabase/auth@0.5.0-beta`.
- Installed Auth SDK maturity is Beta. Verified package exports include `.`, `./types`, `./react`, `./react/ui`, `./react/ui/server`, `./react/adapters`, `./vanilla`, `./vanilla/adapters`, `./next`, `./next/server`, `./server`, and CSS exports. No Auth behavior was implemented.

## TDD evidence

RED 1:

`corepack pnpm exec vitest run lib/db/config.test.ts test/integration/neon-database.test.ts`

- Exit 1: both suites failed because `./config` and `./neon-database` did not exist.

GREEN 1:

- Same command: 2 files, 14/14 tests passed.
- Final split verification: `lib/db/config.test.ts` 8/8; fixture/global-setup focused set 18/18.

RED 2:

`$env:NEON_INTEGRATION='1'; corepack pnpm test:integration -- test/integration/neon-transaction.integration.test.ts`

- New PostgreSQL suite passed 2/2, but the command failed because the literal `--` caused two legacy PostgREST suites to be collected under the PG-only environment. Both failed on absent Supabase configuration.

GREEN 2:

- Explicit Neon mode was constrained to `test/integration/neon-*.integration.test.ts`.
- Exact requested command then passed: 1 file, 2/2 tests.
- It proved failed writes are invisible to a second borrower and transaction-local context is absent on the next borrower.

RED 3:

`corepack pnpm test:integration`

- New Neon suite was initially collected by default and failed with `database_configuration_missing` because default mode intentionally supplies only PostgREST/Supabase fixture configuration.

GREEN 3:

- Neon transaction suite now has an explicit `NEON_INTEGRATION=1` run condition.
- Default PostgREST harness: 2 files passed, 18/18 tests; Neon file skipped with 2 tests skipped.
- Explicit Neon harness: 1 file passed, 2/2 tests.

## Final verification

- `corepack pnpm exec vitest run lib/db/config.test.ts`: 1 file, 8/8 passed.
- Related harness unit set: 4 files, 16/16 passed; final config/fixture/global-setup subset: 3 files, 18/18 passed.
- `$env:NEON_INTEGRATION='1'; corepack pnpm test:integration -- test/integration/neon-transaction.integration.test.ts`: 1 file, 2/2 passed against a generated owned loopback PostgreSQL container; no hosted connection.
- `corepack pnpm test:integration`: 2 files passed, 18/18 tests; Neon suite skipped (2 tests).
- `corepack pnpm typecheck`: passed for the app and all four workspace packages.
- `corepack pnpm exec vitest run tests/neon-inventory.test.ts`: 1 file, 11/11 passed.
- `node scripts/neon/check-inventory.mjs`: passed after staging and again post-commit; all tracked consumers and SQL objects owned.
- `git diff --cached --check`: passed before commit; line-ending notices only during staging.

## Commit

- `d578739` — `feat: add isolated PostgreSQL data boundary`.

## Notes

- pnpm reported existing peer-range warnings, including the Beta Auth UI dependency graph and the repository's Vitest/coverage version drift. Typechecking and all Task 2 focused/default integration gates passed.
- No schema, Auth behavior, product persistence, cloud provisioning, hosted secrets, provider calls, email, deployment, or production changes were made.

Controller full gate at d578739: corepack pnpm test exit0; app1623+safe-media62+region23+scoring183+contracts20+engine276 =2187 passed. Existing baseline Vite native-loader warnings unchanged (baseline and current Vitest4.1.11). Log task-2-full-test.log. Two content-identical snapshot line-ending changes verified empty diff and restored.

## Review-fix verification

Fix commit: `c2bb445` (`fix: harden PostgreSQL transaction cleanup`).

Scope:

- Preserved the exported `withTransaction` signature and same-client contract while retaining the primary BEGIN/callback/COMMIT error, nesting rollback cleanup, and destroying the checked-out client with `release(true)` if rollback fails.
- Cleanup now captures the exact container ID returned by `docker run`, inspects the actual named container immediately before deletion, verifies its ID plus ownership/database labels, and removes by verified ID. Missing or mismatched live identity refuses deletion.
- The rollback integration test holds an observer checkout across the failed transaction and asserts distinct PostgreSQL backend PIDs. The context test asserts that the next borrower reuses the transaction backend before proving transaction-local context is absent.

RED:

`corepack pnpm exec vitest run lib/db/config.test.ts lib/db/transaction.test.ts test/integration/neon-database.test.ts`

- Exit 1: 2 files failed, 1 passed; 5 tests failed and 15 passed. Rollback failure replaced the callback error, and the four new live-container identity cases failed because the verifier did not exist.

GREEN and final evidence:

- Same focused command: 3 files, 20/20 tests passed.
- `corepack pnpm exec vitest run lib/db/config.test.ts`: 1 file, 8/8 passed.
- `corepack pnpm exec vitest run test/integration/neon-database.test.ts test/integration/global-setup.test.ts`: 2 files, 14/14 passed.
- `$env:NEON_INTEGRATION='1'; corepack pnpm test:integration -- test/integration/neon-transaction.integration.test.ts`: 1 file, 2/2 passed against a generated, owned loopback PostgreSQL container; the fixture was removed and no owned containers remained.
- `corepack pnpm typecheck`: passed for the app and all four workspace packages.
- `corepack pnpm exec vitest run tests/neon-inventory.test.ts`: 1 file, 11/11 passed.
- `node scripts/neon/check-inventory.mjs`: passed; all tracked consumers and migration objects are owned.
- `git diff --check`: passed before the fix commit.

The controller-provided full unit gate at `d578739` remains 2,187/2,187 passed and was not repeated because these changes are covered by the focused transaction/fixture tests and the task explicitly prohibited repeating it without a concrete need.
