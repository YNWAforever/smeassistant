# Conversation Studio — implementation and verification report

**Date:** 2026-11-08 · **Branch:** `feat/conversation-studio` (from `origin/main` at `e12c4d9`) · **Status:** implemented and locally verified; **not deployed**, no migration applied to a hosted database.

Design contract: `docs/superpowers/specs/2026-11-08-conversation-studio-design.md`.

## 1. What changed

The owner product's primary surface is now a persistent, continuous conversation. The old assistant *sheet* (fixed questions, one answer, forgotten) and the Create goal grid remain only as secondary entry points; the Studio is the first navigation item and the top-bar assistant entry point.

### 1.1 Persistence (migration 0019)

`neon/migrations/0019_studio_conversations.sql` adds two additive tables (no existing object is modified):

- `studio_conversations` (9 columns): `workspace_id` cascade, optional `location_id` set-null, `created_by` cascade, title ≤ 80 chars (derived from the first user turn), `status active|archived`, timestamps.
- `studio_messages` (15 columns): cascade to its conversation and workspace, `seq` per conversation (`unique(conversation_id, seq)`), role `user|assistant`, author set-null, `content`, `parts jsonb` (validated array), intent/model/prompt version, token counts and `cost_usd`.
- RLS enabled, `REVOKE ALL FROM PUBLIC`, DML to `sme_app_runtime`, one `server_application` policy each (the 0009/0016 pattern). No triggers.
- `lib/repositories/studio.ts`: typed repository with `studioRepository(client?, transaction?)`, DB-shaped rows plus `toStudioConversation`/`toStudioMessage` mappers, typed not-found/archived/location errors, transactional `appendMessage` (`SELECT … FOR UPDATE`, `max(seq)+1`, title only while empty).
- `scripts/neon/catalog.ts` teaches the catalog verifier the two added tables (exact columns, constraints, indexes, RLS, policy count `legacy.tables.length + 6`) without touching the existing `brand_revisions`/function assertions.
- Generated artifacts regenerated: `lib/db/schema/studio.ts` + `lib/db/schema/index.ts`, `lib/db/database.types.ts`, `docs/operations/check-missing-columns.sql`.
- Rollout: `docs/implementation/owner-platform-v1/rollout/apply-0019.sql` — one DO block as migrator under the runner advisory lock, requires journal 1–18 with on-disk checksums, executes the 0019 text byte-for-byte, verifies tables/RLS/policies/grants/FK delete rules, records journal row 19. Pinned by `tests/rollout-apply-0019.test.ts`.

**Numbering deviation:** the design originally said 0018, but `0018_content_version_retry_boundaries.sql` already occupied journal row 18 on `origin/main`; the Studio migration is therefore 0019. `.env.example`, `docs/integration/DEPLOY.md` and the design doc were updated; the pre-existing 0018 has no prepared rollout file, which `apply-0019.sql` documents as an operator pre-existing gap.

### 1.2 Server (turns, grounding, streaming, routes)

