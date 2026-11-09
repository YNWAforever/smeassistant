# Conversation Studio — hosted cut-over runbook (Path A: Studio inside the conversation workbench)

**Status: EXECUTED 2026-11-09.** Production journal is **22** (`0022_studio_conversation_members.sql` applied after a verified run on a disposable Neon branch), `CONVERSATION_STUDIO_ENABLED=true` is set in Vercel Production, and production was redeployed. Evidence: `/api/studio/conversations` now answers **401 unauthenticated** for a signed-out request (previously flag-off 404), `/zh-HK/owner/select-workspace` redirects **307 to sign-in**, the member table has RLS, one `server_application` policy, two indexes, the expected FKs/role check and runtime DML, and `check-missing-columns.sql` returns 0 rows. `smoke:studio` was **SKIPPED** on this machine (no LLM gateway key; Vercel secrets are not decryptable locally), and the **15-point hosted browser acceptance remains an owner/manual step** with a signed-in owner session.

**Integration shape (approved Path A):** the Studio is the persistent, model-backed **mode of the existing conversation workbench**. Today remains the default workspace URL. The workbench (`/{locale}/owner/{workspaceSlug}/conversation`) is the single entry point and shows an “Open Studio” link when both flags are on. The Studio route is `/{locale}/owner/{workspaceSlug}/conversation/studio`; there is no owner-nav item and no root redirect.

Design: `docs/superpowers/specs/2026-11-08-conversation-studio-design.md`. Record: `CONVERSATION-STUDIO-REPORT.md`.

## 0. What ships

- Migration `0021_studio_conversations.sql`: two additive tables (`studio_conversations`, `studio_messages`), RLS + runtime policies. It layers on the existing conversation-workstream migrations `0019_conversation_resources.sql` and `0020_conversation_search.sql`. No existing table, column, function, policy or grant is changed.
- Application code behind `CONVERSATION_STUDIO_ENABLED`: the `/conversation/studio` page, the conversation entry, and three `/api/studio/*` routes. The existing conversation workbench stays gated by `CONVERSATION_HOME_ENABLED`; the Studio requires both flags. With either flag off, the Studio is `404` and the workbench is unchanged.
- No new secret. The Studio uses the existing LLM gateway variables (`OPENCODE_API_KEY` / `LLM_API_KEY` / `OPENROUTER_KEY`, optional `LLM_BASE_URL`, `LLM_MODEL`).

## 1. Pre-flight (owner, read-only)

1. Confirm the deployed application's `DATABASE_URL` target: Neon project, branch, endpoint host and database. Record the provider IDs (never the connection string).
2. Read the hosted journal. It must be **exactly 1–21** with the committed names and checksums:
   ```sql
   SELECT ordinal, name, checksum FROM neon_migrations.journal ORDER BY ordinal;
   ```
   Any missing/extra/mismatched row is a release blocker; do not fake history.
3. Confirm the runtime role is not the owner/superuser and that `sme_app_runtime` exists with the expected privileges. Add `DATABASE_URL_UNPOOLED`, `NEON_READINESS_HOST` and `NEON_READINESS_DATABASE` to the separate read-only operator process (never the web runtime or previews), then run `pnpm neon:readiness` on the intended checkout. It also verifies every Studio table/column, including the 0022 member table; see `docs/operations/studio-readiness.md`.
4. Confirm the deployed LLM gateway is configured and funded. AI pause/budget gates still apply.

## 2. Local quality gates (before any hosted action)

```powershell
corepack pnpm db:verify                     # owned disposable PostgreSQL: 0001-0021 apply + replay + exact catalog
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test                          # unit/component
corepack pnpm test:integration              # Docker fixtures, includes studio persistence
corepack pnpm build
corepack pnpm test:js-budget                # workspace route budget remains within 300 KB gzip
corepack pnpm test:secret-boundary
corepack pnpm smoke:studio                  # SKIPPED when no LLM key; run with real gateway vars
```

Expected `db:verify`: `applied` ends with `0022_studio_conversation_members.sql`, `replay: []`, `tables 49`, `columns 566`, `constraints 267`, `indexes 134`, `seededRows 0`. Expected Studio e2e (opt-in, requires both flags in the acceptance env):

```powershell
$env:CONVERSATION_STUDIO_ENABLED="true"
corepack pnpm e2e:acceptance -- e2e/acceptance/conversation-studio.spec.ts
```

## 3. Apply the migrations

**Current production state (2026-11-09, executed):** the hosted journal is exactly **1–22**. `0022_studio_conversation_members.sql` was applied through the prepared file below. Before it, `neondb_owner` granted `REFERENCES ON public.studio_conversations TO smeassistant_migrator`; the 0021 tables are owned by `neondb_owner`, while the migrator creates the 0022 table, so the FK needs that privilege. The same sequence was executed once on a disposable Neon branch first (`rollout-0022-test`, then deleted).

