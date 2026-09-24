# Spend Budgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound what the app may spend. Scans are capped by scan attempts in a rolling 24 hours, retries included, counted from a new `scan_attempts` log that the claim statement writes itself. AI drafting is capped by the `action_runs.cost_usd` already recorded in a rolling 24 hours. Limits come from four environment variables. Work over a limit is refused before any provider or model call, with honest localized copy.

**Architecture:**
- `lib/budgets/config.ts` reads and validates the four variables. `lib/budgets/log.ts` owns the two fixed log lines.
- `lib/budgets/scan.ts` owns every scan-budget SQL string: the advisory-lock key, the "used" count (attempts plus pending jobs), the admission check, and the budgeted claim statement. That statement is a data-modifying CTE that updates the job and inserts its `scan_attempts` row together.
- Admission runs inside `jobsRepository.insert`'s transaction, under the lock, before the job row is written. The claim runs inside the execution store's own transaction.
- The vendored engine only understands "a claimed job or null". The store therefore reports a budget refusal to the host through an `onBudgetRefused` callback, and `runScan` turns `already_claimed` into a new `at_capacity` outcome when that callback fired.
- `lib/budgets/ai.ts` checks the recorded AI spend, read through a new repository method, before `llmComplete` in both `runAgentForAction` and the assistant's `draft()`. Failed assistant drafts now record their cost.
- Client copy lives in a new `budget` namespace in `lib/messages/*.json`, with two helpers in `lib/budgets/messages.ts`. The scanning page and the rescan button keep their existing per-locale copy records.

**Tech Stack:** TypeScript (strict), Next.js 16 route handlers, `pg` (node-postgres), Drizzle schema, Vitest 4 (unit, jsdom for components, Docker-backed integration via `NEON_INTEGRATION=1`), `@testing-library/react`. pnpm 9.12.0 via corepack.

**Spec:** `docs/superpowers/specs/2026-09-25-spend-budgets-design.md`. Read it first. Its "Checks" table, "The claim, as one statement" and "Failure behaviour" are the contract. The section below lists every place where the code forced a different shape.

---

## Ground rules for every task

- **Worktree:** `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p35a-spend-budgets`, branch `p35a-spend-budgets`. Run every command from there. Do not `cd` to the main checkout.
- **Never** `git push`, open a PR, deploy, apply a migration to a hosted database, or run a paid scan or a live LLM call.
- **Never edit** `packages/**`, or migrations `0001`–`0008` under `neon/migrations/`. The only new migration is `0009_scan_attempts.sql`.
- **Commits:** write the message to a file in the scratchpad and use `git commit -F <file>`. End every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. New commits only; do not amend.
  - A hook blocks any command containing `git commit` together with a `-n` flag, because `-n` is git's short form of `--no-verify`. Keep `grep -n` and every other `-n` flag out of the command that commits.
- **Before every commit**, run the full `corepack pnpm test` and `corepack pnpm typecheck`, not only the focused file. Lint (`corepack pnpm lint`) must stay at the baseline of **30 warnings, 0 errors**. A new warning is a failure of the task: fix it in the new code.
- **Snapshot files:** a run may leave `lib/agents/__snapshots__/agents.test.ts.snap` and `lib/pocket-assistant/__snapshots__/demo.test.ts.snap` modified. Check them with `git diff --ignore-cr-at-eol --stat`. If that is empty, the change is line endings only: `git restore` both. Never commit them.
- **Integration tests** need Docker. Run one file with:
  `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts <file>`
  Unit tests: `corepack pnpm exec vitest run <file>`.
- **Mutation checks:** each task ends with checks proving its new tests can fail. Apply the named change, run the named test, confirm it fails, restore the change byte for byte, and confirm the test is green again. Record what you observed in your task report. A mutation that does not fail is a finding: report it, do not skip it.

---

## Where this plan departs from the spec, and why

Each item below is a place where the code does not allow the spec's literal wording. The plan follows the code. Task 10 records every item in the phase report.

1. **The lock is its own statement.** The spec lists the advisory lock as step 1 of the single claim statement. Under READ COMMITTED, a statement's snapshot is taken when the statement starts. A lock acquired inside the counting statement would therefore count from a snapshot older than the lock, and two requests could both see the last slot free. So both the claim and the admission check run `SELECT pg_advisory_xact_lock(...)` as the first statement of their transaction. The claim's `UPDATE` and its `INSERT INTO scan_attempts` are still one data-modifying CTE, so a claim and its attempt row still cannot exist without each other.
2. **`at_capacity` is carried host-side.** `packages/scan-engine/src/processor.ts` returns `{ status: "already_claimed" }` whenever `claimJob` returns `null`, and it cannot say why. The store gains an `onBudgetRefused(scope)` option. `runScan` sets a flag through it and reports `{ status: "at_capacity" }` when the engine says `already_claimed` and the flag is set. The engine is unchanged.
3. **A failing claim statement stays `claim_failed`.** At the claim, the budget count *is* the claim statement. A SQL error there cannot be told apart from a claim failure, so it keeps today's behaviour: the engine returns `failed`/`not_claimed` and the route answers 500. Nothing is claimed, so the work is still refused. An **invalid budget configuration** at claim time refuses every retry but still claims first attempts, because those were admitted already.
4. **Check failures log a second fixed line.** A refusal caused by an invalid configuration or an unreadable count has no `used`/`limit` pair. It logs `console.error("[budget] check_failed", { entry, reason })`, with `reason` either `configuration` or `query`. Over-limit refusals log exactly the spec's `console.warn("[budget] refused", { scope, entry, used, limit })`.
5. **The Create page gets a 201, not a 429.** `components/workspace/create-view.tsx` calls `POST /api/actions`, which creates the action *before* running the agent. It already reports agent errors as `201 { actionId, runError: <RunError code> }`. A budget refusal therefore arrives as `runError: "ai_budget_reached"`, and the page shows the AI-limit copy. The action row exists, which is honest: only the draft was refused.
6. **Where the AI pre-check sits.** In `runAgentForAction` it runs right after the agent is resolved, before any evidence read and before `persistence.queue`, so a refusal leaves no queued run behind. One consequence: a `social_post` action with no approved asset, which would not have called the model, is also refused while the budget is spent. In the assistant's `draft()` it runs immediately before `llmComplete`.
7. **Where the copy lives.** `action-detail-client.tsx`, `create-view.tsx` and `assistant-sheet.tsx` use `isChinese ? … : …` ternaries, which cannot keep zh-HK and zh-TW in separate registers. The AI copy and the public scan-page copy therefore go in a new app-authored `budget` namespace in `lib/messages/*.json`. That follows the `applied` and `verified` precedent, and `tests/i18n.test.ts` gains `budget` in `APP_NAMESPACES`. The upstream `scanner` namespace is left alone. The scanning page's copy goes in `lib/copy.ts` (`funnel.scanning.atCapacity`), and the rescan copy goes in the button's inline `COPY`, as the spec says.
8. **The rescan at-capacity text is new.** The spec says the rescan button shows "the at-capacity text". The public text says "Free scans…", which is untrue for a paid owner's rescan. The rescan button uses "Scanning is at capacity right now. Please try again in a few hours." This wording is an assumption for the owner to confirm.
9. **The `.env.example` lines are commented out.** By design an empty value is invalid, and it refuses all work. A developer copying `.env.example` to `.env.local` with four empty assignments would refuse every scan and draft. The four variables are documented as commented lines.
10. **Two existing integration tests change.**
    - `neon-execution` "does not reclaim a lease exactly thirty minutes old" froze `now()` by running the store's single `UPDATE` inside the test's own transaction. The claim now opens its own transaction, so the test calls `claimScanJob` on its transaction's client instead.
    - `neon-assistant-live` "withholds nonempty facts-needed output and performs no artifact persistence" asserted that no `action_runs` row exists. The targeted improvement writes exactly that row. The test now expects one failed run with its cost, and still no version and no audit event.
11. **`jobsRepository.insert` infers the entry.** The log's `entry` is `rescan` when the row carries a `workspace_id`, and `scan_start` otherwise. `POST /api/scan/start` never forwards a workspace (`lib/scan/start-job.ts`), and the rescan path always sets one. This avoids changing the insert's signature and every mock of it.

Known, not changed by this plan (Task 10 records them): `lib/db/database.types.ts` is not regenerated; it already lacks `action_applications`, and 0006 and 0008 did not regenerate it either. The pending-job count scans `audit_jobs` without a supporting index, because the spec's index list is kept exactly. The SQL function `claim_audit_job` would claim without the budget, but it has no production caller.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `lib/budgets/config.ts` | create | `readBudgetConfig(env)`, `BudgetConfig`, `BudgetConfigurationError`, the variable list and defaults (Task 1) |
| `lib/budgets/config.test.ts` | create | Defaults, `off`, valid values, every invalid form (Task 1) |
| `.env.example` | modify | The four variables, commented (Task 1) |
| `neon/migrations/0009_scan_attempts.sql` | create | `scan_attempts`, its two indexes, two `action_runs` indexes, RLS, grants, policy (Task 2) |
| `lib/db/schema/business.ts` | modify | `scanAttempts` table; two `actionRuns` indexes (Task 2) |
| `test/integration/fixtures/legacy-final-catalog.json` | modify | Table, 4 columns, 3 constraints, 5 indexes (Task 2) |
| `test/integration/neon-schema.integration.test.ts` | modify | Migration list, catalog counts, journal counts, Drizzle table count (Task 2) |
| `lib/budgets/log.ts` | create | `BudgetScope`, `BudgetEntry`, `logBudgetRefusal`, `logBudgetCheckFailed` (Task 3) |
| `lib/budgets/scan.ts` | create | Lock key, used-count SQL, `admitScanJob`, `claimScanJob`, `ScanBudgetRefusal` (Task 3) |
| `lib/budgets/scan.test.ts` | create | Unit tests with a fake client (Task 3) |
| `lib/repositories/jobs.ts` | modify | `insert` runs `admitScanJob` first, in its transaction (Task 4) |
| `lib/scan/start-job.ts`, `lib/scan/start-job.test.ts` | modify | `insertScanJob` passes a `ScanBudgetRefusal` through (Task 4) |
| `app/api/scan/start/route.ts`, `route.test.ts` | modify | `503 { error: "at_capacity" }` (Task 4) |
| `lib/workspace/rescan.ts`, `lib/workspace/rescan.test.ts` | modify | Two new refusal reasons (Task 4) |
| `app/api/workspaces/[workspaceId]/rescan/route.ts`, `route.test.ts` | modify | 503 `at_capacity`, 429 `workspace_scan_budget_reached` (Task 4) |
| `test/integration/neon-scan-admission.integration.test.ts` | create | Admission against Postgres, including the race (Task 4) |
| `lib/scan/execution-store.ts`, `lib/scan/execution-store.test.ts` | modify | Budgeted claim in its own transaction; `env` and `onBudgetRefused` options (Task 5) |
| `lib/scan/run.ts`, `lib/scan/run.test.ts` | modify | `RunScanResult` with `at_capacity` (Task 5) |
| `app/api/scan/process/route.ts`, `route.test.ts` | modify | `503 { error: "at_capacity" }` (Task 5) |
| `app/api/cron/dispatch/route.test.ts` | modify | Characterises "skip, retry on a later tick" (Task 5; the route itself is unchanged) |
| `test/integration/neon-execution.integration.test.ts` | modify | The thirty-minute lease test calls `claimScanJob` (Task 5) |
| `test/integration/neon-scan-claim-budget.integration.test.ts` | create | Claim, attempt rows, retries, race (Task 5) |
| `lib/budgets/ai.ts`, `lib/budgets/ai.test.ts` | create | `checkAiBudget`, `AiBudgetRefusal` (Task 6) |
| `lib/repositories/artifacts.ts` | modify | `aiSpend24h` (Task 6); `recordAssistantDraftFailure`, `LiveAssistantRepository` gains `aiSpend24h` (Task 7) |
| `lib/workspace/runs.ts`, `lib/workspace/runs.test.ts` | modify | Pre-check; `RunError("ai_budget_reached")`; `budgetEnv` (Task 6) |
| `app/api/actions/[actionId]/run/route.ts`, `route.test.ts` | modify | `429 { error: "ai_budget_reached" }` (Task 6) |
| `app/api/actions/_shared/test-db.ts` | modify | `makeDb` gains `aiSpend24h` (Task 6) |
| `app/api/actions/route.test.ts` | modify | Objective route reports `runError: "ai_budget_reached"` (Task 6) |
| `test/integration/neon-ai-spend.integration.test.ts` | create | The spend read against Postgres (Task 6) |
| `lib/assistant/live.ts`, `lib/assistant/live.test.ts` | modify | Pre-check, `AiBudgetRefusal`, failed-draft recording (Task 7) |
| `app/api/assistant/run/route.ts`, `route.test.ts` | modify | `429 { error: "ai_budget_reached" }` (Task 7) |
| `test/integration/neon-assistant-live.integration.test.ts` | modify | Facts-needed draft records its failed run (Task 7) |
| `lib/messages/{en,zh-HK,zh-TW}.json` | modify | `budget` namespace (Task 8) |
| `tests/i18n.test.ts` | modify | `budget` in `APP_NAMESPACES` (Task 8) |
| `lib/budgets/messages.ts`, `lib/budgets/messages.test.ts` | create | `scanStartRefusal`, `aiBudgetRefusal` (Task 8) |
| `components/scan-page.tsx` | modify | At-capacity copy (Task 8) |
| `lib/copy.ts`, `components/scanning-page.tsx`, `components/scanning-page.test.tsx` | modify | Resume at-capacity copy (Task 8) |
| `components/workspace/rescan-button.tsx`, `tests/phase6-ui.test.tsx` | modify | Two refusal messages; `rescanFailureMessage` exported (Task 8) |
| `components/workspace/action-detail-client.tsx`, `action-detail-client.test.tsx` | modify | AI-limit toast (Task 9) |
| `components/workspace/create-view.tsx`, `create-view.test.tsx` | modify | AI-limit toast on `runError` (Task 9) |
| `components/pocket-assistant/assistant-sheet.tsx`, `assistant-sheet.test.tsx` (new) | modify / create | AI-limit alert (Task 9) |
| `docs/implementation/owner-platform-v1/PHASE-3-REPORT.md`, `PHASE-3-TEST-RESULTS.md` | modify | P3.5a sections (Task 10) |

`packages/**`, `neon/migrations/0001`–`0008`, `app/api/cron/dispatch/route.ts` and `lib/repositories/scheduler.ts` need **no** change. Task 10 confirms this.

---

### Task 1: Budget configuration

**Files:**
- Create: `lib/budgets/config.ts`
- Test: `lib/budgets/config.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

Create `lib/budgets/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { BUDGET_VARIABLES, BudgetConfigurationError, readBudgetConfig } from "./config";

