# P4.3 — Contextual assistant, without adding authority: design

**Date:** 2026-10-03 · **Branch:** `p43-contextual-assistant` (from `origin/main` at `ecc60df`, PR #29) · **Status:** approved in brainstorming, awaiting spec review

## Why

Master Plan §7 P4.3 (source: Capability Matrix §2 supporting mechanisms; the existing read-only assistant boundary):

- **Suggestions from state.** "Derive suggested questions from authorized current findings, selected action, missing inputs, approval queue and integration state instead of fixed per-surface text alone."
- **Four owner questions.** Answer "Why this task?", "What detail do you need?", "What changed?" and "Where do I continue?" using authorized evidence and persisted versions.
- **Point to the real control.** "Suggest the correct existing application action rather than requiring owner prompt-writing. Preserve the allowlisted intent/response contract; do not add arbitrary tools, SQL execution or cross-workspace retrieval."
- **No new authority.** Saved drafts go through the existing authorized mutation path. "The assistant still cannot approve, export, publish, change billing or claim a business independently."
- **Minimal audit.** "Audit assistant interactions through the host service with appropriate minimized metadata."

Phase 4 acceptance gate (§7.2): "the assistant provides authorized context without mutation authority".

This is the last Phase 4 core slice, in the order chosen on 2026-09-30: P4.4 → P4.1 → P4.2 → **P4.3**. P4.5 and P4.6 stay unbuilt.

### Baseline at `ecc60df`

- **The sheet.** `components/pocket-assistant/assistant-sheet.tsx` (`ContextualAssistant`) shows a fixed question list per surface (`surfaceQuestions`), posts to `POST /api/assistant/run` and renders `answer`, `evidenceRefs`, a plain-text `nextAction`, warnings and an optional draft artifact.
- **Live mounts (5):**
  - the shell topbar, `components/product-ui.tsx:468`, with context `workspace.assistant`;
  - the Home brief, `components/workspace/home-brief.tsx:104`;
  - the Actions list, `components/workspace/actions-list-view.tsx:86`;
  - Create, `components/workspace/create-view.tsx:167`;
  - Action detail, `components/workspace/action-detail-client.tsx:764`.

  The demo and public mounts (landing, public demo workspace, sample report) stay in demo mode.
- **Contract.** `lib/pocket-assistant/contracts.ts`: 13 intents in `demoQuestionIds`, `DemoAssistantRunResponse`, and `AssistantContext` (`workspaceId`, `locationId?`, `snapshotId?`, `actionId?`, `versionId?`).
- **Live answers.** `lib/assistant/live.ts` resolves context with workspace and scope checks. The eight `TEMPLATE_INTENTS` (`lib/assistant/templates.ts`) are deterministic, and five draft intents call one agent.
  - `explain_priority` already answers "Why this task?".
  - `explain_change` already answers "What changed?".
  - Nothing answers "What detail do you need?" or "Where do I continue?".
- **Route.** `app/api/assistant/run/route.ts`:
  - checks membership, with a manager floor for draft intents;
  - applies the P3.5d pause to drafts only;
  - applies the `assistant_run` rate limit (60/h per user);
  - writes `assistant.run` with `{ intent, surface, artifact }`.
- **Missing inputs.** The action page shows the input form from `action.missingInputs` when `actionState === "needs_input"`, excluding `offer_id` (`action-detail-client.tsx:280`). `ActionOverview` (`lib/workspace/overview.ts`) carries `missingInputs` and `blockingInputs`. Owner-facing labels live in `copy[locale].workspace.inputs`.
- **Google connection.** `oauth_connections.status ∈ active | expired | revoked | error` (`0002_business.sql:547`). Action derivation already reads the latest `google_gbp` row (`lib/repositories/action-derivation.ts:64`) and raises a `google-reconnect` action. Settings → Integrations is owner-only.
- **Action page addressing.** `/{locale}/owner/{workspaceSlug}/actions/{actionId}` always selects the newest version (`versions[0]`). There is no `?version=` parameter and no anchor on the input form.

## Decisions (user, 2026-10-03)

| Question | Decision |
|---|---|
| How far "suggest the next step" goes | **Link to the right page.** The answer ends with a link button to the exact place. The owner uses the real control there. The assistant gains no mutation power. |
| Which signals raise a suggestion | **Missing inputs, drafts awaiting approval, Google connection broken.** Pack and offer signals are out of scope. |
| How suggestions sit with today's questions | **Suggestions first, fixed list below.** Up to 3 "Needs you now" questions, then the page's existing questions with duplicates removed. With no signals, the sheet looks as it does today. |
| Architecture | **A suggestions endpoint the sheet calls when it opens**, two new deterministic intents, and a typed `nextStep` that the browser maps to a link. Flag `CONTEXTUAL_ASSISTANT_ENABLED`. No migration. |

## 1. Contract — `lib/pocket-assistant/contracts.ts`

All changes are additive.

- `demoQuestionIds` gains `"explain_missing_inputs"` and `"where_to_continue"`.
  - Every `Record<DemoQuestionId, …>` keeps compiling: the demo runner and the sheet's label table each get an entry for both.
  - The demo answer is a fixed, sanitized line saying the question is only answered inside a real workspace. The sheet never offers either intent in demo mode, because they appear only as live suggestions.
- New types:

```ts
export const nextStepKinds = ["provide_inputs", "review_version", "open_integrations", "open_action", "open_actions"] as const
export type NextStepKind = (typeof nextStepKinds)[number]
export type AssistantNextStep = { kind: NextStepKind; actionId?: string; versionId?: string }

export type AssistantSuggestion = {
  id: string                        // "missing_inputs:<actionId>" | "review_version:<versionId>" | "google:<status>"
  intentId: "explain_missing_inputs" | "where_to_continue"
  label: { actionTitle?: LocalizedText }   // only what the label renders; never evidence or customer text
  context: AssistantContext         // the ids the run request will carry
  nextStep?: AssistantNextStep       // absent for viewers
}
```

- `DemoAssistantRunResponse` gains `nextStep?: AssistantNextStep`. The text `nextAction` stays, so older callers and demo mode are unchanged.
- `AssistantRunRequest` gains `origin?: "suggested" | "fixed"`, used only for the audit.

## 2. Signals — `lib/assistant/signals.ts` (pure)

`buildSuggestions(input): AssistantSuggestion[]`

- **Input:**
  - `membership` (role and `location_scope`);
  - `focusedActionId?`;
  - open actions with their overviews (in the caller's location);
  - waiting versions (§4);
  - the latest `google_gbp` status, or `null` when there is no row.
- **Output:** at most **3** suggestions, in this order, each emitted at most once:

| # | Signal | `intentId` | `nextStep` |
|---|---|---|---|
| 1 | The focused action, or otherwise the highest `priority_score` open action, with `actionState === "needs_input"` and `missingInputs` (excluding `offer_id`) non-empty | `explain_missing_inputs` | `{ kind: "provide_inputs", actionId }` |
| 2 | A version with `approval_state ∈ (draft, changes_requested)` on an open action. Pick a version of the focused action if one exists, otherwise the oldest by `created_at` | `where_to_continue` | `{ kind: "review_version", actionId, versionId }` |
| 3 | `google_gbp` status is `null`, `expired`, `revoked` or `error` | `where_to_continue` | `{ kind: "open_integrations" }` |

- **Role and scope** (the authorization matrix, CLAUDE.md §3.9):
  - An action or version outside the manager's `location_scope` never produces a suggestion.
  - Signal 3 is produced **only for owners**. Integrations is owner-only.
  - **Viewers** get signals 1 and 2 **without** `nextStep`, because they can't use those controls. Their answer says to ask an owner or manager (§3).
- Offer-template actions are excluded from signal 1. Their only missing input is the server-satisfied `offer_id`, which the offer page handles.

## 3. Answers — `lib/assistant/templates.ts`

Both new intents join `TEMPLATE_INTENTS`. They are deterministic, never call the model, never read the AI budget, and are allowed while AI is paused. All three locales are covered, with zh-TW wording where it differs.

- **`explain_missing_inputs`** answers "What detail do you need?" for the action in context, or the signal-1 action when there is no context.
  - It lists each missing input by its owner-facing label (`copy[locale].workspace.inputs`, falling back to the key).
  - It says the template cannot draft without them and that nothing is guessed (guardrail 14).
  - It ends with `nextStep: provide_inputs`.
  - When nothing is missing now, it says so and ends with `open_action`.
  - Evidence references are the action's evidence, as `explain_priority` uses today.
- **`where_to_continue`** answers "Where do I continue?".
  - **With a `versionId` in context** that is still `draft` or `changes_requested`, it names the version number, its state and the action title. It says an authorised person must approve this exact version and that nothing has been approved or sent. It ends with `review_version`.
  - **With a Google reason** (context has no version and signal 3 applies), it states the connection state and that Google evidence and the `google-reconnect` action depend on it. It ends with `open_integrations`.
  - **Otherwise**, it counts the waiting versions in scope and links to the oldest. With none, it says "Nothing is waiting for review now" and ends with `open_actions`.
- **Viewer** answers to either intent replace the next-step sentence with "Ask an owner or manager to …", and carry no `nextStep`.
- **`explain_priority`** gains `nextStep: open_action` for the action it explains. **`explain_change`** gains `nextStep: open_actions`. Their answer text is unchanged.

Answers are recomputed from fresh rows on every run, so a signal that disappeared between suggestion and question is answered truthfully (for example, the version was approved meanwhile).

## 4. Data reads — `lib/repositories/artifacts.ts`

`LiveAssistantRepository` gains two **read-only** queries. Both filter on `workspace_id` first.

- **`assistantWaitingVersions(workspaceId, locationId | null)`** returns `{ id, action_id, version_no, approval_state, created_at, location_id }`:
  - from `output_versions` joined to `actions`;
  - where `approval_state IN ('draft','changes_requested')` and `actions.action_state NOT IN ('completed','dismissed','cancelled','expired')`;
  - filtered to the location when one is given (workspace-wide actions included);
  - limit 20, ordered by `created_at`.
- **`assistantGoogleConnection(workspaceId)`** returns `{ status } | null`. It is the same row selection as `action-derivation.ts:64`.

Open actions and their overviews come from the existing `assistantActions` and `buildActionOverview`. No migration is needed: every signal reads existing tables.

## 5. Routes

### 5.1 `GET /api/assistant/suggestions` (new)

- Query: `workspaceId` (required), `locationId?`, `actionId?`, `versionId?`. All are UUIDs; anything malformed returns 400.
- **Flag off:** `200 { suggestions: [] }` before any auth or SQL.
- `authorizeWorkspaceRequest({ id: workspaceId })` returns 401/403/404 as the run route does.
- `actionId` and `versionId` are resolved with the existing `actionScope` / `versionScope` checks. A mismatched workspace returns 404, and so does a version that doesn't belong to the action.
- Rate limit scope **`assistant_suggestions`**: 120/h per user, fail-closed.
- Returns `{ suggestions: AssistantSuggestion[] }` with `Cache-Control: no-store`.
- Writes no audit row. It is a read made every time the sheet opens.

### 5.2 `POST /api/assistant/run` (changed)

- **Flag off:** `explain_missing_inputs` and `where_to_continue` return `404 { error: "not_enabled" }` with no SQL, and no response carries `nextStep`. Rolling back is exactly unsetting the flag.
- **Flag on:**
  - both intents are answered like the other template intents, with membership only (no manager floor) and no pause or budget check;
  - `optionalOrigin` accepts only `"suggested" | "fixed"`, and anything else returns 400;
  - the `assistant.run` payload becomes `{ intent, surface, artifact, origin?, next_step_kind? }`. It gains no answer text, input values, labels or ids beyond the existing `entityId`.

## 6. Sheet and pages

### 6.1 `lib/assistant/next-step.ts` (pure)

`nextStepHref(basePath, step, location?): string | null` is the only place a `kind` becomes a URL. `basePath` is `/{locale}/owner/{workspaceSlug}`, and `?location=` is kept when given.

| `kind` | href |
|---|---|
| `provide_inputs` | `{basePath}/actions/{actionId}#inputs` |
| `review_version` | `{basePath}/actions/{actionId}?version={versionId}` |
| `open_integrations` | `{basePath}/settings/integrations` |
| `open_action` | `{basePath}/actions/{actionId}` |
| `open_actions` | `{basePath}/actions` |

It returns `null` when a required id is missing or isn't a UUID.

### 6.2 `lib/assistant/flag.ts`

`contextualAssistantEnabled(env = process.env)`: true only for the exact string `"true"`.

### 6.3 `components/pocket-assistant/assistant-sheet.tsx`

- New optional prop `basePath`. The five live mounts pass `/${locale}/owner/${workspaceSlug}`.
- In live mode, when the sheet opens, it fetches suggestions once per open. The sheet doesn't know the flag; the route returns `[]` when it's off.
  - It renders them under a **"Needs you now"** heading, above the fixed list.
  - Fixed questions with the same intent are dropped from the list below.
  - Each suggestion asks with its own `context` and `origin: "suggested"`.
  - Fixed questions send `origin: "fixed"`.
- A failed fetch, a non-2xx response or a malformed body all fall back to the fixed list silently, with no error banner.
- When a run returns `nextStep` and `nextStepHref` gives a URL, the "Recommended next step" box gains a link button (`Continue here` / `由這裡繼續`). Demo mode never renders one.
- Suggestion labels:

  | Suggestion | English | zh-HK |
  |---|---|---|
  | Missing inputs | "What detail do you need for {title}?" | 「{title}」還需要甚麼資料？ |
  | Review version | "Where do I continue?" | 我應該由哪裡繼續？ |
  | Google | "Why reconnect Google?" | 為何要重新連接 Google？ |

  zh-TW uses Taiwanese terms.

### 6.4 Action detail page

- `app/[locale]/owner/[workspaceSlug]/actions/[actionId]/page.tsx` reads `searchParams.version`. It passes that id as the initial selection **only if** it is in `detail.versions`; otherwise it keeps today's `versions[0]`.
- In `action-detail-client.tsx`, the input-form container gets `id="inputs"`.

## 7. Authority (unchanged, by construction)

- The suggestions route and both new intents create, update and delete nothing. There are no action, run, version, delivery or usage writes.
- A link is navigation only. Every state change still happens on the page it opens, under that page's own server checks:
  - the input save on `PATCH /api/actions/[id]`;
  - approve/export through the SQL functions;
  - Integrations OAuth, owner-only.
- `nextStep` grants nothing. The server never returns a URL. A forged `?version=` that isn't this action's is ignored. A forged `context` id from another workspace returns 404.
- There is no cross-workspace read: every new query filters `workspace_id` after the membership check, and the location filter follows `location_scope`.

## 8. Not in this slice

- Pack and offer signals.
- Model-written explanations.
- Free-text questions.
- In-sheet buttons that run, save, approve or export anything.
- Any change to demo, public or sample-report surfaces.
- Any migration.

## 9. Testing

No real model, no paid provider and no mail; the fake LLM stays injected where the run route is exercised.

- **`signals.test.ts`:**
  - order and the cap of 3;
  - the focused action and focused version are preferred;
  - an out-of-scope manager gets nothing for out-of-scope rows;
  - Google appears only for owners, for each of `null`, `expired`, `revoked` and `error`, and not for `active`;
  - viewers get no `nextStep`;
  - offer actions are excluded;
  - an empty state gives `[]`.
- **`next-step.test.ts`:** every `kind`, `?location=` carry-over, and a missing or non-UUID id gives `null`.
- **`templates.test.ts`:**
  - both intents in en, zh-HK and zh-TW;
  - labels resolve, with a fallback to the key;
  - the "nothing missing" and "nothing waiting" branches;
  - viewer wording;
  - `nextStep` on `explain_priority` / `explain_change`, with their text unchanged (the existing assertions stay).
- **`app/api/assistant/suggestions/route.test.ts`:**
  - flag off means zero repository and auth calls;
  - 400/401/403/404;
  - the rate limit;
  - a mismatched version or action gives 404.
- **`app/api/assistant/run/route.test.ts`:**
  - the new intents return 404 `not_enabled` when the flag is off;
  - when on, they need no manager role and keep working while AI is paused;
  - the audit payload has only `origin` / `next_step_kind` added;
  - a bad `origin` gives 400.
- **`assistant-sheet.test.tsx`:**
  - suggestions render first with duplicates removed;
  - the fetch-failure fallback;
  - the link renders only with an href, and never in demo mode.
- **Demo snapshot:** `lib/pocket-assistant/demo.test.ts` still passes for the 13 existing intents, and adds the two fixed demo lines.
- **Action page:** `?version=` selects a matching version and ignores a foreign one, and `#inputs` exists.
- **Integration (Neon Docker):**
  - `assistantWaitingVersions`: wrong workspace returns nothing, the location filter works, approved/rejected/superseded and closed actions are excluded;
  - `assistantGoogleConnection` picks the newest row;
  - a flag-off test records every statement and asserts the suggestions route runs none.
- **Acceptance e2e** (`e2e/acceptance/contextual-assistant.spec.ts`, flag on in `test/e2e/safety.ts`): an owner with a draft waiting opens the sheet on Home, sees "Where do I continue?", asks it, clicks **Continue here** and lands on `…/actions/{id}?version={versionId}` with that version selected.

## 10. Rollout and rollback

- **No migration.** Deploy with `CONTEXTUAL_ASSISTANT_ENABLED` unset; behaviour is identical to today. To enable, set it to `true` and redeploy.
- **Rollback:** unset the flag and redeploy. Suggestions return `[]`, the new intents are refused, and no links render. Nothing persisted depends on the flag.

## 11. Deliverables

- **Code:** `lib/assistant/{flag,signals,next-step}.ts`, the template and live changes, the repository reads, `app/api/assistant/suggestions/route.ts`, the run-route changes, the sheet changes and its five mounts, and the action page `?version=` / `#inputs`.
- **Copy:** labels and answers in en, zh-HK and zh-TW.
- **Tests:** as in §9.
- **Docs:**
  - `.env.example` (`CONTEXTUAL_ASSISTANT_ENABLED=`);
  - `docs/integration/DEPLOY.md`;
  - the P4.3 sections of `PHASE-4-REPORT.md` and `PHASE-4-TEST-RESULTS.md`;
  - `IMPLEMENTATION-TRACEABILITY.md`, mapping the Phase 4 acceptance gate's assistant clause to the authority tests.