For a fresh target, run `docs/implementation/owner-platform-v1/rollout/apply-0022.sql` in the Neon SQL Editor as `neondb_owner` (which must hold `smeassistant_migrator` WITH SET TRUE), on a Neon **test branch of production first**, then production. It is one DO block: it takes the runner advisory lock, verifies journal **1–21** by name+SHA-256, executes the 0022 text byte for byte, checks the member table/RLS/indexes/FK and role check/policy/grants, and records journal row **22**. Any failure rolls the whole statement back. The `REFERENCES` grant above must be issued first.

There is no prepared statement for 0019/0020 (the conversation workstream applied them through the runner); a target still at **1–20** must catch up through the normal runner before this file. Do not hand-insert journal rows.

Post-apply verification (read-only):

```sql
SELECT max(ordinal) AS last_migration FROM neon_migrations.journal;                -- 22
SELECT relname, relrowsecurity FROM pg_class
 WHERE relname IN ('studio_conversations','studio_messages','studio_conversation_members'); -- all, RLS true
SELECT count(*) FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('studio_conversations','studio_messages','studio_conversation_members'); -- 3
-- paste docs/operations/check-missing-columns.sql -- 0 rows
```

## 4. Deploy the code (flags off, then enabled)

1. Deploy the reviewed commit with `CONVERSATION_STUDIO_ENABLED` unset. If `CONVERSATION_HOME_ENABLED` is not already enabled in the target environment, enable it first and verify the conversation workbench (notes/documents/search unchanged).
2. Flag-off contract: `/conversation/studio` answers `404`; `/api/studio/conversations` answers `404` before auth/SQL; the workbench has no Studio entry; Today is still the default workspace URL.
3. Set `CONVERSATION_STUDIO_ENABLED=true` and redeploy (env changes take effect on the next deployment). The Studio requires `CONVERSATION_HOME_ENABLED=true` too.
4. Run the gateway smoke with the production LLM variables from a trusted machine (read-only; no database access):
   ```
   corepack pnpm smoke:studio
   ```
   Expected: `ok: true`, `streamUsedDeltas: true`, `deltasMatchText: true`. A failure means the deployed gateway rejects the Studio call shape; unset the flag and roll back.

## 5. Hosted acceptance checklist (signed-in owner)

| # | Check | Expected |
|---|---|---|
| 1 | Open `/en/owner/<slug>` | **Today** renders; no redirect to the Studio |
| 2 | Open `/en/owner/<slug>/conversation` | Existing workbench renders; “Open Studio” entry is visible |
| 3 | Click the entry | `/conversation/studio` renders inside the conversation shell |
| 4 | Empty state | Question, boundary sentence, starter chips; no task cards/forms |
| 5 | Send a starter | User turn appears, status stages move, streamed answer completes |
| 6 | Reload | URL keeps `?chat=<id>`; rail lists the conversation; history restored |
| 7 | Second device/session | Same member sees the conversation; another member gets 404 on its id |
| 8 | Evidence | Answer carries source/observed chips when the briefing has evidence |
| 9 | Draft | Asking for a reply produces an inline draft artifact; only “Save as a version” + review link, never approve/export/publish |
| 10 | Version | Save-as-version lands on the existing action page with that version selected; approval/export stay there |
| 11 | Audit | One `assistant.run` row per turn with conversation entity id, intent and turn kind; no message text |
| 12 | Limits | 60 turns/h/user; a second concurrent turn gets 409 `conversation_busy`; AI pause/budget return localized states |
| 13 | Locales | zh-HK, zh-TW, en render; interface language does not change market |
| 14 | Mobile | 390px: rail/context drawers, composer above the mobile nav, no horizontal scroll |
| 15 | Flag-off | With `CONVERSATION_STUDIO_ENABLED` unset, the entry and route are absent and the workbench/Today are unchanged |

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

## 6. Rollback

1. Unset `CONVERSATION_STUDIO_ENABLED` and redeploy (or promote the previous deployment). The entry/route/API disappear; the workbench and the rest of the owner app are untouched.
2. Keep the two tables: no other feature reads them, and keeping them preserves the audit trail. Dropping them is a separate deliberate migration after an owner decision.
3. If the migration itself must be withdrawn before any rows exist, that is a separate owner-reviewed migration; do not delete journal row 21 by hand.

## 7. Known constraints at cut-over

- Journal must be exactly 1–21 before 0021 (the conversation workstream’s 0019/0020 must already be applied).
- Conversations are private per member in v1. Shared team threads are a v1.1 design decision (schema/policy change), not a config toggle.
- The Studio adds model cost: one classifier completion plus one streamed answer per turn; the existing AI daily budget and pause gates apply. The first-turn title rides in the classifier JSON, so it adds no extra call.
- Hosted acceptance and this runbook were **not executed** from the development workspace; the local evidence is in `CONVERSATION-STUDIO-REPORT.md`.
