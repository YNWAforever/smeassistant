# P3.5d Incident Runbook and Kill Switches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two environment kill switches (`SCANS_PAUSED`, `AI_DRAFTS_PAUSED`) that stop all provider and AI spend without losing queued work, and one incident runbook whose SQL is executed by a test.

**Architecture:** The pauses are checked first inside the existing P3.5a budget functions (`admitScanJob`, `claimScanJob`, `checkAiBudget`), as new refusal scopes (`scan_paused`, `ai_paused`), so every route that already maps a budget refusal gains a `paused` branch. `llmComplete` returns `null` while AI is paused as a backstop. The cron tick skips reclaim while scans are paused. The runbook is Markdown; its SQL lives in a named-block `.sql` file that an integration test parses and runs.

**Tech Stack:** Next.js 16, TypeScript strict, `pg`, Vitest 4 (unit + Docker integration with `NEON_INTEGRATION=1`).

**Spec:** `docs/superpowers/specs/2026-09-26-incident-runbook-design.md`

---

## Ground rules for every task

- Worktree: `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p35d-incident-runbook` (branch `p35d-incident-runbook`, stacked on `p35b-failure-view`).
- Unit: `corepack pnpm vitest run <path>`. Integration (bash, Docker running): `NEON_INTEGRATION=1 corepack pnpm vitest run --config vitest.integration.config.ts <path>`. Quote bracketed paths.
- **Never** edit `packages/**`, `neon/migrations/**` or `docs/implementation/owner-platform-v1/rollout/apply-0009.sql`. No migration. No paid provider calls. No `git push`.
- Before each commit: `git status --short`; restore CRLF-only snapshot diffs (`lib/agents/__snapshots__/agents.test.ts.snap`, `lib/pocket-assistant/__snapshots__/demo.test.ts.snap`) with `git checkout -- <file>`. Do not put `grep -n` and `git commit` in one command.
- Run `corepack pnpm typecheck` and eslint on changed files before each commit; `corepack pnpm lint` must stay at 0 errors / 30 warnings.
- Commit messages end with a `Co-Authored-By:` trailer.

## File map

| File | Responsibility |
|---|---|
| `lib/budgets/pause.ts` (create) | `readPauseConfig`, `pauseState` (fail closed), `logPauseRefusal` |
| `.env.example` (modify) | Document both variables, commented out |
| `lib/budgets/log.ts` (modify) | Scopes `scan_paused`, `ai_paused` |
| `lib/budgets/scan.ts` (modify) | Pause first in `admitScanJob` and `claimScanJob`; `ClaimOutcome` gains `paused` |
| `lib/scan/execution-store.ts`, `lib/scan/run.ts`, `app/api/scan/process/route.ts` (modify) | Claim refused on pause → `503 paused` |
| `app/api/scan/start/route.ts`, `lib/workspace/rescan.ts`, `app/api/workspaces/[workspaceId]/rescan/route.ts` (modify) | Admission refused on pause → `503 paused` |
| `app/api/cron/dispatch/route.ts` (modify) | Skip reclaim while scans are paused |
| `lib/budgets/ai.ts`, `lib/workspace/runs.ts`, `app/api/actions/[actionId]/run/route.ts`, `app/api/assistant/run/route.ts`, `app/api/actions/route.ts` (modify) | AI refused on pause → `503 ai_paused` (Create: `runError: "ai_paused"`) |
| `lib/llm.ts` (modify) | Backstop: `null` while AI is paused |
| `lib/messages/{en,zh-HK,zh-TW}.json`, `tests/i18n.test.ts`, `lib/budgets/messages.ts`, `components/workspace/rescan-button.tsx`, `components/workspace/create-view.tsx`, `components/scanning-page.tsx` (modify) | Owner copy |
| `app/[locale]/ops/failures/page.tsx` (modify) | Operator pause banner |
| `docs/implementation/owner-platform-v1/rollout/incident-queries.sql` (create) | Runbook SQL, named blocks |
| `lib/ops/incident-queries.ts` (create) | Parser for the SQL file (used by tests) |
| `docs/implementation/owner-platform-v1/INCIDENT-RUNBOOK.md` (create) | The runbook |
| `PHASE-3-REPORT.md`, `PHASE-3-TEST-RESULTS.md` (modify) | P3.5d record |

---

### Task 1: Pause configuration

**Files:** Create `lib/budgets/pause.ts`, `lib/budgets/pause.test.ts`; modify `.env.example`.

- [ ] **Step 1: Write the failing test** — `lib/budgets/pause.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { PauseConfigurationError, logPauseRefusal, pauseState, readPauseConfig } from "./pause";

afterEach(() => vi.restoreAllMocks());

describe("readPauseConfig", () => {
  it("is off when unset or empty", () => {
    expect(readPauseConfig({})).toEqual({ scans: false, ai: false });
    expect(readPauseConfig({ SCANS_PAUSED: "", AI_DRAFTS_PAUSED: "" })).toEqual({ scans: false, ai: false });
  });

  it("is on only for exactly 'true'", () => {
    expect(readPauseConfig({ SCANS_PAUSED: "true" })).toEqual({ scans: true, ai: false });
    expect(readPauseConfig({ AI_DRAFTS_PAUSED: "true" })).toEqual({ scans: false, ai: true });
  });

  it("throws, naming the variable, for any other value", () => {
    for (const value of ["TRUE", "yes", "1", "false", " true"]) {
      expect(() => readPauseConfig({ SCANS_PAUSED: value })).toThrow(new PauseConfigurationError("SCANS_PAUSED"));
      expect(() => readPauseConfig({ AI_DRAFTS_PAUSED: value })).toThrow("pause_configuration_invalid: AI_DRAFTS_PAUSED");
    }
  });
});

describe("pauseState", () => {
  it("passes a valid configuration through", () => {
    expect(pauseState({ SCANS_PAUSED: "true" })).toEqual({ scans: true, ai: false });
  });

  it("fails closed: an invalid value pauses both, and is logged with the variable", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(pauseState({ AI_DRAFTS_PAUSED: "yes" })).toEqual({ scans: true, ai: true });
    expect(error).toHaveBeenCalledWith("[pause] configuration_invalid", { variable: "AI_DRAFTS_PAUSED" });
  });
});

describe("logPauseRefusal", () => {
  it("writes one fixed line", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logPauseRefusal("scan_start");
    expect(warn).toHaveBeenCalledWith("[pause] refused", { entry: "scan_start" });
  });
});
```

