# Conversation Studio — design and implementation contract

**Date:** 2026-11-08 · **Branch:** `feat/conversation-studio` (from `origin/main` at `e12c4d9`) · **Status:** implemented and locally verified — see `docs/implementation/owner-platform-v1/CONVERSATION-STUDIO-REPORT.md`; not deployed and the migration is not applied to any hosted database.

## 1. Why

The owner product today is a dashboard with an assistant *sheet*: `components/pocket-assistant/assistant-sheet.tsx` offers a fixed list of questions per surface, posts one question to `POST /api/assistant/run`, renders one answer, and forgets it. `Create` (`components/workspace/create-view.tsx`) is a goal grid plus a textarea that creates a task. Both are task cards and forms wearing a chat costume: there is no conversation, no continuity, no follow-up, no history, and no way to ask an arbitrary question.

The reference product (`ads-copilot-alpha.vercel.app`) is organised as `spaces/{space}/chat/{chat}`: a workspace-scoped, persistent conversation list beside a continuous chat thread, with the actual work (drafts, analysis, decisions) appearing inline in the thread. The conversation, not a dashboard, is the primary surface.

**Product requirement for this slice:** the primary owner experience must be a persistent, continuous conversation studio. Not a set of task cards or a form presented as a chat interface.

## 2. Product decisions

| # | Decision | Rationale |
|---|---|---|
| S1 | The Studio is the **persistent, model-backed mode of the existing conversation workbench** (approved integration Path A). Today remains the default workspace URL and the five destinations are unchanged; `/{locale}/owner/{workspaceSlug}/conversation` is the single entry point and shows an “Open Studio” link when both flags are on. | Keeps the approved Kinnso OS IA and the conversation workstream intact while adding real persistence and grounded model turns. |
| S2 | Conversations are **persistent and private per member**. Rows live in Postgres; the rail lists them across sessions and devices. Each conversation belongs to `(workspace, created_by)`. | "Persistent, continuous chat" cannot be a client-side array. Private-by-default avoids leaking one manager's notes to another. |
| S3 | A conversation is scoped to the workspace and an optional location, and each turn can carry `?location=` the same way every owner page does. The server re-authorizes the location on every turn. | Locale/market/scope rules already exist; the Studio must not invent a parallel one. |
| S4 | Free text with continuity. Prior turns are sent to the model with a fresh, bounded **workspace briefing** (latest snapshot, comparable change, open actions, waiting versions, Google connection, brand facts, usage). | Continuity must not mean replaying stale state: the briefing is rebuilt from authorised rows on every turn. |
| S5 | Work happens inline, but authority does not move. The Studio can produce a **draft** through the existing `runLiveAssistant` path (stored in `action_runs`), attach evidence chips and a next-step link, and show **Save as a version**. Approve/export/publish still happen only through the existing routes and pages. | Guardrails 5–7, 14, 15. The conversation gains no new mutation power. |
| S6 | The old assistant sheet stays for public/demo surfaces and deep links; the **owner shell's top-bar trigger becomes "Open Studio"**. | Avoid breaking the public assistant contract while making the owner path chat-first. |
| S7 | Two server-only flags: `CONVERSATION_HOME_ENABLED` (the existing workbench) and `CONVERSATION_STUDIO_ENABLED` (exactly `"true"`). The Studio requires both; off means no entry, `404` page and `404` API. Apply migration 0021 before enabling. | Matches the repo's feature-flag discipline; the migration is additive and manual. |

## 3. Experience

```
+ workspace sidebar + + conversation rail -+ + thread + composer -----------+ + context +
| Studio       (on) | | Conversations  [+] | |  Studio - Kam Man House      | | Latest  |
| Home              | | search              | |  --------------------------- | | scan 78 |
| Actions           | | Today               | |  You: what should I do first?| | 86%     |
| Insights          | |  - Review replies   | |  Studio: [answer]            | | Open 4  |
| ...               | | Earlier             | |  [evidence chips]            | | Waiting |
|                   | |  - What changed?    | |  [draft artifact card]       | | Google  |
|                   | |                     | |  [Save version] [Review]     | | (i)     |
+-------------------+ +---------------------+ |  + composer ---------------+ |         |
                                              |  | Ask...              [->] | |         |
                                              |  +-------------------------+ |         |
                                              +------------------------------+ +---------+
```