- `lib/llm.ts` (additive only; 0 deleted lines): `llmChatDetailed(messages)` and `llmChatStreamDetailed(messages, opts, onDelta)` — OpenAI-compatible multi-message chat, SSE `data:` parsing, usage, one pre-first-token non-streaming fallback, typed `stream_interrupted` after a token.
- `lib/studio/context.ts`: `buildStudioBriefing` rebuilds an authorised, bounded briefing on **every** turn from `loadWorkspaceContext` + `getHomeBrief` + `loadSignalRows` + brand + evidence refs; score/coverage are copied from the snapshot, deltas only when `scan_diffs` says comparable, missing rows stay "unavailable"; context summary and state-aware prompt chips are localised; deps injectable for tests.
- `lib/studio/prompt.ts`: pinned `STUDIO_PROMPT_VERSION`; guardrails (fact types, unavailable ≠ zero, never invent owner facts, drafts never publish, cite evidence ids); fenced briefing/owner-message injection containment; strict classifier JSON parser that allowlists evidence/action/version ids and next-step kinds and degrades every malformed shape to a grounded answer.
- `lib/studio/orchestrator.ts`: `runStudioTurn` with injected store/LLM/live-assistant/clock/cost. Order: turn lock → budget → conversation (404/archived) → history → status `reading` → persist user turn → classify → stream the grounded answer, or execute the existing deterministic `explain` / agent-backed `draft` paths through `runLiveAssistant({ surface: "studio" })`. Viewer draft refusal, `needs_facts`, provider failure after persistence (stored localised warning message, thread stays continuous), usage/cost persisted, lock released in `finally`.
- `lib/studio/turn-lock.ts`: per-conversation `pg_try_advisory_lock` on a dedicated client, idempotent release, 409 `conversation_busy`; failures are 503, never "busy".
- Routes: `GET/POST /api/studio/conversations`, `GET/PATCH /api/studio/conversations/[id]`, `POST /api/studio/conversations/[id]/messages` (SSE, `maxDuration = 60`). Flag off → 404 before auth/SQL. Order: flag → body → membership → location scope → `studio_message` rate limit (60/h) → AI budget/pause → conversation → turn lock → briefing → stream. Pre-stream failures are JSON; in-stream failures are `error` + `done`. One `assistant.run` audit row per turn (conversation entity, enumerated payload, **never** text).
- `lib/security/rate-limit.ts`: `studio_message` scope.
- `lib/studio/flag.ts`: `CONVERSATION_STUDIO_ENABLED` exactly `"true"`.

### 1.3 UI

- `app/[locale]/owner/[workspaceSlug]/studio/page.tsx` (server): flag → `notFound()`, membership/`?location=` via `loadOwnerPage`, caller's conversation rail, `?chat=` conversation (archived-aware, defaults to most recent), message page + `hasMore`, briefed context summary/chips → `StudioView`.
- `components/studio/*`: chat-first client surface — persistent rail (search, Intl recency grouping, rename, archive, new conversation), thread with `role="log"`/`aria-live="polite"` and status stages, optimistic user turn reconciled by the persisted events, token deltas when available, stop/reconcile, retry, honest error banner, evidence chips, inline draft artifact with **Save as a version → Review** and no approve/export/publish control, read-only context rail, starters empty state, mobile rail/context drawers, `?chat=`/`?location=` URL sync without remount.
- `lib/studio/client.ts`: never-throw REST helpers + `streamStudioMessage` (TextDecoder SSE reader, typed event validation, `AbortController`, pre-stream JSON error mapping).
- `app/studio.css` (tokens only; imported from `app/layout.tsx`): 3 columns ≥1200 px, 2 columns 768–1199 px with context drawer, single column <768 px with both drawers; focus rings, reduced motion.
- `components/workspace-shell.tsx`: Studio first primary nav item and the top-bar "Open Studio" entry (sheet remains on public/demo surfaces and flag-off paths are byte-identical); mobile bar Studio·Home·Actions·Insights·More. `ShellWorkspace.studioEnabled` is optional, so no other caller changes.
- Copy in `lib/studio/copy.ts` for en, zh-HK, zh-TW; no hard-coded English.

### 1.4 Test and fixture updates

- `components/pocket-assistant/assistant-sheet.test.tsx`: `studio` added to the surface-coverage list.
- `components/workspace/more-view.test.tsx`: `studio` added to the reachable-without-More set (it is a mobile tab).
- `test/e2e/safety.ts`: `CONVERSATION_STUDIO_ENABLED` is forwarded to the acceptance app **only** when the runner sets it, so the default acceptance suite is unchanged and the Studio spec is opt-in.
- `test/integration/neon-schema.integration.test.ts` and the brand-revisions/brand-profile-capture/publish-reply replay lists: journal 19 and the exact new catalog counts.
- New tests: repository unit 27, LLM chat/stream, prompt/context/orchestrator/turn-lock, three route suites, Studio client 13, Studio component 9 + navigation 4, Studio integration 9, rollout pin 5, Studio acceptance spec 2.

## 2. Verification (executed locally on 2026-11-08)

Environment: Node 26.13.0 (repo targets Node 24; see §4), Docker 29.8.1, Windows sandbox.