describe("readBudgetConfig", () => {
  it("applies the conservative global defaults and leaves per-workspace limits off", () => {
    expect(readBudgetConfig({})).toEqual({
      scanAttemptsGlobal24h: 200,
      scanAttemptsWorkspace24h: null,
      aiUsdGlobal24h: 20,
      aiUsdWorkspace24h: null,
    });
  });

  it("turns any limit off with the literal off", () => {
    expect(
      readBudgetConfig({
        BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "off",
        BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H: "off",
        BUDGET_AI_USD_GLOBAL_24H: "off",
        BUDGET_AI_USD_WORKSPACE_24H: "off",
      }),
    ).toEqual({ scanAttemptsGlobal24h: null, scanAttemptsWorkspace24h: null, aiUsdGlobal24h: null, aiUsdWorkspace24h: null });
  });

  it("reads positive integer scan limits and positive decimal AI limits", () => {
    expect(
      readBudgetConfig({
        BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "350",
        BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H: "12",
        BUDGET_AI_USD_GLOBAL_24H: "7.5",
        BUDGET_AI_USD_WORKSPACE_24H: "0.25",
      }),
    ).toEqual({ scanAttemptsGlobal24h: 350, scanAttemptsWorkspace24h: 12, aiUsdGlobal24h: 7.5, aiUsdWorkspace24h: 0.25 });
    expect(readBudgetConfig({ BUDGET_AI_USD_GLOBAL_24H: "40" }).aiUsdGlobal24h).toBe(40);
  });

  it.each([
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "0"],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "-5"],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "2.5"],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "ten"],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", ""],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", " 5"],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "OFF"],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "1e3"],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "99999999999999999999"],
    ["BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H", "0"],
    ["BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H", ""],
    ["BUDGET_AI_USD_GLOBAL_24H", "0"],
    ["BUDGET_AI_USD_GLOBAL_24H", "0.00"],
    ["BUDGET_AI_USD_GLOBAL_24H", "-1"],
    ["BUDGET_AI_USD_GLOBAL_24H", "$20"],
    ["BUDGET_AI_USD_GLOBAL_24H", ""],
    ["BUDGET_AI_USD_GLOBAL_24H", "Infinity"],
    ["BUDGET_AI_USD_GLOBAL_24H", "1."],
    ["BUDGET_AI_USD_WORKSPACE_24H", "0"],
    ["BUDGET_AI_USD_WORKSPACE_24H", "abc"],
  ] as const)("rejects %s=%j with a coded error that names only the variable", (variable, value) => {
    let thrown: unknown;
    try {
      readBudgetConfig({ [variable]: value });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BudgetConfigurationError);
    expect((thrown as BudgetConfigurationError).code).toBe("budget_configuration_invalid");
    expect((thrown as BudgetConfigurationError).variable).toBe(variable);
    expect((thrown as Error).message).toBe(`budget_configuration_invalid: ${variable}`);
  });

  it("names exactly the four documented variables", () => {
    expect([...BUDGET_VARIABLES]).toEqual([
      "BUDGET_SCAN_ATTEMPTS_GLOBAL_24H",
      "BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H",
      "BUDGET_AI_USD_GLOBAL_24H",
      "BUDGET_AI_USD_WORKSPACE_24H",
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm exec vitest run lib/budgets/config.test.ts`

Expected: FAIL, `Failed to resolve import "./config"`.

- [ ] **Step 3: Implement the configuration**

Create `lib/budgets/config.ts`:

```ts
/**
 * Spend budgets (P3.5a, docs/superpowers/specs/2026-09-25-spend-budgets-design.md).
 *
 * Follows lib/db/config.ts: the environment is a parameter, every value is
 * validated, and a bad value throws a coded error. The error names the
 * variable and never its value.
 *
 * A budget is not a feature flag. Zero is rejected, because "refuse
 * everything" is not a budget; the existing feature flags do that. An empty
 * string is rejected too, so a half-filled .env cannot silently disable a
 * limit. Values are matched exactly, with no trimming.
 */
export const BUDGET_VARIABLES = [
  "BUDGET_SCAN_ATTEMPTS_GLOBAL_24H",
  "BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H",
  "BUDGET_AI_USD_GLOBAL_24H",
  "BUDGET_AI_USD_WORKSPACE_24H",
] as const;
export type BudgetVariable = (typeof BUDGET_VARIABLES)[number];

export interface BudgetConfig {
  /** Scan attempts in a rolling 24 hours, retries included. null = off. */
  scanAttemptsGlobal24h: number | null;
  scanAttemptsWorkspace24h: number | null;
  /** Recorded action_runs.cost_usd (US$) in a rolling 24 hours. null = off. */
  aiUsdGlobal24h: number | null;
  aiUsdWorkspace24h: number | null;
}

/** Placeholders for the owner to review, not commercial decisions. */
export const DEFAULT_SCAN_ATTEMPTS_GLOBAL_24H = 200;
export const DEFAULT_AI_USD_GLOBAL_24H = 20;

export class BudgetConfigurationError extends Error {
  readonly code = "budget_configuration_invalid";
  constructor(readonly variable: BudgetVariable) {
    super(`budget_configuration_invalid: ${variable}`);
    this.name = "BudgetConfigurationError";
  }
}

const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function readLimit(
  env: Record<string, string | undefined>,
  variable: BudgetVariable,
  kind: "integer" | "decimal",
  fallback: number | null,
): number | null {
  const raw = env[variable];
  if (raw === undefined) return fallback;
  if (raw === "off") return null;
  if (kind === "integer") {
    if (!POSITIVE_INTEGER.test(raw)) throw new BudgetConfigurationError(variable);
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) throw new BudgetConfigurationError(variable);
    return value;
  }
  if (!DECIMAL.test(raw)) throw new BudgetConfigurationError(variable);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new BudgetConfigurationError(variable);
  return value;
}

export function readBudgetConfig(env: Record<string, string | undefined>): BudgetConfig {
  return {
    scanAttemptsGlobal24h: readLimit(env, "BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "integer", DEFAULT_SCAN_ATTEMPTS_GLOBAL_24H),
    scanAttemptsWorkspace24h: readLimit(env, "BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H", "integer", null),
    aiUsdGlobal24h: readLimit(env, "BUDGET_AI_USD_GLOBAL_24H", "decimal", DEFAULT_AI_USD_GLOBAL_24H),
    aiUsdWorkspace24h: readLimit(env, "BUDGET_AI_USD_WORKSPACE_24H", "decimal", null),
  };
}
```

- [ ] **Step 4: Document the variables**

In `.env.example`, replace:

```
SCAN_SOURCES=live                                              # live | fixture
```

with:

```
SCAN_SOURCES=live                                              # live | fixture
# Spend budgets (P3.5a). Rolling 24-hour windows. Unset = the default below; "off" disables that limit.
# Any other value (0, negative, non-numeric, EMPTY) refuses the work it guards, so these stay commented
# rather than blank: a copied blank line would refuse every scan and draft.
# BUDGET_SCAN_ATTEMPTS_GLOBAL_24H=200                          # scan attempts across the app, retries included; positive integer | off
# BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H=off                       # per workspace (owner rescans and their retries); positive integer | off
# BUDGET_AI_USD_GLOBAL_24H=20                                  # US$ of recorded action_runs.cost_usd across the app; positive decimal | off
# BUDGET_AI_USD_WORKSPACE_24H=off                              # per workspace; positive decimal | off
```

- [ ] **Step 5: Run it to verify it passes**

Run: `corepack pnpm exec vitest run lib/budgets/config.test.ts`

Expected: PASS (24 tests). Then run the full `corepack pnpm test` and `corepack pnpm typecheck`.

- [ ] **Step 6: Mutation checks**

1. Change `DEFAULT_SCAN_ATTEMPTS_GLOBAL_24H = 200` to `100`. "applies the conservative global defaults and leaves per-workspace limits off" must fail.
2. Change `POSITIVE_INTEGER` to `/^[0-9]+$/`. The `BUDGET_SCAN_ATTEMPTS_GLOBAL_24H="0"` and `BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H="0"` cases must fail.
3. Delete `|| value <= 0` in the decimal branch. The `BUDGET_AI_USD_GLOBAL_24H="0"`, `"0.00"` and `BUDGET_AI_USD_WORKSPACE_24H="0"` cases must fail.
4. Change `if (raw === "off") return null;` to `if (raw === "off" || raw === "") return null;`. Both `""` cases must fail.

- [ ] **Step 7: Commit**

```bash
git add lib/budgets/config.ts lib/budgets/config.test.ts .env.example
```

Commit message: `feat(P3.5a): read spend budgets from four environment variables`

---

### Task 2: Migration 0009 and every schema baseline

**Files:**
- Create: `neon/migrations/0009_scan_attempts.sql`
- Modify: `lib/db/schema/business.ts`
- Modify: `test/integration/fixtures/legacy-final-catalog.json`
- Modify: `test/integration/neon-schema.integration.test.ts`

- [ ] **Step 1: Predict the catalog delta before touching anything**

Write this down in your task report *before* running anything. `db:verify` should move:
- tables `35` → `36`;
- columns `418` → `422`;
- constraints `159` → `162`;
- indexes `87` → `92`;
- triggers `8` and functions `14` unchanged;
- migration journal `8` → `9`;
- Drizzle tables `37` → `38`.

If an observed number differs, stop and report it. Do not paste an observed number into a baseline.

- [ ] **Step 2: Update the schema test first (the failing test)**

In `test/integration/neon-schema.integration.test.ts`:

1. Replace:

```ts
    expect(await applyMigrations(owner)).toEqual(["0001_identity.sql", "0002_business.sql", "0003_workflows.sql", "0004_atomic_operations.sql", "0005_owner_removal_guard.sql", "0006_action_applications.sql", "0007_action_verification.sql", "0008_workspace_internal.sql"]);
    expect(await verifyCatalog(owner)).toMatchObject({ tables: 35, columns: 418, constraints: 159, indexes: 87, triggers: 8, functions: 14, seededRows: 0 });
```

with:

```ts
    expect(await applyMigrations(owner)).toEqual(["0001_identity.sql", "0002_business.sql", "0003_workflows.sql", "0004_atomic_operations.sql", "0005_owner_removal_guard.sql", "0006_action_applications.sql", "0007_action_verification.sql", "0008_workspace_internal.sql", "0009_scan_attempts.sql"]);
    expect(await verifyCatalog(owner)).toMatchObject({ tables: 36, columns: 422, constraints: 162, indexes: 92, triggers: 8, functions: 14, seededRows: 0 });
```

2. Replace both occurrences of:

```ts
    expect((await owner.query("SELECT count(*)::int AS n FROM neon_migrations.journal")).rows[0].n).toBe(8);
```

with:

```ts
    expect((await owner.query("SELECT count(*)::int AS n FROM neon_migrations.journal")).rows[0].n).toBe(9);
```

3. Replace `    expect(tables.length).toBe(37);` with `    expect(tables.length).toBe(38);`.

- [ ] **Step 3: Run it to verify it fails**

Run: `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-schema.integration.test.ts`

Expected: FAIL. "applies all final business objects…" fails because the applied list has no `0009_scan_attempts.sql`, and "exposes all final columns…" fails with `expected 37 to be 38`.

- [ ] **Step 4: Create the migration**

`neon/migrations/0009_scan_attempts.sql`:

```sql
-- P3.5a spend budgets (docs/superpowers/specs/2026-09-25-spend-budgets-design.md).
--
-- One row per scan claim, written by the claim statement itself
-- (lib/budgets/scan.ts BUDGETED_CLAIM_SQL), so a claim cannot happen without
-- its row and a row cannot exist without its claim. audit_jobs keeps only the
-- latest attempt time, so past attempts in a window could not be rebuilt
-- from existing rows.
--
-- ON DELETE CASCADE on the job: attempts are the job's own cost history.
-- ON DELETE SET NULL on the workspace: the global count must keep attempts
-- from deleted workspaces.
CREATE TABLE IF NOT EXISTS public.scan_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL REFERENCES public.audit_jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

-- The global and per-workspace rolling-window counts.
CREATE INDEX IF NOT EXISTS scan_attempts_attempted_idx ON public.scan_attempts (attempted_at);
CREATE INDEX IF NOT EXISTS scan_attempts_workspace_idx ON public.scan_attempts (workspace_id, attempted_at);

-- The AI spend sum over recorded action_runs.cost_usd; action_runs had no index.
CREATE INDEX IF NOT EXISTS action_runs_created_idx ON public.action_runs (created_at);
CREATE INDEX IF NOT EXISTS action_runs_workspace_created_idx ON public.action_runs (workspace_id, created_at);

-- RLS, grants and the server-only policy exactly as 0006 does for
-- action_applications. The policy is dropped first so the file is re-runnable
-- (CREATE POLICY has no IF NOT EXISTS).
ALTER TABLE public.scan_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.scan_attempts FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scan_attempts TO sme_app_runtime;
DROP POLICY IF EXISTS server_application ON public.scan_attempts;
CREATE POLICY server_application ON public.scan_attempts FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
```

- [ ] **Step 5: Add the Drizzle table and indexes**

In `lib/db/schema/business.ts`:

1. Directly before `export const scanDiffs = pgTable("scan_diffs", {`, add:

```ts
export const scanAttempts = pgTable("scan_attempts", {
 id: uuid("id").notNull().default(sql.raw("gen_random_uuid()")),
 jobId: uuid("job_id").notNull(),
 workspaceId: uuid("workspace_id"),
 attemptedAt: timestamp("attempted_at", {withTimezone:true, mode:"string"}).notNull().default(sql.raw("now()")),
}, t => [
 index("scan_attempts_attempted_idx").using("btree", sql.raw("attempted_at")),
 foreignKey({name:"scan_attempts_job_id_fkey",columns:[t.jobId],foreignColumns:[((): AnyPgColumn => auditJobs.id)()]}).onDelete("cascade"),
 primaryKey({name:"scan_attempts_pkey",columns:[t.id]}),
 index("scan_attempts_workspace_idx").using("btree", sql.raw("workspace_id, attempted_at")),
 foreignKey({name:"scan_attempts_workspace_id_fkey",columns:[t.workspaceId],foreignColumns:[((): AnyPgColumn => workspaces.id)()]}).onDelete("set null"),
 pgPolicy("server_application", {for:"all", to:"sme_app_runtime", using:sql`true`, withCheck:sql`true`}),
]).enableRLS();

```

2. In the `actionRuns` table, replace:

```ts
 foreignKey({name:"action_runs_workspace_id_fkey",columns:[t.workspaceId],foreignColumns:[((): AnyPgColumn => workspaces.id)()]}).onDelete("cascade"),
```

with:

```ts
 foreignKey({name:"action_runs_workspace_id_fkey",columns:[t.workspaceId],foreignColumns:[((): AnyPgColumn => workspaces.id)()]}).onDelete("cascade"),
 index("action_runs_created_idx").using("btree", sql.raw("created_at")),
 index("action_runs_workspace_created_idx").using("btree", sql.raw("workspace_id, created_at")),
```

That line is unique in the file: the `actions` table's own workspace foreign key is named `actions_workspace_id_fkey`.

- [ ] **Step 6: Add the catalog fixture entries**

`verifyCatalog` compares arrays in query order (`ORDER BY` table name, then ordinal or name), so each entry goes exactly where shown. In `test/integration/fixtures/legacy-final-catalog.json`:

1. **Tables.** Replace:

```json
    {
      "name": "scan_diffs",
      "rls": true
    },
```

with:

```json
    {
      "name": "scan_attempts",
      "rls": true
    },
    {
      "name": "scan_diffs",
      "rls": true
    },
```

2. **Columns.** Replace the first `scan_diffs` column's opening lines:

```json
    {
      "table_name": "scan_diffs",
      "column_name": "id",
```

with:

```json
    {
      "table_name": "scan_attempts",
      "column_name": "id",
      "ordinal_position": 1,
      "data_type": "uuid",
      "udt_name": "uuid",
      "is_nullable": "NO",
      "column_default": "gen_random_uuid()"
    },
    {
      "table_name": "scan_attempts",
      "column_name": "job_id",
      "ordinal_position": 2,
      "data_type": "uuid",
      "udt_name": "uuid",
      "is_nullable": "NO",
      "column_default": null
    },
    {
      "table_name": "scan_attempts",
      "column_name": "workspace_id",
      "ordinal_position": 3,
      "data_type": "uuid",
      "udt_name": "uuid",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "table_name": "scan_attempts",
      "column_name": "attempted_at",
      "ordinal_position": 4,
      "data_type": "timestamp with time zone",
      "udt_name": "timestamptz",
      "is_nullable": "NO",
      "column_default": "now()"
    },
    {
      "table_name": "scan_diffs",
      "column_name": "id",
```

3. **Constraints.** Replace:

```json
    {
      "table_name": "scan_diffs",
      "name": "scan_diffs_base_job_id_fkey",
```

with:

```json
    {
      "table_name": "scan_attempts",
      "name": "scan_attempts_job_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (job_id) REFERENCES audit_jobs(id) ON DELETE CASCADE"
    },
    {
      "table_name": "scan_attempts",
      "name": "scan_attempts_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)"
    },
    {
      "table_name": "scan_attempts",
      "name": "scan_attempts_workspace_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL"
    },
    {
      "table_name": "scan_diffs",
      "name": "scan_diffs_base_job_id_fkey",
```

4. **Indexes, `action_runs`.** Replace:

```json
    {
      "tablename": "action_runs",
      "indexname": "action_runs_pkey",
      "indexdef": "CREATE UNIQUE INDEX action_runs_pkey ON public.action_runs USING btree (id)"
    },
```

with:

```json
    {
      "tablename": "action_runs",
      "indexname": "action_runs_created_idx",
      "indexdef": "CREATE INDEX action_runs_created_idx ON public.action_runs USING btree (created_at)"
    },
    {
      "tablename": "action_runs",
      "indexname": "action_runs_pkey",
      "indexdef": "CREATE UNIQUE INDEX action_runs_pkey ON public.action_runs USING btree (id)"
    },
    {
      "tablename": "action_runs",
      "indexname": "action_runs_workspace_created_idx",
      "indexdef": "CREATE INDEX action_runs_workspace_created_idx ON public.action_runs USING btree (workspace_id, created_at)"
    },
```

5. **Indexes, `scan_attempts`.** Replace:

```json
    {
      "tablename": "scan_diffs",
      "indexname": "scan_diffs_base_job_id_head_job_id_key",
```

with:

```json
    {
      "tablename": "scan_attempts",
      "indexname": "scan_attempts_attempted_idx",
      "indexdef": "CREATE INDEX scan_attempts_attempted_idx ON public.scan_attempts USING btree (attempted_at)"
    },
    {
      "tablename": "scan_attempts",
      "indexname": "scan_attempts_pkey",
      "indexdef": "CREATE UNIQUE INDEX scan_attempts_pkey ON public.scan_attempts USING btree (id)"
    },
    {
      "tablename": "scan_attempts",
      "indexname": "scan_attempts_workspace_idx",
      "indexdef": "CREATE INDEX scan_attempts_workspace_idx ON public.scan_attempts USING btree (workspace_id, attempted_at)"
    },
    {
      "tablename": "scan_diffs",
      "indexname": "scan_diffs_base_job_id_head_job_id_key",
```

Then confirm the file still parses: `node -e "JSON.parse(require('fs').readFileSync('test/integration/fixtures/legacy-final-catalog.json','utf8'))"` exits 0.

- [ ] **Step 7: Run the schema test to verify it passes**

Run: `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-schema.integration.test.ts`

Expected: PASS. If `verifyCatalog` reports an order mismatch, move the entries. Never edit their content to match.

- [ ] **Step 8: Run db:verify and compare against your prediction**

Run: `corepack pnpm db:verify`

Expected: exit 0. The printed JSON lists `0009_scan_attempts.sql` last in `applied`, `replay: []`, and `tables: 36, columns: 422, constraints: 162, indexes: 92, triggers: 8, functions: 14, seededRows: 0`. Record the output. Then run the full `corepack pnpm test` and `corepack pnpm typecheck`, plus `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-readiness.integration.test.ts`, which counts the migration corpus.

- [ ] **Step 9: Mutation checks**

1. Delete the `scan_attempts_workspace_idx` line from the migration. The schema test "applies all final business objects…" must fail on "all final indexes and predicates".
2. Delete `ALTER TABLE public.scan_attempts ENABLE ROW LEVEL SECURITY;`. The same test must fail on "business tables and RLS".
3. Change `ON DELETE SET NULL` on `workspace_id` to `ON DELETE CASCADE`. The same test must fail on "constraints and deletion semantics".

- [ ] **Step 10: Commit**

```bash
git add neon/migrations/0009_scan_attempts.sql lib/db/schema/business.ts test/integration/fixtures/legacy-final-catalog.json test/integration/neon-schema.integration.test.ts
```

Commit message: `feat(P3.5a): add the scan_attempts log and action_runs time indexes (migration 0009)`

---

### Task 3: The scan-budget SQL module

**Files:**
- Create: `lib/budgets/log.ts`
- Create: `lib/budgets/scan.ts`
- Test: `lib/budgets/scan.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/budgets/scan.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADMISSION_USAGE_SQL,
  BUDGETED_CLAIM_SQL,
  PENDING_JOB_CONDITION_SQL,
  SCAN_BUDGET_LOCK_KEY,
  SCAN_BUDGET_LOCK_SQL,
  ScanBudgetRefusal,
  admitScanJob,
  claimScanJob,
} from "./scan";

afterEach(() => vi.restoreAllMocks());

/** Answers the lock with nothing and every other statement with `rows`, or throws `rows`. */
function client(rows: Array<Record<string, unknown>> | Error) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    void values;
    if (sql === SCAN_BUDGET_LOCK_SQL) return { rows: [] };
    if (rows instanceof Error) throw rows;
    return { rows };
  });
  return {
    query,
    db: { query } as unknown as Parameters<typeof admitScanJob>[0],
    statements: () => query.mock.calls.map(([sql, values]) => ({ sql, values })),
  };
}

describe("admitScanJob", () => {
  it("takes the budget lock, then counts with one statement", async () => {
    const fake = client([{ global_used: 0, workspace_used: 0 }]);
    await admitScanJob(fake.db, { workspaceId: "ws-1", entry: "rescan" }, {});
    expect(fake.statements()).toEqual([
      { sql: SCAN_BUDGET_LOCK_SQL, values: [SCAN_BUDGET_LOCK_KEY] },
      { sql: ADMISSION_USAGE_SQL, values: ["ws-1"] },
    ]);
  });

  it("admits below the default global limit of 200", async () => {
    await expect(admitScanJob(client([{ global_used: 199, workspace_used: 0 }]).db, { workspaceId: null, entry: "scan_start" }, {})).resolves.toBeUndefined();
  });

  it("refuses at the global limit with the fixed log line", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const refusal = await admitScanJob(client([{ global_used: 200, workspace_used: 0 }]).db, { workspaceId: null, entry: "scan_start" }, {}).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(ScanBudgetRefusal);
    expect(refusal).toMatchObject({ scope: "scan_global", message: "at_capacity" });
    expect(warn).toHaveBeenCalledWith("[budget] refused", { scope: "scan_global", entry: "scan_start", used: 200, limit: 200 });
  });

  it("checks the workspace limit only for a job that has a workspace", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = { BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H: "3" };
    const rows = [{ global_used: 5, workspace_used: 3 }];
    await expect(admitScanJob(client(rows).db, { workspaceId: "ws-1", entry: "rescan" }, env)).rejects.toMatchObject({ scope: "scan_workspace", message: "workspace_scan_budget_reached" });
    await expect(admitScanJob(client(rows).db, { workspaceId: null, entry: "scan_start" }, env)).resolves.toBeUndefined();
    await expect(admitScanJob(client([{ global_used: 5, workspace_used: 2 }]).db, { workspaceId: "ws-1", entry: "rescan" }, env)).resolves.toBeUndefined();
  });

  it("reports the global limit first when both are reached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "5", BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H: "3" };
    await expect(admitScanJob(client([{ global_used: 5, workspace_used: 3 }]).db, { workspaceId: "ws-1", entry: "rescan" }, env)).rejects.toMatchObject({ scope: "scan_global" });
  });

  it("neither locks nor counts when every applicable limit is off", async () => {
    const fake = client([{ global_used: 1000, workspace_used: 1000 }]);
    await admitScanJob(fake.db, { workspaceId: null, entry: "scan_start" }, { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "off" });
    await admitScanJob(fake.db, { workspaceId: "ws-1", entry: "rescan" }, { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "off" });
    expect(fake.query).not.toHaveBeenCalled();
  });

  it.each([
    ["the query fails", new Error("db down")],
    ["no row comes back", []],
    ["the count is not a number", [{ global_used: "many", workspace_used: 0 }]],
  ] as const)("refuses, with the check_failed line, when %s", async (_label, rows) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = client(rows instanceof Error ? rows : [...rows]);
    await expect(admitScanJob(fake.db, { workspaceId: null, entry: "scan_start" }, {})).rejects.toMatchObject({ scope: "scan_global", message: "at_capacity" });
    expect(error).toHaveBeenCalledWith("[budget] check_failed", { entry: "scan_start", reason: "query" });
  });

  it("refuses an invalid configuration before touching the database", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = client([{ global_used: 0, workspace_used: 0 }]);
    await expect(admitScanJob(fake.db, { workspaceId: "ws-1", entry: "rescan" }, { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "0" })).rejects.toMatchObject({ scope: "scan_global" });
    expect(fake.query).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("[budget] check_failed", { entry: "rescan", reason: "configuration" });
  });
});

describe("claimScanJob", () => {
  const claimedRow = { budget_allowed: true, budget_global_used: 3, budget_workspace_used: 0, id: "job-1", business_name: "Fixture" };

  it("claims with one statement after the lock, passing both limits", async () => {
    const fake = client([claimedRow]);
    expect(await claimScanJob(fake.db, "job-1", { BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H: "4" })).toEqual({ kind: "claimed", row: claimedRow });
    expect(fake.statements()).toEqual([
      { sql: SCAN_BUDGET_LOCK_SQL, values: [SCAN_BUDGET_LOCK_KEY] },
      { sql: BUDGETED_CLAIM_SQL, values: ["job-1", 200, 4] },
    ]);
  });

  it("reports not claimable when no row comes back, or when no job was updated", async () => {
    expect(await claimScanJob(client([]).db, "job-1", {})).toEqual({ kind: "not_claimable" });
    expect(await claimScanJob(client([{ budget_allowed: true, budget_global_used: 0, budget_workspace_used: 0, id: null }]).db, "job-1", {})).toEqual({ kind: "not_claimable" });
  });

  it("reports a retry refused on the global limit, with the fixed log line", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = client([{ budget_allowed: false, budget_global_used: 200, budget_workspace_used: 0, id: null }]);
    expect(await claimScanJob(fake.db, "job-1", {})).toEqual({ kind: "at_capacity", scope: "scan_global" });
    expect(warn).toHaveBeenCalledWith("[budget] refused", { scope: "scan_global", entry: "retry_claim", used: 200, limit: 200 });
  });

  it("reports a retry refused on the workspace limit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = client([{ budget_allowed: false, budget_global_used: 10, budget_workspace_used: 2, id: null }]);
    expect(await claimScanJob(fake.db, "job-1", { BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H: "2" })).toEqual({ kind: "at_capacity", scope: "scan_workspace" });
    expect(warn).toHaveBeenCalledWith("[budget] refused", { scope: "scan_workspace", entry: "retry_claim", used: 2, limit: 2 });
  });

  it("skips the lock, but still claims through the metered statement, when both limits are off", async () => {
    const fake = client([claimedRow]);
    expect((await claimScanJob(fake.db, "job-1", { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "off" })).kind).toBe("claimed");
    expect(fake.statements()).toEqual([{ sql: BUDGETED_CLAIM_SQL, values: ["job-1", null, null] }]);
  });

  it("refuses every retry, but not a first attempt, when the configuration is invalid", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const env = { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "zero" };
    const refused = client([{ budget_allowed: false, budget_global_used: 0, budget_workspace_used: 0, id: null }]);
    expect(await claimScanJob(refused.db, "job-1", env)).toEqual({ kind: "at_capacity", scope: "scan_global" });
    expect(refused.statements()[1]).toEqual({ sql: BUDGETED_CLAIM_SQL, values: ["job-1", 0, null] });
    expect(error).toHaveBeenCalledWith("[budget] check_failed", { entry: "retry_claim", reason: "configuration" });
    expect((await claimScanJob(client([claimedRow]).db, "job-1", env)).kind).toBe("claimed");
  });

  it("lets a SQL error propagate, so the store can report claim_failed", async () => {
    await expect(claimScanJob(client(new Error("db down")).db, "job-1", {})).rejects.toThrow("db down");
  });
});