- **Empty state** is a genuine question, not a task board: title, one explanatory line, the read-only boundary, and 4 starter prompts (state-aware chips are additive).
- **Thread** renders message parts in order: prose, evidence chips (`source · observed_at · fact type`), draft artifact card, next-step link, warnings. No forms except the composer.
- **Composer** auto-grows, Enter sends, Shift+Enter newline, stop button while a turn runs, honest error banner and retry; disabled with copy when the AI provider is paused/unavailable.
- **Context rail** is a read-only mirror of the briefing (score, coverage, observed date, open actions, waiting versions, Google connection, brand fact count, limit note). Collapsible; on mobile a drawer; the thread is never squeezed below readable width.
- **Continuity affordances**: conversation rail with recency grouping, rename, archive, URL `?chat=<id>` (SSR-loadable), message history pagination, and a per-conversation title derived from the first user message (renamable).
- **Streaming**: status stages ("Reading the latest evidence…", "Thinking…", "Preparing a draft…", "Saving the answer…") always; token `delta` events when the provider supports streaming, with the final persisted message authoritative.

**Explicitly not this:** a dashboard of cards that each open a one-shot assistant call; a form that pretends to be a message; fixed multiple-choice questions as the only input.

## 4. Routes

| Route | Auth | Purpose |
|---|---|---|
| `/{locale}/owner/{workspaceSlug}/conversation` | member | The existing conversation workbench (flag `CONVERSATION_HOME_ENABLED`); shows the “Open Studio” entry when the Studio flag is on. |
| `/{locale}/owner/{workspaceSlug}/conversation/studio` | member | Studio. SSR loads the rail, the context summary, prompt chips, and the conversation named by `?chat=` (messages paged newest-last). |
| `POST /api/studio/conversations` | member | Create a conversation. |
| `GET /api/studio/conversations` | member | List the caller's conversations (`workspaceId`, optional `locationId`). |
| `GET /api/studio/conversations/[id]` | member | Read conversation + messages (`beforeSeq`, `limit`). |
| `PATCH /api/studio/conversations/[id]` | member | Rename or archive. |
| `POST /api/studio/conversations/[id]/messages` | member | Send a turn; responds `text/event-stream` (`StudioStreamEvent`). |

All Studio routes return `404` while `CONVERSATION_STUDIO_ENABLED` is not true (and the workbench flag is off). Every route resolves membership with `authorizeWorkspaceRequest` and filters by `workspace_id` **and** `created_by` after that check. A conversation id from another workspace or another member is `404`, never `403`.

## 5. Data model (migration `0021_studio_conversations.sql`)

Additive only. The ordinal is 0021 because the conversation workstream already occupies journal rows 19 (`0019_conversation_resources.sql`) and 20 (`0020_conversation_search.sql`). No existing table or function is modified.

```sql
studio_conversations(
  id uuid pk default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  location_id uuid null references locations(id) on delete set null,
  created_by uuid not null references app_users(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 80),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
)
-- index: (workspace_id, created_by, last_message_at desc, id desc)

studio_messages(
  id uuid pk default gen_random_uuid(),
  conversation_id uuid not null references studio_conversations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,  -- denormalised for scope checks
  seq integer not null check (seq > 0),
  role text not null check (role in ('user','assistant')),
  author_id uuid null references app_users(id) on delete set null,
  content text not null default '',
  parts jsonb not null default '[]'::jsonb check (jsonb_typeof(parts) = 'array'),
  intent text null,
  model text null,
  prompt_version text null,
  input_tokens integer null check (input_tokens is null or input_tokens >= 0),
  output_tokens integer null check (output_tokens is null or output_tokens >= 0),
  cost_usd numeric(12,6) null check (cost_usd is null or cost_usd >= 0),
  created_at timestamptz not null default now(),
  unique (conversation_id, seq)
)
-- index: (conversation_id, seq)
```

Both tables: `ENABLE ROW LEVEL SECURITY`, `REVOKE ALL FROM PUBLIC`, `GRANT SELECT, INSERT, UPDATE, DELETE ... TO sme_app_runtime`, `DROP POLICY IF EXISTS server_application`, `CREATE POLICY server_application FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true)` — the 0009/0016 pattern. No triggers.

