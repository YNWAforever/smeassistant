# P4.3 Contextual Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Visibility Operator sheet suggests up to three "Needs you now" questions drawn from the owner's current state. These are missing inputs, drafts awaiting approval and a broken Google connection. It answers two new deterministic questions, and its answers end with a typed link to the exact existing page. The assistant gains no new authority.

**Architecture:** A pure `buildSuggestions` sits over two new read-only repository queries. A flag-gated `GET /api/assistant/suggestions` serves it, and the sheet calls that route when it opens. Two new template intents, `explain_missing_inputs` and `where_to_continue`, extend `lib/assistant/templates.ts`. Every template answer may carry `nextStep: { kind, actionId?, versionId? }`, which the browser turns into a URL in a single pure function. Flag `CONTEXTUAL_ASSISTANT_ENABLED`. No migration.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Neon PostgreSQL through `pg` repositories, Vitest 4 with Testing Library/jsdom, Playwright 1.61, pnpm 9.12.0 via `corepack pnpm`.

**Spec:** `docs/superpowers/specs/2026-10-03-contextual-assistant-design.md` (approved 2026-10-03).

## Global Constraints

- **Flag.** `CONTEXTUAL_ASSISTANT_ENABLED` is on only for the exact string `"true"`. With it off, the behaviour is identical to `ecc60df`:
  - the suggestions route runs no auth and no SQL and returns `{ suggestions: [] }`;
  - the new intents get `404 { error: "not_enabled" }`;
  - no response carries `nextStep`.
- **No new authority.** Nothing in this slice writes to `actions`, `action_runs`, `output_versions`, `deliveries` or `workspace_usage`. Links are navigation only.
- **No model.** The new intents are deterministic. They never call `llmComplete`, never read the AI budget, and are allowed while AI is paused (P3.5d).
- **No migration and no edits to `neon/migrations/*`.** No change to vendored `packages/*`.
- **Next-step kinds**, exactly: `"provide_inputs" | "review_version" | "open_integrations" | "open_action" | "open_actions"`.
- **Cap:** at most **3** suggestions, ordered missing inputs → review version → Google.
- **Rate limit** scope `assistant_suggestions`: `{ limit: 120, windowSeconds: 3600 }`, per user, fail-closed.
- **Audit.** The `assistant.run` payload may add only `origin` (`"suggested" | "fixed"`) and `next_step_kind`. It never carries answer text, input values or labels. The suggestions route writes no audit row.
- **Roles** (CLAUDE.md §3.9):
  - Viewers get signals 1 and 2 with no `nextStep`.
  - The Google signal goes to owners only.
  - An out-of-scope manager gets nothing for out-of-scope rows.
  - "Can act" means `role !== "viewer"` and in location scope, where a workspace-wide (`null`) location is in scope.
- **Copy:** every new string exists in en, zh-HK and zh-TW. Use `localized(en, zhHK, zhTW?)` from `lib/domain.ts`. zh-TW uses Taiwanese terms where they differ.
- **Tests.** No real model, paid provider or mail. Tests use injected fakes.
- **Windows hygiene.**
  - Unit runs rewrite the line endings of `lib/agents/__snapshots__/agents.test.ts.snap` and `lib/pocket-assistant/__snapshots__/demo.test.ts.snap`. Run `git restore` on any unintended snapshot churn before committing.
  - Load-timeout flakes that pass alone are recorded, not hidden.
  - `test:integration -- <filter>` does not filter. Use `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts <files>`.
- **Commits** are conventional and prefixed `(P4.3)`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A stale suggestion.** The version a suggestion named was approved before the owner asked. The answer must say what is true now: name the next waiting version, or say "Nothing is waiting for review now". It must never name an approved version as awaiting review (test in Task 3).
2. **A forged `?version=`** naming a version of another action, or of another workspace. The action page must ignore it and select the newest version (test in Task 5).
3. **A slow or hanging suggestions request.** The fixed questions render and work immediately. Suggestions appear when they arrive, and nothing waits on them (test in Task 5).
4. **A manager scoped to one location, viewing a workspace-wide action** (`location_id` null). This is in scope, exactly as the server's `inLocationScope` treats it, so it gets the signal and the link (test in Task 2).
5. **A missing input with no owner-facing label, under zh-TW.** The answer falls back to the raw key and still reads in zh-TW, with no crash and no blank list item (test in Task 3).

