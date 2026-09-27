# P3.5d — Incident runbook and kill switches: design

**Date:** 2026-09-26 · **Branch:** `p35d-incident-runbook` (stacked on `p35b-failure-view`, PR #22) · **Status:** approved in brainstorming, awaiting spec review

## Why

Master Plan §6 P3.5 asks for "an incident/runbook path for disabled providers, expired OAuth, paused scheduling, failed billing synchronization and a rollback that preserves approval/billing history".

Today:

- Rollback exists only as prose (`docs/integration/DEPLOY.md` §6, `NEON-CUTOVER.md:106`), and each slice has its own mini-runbook (P3.4, P3.5a, P3.5b in `PHASE-3-REPORT.md`). There is no single incident document.
- **There is no way to stop provider or AI spend quickly.** A budget of `0` is rejected as invalid by design (`lib/budgets/config.ts`), `SCAN_SOURCES=fixture` is forced to `live` in production (`lib/scan/run.ts`), and unsetting `CRON_SECRET` stops the cron but not new scans.
- Pausing schedules needs hand-written SQL: `scan_schedules.cadence='paused'` is allowed by the schema but written by no code.
- Google token expiry is not modelled (no refresh loop; `refreshAccessToken` has no caller), billing is off (DEC-08/09), and migrations are forward-only.

## Decisions (user, 2026-09-26)

| Question | Decision |
|---|---|
| Scope | **Runbook + two kill switches**: one incident runbook for all five scenarios, plus `SCANS_PAUSED` and `AI_DRAFTS_PAUSED`. Schedule pause stays documented SQL. |
| Mechanism | **A — environment variables + redeploy** (no migration, no new state) |
| Scan pause reach | **All provider spend**: new scans, rescans **and** claims of queued jobs and retries; queued work is preserved |
| Owner message | **Distinct "paused for maintenance" copy**, not "at capacity" |

## 1. Kill switches

### Configuration — `lib/budgets/pause.ts`

```ts
export const PAUSE_VARIABLES = ["SCANS_PAUSED", "AI_DRAFTS_PAUSED"] as const;
export interface PauseConfig { scans: boolean; ai: boolean }
export class PauseConfigurationError extends Error {} // message: "pause_configuration_invalid: <VAR>"
export function readPauseConfig(env: Record<string, string | undefined>): PauseConfig;
```

- Unset or empty string → `false`. Exactly `"true"` → `true`. Any other value (`yes`, `1`, `TRUE`, `false`) → throws `PauseConfigurationError` naming the variable. (Fail loud, like `readBudgetConfig`: an operator who typed `TRUE` must not believe spend is stopped.)
- Reads only the environment, never the database, so it cannot fail on an outage.
- `.env.example` gains both variables, commented out, with one line each.
- A configuration error is treated as **paused** by every entry point (fail closed), logged once per request as `console.error("[pause] configuration_invalid", { variable })`.

### Scans (`SCANS_PAUSED=true`)

| Entry | Behaviour when paused |
|---|---|
| `POST /api/scan/start` | `admitScanJob` checks the pause **first** (before the advisory lock and counting) and throws the existing `ScanBudgetRefusal` with a new scope `scan_paused`. Nothing is written (no job, consent or event). Route → **503 `{ error: "paused" }`**. |
| `POST /api/workspaces/[id]/rescan` | Same refusal → **503 `paused`**. |
| Claim (`claimScanJob`, via `POST /api/scan/process`) | Checked first; the existing `onBudgetRefused` host callback is called with `scan_paused`; no `scan_attempts` row; the job stays `queued`/claimable. Process route → **503 `paused`**. |
| Cron `dispatch` tick | Checks the pause and **skips the reclaim dispatch** (one log line). Auto-close, reconcile and website verification still run: none spends provider money. |

`ScanBudgetScope` widens to include `scan_paused`; every existing mapping of a scan refusal to a response gains the `paused` branch.

### AI (`AI_DRAFTS_PAUSED=true`)

| Entry | Behaviour when paused |
|---|---|
| Owner draft run (`runAgentForAction`) | The AI budget pre-check (`checkAiBudget` in `lib/budgets/ai.ts`) checks the pause first and refuses with scope `ai_paused` before any run row exists → **503 `{ error: "ai_paused" }`**. Create returns it inside its existing `201 { runError }`. |
| Assistant draft | Same pre-check → refusal before any model call or failed-draft record. |
| Every other `llmComplete` caller (report summaries, translation) | Backstop: `llmComplete` returns `null` when AI is paused, before any network call. Callers already degrade on `null` (summaries absent, translations fall back to source text). |

`AiBudgetScope` widens to include `ai_paused`.

### Copy and signals

- Owner copy in a new `pause` namespace in `lib/messages/{en,zh-HK,zh-TW}.json`:
  - `pause.scans`: "Scanning is paused for maintenance. Your scan is saved; try again later." (start/rescan responses and the scanning page when the process call answers `paused`)
  - `pause.ai`: "AI drafting is paused for maintenance. Nothing was counted; try again later." (action detail, assistant, Create)
- Mapped wherever `at_capacity` and `ai_budget_reached` are mapped today (`lib/budgets/messages.ts`, the scanning page's resume handler, the action-detail toast, the assistant and Create).
- Each refusal logs `console.warn("[pause] refused", { entry })`, `entry ∈ scan_start | rescan | retry_claim | ai_run | assistant_draft | llm`.
- `/ops/failures` shows a banner while either switch is on: "Scans are paused (SCANS_PAUSED)" / "AI drafting is paused (AI_DRAFTS_PAUSED)".
- Unchanged while paused: report reading, approvals, exports, the operator page, auto-close.

## 2. The runbook — `docs/implementation/owner-platform-v1/INCIDENT-RUNBOOK.md`

One file for whoever is on call. It states that no accountable incident owner is named yet (DEC-06).

**First five minutes:** `/ops/failures` health strip (a `COLLECTION_FAILED` spike means a provider outage; failed draft runs mean the LLM; open counts); Vercel log search for `[budget]`, `[pause]`, `[ops]`, `cron_dispatch_step_failed`, `event_write_failed`; `neon:readiness` (read-only, target-guarded).

**Five scenarios**, each as Detect → Contain → Recover → Verify → Record:

1. **Provider disabled or failing** (SerpApi, RapidAPI, Places, LLM gateway). Contain with `SCANS_PAUSED` / `AI_DRAFTS_PAUSED` + redeploy, or remove one provider's key (scans then finish with that module `unavailable` and lower coverage — the runbook explains the trade-off). Recover: unset, redeploy; queued jobs resume via the cron reclaim (needs `CRON_SECRET`) or the owner's Resume; stuck scans via `/ops/failures` release.
2. **Google authorisation expired or revoked.** States plainly that nothing expires or refreshes tokens today, so this cannot currently occur; the only recovery is the owner re-authorising in Settings → Integrations; operators have no control; read-only SQL to inspect connection states.
3. **Paused scheduling.** Schedules only notify; they never dispatch a scan. Pause all: record ids, then `UPDATE scan_schedules SET cadence='paused' WHERE cadence='monthly' RETURNING id`; resume exactly those ids. Distinguish from stopping the cron (unset `CRON_SECRET`), which also stops reclaim and auto-close.
4. **Failed billing synchronisation.** Billing is off (DEC-08/09); written for when it is on. Resend the event from the Stripe dashboard (the webhook is idempotent on `stripe_event_id`); never edit `workspaces.tier` by hand; read-only SQL to compare recent `workspace_tier_events` with Stripe.
5. **Rollback that preserves history.** Roll back the app build only (Vercel promote / instant rollback). Migrations are additive, so an older build runs on a newer schema but loses the newer build's protections (e.g. rolling back past P3.5a disables budget enforcement). **Never** roll back the schema, delete rows, or restore a database snapshot over live data — that destroys approvals, deliveries, usage, tier events and the audit log. Neon point-in-time restore only into a separate branch for forensics. Forward-fix is the default; corrections are new rows, never edits.

**Appendices:** environment switch table (what it does, scenario, redeploy needed); log tag table; diagnostic queries.

### Runbook SQL — `docs/implementation/owner-platform-v1/rollout/incident-queries.sql`

- Named blocks (`-- name: <id>` / `-- mode: read | write`). Read queries: stuck scans, schedule states, connection states, recent tier events, pause-era queued jobs. Write pair: `pause_all_schedules` / `resume_schedules` (the resume takes the recorded ids as an array parameter).
- The runbook quotes each block by name; the file is the source of truth.
- An integration test parses the file and runs every block against the Docker fixture with real migrations: `read` blocks inside `BEGIN READ ONLY`, the write pair round-trips (pause then resume restores exactly the previous cadences).

## 3. Error handling

- Invalid pause value → fail closed (treated as paused) with a logged configuration error; never "spend through".
- The pause never touches the database, so it cannot itself cause an outage.
- A paused claim leaves the job exactly as it was (no `attempt_count`, `last_attempt_at` or `scan_attempts` change), so un-pausing loses nothing.

## 4. Testing

- **Unit:** `readPauseConfig` (unset, empty, `true`, invalid values → error naming the variable); every entry point returns the right code and copy (start, rescan, process, owner run, assistant, Create's `runError`); `llmComplete` returns `null` with no network call when paused; the cron tick skips reclaim but runs auto-close and reconcile when scans are paused; the operator banner; the `pause` namespace in all three locales (`tests/i18n.test.ts`).
- **Integration (`NEON_INTEGRATION=1`):** a paused start writes nothing; a paused claim writes no `scan_attempts` row and leaves the job claimable, and after un-pausing the same job claims normally; the runbook SQL file runs cleanly (read blocks read-only; the schedule pair round-trips).
- **Mutation checks:** remove each pause check in turn and confirm its named test fails.

## 5. Known limits (to record in the Phase 3 report)

- A pause needs a redeploy (about 1–2 minutes) to take effect.
- No per-provider pause beyond removing that provider's key.
- No operator UI for pausing schedules (documented SQL).
- No billing reconciliation script while billing is off.
- No named incident owner or on-call rota (DEC-06).
- Nothing is rehearsed on hosted infrastructure.
- No migration. If implementation finds one is needed, stop and ask before adding it.
