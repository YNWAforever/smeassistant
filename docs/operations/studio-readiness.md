# Studio readiness preflight

The repository's existing read-only readiness check (`pnpm neon:readiness`) also covers the Conversation Studio schema: it reads the Drizzle schema (including `studio_conversations`, `studio_messages`, `studio_conversation_members`) and verifies every declared table and column exists, the journal names and SHA-256 checksums match `neon/migrations`, and the runtime role is not an owner/superuser/bypassrls role.

## Required environment (server-only operator process)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | pooled runtime URL; checked independently for role/privileges |
| `DATABASE_URL_UNPOOLED` | same branch, direct admin URL; used read-only for journal/catalog checks |
| `NEON_READINESS_HOST` | explicit expected endpoint host (nonsecret) |
| `NEON_READINESS_DATABASE` | explicit expected database name (`neondb`) |
| `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `APP_ORIGIN`, `NEXT_PUBLIC_SITE_URL` | configuration checks (Auth endpoint, cookie secret length, canonical origin) |

Do not put `DATABASE_URL_UNPOOLED` in the web runtime or any preview environment. Readiness runs in a separate read-only process.

## Command

```powershell
pnpm neon:readiness
```

Output is one sanitized JSON object (`{ status: "ready" | "not_ready", category, target }`). It never prints URLs, credentials, SQL errors or row data. Exit code 0 only on `ready`; non-zero otherwise.

## What it proves, and what it does not

Proves:

- configuration is complete and the expected host/database match both URLs;
- the journal is exactly `neon/migrations` with matching checksums;
- every Drizzle-declared table/column exists (including the Studio/0022 member table);
- the runtime role belongs to `sme_app_runtime`, has schema usage, lacks owner/superuser/bypassrls membership, and has the expected table/column privileges (append-only tables included);
- `output_versions.first_published_at` exists.

Does not prove:

- that a hosted deployment uses that exact binding (check the Vercel Production `DATABASE_URL` identity separately);
- Auth delivery, mail delivery, provider response or LLM output;
- row-level data or business behavior. Those are hosted acceptance items.

## Current hosted status (2026-11-09)

Production now has journal **22**: `0022_studio_conversation_members.sql` was applied through `docs/implementation/owner-platform-v1/rollout/apply-0022.sql` after `neondb_owner` granted `REFERENCES ON public.studio_conversations TO smeassistant_migrator`. `CONVERSATION_STUDIO_ENABLED=true` is set in Vercel Production and the app was redeployed; a signed-out `/api/studio/conversations` request now returns **401 unauthenticated** instead of the flag-off 404, and the owner route redirects to sign-in.

`pnpm neon:readiness` **was executed against production on 2026-11-10 and returned `status: ready`** (journal, schema, runtime role and privileges all passed; see `CONVERSATION-STUDIO-PRODUCTION-EVIDENCE.md`). The Vercel `DATABASE_URL` remains a sensitive secret the CLI returns empty, so the run used a temporary least-privilege login role inheriting `sme_app_runtime`; it was dropped immediately and no secret or runtime binding changed. The migration was independently verified structurally: journal 22/checksum through the prepared statement, RLS true, one policy, two indexes, expected FKs/role check, `sme_app_runtime` DML, and `check-missing-columns.sql` returned 0 rows. This is schema/configuration readiness, not a hosted Auth delivery test.
