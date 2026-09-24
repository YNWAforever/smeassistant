# P3.5a: spend budgets

**Date:** 2026-09-25 · **Status:** approved in brainstorming, awaiting spec review · **Base:** `main` at `96519fc`

## What this closes

The Master Plan's P3.5 requires "Workspace/provider spend budgets and a global safe limit, enforced before dispatch and bounded across retries. Delivery allowance and anti-abuse/compute budget are different controls; explain them separately."

Nothing in this app caps paid provider work today:

- **Public scans** are limited only by `scan_start` (10 per hour per IP, fail-open).
- **Owner rescans** are limited by the paid tier and a 3-per-day rate limit keyed on workspace × IP.
- **AI drafts** have per-request rate limits only.

A runaway loop, a crawler cycling IPs, or a single heavy workspace can run up SerpApi, RapidAPI, Google Places and LLM spend with no bound. This slice adds budgets, which are separate from the delivery allowance (`workspace_usage`). The delivery allowance limits what an owner may *ship*. A budget limits what the app may *spend* producing evidence and drafts.

## Decisions (owner, 2026-09-25)

| Question | Decision |
|---|---|
| Unit | Scans are counted as **scan attempts, retries included**. AI is counted as the **US$ `cost_usd` already recorded** per run. No invented provider prices. |
| At the limit | **Refuse new work, before any provider call, with an honest localised message.** Scheduled or cron-driven retries are skipped and retried later. Work already accepted finishes. |
| Configuration | **Environment variables.** Conservative built-in global defaults apply from the first deploy. Per-workspace limits are off until set. |
| Counting | A new **attempt log**, written by the claim statement itself (migration `0009`). |

## Current state (from exploration, `main` at `96519fc`)

- **`audit_jobs` rows are created only by `jobsRepository.insert`** (`lib/repositories/jobs.ts:44-70`). It has two callers:
  - `POST /api/scan/start` → `insertScanJob` (`lib/scan/start-job.ts`). There is no workspace at that point.
  - `POST /api/workspaces/[workspaceId]/rescan` → `enqueueRescan` (`lib/workspace/rescan.ts`). The workspace comes from the membership.

  Cron dispatch creates no jobs (`lib/scan/notify-due-schedules.ts`).
- **The production claim is an inline `UPDATE`** in `lib/scan/execution-store.ts:45-55`. It increments `attempt_count` and overwrites `last_attempt_at`. Every claim goes through `POST /api/scan/process`. Its callers are:
  - the scanning page, on mount and from its "Resume" button;
  - the rescan client, immediately after queueing;
  - the cron reclaim, which POSTs `/api/scan/process` for up to 20 claimable jobs.

  The SQL function `claim_audit_job` has no production caller.
- **Only the latest attempt time is stored.** Past attempts in a window cannot be rebuilt from existing rows.
- **AI calls go through `llmComplete`** (`lib/llm.ts`):
  - Owner draft runs (`lib/workspace/runs.ts`) and successful assistant drafts (`lib/assistant/live.ts`) persist `action_runs.cost_usd`, and `workspace_id` is known.
  - Failed assistant drafts persist nothing.
  - Report summaries (`lib/llm-summary.ts`) persist no cost, may have no workspace, and are cached once per report and locale.
  - `action_runs` has no index.
- **The existing limiter can't express these limits.** `enforceRateLimit` always appends the caller's IP fingerprint to the key, and `consume_rate_limit` is a +1 fixed-window counter. Neither can express a per-workspace or global cap, or a dollar sum.

## Design

### Checks

| Entry point | What is checked | Refusal |
|---|---|---|
| `POST /api/scan/start` | global attempts in the last 24 h + pending jobs ≥ global scan limit | `503 { error: "at_capacity" }` |
| `POST /api/workspaces/[id]/rescan` | the same global check; then that workspace's attempts in 24 h + its pending jobs ≥ workspace scan limit | `503 at_capacity` (global) or `429 { error: "workspace_scan_budget_reached" }` (workspace) |
| The claim of a **retry** (`attempt_count > 0`) in `execution-store.ts` | the same counts as admission (attempts in 24 h + pending jobs), against the global and workspace scan limits, inside the claim statement | Not claimed. `runScan` returns a new `at_capacity` outcome, which the process route maps to `503 at_capacity`. The cron reclaim treats it as "skip, retry on a later tick". |
| `runAgentForAction` (`lib/workspace/runs.ts`) and assistant `draft()` (`lib/assistant/live.ts`) | the sum of `action_runs.cost_usd` in 24 h, globally and for the workspace, ≥ the dollar limit | `429 { error: "ai_budget_reached" }`. Nothing is sent to the LLM. |

