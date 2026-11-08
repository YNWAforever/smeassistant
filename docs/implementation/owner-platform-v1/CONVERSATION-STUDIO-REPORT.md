# Conversation Studio — implementation and verification report

**Date:** 2026-11-08 · **Branch:** `feat/conversation-studio` (from `origin/main` at `e12c4d9`) · **Status:** implemented and locally verified; **not deployed**, no migration applied to a hosted database.

Design contract: `docs/superpowers/specs/2026-11-08-conversation-studio-design.md`.

## 1. What changed

The owner product's primary surface is now a persistent, continuous conversation. The old assistant *sheet* (fixed questions, one answer, forgotten) and the Create goal grid remain only as secondary entry points; the Studio is the first navigation item and the top-bar assistant entry point.

### 1.1 Persistence (migration 0021)

`neon/migrations/0021_studio_conversations.sql` adds two additive tables (no existing object is modified):

- `studio_conversations` (9 columns): `workspace_id` cascade, optional `location_id` set-null, `created_by` cascade, title ≤ 80 chars (derived from the first user turn), `status active|archived`, timestamps.
- `studio_messages` (15 columns): cascade to its conversation and workspace, `seq` per conversation (`unique(conversation_id, seq)`), role `user|assistant`, author set-null, `content`, `parts jsonb` (validated array), intent/model/prompt version, token counts and `cost_usd`.
- RLS enabled, `REVOKE ALL FROM PUBLIC`, DML to `sme_app_runtime`, one `server_application` policy each (the 0009/0016 pattern). No triggers.
- `lib/repositories/studio.ts`: typed repository with `studioRepository(client?, transaction?)`, DB-shaped rows plus `toStudioConversation`/`toStudioMessage` mappers, typed not-found/archived/location errors, transactional `appendMessage` (`SELECT … FOR UPDATE`, `max(seq)+1`, title only while empty).
- `scripts/neon/catalog.ts` teaches the catalog verifier the two added tables (exact columns, constraints, indexes, RLS, policy count `legacy.tables.length + 6`) without touching the existing `brand_revisions`/function assertions.
- Generated artifacts regenerated: `lib/db/schema/studio.ts` + `lib/db/schema/index.ts`, `lib/db/database.types.ts`, `docs/operations/check-missing-columns.sql`.
- Rollout: `docs/implementation/owner-platform-v1/rollout/apply-0021.sql` — one DO block as migrator under the runner advisory lock, requires journal 1–20 with on-disk checksums, executes the 0021 text byte-for-byte, verifies tables/RLS/policies/grants/FK delete rules, records journal row 21. Pinned by `tests/rollout-apply-0021.test.ts`.

**Numbering deviation:** the design originally said 0018, but `0018_content_version_retry_boundaries.sql` already occupied journal row 18 on `origin/main`; the Studio migration is therefore 0019. `.env.example`, `docs/integration/DEPLOY.md` and the design doc were updated; the pre-existing 0018 has no prepared rollout file, which `apply-0021.sql` documents as an operator pre-existing gap.

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

- `app/[locale]/owner/[workspaceSlug]/conversation/studio/page.tsx` (server): both flag checks → `notFound()`, membership/`?location=` via `loadOwnerPage`, caller's conversation rail, `?chat=` conversation (archived-aware, defaults to most recent), message page + `hasMore`, briefed context summary/chips → `StudioView`.
- `components/workspace/conversation-view.tsx`: the workbench header shows the “Open Studio” entry only when the Studio flag is on; `components/workspace-shell.tsx` keeps the conversation chrome active on `/conversation/*` so the nested route renders inside the workbench.
- `components/studio/*`: chat-first client surface — persistent rail (search, Intl recency grouping, rename, archive, new conversation), thread with `role="log"`/`aria-live="polite"` and status stages, optimistic user turn reconciled by the persisted events, token deltas when available, stop/reconcile, retry, honest error banner, evidence chips, inline draft artifact with **Save as a version → Review** and no approve/export/publish control, read-only context rail, starters empty state, mobile rail/context drawers, `?chat=`/`?location=` URL sync without remount.
- `lib/studio/client.ts`: never-throw REST helpers + `streamStudioMessage` (TextDecoder SSE reader, typed event validation, `AbortController`, pre-stream JSON error mapping).
- `app/styles/screens/studio.css` (tokens only; imported from `globals.css` under the page layer): 3 columns ≥1200 px, 2 columns 768–1199 px with context drawer, single column <768 px with both drawers; focus rings, reduced motion; a shared `.conversation-studio-entry` style for the workbench entry.
- Copy in `lib/studio/copy.ts` for en, zh-HK, zh-TW; no hard-coded English.