---

### Task 1: Contract, flag and next-step mapper

**Files:**
- Modify: `lib/pocket-assistant/contracts.ts`, `lib/pocket-assistant/request.ts`, `lib/pocket-assistant/demo.ts`, `components/pocket-assistant/assistant-sheet.tsx` (the `labels` record only)
- Create: `lib/assistant/flag.ts`, `lib/assistant/next-step.ts`
- Test: `lib/assistant/flag.test.ts`, `lib/assistant/next-step.test.ts`, `lib/pocket-assistant/request.test.ts`, `lib/pocket-assistant/demo.test.ts`

**Interfaces:**
- Produces, in `contracts.ts`:
  - `demoQuestionIds` with `"explain_missing_inputs"` and `"where_to_continue"` appended (15 ids);
  - `nextStepKinds` (the 5 kinds, `as const`), `NextStepKind`, `AssistantNextStep = { kind: NextStepKind; actionId?: string; versionId?: string }`, `AssistantOrigin = "suggested" | "fixed"`;
  - `AssistantSuggestion = { id: string; kind: "missing_inputs" | "review_version" | "google"; intentId: "explain_missing_inputs" | "where_to_continue"; label: { actionTitle?: LocalizedText }; context: AssistantContext; nextStep?: AssistantNextStep }`. `kind` is an addition to the spec's type, so the sheet picks a label without parsing `id`;
  - `DemoAssistantRunResponse.nextStep?: AssistantNextStep`;
  - `AssistantRunRequest.origin?: AssistantOrigin`.
- Produces `contextualAssistantEnabled(env: Record<string, string | undefined> = process.env): boolean` in `lib/assistant/flag.ts`.
- Produces `nextStepHref(basePath: string, step: AssistantNextStep, location?: string): string | null` in `lib/assistant/next-step.ts`.
- Produces `buildAssistantRequest(mode, surface, intentId, locale, context?, origin?)`. It includes `origin` only in live mode when it is given.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/assistant/flag.test.ts
it("is on only for the exact string true", () => {
  expect(contextualAssistantEnabled({ CONTEXTUAL_ASSISTANT_ENABLED: "true" })).toBe(true)
  for (const v of [undefined, "", "TRUE", "1", "yes", " true"]) expect(contextualAssistantEnabled({ CONTEXTUAL_ASSISTANT_ENABLED: v })).toBe(false)
})

// lib/assistant/next-step.test.ts
const A = "11111111-1111-4111-8111-111111111111", V = "22222222-2222-4222-8222-222222222222", base = "/zh-HK/owner/kam-man"
it.each([
  [{ kind: "provide_inputs", actionId: A }, `${base}/actions/${A}#inputs`],
  [{ kind: "review_version", actionId: A, versionId: V }, `${base}/actions/${A}?version=${V}`],
  [{ kind: "open_integrations" }, `${base}/settings/integrations`],
  [{ kind: "open_action", actionId: A }, `${base}/actions/${A}`],
  [{ kind: "open_actions" }, `${base}/actions`],
])("maps %o", (step, href) => expect(nextStepHref(base, step as AssistantNextStep)).toBe(href))
it("keeps ?location= before the fragment", () => {
  expect(nextStepHref(base, { kind: "provide_inputs", actionId: A }, "tin-hau")).toBe(`${base}/actions/${A}?location=tin-hau#inputs`)
  expect(nextStepHref(base, { kind: "review_version", actionId: A, versionId: V }, "tin-hau")).toBe(`${base}/actions/${A}?version=${V}&location=tin-hau`)
})
it("returns null for a missing or non-UUID id", () => {
  expect(nextStepHref(base, { kind: "provide_inputs" })).toBeNull()
  expect(nextStepHref(base, { kind: "review_version", actionId: A })).toBeNull()
  expect(nextStepHref(base, { kind: "open_action", actionId: "../billing" })).toBeNull()
})