**Catalog verifier updates (`scripts/neon/catalog.ts`):** both tables excluded from the legacy deepEquals, exact columns/constraints/indexes asserted, the two custom indexes also listed in `additionalIndexes`, policy count `legacy.tables.length + 6`. Generated artifacts regenerated: `lib/db/schema/studio.ts` (+ index export), `lib/db/database.types.ts`, `docs/operations/check-missing-columns.sql`.

**Repository (`lib/repositories/studio.ts`):** typed methods only; the caller has already authorised. Every read filters `workspace_id`; actor-owned methods also filter `created_by`. `appendMessage` runs in one transaction: `SELECT … FOR UPDATE` on the conversation (scope + status), `seq = coalesce(max(seq),0)+1`, insert, touch the conversation, and derive the title from the suggestion only while the stored title is empty. Typed `StudioConversationNotFoundError` / `StudioConversationArchivedError` / `StudioLocationNotFoundError`; a foreign or missing conversation writes nothing.

**Rollout (`docs/implementation/owner-platform-v1/rollout/apply-0021.sql`):** one DO block as `smeassistant_migrator` under `pg_advisory_xact_lock(1936549221, 3)`; refuses unless the journal is exactly 1–20 with the on-disk checksums; executes the 0021 text byte-for-byte; verifies tables, RLS, the five index definitions, the six FK delete rules, the two policies and the runtime/public grants; records journal row 21. Pinned by `tests/rollout-apply-0021.test.ts`.

## 6. Turn orchestration

`lib/studio/orchestrator.ts` — pure dependency injection (no `process.env` reads) so every branch is unit-testable without a provider:

```ts
runStudioTurn({
  membership, locale, conversationId, text, locationId?,
  db,             // studio repository adapter (injected fake in tests)
  briefing,       // lib/studio/context.ts result
  llm,            // { classify, answer } injected; production wraps lib/llm
  emit,           // (StudioStreamEvent) => void | Promise<void>
  lock?, budget?, cost?, model?, now?,
}): Promise<{ ok: true; intent; turn; artifact } | { ok: false; code; persisted }>
```

1. Acquire the per-conversation turn lock; check the budget. Both refuse before anything is written.
2. Load the conversation (actor + workspace + `active`), read history, emit `status: reading`.
3. Persist the user message; emit `user`. A race that archived/removed the conversation is a pre-stream 404/409.
4. **Classify** (small JSON call, `maxTokens 300`, temperature 0) into one of:
   - `answer` — a normal grounded answer;
   - `explain` — one of the deterministic `TEMPLATE_INTENTS`, with optional `actionId`/`versionId`;
   - `draft` — one of the agent-backed intents, with a required `actionId` (and `versionId` for revision intents).
   The classifier may also return up to 4 `evidenceIds` from the briefing catalogue and one `nextStep` kind/id. Everything is validated against the authorised briefing; an unknown id is dropped, never trusted. Malformed output degrades to `answer`.
5. **Execute**:
   - `answer`: status `thinking`, stream the grounded answer (deltas when available); text part + validated evidence part + optional next-step part.
   - `explain` / `draft`: status `drafting`, then `runLiveAssistant({ intentId, surface: "studio", locale, context, membership })` — the existing authority, budget, pause, persistence and acceptance gates. Its localised `answer`, `evidenceRefs`, `warnings`, `output`, `draftRunId` and `nextStep` become parts. `artifact` carries the resolved `actionId`.
   - A viewer may receive `answer`/`explain`; `draft` is refused inside `runLiveAssistant` (manager floor) and the fallback + warning are shown.
6. Persist the assistant message (parts + intent + usage/cost), emit `message` then `done`.
7. If the provider fails **after** the user message was accepted, persist an assistant message with the localised `notices.failed` text + warning part and emit it — the thread stays continuous. Pre-persistence failures are JSON errors/SSE `error` with no rows written.

**Concurrency:** one turn per conversation. `lib/studio/turn-lock.ts` takes `pg_try_advisory_lock` on a dedicated pool client for the turn and releases it in `finally`; a second concurrent request gets `409 conversation_busy`. Lock infrastructure failures are 503, never reported as busy.

### 6.1 Briefing (`lib/studio/context.ts`)

Built from existing read models; no new SQL outside the repositories:

