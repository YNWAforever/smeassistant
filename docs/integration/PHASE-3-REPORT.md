# Phase 3 report — workspace data layer: snapshots, comparability, actions, home, insights

**Date:** 2026-09-03 · **Branch:** `feat/visibility-workspace-integration` · **Base:** sme-scanner `origin/main` `b9b4151f`
**Status:** complete. Every workspace page that Phase 3 names now renders from database rows; the prototype bridge serves only
`create`, `assets` and `settings/{brand,team,billing}` until Phases 4–6.

---

## 1. What now exists

### 1.1 Snapshot engine (`lib/workspace/{module-states,metrics,snapshots}.ts`, `lib/website/checks.ts`, `lib/trends/*`)

- `deriveModuleStates` — §3.5.1: `module_results` first, legacy `module_scores` fallback copied from the report loader, `pending` only
  while the job is non-terminal, `website` derived from the checks and whether a URL was given. IG unavailable stays unavailable and is
  never scored (guardrail 2). `measuredPrimarySources` gives "n of 4 primary sources".
- `deriveMetrics` — the 26 §3.5.4 keys from `raw_data`, finding evidence (preferred when it exposes the same number),
  `aeo_surface_snapshots` presence rates and website checks. `gbp.response_rate_pct` exists only when upstream's
  `computeOwnerResponseRate` says the sample covers the population; absent keys stay absent, never zero.
- `runWebsiteChecks` — the 15 §3.6.2 checks with a 5 s fetch and an injectable `fetch`; unreachable → `evaluated 0` → website
  `unavailable`. Regex-based on purpose (no new dependency).
- `buildSnapshot` — one idempotent `scan_snapshots` row per workspace-linked job (upsert on `job_id`): states, metrics, checks,
  `diff_id` always copied from `scan_diffs`, `comparable_to` only when `comparable = true`; `snapshot.created` audit event once.
  Refuses unattached jobs (`snapshot_requires_workspace`, guardrail 15). Never computes a score (guardrail 3).
- Upstream `buildTrendModel` and `buildAeoTrendModel` ported verbatim with their tests.

### 1.2 Action derivation (`lib/workspace/{templates,priority,actions,overview}.ts`, `lib/domain.ts`, `lib/copy-workspace.ts`)

- 13 templates exactly as §3.6.1; a test pins that all 37 scorer keys plus `website.checks.faq_schema` map to one template or the
  ledger-only list, with no key mapped twice. `menu-translation` has no finding trigger (owner objective, Phase 4).
- `scorePriority` — the §3.6.3 formula with every factor persisted; deterministic; thresholds urgent ≥ 60 / high ≥ 40 / medium ≥ 20.
- `deriveActions` — negative-impact findings only (zero-impact and ledger keys ignored), grouped per template, `visibility-content`
  also from a failed FAQ check, `google-reconnect` from a missing or non-active connection. `upsertOpenActions` dedupes on
  `dedupe_key` among open actions; `closeResolvedActions` completes as measured when every source finding is in a comparable
  diff's `resolved_findings`, expires otherwise. `deriveActionsForSnapshot` writes one `action.derived` event per snapshot.
- `ActionOverview` (§3.4) with the display-phase derivation in the specified order; `lib/domain.ts` holds the shared enums and
  `lib/demo-data.ts` re-exports them unchanged. `copy[locale].workspace` carries trilingual labels for templates, factors, metrics,
  phases, states, inputs and freshness, with a key-parity test.

### 1.3 Wiring

- `lib/scan/run.ts` → `postProcessWorkspaceScan` after a `done|partial` persist: snapshot then actions for workspace jobs; never
  throws (a failure is logged under `workspace_post_process_failed` and the scan result stands).
- `POST /api/workspaces/claim` passes real `buildSnapshot` / `deriveActions` hooks; `scripts/seed-demo.ts` builds its two demo
  snapshots through the same code.

### 1.4 Read models and pages (`lib/workspace/queries-pages.ts`, `components/workspace/*`, `app/[locale]/owner/[workspaceSlug]/**`)

