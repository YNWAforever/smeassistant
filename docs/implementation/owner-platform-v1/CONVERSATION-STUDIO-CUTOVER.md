# Conversation Studio — hosted cut-over runbook

**Status:** PREPARED, NOT EXECUTED. Nothing in this runbook has been applied to a hosted database or deployed from this workspace. Hosted branch/target confirmation and the production migration remain owner actions.

Design: `docs/superpowers/specs/2026-11-08-conversation-studio-design.md`. Implementation record: `CONVERSATION-STUDIO-REPORT.md`. Feature flag: `CONVERSATION_STUDIO_ENABLED` (exactly `true`).

## 0. What ships

- Migration `0019_studio_conversations.sql`: two additive tables (`studio_conversations`, `studio_messages`), RLS + runtime policies. No existing table, column, function, policy or grant is changed.
- Application code behind `CONVERSATION_STUDIO_ENABLED`: the `/studio` surface, its three `text/event-stream`/JSON routes, and the owner nav/root redirect. With the flag off, all of it is `404` and the shell is unchanged.
- No new secret. The Studio uses the existing LLM gateway variables (`OPENCODE_API_KEY` / `LLM_API_KEY` / `OPENROUTER_KEY`, optional `LLM_BASE_URL`, `LLM_MODEL`).

## 1. Pre-flight (owner, read-only)

1. Confirm the deployed application's `DATABASE_URL` target: Neon project, branch, endpoint host and database. Record the provider IDs (never the connection string). The deployment's production target is the only allowed target.
2. Read the hosted journal and confirm it is **exactly 1–18** with the committed names and checksums:
   ```sql
   SELECT ordinal, name, checksum FROM neon_migrations.journal ORDER BY ordinal;
   ```
   - If it is 1–17, `0018_content_version_retry_boundaries.sql` (pre-existing, no rollout file) must be applied first through the owner-runner process; `apply-0019.sql` deliberately refuses in that state.
   - Any missing/extra/mismatched row is a release blocker; do not fake history.
3. Confirm the runtime role is not the owner/superuser and that `sme_app_runtime` exists with the expected privileges. `neon:readiness` on the intended checkout and explicit host/database is the supported read-only check:
   ```
   NEON_READINESS_HOST=<endpoint host> NEON_READINESS_DATABASE=<database> corepack pnpm neon:readiness
   ```
4. Confirm the deployed LLM gateway is configured and funded; the Studio answers from it. AI pause/budget gates still apply.

## 2. Local quality gates (before any hosted action)

```powershell
corepack pnpm db:verify                     # owned disposable PostgreSQL: 0001-0019 apply + replay + exact catalog
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test                          # unit/component
corepack pnpm test:integration              # Docker fixtures, includes studio persistence
corepack pnpm build
corepack pnpm test:secret-boundary
corepack pnpm smoke:studio                  # SKIPPED when no LLM key; run with real gateway vars
```
Expected `db:verify` result: `applied` ends with `0019_studio_conversations.sql`, `replay: []`, `tables 44`, `columns 522`, `constraints 228`, `indexes 119`, `seededRows 0`. Expected Studio e2e (opt-in):
```powershell
$env:CONVERSATION_STUDIO_ENABLED="true"; corepack pnpm e2e:acceptance -- e2e/acceptance/conversation-studio.spec.ts
```

## 3. Apply the migration

Run `docs/implementation/owner-platform-v1/rollout/apply-0019.sql` in the Neon SQL Editor as the migration owner (`neondb_owner`, which must hold `smeassistant_migrator` with SET TRUE), on a Neon **test branch of production first**, then production. The statement is one DO block: it takes the runner advisory lock, verifies journal 1–18 by name+SHA-256, executes the 0019 text byte for byte, checks tables/RLS/indexes/FK delete rules/policies/grants, and records journal row 19. Any failure rolls back the whole statement.

Alternatively, the owner-runner process (`scripts/neon/migrations.ts`) may apply it; it validates the same journal prefix with the same checksums.

Post-apply verification (read-only):

```sql
SELECT max(ordinal) AS last_migration FROM neon_migrations.journal;                -- 19
SELECT relname, relrowsecurity FROM pg_class
 WHERE relname IN ('studio_conversations','studio_messages');                       -- both, RLS true
SELECT count(*) FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('studio_conversations','studio_messages'); -- 2
-- paste docs/operations/check-missing-columns.sql -- 0 rows
```