// lib/pocket-assistant/request.test.ts (add)
it("sends origin only in live mode", () => {
  expect(buildAssistantRequest("live", "home", "where_to_continue", "en", { workspaceId: A }, "suggested").origin).toBe("suggested")
  expect(buildAssistantRequest("demo", "home", "explain_priority", "en", undefined, "fixed").origin).toBeUndefined()
})
```

In `demo.test.ts`, add a test that `createDemoAssistantRun` returns a non-empty answer, with no `nextStep`, for both new intents in zh-HK and en.

- [ ] **Step 2: Run them and confirm they fail**

Run: `corepack pnpm exec vitest run lib/assistant/flag.test.ts lib/assistant/next-step.test.ts lib/pocket-assistant`
Expected: FAIL (modules or exports missing).

- [ ] **Step 3: Implement**

- `nextStepHref` validates ids with `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` and `encodeURIComponent`s the location.
- `demo.ts` gives `zhAnswers` and `enLabels` an entry for each new id. The answer says the question is only answered inside a real workspace, with no evidence refs and no artifact.
- The sheet's `labels` record gets entries:
  - `explain_missing_inputs`: zh 「還需要甚麼資料？」 / en "What detail do you need?"
  - `where_to_continue`: zh 「我應該由哪裡繼續？」 / en "Where do I continue?"
- Do not add either intent to any `surfaceQuestions` list.

- [ ] **Step 4: Run the tests and typecheck**

Run: `corepack pnpm exec vitest run lib/assistant lib/pocket-assistant components/pocket-assistant && corepack pnpm typecheck`
Expected: PASS. If `demo.test.ts.snap` gains exactly the two new entries, accept them with `-u`. Restore any line-ending-only churn.

- [ ] **Step 5: Commit**

`git commit -m "feat(P4.3): contract, flag and next-step links for the contextual assistant"`

---

### Task 2: Signal reads and `buildSuggestions`

**Files:**
- Modify: `lib/repositories/artifacts.ts` (two methods, added to the `LiveAssistantRepository` `Pick`)
- Create: `lib/assistant/signals.ts`, `lib/assistant/suggestions.ts`
- Test: `lib/assistant/signals.test.ts`, `lib/assistant/suggestions.test.ts`, `test/integration/neon-assistant-signals.integration.test.ts`

**Interfaces:**
- Consumes `AssistantSuggestion` and `AssistantNextStep` from Task 1.
- Produces, in `artifacts.ts`:
  - `assistantWaitingVersions(workspaceId: string, locationId: string | null): Promise<Array<{ id: string; action_id: string; version_no: number; approval_state: "draft" | "changes_requested"; created_at: string; location_id: string | null }>>`
    - from `output_versions` joined to `actions` on id and workspace;
    - `approval_state IN ('draft','changes_requested')`;
    - action state `NOT IN ('completed','dismissed','cancelled','expired')`;
    - the existing `ACTION_SCOPE_PREDICATE`;
    - `($2::uuid IS NULL OR a.location_id = $2 OR a.location_id IS NULL)`;
    - `ORDER BY v.created_at ASC, v.id ASC LIMIT 20`.
  - `assistantGoogleConnection(workspaceId: string): Promise<{ status: "active" | "expired" | "revoked" | "error" } | null>`, the same row selection as `lib/repositories/action-derivation.ts:64`.
- Produces, in `signals.ts` (pure):
  - `type GoogleStatus = "active" | "expired" | "revoked" | "error" | null`
  - `type WaitingVersion = { id: string; actionId: string; versionNo: number; approvalState: "draft" | "changes_requested"; createdAt: string; locationId: string | null }`
  - `type SignalRows = { actions: ActionOverview[]; waitingVersions: WaitingVersion[]; google: GoogleStatus }`. `actions` is in the order `assistantActions` returns, highest priority first.
  - `canAct(actor: Pick<Membership, "role" | "locationScope">, locationId: string | null): boolean`
  - `missingInputKeys(action: ActionOverview): string[]`: `missingInputs` without `offer_id`, empty unless `actionState === "needs_input"`, and empty for offer templates (`isOfferTemplate`).
  - `buildSuggestions(input: { membership: Membership; locationId?: string; focusedActionId?: string; focusedVersionId?: string; rows: SignalRows }): AssistantSuggestion[]`
- Produces, in `suggestions.ts`:
  - `loadSignalRows(db: SignalRepository, workspaceId: string, locationId: string | null): Promise<SignalRows>`, where `SignalRepository = Pick<LiveAssistantRepository, "assistantLocations" | "assistantActions" | "assistantWaitingVersions" | "assistantGoogleConnection">`. It builds overviews the way `live.ts` `overviewOf` does, with open states `recommended | needs_input | ready | in_progress`.
  - `loadSuggestions(input: { db: SignalRepository & Pick<LiveAssistantRepository, "actionScope" | "versionScope">; membership: Membership; context: AssistantContext }): Promise<AssistantSuggestion[]>`
    - The location is `context.locationId`, else the primary location, else the first location, else null. A `locationId` not in the workspace throws `AssistantAccessError("not_found")`.
    - `actionId` / `versionId` are checked with `actionScope` / `versionScope`. A different workspace, or a version of another action, throws `AssistantAccessError("not_found")`.

- [ ] **Step 1: Write the failing `signals.test.ts`**

Fixture: owner membership `{ workspaceId: W, role: "owner", locationScope: null }`, location L1, and the overviews `need` (needs_input, missingInputs `["opening_hours"]`) and `other`, built with `buildActionOverview`.

```ts
it("orders missing inputs, review version, Google and caps at 3", ...)       // ids: missing_inputs:<need>, review_version:<v1>, google:expired
it("prefers the focused action and a focused action's waiting version", ...) // focusedActionId=other with needs_input → other is used; version of other beats an older one
it("picks the oldest waiting version when nothing is focused", ...)
it("drops offer actions and offer_id from missing inputs", ...)              // template offer-instagram-post, missingInputs ["offer_id"] → no missing_inputs suggestion
it.each([null, "expired", "revoked", "error"])("raises Google %s for owners only", ...)  // manager and viewer get none
it("raises nothing for an active connection", ...)
it("gives viewers questions without nextStep", ...)                          // missing_inputs and review_version present, nextStep undefined, no google
it("gives an out-of-scope manager nothing for rows outside its scope", ...)  // locationScope [L2], rows at L1
it("treats a workspace-wide action as in scope for a scoped manager", ...)   // Review Focus 4: location null → suggestion with nextStep
it("returns [] when nothing needs the owner", ...)
it("puts only ids and titles in suggestions", ...)                           // JSON.stringify has no evidence detail or provided input values
```

Each suggestion's `context` is:
- `{ workspaceId: W, locationId?, actionId }` for missing inputs;
- the same plus `versionId` for review;
- `{ workspaceId: W, locationId? }` for Google.

Its `nextStep` is, in the same order:
- `{ kind: "provide_inputs", actionId }`;
- `{ kind: "review_version", actionId, versionId }`;
- `{ kind: "open_integrations" }`.

- [ ] **Step 2: Write the failing `suggestions.test.ts`** with a fake repository

- It resolves the primary location when none is given.
- A foreign `locationId` throws `not_found`.
- A version from another workspace throws `not_found`.
- A version of another action throws `not_found`.
- It maps rows to `WaitingVersion`, camel-cased.

- [ ] **Step 3: Write the failing integration test** in `test/integration/neon-assistant-signals.integration.test.ts`. Model the fixture setup on `test/integration/neon-work-packs.integration.test.ts`.

- `assistantWaitingVersions` returns `draft` and `changes_requested` only, in age order.
- It excludes approved, rejected and superseded versions, and versions on a `completed` or `dismissed` action.
- It excludes another workspace's versions.
- `locationId = L1` excludes L2 and includes workspace-wide.
- `assistantGoogleConnection` returns the newest row's status, and `null` when there is no row.

- [ ] **Step 4: Run and confirm the failures**

Run:
- `corepack pnpm exec vitest run lib/assistant/signals.test.ts lib/assistant/suggestions.test.ts`
- `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-assistant-signals.integration.test.ts`

Expected: FAIL.

- [ ] **Step 5: Implement** the two repository methods, `signals.ts` and `suggestions.ts`.
  - `AssistantAccessError` is imported from `lib/assistant/live.ts`.
  - `buildSuggestions` emits each kind at most once.
  - `signals.ts` stays pure and server-agnostic: `import type { Membership }` only, and `canAct` reimplements the `inLocationScope` rule rather than importing `lib/auth` at runtime. A test asserts `canAct` agrees with `inLocationScope` for owner, manager (null scope, in scope, out of scope, workspace-wide) and viewer.

- [ ] **Step 6: Run all three test files and typecheck**

Same commands plus `corepack pnpm typecheck`. Expected: PASS.

- [ ] **Step 7: Commit**

`git commit -m "feat(P4.3): read-only signals and suggestions for the assistant"`

---

### Task 3: Template answers and `nextStep` in live runs

**Files:**
- Modify: `lib/assistant/templates.ts`, `lib/assistant/live.ts`
- Test: `lib/assistant/templates.test.ts`, `lib/assistant/live.test.ts`

**Interfaces:**
- Consumes `canAct`, `missingInputKeys`, `SignalRows` and `loadSignalRows` (Task 2), and `AssistantNextStep` (Task 1).
- Produces:
  - `TEMPLATE_INTENTS` plus `"explain_missing_inputs"` and `"where_to_continue"`.
  - `TemplateAnswer.nextStep?: AssistantNextStep`.
  - `TemplateContext` gains optional fields:
    - `actor?: Pick<Membership, "role" | "locationScope">` (absent = no role restriction, which keeps existing fixtures valid);
    - `signals?: SignalRows`;
    - `focusedVersionId?: string`.
  - `LiveRunInput.contextual?: boolean` (default `false`). When false, `runLiveAssistant` strips `nextStep` from every answer.

**Answer rules (spec §3):**
- Both new intents are answered **before** the `!ctx.snapshot` early return, because they need no snapshot.
- **`explain_missing_inputs`**
  - Uses `ctx.action`, or else the first `ctx.signals.actions` entry whose `missingInputKeys` is non-empty.
  - Lists the keys through `copy[locale].workspace.inputs[key] ?? key`.
  - Explains that the template cannot draft without them and nothing is guessed, then `nextStep: provide_inputs`.
  - When nothing is missing, says so with `open_action` (or `open_actions` when there is no action).
- **`where_to_continue`**, in this order:
  1. If `focusedVersionId` is in `signals.waitingVersions`, name `v{versionNo}`, its state and the action title, say an authorised person must approve this exact version and nothing has been approved or sent, and end with `review_version`.
  2. Else, if there is no `focusedVersionId`, the actor is an owner (or absent) and `signals.google` is not `"active"`, state the connection state and end with `open_integrations`.
  3. Else, count `waitingVersions` the actor can see and name the oldest with `review_version`.
  4. Else, "Nothing is waiting for review now" with `open_actions`.
- **Viewer, or `canAct` false for the target location:** the new intents' answers say "Ask an owner or manager to …" and carry no `nextStep`.
- `explain_priority` adds `nextStep: { kind: "open_action", actionId }` for the action it explains. `explain_change` adds `{ kind: "open_actions" }`. Their `answer` text is byte-identical.

**`live.ts`:**
- For the two new intents, call `loadSignalRows(db, workspaceId, resolvedLocationId)`. Pass `actor = { role, locationScope }`, `signals` and `focusedVersionId = context.versionId` into `templateContext`.
- `completed()` copies `answer.nextStep` onto the response only when `input.contextual`.
- No other intent loads signal rows.

- [ ] **Step 1: Write the failing `templates.test.ts` cases**

```ts
it.each(["en", "zh-HK", "zh-TW"])("lists missing inputs by label in %s and links to the form", ...)
it("falls back to the raw key under zh-TW when an input has no label", ...)   // Review Focus 5: key "made_up_key" appears verbatim
it("says nothing is missing when the action is ready", ...)                  // nextStep open_action
it("answers without a snapshot", ...)                                         // snapshot null → not the NO_SNAPSHOT text
it("names the focused waiting version", ...)                                  // contains "v2", nextStep review_version with that id
it("answers truthfully when the focused version was approved meanwhile", ...) // Review Focus 1: focused id absent from waitingVersions → names the oldest other, never the approved one
it("says nothing is waiting when the queue is empty", ...)                    // nextStep open_actions
it("explains a broken Google connection to owners", ...)                      // google "revoked", no focusedVersionId → open_integrations
it("never offers Google to a manager", ...)                                   // manager → falls through to the waiting/nothing branches
it("tells viewers to ask an owner or manager, with no nextStep", ...)
it("adds nextStep to explain_priority and explain_change without changing their text", ...)
```

- [ ] **Step 2: Write the failing `live.test.ts` cases**

- With `contextual: true`, `where_to_continue` returns `nextStep` and calls `assistantWaitingVersions` once.
- With `contextual` false or absent, no response carries `nextStep`, including `explain_priority`.
- `explain_priority` never calls `assistantWaitingVersions` or `assistantGoogleConnection`.
- The new intents never call `llm` or `aiSpend24h`, even with `llmReady: () => true`.

- [ ] **Step 3: Run and confirm the failures**

Run: `corepack pnpm exec vitest run lib/assistant/templates.test.ts lib/assistant/live.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement** the templates and the `live.ts` wiring. Strings use `localized()` in all three locales.