| Gate | Command | Result |
|---|---|---|
| Migration apply + replay + catalog | `tsx scripts/neon/verify-migrations.ts` | **PASS** — applied `0001`–`0019`, replay `[]`, `tables 44`, `columns 522`, `constraints 228`, `indexes 119`, `triggers 10`, `functions 27`, `seededRows 0` |
| Typecheck | `tsc --noEmit` | **PASS** (exit 0) |
| Lint | `eslint .` | **PASS** — 0 errors, 40 pre-existing warnings |
| Unit/component tests | `vitest run --pool=threads` | **PASS** — 5889/5889 tests, exit 0 |
| Integration tests | `vitest run --config vitest.integration.config.ts` (Docker fixtures) | **PASS** — 638/638 tests, including `neon-schema` (journal 19 + exact catalog), `neon-catalog` and Studio persistence 9/9 |
| Production build | `next build` | **PASS** — includes `ƒ /[locale]/owner/[workspaceSlug]/studio`, `ƒ …/today` and the three `/api/studio/*` routes |
| Studio acceptance e2e | `CONVERSATION_STUDIO_ENABLED=true playwright test --config playwright.acceptance.config.ts e2e/acceptance/conversation-studio.spec.ts` | **PASS** — 2/2 in Chromium: the workspace root redirects to the Studio, nav leads with it, “Open Studio” is in the top bar, the Today brief is reachable at `/today`, a starter streams an answer, the first-turn title is stored and shown in the rail, reload resumes history, no raw JSON, no approve/export/publish control or route; a second member sees an empty rail (privacy). |
| Gateway smoke | `tsx scripts/studio-smoke.ts` | **PASS** — SKIPPED without a key (exit 0); verified non-skipped against the acceptance fixture gateway: classifier JSON parsed, `streamed: true`, deltas concatenate to the answer |
| Secret boundary | `node scripts/assert-secret-boundary.mjs` | **PASS** — 92 public artifacts |
| Rollout pin | `vitest run tests/rollout-apply-0019.test.ts` | **PASS** — 5/5 (byte-identical embedding, journal 1–18 checksums, row 19, migrator/advisory lock, post-checks) |

The Studio acceptance suite was also exercised against a real Docker PostgreSQL fixture and a real Next dev server; the fixture now returns a genuine `text/event-stream` for the answer call, so the browser run exercises the token-delta path (with the non-streaming fallback still unit-tested). `db:verify` proves the migration, repository SQL and catalog expectations against PostgreSQL; the integration suite proves the repository API and pinned journal lists; the e2e proves the browser surface and persistence.

### 1.5 Follow-up delivery (2026-11-08, same branch)

- **Studio is now the default owner landing.** With the flag on, `/{locale}/owner/{workspaceSlug}` redirects to `/studio` (carrying `?location=`), and the read-only brief moves to `/{locale}/owner/{workspaceSlug}/today`. The Home tab and brand link point at the new locations; with the flag off the root still renders the brief exactly as before. Covered by navigation-entry tests, the shell data test and the browser acceptance spec.
- **First-turn conversation titles are model-generated.** The classifier JSON now accepts an optional `title` on the first turn only; the parser sanitises it (quotes, control characters, fence markers, trailing punctuation, 2–80 chars) and the orchestrator applies it after the user turn is stored, falling back to the deterministic first-message title. No extra provider call.
- **Gateway smoke check.** `corepack pnpm smoke:studio` performs the two production call shapes (strict-JSON classifier + streamed plain-text answer), reports every check and exits non-zero on failure; without a configured key it prints `SKIPPED` and exits 0.
- **Hosted cut-over runbook.** `CONVERSATION-STUDIO-CUTOVER.md` orders target confirmation, journal check, `apply-0019.sql`, flag-off deploy, flag-on, the 14-point hosted acceptance, evidence queries and rollback.

### Bug caught by visual verification