describe("one definition of used", () => {
  it("counts the same attempts and pending jobs at admission and at the claim", () => {
    expect(PENDING_JOB_CONDITION_SQL).toBe("status IN ('queued','collecting','scoring','persisting') AND attempt_count = 0 AND created_at > now() - interval '24 hours'");
    for (const sql of [ADMISSION_USAGE_SQL, BUDGETED_CLAIM_SQL]) {
      expect(sql).toContain(PENDING_JOB_CONDITION_SQL);
      expect(sql).toContain("FROM scan_attempts WHERE attempted_at > now() - interval '24 hours'");
    }
    expect(BUDGETED_CLAIM_SQL).toContain("INSERT INTO scan_attempts (job_id, workspace_id) SELECT id, workspace_id FROM claimed");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm exec vitest run lib/budgets/scan.test.ts`

Expected: FAIL, `Failed to resolve import "./scan"`.

- [ ] **Step 3: Implement the log lines**

Create `lib/budgets/log.ts`:

```ts
/**
 * Spend-budget log lines (P3.5a). Fixed text and numbers only: no business
 * names, emails or ids.
 */
export type BudgetScope = "scan_global" | "scan_workspace" | "ai_global" | "ai_workspace";
export type BudgetEntry = "scan_start" | "rescan" | "retry_claim" | "ai_run" | "assistant_draft";

/** The one line every over-limit refusal writes. */
export function logBudgetRefusal(scope: BudgetScope, entry: BudgetEntry, used: number, limit: number): void {
  console.warn("[budget] refused", { scope, entry, used, limit });
}

/**
 * A refusal because the budget could not be evaluated: an invalid
 * configuration, or a count that could not be read. There is no used/limit
 * pair to report, so it is its own fixed line. The work is refused all the
 * same, never let through unmetered.
 */
export function logBudgetCheckFailed(entry: BudgetEntry, reason: "configuration" | "query"): void {
  console.error("[budget] check_failed", { entry, reason });
}
```

- [ ] **Step 4: Implement the scan-budget module**

Create `lib/budgets/scan.ts`:

```ts
import type { PoolClient } from "pg";

import { CLAIMABLE_JOB_CONDITION_SQL } from "../scan/claimable";
import { readBudgetConfig, type BudgetConfig } from "./config";
import { logBudgetCheckFailed, logBudgetRefusal, type BudgetEntry, type BudgetScope } from "./log";

/**
 * Scan spend budgets (P3.5a, docs/superpowers/specs/2026-09-25-spend-budgets-design.md).
 *
 * The unit is a scan attempt, retries included. "Used" is the same number at
 * every entry point: attempts logged in scan_attempts in the last 24 hours,
 * plus pending jobs (created in the last 24 hours and never claimed). Each
 * pending job holds one reserved attempt, so a burst of starts cannot queue
 * past the limit before any of them has been claimed.
 *
 * Every budget decision first takes one transaction-scoped advisory lock, as
 * a statement of its own. It cannot live inside the counting statement: under
 * READ COMMITTED a statement's snapshot is taken when the statement starts, so
 * a lock acquired mid-statement would count from a snapshot older than the
 * lock, and two requests could both see the last slot free.
 */
type Queryable = Pick<PoolClient, "query">;
type Env = Record<string, string | undefined>;

/** The single lock key for every scan-budget decision, hashed like the repo's other advisory keys. */
export const SCAN_BUDGET_LOCK_KEY = "budget:scan-attempts";
export const SCAN_BUDGET_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtextextended($1,0))";

const WINDOW_SQL = "now() - interval '24 hours'";

/** Admitted but never claimed: one reserved attempt each. */
export const PENDING_JOB_CONDITION_SQL = `status IN ('queued','collecting','scoring','persisting') AND attempt_count = 0 AND created_at > ${WINDOW_SQL}`;

/** Attempts in the window plus pending jobs, optionally for one workspace (given as a SQL expression). */
function usedSql(workspace: string | null): string {
  const scope = workspace ? `workspace_id = ${workspace} AND ` : "";
  return `((SELECT count(*) FROM scan_attempts WHERE ${scope}attempted_at > ${WINDOW_SQL}) + (SELECT count(*) FROM audit_jobs WHERE ${scope}${PENDING_JOB_CONDITION_SQL}))::int`;
}

/** $1 = the workspace id, or NULL (its count is then 0). */
export const ADMISSION_USAGE_SQL = `SELECT ${usedSql(null)} AS global_used, ${usedSql("$1::uuid")} AS workspace_used`;

/**
 * The production claim: one data-modifying statement. $1 = job id, $2 = the
 * global limit or NULL (off), $3 = the workspace limit or NULL (off).
 *
 * A first attempt (attempt_count = 0) was admitted at start or rescan and is
 * never checked again, so admitted work finishes. A retry is claimed only
 * while used < limit, with used counted exactly as at admission. `claimed`
 * re-applies the claimable condition, so a concurrent claim still loses.
 * `attempt` writes the job's scan_attempts row from the same statement, so a
 * claim and its row cannot exist without each other.
 *
 * Zero rows: the job is not claimable. One row with budget_allowed false: a
 * retry refused on budget. One row with an id: claimed.
 */
export const BUDGETED_CLAIM_SQL = `WITH target AS (
  SELECT id AS target_id, workspace_id AS target_workspace_id, attempt_count AS target_attempts
  FROM audit_jobs WHERE id = $1 AND ${CLAIMABLE_JOB_CONDITION_SQL}
), counts AS (
  SELECT ${usedSql(null)} AS global_used, ${usedSql("(SELECT target_workspace_id FROM target)")} AS workspace_used
), decision AS (
  SELECT target_id, target_workspace_id, target_attempts, global_used, workspace_used,
    (target_attempts = 0
      OR (($2::int IS NULL OR global_used < $2::int)
        AND ($3::int IS NULL OR target_workspace_id IS NULL OR workspace_used < $3::int))) AS allowed
  FROM target CROSS JOIN counts
), claimed AS (
  UPDATE audit_jobs SET status='collecting',processing_stage='collecting',attempt_count=attempt_count+1,last_attempt_at=now()
  WHERE id = $1 AND ${CLAIMABLE_JOB_CONDITION_SQL} AND EXISTS (SELECT 1 FROM decision WHERE allowed)
  RETURNING *
), attempt AS (
  INSERT INTO scan_attempts (job_id, workspace_id) SELECT id, workspace_id FROM claimed RETURNING job_id
)
SELECT decision.allowed AS budget_allowed, decision.global_used AS budget_global_used,
  decision.workspace_used AS budget_workspace_used, claimed.*
FROM decision LEFT JOIN claimed ON true`;

export type ScanBudgetScope = Extract<BudgetScope, "scan_global" | "scan_workspace">;

/** Thrown by admission. The message is the route's error code. */
export class ScanBudgetRefusal extends Error {
  constructor(readonly scope: ScanBudgetScope) {
    super(scope === "scan_workspace" ? "workspace_scan_budget_reached" : "at_capacity");
    this.name = "ScanBudgetRefusal";
  }
}

function readScanConfig(env: Env, entry: BudgetEntry): BudgetConfig {
  try {
    return readBudgetConfig(env);
  } catch {
    logBudgetCheckFailed(entry, "configuration");
    throw new ScanBudgetRefusal("scan_global");
  }
}

/**
 * Admission for a new job, on the caller's transaction client, before the job
 * row is inserted (lib/repositories/jobs.ts). The lock is held until that
 * transaction ends, so the pending job it admits is visible to the next
 * decision. Throws ScanBudgetRefusal; any error in the check refuses too.
 */
export async function admitScanJob(
  client: Queryable,
  input: { workspaceId: string | null; entry: "scan_start" | "rescan" },
  env: Env = process.env,
): Promise<void> {
  const config = readScanConfig(env, input.entry);
  const workspaceLimit = input.workspaceId === null ? null : config.scanAttemptsWorkspace24h;
  if (config.scanAttemptsGlobal24h === null && workspaceLimit === null) return;
  let used: { global: number; workspace: number };
  try {
    await client.query(SCAN_BUDGET_LOCK_SQL, [SCAN_BUDGET_LOCK_KEY]);
    const row = (await client.query<{ global_used: number; workspace_used: number }>(ADMISSION_USAGE_SQL, [input.workspaceId])).rows[0];
    used = { global: Number(row.global_used), workspace: Number(row.workspace_used) };
    if (!Number.isFinite(used.global) || !Number.isFinite(used.workspace)) throw new Error("budget_usage_invalid");
  } catch {
    logBudgetCheckFailed(input.entry, "query");
    throw new ScanBudgetRefusal("scan_global");
  }
  if (config.scanAttemptsGlobal24h !== null && used.global >= config.scanAttemptsGlobal24h) {
    logBudgetRefusal("scan_global", input.entry, used.global, config.scanAttemptsGlobal24h);
    throw new ScanBudgetRefusal("scan_global");
  }
  if (workspaceLimit !== null && used.workspace >= workspaceLimit) {
    logBudgetRefusal("scan_workspace", input.entry, used.workspace, workspaceLimit);
    throw new ScanBudgetRefusal("scan_workspace");
  }
}

type ClaimRow = Record<string, unknown> & {
  budget_allowed?: boolean | null;
  budget_global_used?: number | null;
  budget_workspace_used?: number | null;
};

export type ClaimOutcome =
  | { kind: "claimed"; row: Record<string, unknown> }
  | { kind: "not_claimable" }
  | { kind: "at_capacity"; scope: ScanBudgetScope };

/**
 * The claim, on the caller's transaction client (lib/scan/execution-store.ts
 * gives it one). SQL errors propagate, so the store keeps reporting
 * claim_failed. An invalid budget configuration claims first attempts and
 * refuses every retry (a global limit of 0 for this statement), so a bad
 * variable never lets retries through unmetered.
 */
export async function claimScanJob(client: Queryable, jobId: string, env: Env = process.env): Promise<ClaimOutcome> {
  let limits: { global: number | null; workspace: number | null };
  let configurationFailed = false;
  try {
    const config = readBudgetConfig(env);
    limits = { global: config.scanAttemptsGlobal24h, workspace: config.scanAttemptsWorkspace24h };
  } catch {
    configurationFailed = true;
    limits = { global: 0, workspace: null };
  }
  if (limits.global !== null || limits.workspace !== null) {
    await client.query(SCAN_BUDGET_LOCK_SQL, [SCAN_BUDGET_LOCK_KEY]);
  }
  const row = (await client.query<ClaimRow>(BUDGETED_CLAIM_SQL, [jobId, limits.global, limits.workspace])).rows[0];
  if (!row) return { kind: "not_claimable" };
  if (row.budget_allowed === false) {
    if (configurationFailed) {
      logBudgetCheckFailed("retry_claim", "configuration");
      return { kind: "at_capacity", scope: "scan_global" };
    }
    const globalUsed = Number(row.budget_global_used);
    if (limits.global !== null && globalUsed >= limits.global) {
      logBudgetRefusal("scan_global", "retry_claim", globalUsed, limits.global);
      return { kind: "at_capacity", scope: "scan_global" };
    }
    logBudgetRefusal("scan_workspace", "retry_claim", Number(row.budget_workspace_used), limits.workspace ?? 0);
    return { kind: "at_capacity", scope: "scan_workspace" };
  }
  return typeof row.id === "string" ? { kind: "claimed", row } : { kind: "not_claimable" };
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `corepack pnpm exec vitest run lib/budgets/scan.test.ts`

Expected: PASS. Then run the full `corepack pnpm test` and `corepack pnpm typecheck`.

- [ ] **Step 6: Mutation checks**

1. In `admitScanJob`, delete the `await client.query(SCAN_BUDGET_LOCK_SQL, …)` line. "takes the budget lock, then counts with one statement" must fail.
2. In `admitScanJob`, change `used.global >= config.scanAttemptsGlobal24h` to `>`. "refuses at the global limit with the fixed log line" must fail.
3. In `admitScanJob`, replace the `catch` body with `used = { global: 0, workspace: 0 };`. The three "refuses, with the check_failed line, when …" cases must fail.
4. In `claimScanJob`, change the `catch` to set `limits = { global: null, workspace: null };`. "refuses every retry, but not a first attempt, when the configuration is invalid" must fail.
5. In `BUDGETED_CLAIM_SQL`, delete the `attempt AS (…)` CTE. "counts the same attempts and pending jobs at admission and at the claim" must fail. Task 5's integration test proves the behaviour.

- [ ] **Step 7: Commit**

```bash
git add lib/budgets/log.ts lib/budgets/scan.ts lib/budgets/scan.test.ts
```

Commit message: `feat(P3.5a): scan-budget SQL for admission and the metered claim, under one lock`

---

### Task 4: Admit new scans against the budget

**Files:**
- Modify: `lib/repositories/jobs.ts`
- Modify: `lib/scan/start-job.ts`; Test: `lib/scan/start-job.test.ts`
- Modify: `app/api/scan/start/route.ts`; Test: `app/api/scan/start/route.test.ts`
- Modify: `lib/workspace/rescan.ts`; Test: `lib/workspace/rescan.test.ts`
- Modify: `app/api/workspaces/[workspaceId]/rescan/route.ts`; Test: `app/api/workspaces/[workspaceId]/rescan/route.test.ts`
- Create: `test/integration/neon-scan-admission.integration.test.ts`

- [ ] **Step 1: Write the failing unit tests**

1. In `lib/scan/start-job.test.ts`, add after the existing imports:

```ts
import { ScanBudgetRefusal } from "@/lib/budgets/scan";
```

   Then, inside `describe("insertScanJob", …)`, directly after the line that starts with ` it("refuses an event the engine would reject before touching the repository"`, add:

```ts
 it("passes a budget refusal through as itself, not as a persistence failure",async()=>{const refusal=new ScanBudgetRefusal("scan_global");const insert=vi.fn().mockRejectedValue(refusal);const result=await insertScanJob(parsed(),consent,{anonymousSessionId:"session-1"},{},{insert});expect(result.ok).toBe(false);if(!result.ok)expect(result.error).toBe(refusal);});
```

2. In `app/api/scan/start/route.test.ts`, directly after `import { LEGAL_POLICY_VERSION } from "@/lib/legal/policy";`, add:

```ts
import { ScanBudgetRefusal } from "@/lib/budgets/scan";
```

   and append at the end of the file:

```ts
describe("POST /api/scan/start spend budget", () => {
  it("answers 503 at_capacity, forwards nothing and logs no persistence failure, when admission refuses", async () => {
    mocks.after.mockClear();
    mocks.insert.mockRejectedValueOnce(new ScanBudgetRefusal("scan_global"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await POST(request(validBody));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "at_capacity" });
      expect(mocks.after).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalledWith("Scan persistence unavailable", expect.anything());
    } finally {
      error.mockRestore();
    }
  });
});
```

3. In `lib/workspace/rescan.test.ts`, directly after `import { LEGAL_POLICY_VERSION } from "@/lib/legal/policy";`, add:

```ts
import { ScanBudgetRefusal } from "@/lib/budgets/scan";
```

   Then replace:

```ts
  it("reports an insert failure without an audit event", async () => {
    state.jobInsertError = { message: "boom" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await enqueueRescan(client(), { workspaceId: "ws-1", locationId: "loc-1", actorId: "user-1", anonymousSessionId: "session-1", consent: CONSENT })).toEqual({ ok: false, reason: "insert_failed" });
    expect(state.inserted.audit_events).toEqual([]);
    spy.mockRestore();
  });
```

   with:

```ts
  it("reports an insert failure without an audit event", async () => {
    state.jobInsertError = { message: "boom" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await enqueueRescan(client(), { workspaceId: "ws-1", locationId: "loc-1", actorId: "user-1", anonymousSessionId: "session-1", consent: CONSENT })).toEqual({ ok: false, reason: "insert_failed" });
    expect(state.inserted.audit_events).toEqual([]);
    spy.mockRestore();
  });

  it.each([
    ["scan_global", "at_capacity"],
    ["scan_workspace", "workspace_scan_budget_reached"],
  ] as const)("reports a %s budget refusal as %s, with no audit event and no failure log", async (scope, reason) => {
    state.jobInsertError = new ScanBudgetRefusal(scope);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await enqueueRescan(client(), { workspaceId: "ws-1", locationId: "loc-1", actorId: "user-1", anonymousSessionId: "session-1", consent: CONSENT })).toEqual({ ok: false, reason });
    expect(state.inserted.audit_events).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
```

4. In `app/api/workspaces/[workspaceId]/rescan/route.test.ts`, append at the end of the file:

```ts
describe("POST /api/workspaces/[workspaceId]/rescan spend budget", () => {
  it.each([
    ["at_capacity", 503],
    ["workspace_scan_budget_reached", 429],
  ] as const)("maps the %s refusal to %i with that error code, and creates no schedule", async (reason, status) => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    mocks.enqueueRescan.mockResolvedValue({ ok: false, reason });
    const res = await post({ locationId: LOCATION_ID, locale: "en" });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: reason });
    expect(mocks.ensureMonthlySchedule).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm exec vitest run lib/scan/start-job.test.ts app/api/scan/start/route.test.ts lib/workspace/rescan.test.ts "app/api/workspaces/[workspaceId]/rescan/route.test.ts"`

Expected: FAIL.
- `insertScanJob` returns `Error("scan_persistence_unavailable")` instead of the refusal.
- The start route answers `{ error: "Failed to create scan job", correlationId }`.
- `enqueueRescan` answers `insert_failed`, and logs.
- The rescan route answers `503 unavailable` for both reasons.

- [ ] **Step 3: Admission inside the insert transaction**

In `lib/repositories/jobs.ts`:

1. Directly after `import { withTransaction } from "../db/transaction";`, add:

```ts
import { admitScanJob } from "../budgets/scan";
```

2. Replace:

```ts
    async insert(row, consent, started) {
        return withTransaction(async (client) => {
            const values: typeof auditJobs.$inferInsert = {
```

with:

```ts
    async insert(row, consent, started) {
        return withTransaction(async (client) => {
            // P3.5a: the spend budget, first, on this transaction's client and
            // under the budget lock, so the pending count it reads and the job
            // it admits commit together. A refusal throws ScanBudgetRefusal
            // before anything is written. Only the rescan path attributes a
            // workspace (the public route never forwards one), so the row's
            // workspace names the entry.
            await admitScanJob(client, {
                workspaceId: row.workspace_id ?? null,
                entry: row.workspace_id ? "rescan" : "scan_start",
            });
            const values: typeof auditJobs.$inferInsert = {
```

- [ ] **Step 4: Pass the refusal through `insertScanJob`**

In `lib/scan/start-job.ts`:

1. Directly after `import { scanStartedEvent } from "@/lib/analytics/scan-events";`, add:

```ts
import { ScanBudgetRefusal } from "@/lib/budgets/scan";
```

2. Replace:

```ts
  return { ok: true, jobId: row.id, startedEvent };
 } catch { return { ok: false, error: new Error("scan_persistence_unavailable") }; }
```

with:

```ts
  return { ok: true, jobId: row.id, startedEvent };
 } catch (error) {
  // A budget refusal is an answer, not a persistence failure: the caller maps it.
  if (error instanceof ScanBudgetRefusal) return { ok: false, error };
  return { ok: false, error: new Error("scan_persistence_unavailable") };
 }
```

- [ ] **Step 5: The start route answers 503 `at_capacity`**

In `app/api/scan/start/route.ts`:

1. Directly after `import { insertScanJob, parseScanStartBody } from "@/lib/scan/start-job";`, add:

```ts
import { ScanBudgetRefusal } from "@/lib/budgets/scan";
```

2. Replace:

```ts
  if (!created.ok) {
    const correlationId = randomUUID();
```

with:

```ts
  if (!created.ok) {
    // Already logged as "[budget] refused" (or "[budget] check_failed") by the
    // admission check, which ran before anything was written.
    if (created.error instanceof ScanBudgetRefusal) {
      return NextResponse.json({ error: "at_capacity" }, { status: 503 });
    }
    const correlationId = randomUUID();
```

- [ ] **Step 6: Rescan refusals**

In `lib/workspace/rescan.ts`:

1. Directly after `import { scanStartedEvent } from "@/lib/analytics/scan-events";`, add:

```ts
import { ScanBudgetRefusal } from "@/lib/budgets/scan";
```

2. Replace:

```ts
export type RescanRefusal = "no_finished_job" | "snapshot_not_v2" | "insert_failed";
```

with:

```ts
export type RescanRefusal = "no_finished_job" | "snapshot_not_v2" | "insert_failed" | "at_capacity" | "workspace_scan_budget_reached";
```

3. Replace:

```ts
  catch {
    console.error("[workspace/rescan] job insert failed", { category: "rescan_insert_failed" });
    return { ok: false, reason: "insert_failed" };
  }
```

with:

```ts
  catch (error) {
    // P3.5a: refused before anything was written, and already logged by the
    // admission check, so it is neither a failure nor worth a second log line.
    if (error instanceof ScanBudgetRefusal) {
      return { ok: false, reason: error.scope === "scan_workspace" ? "workspace_scan_budget_reached" : "at_capacity" };
    }
    console.error("[workspace/rescan] job insert failed", { category: "rescan_insert_failed" });
    return { ok: false, reason: "insert_failed" };
  }
```

In `app/api/workspaces/[workspaceId]/rescan/route.ts`, replace:

```ts
    if (result.reason === "snapshot_not_v2") return NextResponse.json({ error: "snapshot_not_rescannable" }, { status: 409 });
```

with:

```ts
    if (result.reason === "snapshot_not_v2") return NextResponse.json({ error: "snapshot_not_rescannable" }, { status: 409 });
    if (result.reason === "at_capacity") return NextResponse.json({ error: "at_capacity" }, { status: 503 });
    if (result.reason === "workspace_scan_budget_reached") return NextResponse.json({ error: "workspace_scan_budget_reached" }, { status: 429 });
```

- [ ] **Step 7: Run the unit tests to verify they pass**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 8: Write the admission integration test**

Create `test/integration/neon-scan-admission.integration.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { buildScanStartPayload, emptyScanDraft } from "../../lib/funnel/scan-start";
import { LEGAL_POLICY_VERSION } from "../../lib/legal/policy";
import { insertScanJob, parseScanStartBody } from "../../lib/scan/start-job";
import { admitScanJob, ScanBudgetRefusal } from "../../lib/budgets/scan";

const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool, getDatabase: () => drizzle(ports.pool!) }));

/** Polls until another session waits on an advisory lock; 0 after two seconds. */
async function advisoryWaiters(owner: Pool): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const n = (await owner.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted")).rows[0].n as number;
    if (n > 0) return n;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return 0;
}

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon scan admission budget", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, max: 12 });
    ports.pool = runtime;
  });
  beforeEach(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runtime.query("DELETE FROM audit_jobs; DELETE FROM workspaces");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  const start = (attribution: { workspaceId?: string } = {}) => {
    const parsed = parseScanStartBody(buildScanStartPayload({ ...emptyScanDraft("hk", "Budget shop"), manualEntry: true, industry: "fnb", district: "東區" }, "zh-HK", { granted: true, policyVersion: LEGAL_POLICY_VERSION }));
    if (!parsed.ok) throw new Error("invalid fixture");
    return insertScanJob(parsed.input, parsed.consent, { anonymousSessionId: randomUUID() }, attribution);
  };
  const refusedScope = (result: Awaited<ReturnType<typeof start>>) =>
    !result.ok && result.error instanceof ScanBudgetRefusal ? result.error.scope : null;
  const workspace = async () =>
    (await runtime.query("INSERT INTO workspaces(slug) VALUES($1) RETURNING id", [`budget-${randomUUID().slice(0, 8)}`])).rows[0].id as string;
  /** A finished job with one logged attempt, `age` ago. */
  const pastAttempt = async (workspaceId: string | null, age = "1 hour") => {
    const job = (await runtime.query("INSERT INTO audit_jobs(business_name,status,attempt_count,workspace_id) VALUES('Earlier','done',1,$1) RETURNING id", [workspaceId])).rows[0].id;
    await runtime.query("INSERT INTO scan_attempts(job_id,workspace_id,attempted_at) VALUES($1,$2,now()-$3::interval)", [job, workspaceId, age]);
  };
  const queued = async () => (await runtime.query("SELECT count(*)::int AS n FROM audit_jobs WHERE status='queued'")).rows[0].n as number;

  it("admits under the limit and refuses at it, counting attempts in the last 24 hours only", async () => {
    vi.stubEnv("BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "2");
    await pastAttempt(null, "25 hours");
    await pastAttempt(null);
    expect((await start()).ok).toBe(true);
    expect(refusedScope(await start())).toBe("scan_global");
    expect(await queued()).toBe(1);
    expect(console.warn).toHaveBeenCalledWith("[budget] refused", { scope: "scan_global", entry: "scan_start", used: 2, limit: 2 });
  });

  it("counts pending jobs as reserved attempts, but not pending jobs older than the window", async () => {
    vi.stubEnv("BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "2");
    await runtime.query("INSERT INTO audit_jobs(business_name,status,created_at) VALUES('Stale','queued',now()-interval '25 hours')");
    expect((await start()).ok).toBe(true);
    expect((await start()).ok).toBe(true);
    expect(refusedScope(await start())).toBe("scan_global");
  });

  it("refuses a rescan on its workspace limit, not another workspace's or a public scan", async () => {
    vi.stubEnv("BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "off");
    vi.stubEnv("BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H", "1");
    const busy = await workspace();
    const quiet = await workspace();
    await pastAttempt(busy);
    expect(refusedScope(await start({ workspaceId: busy }))).toBe("scan_workspace");
    expect(console.warn).toHaveBeenCalledWith("[budget] refused", { scope: "scan_workspace", entry: "rescan", used: 1, limit: 1 });
    expect((await start({ workspaceId: quiet })).ok).toBe(true);
    expect((await start()).ok).toBe(true);
  });

  it("admits exactly one of two requests racing for the last slot", async () => {
    vi.stubEnv("BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "2");
    await pastAttempt(null);
    const first = await runtime.connect();
    try {
      await first.query("BEGIN");
      await admitScanJob(first, { workspaceId: null, entry: "scan_start" });
      await first.query("INSERT INTO audit_jobs(business_name,status) VALUES('First','queued')");
      // With the lock, the second request now waits behind the first. Without
      // it, the second would count 1 (the first is uncommitted) and be admitted.
      const second = start();
      const waiters = await advisoryWaiters(owner);
      await first.query("COMMIT");
      expect(refusedScope(await second)).toBe("scan_global");
      expect(waiters).toBe(1);
    } finally {
      first.release();
    }
    expect(await queued()).toBe(1);
  });

  it("lets a burst of eight admit exactly the three free slots", async () => {
    vi.stubEnv("BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "3");
    const results = await Promise.all(Array.from({ length: 8 }, () => start()));
    expect(results.filter((result) => result.ok)).toHaveLength(3);
    expect(results.map(refusedScope).filter((scope) => scope === "scan_global")).toHaveLength(5);
    expect(await queued()).toBe(3);
  });

  it("refuses, and writes nothing, when the budget count cannot be read", async () => {
    await owner.query("REVOKE SELECT ON public.scan_attempts FROM sme_app_runtime");
    try {
      expect(refusedScope(await start())).toBe("scan_global");
      expect(console.error).toHaveBeenCalledWith("[budget] check_failed", { entry: "scan_start", reason: "query" });
      expect(await queued()).toBe(0);
    } finally {
      await owner.query("GRANT SELECT ON public.scan_attempts TO sme_app_runtime");
    }
  });
});
```

- [ ] **Step 9: Run the integration test**

Run: `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-scan-admission.integration.test.ts`

Expected: PASS (6 tests). Then also run `neon-scan-start.integration.test.ts` and `neon-rescan.integration.test.ts` the same way. They must pass unchanged, because the default global limit of 200 is far above their job counts. Then run the full `corepack pnpm test` and `corepack pnpm typecheck`.

- [ ] **Step 10: Mutation checks**

1. In `admitScanJob`, delete the lock statement. The integration test "admits exactly one of two requests racing for the last slot" must fail: `second` is admitted and `waiters` is 0.
2. In `usedSql`, replace `(SELECT count(*) FROM audit_jobs WHERE ${scope}${PENDING_JOB_CONDITION_SQL})` with `0`. "counts pending jobs as reserved attempts…" and "lets a burst of eight admit exactly the three free slots" must fail.
3. In `usedSql`, change `const scope = workspace ? … : "";` to `const scope = "";`. "refuses a rescan on its workspace limit, not another workspace's or a public scan" must fail.
4. In `WINDOW_SQL`, change `'24 hours'` to `'48 hours'`. "admits under the limit and refuses at it, counting attempts in the last 24 hours only" must fail.
5. In `jobs.ts`, delete the `await admitScanJob(…)` call. Every refusal case in the admission integration file must fail.
6. In `start-job.ts`, delete `if (error instanceof ScanBudgetRefusal) return { ok: false, error };`. "passes a budget refusal through as itself…" must fail.

- [ ] **Step 11: Commit**

```bash
git add lib/repositories/jobs.ts lib/scan/start-job.ts lib/scan/start-job.test.ts app/api/scan/start/route.ts app/api/scan/start/route.test.ts lib/workspace/rescan.ts lib/workspace/rescan.test.ts "app/api/workspaces/[workspaceId]/rescan/route.ts" "app/api/workspaces/[workspaceId]/rescan/route.test.ts" test/integration/neon-scan-admission.integration.test.ts
```

Commit message: `feat(P3.5a): admit scans against the budget inside the job insert`

---

### Task 5: Meter every claim and refuse over-budget retries

**Files:**
- Modify: `lib/scan/execution-store.ts`; Test: `lib/scan/execution-store.test.ts`
- Modify: `lib/scan/run.ts`; Test: `lib/scan/run.test.ts`
- Modify: `app/api/scan/process/route.ts`; Test: `app/api/scan/process/route.test.ts`
- Test: `app/api/cron/dispatch/route.test.ts` (the route is unchanged)
- Modify: `test/integration/neon-execution.integration.test.ts`
- Create: `test/integration/neon-scan-claim-budget.integration.test.ts`

- [ ] **Step 1: Write the failing unit tests**

1. In `lib/scan/execution-store.test.ts`, directly after `import { createScanExecution, asClaimedJob } from "@sme-scanner/scan-engine";`, add:

```ts
import { BUDGETED_CLAIM_SQL, SCAN_BUDGET_LOCK_SQL } from "@/lib/budgets/scan";
```

   and append at the end of the file:

```ts
describe("budgeted claim", () => {
  function pool(respond: (sql: string) => { rows: unknown[] } | Error) {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      const answer = respond(sql);
      if (answer instanceof Error) throw answer;
      return answer;
    });
    return { statements, value: { query, connect: async () => ({ query, release: () => {} }) } as never };
  }

  it("claims in its own transaction: BEGIN, the budget lock, one claim statement, COMMIT", async () => {
    const p = pool((sql) => (sql === BUDGETED_CLAIM_SQL ? { rows: [{ budget_allowed: true, budget_global_used: 0, budget_workspace_used: 0, id: "job", business_name: "Fixture" }] } : { rows: [] }));
    const store = createScanExecutionStore("session", { pool: p.value, env: {} });
    expect(await store.claimJob("job")).toMatchObject({ id: "job", business_name: "Fixture" });
    expect(p.statements).toEqual(["BEGIN", SCAN_BUDGET_LOCK_SQL, BUDGETED_CLAIM_SQL, "COMMIT"]);
  });

  it("tells the host that a retry was refused on budget, and returns no job", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const onBudgetRefused = vi.fn();
    const p = pool((sql) => (sql === BUDGETED_CLAIM_SQL ? { rows: [{ budget_allowed: false, budget_global_used: 200, budget_workspace_used: 0, id: null }] } : { rows: [] }));
    const store = createScanExecutionStore("session", { pool: p.value, env: {}, onBudgetRefused });
    expect(await store.claimJob("job")).toBeNull();
    expect(onBudgetRefused).toHaveBeenCalledWith("scan_global");
    vi.restoreAllMocks();
  });

  it("keeps claim_failed, and reports no budget refusal, when the claim statement fails", async () => {
    const onBudgetRefused = vi.fn();
    const p = pool((sql) => (sql === BUDGETED_CLAIM_SQL ? new Error("db down") : { rows: [] }));
    const store = createScanExecutionStore("session", { pool: p.value, env: {}, onBudgetRefused });
    await expect(store.claimJob("job")).rejects.toThrow("claim_failed");
    expect(onBudgetRefused).not.toHaveBeenCalled();
    expect(p.statements).toContain("ROLLBACK");
  });
});
```

2. In `lib/scan/run.test.ts`, append at the end of the file:

```ts
describe("runScan budget refusal", () => {
  afterEach(() => {
    vi.mocked(processScan).mockClear();
    completionMock.mockClear();
  });

  it("reports at_capacity when the store refused the claim on budget, and completes nothing", async () => {
    vi.mocked(createScanExecutionStore).mockImplementationOnce(((...args: unknown[]) => {
      (args[1] as { onBudgetRefused?: (scope: "scan_global" | "scan_workspace") => void }).onBudgetRefused?.("scan_global");
      return storeMock;
    }) as never);
    vi.mocked(processScan).mockResolvedValueOnce({ status: "already_claimed" });
    await expect(runScan("job", "session")).resolves.toEqual({ status: "at_capacity" });
    expect(completionMock).not.toHaveBeenCalled();
  });

  it("still reports already_claimed when nothing was refused", async () => {
    vi.mocked(processScan).mockResolvedValueOnce({ status: "already_claimed" });
    await expect(runScan("job", "session")).resolves.toEqual({ status: "already_claimed" });
    expect(completionMock).not.toHaveBeenCalled();
  });
});
```

3. In `app/api/scan/process/route.test.ts`, append at the end of the file:

```ts
describe("scan process budget refusal", () => {
  const JOB = "11111111-1111-4111-8111-111111111111";
  const post = () => POST(new Request("http://localhost/api/scan/process", {
    method: "POST",
    body: JSON.stringify({ jobId: JOB }),
    headers: { "content-type": "application/json" },
  }));

  it("answers 503 at_capacity when the store refused a retry on budget", async () => {
    storeMocks.createScanExecutionStore.mockImplementationOnce((...args: unknown[]) => {
      (args[1] as { onBudgetRefused?: (scope: string) => void }).onBudgetRefused?.("scan_global");
      return { marker: "neon-store" };
    });
    vi.mocked(processScan).mockResolvedValueOnce({ status: "already_claimed" });
    const response = await post();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "at_capacity" });
  });

  it("keeps already_claimed a 200 when nothing was refused", async () => {
    vi.mocked(processScan).mockResolvedValueOnce({ status: "already_claimed" });
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "already_claimed" });
  });
});
```

4. In `app/api/cron/dispatch/route.test.ts`, append at the end of the file. It characterises existing behaviour: the reclaim is fire-and-forget, so a refused retry stays claimable and is offered again on the next tick. It passes before and after this task, and the mutation check below proves it can fail.

```ts
describe("POST /api/cron/dispatch and a budget refusal", () => {
  it("treats 503 at_capacity from scan/process as skip-and-retry: nothing logged, the job offered again next tick", async () => {
    claimableJobIds.mockResolvedValue(["job-1"]);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "at_capacity" }), { status: 503 }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await POST(request());
      await Promise.all(waitUntilMock.mock.calls.map(([pending]) => pending));
      await POST(request());
      await Promise.all(waitUntilMock.mock.calls.map(([pending]) => pending));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm exec vitest run lib/scan/execution-store.test.ts lib/scan/run.test.ts app/api/scan/process/route.test.ts app/api/cron/dispatch/route.test.ts`

Expected: FAIL.
- The store still issues a single `UPDATE` without `BEGIN`, and has no `env` or `onBudgetRefused` option. `typecheck` also reports the unknown options.
- `runScan` returns `already_claimed`.
- The route answers 200.
- The cron test passes: it is a characterisation test.

- [ ] **Step 3: The store claims through the budgeted statement**

In `lib/scan/execution-store.ts`:

1. Replace:

```ts
import { CLAIMABLE_JOB_CONDITION_SQL } from "./claimable";
```

with:

```ts
import { claimScanJob, type ClaimOutcome, type ScanBudgetScope } from "../budgets/scan";
```

   `CLAIMABLE_JOB_CONDITION_SQL` now reaches the claim through `lib/budgets/scan.ts`.

2. Replace:

```ts
    waitUntil?: (promise: Promise<unknown>) => void;
  } = {},
```

with:

```ts
    waitUntil?: (promise: Promise<unknown>) => void;
    /** Budget variables; defaults to process.env (tests pass their own). */
    env?: Record<string, string | undefined>;
    /**
     * Called when a retry's claim was refused on budget. processScan knows
     * only "a claimed job or null" and reports null as already_claimed, so the
     * host (lib/scan/run.ts) learns the reason here. packages/scan-engine is
     * unchanged.
     */
    onBudgetRefused?: (scope: ScanBudgetScope) => void;
  } = {},
```

3. Replace:

```ts
    async claimJob(jobId) {
      try {
        const result = await pool().query(
          `UPDATE audit_jobs SET status='collecting',processing_stage='collecting',attempt_count=attempt_count+1,last_attempt_at=now()
     WHERE id=$1 AND ${CLAIMABLE_JOB_CONDITION_SQL} RETURNING *`,
          [jobId],
        );
        return asClaimedJob(result.rows);
      } catch {
        throw new Error("claim_failed");
      }
    },
```

with:

```ts
    async claimJob(jobId) {
      // P3.5a: its own short transaction. The budget lock, then one statement
      // that claims and writes the job's scan_attempts row together
      // (lib/budgets/scan.ts). It commits before collection starts, so no
      // transaction is held open across provider calls.
      let outcome: ClaimOutcome;
      try {
        outcome = await withTransaction((client) => claimScanJob(client, jobId, options.env), pool());
      } catch {
        throw new Error("claim_failed");
      }
      if (outcome.kind === "at_capacity") {
        options.onBudgetRefused?.(outcome.scope);
        return null;
      }
      return outcome.kind === "claimed" ? asClaimedJob(outcome.row) : null;
    },
```

- [ ] **Step 4: `runScan` reports `at_capacity`**

In `lib/scan/run.ts`, replace:

```ts
/** Execute with application-owned SQL and explicit media persistence. */
export async function runScan(
  jobId: string,
  anonymousSessionId: string,
): Promise<ScanProcessResult> {
  const result = await processScan(jobId, {
    // The durable scan_completed row is written inside the store's own
    // transaction; only the later PostHog tail needs this Vercel request's
    // lifetime, via waitUntil.
    store: createScanExecutionStore(anonymousSessionId, { waitUntil }),
```

with:

```ts
/** processScan's outcomes, plus a claim refused on the spend budget (P3.5a). */
export type RunScanResult = ScanProcessResult | { status: "at_capacity" };

/** Execute with application-owned SQL and explicit media persistence. */
export async function runScan(
  jobId: string,
  anonymousSessionId: string,
): Promise<RunScanResult> {
  // The engine reports any unclaimed job as already_claimed. The store tells
  // us, here, when the reason was the budget.
  let refusedOnBudget = false;
  const result = await processScan(jobId, {
    // The durable scan_completed row is written inside the store's own
    // transaction; only the later PostHog tail needs this Vercel request's
    // lifetime, via waitUntil.
    store: createScanExecutionStore(anonymousSessionId, {
      waitUntil,
      onBudgetRefused: () => {
        refusedOnBudget = true;
      },
    }),
```

   Then replace:

```ts
  if (result.status !== "already_claimed") {
    try {
```

with:

```ts
  if (result.status === "already_claimed" && refusedOnBudget) return { status: "at_capacity" };
  if (result.status !== "already_claimed") {
    try {
```

   Everything after it is unchanged. A refused claim touched nothing, so there is no completion to run.

- [ ] **Step 5: The process route answers 503 `at_capacity`**

In `app/api/scan/process/route.ts`, replace:

```ts
  const result = await runScan(jobId, session.id);
  const response = NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
```

with:

```ts
  const result = await runScan(jobId, session.id);
  // P3.5a: a retry refused on the spend budget. The job stays claimable, so
  // the cron reclaim offers it again on a later tick.
  if (result.status === "at_capacity") {
    const refused = NextResponse.json({ error: "at_capacity" }, { status: 503 });
    setAnalyticsSessionCookie(refused, session);
    return refused;
  }
  const response = NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
```

- [ ] **Step 6: Run the unit tests to verify they pass**

Run the Step 2 command. Expected: PASS. The existing `run.test.ts` case "writes scan_completed inside fail()…" still passes: its mocked `query` answers any statement containing `RETURNING *`, the claim statement included, with the job row.

- [ ] **Step 7: Rewrite the thirty-minute lease test**

In `test/integration/neon-execution.integration.test.ts`:

1. Directly after the closing `} from "../../lib/scan/execution-store";`, add:

```ts
import { claimScanJob } from "../../lib/budgets/scan";
```

2. Replace:

```ts
        const storage = createScanExecutionStore(randomUUID(), {
          pool: {
            query: client.query.bind(client),
            connect: runtime.connect.bind(runtime),
          },
        });
        expect(await storage.claimJob(id)).toBeNull();
        await client.query("ROLLBACK");
```

with:

```ts
        // The claim now runs in a transaction of its own (the budget lock,
        // then one statement), so it is called on this transaction's client,
        // where now() is frozen at exactly thirty minutes after the attempt.
        expect(await claimScanJob(client, id, {})).toEqual({ kind: "not_claimable" });
        await client.query("ROLLBACK");
```

- [ ] **Step 8: Write the claim integration test**

Create `test/integration/neon-scan-claim-budget.integration.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { createScanExecutionStore } from "../../lib/scan/execution-store";
import { CLAIMABLE_JOB_CONDITION_SQL } from "../../lib/scan/claimable";
import { claimScanJob } from "../../lib/budgets/scan";

/** Polls until another session waits on an advisory lock; 0 after two seconds. */
async function advisoryWaiters(owner: Pool): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const n = (await owner.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted")).rows[0].n as number;
    if (n > 0) return n;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return 0;
}

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon budgeted scan claim", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href });
  });
  beforeEach(async () => {
    vi.stubEnv("POSTHOG_KEY", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runtime.query("DELETE FROM audit_jobs; DELETE FROM workspaces");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  const store = (env: Record<string, string | undefined>) => {
    const onBudgetRefused = vi.fn();
    return {
      onBudgetRefused,
      store: createScanExecutionStore(randomUUID(), {
        pool: runtime,
        env,
        onBudgetRefused,
        analytics: { insert: async () => {}, capturePostHog: async () => {}, reportError: () => {} },
      }),
    };
  };
  const job = async (opts: { status?: string; attempts?: number; age?: string; workspaceId?: string | null } = {}) =>
    (await runtime.query(
      "INSERT INTO audit_jobs(business_name,status,attempt_count,last_attempt_at,workspace_id) VALUES('Fixture',$1,$2,now()-$3::interval,$4) RETURNING id",
      [opts.status ?? "queued", opts.attempts ?? 0, opts.age ?? "0 minutes", opts.workspaceId ?? null],
    )).rows[0].id as string;
  /** A stalled first attempt, reclaimable now: its claim is a retry. */
  const retry = (workspaceId: string | null = null) => job({ status: "collecting", attempts: 1, age: "31 minutes", workspaceId });
  const workspace = async () =>
    (await runtime.query("INSERT INTO workspaces(slug) VALUES($1) RETURNING id", [`claim-${randomUUID().slice(0, 8)}`])).rows[0].id as string;
  const pastAttempt = async (workspaceId: string | null) => {
    const id = await job({ status: "done", attempts: 1, workspaceId });
    await runtime.query("INSERT INTO scan_attempts(job_id,workspace_id) VALUES($1,$2)", [id, workspaceId]);
  };
  const attemptRows = async (jobId: string) =>
    (await runtime.query("SELECT workspace_id FROM scan_attempts WHERE job_id=$1", [jobId])).rows;

  it("writes exactly one attempt row per claim, carrying the job's workspace", async () => {
    const ws = await workspace();
    const id = await job({ workspaceId: ws });
    const { store: s } = store({});
    expect(await s.claimJob(id)).not.toBeNull();
    expect(await attemptRows(id)).toEqual([{ workspace_id: ws }]);
    expect(await s.claimJob(id)).toBeNull();
    expect(await attemptRows(id)).toHaveLength(1);
    await runtime.query("UPDATE audit_jobs SET last_attempt_at=now()-interval '31 minutes' WHERE id=$1", [id]);
    expect(await s.claimJob(id)).not.toBeNull();
    expect(await attemptRows(id)).toHaveLength(2);
    expect((await runtime.query("SELECT attempt_count FROM audit_jobs WHERE id=$1", [id])).rows[0].attempt_count).toBe(2);
  });

  it("writes no attempt row for a job it did not claim", async () => {
    const { store: s } = store({});
    const done = await job({ status: "done", attempts: 1, age: "60 minutes" });
    const leased = await job({ status: "collecting", attempts: 1, age: "29 minutes" });
    expect(await s.claimJob(done)).toBeNull();
    expect(await s.claimJob(leased)).toBeNull();
    expect(await attemptRows(done)).toEqual([]);
    expect(await attemptRows(leased)).toEqual([]);
  });

  it("still runs an admitted first attempt when the budget is already spent", async () => {
    await pastAttempt(null);
    await pastAttempt(null);
    const id = await job();
    const { store: s, onBudgetRefused } = store({ BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "1" });
    expect(await s.claimJob(id)).not.toBeNull();
    expect(onBudgetRefused).not.toHaveBeenCalled();
    expect(await attemptRows(id)).toHaveLength(1);
  });

  it("leaves an over-limit retry unclaimed and reports at_capacity", async () => {
    await pastAttempt(null);
    const id = await retry();
    const { store: s, onBudgetRefused } = store({ BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "1" });
    expect(await s.claimJob(id)).toBeNull();
    expect(onBudgetRefused).toHaveBeenCalledWith("scan_global");
    expect((await runtime.query("SELECT status,attempt_count FROM audit_jobs WHERE id=$1", [id])).rows[0]).toEqual({ status: "collecting", attempt_count: 1 });
    expect(await attemptRows(id)).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith("[budget] refused", { scope: "scan_global", entry: "retry_claim", used: 1, limit: 1 });
    // Still claimable, so the cron reclaim offers it again on a later tick.
    expect((await runtime.query(`SELECT id FROM audit_jobs WHERE ${CLAIMABLE_JOB_CONDITION_SQL}`)).rows.map((row) => row.id)).toContain(id);
  });

  it("counts pending first attempts against a retry", async () => {
    await pastAttempt(null);
    await job(); // admitted, never claimed: it holds a reserved attempt
    const id = await retry();
    expect(await store({ BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "2" }).store.claimJob(id)).toBeNull();
    expect(await store({ BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "3" }).store.claimJob(id)).not.toBeNull();
  });

  it("applies the workspace limit only to that workspace's retries", async () => {
    const env = { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "off", BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H: "1" };
    const busy = await workspace();
    const quiet = await workspace();
    await pastAttempt(busy);
    const refused = store(env);
    expect(await refused.store.claimJob(await retry(busy))).toBeNull();
    expect(refused.onBudgetRefused).toHaveBeenCalledWith("scan_workspace");
    expect(await store(env).store.claimJob(await retry(quiet))).not.toBeNull();
    expect(await store(env).store.claimJob(await retry(null))).not.toBeNull();
  });

  it("serializes retries racing for the last slot", async () => {
    const env = { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "2" };
    await pastAttempt(null);
    const first = await retry();
    const second = await retry();
    const held = await runtime.connect();
    try {
      await held.query("BEGIN");
      expect((await claimScanJob(held, first, env)).kind).toBe("claimed");
      const racing = store(env);
      const pending = racing.store.claimJob(second);
      const waiters = await advisoryWaiters(owner);
      await held.query("COMMIT");
      expect(await pending).toBeNull();
      expect(racing.onBudgetRefused).toHaveBeenCalledWith("scan_global");
      expect(waiters).toBe(1);
    } finally {
      held.release();
    }
    expect(await attemptRows(second)).toEqual([]);
  });

  it("claims first attempts but refuses retries when the configuration is invalid", async () => {
    const env = { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "0" };
    const refused = store(env);
    expect(await refused.store.claimJob(await retry())).toBeNull();
    expect(refused.onBudgetRefused).toHaveBeenCalledWith("scan_global");
    expect(console.error).toHaveBeenCalledWith("[budget] check_failed", { entry: "retry_claim", reason: "configuration" });
    expect(await store(env).store.claimJob(await job())).not.toBeNull();
  });
});
```

- [ ] **Step 9: Run the integration tests**

Run:

```
NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-scan-claim-budget.integration.test.ts
NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-execution.integration.test.ts
NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-cron-dispatch.integration.test.ts
```

Expected: all PASS. `neon-execution`'s "claims one winner atomically across parallel runners" and "preserves the thirty-minute lease and three-attempt bound" pass unchanged. "runs real fixture collection…" still finds no `idle in transaction` session during collection, because the claim commits first. Then run the full `corepack pnpm test` and `corepack pnpm typecheck`.

- [ ] **Step 10: Mutation checks**

1. In `claimScanJob`, delete the lock statement. "serializes retries racing for the last slot" must fail: `pending` is claimed and `waiters` is 0.
2. In `BUDGETED_CLAIM_SQL`, change `(target_attempts = 0` to `(false`. "still runs an admitted first attempt when the budget is already spent" must fail.
3. In `usedSql`, replace the pending subquery with `0`. "counts pending first attempts against a retry" must fail.
4. In `BUDGETED_CLAIM_SQL`, delete the `attempt AS (…)` CTE. "writes exactly one attempt row per claim…" must fail.
5. In `BUDGETED_CLAIM_SQL`, replace `usedSql("(SELECT target_workspace_id FROM target)")` with `usedSql(null)`. "applies the workspace limit only to that workspace's retries" must fail on the `quiet` retry.
6. In `execution-store.ts`, delete `options.onBudgetRefused?.(outcome.scope);`. The unit test "tells the host that a retry was refused on budget…" must fail.
7. In `run.ts`, delete the line `if (result.status === "already_claimed" && refusedOnBudget) return { status: "at_capacity" };`. "reports at_capacity when the store refused the claim on budget…" and the process-route "answers 503 at_capacity…" must fail.
8. In `app/api/cron/dispatch/route.ts`, add `.then((response) => { if (!response.ok) logFailure(`reclaim_dispatch:${jobId}`, new Error("refused")); })` before its `.catch(…)`. The cron characterisation test must fail. Restore the route byte for byte.

- [ ] **Step 11: Commit**

```bash
git add lib/scan/execution-store.ts lib/scan/execution-store.test.ts lib/scan/run.ts lib/scan/run.test.ts app/api/scan/process/route.ts app/api/scan/process/route.test.ts app/api/cron/dispatch/route.test.ts test/integration/neon-execution.integration.test.ts test/integration/neon-scan-claim-budget.integration.test.ts
```

Commit message: `feat(P3.5a): meter every claim and refuse over-budget retries`

---

### Task 6: Cap owner draft runs by recorded AI spend

**Files:**
- Create: `lib/budgets/ai.ts`; Test: `lib/budgets/ai.test.ts`
- Modify: `lib/repositories/artifacts.ts` (`aiSpend24h`)
- Modify: `lib/workspace/runs.ts`; Test: `lib/workspace/runs.test.ts`
- Modify: `app/api/actions/[actionId]/run/route.ts`; Test: `app/api/actions/[actionId]/run/route.test.ts`
- Modify: `app/api/actions/_shared/test-db.ts`
- Test: `app/api/actions/route.test.ts`
- Create: `test/integration/neon-ai-spend.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

1. Create `lib/budgets/ai.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiBudgetRefusal, checkAiBudget } from "./ai";

afterEach(() => vi.restoreAllMocks());

const spend = (globalUsd: number, workspaceUsd: number) => vi.fn(async () => ({ globalUsd, workspaceUsd }));

describe("checkAiBudget", () => {
  it("allows below the default US$20 global limit", async () => {
    expect(await checkAiBudget(spend(19.99, 19.99), { entry: "ai_run" }, {})).toEqual({ allowed: true });
  });

  it("refuses at the global limit with the fixed log line", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await checkAiBudget(spend(20, 0), { entry: "assistant_draft" }, {})).toEqual({ allowed: false, scope: "ai_global" });
    expect(warn).toHaveBeenCalledWith("[budget] refused", { scope: "ai_global", entry: "assistant_draft", used: 20, limit: 20 });
  });

  it("applies a workspace limit only when one is set", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await checkAiBudget(spend(1, 5), { entry: "ai_run" }, {})).toEqual({ allowed: true });
    expect(await checkAiBudget(spend(1, 5), { entry: "ai_run" }, { BUDGET_AI_USD_WORKSPACE_24H: "5" })).toEqual({ allowed: false, scope: "ai_workspace" });
    expect(await checkAiBudget(spend(1, 4.99), { entry: "ai_run" }, { BUDGET_AI_USD_WORKSPACE_24H: "5" })).toEqual({ allowed: true });
  });

  it("reports the global limit first when both are reached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await checkAiBudget(spend(20, 5), { entry: "ai_run" }, { BUDGET_AI_USD_WORKSPACE_24H: "5" })).toEqual({ allowed: false, scope: "ai_global" });
  });

  it("reads no spend when both AI limits are off", async () => {
    const read = spend(1000, 1000);
    expect(await checkAiBudget(read, { entry: "ai_run" }, { BUDGET_AI_USD_GLOBAL_24H: "off" })).toEqual({ allowed: true });
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    ["the spend read fails", async () => { throw new Error("db down"); }],
    ["the spend read returns nothing", async () => undefined],
    ["the spend is not a number", async () => ({ globalUsd: Number.NaN, workspaceUsd: 0 })],
  ])("refuses, with the check_failed line, when %s", async (_label, read) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await checkAiBudget(read as never, { entry: "ai_run" }, {})).toEqual({ allowed: false, scope: "ai_global" });
    expect(error).toHaveBeenCalledWith("[budget] check_failed", { entry: "ai_run", reason: "query" });
  });

  it("refuses an invalid configuration without reading spend", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const read = spend(0, 0);
    expect(await checkAiBudget(read, { entry: "assistant_draft" }, { BUDGET_AI_USD_GLOBAL_24H: "" })).toEqual({ allowed: false, scope: "ai_global" });
    expect(read).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("[budget] check_failed", { entry: "assistant_draft", reason: "configuration" });
  });
});