- `loadWorkspaceContext(membership)` — workspace, locations, usage, membership.
- `getHomeBrief(ctx, locationSlug)` — latest snapshot, comparable change, priority, open actions, waiting drafts, integrations (including Google connection).
- `loadSignalRows` — waiting versions + Google status (`lib/assistant/signals.ts`).
- `artifactRepository().assistantBrand` — revision, voice, approved claims, prohibited terms, facts.
- `buildEvidenceRefs` — the same citations the sheet uses (`lib/assistant/evidence.ts`), capped at 12 and keyed `ev:1…ev:12`.

`renderSystemBriefing` is pure and produces the bounded block: workspace/market/timezone, caller role + location scope, latest snapshot (score, coverage, observed_at), comparable delta only when `scan_diffs` says comparable, top 8 open actions `{id, title, state, priority, missing inputs}`, waiting versions, Google state, brand facts and prohibited terms, usage, and the evidence catalogue. Missing rows are stated as unavailable, never inferred. `buildStudioBriefing` also returns the localised `contextSummary` for the context rail and the state-aware `promptChips` for the composer.

### 6.2 Prompt contract (`lib/studio/prompt.ts`)

`STUDIO_PROMPT_VERSION` is pinned in every assistant message. The system prompt states, in order:

1. You are the workspace's Visibility Operator inside a continuous conversation.
2. Facts come only from the briefing. Four fact types (`Observed | Inference | Recommended | Estimated/Unknown`); revenue/bookings/intent are Unknown unless measured; unavailable ≠ zero; never invent owner facts, prices, dates, allergens, offers.
3. Nothing is approved, exported or published from the Studio. Drafts are drafts.
4. Answer in the caller's locale; short, concrete, no markdown tables; cite evidence ids when using snapshot facts.
5. The classifier output is a single JSON object and nothing else. Both the briefing and the owner message are fenced as data, and any fence marker in the data is stripped.

### 6.3 LLM wrapper (`lib/llm.ts` additions, no behaviour change for existing callers)

- `llmChatDetailed(messages, opts)` — OpenAI-compatible `messages[]` on the existing gateway config (system/user/assistant), same error mapping, usage and timeouts.
- `llmChatStreamDetailed(messages, opts, onDelta)` — `stream: true`, parses SSE `data:` frames, calls `onDelta` per content token and resolves the concatenated text + usage. A stream failing before the first token falls back once to non-streaming; after the first token it returns a typed `stream_interrupted` failure and the orchestrator stores what arrived plus a warning. Tests never hit the network.

## 7. API detail

`POST /api/studio/conversations/[id]/messages`

- Body `{ workspaceId, text, locationId? }`; `?locale=` selects the answer language. `text` is trimmed, 1–4000 chars; `locationId` must be in the caller's scope or `404`.
- Route order: flag → JSON shape → membership (`authorizeWorkspaceRequest`) → location scope → rate limit (`studio_message`, 60/h per user) → `checkAiBudget`/pause → conversation read (404/409) → per-conversation turn lock (409) → briefing → `Content-Type: text/event-stream`.
- Headers: `Cache-Control: no-store`, `X-Accel-Buffering: no`, `text/event-stream; charset=utf-8`. Every frame is `data: <JSON>\n\n` of `StudioStreamEvent`: `status` stages → `user` → (`delta`)* → `message` → `done`. A pre-stream failure is a normal JSON error with the same status mapping as `app/api/assistant/run/route.ts`; an in-stream failure is `error` + `done`.
- Audit: one `assistant.run` row per turn with `entity_type: "conversation"`, `entity_id: <conversationId>`, payload `{ surface:"studio", intent, artifact, turn:"chat"|"explain"|"draft" }`. Never the text.
- `maxDuration = 60`.

List/create/read/patch routes validate ids, read after membership, filter by workspace and owner, cache `no-store`. A member may rename/archive only their own conversation.

## 8. UI