- [ ] **Step 5: Run `lib/assistant` and typecheck**

Run: `corepack pnpm exec vitest run lib/assistant && corepack pnpm typecheck`
Expected: PASS. The existing template assertions are unchanged.

- [ ] **Step 6: Commit**

`git commit -m "feat(P4.3): answer what detail is needed and where to continue"`

---

### Task 4: Suggestions route and run-route changes

**Files:**
- Create: `app/api/assistant/suggestions/route.ts`
- Modify: `app/api/assistant/run/route.ts`, `lib/security/rate-limit.ts`
- Test: `app/api/assistant/suggestions/route.test.ts`, `app/api/assistant/run/route.test.ts`, `test/integration/neon-assistant-flag-off.integration.test.ts`

**Interfaces:**
- Consumes `contextualAssistantEnabled` (Task 1), `loadSuggestions` (Task 2), and `runLiveAssistant` with `contextual` (Task 3).
- Produces:
  - `GET /api/assistant/suggestions?workspaceId=&locationId=&actionId=&versionId=` → `200 { suggestions: AssistantSuggestion[] }`, `Cache-Control: no-store`;
  - rate-limit scope `"assistant_suggestions"`.

**Suggestions route, in order:**
1. Flag off → `200 { suggestions: [] }`, with no auth, limiter or repository call.
2. A missing, malformed or non-UUID id → `400 { error: "invalid_context" }`.
3. `authorizeWorkspaceRequest({ id: workspaceId })`; failure → `auth.status` / `auth.code`.
4. `enforceRateLimit({ req, scope: "assistant_suggestions", identifiers: [auth.user.id], failClosed: true })`.
5. `loadSuggestions({ db: artifactRepository(), membership: auth.membership, context })`.
6. `AssistantAccessError` → `{ error: code }` with its status. Anything else is logged as `{ category: "assistant_suggestions_failed" }` and returns `503 { error: "unavailable" }`.