describe("AiBudgetRefusal", () => {
  it("carries the route's error code and its scope", () => {
    const refusal = new AiBudgetRefusal("ai_workspace");
    expect(refusal).toBeInstanceOf(Error);
    expect(refusal.message).toBe("ai_budget_reached");
    expect(refusal.code).toBe("ai_budget_reached");
    expect(refusal.scope).toBe("ai_workspace");
  });
});
```

2. In `lib/workspace/runs.test.ts`:
   - Replace:

```ts
const queue = vi.fn(async () => "run-1"),
  start = vi.fn(async () => {}),
  asset = vi.fn(async () => null);
```

   with:

```ts
const queue = vi.fn(async () => "run-1"),
  start = vi.fn(async () => {}),
  asset = vi.fn(async () => null),
  aiSpend24h = vi.fn(async () => ({ globalUsd: 0, workspaceUsd: 0 }));
```

   - Replace:

```ts
    assistantReviewData: async () => reviewData,
  } as unknown as ArtifactRepository;
```

   with:

```ts
    assistantReviewData: async () => reviewData,
    aiSpend24h,
  } as unknown as ArtifactRepository;
```

   - Append at the end of the file:

```ts
describe("AI spend budget", () => {
  it("refuses before any run row or model call once the global spend reaches the limit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    aiSpend24h.mockResolvedValueOnce({ globalUsd: 20, workspaceUsd: 20 });
    const llm = vi.fn(async () => good());
    await expect(run({ llm })).rejects.toMatchObject({ name: "RunError", code: "ai_budget_reached" });
    expect(llm).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
    expect(aiSpend24h).toHaveBeenCalledWith("ws-1");
    expect(warn).toHaveBeenCalledWith("[budget] refused", { scope: "ai_global", entry: "ai_run", used: 20, limit: 20 });
    warn.mockRestore();
  });

  it("refuses on the workspace limit when one is set, and runs below it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const llm = vi.fn(async () => good());
    aiSpend24h.mockResolvedValueOnce({ globalUsd: 3, workspaceUsd: 2 });
    await expect(run({ llm, budgetEnv: { BUDGET_AI_USD_WORKSPACE_24H: "2" } })).rejects.toMatchObject({ code: "ai_budget_reached" });
    aiSpend24h.mockResolvedValueOnce({ globalUsd: 3, workspaceUsd: 1.5 });
    expect(await run({ llm, budgetEnv: { BUDGET_AI_USD_WORKSPACE_24H: "2" } })).toMatchObject({ versionId: "v-1" });
    expect(llm).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("refuses when the recorded spend cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    aiSpend24h.mockRejectedValueOnce(new Error("artifact_operation_failed"));
    const llm = vi.fn(async () => good());
    await expect(run({ llm })).rejects.toMatchObject({ code: "ai_budget_reached" });
    expect(llm).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("[budget] check_failed", { entry: "ai_run", reason: "query" });
    error.mockRestore();
  });
});
```

3. In `app/api/actions/_shared/test-db.ts`, replace:

```ts
    assistantBrand: async () => null,
