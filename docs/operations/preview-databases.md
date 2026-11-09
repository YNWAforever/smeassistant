# Preview databases (schema-only Neon branches)

Preview deployments must never read or write production business rows. This repo's preview strategy is:

- **One schema-only Neon branch per PR** (Beta), created from the `production` branch, with an expiry.
- Migrations are applied to that branch before the preview deploy uses it.
- The deploy's `DATABASE_URL` / `DATABASE_URL_UNPOOLED` point at the branch, and a verify step fails closed if they point at production.
- The branch is deleted when the PR closes or expires.

This is an operator workflow. The tooling in this repo only **plans** and **verifies**; it never creates a branch or touches hosted data. No preview branch has been created by this change.

## Plan a branch

```powershell
pnpm preview:db plan --pr 138 --slug studio-sharing
```

Output (JSON): branch name (`preview-pr-138-studio-sharing`), parent, `schemaOnly: true`, expiry, and the exact `neon branches create` / migration / cleanup commands.

Create it with the printed command (requires an authenticated Neon CLI):

```powershell
neon branches create --project-id <project-id> \
  --name preview-pr-138-studio-sharing \
  --parent production --schema-only \
  --expires-at <from-plan>
```

Schema-only branches are a Neon Beta feature and are independent root branches: they carry structure, not rows. If the preview needs realistic row volumes for a migration test, use a normal branch from an anonymized source instead — never production data.

## Apply migrations to the branch

Use the owner connection for the preview branch and the repository migration runner (same process as production migrations):

```powershell
neon connection-string preview-pr-138-studio-sharing --role-name neondb_owner --database-name neondb > $env:TEMP\preview-owner.txt
$env:DATABASE_URL = Get-Content $env:TEMP\preview-owner.txt -Raw
# run the repository's pending-migration runner; it refuses journal mismatches
```

Then verify the preview target:

```powershell
$env:PREVIEW_DATABASE_URL = "<preview branch pooled URL>"
$env:PRODUCTION_DATABASE_URL = "<production pooled URL>"
pnpm preview:db verify
```

`verify` parses both URLs, rejects the production endpoint, rejects a different database name, opens a READ ONLY session, and prints `{ isolated: true, previewHost, previewDatabase, productionHost, journalMaxOrdinal }`. It never prints URLs or credentials.

## Wire the preview deploy

Vercel's project has a single Preview environment shared by every preview branch, which cannot be pointed at a different Neon branch per PR by itself. Two supported shapes:

1. **Neon–Vercel integration preview branches** (preferred when available): let the integration create a branch per preview deployment and inject its `DATABASE_URL`; still use the schema-only/anonymized policy above and delete on close.
2. **Dedicated preview project**: a separate Vercel project whose Preview `DATABASE_URL` points at one staging schema-only branch refreshed from `production` on a schedule. Use this when per-PR environments are not available.

Until one of those is wired, preview deployments must not receive a production `DATABASE_URL`; leave the Preview DB variables unset and keep DB-backed preview checks on the isolated acceptance harness instead.

## CI

- The existing `verify` CI job runs `db:verify` against a disposable PostgreSQL fixture. That is the migration correctness gate; it does not use Neon branches.
- The `preview:db verify` step is for a preview environment's runtime configuration, run wherever that environment is built. It is read-only and needs only the two URLs.
- Do not put `PRODUCTION_DATABASE_URL` or branch credentials in a preview build.

## Cleanup

- Set `--expires-at` on every branch (plan default: 14 days, max 30).
- Delete on PR close with the plan's `cleanupCommand`, or let the expiry remove it.
- Run `neon branches list --project-id <project-id>` periodically; schema-only branches are root branches and do not share history.

## Verification

- `lib/operations/preview-databases.test.ts` covers slug/branch planning, expiry bounds, command shape, isolation pass/fail, and the read-only journal check.
- `scripts/neon/preview-branch.ts` is the CLI (`pnpm preview:db`), typechecked and linted.