- `app/[locale]/owner/[workspaceSlug]/conversation/studio/page.tsx` (server): `loadOwnerPage` → both flag checks → rail + `?chat=` detail + briefing/context summary + chips → `StudioView`.
- `components/workspace/conversation-view.tsx` gains an “Open Studio” entry (only when the Studio flag is on) and links to the nested route; the conversation shell stays active on `/conversation/*`.
- `components/studio/studio-view.tsx` (client) owns: rail, active conversation, messages, streaming state, optimistic user message, URL sync (`history.replaceState` with `?chat=`/`?location=`), error banner, mobile drawers, context pane.
- `components/studio/conversation-rail.tsx`, `message-thread.tsx`, `message-bubble.tsx`, `artifact-card.tsx`, `evidence-chips.tsx`, `composer.tsx`, `context-panel.tsx`, `empty-state.tsx`.
- `lib/studio/client.ts`: never-throw `ClientResult` helpers mirroring `lib/workspace/client.ts`; `streamStudioMessage()` reads the SSE body with `TextDecoder`, dispatches typed events, supports `AbortController`.
- Nav: no new owner destination. The workbench header carries the “Open Studio” entry; Today remains the default workspace URL and the five destinations are unchanged. Design tokens only: the Studio's classes live in `app/styles/screens/studio.css` (page layer, `screens` sub-layer). No global overrides.
- Accessibility: `role="log"` + `aria-live="polite"` on the thread, labelled rail/nav/composer, focus moves to the composer on a new conversation, streaming status in a polite live region, keyboard-only rail navigation, reduced motion respected, contrast ≥ 4.5:1 for body text.
- Responsive: ≥1200px three columns; 768–1199px rail + thread with context drawer; <768px single column with rail and context drawers, composer above the mobile nav.

## 9. Authority, privacy and failure behaviour

- The Studio reads only its workspace, only rows the caller may already read, and never cross-workspace.
- It cannot approve, export, publish, bill, invite, grant ownership or change an action beyond what `runLiveAssistant` already allows (draft text stored on `action_runs`).
- "Save as a version" calls the existing `POST /api/actions/[id]/versions` with `{ assistant_run_id }`; approval/export remain on the action page through existing routes.
- Evidence chips only carry refs the server built for the caller; model-chosen ids are validated against that set.
- Prompt-injection containment: briefing and owner text are fenced as data, tool/ids are allowlisted server-side, and the classifier never returns SQL/URLs.
- Provider unavailable: no assistant message is fabricated; the user message stays and a localised warning part is appended so the thread is honest and retryable.
- AI paused / budget exhausted: HTTP 503/429 before any write; the composer shows copy explaining nothing was changed.
- Rate limit: 60 turns/hour/user; one in-flight turn per conversation (409 `conversation_busy`).

## 10. i18n

All strings live in `lib/studio/copy.ts` (`studioText(locale)`), in en, zh-HK and zh-TW. Server-written message text uses the same table for errors/notices. Deterministic template answers and draft text continue to come from `lib/assistant/templates.ts` / the agents in the requested locale. No hard-coded English in components.

## 11. Rollout and rollback