```

with:

```ts
    assistantBrand: async () => null,
    // Recorded AI spend in the last 24 hours (P3.5a). Zero unless a test
    // overrides it, so existing suites stay under every budget.
    aiSpend24h: async () => ({ globalUsd: 0, workspaceUsd: 0 }),
```

4. In `app/api/actions/[actionId]/run/route.test.ts`, append at the end of the file. The file's top-level `beforeEach` gives this block a fresh `makeDb` and an owner:

```ts
describe("POST /api/actions/[actionId]/run AI budget", () => {
  it("answers 429 ai_budget_reached before any run row or model call", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.db!.aiSpend24h = async () => ({ globalUsd: 20, workspaceUsd: 0 });
    const res = await post();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "ai_budget_reached" });
    expect(mocks.llmComplete).not.toHaveBeenCalled();
    expect(mocks.db!.calls.filter((c) => c.table === "action_runs")).toEqual([]);
    warn.mockRestore();
  });
});
```

5. In `app/api/actions/route.test.ts`, directly after `import { objectiveDedupeKey } from "@/app/api/actions/_shared/mutation";`, add:

```ts
import { RunError } from "@/lib/workspace/runs";
```

   and inside `describe("POST /api/actions", …)`, directly after the test "marks the action needs_input when template inputs are missing and runs it when asked", add:

```ts
  it("keeps the created action and reports an AI budget refusal as its run error", async () => {
    mocks.runAgentForAction.mockRejectedValue(new RunError("ai_budget_reached"));
    const res = await post({ ...base, run: true });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ actionId: "act-new", runError: "ai_budget_reached" });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm exec vitest run lib/budgets/ai.test.ts lib/workspace/runs.test.ts "app/api/actions/[actionId]/run/route.test.ts" app/api/actions/route.test.ts`

Expected: FAIL.
- `./ai` does not resolve.
- The runs tests run the model instead of refusing.
- The route answers 200.
- `typecheck` rejects `RunError("ai_budget_reached")`.

- [ ] **Step 3: Implement the AI budget check**

Create `lib/budgets/ai.ts`:

```ts
import { readBudgetConfig, type BudgetConfig } from "./config";
import { logBudgetCheckFailed, logBudgetRefusal } from "./log";

/**
 * AI spend budget (P3.5a). The unit is the US$ cost_usd already recorded on
 * action_runs. No provider price is invented, and a run that recorded no
 * cost counts as zero.
 *
 * A pre-check: a run that starts under the limit may finish above it by that
 * run's own cost. Runs are bounded (at most 2 model calls, maxTokens 1200),
 * so the overshoot is at most one run per concurrent request.
 */
export interface AiSpend {
  globalUsd: number;
  workspaceUsd: number;
}

export type AiBudgetScope = "ai_global" | "ai_workspace";
export type AiBudgetDecision = { allowed: true } | { allowed: false; scope: AiBudgetScope };

/** Thrown by the assistant's draft path; the message is the route's error code. */
export class AiBudgetRefusal extends Error {
  readonly code = "ai_budget_reached";
  constructor(readonly scope: AiBudgetScope) {
    super("ai_budget_reached");
    this.name = "AiBudgetRefusal";
  }
}

/** Any failure to evaluate the budget refuses. Call it before llmComplete. */
export async function checkAiBudget(
  readSpend: () => Promise<AiSpend>,
  input: { entry: "ai_run" | "assistant_draft" },
  env: Record<string, string | undefined> = process.env,
): Promise<AiBudgetDecision> {
  let config: BudgetConfig;
  try {
    config = readBudgetConfig(env);
  } catch {
    logBudgetCheckFailed(input.entry, "configuration");
    return { allowed: false, scope: "ai_global" };
  }
  if (config.aiUsdGlobal24h === null && config.aiUsdWorkspace24h === null) return { allowed: true };
  let spend: AiSpend;
  try {
    spend = await readSpend();
    if (!Number.isFinite(spend.globalUsd) || !Number.isFinite(spend.workspaceUsd)) throw new Error("ai_spend_invalid");
  } catch {
    logBudgetCheckFailed(input.entry, "query");
    return { allowed: false, scope: "ai_global" };
  }
  if (config.aiUsdGlobal24h !== null && spend.globalUsd >= config.aiUsdGlobal24h) {
    logBudgetRefusal("ai_global", input.entry, spend.globalUsd, config.aiUsdGlobal24h);
    return { allowed: false, scope: "ai_global" };
  }
  if (config.aiUsdWorkspace24h !== null && spend.workspaceUsd >= config.aiUsdWorkspace24h) {
    logBudgetRefusal("ai_workspace", input.entry, spend.workspaceUsd, config.aiUsdWorkspace24h);
    return { allowed: false, scope: "ai_workspace" };
  }
  return { allowed: true };
}
```

- [ ] **Step 4: Read the recorded spend**

In `lib/repositories/artifacts.ts`, replace:

```ts
    WHERE s.job_id=$1 AND s.cited=false`,[jobId,workspaceId])).rows.map(r=>r.query_text));
  },
```