No audit row.

**Run route:**
- Before auth: the new intents with the flag off → `404 { error: "not_enabled" }`.
- `origin` is optional. If present it must be `"suggested"` or `"fixed"`, otherwise `400 { error: "invalid_origin" }`.
- Pass `contextual: contextualAssistantEnabled()` to `runLiveAssistant`.
- The audit payload is `{ intent, surface, artifact, ...(origin ? { origin } : {}), ...(result.nextStep ? { next_step_kind: result.nextStep.kind } : {}) }`.
- The new intents follow the explain path: no manager floor, no pause check, no budget.

- [ ] **Step 1: Write the failing `suggestions/route.test.ts`**

Use the run route's test as the model for mocking auth, the limiter and the repository.

```ts
it("returns [] with the flag off and calls nothing", ...)        // auth, limiter, repository mocks: 0 calls
it.each(["", "abc", "../x"])("rejects workspaceId %j with 400", ...)
it("passes 401/403/404 from authorization through", ...)
it("returns 429 when the limiter refuses", ...)
it("returns 404 for a version of another action", ...)          // loadSuggestions throws AssistantAccessError("not_found")
it("returns suggestions with no-store", ...)
it("writes no audit row", ...)                                   // recordNeonEvent mock: 0 calls
```

- [ ] **Step 2: Add the failing `run/route.test.ts` cases**