- [ ] **Step 2: Run it; expect FAIL** (module not found): `corepack pnpm vitest run lib/budgets/pause.test.ts`

- [ ] **Step 3: Implement** — `lib/budgets/pause.ts`:

```ts
/**
 * Incident kill switches (P3.5d, docs/superpowers/specs/2026-09-26-incident-runbook-design.md).
 *
 * Unset or empty = off; exactly "true" = on; anything else is a configuration
 * error, because an operator who typed TRUE must not believe spend is stopped.
 * Environment only, never the database, so a pause cannot fail on an outage.
 * Client-safe: no server imports.
 */
export const PAUSE_VARIABLES = ["SCANS_PAUSED", "AI_DRAFTS_PAUSED"] as const;
export type PauseVariable = (typeof PAUSE_VARIABLES)[number];

export interface PauseConfig {
  scans: boolean;
  ai: boolean;
}

export class PauseConfigurationError extends Error {
  constructor(readonly variable: PauseVariable) {
    super(`pause_configuration_invalid: ${variable}`);
    this.name = "PauseConfigurationError";
  }
}

type Env = Record<string, string | undefined>;

function flag(env: Env, variable: PauseVariable): boolean {
  const value = env[variable];
  if (value === undefined || value === "") return false;
  if (value === "true") return true;
  throw new PauseConfigurationError(variable);
}

export function readPauseConfig(env: Env): PauseConfig {
  return { scans: flag(env, "SCANS_PAUSED"), ai: flag(env, "AI_DRAFTS_PAUSED") };
}

/** What every entry point uses. An invalid value pauses both: never spend through a typo. */
export function pauseState(env: Env = process.env): PauseConfig {
  try {
    return readPauseConfig(env);
  } catch (error) {
    const variable = error instanceof PauseConfigurationError ? error.variable : "unknown";
    console.error("[pause] configuration_invalid", { variable });
    return { scans: true, ai: true };
  }
}

export type PauseEntry = "scan_start" | "rescan" | "retry_claim" | "ai_run" | "assistant_draft" | "llm";

/** The one line every paused refusal writes. Fixed text only. */
export function logPauseRefusal(entry: PauseEntry): void {
  console.warn("[pause] refused", { entry });
}
```

- [ ] **Step 4: Run it; expect PASS** (6 tests).

- [ ] **Step 5: Document** — in `.env.example`, directly after the four `BUDGET_*` lines, add:

```bash
# Incident kill switches (P3.5d, docs/implementation/owner-platform-v1/INCIDENT-RUNBOOK.md).
# Exactly "true" pauses; any other set value is treated as paused and logged. Redeploy to apply.
# SCANS_PAUSED=true          # refuse new scans, rescans and claims of queued jobs; queued work is kept
# AI_DRAFTS_PAUSED=true      # refuse owner and assistant drafts and every other LLM call
```

- [ ] **Step 6: Commit** — `git add lib/budgets/pause.ts lib/budgets/pause.test.ts .env.example` → `feat(P3.5d): incident kill-switch configuration`

---

### Task 2: Scan pause in the budget functions

**Files:** Modify `lib/budgets/log.ts`, `lib/budgets/scan.ts`, `lib/budgets/scan.test.ts`; create `test/integration/neon-scan-pause.integration.test.ts`.

- [ ] **Step 1: Failing unit tests** — append to `lib/budgets/scan.test.ts` (it already has the `client()` fake):

```ts
describe("scan pause (P3.5d)", () => {
  it("refuses admission with scan_paused before locking or counting", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = client([{ global_used: 0, workspace_used: 0 }]);
    const refusal = await admitScanJob(fake.db, { workspaceId: null, entry: "scan_start" }, { SCANS_PAUSED: "true" }).catch((e) => e);
    expect(refusal).toBeInstanceOf(ScanBudgetRefusal);
    expect(refusal.scope).toBe("scan_paused");
    expect(refusal.message).toBe("paused");
    expect(fake.statements()).toEqual([]);
    expect(warn).toHaveBeenCalledWith("[pause] refused", { entry: "scan_start" });
  });

  it("refuses admission when the pause value is invalid (fail closed)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const refusal = await admitScanJob(client([]).db, { workspaceId: "ws", entry: "rescan" }, { SCANS_PAUSED: "yes" }).catch((e) => e);
    expect(refusal.scope).toBe("scan_paused");
  });

  it("reports a paused claim without running any statement", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = client([{ budget_allowed: true, id: "job-1" }]);
    expect(await claimScanJob(fake.db, "job-1", { SCANS_PAUSED: "true" })).toEqual({ kind: "paused" });
    expect(fake.statements()).toEqual([]);
  });

  it("is not affected by the AI switch", async () => {
    const fake = client([{ budget_allowed: true, budget_global_used: 0, budget_workspace_used: 0, id: "job-1" }]);
    expect((await claimScanJob(fake.db, "job-1", { AI_DRAFTS_PAUSED: "true" })).kind).toBe("claimed");
  });
});
```