with:

```ts
    WHERE s.job_id=$1 AND s.cited=false`,[jobId,workspaceId])).rows.map(r=>r.query_text));
  },
  /**
   * Recorded AI spend in the last 24 hours (P3.5a), globally and for one
   * workspace, in one read over action_runs_created_idx. A run with no
   * recorded cost adds nothing: computeCostUsd returns null when the gateway
   * omits token usage.
   */
  aiSpend24h(workspaceId: string) {
   return operation(async () => {
    const row=(await db().query<{global_usd:number;workspace_usd:number}>(`SELECT coalesce(sum(cost_usd),0)::float8 AS global_usd,
     coalesce(sum(cost_usd) FILTER (WHERE workspace_id=$1),0)::float8 AS workspace_usd
     FROM action_runs WHERE created_at > now() - interval '24 hours'`,[workspaceId])).rows[0];
    return {globalUsd:Number(row.global_usd),workspaceUsd:Number(row.workspace_usd)};
   });
  },
```

- [ ] **Step 5: The pre-check in `runAgentForAction`**

In `lib/workspace/runs.ts`:

1. Directly after `import { llmComplete, type LLMUsage } from "@/lib/llm";`, add:

```ts
import { checkAiBudget } from "@/lib/budgets/ai";
```

2. Replace:

```ts
export type RunErrorCode =
  "action_not_found" | "agent_unavailable" | "forbidden";
```

with:

```ts
export type RunErrorCode =
  "action_not_found" | "agent_unavailable" | "forbidden" | "ai_budget_reached";
```

3. Replace:

```ts
  now?: Date;
  ipHash?: string | null;
}
```

with:

```ts
  now?: Date;
  ipHash?: string | null;
  /** Budget variables; defaults to process.env (tests pass their own). */
  budgetEnv?: Record<string, string | undefined>;
}
```

4. Replace:

```ts
  const agentKey = resolveAgentKey(input.agentKey, template.agentKey),
    agent = AGENTS[agentKey];
```

with:

```ts
  const agentKey = resolveAgentKey(input.agentKey, template.agentKey),
    agent = AGENTS[agentKey];
  // P3.5a: the AI spend budget, before any evidence read, run row or model
  // call. A refusal leaves nothing behind, so no queued run can strand.
  const budget = await checkAiBudget(() => db.aiSpend24h(row.workspace_id), { entry: "ai_run" }, input.budgetEnv);
  if (!budget.allowed) throw new RunError("ai_budget_reached");
```

- [ ] **Step 6: The run route answers 429**

In `app/api/actions/[actionId]/run/route.ts`, replace:

```ts
      if (error.code === "forbidden") return json({ error: "forbidden" }, 403);
```

with:

```ts
      if (error.code === "forbidden") return json({ error: "forbidden" }, 403);
      if (error.code === "ai_budget_reached") return json({ error: "ai_budget_reached" }, 429);
```

`app/api/actions/route.ts` needs no change: it already reports `runError: error.code` for any `RunError`.

- [ ] **Step 7: Run the unit tests to verify they pass**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 8: Write the spend-read integration test**

Create `test/integration/neon-ai-spend.integration.test.ts`:

```ts
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { artifactRepository } from "../../lib/repositories/artifacts";

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon AI spend read", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href });
  });
  beforeEach(async () => {
    await runtime.query("DELETE FROM workspaces");
  });
  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  const workspace = async (slug: string) => (await runtime.query("INSERT INTO workspaces(slug) VALUES($1) RETURNING id", [slug])).rows[0].id as string;
  const action = async (workspaceId: string) =>
    (await runtime.query(
      "INSERT INTO actions(workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key) VALUES($1,'review-response','{}','{}','[]','low',1,'{}',5,'Live',$2) RETURNING id",
      [workspaceId, `${workspaceId}:spend`],
    )).rows[0].id as string;
  const recordRun = (workspaceId: string, actionId: string, cost: number | null, age = "1 hour") =>
    runtime.query(
      "INSERT INTO action_runs(workspace_id,action_id,agent_key,state,cost_usd,created_at) VALUES($1,$2,'review_reply','succeeded',$3,now()-$4::interval)",
      [workspaceId, actionId, cost, age],
    );

  it("sums recorded cost in the last 24 hours, globally and for one workspace", async () => {
    const mine = await workspace("spend-mine");
    const other = await workspace("spend-other");
    const a = await action(mine);
    const b = await action(other);
    await recordRun(mine, a, 5);
    await recordRun(mine, a, 100, "25 hours");
    await recordRun(mine, a, null);
    await recordRun(other, b, 3);
    expect(await artifactRepository(runtime).aiSpend24h(mine)).toEqual({ globalUsd: 8, workspaceUsd: 5 });
    expect(await artifactRepository(runtime).aiSpend24h(other)).toEqual({ globalUsd: 8, workspaceUsd: 3 });
  });

  it("reads zero, not nothing, when no run is recorded", async () => {
    expect(await artifactRepository(runtime).aiSpend24h(await workspace("spend-empty"))).toEqual({ globalUsd: 0, workspaceUsd: 0 });
  });

  it("fails rather than answering when the read cannot run", async () => {
    const closed = new Pool({ connectionString: fixture.databaseUrl });
    await closed.end();
    await expect(artifactRepository(closed).aiSpend24h(await workspace("spend-closed"))).rejects.toThrow("artifact_operation_failed");
  });
});
```

- [ ] **Step 9: Run the integration tests**

Run:

```
NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-ai-spend.integration.test.ts
NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-artifact-runtime.integration.test.ts
```

Expected: both PASS. `neon-artifact-runtime` exercises `runAgentForAction` against a real repository, so its spend read is real too. Then run the full `corepack pnpm test` and `corepack pnpm typecheck`.

- [ ] **Step 10: Mutation checks**

1. In `runs.ts`, move the two budget lines to directly after `await persistence.start(attribution);`. "refuses before any run row or model call…" must fail: `queue` has been called.
2. In `aiSpend24h`, delete `FILTER (WHERE workspace_id=$1)`. The integration test "sums recorded cost…" must fail with `workspaceUsd: 8`.
3. In `aiSpend24h`, delete `WHERE created_at > now() - interval '24 hours'`. The same test must fail with `globalUsd: 108`.
4. In `checkAiBudget`, change `spend.globalUsd >= config.aiUsdGlobal24h` to `>`. "refuses at the global limit with the fixed log line" must fail.
5. In `checkAiBudget`, make the spend-read `catch` return `{ allowed: true }`. The three "refuses, with the check_failed line, when …" cases must fail.
6. In the run route, delete the `ai_budget_reached` line. "answers 429 ai_budget_reached…" must fail with 409.

- [ ] **Step 11: Commit**

```bash
git add lib/budgets/ai.ts lib/budgets/ai.test.ts lib/repositories/artifacts.ts lib/workspace/runs.ts lib/workspace/runs.test.ts "app/api/actions/[actionId]/run/route.ts" "app/api/actions/[actionId]/run/route.test.ts" app/api/actions/_shared/test-db.ts app/api/actions/route.test.ts test/integration/neon-ai-spend.integration.test.ts
```

Commit message: `feat(P3.5a): cap owner draft runs by recorded AI spend`

---

### Task 7: Cap assistant drafts, and record failed drafts' cost

**Files:**
- Modify: `lib/repositories/artifacts.ts` (`RecordAssistantDraftFailureInput`, `recordAssistantDraftFailure`, `LiveAssistantRepository`)
- Modify: `lib/assistant/live.ts`; Test: `lib/assistant/live.test.ts`
- Modify: `app/api/assistant/run/route.ts`; Test: `app/api/assistant/run/route.test.ts`
- Modify: `test/integration/neon-assistant-live.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

1. In `lib/assistant/live.test.ts`:
   - Replace:

```ts
import { LIVE_BOUNDARY, runLiveAssistant } from "./live";
```

   with:

```ts
import { LIVE_BOUNDARY, runLiveAssistant } from "./live";
import { AiBudgetRefusal } from "@/lib/budgets/ai";
```

   - In the hoisted `repository` object, replace `recordAssistantDraft:vi.fn() }));` with `recordAssistantDraft:vi.fn(),recordAssistantDraftFailure:vi.fn(),aiSpend24h:vi.fn() }));`.
   - In `beforeEach`, replace:

```ts
  repository.recordAssistantDraft.mockResolvedValue(DRAFT_RUN_ID);
```

   with:

```ts
  repository.recordAssistantDraft.mockResolvedValue(DRAFT_RUN_ID);
  repository.recordAssistantDraftFailure.mockResolvedValue("failed-run-id");
  repository.aiSpend24h.mockResolvedValue({ globalUsd: 0, workspaceUsd: 0 });
```

   - Append at the end of the file:

```ts
describe("assistant drafts and the AI budget", () => {
  const draftContext = { workspaceId: WORKSPACE_ID, actionId: ACTION_ID };

  it("refuses a draft before the model when the recorded spend reaches the limit", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    repository.aiSpend24h.mockResolvedValueOnce({ globalUsd: 20, workspaceUsd: 0 });
    const llm = vi.fn<Llm>(async () => good);
    const refusal = await run({ intentId: "draft_review_reply", surface: "action", context: draftContext, llm }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(AiBudgetRefusal);
    expect(llm).not.toHaveBeenCalled();
    expect(repository.aiSpend24h).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(repository.recordAssistantDraftFailure).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("never checks the budget for a template answer", async () => {
    await run({ intentId: "explain_priority" });
    expect(repository.aiSpend24h).not.toHaveBeenCalled();
  });

  it("records a parse failure as a failed run with its measured cost, then degrades", async () => {
    const llm = vi.fn<Llm>(async () => ({ text: "not json", usage: { inputTokens: 1000, outputTokens: 1000 } }));
    const result = await run({ intentId: "draft_review_reply", surface: "action", locale: "en", context: draftContext, llm, now: () => new Date("2026-09-25T01:00:00Z") });
    expect(result.output).toBeUndefined();
    expect(repository.recordAssistantDraftFailure).toHaveBeenCalledWith({
      actionId: ACTION_ID,
      agentKey: "review_reply",
      promptVersion: expect.any(String),
      intentId: "draft_review_reply",
      reason: "invalid_output",
      factsNeeded: [],
      usage: { inputTokens: 1000, outputTokens: 1000 },
      workspaceId: WORKSPACE_ID,
      actorId: auth("owner").membership.userId,
      surface: "action",
      locale: "en",
      model: process.env.LLM_MODEL || null,
      costUsd: 0.001,
      finishedAt: "2026-09-25T01:00:00.000Z",
    });
    expect(repository.recordAssistantDraft).not.toHaveBeenCalled();
  });

  it("records a request for missing facts as a failed run too", async () => {
    // The same intent and context as "relays facts_needed instead of an empty draft" above.
    const llm = vi.fn<Llm>(async () => ({ ...good, text: JSON.stringify({ title: "", body: "", acceptance_criteria: [], warnings: [], facts_used: [], facts_needed: ["capacity"] }) }));
    const result = await run({ intentId: "generate_faq", llm });
    expect(result.output).toBeUndefined();
    expect(repository.recordAssistantDraftFailure).toHaveBeenCalledWith(expect.objectContaining({ agentKey: "faq_jsonld", reason: "facts_needed", factsNeeded: ["capacity"], costUsd: 0.000006 }));
  });

  it("still answers when the failed run cannot be recorded", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    repository.recordAssistantDraftFailure.mockRejectedValueOnce(new Error("artifact_operation_failed"));
    const llm = vi.fn<Llm>(async () => ({ text: "not json", usage: { inputTokens: 1, outputTokens: 1 } }));
    const result = await run({ intentId: "draft_review_reply", surface: "action", context: draftContext, llm });
    expect(result.output).toBeUndefined();
    expect(error).toHaveBeenCalledWith("[assistant/live] failed draft not recorded", { category: "assistant_draft_failure_not_recorded" });
    error.mockRestore();
  });
});
```

   The facts-needed case uses `good`'s usage (10 input, 5 output tokens): `10/1000 × 0.0002 + 5/1000 × 0.0008 = 0.000006`.

2. In `app/api/assistant/run/route.test.ts`, directly after `import { auth, authorizeLike, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";`, add:

```ts
import { AiBudgetRefusal } from "@/lib/budgets/ai";
```

   and append at the end of the file:

```ts
describe("POST /api/assistant/run AI budget", () => {
  it("answers 429 ai_budget_reached when the live draft was refused, and records no run event", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
    mocks.runLiveAssistant.mockRejectedValueOnce(new AiBudgetRefusal("ai_global"));
    const res = await post({ mode: "live", surface: "action", intentId: "draft_review_reply", locale: "en", context: { workspaceId: WORKSPACE_ID } });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "ai_budget_reached" });
    expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
  });
});
```

   `auth` is imported by that file already; this block does not use it.

3. In `test/integration/neon-assistant-live.integration.test.ts`, replace:

```ts
 it('withholds nonempty facts-needed output and performs no artifact persistence',async()=>{
  const req=request();req.llm.mockResolvedValue({text:JSON.stringify({...output,facts_needed:['capacity']}),usage:{inputTokens:1,outputTokens:1}});
  const result=await runLiveAssistant(req);expect(result.output).toBeUndefined();expect(result.requiresApproval).toBe(false);expect(req.llm).toHaveBeenCalledOnce();await noWrites(req);
 });
```

with:

```ts
 it('withholds nonempty facts-needed output, creates no artifact, and records the failed run with its cost',async()=>{
  const req=request();req.llm.mockResolvedValue({text:JSON.stringify({...output,facts_needed:['capacity']}),usage:{inputTokens:1000,outputTokens:1000}});
  const result=await runLiveAssistant({...req,persistDraftFailure:(row)=>req.repository.recordAssistantDraftFailure(row)});
  expect(result.output).toBeUndefined();expect(result.requiresApproval).toBe(false);expect(req.llm).toHaveBeenCalledOnce();expect(req.persistence).not.toHaveBeenCalled();
  // P3.5a: the model ran and cost money, so the AI budget must see it.
  expect((await runtime.query("SELECT state,agent_key,output,error,cost_usd::float8 AS cost,input->>'source' AS source FROM action_runs WHERE workspace_id=$1",[workspace])).rows).toEqual([{state:'failed',agent_key:'review_reply',output:{facts_needed:['capacity']},error:'facts_needed',cost:0.001,source:'assistant'}]);
  for(const sql of ['SELECT id FROM output_versions WHERE workspace_id=$1','SELECT id FROM audit_events WHERE workspace_id=$1'])expect((await runtime.query(sql,[workspace])).rows).toHaveLength(0);
 });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm exec vitest run lib/assistant/live.test.ts app/api/assistant/run/route.test.ts`

Expected: FAIL.
- The live module calls the model despite the spend.
- It records no failed run.
- The route answers 503 `unavailable`.
- `typecheck` rejects `persistDraftFailure` and `recordAssistantDraftFailure`.

- [ ] **Step 3: Record failed drafts; the live repository reads spend**

In `lib/repositories/artifacts.ts`:

1. Replace:

```ts
export interface AssistantDraftRow {
```

with:

```ts
/**
 * An assistant draft that failed after the model ran (P3.5a): the output did
 * not parse, or the model asked for facts. Recorded so its measured cost
 * counts against the AI budget.
 */
export interface RecordAssistantDraftFailureInput {
 actionId: string;
 workspaceId: string;
 actorId: string;
 agentKey: string;
 promptVersion: string;
 intentId: string;
 surface: string;
 locale: string;
 model: string | null;
 reason: 'invalid_output' | 'facts_needed';
 factsNeeded: string[];
 usage: LLMUsage;
 /** Null when the gateway reported no usage; never a guessed zero. */
 costUsd: number | null;
 /** ISO-8601. */
 finishedAt: string;
}

export interface AssistantDraftRow {
```

2. Replace:

```ts
      JSON.stringify(input.output),input.model,input.promptVersion,input.usage.inputTokens,input.usage.outputTokens,input.costUsd,input.actorId,input.finishedAt])).rows[0];
    return row.id;
   });
  },
```

with:

```ts
      JSON.stringify(input.output),input.model,input.promptVersion,input.usage.inputTokens,input.usage.outputTokens,input.costUsd,input.actorId,input.finishedAt])).rows[0];
    return row.id;
   });
  },
  /**
   * A failed assistant draft as a terminal `failed` run. It can never be
   * redeemed into a version, because assistantDraft reads only
   * state='succeeded'. The action row is untouched.
   */
  recordAssistantDraftFailure(input: RecordAssistantDraftFailureInput) {
   return operation(async () => {
    const scope=await actionScope(input.actionId);
    if(!scope || scope.workspaceId!==input.workspaceId) throw new Error('artifact_scope_mismatch');
    const row=(await db().query<{id:string}>(`INSERT INTO action_runs(workspace_id,action_id,agent_key,state,input,output,model,prompt_version,error,input_tokens,output_tokens,cost_usd,requested_by,started_at,finished_at)
     VALUES($1,$2,$3,'failed',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz,$13::timestamptz) RETURNING id`,
     [scope.workspaceId,input.actionId,input.agentKey,JSON.stringify({source:'assistant',intent:input.intentId,surface:input.surface,locale:input.locale}),
      input.reason==='facts_needed'?JSON.stringify({facts_needed:input.factsNeeded}):null,input.model,input.promptVersion,input.reason,
      input.usage.inputTokens,input.usage.outputTokens,input.costUsd,input.actorId,input.finishedAt])).rows[0];
    return row.id;
   });
  },
```

   That anchor is unique: it is the only line containing `JSON.stringify(input.output)`.

3. Replace:

```ts
export type LiveAssistantRepository = Pick<ArtifactRepository,'actionScope'|'assistantWorkspace'|'assistantLocations'|'assistantActions'|'assistantSnapshot'|'assistantLatestSnapshot'|'assistantDiff'|'assistantBrand'|'assistantReviewData'|'versionScope'>;
```

with:

```ts
export type LiveAssistantRepository = Pick<ArtifactRepository,'actionScope'|'assistantWorkspace'|'assistantLocations'|'assistantActions'|'assistantSnapshot'|'assistantLatestSnapshot'|'assistantDiff'|'assistantBrand'|'assistantReviewData'|'versionScope'|'aiSpend24h'>;
```

   The spend read is read-only, so it belongs on the read-only capability.

- [ ] **Step 4: The pre-check and the failure record in `draft()`**

In `lib/assistant/live.ts`:

1. Replace:

```ts
import { artifactRepository, type LiveAssistantRepository, type RecordAssistantDraftInput } from "@/lib/repositories/artifacts";
```

with:

```ts
import { artifactRepository, type LiveAssistantRepository, type RecordAssistantDraftFailureInput, type RecordAssistantDraftInput } from "@/lib/repositories/artifacts";
import { AiBudgetRefusal, checkAiBudget } from "@/lib/budgets/ai";
```

2. Replace:

```ts
  persistDraft?: (input: RecordAssistantDraftInput) => Promise<string>;
  now?: () => Date;
```

with:

```ts
  persistDraft?: (input: RecordAssistantDraftInput) => Promise<string>;
  /**
   * Records a draft that failed after the model ran, so its cost counts
   * against the AI budget (P3.5a). Injected separately, like persistDraft.
   */
  persistDraftFailure?: (input: RecordAssistantDraftFailureInput) => Promise<string>;
  /** Budget variables; defaults to process.env (tests pass their own). */
  budgetEnv?: Record<string, string | undefined>;
  now?: () => Date;
```

3. Replace:

```ts
async function draft(intent: DraftIntent, input: LiveRunInput, db: LiveAssistantRepository, ctx: ResolvedContext): Promise<DemoAssistantRunResponse> {
```

with:

```ts
/**
 * P3.5a: a draft that failed after the model ran used to leave no row, so its
 * spend was invisible to the AI budget. It is now a failed run, with the cost
 * the gateway reported. Best-effort: a write failure is logged, and the owner
 * still gets the fallback answer.
 */
async function recordFailedDraft(
  input: LiveRunInput,
  failure: Pick<RecordAssistantDraftFailureInput, "actionId" | "agentKey" | "promptVersion" | "intentId" | "reason" | "factsNeeded" | "usage">,
): Promise<void> {
  try {
    const persist = input.persistDraftFailure ?? ((row: RecordAssistantDraftFailureInput) => artifactRepository().recordAssistantDraftFailure(row));
    await persist({
      ...failure,
      workspaceId: input.context.workspaceId,
      actorId: input.membership.userId,
      surface: input.surface,
      locale: input.locale,
      model: process.env.LLM_MODEL || null,
      costUsd: computeCostUsd(failure.usage),
      finishedAt: (input.now ?? (() => new Date()))().toISOString(),
    });
  } catch {
    console.error("[assistant/live] failed draft not recorded", { category: "assistant_draft_failure_not_recorded" });
  }
}

async function draft(intent: DraftIntent, input: LiveRunInput, db: LiveAssistantRepository, ctx: ResolvedContext): Promise<DemoAssistantRunResponse> {
```