- With the flag off, both new intents return 404 `not_enabled` before auth.
- With the flag on, a viewer gets 200 for `where_to_continue`.
- With the flag on and AI paused, `explain_missing_inputs` returns 200.
- `origin: "bogus"` returns 400.
- The audit payload equals `{ intent, surface, artifact, origin: "suggested", next_step_kind: "review_version" }` and has no `answer`.
- With the flag off, the response for `explain_priority` has no `nextStep`.

- [ ] **Step 3: Write the failing integration test** in `test/integration/neon-assistant-flag-off.integration.test.ts`. Model it on `test/integration/neon-work-packs-flag-off.integration.test.ts`: record every pool statement, call the suggestions route handler with the flag unset, and assert that zero statements ran.

- [ ] **Step 4: Run and confirm the failures**

Run:
- `corepack pnpm exec vitest run app/api/assistant`
- `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-assistant-flag-off.integration.test.ts`

Expected: FAIL.

- [ ] **Step 5: Implement** the route, the run-route changes and the rate-limit scope (`assistant_suggestions: { limit: 120, windowSeconds: 60 * 60 }`, with a one-line comment).

- [ ] **Step 6: Run both commands and typecheck**

Expected: PASS.

- [ ] **Step 7: Commit**

`git commit -m "feat(P4.3): suggestions route and contextual run-route gating"`