- **"Pending jobs"** are this app's non-terminal jobs: `queued`, `collecting`, `scoring` and `persisting`, created in the last 24 h and with `attempt_count = 0`. Each counts as one reserved attempt. Counting them stops a burst of start requests from queueing past the limit before any of them has been claimed.
- **A job admitted at start or rescan has its first attempt reserved.** Its first claim (`attempt_count = 0`) is not checked again, so admitted work finishes. The claim-time check applies only to retries.
- **Windows are rolling 24 hours** (`now() - interval '24 hours'`). They have no timezone or period boundary.
- **The AI check is a pre-check.** A run that starts under the limit may finish above it by that run's cost. Runs are bounded (up to 2 LLM calls, `maxTokens` 1200), so the overshoot is at most one run per concurrent request.

### Configuration: `lib/budgets/config.ts`

`readBudgetConfig(env)` follows `lib/db/config.ts`: it takes the env as a parameter, validates it, and throws coded errors.

| Variable | Unset | Accepted |
|---|---|---|
| `BUDGET_SCAN_ATTEMPTS_GLOBAL_24H` | `200` | a positive integer, or `off` |
| `BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H` | off | a positive integer, or `off` |
| `BUDGET_AI_USD_GLOBAL_24H` | `20` | a positive decimal, or `off` |
| `BUDGET_AI_USD_WORKSPACE_24H` | off | a positive decimal, or `off` |

- Any other value (zero, negative, non-numeric, empty string) throws `budget_configuration_invalid` naming the variable.
- A zero limit is rejected, because "refuse everything" is not a budget. Use the existing feature flags for that.
- The two defaults are placeholders for the owner to review, not commercial decisions. All four variables go in `.env.example`.

### Data: `neon/migrations/0009_scan_attempts.sql` (additive, re-runnable)

```sql
CREATE TABLE IF NOT EXISTS public.scan_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL REFERENCES public.audit_jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_attempts_attempted_idx ON public.scan_attempts (attempted_at);
CREATE INDEX IF NOT EXISTS scan_attempts_workspace_idx ON public.scan_attempts (workspace_id, attempted_at);
CREATE INDEX IF NOT EXISTS action_runs_created_idx ON public.action_runs (created_at);
CREATE INDEX IF NOT EXISTS action_runs_workspace_created_idx ON public.action_runs (workspace_id, created_at);
-- RLS, grants and a policy to sme_app_runtime exactly as 0006 does for action_applications.
```

- **Why cascade on job delete:** attempts are the job's own cost history.
- **Why set null on workspace delete:** the global count must keep attempts from deleted workspaces.

The migration also updates the schema baselines the repository pins, following 0008:
- the Drizzle schema in `lib/db/schema`;
- `test/integration/fixtures/legacy-final-catalog.json`;
- the counts in `neon-schema.integration.test.ts`;
- `db:verify`.

### The claim, as one statement

`execution-store.ts`'s claim becomes a single data-modifying CTE inside `withTransaction`:

1. Take `pg_advisory_xact_lock` on a fixed budget key. This serializes budget decisions, so two concurrent requests cannot both take the last slot.
2. Compute whether the job is a retry (`attempt_count > 0`). For a retry, compute the global and workspace counts exactly as admission does: attempts in the last 24 h plus pending jobs. A retry therefore cannot take a slot reserved for an admitted first attempt.
3. `UPDATE audit_jobs … WHERE id = $1 AND <claimable> AND (<not a retry> OR <within budget>) RETURNING *`.
4. `INSERT INTO scan_attempts (job_id, workspace_id) SELECT id, workspace_id FROM updated`.

Every claim writes exactly one attempt row. A claim cannot happen without its row, and a row cannot exist without its claim.

The store distinguishes three outcomes:
- zero rows because the job is not claimable → `already_claimed`, as today;
- zero rows because the budget refused a retry → a new `at_capacity` outcome;
- a row → claimed.

The start and rescan checks run under the same advisory lock, inside the transaction that inserts the job (`jobsRepository.insert`). So admission and the pending count are consistent.

### Failure behaviour

- **An error in a budget query refuses the work** (`at_capacity` / `ai_budget_reached`), never lets it through unmetered. The same database error would stop the scan or run anyway, so this adds no new outage.
- **Every refusal logs one fixed line:** `console.warn("[budget] refused", { scope, entry, used, limit })`.
  - `scope` is one of `scan_global | scan_workspace | ai_global | ai_workspace`.
  - `entry` is one of `scan_start | rescan | retry_claim | ai_run | assistant_draft`.
  - `used` and `limit` are numbers.
  - No business names, emails or ids.

### What people see (en · zh-HK · zh-TW)

| Where | When | Copy (en) |
|---|---|---|
| Public scan page (`components/scan-page.tsx`, copy in `lib/messages/*.json`) | `503 at_capacity` | "Free scans are at capacity right now. Please try again in a few hours." This replaces today's raw server string for this case. |
| Scanning page "Resume" | `503 at_capacity` | "Scanning is at capacity right now, so this scan will continue later. You can close this page." |
| Rescan button (`components/workspace/rescan-button.tsx` inline `COPY`) | `429 workspace_scan_budget_reached` / `503 at_capacity` | "This workspace has reached today's scan limit. Try again tomorrow." / the at-capacity text |
| Action detail, Create, assistant sheet | `429 ai_budget_reached` | "Today's AI drafting limit has been reached. Try again later." |