- `getHomeBrief` (§3.5.5), `listActions` (tab counts + location/channel/status filters), `getAction`, `getInsights`, `getActivity`,
  `getIntegrations`, `getCalendar`, `getNotifications`, plus `GET /api/workspaces/[id]/actions`.
- `?location=all` never aggregates: the home brief has no snapshot and the insights page shows per-location cards only (tested).
- Nine routes: home, actions, actions/[actionId], insights, activity, calendar, more, settings/integrations (owner-only),
  settings/notifications. Each runs `requireMembership` → `loadWorkspaceContext` → resolves `?location=` → one read model → a
  data-bound view that reuses the prototype's classes and card structure. The prototype components stay untouched for
  `/demo-workspace` and the bridge pages, so the demo renders byte-for-byte as before.
- Phase 4 mutations (generate, save, approve, request changes, reject, export) render disabled with the existing copy; no fetch.

---

## 2. Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint .` | 0 errors (36 warnings: vendored packages, upstream-verbatim test stubs) |
| `vitest run` | **120 files, 1204 tests, all passing** (Phase 2: 1136) |
| `next build` | green; the nine `[workspaceSlug]` routes and `GET /api/workspaces/[id]/actions` added |
| `playwright test` | 22 passed, 3 skipped (need Supabase / SerpApi / `E2E_MAGIC_LINK_LOCAL`) |
| `test:secret-boundary` | passed across 37 public artifacts |
| Live `next start` | the Phase 3 routes 307 to sign-in without a session; `/create` still 200 from the bridge |
| Playbook Phase 3 tests | module states (IG unavailable excluded, withheld overall never synthesised), comparability (`SCORING_VERSION_MISMATCH` → `comparable_to` null with `diff_id` kept), metrics (response rate only when measurable), derivation (dedupe, close-on-resolve, zero-impact ignored, all keys mapped), priority (deterministic), `location=all` shows no aggregate |
| `db:verify`, `test:integration`, seeded demo QA | **not run** — Docker still unavailable |

---

## 3. Notes from integration

1. **Subagents were unusable for this phase.** Every spawned agent (Fable and Opus, twelve attempts across ~45 minutes) died on
   API `529 Overloaded` before writing a file, while this session kept working. Phase 3 was therefore built directly here; the
   shared contract in the session scratchpad still documents the intended split.
2. **`computeOwnerResponseRate` is not exported from the scoring package index.** It is imported by deep path
   (`@sme-scanner/scoring/src/response-rate`); the vendored package has no `exports` map and stays verbatim (D1).
3. **`LocationSummary` gained `placeId`** so the home brief and calendar can read `scan_schedules` by place; the Phase 2 tests
   were updated for the new field.
4. **`returnTo` on the new routes points at the workspace root** without Supabase env, because the layout-level membership
   check redirects before the sub-path is known (Phase 2 behaviour); with env, the proxy gate carries the full path.

---

## 4. Known gaps and follow-ups

- Docker-dependent checks remain unexercised: migration dry run, integration suite, type generation, `seed:demo`. The seed now
  builds real snapshots through `buildSnapshot`, so a first run against Docker Postgres is the fastest way to see the home,
  actions and insights pages with rows.
- Metric `aeo.best_maps_rank` cannot be derived from the current fixtures (no Maps rank in `serpapi_runs`); it stays absent
  until the engine records one.
- `menu-translation` is only creatable from an owner objective (Phase 4 create flow); there is no F&B/menu detection in the
  website checks.
- Email notification toggles are rendered from `workspaces.notify_*` but disabled until Phase 6 wires the PATCH route.
- The insights trend renders as an accessible strip plus table rather than an SVG chart; gaps are marked, never bridged.

---

## 5. Not done, by design

No migration applied, nothing deployed, no paid provider called, `OWNER_SELF_SERVICE_CLAIM` never set. Phase 4 (action runs,
versions, approvals, export, usage) plugs into the disabled controls on the action detail page and the `output_versions` RPCs
shipped in Phase 2.