---

### Task 5: Sheet, mounts and action-page landing

**Files:**
- Modify:
  - `components/pocket-assistant/assistant-sheet.tsx`
  - `components/product-ui.tsx:468`
  - `components/workspace/home-brief.tsx:104`
  - `components/workspace/actions-list-view.tsx:86`
  - `components/workspace/create-view.tsx:167`
  - `components/workspace/action-detail-client.tsx` (the mount at `:764`, the initial selection at `:209-211`, and `id="inputs"` on the input-form container at `:730`)
  - `components/workspace/action-detail-view.tsx`
  - `app/[locale]/owner/[workspaceSlug]/actions/[actionId]/page.tsx`
- Test: `components/pocket-assistant/assistant-sheet.test.tsx`, plus the existing action-detail component test file (or a new `components/workspace/action-detail-version-param.test.tsx`)

**Interfaces:**
- Consumes `AssistantSuggestion`, `nextStepHref` and the extended `buildAssistantRequest` (Task 1), and the suggestions route (Task 4).
- Produces:
  - `ContextualAssistant` props `basePath?: string` and `locationParam?: string`;
  - `ActionDetailView` / client prop `initialVersionId?: string | null`.

**Sheet behaviour:**
- In live mode with a `context`, each time the sheet opens it fetches `GET /api/assistant/suggestions` with the context ids as query parameters. An `AbortController` aborts the fetch on close.
- The fixed list renders immediately and does not wait (Review Focus 3).
- A valid response renders under a heading: en "Needs you now" / zh-HK 「現在需要你處理」 / zh-TW 「現在需要你處理」.
- Suggestion labels:
  - missing inputs: en "What detail do you need for {title}?" / zh 「{title}」還需要甚麼資料？
  - review: en "Where do I continue?" / zh 我應該由哪裡繼續？
  - Google: en "Why reconnect Google?" / zh 為何要重新連接 Google？
  - `{title}` is `resolveText(label.actionTitle, locale)`.
- A suggestion asks with its own `context` and `origin: "suggested"`. Fixed questions send `origin: "fixed"` in live mode.
- Fixed questions whose intent matches a shown suggestion are dropped.
- A failed or non-2xx fetch, or a body without a `suggestions` array, shows the fixed list alone, silently.
- When `run.nextStep` exists and `basePath` is set and `nextStepHref(basePath, run.nextStep, locationParam)` returns a URL, the next-step box renders `<Link>`: "Continue here" / 由這裡繼續 (zh-TW 從這裡繼續).
- Demo mode never fetches and never renders a link.

**Mounts:**
- Each of the five live mounts passes `basePath={`/${locale}/owner/${workspaceSlug}`}`, using the slug that component already has (`workspace.slug` in `product-ui.tsx`). Where the component already holds the page's `?location=` value, it passes that as `locationParam`.
- The action page reads `searchParams.version`, a string, and passes it as `initialVersionId`.
- The client initialises `versionId`, `content` and `altText` from `versions.find((v) => v.id === initialVersionId) ?? versions[0]`.

- [ ] **Step 1: Write the failing sheet tests** (fetch mocked)

```ts
it("shows suggestions above the fixed questions", ...)                  // heading "Needs you now" precedes the first fixed question button
it("renders fixed questions while suggestions are still loading", ...)  // Review Focus 3: never-resolving fetch → fixed buttons enabled and clickable
it.each([500, "throw", { nope: 1 }])("falls back to the fixed list on %s", ...)
it("asks a suggestion with its own context and origin suggested", ...)  // POST body: intentId, context.versionId, origin "suggested"
it("renders a Continue here link from nextStep", ...)                   // href `${basePath}/actions/${A}?version=${V}`
it("renders no link without basePath or for a bad id", ...)
it("never fetches suggestions or renders a link in demo mode", ...)
```

- [ ] **Step 2: Write the failing action-page selection tests**

