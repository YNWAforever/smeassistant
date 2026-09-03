# Phase 5 report — Visibility Operator live mode

**Date:** 2026-09-04 · **Branch:** `feat/visibility-workspace-integration` · **Base:** sme-scanner `origin/main` `b9b4151f`
**Status:** complete. The assistant answers from the workspace's own evidence snapshots inside `/owner/*`, keeps the fixed demo
behaviour everywhere else, and never mutates state.

---

## 1. What now exists

- **`POST /api/assistant/run`** (§3.8) replaces the demo route. `mode: "demo"` is byte-for-byte today's `createDemoAssistantRun`
  with no auth and context ignored (39 snapshots pin it: 13 intents × 3 locales). `mode: "live"` requires membership of
  `context.workspaceId`, is rate-limited per user, and resolves its snapshot from `snapshotId`, else the action's source snapshot,
  else the latest for the location.
- **Evidence** (`lib/assistant/evidence.ts`): `EvidenceReference`s with `ev_<snapshotId>_<metricKey>` ids, `scanId = job_id`,
  fact types per §3.5 (Observed for measured metrics, Unknown when the comparison is not comparable or the delta is withheld), labels
  from the workspace copy, the composite change when a diff exists, and the focused action's own evidence line.
- **Template intents** (`lib/assistant/templates.ts`): explain priority / change / limits, fallback plan, compare priorities,
  explain insights, asset next step, rescan validation — deterministic, trilingual, no LLM, numbers only from metrics, the diff and
  the actions, with honest wording when the rows do not exist yet.
- **Draft intents** (`lib/assistant/live.ts`): review reply (plus a warmer variant), social post, FAQ and menu translation run the
  matching Phase 4 agent once and return an `AssistantArtifact` with `requiresApproval: true`. The assistant creates no run and no
  version; "Create a new version" in the sheet posts the artifact body to `POST /api/actions/[id]/versions` with the selected base
  version, then shows the existing toast. When the LLM is unconfigured or fails, the answer degrades to the closest template with
  the warning "AI drafting unavailable right now"; the sheet never breaks.
- **Sheet and callers**: `AssistantSurface` moved into the contracts; `ContextualAssistant` gains `mode` and `context`; the
  workspace shell topbar, home brief, actions list, action detail editor and create page pass live context (workspace, location,
  snapshot, action, version ids); landing, demo workspace, sample report and the prototype pages stay demo. Live-mode question labels
  no longer quote demo numbers, and the boundary line reads "Answers use only this workspace's evidence snapshots; nothing is
  published or approved here."

---

## 2. Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean (stale generated `.next/types` references to the deleted route cleared by rebuilding) |
| `eslint .` | 0 errors (36 warnings, unchanged) |
| `vitest run` | **149 files, 1423 tests, all passing** (Phase 4: 1349) |
| `next build` | green; `/api/assistant/run` added, `/api/pocket-assistant/demo` gone; `test:secret-boundary` passed across 41 artifacts |
| `playwright test` | 25 passed, 4 skipped (need Supabase / SerpApi / magic-link / seeded workspace) |
| Playbook Phase 5 tests | explain/compare intents: template answers with real evidence ids and the LLM mock never called; draft intents call the agent once; LLM null → template + warning, no artifact; demo output pinned by snapshot |

---

## 3. Notes from integration

1. `EvidenceReference.factType` has no `Attributed`/`Estimated`; those map to `Inference`. No current path produces them.
2. Template answers carry no artifact (the demo's `fallback_plan` and `rescan_validation` shipped a `validation_plan` artifact); the
   §3.8 split is explain → template, draft → agent, and the `validation_plan` agent exists for Phase 6's rescan flow.
3. Evidence refs also include score, coverage and the focused action so explain intents can cite them; same id scheme.

---

## 4. Not done, by design

No migration applied, nothing deployed, no LLM called in tests. Phase 6 (rescan, schedules, integrations, notifications, team,
evidence) is next; the `settings/brand` and `settings/team` pages are the last ones the prototype bridge still serves.