- [ ] **Step 2: Run; expect FAIL.** `corepack pnpm vitest run lib/budgets/scan.test.ts`

- [ ] **Step 3: Implement.**

In `lib/budgets/log.ts` change the scope type to:

```ts
export type BudgetScope = "scan_global" | "scan_workspace" | "scan_paused" | "ai_global" | "ai_workspace" | "ai_paused";
```

In `lib/budgets/scan.ts`:

1. Add `import { logPauseRefusal, pauseState } from "./pause";`.
2. Change `ScanBudgetScope` to `Extract<BudgetScope, "scan_global" | "scan_workspace" | "scan_paused">`.
3. Change the `ScanBudgetRefusal` constructor's `super(...)` to:

```ts
    super(scope === "scan_workspace" ? "workspace_scan_budget_reached" : scope === "scan_paused" ? "paused" : "at_capacity");
```

4. In `admitScanJob`, as the first statement:

```ts
  // P3.5d: the incident pause first, before the lock, counting or any write.
  if (pauseState(env).scans) {
    logPauseRefusal(input.entry);
    throw new ScanBudgetRefusal("scan_paused");
  }
```

5. Add `| { kind: "paused" }` to `ClaimOutcome`.
6. In `claimScanJob`, as the first statement:

```ts
  // P3.5d: a paused claim touches nothing, so the job stays exactly as it was
  // (queued or claimable, no attempt row) and resumes when the pause lifts.
  if (pauseState(env).scans) {
    logPauseRefusal("retry_claim");
    return { kind: "paused" };
  }
```

- [ ] **Step 4: Run; expect PASS** (all of `lib/budgets/scan.test.ts`). Fix any exhaustiveness type error in `lib/scan/execution-store.ts` only in Task 3 (typecheck may fail until then; run `corepack pnpm vitest run lib/budgets` now).

- [ ] **Step 5: Failing integration test** — `test/integration/neon-scan-pause.integration.test.ts`. Copy the setup (fixture, roles, runtime pool, `ports` mock of `lib/db/client`, `start()`, `written()`) from `test/integration/neon-scan-admission.integration.test.ts`, and the `store()` helper and `job()` helper from `test/integration/neon-scan-claim-budget.integration.test.ts`. Then:

```ts
  it("a paused start writes nothing", async () => {
    vi.stubEnv("SCANS_PAUSED", "true");
    const result = await start();
    expect(!result.ok && result.error instanceof ScanBudgetRefusal && result.error.scope).toBe("scan_paused");
    expect(await written()).toEqual({ jobs: 0, consents: 0, started: 0 });
  });

  it("a paused claim leaves the job untouched, and it claims normally once un-paused", async () => {
    const id = await job({ status: "queued" });
    const paused = store({ SCANS_PAUSED: "true" });
    expect(await paused.store.claimJob(id)).toBeNull();
    expect(paused.onBudgetRefused).toHaveBeenCalledWith("scan_paused");
    const row = (await runtime.query("SELECT status, attempt_count, last_attempt_at FROM audit_jobs WHERE id=$1", [id])).rows[0];
    expect(row).toEqual({ status: "queued", attempt_count: 0, last_attempt_at: null });
    expect((await runtime.query("SELECT count(*)::int AS n FROM scan_attempts WHERE job_id=$1", [id])).rows[0].n).toBe(0);
    expect(await store({}).store.claimJob(id)).not.toBeNull();
  });
```

Run it; it must PASS once Task 3's store change is in — if the store does not yet forward `scan_paused`, the second test fails on `onBudgetRefused`. Implement Task 3 Step 3 item 1 now if needed, or run this test at the end of Task 3.

- [ ] **Step 6: Mutation check** — delete the pause block in `admitScanJob`; the first unit test and "a paused start writes nothing" fail. Revert.

- [ ] **Step 7: Commit** — `feat(P3.5d): scan pause in admission and claim` (include the integration test).

---

### Task 3: Scan pause at the routes and the cron

**Files:** Modify `lib/scan/execution-store.ts`, `lib/scan/run.ts`, `app/api/scan/process/route.ts`, `app/api/scan/start/route.ts`, `lib/workspace/rescan.ts`, `app/api/workspaces/[workspaceId]/rescan/route.ts`, `app/api/cron/dispatch/route.ts`, and their existing tests.

- [ ] **Step 1: Failing tests.** In each existing test file, add a case next to the existing `at_capacity` case, following its pattern:
  - `app/api/scan/start/route.test.ts` (or the test covering the start route — find with `grep -rln "at_capacity" app/api/scan`): `insertScanJob` resolving `{ ok: false, error: new ScanBudgetRefusal("scan_paused") }` → `503 { error: "paused" }`.
  - process route test: `runScan` resolving `{ status: "paused" }` → `503 { error: "paused" }` with the analytics cookie set, as for `at_capacity`.
  - `lib/workspace/rescan` test: a `ScanBudgetRefusal("scan_paused")` from the insert → `{ ok: false, reason: "paused" }`; rescan route test: reason `paused` → `503 { error: "paused" }`.
  - `lib/scan/run` test (if one exists; else cover through the process route test): the store's `onBudgetRefused("scan_paused")` → `runScan` returns `{ status: "paused" }`; `onBudgetRefused("scan_global")` still → `at_capacity`.
  - `app/api/cron/dispatch/route.test.ts`:

```ts
  it("skips the reclaim dispatch while scans are paused, but still closes and reconciles", async () => {
    vi.stubEnv("SCANS_PAUSED", "true");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    claimableJobIds.mockResolvedValue(["job-1"]);
    const response = await POST(request());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(claimableJobIds).not.toHaveBeenCalled();
    expect(closeExhausted).toHaveBeenCalled();
    expect(reconcileWorkspaceScans).toHaveBeenCalled();
    expect((await response.json()).reclaimCandidates).toBe(0);
  });
```

- [ ] **Step 2: Run; expect the new cases to FAIL.**

- [ ] **Step 3: Implement.**
  1. `lib/scan/execution-store.ts` `claimJob`: replace `if (outcome.kind === "at_capacity") { options.onBudgetRefused?.(outcome.scope); return null; }` with:

```ts
      if (outcome.kind === "at_capacity") {
        options.onBudgetRefused?.(outcome.scope);
        return null;
      }
      if (outcome.kind === "paused") {
        options.onBudgetRefused?.("scan_paused");
        return null;
      }
```

  (Widen the `onBudgetRefused` option type to `(scope: ScanBudgetScope) => void` if it is narrower.)
  2. `lib/scan/run.ts`: `RunScanResult = ScanProcessResult | { status: "at_capacity" } | { status: "paused" }`; record the scope (`let refusal: ScanBudgetScope | null = null; onBudgetRefused: (scope) => { refusal = scope; }`) and return `{ status: refusal === "scan_paused" ? "paused" : "at_capacity" }` when `result.status === "already_claimed" && refusal !== null`.
  3. `app/api/scan/process/route.ts`: after the `at_capacity` branch add the same branch for `"paused"` returning `503 { error: "paused" }` with the analytics cookie.
  4. `app/api/scan/start/route.ts`: `return NextResponse.json({ error: created.error.scope === "scan_paused" ? "paused" : "at_capacity" }, { status: 503 });` and update the comment to mention `[pause] refused`.
  5. `lib/workspace/rescan.ts`: add `"paused"` to `RescanRefusal`; map `error.scope === "scan_paused" ? "paused" : error.scope === "scan_workspace" ? "workspace_scan_budget_reached" : "at_capacity"`.
  6. rescan route: `if (result.reason === "paused") return NextResponse.json({ error: "paused" }, { status: 503 });` next to `at_capacity`.
  7. `app/api/cron/dispatch/route.ts`: import `pauseState, logPauseRefusal` from `@/lib/budgets/pause`; wrap the reclaim block:

```ts
  let reclaimCandidates = 0;
  if (pauseState().scans) {
    // P3.5d: claims would all be refused while paused; do not spend 20
    // function calls finding that out. Auto-close and reconcile still run.
    logPauseRefusal("retry_claim");
  } else {
    try { … existing reclaim body unchanged … } catch (cause) { logFailure("reclaim_abandoned_scans", cause); }
  }
```

- [ ] **Step 4: Run all touched tests, the Task 2 integration test, and typecheck; expect PASS.**

- [ ] **Step 5: Mutation check** — remove the cron pause branch; the cron test fails. Revert.

- [ ] **Step 6: Commit** — `feat(P3.5d): paused scans answer 503 paused; cron skips reclaim`

---

### Task 4: AI pause

**Files:** Modify `lib/budgets/ai.ts` (+ `ai.test.ts`), `lib/workspace/runs.ts`, `app/api/actions/[actionId]/run/route.ts`, `app/api/assistant/run/route.ts`, `app/api/actions/route.ts` (only if its `runError` mapping needs no change — it forwards `RunError.code`), `lib/llm.ts` (+ `lib/llm.test.ts`), and the route tests.

- [ ] **Step 1: Failing tests.**
  - `lib/budgets/ai.test.ts`:

```ts
describe("AI pause (P3.5d)", () => {
  it("refuses with ai_paused before reading spend", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const readSpend = vi.fn();
    expect(await checkAiBudget(readSpend, { entry: "ai_run" }, { AI_DRAFTS_PAUSED: "true" })).toEqual({ allowed: false, scope: "ai_paused" });
    expect(readSpend).not.toHaveBeenCalled();
  });

  it("an AiBudgetRefusal for the pause carries the ai_paused code", () => {
    const refusal = new AiBudgetRefusal("ai_paused");
    expect(refusal.code).toBe("ai_paused");
    expect(refusal.message).toBe("ai_paused");
  });
});
```

  - Owner run route test: `runAgentForAction` rejecting `new RunError("ai_paused")` → `503 { error: "ai_paused" }`.
  - Assistant route test: throwing `new AiBudgetRefusal("ai_paused")` → `503 { error: "ai_paused" }`; `AiBudgetRefusal("ai_global")` still → `429 ai_budget_reached`.
  - `lib/llm.test.ts`:

```ts
  it("returns null without any network call while AI is paused", async () => {
    vi.stubEnv("AI_DRAFTS_PAUSED", "true");
    vi.stubEnv("OPENCODE_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { llmComplete } = await loadLLM();
    expect(await llmComplete("prompt")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run; expect FAIL.**

- [ ] **Step 3: Implement.**
  1. `lib/budgets/ai.ts`: `AiBudgetScope = "ai_global" | "ai_workspace" | "ai_paused"`; `AiBudgetRefusal`: `readonly code: "ai_budget_reached" | "ai_paused";` set in the constructor as `this.code = scope === "ai_paused" ? "ai_paused" : "ai_budget_reached"` and `super(` the same value `)`; in `checkAiBudget` as the first statement:

```ts
  // P3.5d: the incident pause first, before reading spend.
  if (pauseState(env).ai) {
    logPauseRefusal(input.entry);
    return { allowed: false, scope: "ai_paused" };
  }