- `initialVersionId` matching the second version selects it and loads its body.
- An unknown id selects `versions[0]` (Review Focus 2).
- `#inputs` exists when the input form shows.

- [ ] **Step 3: Run and confirm the failures**

Run: `corepack pnpm exec vitest run components/pocket-assistant components/workspace`
Expected: FAIL in the new cases only.

- [ ] **Step 4: Implement** the sheet, the five mounts, the page `searchParams` read and the client's initial selection.

- [ ] **Step 5: Run the component tests, typecheck and lint**

Run: `corepack pnpm exec vitest run components && corepack pnpm typecheck && corepack pnpm lint`
Expected: PASS, with 0 lint errors.

- [ ] **Step 6: Commit**

`git commit -m "feat(P4.3): Needs you now suggestions and Continue here links in the sheet"`

---

### Task 6: Acceptance journey

**Files:**
- Create: `e2e/acceptance/contextual-assistant.spec.ts`
- Modify: `test/e2e/safety.ts` (add `CONTEXTUAL_ASSISTANT_ENABLED: "true"` next to `WORK_PACKS_ENABLED`), `test/e2e/safety.test.ts` (assert the new key)

**Interfaces:**
- Consumes everything above.
- Uses the acceptance fixtures and helpers that `e2e/acceptance/work-pack.spec.ts` uses (sign-in, seeded workspace, fixture LLM).

- [ ] **Step 1: Write the spec** "an owner with a waiting draft continues from the assistant":
  1. Sign in as the owner. On an action, generate a draft with the fixture LLM so a `draft` version exists.
  2. Open Home and open the sheet ("Ask why this comes first").
  3. Expect the heading "Needs you now" and the button "Where do I continue?". Click it.
  4. Expect the answer to name `v1`. Click "Continue here".
  5. Expect the URL to match `/actions/<id>\?version=<versionId>` and that version to be selected.

  Assert that no request was made to any approve, export or publish route during steps 2–4.

- [ ] **Step 2: Run it**

Run: `corepack pnpm exec playwright test --config playwright.acceptance.config.ts contextual-assistant.spec`
Expected: PASS.

If the local Turbopack radix cascade blocks the run, record that. Then re-run with a temporary, uncommitted `--webpack` in `test/e2e/environment.ts`, restore the file, and record both results.

- [ ] **Step 3: Run the safety tests**

Run: `corepack pnpm exec vitest run test/e2e/safety.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

`git commit -m "test(P4.3): acceptance journey from suggestion to the exact version"`

---

### Task 7: Docs and the full gate run

**Files:**
- Modify:
  - `.env.example`: `CONTEXTUAL_ASSISTANT_ENABLED=`, with a comment saying it is off unless exactly `true`;
  - `docs/integration/DEPLOY.md`: the flag, no migration, enable and rollback steps;
  - `docs/implementation/owner-platform-v1/PHASE-4-REPORT.md`: a P4.3 section covering what changed, decisions, rulings, known limits, owner actions, and the Phase 4 core acceptance-gate status;
  - `docs/implementation/owner-platform-v1/PHASE-4-TEST-RESULTS.md`: a P4.3 section in the P4.2 format;
  - `docs/implementation/owner-platform-v1/IMPLEMENTATION-TRACEABILITY.md`: map each P4.3 master-plan bullet, and the §7.2 assistant clause, to its files and tests.

- [ ] **Step 1: Run every gate in `.github/workflows/ci.yml`, sequentially**, and record the exit codes and counts verbatim:
  - `typecheck`, `lint`, `test`
  - `NEON_INTEGRATION=1 corepack pnpm test:integration`
  - `db:verify` (unchanged corpus 0001–0012; it must still pass)
  - `test:no-supabase`, `test:no-self-service-claim`, `eval:workflows -- --check-load`
  - `build`, `test:secret-boundary`, `e2e`, `e2e:acceptance`

  Where the local Turbopack cascade blocks a gate, record it as blocked and run the `--webpack` diagnostic, labelled as a diagnostic.

- [ ] **Step 2: Write the docs.** State plainly what is not hosted-verified and what was not run.

- [ ] **Step 3: Restore any snapshot line-ending churn.** `git status` must show only the intended doc files.

- [ ] **Step 4: Commit**

`git commit -m "docs(P4.3): record the contextual assistant, gates and rollout"`