4. Replace:

```ts
  const agentCtx = await agentContext(db, input, ctx, action, spec.agent, intent);
  const result = await (input.llm ?? llmComplete)(agent.buildPrompt(agentCtx), AGENT_LLM_OPTIONS);
  const output = parseAgentOutput(result?.text, agent.outputSchema);
  if (!output) return fallback();

  const warnings = [...output.warnings, ...agent.acceptance(agentCtx, output)];
  const title = action.overview.title[input.locale];
  if (output.facts_needed.length > 0) {
    const base = completed(fallbackIntentFor(intent), input, ctx);
```

with:

```ts
  const agentCtx = await agentContext(db, input, ctx, action, spec.agent, intent);
  // P3.5a: the AI spend budget, immediately before the model call.
  const budget = await checkAiBudget(() => db.aiSpend24h(input.context.workspaceId), { entry: "assistant_draft" }, input.budgetEnv);
  if (!budget.allowed) throw new AiBudgetRefusal(budget.scope);
  const result = await (input.llm ?? llmComplete)(agent.buildPrompt(agentCtx), AGENT_LLM_OPTIONS);
  const usage = result?.usage ?? { inputTokens: null, outputTokens: null };
  const failure = { actionId: action.row.id, agentKey: spec.agent, promptVersion: agent.promptVersion, intentId: intent, usage };
  const output = parseAgentOutput(result?.text, agent.outputSchema);
  if (!output) {
    await recordFailedDraft(input, { ...failure, reason: "invalid_output", factsNeeded: [] });
    return fallback();
  }

  const warnings = [...output.warnings, ...agent.acceptance(agentCtx, output)];
  const title = action.overview.title[input.locale];
  if (output.facts_needed.length > 0) {
    await recordFailedDraft(input, { ...failure, reason: "facts_needed", factsNeeded: output.facts_needed });
    const base = completed(fallbackIntentFor(intent), input, ctx);
```

5. Replace:

```ts
      usage: result?.usage ?? { inputTokens: null, outputTokens: null },
      costUsd: computeCostUsd(result?.usage ?? { inputTokens: null, outputTokens: null }),
```

with:

```ts
      usage,
      costUsd: computeCostUsd(usage),
```

- [ ] **Step 5: The assistant route answers 429**

In `app/api/assistant/run/route.ts`:

1. Directly after `import { AssistantAccessError, isDraftIntent, runLiveAssistant } from "@/lib/assistant/live";`, add:

```ts
import { AiBudgetRefusal } from "@/lib/budgets/ai";
```

2. Replace:

```ts
    if (error instanceof AssistantAccessError) return json({ error: error.code }, error.status);
```

with:

```ts
    if (error instanceof AssistantAccessError) return json({ error: error.code }, error.status);
    // Already logged as "[budget] refused" (or "[budget] check_failed"); nothing reached the model.
    if (error instanceof AiBudgetRefusal) return json({ error: "ai_budget_reached" }, 429);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `corepack pnpm exec vitest run lib/assistant/live.test.ts app/api/assistant/run/route.test.ts`, then:

```
NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-assistant-live.integration.test.ts
```

Expected: PASS. Every other test in `neon-assistant-live` passes unchanged: its `request()` passes `repository: artifactRepository(runtime)`, so the spend read is real, and it is zero for a fresh workspace. Then run the full `corepack pnpm test` and `corepack pnpm typecheck`.

- [ ] **Step 7: Mutation checks**

1. In `draft()`, delete the two budget lines. "refuses a draft before the model when the recorded spend reaches the limit" must fail.
2. In `draft()`, delete the `await recordFailedDraft(… "invalid_output" …)` line. "records a parse failure as a failed run with its measured cost, then degrades" must fail.
3. In `draft()`, delete the `await recordFailedDraft(… "facts_needed" …)` line. The unit test "records a request for missing facts…" and the integration test "withholds nonempty facts-needed output…" must fail.
4. In `recordFailedDraft`, remove the `try`/`catch` so errors propagate. "still answers when the failed run cannot be recorded" must fail.
5. In the assistant route, delete the `AiBudgetRefusal` line. "answers 429 ai_budget_reached…" must fail with 503.

- [ ] **Step 8: Commit**

```bash
git add lib/repositories/artifacts.ts lib/assistant/live.ts lib/assistant/live.test.ts app/api/assistant/run/route.ts app/api/assistant/run/route.test.ts test/integration/neon-assistant-live.integration.test.ts
```

Commit message: `feat(P3.5a): cap assistant drafts by AI spend and record failed drafts' cost`

---

### Task 8: Honest scan refusals on the public and owner surfaces

**Files:**
- Modify: `lib/messages/en.json`, `lib/messages/zh-HK.json`, `lib/messages/zh-TW.json`
- Modify: `tests/i18n.test.ts`
- Create: `lib/budgets/messages.ts`; Test: `lib/budgets/messages.test.ts`
- Modify: `components/scan-page.tsx`
- Modify: `lib/copy.ts`, `components/scanning-page.tsx`; Test: `components/scanning-page.test.tsx`
- Modify: `components/workspace/rescan-button.tsx`; Test: `tests/phase6-ui.test.tsx`

Copy rules: zh-HK is 香港書面中文 and zh-TW is 台灣用語, with 工作台 as the workspace term in both. Each string matches the terms its file already uses. zh-TW's `lib/copy.ts` uses 這個頁面 where zh-HK uses 此頁, and the rescan copy uses 今日 in both locales.

- [ ] **Step 1: Write the failing tests**

1. Create `lib/budgets/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { getMessages } from "@/lib/i18n";
import { aiBudgetRefusal, scanStartRefusal } from "./messages";

const LOCALES = ["en", "zh-HK", "zh-TW"] as const;

describe("budget refusal copy", () => {
  it("uses the spec's English words", () => {
    expect(scanStartRefusal("en", 503, "at_capacity")).toBe("Free scans are at capacity right now. Please try again in a few hours.");
    expect(aiBudgetRefusal("en", 429, "ai_budget_reached")).toBe("Today's AI drafting limit has been reached. Try again later.");
  });

  it.each(LOCALES)("maps each refusal to its own %s string", (locale) => {
    expect(scanStartRefusal(locale, 503, "at_capacity")).toBe(getMessages(locale).budget.scanAtCapacity);
    expect(aiBudgetRefusal(locale, 429, "ai_budget_reached")).toBe(getMessages(locale).budget.aiLimit);
  });

  it("keeps zh-HK and zh-TW in their own registers", () => {
    expect(getMessages("zh-HK").budget.scanAtCapacity).toBe("免費掃描名額暫時已滿，請於數小時後再試。");
    expect(getMessages("zh-TW").budget.scanAtCapacity).toBe("免費掃描目前已達上限，請於幾個小時後再試。");
    expect(getMessages("zh-HK").budget.aiLimit).toBe("今日的 AI 草稿生成額度已用完，請稍後再試。");
    expect(getMessages("zh-TW").budget.aiLimit).toBe("今天的 AI 草稿生成額度已用完，請稍後再試。");
  });

  it("leaves every other failure to its existing message", () => {
    expect(scanStartRefusal("en", 503, "unavailable")).toBeNull();
    expect(scanStartRefusal("en", 429, "at_capacity")).toBeNull();
    expect(aiBudgetRefusal("en", 429, "rate_limited")).toBeNull();
    expect(aiBudgetRefusal("en", 503, "ai_budget_reached")).toBeNull();
  });
});
```

2. In `tests/i18n.test.ts`, replace:

```ts
const APP_NAMESPACES = ["applied", "verified"];
```

with:

```ts
// "budget" (P3.5a) carries the spend-budget refusals, which need the same
// zh-HK / zh-TW register split.
const APP_NAMESPACES = ["applied", "verified", "budget"];
```

3. In `components/scanning-page.test.tsx`, append at the end of the file:

```ts
describe("ScanningPage at capacity", () => {
  it.each(["en", "zh-HK", "zh-TW"] as const)("says in %s that a refused resume will continue later", async (locale) => {
    const copyFor = copy[locale].funnel.scanning;
    render(<ScanningPage locale={locale} jobId={JOB} />);
    await advance(MAX_POLL_DURATION_MS + 60_000);
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/scan/process")) return { ok: false, status: 503, json: async () => ({ error: "at_capacity" }) } as unknown as Response;
      return { ok: RUNNING.ok, status: RUNNING.status, json: async () => RUNNING.body } as unknown as Response;
    });
    await act(async () => {
      fireEvent.click(screen.getByText(copyFor.stalledResume));
    });
    await advance(0);
    expect(screen.getByText(copyFor.atCapacity)).toBeTruthy();
  });

  it("says nothing about capacity when the resume was accepted", async () => {
    render(<ScanningPage locale="en" jobId={JOB} />);
    await advance(MAX_POLL_DURATION_MS + 60_000);
    await act(async () => {
      fireEvent.click(screen.getByText(c.stalledResume));
    });
    await advance(0);
    expect(screen.queryByText(c.atCapacity)).toBeNull();
  });
});
```

4. In `tests/phase6-ui.test.tsx`, replace:

```ts
import { RescanButton } from "@/components/workspace/rescan-button";
```

with:

```ts
import { RescanButton, rescanFailureMessage } from "@/components/workspace/rescan-button";
```

   and append at the end of the file:

```ts
describe("rescanFailureMessage budget refusals", () => {
  const EXPECTED = {
    en: { workspace: "This workspace has reached today's scan limit. Try again tomorrow.", capacity: "Scanning is at capacity right now. Please try again in a few hours." },
    "zh-HK": { workspace: "此工作台今日的掃描次數已達上限，請明天再試。", capacity: "掃描服務暫時已滿額，請於數小時後再試。" },
    "zh-TW": { workspace: "此工作台今日的掃描次數已達上限，請明天再試。", capacity: "掃描服務目前已達上限，請於幾個小時後再試。" },
  } as const;

  it.each(["en", "zh-HK", "zh-TW"] as const)("names the workspace limit and global capacity separately in %s", (locale) => {
    expect(rescanFailureMessage({ ok: false, status: 429, error: "workspace_scan_budget_reached" }, locale)).toBe(EXPECTED[locale].workspace);
    expect(rescanFailureMessage({ ok: false, status: 503, error: "at_capacity" }, locale)).toBe(EXPECTED[locale].capacity);
  });

  it("still reports the per-workspace rate limit as the rate limit", () => {
    expect(rescanFailureMessage({ ok: false, status: 429, error: "rate_limited" }, "en")).toBe("Rescan limit reached for today (3 per workspace); try again tomorrow.");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm exec vitest run lib/budgets/messages.test.ts tests/i18n.test.ts components/scanning-page.test.tsx tests/phase6-ui.test.tsx`

Expected: FAIL.
- `./messages` does not resolve.
- The i18n test fails "carry exactly the upstream namespaces…", because `budget` is expected but absent.
- The scanning page renders `undefined` text for `atCapacity`.
- `rescanFailureMessage` is not exported.

- [ ] **Step 3: Add the `budget` namespace**

In `lib/messages/en.json`, replace `  "scanner": {` with:

```json
  "budget": {
    "scanAtCapacity": "Free scans are at capacity right now. Please try again in a few hours.",
    "aiLimit": "Today's AI drafting limit has been reached. Try again later."
  },
  "scanner": {
```

In `lib/messages/zh-HK.json`, replace `  "scanner": {` with:

```json
  "budget": {
    "scanAtCapacity": "免費掃描名額暫時已滿，請於數小時後再試。",
    "aiLimit": "今日的 AI 草稿生成額度已用完，請稍後再試。"
  },
  "scanner": {
```

In `lib/messages/zh-TW.json`, replace `  "scanner": {` with:

```json
  "budget": {
    "scanAtCapacity": "免費掃描目前已達上限，請於幾個小時後再試。",
    "aiLimit": "今天的 AI 草稿生成額度已用完，請稍後再試。"
  },
  "scanner": {
```

Each file contains `"scanner": {` exactly once.

- [ ] **Step 4: The two client helpers**

Create `lib/budgets/messages.ts`:

```ts
import { t } from "@/lib/i18n";

/**
 * Spend-budget refusals as people see them (P3.5a). The routes answer with
 * fixed error codes; these helpers turn them into lib/messages copy in the
 * reader's locale, and return null for every other failure. Client-safe: no
 * server imports.
 */
export function scanStartRefusal(locale: string, status: number, error: unknown): string | null {
  return status === 503 && error === "at_capacity" ? t(locale, "budget.scanAtCapacity") : null;
}

export function aiBudgetRefusal(locale: string, status: number, error: unknown): string | null {
  return status === 429 && error === "ai_budget_reached" ? t(locale, "budget.aiLimit") : null;
}
```

- [ ] **Step 5: The public scan page**

In `components/scan-page.tsx`:

1. Replace `import { t } from "@/lib/i18n"` with:

```ts
import { t } from "@/lib/i18n"
import { scanStartRefusal } from "@/lib/budgets/messages"
```

2. Replace:

```ts
      if (response.status === 429) {
        setError(t(locale, "scanner.candidateErrorRateLimited"))
        return
      }
```

with:

```ts
      if (response.status === 429) {
        setError(t(locale, "scanner.candidateErrorRateLimited"))
        return
      }
      // P3.5a: the global scan budget, instead of the server's raw error string.
      const refusal = scanStartRefusal(locale, response.status, data.error)
      if (refusal) {
        setError(refusal)
        return
      }
```

- [ ] **Step 6: The scanning page's Resume**

In `lib/copy.ts`:

1. Replace:

```ts
    stalledResumeNote: string
    elapsedMinutes: string
```

with:

```ts
    stalledResumeNote: string
    atCapacity: string
    elapsedMinutes: string
```

2. Replace:

```ts
    stalledResumeNote: "Resuming never starts a second scan — it can only pick up this same scan. If an attempt is still running, nothing changes; a stopped attempt can be picked up again about {minutes} minutes after it stalled, for up to three attempts.",
```

with:

```ts
    stalledResumeNote: "Resuming never starts a second scan — it can only pick up this same scan. If an attempt is still running, nothing changes; a stopped attempt can be picked up again about {minutes} minutes after it stalled, for up to three attempts.",
    atCapacity: "Scanning is at capacity right now, so this scan will continue later. You can close this page.",
```

3. Replace:

```ts
    stalledResumeNote: "繼續掃描不會開始第二次掃描，只會接手同一次掃描。若仍有執行中的嘗試，此操作不會有任何改變；若嘗試真的已停止，約 {minutes} 分鐘後便可重新接手，最多三次。",
```

with:

```ts
    stalledResumeNote: "繼續掃描不會開始第二次掃描，只會接手同一次掃描。若仍有執行中的嘗試，此操作不會有任何改變；若嘗試真的已停止，約 {minutes} 分鐘後便可重新接手，最多三次。",
    atCapacity: "掃描服務暫時已滿額，這次掃描稍後會繼續進行，你可以關閉此頁。",
```

4. Replace:

```ts
    stalledResumeNote: "繼續掃描不會開始第二次掃描，只會接手同一次掃描。若仍有執行中的嘗試，這個操作不會有任何改變；若嘗試真的已停止，約 {minutes} 分鐘後就能重新接手，最多三次。",
```

with:

```ts
    stalledResumeNote: "繼續掃描不會開始第二次掃描，只會接手同一次掃描。若仍有執行中的嘗試，這個操作不會有任何改變；若嘗試真的已停止，約 {minutes} 分鐘後就能重新接手，最多三次。",
    atCapacity: "掃描服務目前已達上限，這次掃描稍後會繼續進行，你可以關閉這個頁面。",
```

In `components/scanning-page.tsx`:

1. Replace:

```ts
  const [resuming, setResuming] = useState(false)
```

with:

```ts
  const [resuming, setResuming] = useState(false)
  const [atCapacity, setAtCapacity] = useState(false)
```

2. Replace:

```ts
  // The POST runs the scan inline (maxDuration = 300) and can hold the
  // connection for minutes, so it is fire-and-forget with a busy flag; polling
  // stays the source of truth and the response body is never read.
  const resume = useCallback(() => {
    setResuming(true)
    void postProcess().finally(() => setResuming(false))
    restart({ process: true })
  }, [postProcess, restart])
```

with:

```ts
  // The POST runs the scan inline (maxDuration = 300) and can hold the
  // connection for minutes, so it is fire-and-forget with a busy flag; polling
  // stays the source of truth. The one response it reads is the quick
  // 503 at_capacity of a retry refused on the spend budget (P3.5a): the job
  // stays claimable and the cron reclaim continues it later.
  const resume = useCallback(() => {
    setResuming(true)
    setAtCapacity(false)
    void postProcess()
      .then(async (response) => {
        if (response?.status !== 503) return
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null
        if (body?.error === "at_capacity") setAtCapacity(true)
      })
      .finally(() => setResuming(false))
    restart({ process: true })
  }, [postProcess, restart])
```

3. Replace:

```tsx
        {view === "failed" && (
```

with:

```tsx
        {atCapacity && (
          <div className="partial-result-card" role="status">
            <div>
              <p>{c.atCapacity}</p>
            </div>
          </div>
        )}

        {view === "failed" && (
```

- [ ] **Step 7: The rescan button**

In `components/workspace/rescan-button.tsx`:

1. Replace:

```ts
    if (!result.ok) { toast.error(failureMessage(result, t)); return }
```

with:

```ts
    if (!result.ok) { toast.error(rescanFailureMessage(result, locale)); return }
```

2. Replace:

```ts
function failureMessage(result: Extract<ClientResult<unknown>, { ok: false }>, t: (typeof COPY)[PrototypeLocale]): string {
  if (result.error === "offline" || result.error === "network") return t.network
  if (result.error === "tier_required") return t.tier
  if (result.status === 403) return t.forbidden
```

with:

```ts
/**
 * Exported for tests. The spend-budget refusals (P3.5a) are named before the
 * status mapping, because a workspace budget refusal and the per-workspace
 * rate limit are both 429s and mean different things.
 */
export function rescanFailureMessage(result: Extract<ClientResult<unknown>, { ok: false }>, locale: PrototypeLocale): string {
  const t = COPY[locale]
  if (result.error === "offline" || result.error === "network") return t.network
  if (result.error === "tier_required") return t.tier
  if (result.error === "workspace_scan_budget_reached") return t.workspaceBudget
  if (result.error === "at_capacity") return t.atCapacity
  if (result.status === 403) return t.forbidden
```

3. Replace `    failed: "The rescan could not be queued.",` with:

```ts
    failed: "The rescan could not be queued.",
    workspaceBudget: "This workspace has reached today's scan limit. Try again tomorrow.",
    atCapacity: "Scanning is at capacity right now. Please try again in a few hours.",
```

4. Replace `    failed: "未能排隊重新掃描。",` with:

```ts
    failed: "未能排隊重新掃描。",
    workspaceBudget: "此工作台今日的掃描次數已達上限，請明天再試。",
    atCapacity: "掃描服務暫時已滿額，請於數小時後再試。",
```

5. Replace `    failed: "無法排入重新掃描。",` with:

```ts
    failed: "無法排入重新掃描。",
    workspaceBudget: "此工作台今日的掃描次數已達上限，請明天再試。",
    atCapacity: "掃描服務目前已達上限，請於幾個小時後再試。",
```

- [ ] **Step 8: Run the tests to verify they pass**

Run the Step 2 command. Expected: PASS. Then run the full `corepack pnpm test`, `corepack pnpm typecheck` and `corepack pnpm lint` (30 warnings / 0 errors). `tests/unhonoured-promises.test.ts` must stay green: none of the new strings match its banned phrases.

- [ ] **Step 9: Mutation checks**

1. Delete the zh-TW `aiLimit` entry. "share one key set across en, zh-HK and zh-TW" in `tests/i18n.test.ts` must fail, and so must `messages.test.ts`'s per-locale case for zh-TW.
2. In `scanStartRefusal`, change `error === "at_capacity"` to `error !== undefined`. "leaves every other failure to its existing message" must fail on the `503 unavailable` case.
3. In `scanning-page.tsx`, delete `if (body?.error === "at_capacity") setAtCapacity(true)`. All three "says in %s that a refused resume will continue later" cases must fail.
4. In `rescanFailureMessage`, move the `result.status === 429` line above the `workspace_scan_budget_reached` line. "names the workspace limit and global capacity separately in %s" must fail for all three locales.

- [ ] **Step 10: Commit**

```bash
git add lib/messages/en.json lib/messages/zh-HK.json lib/messages/zh-TW.json tests/i18n.test.ts lib/budgets/messages.ts lib/budgets/messages.test.ts components/scan-page.tsx lib/copy.ts components/scanning-page.tsx components/scanning-page.test.tsx components/workspace/rescan-button.tsx tests/phase6-ui.test.tsx
```

Commit message: `feat(P3.5a): honest at-capacity and scan-limit messages in three locales`

---