### 1.4 Test and fixture updates

- `components/pocket-assistant/assistant-sheet.test.tsx`: `studio` added to the surface-coverage list (main's suite covers every surface).
- `test/e2e/safety.ts`: both conversation flags are forwarded to the acceptance app **only** when the runner sets `CONVERSATION_STUDIO_ENABLED=true`, so the default acceptance suite is unchanged and the Studio spec is opt-in.
- `test/integration/neon-schema.integration.test.ts` and the brand-revisions/brand-profile-capture/publish-reply replay lists: journal 21 and the merged catalog counts (48 tables / 560 columns / 261 constraints / 132 indexes); the two rolled-back-journal assertions were updated to 21 rows.
- New tests: repository unit 27, LLM chat/stream, prompt/context/orchestrator/turn-lock, three route suites, Studio client 13, Studio component 9, Studio integration 9, rollout pin 5, Studio acceptance spec 2.

## 2. Verification (executed locally on 2026-11-09, merged Path A tree)

Environment: Node 26.13.0 (repo targets Node 24; see §3), Docker 29.8.1, Windows.

| Gate | Command | Result |
|---|---|---|
| Migration apply + replay + catalog | `tsx scripts/neon/verify-migrations.ts` | **PASS** — applied `0001`–`0021`, replay `[]`, `tables 48`, `columns 560`, `constraints 261`, `indexes 132`, `triggers 16`, `functions 33`, `seededRows 0` |
| Typecheck | `tsc --noEmit` | **PASS** (exit 0) |
| Lint | `eslint .` | **PASS** — 0 errors, 10 pre-existing warnings |
| Unit/component tests | `vitest run` (jsdom localStorage restored for Node 26) | **PASS** — 6802/6802 tests across 548 files, exit 0 |
| Integration tests | `vitest run --config vitest.integration.config.ts` (Docker fixtures) | **PASS** — 662/662 tests across 61 files on the clean re-run, including `neon-schema` (journal 21 + exact merged catalog), `neon-catalog` and Studio persistence 9/9 |
| Production build | `next build` | **PASS** — includes `ƒ …/conversation/studio` and the three `/api/studio/*` routes |
| JS budget | `node scripts/check-route-js.mjs` | **PASS** — `/…/conversation/studio` 247/300 KB gzip; every route under its limit |
| Studio acceptance e2e | `CONVERSATION_STUDIO_ENABLED=true playwright test --config playwright.acceptance.config.ts e2e/acceptance/conversation-studio.spec.ts` | **PASS** — 2/2 in Chromium: Today stays the default URL, workbench entry → `/conversation/studio`, streamed answer, first-turn title, reload resumes rail/history, no raw JSON, no approve/export/publish control or route; a second member sees an empty rail |
| Secret boundary | `node scripts/assert-secret-boundary.mjs` | **PASS** — 110 public artifacts |
| Gateway smoke | `tsx scripts/studio-smoke.ts` | **PASS** — SKIPPED without a key (exit 0); verified non-skipped against the acceptance fixture gateway |
| Secret boundary | `node scripts/assert-secret-boundary.mjs` | **PASS** — 110 public artifacts |
| Rollout pin | `vitest run tests/rollout-apply-0021.test.ts` | **PASS** — byte-identical embedding, journal 1–20 checksums, row 21, migrator/advisory lock, post-checks |

The Studio acceptance suite was also exercised against a real Docker PostgreSQL fixture and a real Next dev server; the fixture now returns a genuine `text/event-stream` for the answer call, so the browser run exercises the token-delta path (with the non-streaming fallback still unit-tested). `db:verify` proves the migration, repository SQL and catalog expectations against PostgreSQL; the integration suite proves the repository API and pinned journal lists; the e2e proves the browser surface and persistence.

### 1.5 Path A integration (2026-11-09)

`main` moved 191 commits while this branch was in review and shipped its own approved conversation workbench (`/conversation`, `CONVERSATION_HOME_ENABLED`, migrations 0019/0020, five-destination Kinnso OS IA). The approved integration path is **A: the Studio becomes the persistent, model-backed mode of that workbench**.

- **Entry/IA:** Today remains the default workspace URL and the five destinations are unchanged. The conversation workbench header shows an “Open Studio” link when both flags are on; the Studio lives at `/conversation/studio`. Earlier Studio-first nav/root-redirect work was withdrawn.
- **Flags:** `CONVERSATION_HOME_ENABLED` (existing) + `CONVERSATION_STUDIO_ENABLED`; both required for the Studio, each independently fail-closed.
- **Migration:** renumbered to **0021**, layered on the conversation workstream's 0019/0020; catalog verifier assertions and the rollout statement were merged onto that baseline (`journal 1–20`, row 21).
- **Kept from the branch:** the server-persisted threads, grounded briefing/orchestrator, SSE routes, evidence/artifact/context UI, first-turn titles, gateway smoke check and cut-over runbook.
- **Removed in the merge:** the Studio nav item, top-bar “Open Studio” entry, `ShellWorkspace.studioEnabled`, root redirect, `/today` route and the old `home-view` extraction. The conversation shell now stays active on `/conversation/*` so the nested route keeps the workbench chrome.

### 1.6 First-turn titles, smoke check and runbook (same return)

- **First-turn conversation titles are model-generated.** The classifier JSON accepts an optional `title` on the first turn only; the parser sanitises it (quotes, control characters, fence markers, trailing punctuation, 2–80 chars) and the orchestrator applies it after the user turn is stored, falling back to the deterministic first-message title. No extra provider call.
- **Gateway smoke check.** `corepack pnpm smoke:studio` performs the two production call shapes (strict-JSON classifier + streamed plain-text answer), reports every check and exits non-zero on failure; without a configured key it prints `SKIPPED` and exits 0.
- **Hosted cut-over runbook.** `CONVERSATION-STUDIO-CUTOVER.md` orders target confirmation, journal check, `apply-0021.sql`, flag-off deploy, conversation-workbench enablement, Studio flag-on, the 15-point hosted acceptance, evidence queries and rollback.

### 1.7 Convergence slice: browser-local notes → persistent Studio threads (2026-11-09)

The workbench and the Studio still keep two thread stores in this release: browser-local notes (`lib/workspace/conversation-store.ts`) and server `studio_*` conversations. This slice adds the first bridge without removing the local store, so no owner data is migrated or deleted implicitly.

- **Workbench list:** when both flags are on, `/conversation` server-loads the member's latest 8 persistent Studio discussions and shows them beside the local threads with links into `/conversation/studio?chat=…`.
- **Continue in Studio:** a selected local thread has a one-click bridge that calls `POST /api/studio/conversations/import`. The route validates both flags, membership (manager floor), location scope and body limits, applies a new `studio_import` rate limit (20/hour/user), and imports in one transaction: create the conversation, insert each local note as an ordered `user` message (max 40 notes, 4,000 chars each), then touch `last_message_at`. The local thread is untouched; the owner can delete local site data without affecting the server copy.
- **Audit:** a new `conversation.imported` event records the workspace/location, conversation id, actor and `{surface:"conversation", notes: n}` only — never the note text.
- **Copy:** five new keys in `lib/copy-conversation-design.ts` for en, zh-HK and zh-TW.
- **Verified:** `studioRepository.importConversation` unit tests (30 total repo tests), the import route contract (7 tests: flag-off before auth/SQL, body validation, scope, audit without text, 404/429/503), the workbench component test (persistent list + bridge), the Docker integration test (ordered user turns on real PostgreSQL, 10/10), and the Studio browser acceptance (3/3, including “promote a local note thread into a persistent Studio conversation”). `next build` passes and the `/conversation` first-load budget is 253/300 KB gzip.

### Bug caught by visual verification (pre-integration branch)

The pre-integration e2e/screenshot round exposed two issues that text assertions missed: `buildShellWorkspace` accepted `studioEnabled` but did not copy it into `ShellWorkspace` (the page rendered while nav stayed hidden), and the fixture returned classifier JSON as answer prose. The fixture fix (real SSE + prose) and the no-raw-JSON assertion are kept; the shell flag forwarding became obsolete under Path A, which mounts the entry in the conversation workbench instead of the shell nav.

### Full acceptance-suite note

A full 23-spec acceptance run was attempted on the pre-integration branch: 64 tests passed before Docker/disk exhaustion. The merged tree's targeted Studio acceptance is the authoritative browser evidence for this change; the default acceptance suite does not enable the conversation/Studio flags (`test/e2e/safety.ts` forwards them only on request), so its behaviour is unchanged.

## 3. Local-only test-harness workarounds (not committed)

The checkout's documented commands assume `corepack` and Node 24. In this environment:

- **No corepack:** `corepack pnpm …` is unavailable. Gates were run with the local binaries (`node_modules/.bin/tsc`, `eslint`, `vitest`, `next`, `tsx`); `scripts/assert-secret-boundary.mjs` was run with a temporary PATH shim that translates its internal `corepack pnpm exec next build`, leaving the gate itself unchanged.
- **Vitest process isolation:** the Windows sandbox used for early reconnaissance forbade child processes, so tests ran with `--pool=threads` and a Vite `exec` shim. With wider access (Docker/Next build) the normal configuration works.
- **Node 26 jsdom:** Node 26 installs an inert global `localStorage` accessor, so Vitest's jsdom environment cannot install its own Storage and tests that clear/spy on it fail. The verification run deletes that global in a preload before Vitest starts (restoring Node 24 behaviour). This is an environment workaround only; no test or application code was changed for it.
- Docker image `postgres:16` was pulled locally for the owned fixtures; no hosted database was touched.

These are environment workarounds, not product behaviour; none is committed.

## 4. How to enable

1. **Database:** run `corepack pnpm db:verify` on a disposable fixture, then apply `docs/implementation/owner-platform-v1/rollout/apply-0021.sql` with the migration owner (journal must be exactly 1–20; the statement records row 21). Run `docs/operations/check-missing-columns.sql` → 0 rows.
2. **Code:** deploy with `CONVERSATION_STUDIO_ENABLED` unset. Enable `CONVERSATION_HOME_ENABLED` if the target environment does not have the workbench yet, then set `CONVERSATION_STUDIO_ENABLED=true` and redeploy. The Studio uses the existing LLM gateway variables; no new secret.
3. **Verify:** Today is still the default workspace URL; the conversation workbench shows “Open Studio”; a turn persists across reload; evidence chips cite the latest scan; "Save as a version" lands on the existing action page; approve/export/publish still happen only there.
4. **E2E (optional):** set `CONVERSATION_STUDIO_ENABLED=true` in the runner; the acceptance environment enables both conversation flags and runs the Studio spec. It is skipped by default so the existing acceptance suite is unchanged.
5. **Rollback:** unset `CONVERSATION_STUDIO_ENABLED` and redeploy. Conversations remain in the two tables; no other feature reads them.

The ordered hosted runbook (target confirmation, journal check, apply, flag-off deploy, flag-on, 14-point acceptance, evidence queries, rollback) is [CONVERSATION-STUDIO-CUTOVER.md](CONVERSATION-STUDIO-CUTOVER.md).

## 5. Open risks / not done

1. **Hosted deployment is NOT RUN** and the migration is **not applied** to any hosted branch. Per the repository contract that is an owner action.
2. **Real-gateway streaming** is implemented against OpenAI-compatible SSE; the browser e2e exercises the streamed path against the fixture gateway, and stubbed frames cover failures. A live `smoke:studio` with the configured gateway is the remaining provider check.
3. **Path A is an incremental integration:** the workbench's local-note threads and the Studio's server threads coexist for this release. Converging notes/documents/search onto the server thread model is the next step (the design's v1.1 convergence), not a flag change.
4. Conversations are **private per member**; shared team threads, attachments, voice and inline approval remain out of scope.
5. The flag-off owner experience is unchanged: Today, the workbench, the assistant sheet and every existing route behave as on `main`.
4. Conversations are **private per member**; shared team threads, attachments, voice, generated titles, and inline approval are explicitly out of scope (v1.1 list in the design doc §14).
5. The flag-off owner experience is byte-identical apart from the assistant-surface union extension; the public/demo assistant sheet is untouched.