```

  2. `lib/workspace/runs.ts`: add `"ai_paused"` to the `RunError` code union; `if (!budget.allowed) throw new RunError(budget.scope === "ai_paused" ? "ai_paused" : "ai_budget_reached");`.
  3. Owner run route: `if (error.code === "ai_paused") return json({ error: "ai_paused" }, 503);` before the budget line.
  4. Assistant route: `if (error instanceof AiBudgetRefusal) return json({ error: error.code }, error.code === "ai_paused" ? 503 : 429);`.
  5. `app/api/actions/route.ts` already returns `runError: error.code` — no change; confirm with its test that `ai_paused` flows through.
  6. `lib/llm.ts` `llmComplete`, as the first statement:

```ts
  // P3.5d backstop: every caller already handles null, so an AI pause stops
  // report summaries and translations too, before any network call.
  if (pauseState().ai) {
    logPauseRefusal("llm");
    return null;
  }
```

- [ ] **Step 4: Run all touched tests and typecheck; expect PASS.**

- [ ] **Step 5: Mutation check** — remove the pause block in `checkAiBudget`; the ai test and the owner-run route test fail. Revert.

- [ ] **Step 6: Commit** — `feat(P3.5d): AI pause refuses drafts and every LLM call`

---

### Task 5: Owner copy for pauses

**Files:** Modify `lib/messages/{en,zh-HK,zh-TW}.json`, `tests/i18n.test.ts`, `lib/budgets/messages.ts` (+ its test, create `lib/budgets/messages.test.ts` if absent), `components/workspace/rescan-button.tsx`, `components/workspace/create-view.tsx`, `components/scanning-page.tsx`, and their tests.

- [ ] **Step 1: Messages.** Add a top-level `pause` namespace after `problems` in each file, and add `"pause"` to `APP_NAMESPACES` in `tests/i18n.test.ts`:
  - en: `"pause": { "scans": "Scanning is paused for maintenance. Your scan is saved; try again later.", "ai": "AI drafting is paused for maintenance. Nothing was counted; try again later." }`
  - zh-HK: `"pause": { "scans": "掃描正暫停維護。你的掃描已儲存，請稍後再試。", "ai": "AI 草稿生成正暫停維護。沒有計算任何用量，請稍後再試。" }`
  - zh-TW: `"pause": { "scans": "掃描暫停維護中。你的掃描已儲存，請稍後再試。", "ai": "AI 草稿生成暫停維護中。沒有計算任何用量，請稍後再試。" }`

- [ ] **Step 2: Failing tests.**
  - `lib/budgets/messages.test.ts`: `scanStartRefusal("en", 503, "paused")` → the en `pause.scans` line; `aiBudgetRefusal("zh-HK", 503, "ai_paused")` → the zh-HK `pause.ai` line; existing budget mappings unchanged; `scanStartRefusal("en", 503, "other")` → `null`.
  - `rescanFailureMessage` (rescan-button test, or add to an existing component test): `{ ok: false, status: 503, error: "paused" }` → `t(locale, "pause.scans")`.
  - Create view test: `runError: "ai_paused"` → toast `pause.ai` text.
  - Scanning page test (`components/scanning-page.test.tsx`, follow its fetch/timer pattern): stalled → Resume → process answers `503 { error: "paused" }` → the `pause.scans` text is shown (and not the at-capacity text).

- [ ] **Step 3: Implement.**
  - `lib/budgets/messages.ts`:

```ts
export function scanStartRefusal(locale: string, status: number, error: unknown): string | null {
  if (status !== 503) return null;
  if (error === "paused") return t(locale, "pause.scans");
  return error === "at_capacity" ? t(locale, "budget.scanAtCapacity") : null;
}

export function aiBudgetRefusal(locale: string, status: number, error: unknown): string | null {
  if (status === 503 && error === "ai_paused") return t(locale, "pause.ai");
  return status === 429 && error === "ai_budget_reached" ? t(locale, "budget.aiLimit") : null;
}
```

  - `rescan-button.tsx` `rescanFailureMessage`: `if (result.error === "paused") return i18nT(locale, "pause.scans")` before `at_capacity` (import `t` from `@/lib/i18n` under an alias, since the function already has a local `t`).
  - `create-view.tsx`: `else if (runError === "ai_paused") toast.error(t(locale, "pause.ai"))` right after the `ai_budget_reached` branch.
  - `scanning-page.tsx` `resume()`: track `const [paused, setPaused] = useState(false)`; reset it with `setAtCapacity(false)`; `if (body?.error === "paused") setPaused(true)`; render `{paused && <div className="partial-result-card" role="status"><div><p>{t(locale, "pause.scans")}</p></div></div>}` next to the `atCapacity` card (import `t` from `@/lib/i18n`).
  - The action-detail toast and assistant sheet already call `aiBudgetRefusal`, so they pick up `ai_paused` with no change — add one test each proving it.

- [ ] **Step 4: Run all touched tests, `tests/i18n.test.ts`, typecheck, lint; expect PASS.**

- [ ] **Step 5: Commit** — `feat(P3.5d): owner copy for paused scans and AI`

---

### Task 6: Operator pause banner

**Files:** Modify `app/[locale]/ops/failures/page.tsx`, `app/[locale]/ops/failures/page.test.tsx`.

- [ ] **Step 1: Failing test** — add to the page test:

```tsx
  it("shows which kill switches are on", async () => {
    vi.stubEnv("SCANS_PAUSED", "true");
    const root = await render();
    expect(root.textContent).toContain("Scans are paused (SCANS_PAUSED)");
    expect(root.textContent).not.toContain("AI drafting is paused");
    vi.unstubAllEnvs();
  });

  it("shows no banner when nothing is paused", async () => {
    const root = await render();
    expect(root.textContent).not.toContain("paused (");
  });