The zh-HK and zh-TW copy follows the repository register rules: 香港書面中文, 台灣用語, and 工作台 as the workspace term.

### Targeted improvement

Failed assistant drafts record their cost. When `live.ts`'s `draft()` fails after an LLM call (a parse failure, or missing facts), it persists an `action_runs` row with `state = 'failed'` and the measured `cost_usd`, so the AI budget sees the spend.

## Amendments made during planning (2026-09-25)

Reading the code changed the design in these places. Each is resolved in `docs/superpowers/plans/2026-09-25-spend-budgets.md`.

1. **The advisory lock is the first statement of its transaction.** It is not inside the claim statement. Under READ COMMITTED a statement's snapshot is taken when it starts, so a lock acquired mid-statement would count from a snapshot older than the lock. The claim's UPDATE and attempt INSERT remain one data-modifying CTE.
2. **The budget refusal is carried host-side.** The vendored `processScan` treats any null claim as `already_claimed`. So the store reports a budget refusal through a callback, and `runScan` maps `already_claimed` to `at_capacity` when that callback fired. `packages/**` is unchanged.
3. **A SQL error inside the claim statement stays `claim_failed` (500).** The budget count is part of that one statement, so its errors cannot be told apart from other claim errors. An invalid budget configuration at claim time refuses retries and still claims first attempts. Refusals that come from a check failure, not from being over the limit, log `console.error("[budget] check_failed", { entry, reason })`.
4. **Create receives a 201.** `POST /api/actions` creates the action before running the agent, and already reports agent failures as `201 { runError }`. The Create page shows the AI-limit copy for `runError: "ai_budget_reached"`, and the action row remains.
5. **New copy lives in a `budget` namespace in `lib/messages`.** Action detail, Create and the assistant sheet use one Chinese string for both locales today, which cannot keep zh-HK and zh-TW distinct.
6. **The budget lines in `.env.example` are commented out.** An empty value is invalid, so blank lines copied into `.env.local` would refuse every scan and draft.
7. **The copy on the scanning page and the rescan button says only what is true.**
   - **Scanning page, after a refused Resume:** "Scanning is at capacity right now. This scan is saved; press Resume again in a few hours." It does not promise automatic continuation, because that depends on the cron reclaim being scheduled in production (`CRON_SECRET`, recorded as unset by P3.1).
   - **Rescan button, at global capacity:** "Scanning is at capacity right now. Please try again in a few hours." Not the public "Free scans" text.

## What does not change

- The delivery allowance (`workspace_usage`, `export_output_version`) and the rate limits.
- The vendored packages. `processScan` still calls the store's claim, and only the store's SQL changes.
- The scorer, the consent gate, and the lease rule (30 minutes, `attempt_count < 3`).

## Rollout (owner actions)

1. **Apply `0009` before deploying.** The new claim writes to `scan_attempts`, so scans fail without the table. It is applied with the same single-statement `DO` block procedure used for 0005–0008:
   - run as `neondb_owner` with `SET LOCAL ROLE smeassistant_migrator`;
   - refuse unless the journal is exactly 0001–0008;
   - record the journal row.

   The block is rehearsed on a fixture matching production's roles first.
2. **Deploy `main`.** The global defaults apply immediately.
3. **Optionally**, set or `off` the four variables in Vercel.

## Testing

- **Config:** defaults, `off`, valid values, and each invalid form throwing `budget_configuration_invalid` with the variable name.
- **Checks (unit, injected repositories):**
  - each entry point under, at and over each limit;
  - pending jobs counted;
  - a check error refusing.
- **Claim (integration, Docker Postgres):**
  - each claim writes exactly one attempt row;
  - a first attempt is not blocked at the limit;
  - a retry over the limit is left unclaimed and reports `at_capacity`;
  - two concurrent start requests at the last slot admit exactly one;
  - the AI sum reads `action_runs` in the window;
  - a failed assistant draft now records its cost.
- **UI:** component tests for each new refusal message, in three locales.
- **Mutation checks:** remove or loosen each check (the advisory lock, the retry condition, the pending count, the workspace filter, the AI pre-check) and show its named test fails.
- **Gates:** `typecheck`, `lint`, `test`, `test:integration`, `db:verify` (with 0009), and `build`, which is expected to stay blocked locally and pass in CI. `e2e` and `e2e:acceptance` run in CI.

## What this does not prove, or does not cover

- **AI runs with no recorded cost count as zero.** `computeCostUsd` returns null when the gateway omits token usage.
- **Report summaries** are not metered: no cost is persisted and there may be no workspace. They are cached once per report and locale, so they are bounded by scans.
- **Provider-level fallbacks inside one attempt** (for example the SerpApi fallback key) are not counted separately. The unit is the attempt.
- **Nothing is hosted verified** until 0009 is applied and the app is deployed.