### Task 9: The AI drafting limit on every draft surface

**Files:**
- Modify: `components/workspace/action-detail-client.tsx`; Test: `components/workspace/action-detail-client.test.tsx`
- Modify: `components/workspace/create-view.tsx`; Test: `components/workspace/create-view.test.tsx`
- Modify: `components/pocket-assistant/assistant-sheet.tsx`; Create: `components/pocket-assistant/assistant-sheet.test.tsx`

- [ ] **Step 1: Write the failing tests**

1. In `components/workspace/action-detail-client.test.tsx`:
   - Replace:

```ts
import { cleanup, fireEvent, render as renderLive, screen } from "@testing-library/react";

const clientMocks = vi.hoisted(() => ({ markApplied: vi.fn(), retractApplied: vi.fn() }));

vi.mock("@/lib/workspace/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  markApplied: clientMocks.markApplied,
  retractApplied: clientMocks.retractApplied,
}));
```

   with:

```ts
import { act, cleanup, fireEvent, render as renderLive, screen } from "@testing-library/react";

const clientMocks = vi.hoisted(() => ({ markApplied: vi.fn(), retractApplied: vi.fn(), runAction: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), message: vi.fn() }));

vi.mock("@/lib/workspace/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  markApplied: clientMocks.markApplied,
  retractApplied: clientMocks.retractApplied,
  runAction: clientMocks.runAction,
}));
vi.mock("sonner", () => ({ toast: toastMocks }));
```

   - Append at the end of the file:

```tsx
describe("the AI drafting limit", () => {
  const DRAFTED_KEY = AGENT_TEMPLATES[0].key;

  beforeEach(() => {
    if (!window.matchMedia)
      window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    clientMocks.runAction.mockReset().mockResolvedValue({ ok: false, status: 429, error: "ai_budget_reached" });
    toastMocks.error.mockReset();
  });
  afterEach(cleanup);

  it.each([
    ["en", "Generate a draft"],
    ["zh-HK", "生成草稿"],
    ["zh-TW", "生成草稿"],
  ] as const)("says in %s that today's drafting limit was reached", async (locale, label) => {
    renderLive(
      <ActionDetailClient
        locale={locale}
        workspaceSlug="kam-man-house"
        workspaceId="ws-1"
        timezone="Asia/Hong_Kong"
        role="owner"
        inScope
        location="yik-yam"
        detail={detail(DRAFTED_KEY)}
        auditRows={[]}
        locations={[{ slug: "yik-yam", name: "Yik Yam" }]}
        approvedAssets={[]}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
    });
    expect(clientMocks.runAction).toHaveBeenCalledWith("act-1", {});
    expect(toastMocks.error).toHaveBeenCalledWith(getMessages(locale).budget.aiLimit);
  });
});
```

2. In `components/workspace/create-view.test.tsx`:
   - Replace:

```ts
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
```

   with:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render as renderLive, screen } from "@testing-library/react";

const clientMocks = vi.hoisted(() => ({ createObjectiveAction: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), message: vi.fn() }));
vi.mock("@/lib/workspace/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createObjectiveAction: clientMocks.createObjectiveAction,
}));
vi.mock("sonner", () => ({ toast: toastMocks }));
```

   - Replace:

```ts
import { TEMPLATES } from "@/lib/workspace/templates";
```

   with:

```ts
import { TEMPLATES } from "@/lib/workspace/templates";
import { getMessages } from "@/lib/i18n";
```

   - Append at the end of the file:

```tsx
describe("CreateView and the AI drafting limit", () => {
  beforeEach(() => {
    if (!window.matchMedia)
      window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    clientMocks.createObjectiveAction.mockReset().mockResolvedValue({ ok: true, data: { actionId: "act-new", runError: "ai_budget_reached" } });
    toastMocks.error.mockReset();
  });
  afterEach(cleanup);

  it.each([
    ["en", "What do you want to achieve?", "Create the action and draft"],
    ["zh-HK", "你想達成甚麼？", "建立行動並生成草稿"],
    ["zh-TW", "你想達成甚麼？", "建立行動並生成草稿"],
  ] as const)("says in %s that the action exists but today's drafting limit was reached", async (locale, field, button) => {
    renderLive(
      <CreateView
        locale={locale}
        workspaceSlug="kam-man-house"
        workspaceId="ws-1"
        role="owner"
        inScope
        location="yik-yam"
        locationId="loc-1"
        locations={[{ slug: "yik-yam", name: "Yik Yam" }]}
        openActions={[]}
      />,
    );
    fireEvent.change(screen.getByLabelText(field), { target: { value: "Promote this week's lunch set warmly" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(button) }));
    });
    expect(clientMocks.createObjectiveAction).toHaveBeenCalledOnce();
    expect(toastMocks.error).toHaveBeenCalledWith(getMessages(locale).budget.aiLimit);
  });
});
```

3. Create `components/pocket-assistant/assistant-sheet.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ContextualAssistant } from "@/components/pocket-assistant/assistant-sheet";
import { getMessages } from "@/lib/i18n";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const TRIGGER = { en: "Ask Visibility Operator", "zh-HK": "問隨身增長助理", "zh-TW": "問隨身增長助理" } as const;
const QUESTION = { en: "Draft one suitable review reply", "zh-HK": "示範 1 則合適的評論回覆", "zh-TW": "示範 1 則合適的評論回覆" } as const;

beforeEach(() => {
  if (!window.matchMedia)
    window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function ask(locale: keyof typeof TRIGGER) {
  render(<ContextualAssistant locale={locale} surface="actions" mode="live" context={{ workspaceId: WORKSPACE_ID }} />);
  fireEvent.click(screen.getByRole("button", { name: TRIGGER[locale] }));
  const question = await screen.findByRole("button", { name: QUESTION[locale] });
  await act(async () => {
    fireEvent.click(question);
  });
}

describe("ContextualAssistant and the AI drafting limit", () => {
  it.each(["en", "zh-HK", "zh-TW"] as const)("shows the %s limit message instead of a generic failure", async (locale) => {
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: "ai_budget_reached" }) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchSpy);
    await ask(locale);
    expect(await screen.findByText(getMessages(locale).budget.aiLimit)).toBeInTheDocument();
    expect(screen.queryByText(locale === "en" ? "The run could not complete" : "暫時未能完成")).toBeNull();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("still reports any other failure as a failed run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: "rate_limited" }) }) as unknown as Response));
    await ask("en");
    expect(await screen.findByText("The run could not complete")).toBeInTheDocument();
    expect(screen.queryByText(getMessages("en").budget.aiLimit)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm exec vitest run components/workspace/action-detail-client.test.tsx components/workspace/create-view.test.tsx components/pocket-assistant/assistant-sheet.test.tsx`

Expected: FAIL.
- Action detail toasts "Too many requests; try again shortly." (or 請求過於頻繁…).
- Create toasts "Action created, but the draft could not be started.".
- The sheet shows "The run could not complete".
- The existing tests in both component files still pass.

- [ ] **Step 3: Action detail**

In `components/workspace/action-detail-client.tsx`:

1. Replace `import { t } from "@/lib/i18n"` with:

```ts
import { t } from "@/lib/i18n"
import { aiBudgetRefusal } from "@/lib/budgets/messages"
```

2. Replace:

```ts
  function failureToast<T>(result: Extract<ClientResult<T>, { ok: false }>) {
    if (result.error === "offline" || result.error === "network") toast.error(isChinese ? "無法連接伺服器；文字已保留在此裝置。" : "The server could not be reached; your text is kept on this device.")
```

with:

```ts
  function failureToast<T>(result: Extract<ClientResult<T>, { ok: false }>) {
    // P3.5a: named before the generic 429, which means "too many requests".
    const budgetRefusal = aiBudgetRefusal(locale, result.status, result.error)
    if (result.error === "offline" || result.error === "network") toast.error(isChinese ? "無法連接伺服器；文字已保留在此裝置。" : "The server could not be reached; your text is kept on this device.")
    else if (budgetRefusal) toast.error(budgetRefusal)
```

- [ ] **Step 4: Create**

In `components/workspace/create-view.tsx`:

1. Replace:

```ts
import { TEMPLATES, type TemplateKey } from "@/lib/workspace/templates"
```

with:

```ts
import { TEMPLATES, type TemplateKey } from "@/lib/workspace/templates"
import { t } from "@/lib/i18n"
```

2. Replace:

```ts
    if (runError) {
      toast.error(isChinese ? "行動已建立，但未能開始生成草稿。" : "Action created, but the draft could not be started.")
```

with:

```ts
    if (runError === "ai_budget_reached") {
      // P3.5a: the action exists; only the draft was refused, before any model call.
      toast.error(t(locale, "budget.aiLimit"))
    } else if (runError) {
      toast.error(isChinese ? "行動已建立，但未能開始生成草稿。" : "Action created, but the draft could not be started.")
```

- [ ] **Step 5: The assistant sheet**

In `components/pocket-assistant/assistant-sheet.tsx`:

1. Replace:

```ts
import { ASSISTANT_RUN_ENDPOINT, buildAssistantRequest } from "@/lib/pocket-assistant/request"
```

with:

```ts
import { ASSISTANT_RUN_ENDPOINT, buildAssistantRequest } from "@/lib/pocket-assistant/request"
import { aiBudgetRefusal } from "@/lib/budgets/messages"
```

2. Replace:

```ts
  const [versionCreated, setVersionCreated] = useState(false)
  const questions = surfaceQuestions[surface]
```

with:

```ts
  const [versionCreated, setVersionCreated] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const questions = surfaceQuestions[surface]
```

3. Replace:

```ts
    setVersionCreated(false)
    setState("running")
    try {
      const response = await fetch(ASSISTANT_RUN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAssistantRequest(mode, surface, questionId, locale, context)),
      })
      if (!response.ok) throw new Error("assistant_run_failed")
```

with:

```ts
    setVersionCreated(false)
    setRefusal(null)
    setState("running")
    try {
      const response = await fetch(ASSISTANT_RUN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAssistantRequest(mode, surface, questionId, locale, context)),
      })
      if (!response.ok) {
        // P3.5a: a spend-budget refusal is an answer, not a broken run.
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null
        const refused = aiBudgetRefusal(locale, response.status, body?.error)
        if (refused) {
          setRefusal(refused)
          setState("idle")
          return
        }
        throw new Error("assistant_run_failed")
      }
```

4. Replace:

```tsx
          <AssistantRunStatus state={state} isChinese={isChinese} mode={mode} />
```

with:

```tsx
          <AssistantRunStatus state={state} isChinese={isChinese} mode={mode} />

          {refusal && <div className="assistant-warning" role="alert"><ShieldCheck aria-hidden="true" /><div><p>{refusal}</p></div></div>}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run the Step 2 command. Expected: PASS. Then run the full `corepack pnpm test`, `corepack pnpm typecheck` and `corepack pnpm lint` (30 warnings / 0 errors).

- [ ] **Step 7: Mutation checks**

1. In `action-detail-client.tsx`, delete `else if (budgetRefusal) toast.error(budgetRefusal)`. All three "says in %s that today's drafting limit was reached" cases must fail.
2. In `create-view.tsx`, change `runError === "ai_budget_reached"` to `runError === "ai_budget"`. All three Create cases must fail.
3. In `assistant-sheet.tsx`, delete the `if (refused) { … }` block. All three "shows the %s limit message instead of a generic failure" cases must fail.
4. In `lib/messages/zh-HK.json`, change `aiLimit` to the zh-TW text. `messages.test.ts` "keeps zh-HK and zh-TW in their own registers" must fail.

- [ ] **Step 8: Commit**

```bash
git add components/workspace/action-detail-client.tsx components/workspace/action-detail-client.test.tsx components/workspace/create-view.tsx components/workspace/create-view.test.tsx components/pocket-assistant/assistant-sheet.tsx components/pocket-assistant/assistant-sheet.test.tsx
```

Commit message: `feat(P3.5a): the AI drafting limit message on every draft surface`

---

### Task 10: Gates, the phase record and the rollout

**Files:**
- Modify: `docs/implementation/owner-platform-v1/PHASE-3-REPORT.md` (append a section)
- Modify: `docs/implementation/owner-platform-v1/PHASE-3-TEST-RESULTS.md` (append a section)

- [ ] **Step 1: Confirm what must not have changed**

Run:

```
git diff --stat origin/main -- packages neon/migrations/0001_identity.sql neon/migrations/0002_business.sql neon/migrations/0003_workflows.sql neon/migrations/0004_atomic_operations.sql neon/migrations/0005_owner_removal_guard.sql neon/migrations/0006_action_applications.sql neon/migrations/0007_action_verification.sql neon/migrations/0008_workspace_internal.sql app/api/cron/dispatch/route.ts lib/repositories/scheduler.ts
```

Expected: empty output.

- [ ] **Step 2: Measure the baseline, then run every gate one at a time**

First measure the baseline yourself. Check out `origin/main` in a scratch worktree, or read the P3.2c record's final numbers (unit 324 files / 3,450 tests; integration 30 files / 323 tests), and state which you used. Then, at HEAD:

```
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm test:integration
corepack pnpm db:verify
corepack pnpm build
```

Expected results:
- `typecheck`: exit 0.
- `lint`: exit 0, with 30 warnings and 0 errors, the same files as `origin/main`.
- `test`: exit 0. Record the file and test counts, and explain the delta file by file.
- `test:integration`: exit 0. The file count rises by exactly 3: `neon-scan-admission`, `neon-scan-claim-budget` and `neon-ai-spend`. Record the counts and explain the test delta, including the two changed tests (see "Where this plan departs from the spec", item 10).
- `db:verify`: exit 0, with the numbers predicted in Task 2 (36 / 422 / 162 / 92 / 8 / 14, journal 9).
- `build`: expected to be **blocked** by the standing Turbopack/radix-ui cascade on this Windows machine. Record it as blocked, not failed. Then run `npx next build --webpack` separately as a labelled diagnostic and record that outcome too.

`e2e` and `e2e:acceptance` are **not run** locally, because they need a production build. Record that, and say that CI runs them. If a run shows an unrelated flaky failure, re-run it once and record both results. Restore the two snapshot files if they are line-ending-only changes.

- [ ] **Step 3: Re-run the mutation checks**

Re-run every mutation check from Tasks 1–9 with a scratch script. For each one, the script applies the mutation by exact pattern and refuses to proceed unless the pattern matches exactly once. It then runs the named test file, writes the original bytes back and compares them. Record each result as killed or survived, with the failing test's name. A survivor is a finding: record it and report it.

- [ ] **Step 4: Append the phase record**

Add a `## P3.5a — spend budgets` section to `PHASE-3-REPORT.md`, after the P3.2c section. Match the structure and status vocabulary of the P3.4 and P3.2c sections: passed / failed / blocked / not run, and implemented / locally verified / hosted verified. It must include:

1. **Header.** The branch `p35a-spend-budgets`, HEAD, and base `main` at `96519fc`. A link to the spec and to this plan. The environment line (Node, pnpm, Docker Server version). Then, in bold: **Implemented and locally verified. Nothing here is hosted-verified.** No deployment, no remote migration, no paid provider call, no push. Migration `0009` was applied only to disposable Docker Postgres.
2. **What this closes.** The Master Plan's P3.5 requirement, and the three uncapped paths the spec lists (public scans, owner rescans, AI drafts). Explain the difference between the delivery allowance (what an owner may ship) and a budget (what the app may spend producing evidence and drafts).
3. **What changed, by task.** A table with one row per commit, like P3.4's.
4. **The design as built.** Every item under "Where this plan departs from the spec" in this plan, each with its reason. Then the three "Known, not changed" items.
5. **Verification.** A summary table of every gate, with the exact command, exit code and counts. The full detail goes in `PHASE-3-TEST-RESULTS.md`.
6. **Verification checklist.** Walk this plan's checklist item by item against the code at HEAD. Give each item a status (Holds / Partly / Does not hold) and name the test that proves it.
7. **Runbook (owner actions).**
   1. Rehearse the `0009` application on a fixture that matches production's roles. Use the single-statement `DO` block procedure used for 0005–0008: run as `neondb_owner` with `SET LOCAL ROLE smeassistant_migrator`; refuse unless the journal is exactly `0001`–`0008`; record the journal row.
   2. Apply `0009` to production **before** deploying. The new claim writes to `scan_attempts`, so every scan fails without the table. `neon:readiness` reports `not_ready` / `schema` until `scan_attempts` exists, because it checks every Drizzle table.
   3. Deploy `main`. The global defaults apply immediately: 200 scan attempts and US$20 of recorded AI cost per rolling 24 hours.
   4. Optionally set, or turn `off`, the four variables in Vercel. An empty or invalid value refuses the work it guards and logs `[budget] check_failed` with `reason: "configuration"`.
   5. Watch for `[budget] refused` and `[budget] check_failed` in the runtime logs.
8. **What this slice does NOT prove.**
   - Nothing is hosted-verified until `0009` is applied and the app is deployed.
   - AI runs with no recorded cost count as zero.
   - Report summaries (`lib/llm-summary.ts`) are not metered.
   - Provider-level fallbacks inside one attempt are not counted separately.
   - "This scan will continue later" relies on the cron reclaim (`app/api/cron/dispatch`) being scheduled in production.
   - The AI pre-check can overshoot by one run per concurrent request.
   - The Chinese copy was not reviewed by a native speaker. It follows the repository register rules: 香港書面中文 for zh-HK, 台灣用語 for zh-TW, 工作台 as the workspace term.
   - The rescan at-capacity wording is an assumption awaiting the owner.
   - The two defaults are placeholders, not commercial decisions.

Add a matching `## P3.5a — spend budgets` section to `PHASE-3-TEST-RESULTS.md`, after the P3.2c section, following its structure:
- the candidate line and a "Read this first" paragraph;
- gate results;
- the test breakdown by suite and by file;
- the build gate;
- migration verification (the `db:verify` JSON, against the Task 2 prediction);
- the integration suite detail for the three new files and the two changed tests;
- the mutation-check table from Step 3;
- "What this did not run": `e2e`, `e2e:acceptance`, `test:secret-boundary` (inherits the build blocker), and any hosted check.

- [ ] **Step 5: Commit**

```bash
git add docs/implementation/owner-platform-v1/PHASE-3-REPORT.md docs/implementation/owner-platform-v1/PHASE-3-TEST-RESULTS.md
```

Commit message: `docs(P3.5a): record the spend budgets slice`

---

## Verification checklist

- [ ] With no variables set, the limits are 200 scan attempts and US$20 per rolling 24 hours, globally, and the per-workspace limits are off (`config.test.ts`).
- [ ] `off` disables a limit, and every other invalid value throws `budget_configuration_invalid` naming the variable (`config.test.ts`).
- [ ] Migration `0009` adds `scan_attempts`, two indexes on it and two on `action_runs`, with RLS, grants and the server-only policy. `db:verify` reports 36 / 422 / 162 / 92, journal 9 (Task 2).
- [ ] Every claim writes exactly one `scan_attempts` row carrying the job's workspace, and a job that is not claimed gets none (`neon-scan-claim-budget`).
- [ ] A first attempt is claimed even when the budget is spent (`neon-scan-claim-budget` "still runs an admitted first attempt…").
- [ ] An over-limit retry stays unclaimed, keeps its status and attempt count, remains claimable for the cron, and reports `at_capacity` → `503 { error: "at_capacity" }` (`neon-scan-claim-budget`, `run.test.ts`, the process-route test).
- [ ] Pending jobs count as reserved attempts, at admission and at the claim, and pending jobs older than 24 hours do not (`neon-scan-admission`, `neon-scan-claim-budget`).
- [ ] Two admissions racing for the last slot admit exactly one, and a burst of eight admits exactly the free slots (`neon-scan-admission`).
- [ ] Two retries racing for the last slot are serialized by the lock (`neon-scan-claim-budget`).
- [ ] The workspace limit applies only to that workspace. A public scan and another workspace are unaffected (`neon-scan-admission`, `neon-scan-claim-budget`).
- [ ] `POST /api/scan/start` answers `503 at_capacity`. The rescan route answers `503 at_capacity` or `429 workspace_scan_budget_reached`. The cron reclaim treats a 503 as skip-and-retry.
- [ ] The AI sum reads only `action_runs.cost_usd` in the window, globally and per workspace (`neon-ai-spend`).
- [ ] `runAgentForAction` and the assistant's `draft()` refuse before `llmComplete` and answer `429 ai_budget_reached`. The Create page gets `runError: "ai_budget_reached"` with its action kept.
- [ ] A failed assistant draft records a `failed` run with its measured cost, and can never be redeemed into a version (`live.test.ts`, `neon-assistant-live`).
- [ ] An error in any budget check refuses the work and logs `[budget] check_failed`. An over-limit refusal logs exactly `[budget] refused { scope, entry, used, limit }`, with no names, emails or ids.
- [ ] Every refusal message exists in en, zh-HK and zh-TW, and each surface shows it: scan page, scanning Resume, rescan button, action detail, Create, assistant sheet (Tasks 8–9).
- [ ] `packages/**`, migrations `0001`–`0008`, the cron route and the scheduler repository are unchanged (Task 10 Step 1).
- [ ] Every mutation check failed its named test.