## 4. Deploy the code (flag off)

1. Deploy the reviewed commit with `CONVERSATION_STUDIO_ENABLED` unset.
2. Confirm the flag-off contract: `/zh-HK/owner/<slug>/studio` answers `404`, `/api/studio/conversations` answers `404` before auth/SQL, the owner nav is unchanged, and the root still renders the Today brief.
3. Confirm no `studio`-table SQL is issued in logs while the flag is off (`test/integration/neon-assistant-flag-off`-style proof is local only; use the deployment logs as the hosted check).

## 5. Enable the Studio

1. Set `CONVERSATION_STUDIO_ENABLED=true` in the production environment and redeploy (env changes take effect on the next deployment).
2. Run the gateway smoke with the production LLM variables from a trusted machine (read-only; no database access):
   ```
   corepack pnpm smoke:studio
   ```
   Expected: `ok: true`, `streamUsedDeltas: true`, `deltasMatchText: true`. A failure means the deployed gateway rejects the Studio call shape; unset the flag and roll back.

## 6. Hosted acceptance checklist (signed-in owner)

Capture for each item: URL, locale, screenshot or response body, and the expected DB/audit evidence.

| # | Check | Expected |
|---|---|---|
| 1 | Open `/en/owner/<slug>` | Redirects to `/studio` (or `?location=` preserved) |
| 2 | First nav item / top bar | “Studio” is first and current; top bar shows “Open Studio” |
| 3 | Home tab | Goes to `/today`; Today brief still renders |
| 4 | Empty state | Question, boundary sentence, starter chips; no task cards/forms |
| 5 | Send a starter | User turn appears, status stages move, streamed answer completes |
| 6 | Reload | URL keeps `?chat=<id>`; rail lists the conversation; history restored |
| 7 | Second device/session | Same member sees the conversation; another member does not (404 on foreign id) |
| 8 | Evidence | Answer carries source/observed chips when the briefing has evidence |
| 9 | Draft | Asking for a reply produces an inline draft artifact; only “Save as a version” + review link, never approve/export/publish |
| 10 | Version | Save-as-version lands on the existing action page with that version selected; approval/export stay there |
| 11 | Audit | One `assistant.run` row per turn with conversation entity id, intent and turn kind; no message text |
| 12 | Abuse/limits | 60 turns/h/user; a second concurrent turn gets 409 `conversation_busy`; AI pause/budget return the localized states |
| 13 | Locales | zh-HK, zh-TW, en all render; interface language does not change market |
| 14 | Mobile | 390px: rail/context drawers, composer above the mobile nav, no horizontal scroll |

Evidence queries (replace the workspace id):

```sql
SELECT count(*) FROM studio_conversations WHERE workspace_id = '<uuid>';
SELECT count(*) FROM studio_messages m JOIN studio_conversations c ON c.id=m.conversation_id
 WHERE c.workspace_id = '<uuid>';
SELECT actor_type, event, entity_type, payload
  FROM audit_events
 WHERE workspace_id = '<uuid>' AND event = 'assistant.run'
 ORDER BY created_at DESC LIMIT 5;                 -- payload has no message text
```

## 7. Rollback

1. Unset `CONVERSATION_STUDIO_ENABLED` and redeploy (or promote the previous deployment). The nav/root/page/API disappear; the rest of the owner app is untouched.
2. Keep the two tables: no other feature reads them, and keeping them preserves the audit trail. Dropping them is a separate deliberate migration after an owner decision.
3. If the migration itself must be withdrawn before any rows exist, that is a separate owner-reviewed migration; do not delete journal row 19 by hand.

## 8. Known constraints at cut-over

- Journal must be exactly 1–18 before 0019; `0018_content_version_retry_boundaries.sql` has no prepared rollout statement (pre-existing gap, documented in `apply-0019.sql`).
- Conversations are private per member in v1. Shared team threads are a v1.1 design decision (schema/policy change), not a config toggle.
- The Studio adds model cost: one classifier completion plus one streamed answer per turn; the existing AI daily budget and pause gates apply. The first-turn title rides in the classifier JSON, so it adds no extra call.
- Hosted acceptance and this runbook were **not executed** from the development workspace; the local evidence is in `CONVERSATION-STUDIO-REPORT.md`.