```

- [ ] **Step 2: Run; expect FAIL.**

- [ ] **Step 3: Implement** — in the page, after `requireOperator()`: `const paused = pauseState();` (import from `@/lib/budgets/pause`), and directly under `<h1>Failures</h1>`:

```tsx
      {(paused.scans || paused.ai) && (
        <p className="limitation-note" role="status">
          {[paused.scans && "Scans are paused (SCANS_PAUSED).", paused.ai && "AI drafting is paused (AI_DRAFTS_PAUSED)."].filter(Boolean).join(" ")} See the incident runbook.
        </p>
      )}
```

- [ ] **Step 4: Run; expect PASS.** Typecheck, lint.

- [ ] **Step 5: Commit** — `feat(P3.5d): operator banner while a kill switch is on`

---

### Task 7: Runbook SQL and its test

**Files:** Create `docs/implementation/owner-platform-v1/rollout/incident-queries.sql`, `lib/ops/incident-queries.ts`, `lib/ops/incident-queries.test.ts`, `test/integration/neon-incident-queries.integration.test.ts`. Add `rollout/incident-queries.sql` to the existing `.gitattributes` LF rule if it only matches `apply-*.sql` (check `cat .gitattributes`).

- [ ] **Step 1: The SQL file** — `docs/implementation/owner-platform-v1/rollout/incident-queries.sql`:

```sql
-- Incident queries (P3.5d). Referenced by name from INCIDENT-RUNBOOK.md.
-- Every block is one statement. "read" blocks are SELECT-only and are tested
-- inside a READ ONLY transaction; "write" blocks are the documented changes.
-- Paste one block at a time into the Neon SQL Editor.

-- name: scan_backlog
-- mode: read
SELECT status, count(*)::int AS jobs, min(created_at) AS oldest_created, max(last_attempt_at) AS newest_attempt
FROM audit_jobs WHERE status IN ('queued','collecting','scoring','persisting')
GROUP BY status ORDER BY status;

-- name: dead_lettered_scans
-- mode: read
SELECT id, business_name, status, attempt_count, last_attempt_at, workspace_id
FROM audit_jobs
WHERE status IN ('collecting','scoring','persisting') AND attempt_count >= 3
  AND last_attempt_at IS NOT NULL AND last_attempt_at < now() - interval '30 minutes'
ORDER BY last_attempt_at LIMIT 50;

-- name: failed_scans_by_category_24h
-- mode: read
SELECT coalesce(failure_category, 'unknown') AS category, count(*)::int AS scans
FROM audit_jobs WHERE status = 'failed' AND coalesce(completed_at, created_at) > now() - interval '24 hours'
GROUP BY 1 ORDER BY scans DESC;

-- name: spend_24h
-- mode: read
SELECT (SELECT count(*)::int FROM scan_attempts WHERE attempted_at > now() - interval '24 hours') AS scan_attempts,
       (SELECT coalesce(sum(cost_usd), 0)::numeric(12,4) FROM action_runs WHERE created_at > now() - interval '24 hours') AS ai_usd;

-- name: google_connection_states
-- mode: read
SELECT status, count(*)::int AS connections FROM oauth_connections WHERE provider = 'google_gbp' GROUP BY status ORDER BY status;

-- name: schedule_states
-- mode: read
SELECT cadence, count(*)::int AS schedules, min(next_run_at) AS next_due FROM scan_schedules GROUP BY cadence ORDER BY cadence;

-- name: recent_tier_events
-- mode: read
SELECT workspace_id, tier, source, stripe_event_id, created_at
FROM workspace_tier_events WHERE created_at > now() - interval '7 days' ORDER BY created_at DESC LIMIT 100;

-- name: pause_all_schedules
-- mode: write
-- Keep the returned ids: resume_schedules needs exactly these.
UPDATE scan_schedules SET cadence = 'paused' WHERE cadence = 'monthly' RETURNING id;

-- name: resume_schedules
-- mode: write
-- Replace __SCHEDULE_IDS__ with the ids pause_all_schedules returned, as '{id1,id2}'.
UPDATE scan_schedules SET cadence = 'monthly' WHERE cadence = 'paused' AND id = ANY('__SCHEDULE_IDS__'::uuid[]) RETURNING id;
```

- [ ] **Step 2: Failing parser test** — `lib/ops/incident-queries.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseIncidentQueries } from "./incident-queries";

const FILE = fileURLToPath(new URL("../../docs/implementation/owner-platform-v1/rollout/incident-queries.sql", import.meta.url));
const RUNBOOK = fileURLToPath(new URL("../../docs/implementation/owner-platform-v1/INCIDENT-RUNBOOK.md", import.meta.url));