1. Apply `neon/migrations/0021_studio_conversations.sql` through the normal owner-runner process (`db:verify` on a disposable fixture first; then the deployment's migration owner, or `docs/implementation/owner-platform-v1/rollout/apply-0021.sql` in the SQL editor). Journal must be exactly 1–20 first.
2. Ensure `CONVERSATION_HOME_ENABLED=true` (the workbench), then set `CONVERSATION_STUDIO_ENABLED=true` and redeploy. The Studio uses the existing LLM gateway variables; no other env var is required.
3. Enabling is additive: existing pages, routes, Today and the workbench are untouched when the Studio flag is off.
4. Rollback: unset `CONVERSATION_STUDIO_ENABLED` and redeploy. Conversations remain in the database; no other feature reads them. Dropping the two tables is a separate, deliberate operation.

## 12. Verification matrix

| Layer | What proves it |
|---|---|
| Migration | `db:verify` (owned PostgreSQL fixture): applied 0001–0021, replay empty, 48 tables / 560 columns / 261 constraints / 132 indexes / 16 triggers / 33 functions, 0 seeded rows |
| Repository | `lib/repositories/studio.test.ts` unit + `test/integration/studio-conversations.integration.test.ts` (Docker): scope, private-by-member, seq allocation, title derivation, archive, paging, FK rules |
| Orchestrator | `lib/studio/orchestrator.test.ts`: every classification branch with injected LLM; provider failure after user persistence; evidence allowlist; viewer draft refusal; busy conversation; usage/cost stored |
| Prompt/context | `lib/studio/prompt.test.ts`, `lib/studio/context.test.ts`: authorised rows only; scores copied not recomputed; prompt-injection fencing; locale |
| Routes | `app/api/studio/**/route.test.ts`: flag off writes nothing; 401/403/404/400/409/429; SSE frame order; audit payload contains no text; cross-member 404 |
| UI | jsdom component tests: rail/select/new chat, composer disabled while streaming, optimistic then server message, artifact save-as-version request shape, evidence chips, error banner, empty state, mobile drawer |
| End-to-end | `e2e/acceptance/conversation-studio.spec.ts` (fixture identity): Today default unchanged, workbench entry → `/conversation/studio`, start a conversation, streamed answer, reload and find it in the rail, reopen history, no approve/export/publish control; second member sees an empty rail |
| Gates | typecheck, lint, full unit suite, Docker integration suite, `next build`, JS budget, secret-boundary gate, rollout pin |

## 13. File map / ownership

- Shared contract: `lib/studio/types.ts`, `lib/studio/copy.ts`, `lib/pocket-assistant/contracts.ts` (`studio` surface), `app/api/assistant/run/route.ts` SURFACES, this document, `.env.example`, `docs/integration/DEPLOY.md`.
- Data: `neon/migrations/0021_studio_conversations.sql`, `scripts/neon/catalog.ts`, `lib/db/schema/studio.ts` + `index.ts`, `lib/db/database.types.ts`, `lib/repositories/studio.ts` (+ tests), `test/integration/studio-conversations.integration.test.ts`, `docs/operations/check-missing-columns.sql`, `docs/implementation/owner-platform-v1/rollout/apply-0021.sql`.
- Server: `lib/llm.ts` additions, `lib/studio/{flag,context,prompt,orchestrator,turn-lock,errors}.ts` (+ tests), `app/api/studio/**` (+ tests), `lib/security/rate-limit.ts` (`studio_message`).
- UI: `app/[locale]/owner/[workspaceSlug]/conversation/studio/page.tsx`, `components/studio/**` (+ tests), `components/workspace/conversation-view.tsx` (entry), `app/styles/screens/studio.css` + `app/globals.css` (import), `components/workspace-shell.tsx` (conversation-prefix chrome), `lib/studio/client.ts`, `e2e/acceptance/conversation-studio.spec.ts`.
- Report: `docs/implementation/owner-platform-v1/CONVERSATION-STUDIO-REPORT.md`.

## 14. Deliberately out of scope (v1.1+)

Automatic conversation titles from the model (v1 derives from the first message), cross-member shared threads, attachments/uploads in the composer, voice, true token streaming for the explain/draft branches, regenerated answers, message editing/deletion, inline approve/export (stays on the action page by design), and a public (unauthenticated) Studio. None of these is needed to satisfy the persistent-continuous-chat requirement.

## 15. Implementation outcome (2026-11-09, Path A)

Delivered on `feat/conversation-studio`, rebased/merged onto the current Kinnso OS `main`; the full record and evidence are in `docs/implementation/owner-platform-v1/CONVERSATION-STUDIO-REPORT.md`.

- **Path A integration:** `main` already shipped the approved conversation workbench (`/conversation`, `CONVERSATION_HOME_ENABLED`) and migrations 0019/0020. The Studio is now its persistent, model-backed mode behind `CONVERSATION_STUDIO_ENABLED` + `CONVERSATION_HOME_ENABLED`, mounted at `/conversation/studio`, entered from the workbench. **Today remains the default workspace URL**; earlier sketches of a Studio-first nav/root redirect were withdrawn.
- **Migration number is 0021**, layered on the conversation workstream's 0019/0020. No existing object is modified; the rollout pins journal 1–20 and records row 21.
- **Verified locally:** `db:verify` (0001–0021, replay empty, 48 tables / 560 columns / 261 constraints / 132 indexes / 16 triggers / 33 functions), typecheck, lint, the full unit and Docker integration suites, `next build`, JS budget, the Studio acceptance spec against a real fixture stack, the secret-boundary gate and the rollout pin (exact numbers in the report).
- **Small contract additions:** `StudioCopy.rail.rename`, `StudioCopy.thread.loadEarlier` and `StudioCopy.header.openStudio`; `AssistantSurface` gains `studio` (the sheet never renders it) so `runLiveAssistant` audits the real surface.
- **E2E is opt-in:** `test/e2e/safety.ts` forwards both conversation flags only when the runner sets `CONVERSATION_STUDIO_ENABLED=true`, so the default acceptance suite is unchanged.
- **Not run:** hosted deployment, hosted migration, real-gateway streaming smoke test.