The first screenshot/e2e round exposed two things that the text assertions alone missed: `buildShellWorkspace` accepted `studioEnabled` but did not copy it into the returned `ShellWorkspace`, so the Studio page rendered while its nav/top-bar entry silently stayed hidden; and the fixture returned the classifier JSON as the answer prose. Both are fixed (the shell now forwards the flag, with `lib/workspace/shell.test.ts` pinning it), the fixture streams real prose, and the acceptance test now asserts the nav entry and that the answer contains no JSON envelope.

### Full acceptance-suite note

A full 23-spec acceptance run was attempted for regression coverage: 64 tests passed before Docker Desktop and the disk filled (`ENOSPC`, then `Docker Desktop is unable to start`), after which the remaining specs failed at fixture setup. That is an environment failure, not a product failure; the targeted Studio run above was re-executed green on the same code once Docker was restarted and disk was reclaimed. The default acceptance suite does not enable the Studio flag (`test/e2e/safety.ts` forwards it only on request), so its behaviour is unchanged.

## 3. Local-only test-harness workarounds (not committed)

The checkout's documented commands assume `corepack` and Node 24. In this environment:

- **No corepack:** `corepack pnpm …` is unavailable. Gates were run with the local binaries (`node_modules/.bin/tsc`, `eslint`, `vitest`, `next`, `tsx`); `scripts/assert-secret-boundary.mjs` was run with a temporary PATH shim that translates its internal `corepack pnpm exec next build`, leaving the gate itself unchanged.
- **Vitest process isolation:** the Windows sandbox used for early reconnaissance forbade child processes, so tests ran with `--pool=threads` and a Vite `exec` shim. With wider access (Docker/Next build) the normal configuration works.
- **Node 26 jsdom:** `components/scanning-page.test.tsx` needs `--localstorage-file` on Node 26 (unrelated to this feature; the test and component are untouched). With that flag the whole suite is green.
- Docker image `postgres:16` was pulled locally for the owned fixtures; no hosted database was touched.

These are environment workarounds, not product behaviour; none is committed.

## 4. How to enable

1. **Database:** run `corepack pnpm db:verify` on a disposable fixture, then apply `docs/implementation/owner-platform-v1/rollout/apply-0019.sql` with the migration owner (journal must be 1–18; the statement records row 19). Run `docs/operations/check-missing-columns.sql` → 0 rows.
2. **Code:** deploy with `CONVERSATION_STUDIO_ENABLED` unset first (all new surfaces 404, nav unchanged). Then set `CONVERSATION_STUDIO_ENABLED=true` and redeploy. The Studio uses the existing LLM gateway variables; no new secret.
3. **Verify:** Studio is the first owner nav item; a turn persists across reload; evidence chips cite the latest scan; "Save as a version" lands on the existing action page; approve/export/publish still happen only there.
4. **E2E (optional):** set `CONVERSATION_STUDIO_ENABLED=true` in the runner and the acceptance environment will start the Studio spec; it is skipped by default so the existing acceptance suite is unchanged.
5. **Rollback:** unset the flag and redeploy. Conversations remain in the two tables; no other feature reads them.

The ordered hosted runbook (target confirmation, journal check, apply, flag-off deploy, flag-on, 14-point acceptance, evidence queries, rollback) is [CONVERSATION-STUDIO-CUTOVER.md](CONVERSATION-STUDIO-CUTOVER.md).

## 5. Open risks / not done

1. **Hosted deployment is NOT RUN** and the migration is **not applied** to any hosted branch. Per the repository contract that is an owner action.
2. **Real-gateway streaming** is implemented against OpenAI-compatible SSE but was exercised only against the fixture server and stubbed frames; the fixture returns non-stream JSON for every call, so the fallback path is what the e2e exercised. A live smoke test with the configured gateway is the remaining provider check.
3. **Migration 0018 has no rollout statement** (pre-existing gap): `apply-0019.sql` refuses unless journal 1–18 is already present.
4. Conversations are **private per member**; shared team threads, attachments, voice, generated titles, and inline approval are explicitly out of scope (v1.1 list in the design doc §14).
5. The flag-off owner experience is byte-identical apart from the assistant-surface union extension; the public/demo assistant sheet is untouched.