describe("parseIncidentQueries", () => {
  it("parses named blocks with their mode and one statement each", () => {
    const blocks = parseIncidentQueries("-- name: a\n-- mode: read\nSELECT 1;\n\n-- name: b\n-- mode: write\n-- note\nUPDATE t SET x=1;\n");
    expect(blocks).toEqual([{ name: "a", mode: "read", sql: "SELECT 1;" }, { name: "b", mode: "write", sql: "UPDATE t SET x=1;" }]);
  });

  it("rejects a block without a mode, a duplicate name, or two statements", () => {
    expect(() => parseIncidentQueries("-- name: a\nSELECT 1;")).toThrow("incident_query_mode_missing: a");
    expect(() => parseIncidentQueries("-- name: a\n-- mode: read\nSELECT 1;\n-- name: a\n-- mode: read\nSELECT 2;")).toThrow("incident_query_duplicate: a");
    expect(() => parseIncidentQueries("-- name: a\n-- mode: read\nSELECT 1; SELECT 2;")).toThrow("incident_query_multiple_statements: a");
  });

  it("keeps the real file and the runbook in step: every block is referenced, every reference exists", () => {
    const names = parseIncidentQueries(readFileSync(FILE, "utf8")).map((b) => b.name);
    const referenced = [...readFileSync(RUNBOOK, "utf8").matchAll(/`query:([a-z0-9_]+)`/g)].map((m) => m[1]);
    expect(new Set(referenced)).toEqual(new Set(names));
  });
});
```

(The third test fails until Task 8 writes the runbook; that is expected — run the first two now with `-t parseIncidentQueries` and the third after Task 8.)

- [ ] **Step 3: Implement** — `lib/ops/incident-queries.ts`:

```ts
/** A named block of docs/implementation/owner-platform-v1/rollout/incident-queries.sql. */
export interface IncidentQuery {
  name: string;
  mode: "read" | "write";
  sql: string;
}

/**
 * Parses `-- name:` / `-- mode:` blocks. Other `--` lines are comments. Each
 * block must be exactly one statement, so it can be pasted into the SQL
 * Editor on its own and a test can run it on its own.
 */
export function parseIncidentQueries(text: string): IncidentQuery[] {
  const blocks: IncidentQuery[] = [];
  let current: { name: string; mode: IncidentQuery["mode"] | null; lines: string[] } | null = null;
  const finish = () => {
    if (!current) return;
    if (!current.mode) throw new Error(`incident_query_mode_missing: ${current.name}`);
    const sql = current.lines.join("\n").trim();
    if ((sql.match(/;/g) ?? []).length !== 1 || !sql.endsWith(";")) throw new Error(`incident_query_multiple_statements: ${current.name}`);
    if (blocks.some((b) => b.name === current!.name)) throw new Error(`incident_query_duplicate: ${current.name}`);
    blocks.push({ name: current.name, mode: current.mode, sql });
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const name = /^-- name: ([a-z0-9_]+)$/.exec(line);
    if (name) {
      finish();
      current = { name: name[1], mode: null, lines: [] };
      continue;
    }
    const mode = /^-- mode: (read|write)$/.exec(line);
    if (mode && current) {
      current.mode = mode[1] as IncidentQuery["mode"];
      continue;
    }
    if (line.startsWith("--") || !current) continue;
    current.lines.push(line);
  }
  finish();
  return blocks;
}
```

- [ ] **Step 4: Run the first two parser tests; expect PASS.**

- [ ] **Step 5: Integration test** — `test/integration/neon-incident-queries.integration.test.ts` (fixture + runtime role setup as in `neon-scan-admission.integration.test.ts`):

```ts
  const blocks = () => parseIncidentQueries(readFileSync(FILE, "utf8"));

  it("runs every read block inside a READ ONLY transaction", async () => {
    const client = await runtime.connect();
    try {
      for (const block of blocks().filter((b) => b.mode === "read")) {
        await client.query("BEGIN READ ONLY");
        await expect(client.query(block.sql), block.name).resolves.toBeDefined();
        await client.query("ROLLBACK");
      }
    } finally {
      client.release();
    }
  });

  it("round-trips the schedule pause: exactly the paused ids come back to monthly", async () => {
    const byName = Object.fromEntries(blocks().map((b) => [b.name, b.sql]));
    const user = (await runtime.query("INSERT INTO app_users(email) VALUES('runbook@example.test') RETURNING id")).rows[0].id;
    const insert = (place: string, cadence: string) =>
      runtime.query("INSERT INTO scan_schedules(place_id,input_snapshot,cadence,anniversary_day,next_run_at,created_by) VALUES($1,'{}',$2,1,now(),$3) RETURNING id", [place, cadence, user]);
    await insert("place-a", "monthly");
    await insert("place-b", "monthly");
    const already = (await insert("place-c", "paused")).rows[0].id;
    const paused = (await runtime.query(byName.pause_all_schedules)).rows.map((r) => r.id);
    expect(paused).toHaveLength(2);
    const resumed = (await runtime.query(byName.resume_schedules.replace("__SCHEDULE_IDS__", `{${paused.join(",")}}`))).rows.map((r) => r.id);
    expect(new Set(resumed)).toEqual(new Set(paused));
    const states = (await runtime.query("SELECT id, cadence FROM scan_schedules")).rows;
    expect(states.filter((r) => r.cadence === "monthly")).toHaveLength(2);
    expect(states.find((r) => r.id === already).cadence).toBe("paused");
  });
```

Run it; expect PASS. If the runtime role lacks UPDATE on `scan_schedules`, stop and report: the runbook must then say the write pair runs as the migrator role in the SQL Editor, and the test should run it on the owner pool instead — do not grant anything.

- [ ] **Step 6: Commit** — `feat(P3.5d): runbook SQL as named, tested blocks` (the parser file, the SQL file, both tests; `.gitattributes` if changed).

---

### Task 8: The runbook

**Files:** Create `docs/implementation/owner-platform-v1/INCIDENT-RUNBOOK.md`.

- [ ] **Step 1: Write it** with this structure (content from spec §2; plain, imperative, no marketing):
  1. **Purpose and ownership** — who uses it; no named accountable incident owner yet (DEC-06); nothing here has been rehearsed on hosted infrastructure.
  2. **First five minutes** — `/ops/failures` health strip; Vercel log tags table (`[budget] refused`, `[budget] check_failed`, `[pause] refused`, `[pause] configuration_invalid`, `[ops] …`, `cron_dispatch_step_failed`, `event_write_failed`); `neon:readiness`; `query:scan_backlog`, `query:spend_24h`.
  3. **Kill switches** — table: variable, effect, what keeps working, how to apply (Vercel env var → redeploy or re-promote the current deployment; about 1–2 minutes), how to lift. State that any value other than `true` is treated as paused and logged.
  4. **Scenario 1: provider disabled or failing** — Detect (`query:failed_scans_by_category_24h`, health strip), Contain (pause, or remove one provider key — explain the coverage trade-off), Recover (unset + redeploy; `query:dead_lettered_scans`; release from `/ops/failures`; queued jobs resume via cron reclaim, which needs `CRON_SECRET`, or the owner's Resume), Verify (`query:scan_backlog` drains), Record.
  5. **Scenario 2: Google authorisation expired or revoked** — cannot currently occur (no expiry/refresh path; `revoked` is the owner's own disconnect); `query:google_connection_states`; only the owner can re-authorise (Settings → Integrations); operators have no control.
  6. **Scenario 3: paused scheduling** — schedules only notify; `query:schedule_states`; `query:pause_all_schedules` (keep the ids) and `query:resume_schedules`; stopping the cron (unset `CRON_SECRET`) is different and also stops reclaim and auto-close.
  7. **Scenario 4: failed billing synchronisation** — billing is off (DEC-08/09); for when it is on: resend from the Stripe dashboard (idempotent on `stripe_event_id`); `query:recent_tier_events`; never edit `workspaces.tier` by hand.
  8. **Scenario 5: rollback that preserves history** — build rollback only (Vercel promote / instant rollback); additive migrations mean older builds run on newer schemas but lose protections (name P3.5a budgets and P3.5d pauses); **never** schema rollback, row deletion or snapshot restore over live data (lists the history tables: `output_versions`, `deliveries`, `workspace_usage`, `workspace_tier_events`, `audit_events`, `scan_attempts`); Neon point-in-time restore only into a separate branch for forensics; forward-fix by default; corrections as new rows.
  9. **Recording an incident** — what to write down (times, switches used, queries run and their outputs, jobs released, redeploys) and where (a dated section appended to `PHASE-3-TEST-RESULTS.md` until an incident log exists).
  10. **Appendix** — every `query:<name>` from the SQL file with one line each.

  Reference every SQL block exactly as `` `query:<name>` `` (the Task 7 consistency test reads these).

- [ ] **Step 2: Run** `corepack pnpm vitest run lib/ops/incident-queries.test.ts` — all three tests PASS.

- [ ] **Step 3: Commit** — `docs(P3.5d): incident runbook`

---

### Task 9: Record and full verification

- [ ] **Step 1:** Run sequentially and capture exact output: `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test`, `NEON_INTEGRATION=1 corepack pnpm test:integration`, `corepack pnpm db:verify` (unchanged: 36 tables / 422 columns / 162 constraints / 92 indexes, journal 9), `corepack pnpm exec next build --webpack`. Restore CRLF-only snapshot diffs. If a gate fails, stop and report.
- [ ] **Step 2:** Append `## P3.5d — incident runbook and kill switches` to `PHASE-3-REPORT.md` (decisions, what changed, owner actions: optional; nothing to deploy beyond the code; know where the runbook is; stacked on PR #22 — merge after it; known limits from spec §5) and a P3.5d section to `PHASE-3-TEST-RESULTS.md` (gate outputs, claims table with test names and mutation checks, not-run list: e2e/acceptance in CI, hosted rehearsal of any runbook step, native copy review).
- [ ] **Step 3:** Commit both docs — `docs(P3.5d): record the incident runbook and kill switches`.

---

## Self-review (done while writing)

- **Spec coverage:** §1 config → Task 1; scans (admission, claim, routes, cron) → Tasks 2–3; AI (pre-check, routes, llm backstop) → Task 4; copy → Task 5; operator banner → Task 6; §2 runbook → Task 8; runbook SQL + test → Task 7; §3 fail-closed and untouched-job guarantees → Tasks 1–2 tests; §4 tests and mutation checks → each task; §5 limits → Task 9.
- **Type consistency:** `ScanBudgetScope` includes `scan_paused` (Task 2) and is what `onBudgetRefused` receives (Task 3); `ClaimOutcome` `paused` (Task 2) is handled in the store (Task 3); `AiBudgetScope` `ai_paused` and `AiBudgetRefusal.code` (Task 4) drive the assistant route; `RunError` `ai_paused` (Task 4) flows to Create's `runError` (Task 5).
- **Check-at-implementation points:** the exact test files for the start, process, rescan and run modules (Task 3 Step 1); whether `onBudgetRefused`'s option type needs widening (Task 3); whether the runtime role can UPDATE `scan_schedules` (Task 7 Step 5); the `.gitattributes` rule (Task 7).
