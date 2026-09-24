# Reliable Scan Events and the Weekly Value Metric — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `scan_started`/`scan_completed` being silently lost, and add a read-only `report:value` script that prints the weekly primary value metric and funnel from authoritative tables.

**Architecture:** Both scan events move *inside* the transaction that records the fact they describe (job creation; terminal status), with deterministic dedupe keys so `ON CONFLICT` finally works. PostHog forwarding stays outside the transaction as best-effort transport. The report never depends on `scan_events` for a number it can read from a business table; it reconciles the two and prints the gap.

**Tech Stack:** Next.js 16 route handlers, `pg` (node-postgres), Drizzle schema, Vitest 4 (unit + Docker-backed integration via `NEON_INTEGRATION=1`), `tsx` for scripts.

**Spec:** `docs/superpowers/specs/2026-09-24-reliable-events-value-metric-design.md`

---

## Ground rules for every task

- Work only inside this worktree: `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p34-reliable-events`, branch `p34-reliable-events`.
- **Never** `git push`, open a PR, deploy, apply a migration to a hosted database, or run a paid scan. Hooks reject `--no-verify`; write commit messages to a file and use `git commit -F <file>`. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Do not edit `packages/scan-engine`.** Everything here is host-side: `insert` is host-supplied storage, and `persist`/`fail`/`recordTerminal` are host implementations of the engine's store interface.
- Do not edit migrations `0001`–`0007`. Do not add RLS policies or grants to `authenticated`/`anon`.
- Commands: `corepack pnpm exec vitest run <path>` (unit), `corepack pnpm exec vitest run --config vitest.integration.config.ts <path>` with `NEON_INTEGRATION=1` (integration, needs Docker).
- A test run leaves `lib/agents/__snapshots__/agents.test.ts.snap` and `lib/pocket-assistant/__snapshots__/demo.test.ts.snap` modified with CRLF-only churn. Check with `git diff --ignore-cr-at-eol --stat`; if empty, `git restore` them. Never commit them.

---

## File structure

**Create**

| File | Responsibility |
|---|---|
| `neon/migrations/0008_workspace_internal.sql` | `workspaces.is_internal` |
| `lib/analytics/scan-events.ts` | Dedupe keys, validated event builders, the one `INSERT INTO scan_events` statement |
| `lib/analytics/scan-events.test.ts` | Builders validate; keys are fixed |
| `scripts/neon/target.ts` | Database-URL and target checks shared by `neon:readiness` and `report:value` |
| `scripts/report/week.ts` | ISO reporting weeks in `Asia/Hong_Kong`, half-open |
| `scripts/report/value-queries.ts` | `ValueReport` type and every report query |
| `scripts/report/format.ts` | Plain-text rendering, counts only |
| `scripts/report/value.ts` | CLI: configuration, read-only connection, output, errors |
| `tests/value-report-week.test.ts` | Week arithmetic |
| `tests/value-report-cli.test.ts` | Configuration refusals, argument parsing, formatting |
| `test/integration/neon-value-report.integration.test.ts` | Every metric against seeded Postgres; read-only enforced |

**Modify**

| File | Change |
|---|---|
| `lib/db/schema/business.ts` | `isInternal` after `isDemo` |
| `test/integration/fixtures/legacy-final-catalog.json` | `is_internal` column entry |
| `test/integration/neon-schema.integration.test.ts` | Migration list, journal count, column count |
| `lib/repositories/jobs.ts` | `insert` takes and writes `scan_started` in its transaction |
| `lib/scan/start-job.ts` | `insertScanJob` takes the session, returns the event |
| `app/api/scan/start/route.ts` | Session before insert; `after()` forwards to PostHog |
| `lib/workspace/rescan.ts` | Rescans write `scan_started` too |
| `app/api/workspaces/[workspaceId]/rescan/route.ts` | Resolve and pass the session |
| `lib/scan/execution-store.ts` | `scan_completed` in `persist()`/`fail()`; `recordTerminal` forwards only |
| `scripts/neon/readiness.ts` | Use `scripts/neon/target.ts` |
| `package.json` | `report:value` script |
| Tests listed per task | Updated for the new signatures |
| `docs/superpowers/specs/2026-09-24-reliable-events-value-metric-design.md` | Two corrections found while planning |
| `docs/implementation/owner-platform-v1/PHASE-3-REPORT.md`, `PHASE-3-TEST-RESULTS.md` | P3.4 section |

---

### Task 0: Correct the spec before building against it

Two facts found while reading the code contradict the approved spec. Fix the document first so reviewers check the code against the truth.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-24-reliable-events-value-metric-design.md`

- [ ] **Step 1: Replace the "Where each event is written" table**

Find the table under `### Where each event is written` and replace it (header row through the `fail()` row) with:

```markdown
| Event | Written inside | How |
|---|---|---|
| `scan_started` | `jobsRepository.insert` (`lib/repositories/jobs.ts`), already `withTransaction` | one `INSERT` beside the `audit_jobs` and consent rows — for **both** creation paths, the public funnel and rescans |
| `scan_completed` (any outcome) | `persist()` in `lib/scan/execution-store.ts`, already `withTransaction` | one `INSERT` after the status `UPDATE`, with `outcome = result.status` |
| `scan_completed` (`failed`, thrown) | `fail()` in the same file, today a single autocommit `UPDATE` | a CTE: `WITH u AS (UPDATE … RETURNING id) INSERT INTO scan_events … SELECT … FROM u` |

`persist()` is not limited to done/partial. The engine's processor scores a
scan that measured nothing as `failed` and persists it through `persist()`
like any other; `fail()` handles only scans whose processing **threw**. Both
paths can therefore emit `outcome: "failed"`, and `persist()` writes
`result.status` as given rather than assuming a successful outcome.

`scan_started` is written for rescans too. `lib/workspace/rescan.ts` calls
`jobsRepository.insert` directly, so if only the public funnel wrote the
event, every rescan would appear in the reconciliation as a lost event that
was never going to exist. Rescans still send nothing to PostHog — they never
did, and adding it would change that dataset without a requirement.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-09-24-reliable-events-value-metric-design.md
git commit -F <msgfile>   # "docs(P3.4): correct two spec claims the code contradicts"
```

---

### Task 1: Migration 0008 and every schema baseline

**Files:**
- Create: `neon/migrations/0008_workspace_internal.sql`
- Modify: `lib/db/schema/business.ts` (the `workspaces` table, line ~790)
- Modify: `test/integration/fixtures/legacy-final-catalog.json` (after the `is_demo` entry, line ~3898)
- Modify: `test/integration/neon-schema.integration.test.ts` (lines 26, 27, 36, 42)

- [ ] **Step 1: Predict the catalog delta before touching anything**

Write this down in your report *before* running anything: `db:verify` should move from `columns: 417` to `columns: 418`, `indexes: 87` unchanged, `constraints: 159` unchanged, migration journal `7` → `8`. If the observed numbers differ, stop and report — do not paste the observed numbers into the baseline.

- [ ] **Step 2: Create the migration**

`neon/migrations/0008_workspace_internal.sql`:

```sql
-- P3.4 (docs/superpowers/specs/2026-09-24-reliable-events-value-metric-design.md).
-- The weekly value report must exclude staff and test workspaces. is_demo
-- already marks the fixed, sanitised public sample; internal means real data
-- that is not a customer. They are separate so a staff workspace is never
-- marked demo and published on the demo page.
--
-- NOT NULL DEFAULT false: there is no meaningful unknown, and every existing
-- row is correctly false except staff-assigned workspaces, which are marked by
-- hand (see the phase report's runbook entry). No index: the report reads a
-- handful of workspace rows once a week.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;
```

- [ ] **Step 3: Add the Drizzle column**

In `lib/db/schema/business.ts`, in `export const workspaces = pgTable("workspaces", {`, directly after the `isDemo` line:

```ts
 isDemo: boolean("is_demo").notNull().default(sql.raw("false")),
 isInternal: boolean("is_internal").notNull().default(sql.raw("false")),
```

- [ ] **Step 4: Add the catalog fixture entry**

In `test/integration/fixtures/legacy-final-catalog.json`, the `is_demo` object is the last element of the `"columns"` array. Replace:

```json
      "column_name": "is_demo",
      "ordinal_position": 19,
      "data_type": "boolean",
      "udt_name": "bool",
      "is_nullable": "NO",
      "column_default": "false"
    }
  ],
```

with:

```json
      "column_name": "is_demo",
      "ordinal_position": 19,
      "data_type": "boolean",
      "udt_name": "bool",
      "is_nullable": "NO",
      "column_default": "false"
    },
    {
      "table_name": "workspaces",
      "column_name": "is_internal",
      "ordinal_position": 20,
      "data_type": "boolean",
      "udt_name": "bool",
      "is_nullable": "NO",
      "column_default": "false"
    }
  ],
```

- [ ] **Step 5: Update the four baselines in `neon-schema.integration.test.ts`**

Line 26 — append the new filename to the expected list:

```ts
    expect(await applyMigrations(owner)).toEqual(["0001_identity.sql", "0002_business.sql", "0003_workflows.sql", "0004_atomic_operations.sql", "0005_owner_removal_guard.sql", "0006_action_applications.sql", "0007_action_verification.sql", "0008_workspace_internal.sql"]);
```

Line 27 — `columns: 417` → `columns: 418` (everything else on the line unchanged).

Lines 36 and 42 — `.toBe(7)` → `.toBe(8)` on the two `neon_migrations.journal` counts.

- [ ] **Step 6: Run the schema test**

Run: `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-schema.integration.test.ts`
Expected: PASS. If the column-order test at line 61 fails, the Drizzle column and the fixture entry are not both directly after `is_demo`.

- [ ] **Step 7: Run db:verify and compare against your prediction**

Run: `corepack pnpm db:verify`
Expected: exit 0, `columns: 418`, `indexes: 87`. Record observed vs predicted.

- [ ] **Step 8: Typecheck and commit**

Run: `corepack pnpm typecheck` — expected clean.

```bash
git add neon/migrations/0008_workspace_internal.sql lib/db/schema/business.ts test/integration/fixtures/legacy-final-catalog.json test/integration/neon-schema.integration.test.ts
git commit -F <msgfile>   # "feat(P3.4): mark internal workspaces for the value report"
```

---

### Task 2: One module that owns the scan_events write

**Files:**
- Create: `lib/analytics/scan-events.ts`
- Test: `lib/analytics/scan-events.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/analytics/scan-events.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  SCAN_STARTED_DEDUPE_KEY,
  SCAN_TERMINAL_DEDUPE_KEY,
  insertScanEvent,
  scanCompletedEvent,
  scanStartedEvent,
} from "./scan-events";

describe("scan event builders", () => {
  it("builds a validated scan_started event", () => {
    expect(scanStartedEvent("HK", "zh-HK")).toEqual({ name: "scan_started", properties: { market: "HK", locale: "zh-HK" } });
  });

  it("rejects a market the engine does not accept, before any transaction opens", () => {
    expect(() => scanStartedEvent("hk", "en")).toThrow();
  });

  it.each(["done", "partial", "failed"] as const)("builds scan_completed for outcome %s", (outcome) => {
    expect(scanCompletedEvent(outcome, 0.5)).toEqual({ name: "scan_completed", properties: { outcome, coverage: 0.5 } });
  });

  it("rejects a non-finite coverage", () => {
    expect(() => scanCompletedEvent("done", Number.NaN)).toThrow();
  });
});

describe("dedupe keys", () => {
  // scan_events_dedupe_identity_unique_idx has no NULLS NOT DISTINCT, so a NULL
  // key never conflicts. A fixed non-null key is what makes a retry idempotent.
  it("are fixed and distinct per event", () => {
    expect(SCAN_STARTED_DEDUPE_KEY).toBe("started");
    expect(SCAN_TERMINAL_DEDUPE_KEY).toBe("terminal");
  });
});

describe("insertScanEvent", () => {
  it("writes on the client it is given, never a pool of its own", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await insertScanEvent({ query } as never, {
      jobId: "job-1",
      anonymousSessionId: "session-1",
      event: scanStartedEvent("TW", "zh-TW"),
      dedupeKey: SCAN_STARTED_DEDUPE_KEY,
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO scan_events/);
    expect(sql).toMatch(/ON CONFLICT\(job_id,anonymous_session_id,event_name,dedupe_key\) DO NOTHING/);
    expect(values).toEqual(["job-1", "session-1", "scan_started", JSON.stringify({ market: "TW", locale: "zh-TW" }), "started"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm exec vitest run lib/analytics/scan-events.test.ts`
Expected: FAIL — cannot resolve `./scan-events`.

- [ ] **Step 3: Implement**

`lib/analytics/scan-events.ts`:

```ts
import "server-only";
import type { PoolClient } from "pg";
import { parseScanEvent, type ScanEvent } from "@sme-scanner/scan-engine";

/**
 * Fixed dedupe keys. scan_events_dedupe_identity_unique_idx covers
 * (job_id, anonymous_session_id, event_name, dedupe_key) with no
 * NULLS NOT DISTINCT, and until this module every row was written with a NULL
 * key -- so ON CONFLICT DO NOTHING never matched and any retry would have
 * appended a duplicate. A non-null key makes a retried write idempotent.
 */
export const SCAN_STARTED_DEDUPE_KEY = "started";
export const SCAN_TERMINAL_DEDUPE_KEY = "terminal";

export type ScanOutcome = "done" | "partial" | "failed";

/**
 * Built and validated by the engine's parseScanEvent BEFORE any transaction
 * opens. These events are now written inside the transaction that records the
 * fact they describe, so an invalid event must be rejected here: inside the
 * transaction the insert may then fail only the way any other statement could.
 */
export function scanStartedEvent(market: string, locale: string): ScanEvent {
  return parseScanEvent({ name: "scan_started", properties: { market, locale } });
}

export function scanCompletedEvent(outcome: ScanOutcome, coverage: number): ScanEvent {
  return parseScanEvent({ name: "scan_completed", properties: { outcome, coverage } });
}

/** What jobsRepository.insert needs to write scan_started beside the job. */
export interface ScanStartedWrite {
  anonymousSessionId: string;
  event: ScanEvent;
}

/**
 * The one statement that writes scan_events from this app. Takes the caller's
 * client so it joins the caller's transaction; it never opens a connection.
 */
export async function insertScanEvent(
  client: Pick<PoolClient, "query">,
  write: { jobId: string; anonymousSessionId: string; event: ScanEvent; dedupeKey: string },
): Promise<void> {
  await client.query(
    `INSERT INTO scan_events(job_id,anonymous_session_id,event_name,properties,dedupe_key)
     VALUES($1,$2,$3,$4::jsonb,$5)
     ON CONFLICT(job_id,anonymous_session_id,event_name,dedupe_key) DO NOTHING`,
    [write.jobId, write.anonymousSessionId, write.event.name, JSON.stringify(write.event.properties), write.dedupeKey],
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm exec vitest run lib/analytics/scan-events.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/scan-events.ts lib/analytics/scan-events.test.ts
git commit -F <msgfile>   # "feat(P3.4): own the scan_events write in one validated module"
```

---

### Task 3: scan_started inside the job's transaction (public funnel)

**Files:**
- Modify: `lib/repositories/jobs.ts`
- Modify: `lib/scan/start-job.ts` (`ScanJobInsertResult`, `insertScanJob`, lines 285–299)
- Modify: `app/api/scan/start/route.ts`
- Test: `app/api/scan/start/route.test.ts`, `lib/scan/start-job.test.ts`, `test/integration/neon-scan-start.integration.test.ts`

- [ ] **Step 1: Write the failing integration tests**

In `test/integration/neon-scan-start.integration.test.ts`, add at the top with the other imports:

```ts
import { randomUUID } from "node:crypto";
```

Add these three tests directly after the existing `it("rolls the job back when the consent row cannot be written", …)` block (they reuse its `consentedInput()` helper):

```ts
  it("writes exactly one scan_started inside the job's own transaction", async () => {
   const parsed = consentedInput();
   const session = randomUUID();
   const result = await insertScanJob(parsed.input, parsed.consent, { anonymousSessionId: session });
   if (!result.ok) throw Error("insert failed");
   const rows = (await runtime.query("SELECT job_id,anonymous_session_id,event_name,properties,dedupe_key FROM scan_events WHERE anonymous_session_id=$1", [session])).rows;
   expect(rows).toEqual([{ job_id: result.jobId, anonymous_session_id: session, event_name: "scan_started", properties: { market: parsed.input.market, locale: parsed.input.locale }, dedupe_key: "started" }]);
  });

  it("leaves no scan_started behind when the job transaction rolls back", async () => {
   const parsed = consentedInput();
   const session = randomUUID();
   const { buildScanJobInsert } = await import("../../lib/scan/start-job");
   const { scanStartedEvent } = await import("../../lib/analytics/scan-events");
   await expect(
    jobsRepository.insert(
     buildScanJobInsert(parsed.input),
     // NULL locale violates consent_records.locale NOT NULL, the same trigger
     // the consent rollback test above uses.
     { consent_type: "public_evidence", granted: true, policy_version: LEGAL_POLICY_VERSION, locale: null as never },
     { anonymousSessionId: session, event: scanStartedEvent(parsed.input.market, parsed.input.locale) },
    ),
   ).rejects.toThrow();
   expect((await runtime.query("SELECT count(*)::int AS n FROM scan_events WHERE anonymous_session_id=$1", [session])).rows[0].n).toBe(0);
  });

  it("does not create the job when its scan_started cannot be written", async () => {
   const parsed = consentedInput();
   const name = `No event shop ${randomUUID()}`;
   await owner.query('REVOKE INSERT ON TABLE public."scan_events" FROM sme_app_runtime');
   try {
    // ScanStartInput is camelCase: `business_name` here would be silently
    // ignored, the job would be named "Consent shop", and the count below would
    // read 0 whether or not the job was created -- an assertion that cannot fail.
    const result = await insertScanJob({ ...parsed.input, businessName: name }, parsed.consent, { anonymousSessionId: randomUUID() });
    expect(result.ok).toBe(false);
   } finally {
    // Restores exactly what was revoked: 0003 grants SELECT, INSERT, UPDATE, DELETE.
    await owner.query('GRANT INSERT ON TABLE public."scan_events" TO sme_app_runtime');
   }
   expect((await runtime.query("SELECT count(*)::int AS n FROM audit_jobs WHERE business_name=$1", [name])).rows[0].n).toBe(0);
  });
```

After adding the third test, prove it can fail: temporarily delete the `REVOKE` line so the event write succeeds. The job is then created, `result.ok` is `true`, and the test must FAIL. Restore the line and confirm green. A version of this test that passes either way is not a test.

Then update the **existing** calls in this file to the new signature:
- Every `insertScanJob(parsed.input, parsed.consent)` → `insertScanJob(parsed.input, parsed.consent, { anonymousSessionId: randomUUID() })`.
- The direct `jobsRepository.insert(buildScanJobInsert(row), {…consent…})` in the consent-rollback test → add a third argument `{ anonymousSessionId: randomUUID(), event: (await import("../../lib/analytics/scan-events")).scanStartedEvent(row.market, row.locale) }`.

Run `grep -n -E "insertScanJob\(|jobsRepository\.insert\(" test/integration/neon-scan-start.integration.test.ts` afterwards; every hit must carry the third argument.

- [ ] **Step 2: Run to verify they fail**

Run: `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-scan-start.integration.test.ts`
Expected: FAIL (type or runtime) — `insertScanJob`/`insert` do not accept the third argument and no `scan_started` row is written.

- [ ] **Step 3: Implement `jobsRepository.insert`**

In `lib/repositories/jobs.ts`, add to the imports:

```ts
import { insertScanEvent, SCAN_STARTED_DEDUPE_KEY, type ScanStartedWrite } from "../analytics/scan-events";
```

Change the interface (the parameter is **required** — an optional one is how this bug would return: a future caller omits it and scan_started silently stops being written):

```ts
export interface JobsRepository {
    insert(
        row: ReturnType<typeof buildScanJobInsert>,
        consent: ReturnType<typeof buildScanConsentInsert>,
        started: ScanStartedWrite,
    ): Promise<{
        id: string;
    }>;
}
```

Change `async insert(row, consent) {` to `async insert(row, consent, started) {`, extend its doc comment, and add the event write after the consent insert, before `return created;`:

```ts
    /**
     * The job, its scan-time consent and its scan_started event are one
     * transaction: consent_records.job_id is NOT NULL, so the consent row can
     * only be written after the job exists, and writing them separately would
     * leave a window where a queued job has no consent. A failure in any
     * statement rolls all three back.
     *
     * scan_started is written here rather than fire-and-forget afterwards
     * because the old path lost it (F-34): a 250 ms budget around a fresh
     * connect, and a bare promise Vercel may freeze after the response. Here
     * the event exists exactly when the job does.
     */
    async insert(row, consent, started) {
```

```ts
            await insertScanEvent(client, {
                jobId: created.id,
                anonymousSessionId: started.anonymousSessionId,
                event: started.event,
                dedupeKey: SCAN_STARTED_DEDUPE_KEY,
            });
            return created;
```

- [ ] **Step 4: Implement `insertScanJob`**

In `lib/scan/start-job.ts`, add to the imports:

```ts
import type { ScanEvent } from "@sme-scanner/scan-engine";
import { scanStartedEvent } from "@/lib/analytics/scan-events";
```

Replace `ScanJobInsertResult` and `insertScanJob` (lines 285–299) with:

```ts
export type ScanJobInsertResult =
 | { ok: true; jobId: string; startedEvent: ScanEvent }
 | { ok: false; error: unknown };

export async function insertScanJob(
 input: ScanStartInput,
 consent: ScanConsentRecord,
 analytics: { anonymousSessionId: string },
 attribution: ScanJobAttribution = {},
 repository: JobsRepository = jobsRepository,
): Promise<ScanJobInsertResult> {
 // Validated before the transaction opens, so a malformed event is refused
 // here instead of rolling back a scan that was otherwise fine.
 let startedEvent: ScanEvent;
 try { startedEvent = scanStartedEvent(input.market, input.locale); }
 catch { return { ok: false, error: new Error("scan_event_invalid") }; }
 try {
  // A rolled-back transaction is indistinguishable from any other persistence
  // failure at this boundary, by design.
  const row = await repository.insert(
   buildScanJobInsert(input, attribution),
   buildScanConsentInsert(consent),
   { anonymousSessionId: analytics.anonymousSessionId, event: startedEvent },
  );
  return { ok: true, jobId: row.id, startedEvent };
 } catch { return { ok: false, error: new Error("scan_persistence_unavailable") }; }
}
```

- [ ] **Step 5: Implement the route**

Replace `app/api/scan/start/route.ts` lines 1–6 (imports) with:

```ts
import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { forwardEventToPostHog, resolveAnalyticsSession, setAnalyticsSessionCookie } from "@/lib/analytics/record-event";
import { currentScanConsentPolicyVersion } from "@/lib/scan/consent";
import { insertScanJob, parseScanStartBody } from "@/lib/scan/start-job";
```

Replace everything from `const created = await insertScanJob(parsed.input, parsed.consent);` to the end of the function with:

```ts
  // Resolved before the insert: scan_started is now written inside the job's
  // own transaction, which needs the session id.
  const session = resolveAnalyticsSession(req);
  const created = await insertScanJob(parsed.input, parsed.consent, { anonymousSessionId: session.id });
  if (!created.ok) {
    const correlationId = randomUUID();
    console.error("Scan persistence unavailable", { category: "database_unavailable", correlationId });
    return NextResponse.json({ error: "Failed to create scan job", correlationId }, { status: 503 });
  }

  // The durable row already committed with the job. Only PostHog transport is
  // left, and after() keeps it alive past the response: a bare `void` promise
  // may never run once a Vercel function freezes. It must not go through
  // recordEvent, which would insert first, hit the dedupe conflict, and return
  // before forwarding.
  const { startedEvent } = created;
  after(() =>
    forwardEventToPostHog(startedEvent, session.id).catch(() => {
      console.error("[analytics] event_record_failed", { category: "transition_record_failed" });
    }),
  );
  const response = NextResponse.json({ jobId: created.jobId });
  setAnalyticsSessionCookie(response, session);
  return response;
}
```

Also update the doc comment above `POST` — it says the scan_started event lives in `lib/scan/start-job.ts`. Replace that sentence with: `the audit_jobs insert and its scan_started event are one transaction in lib/repositories/jobs.ts; only PostHog forwarding runs after the response.`

- [ ] **Step 6: Update the route's unit test**

In `app/api/scan/start/route.test.ts`, replace the `mocks` block and the `record-event` mock (lines 3–20) with:

```ts
const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 1 })),
  insert: vi.fn(),
  forwardEventToPostHog: vi.fn(async () => {}),
  // after() throws outside a Next request scope, so run the task inline.
  after: vi.fn((task: () => unknown) => { void task(); }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  rateLimitedResponse: vi.fn(() => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 })),
}));
vi.mock("@/lib/repositories/jobs", () => ({ jobsRepository: { insert: mocks.insert } }));
// Spread the original: the route still needs the real NextResponse.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));

vi.mock("@/lib/analytics/record-event", () => ({
  forwardEventToPostHog: mocks.forwardEventToPostHog,
  resolveAnalyticsSession: () => ({ id: "anonymous-session", created: false }),
  setAnalyticsSessionCookie: vi.fn(),
}));

const STARTED = {
  anonymousSessionId: "anonymous-session",
  event: { name: "scan_started", properties: { market: "HK", locale: "en" } },
};
```

In the test `"allows optional Instagram and website and persists the exact normalized snapshot"`, replace the `expect(mocks.recordEvent).toHaveBeenCalledWith(…)` statement with:

```ts
    expect(mocks.forwardEventToPostHog).toHaveBeenCalledWith(STARTED.event, "anonymous-session");
```

and change the closing `}), consentRow);` of that test's `expect(mocks.insert).toHaveBeenCalledWith(` to `}), consentRow, STARTED);`.

Every other `expect(mocks.insert).toHaveBeenCalledWith(…, consentRow)` in the file gains a third argument `expect.objectContaining({ anonymousSessionId: "anonymous-session" })`. Find them with `grep -n "consentRow" app/api/scan/start/route.test.ts`.

Replace the `"returns the committed job when analytics never settles"` test with these three:

```ts
  it("returns the committed job when PostHog forwarding never settles", async () => {
    mocks.forwardEventToPostHog.mockImplementationOnce(() => new Promise(() => {}));

    const result = await Promise.race([
      POST(request(validBody)),
      new Promise<"test_timeout">((resolve) => setTimeout(() => resolve("test_timeout"), 100)),
    ]);

    expect(result).not.toBe("test_timeout");
    expect((result as Response).status).toBe(200);
  });

  it("hands PostHog forwarding to after() instead of a bare promise", async () => {
    await POST(request(validBody));
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it("forwards nothing when the job could not be created", async () => {
    mocks.insert.mockRejectedValueOnce(new Error("down"));
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.forwardEventToPostHog).not.toHaveBeenCalled();
  });
```

- [ ] **Step 7: Update `start-job.test.ts`**

In `lib/scan/start-job.test.ts`, replace the two tests in `describe("insertScanJob", …)` (line 159–160) with:

```ts
 it("inserts the job, its consent and its scan_started through the repository",async()=>{const insert=vi.fn().mockResolvedValue({id:"job-1"});const started={name:"scan_started",properties:{market:parsed().market,locale:parsed().locale}};expect(await insertScanJob(parsed(),consent,{anonymousSessionId:"session-1"},{workspaceId:"ws-1"},{insert})).toEqual({ok:true,jobId:"job-1",startedEvent:started});expect(insert).toHaveBeenCalledWith(expect.objectContaining({workspace_id:"ws-1",status:"queued"}),{consent_type:"public_evidence",granted:true,policy_version:LEGAL_POLICY_VERSION,locale:"en"},{anonymousSessionId:"session-1",event:started});});
 it("sanitizes database failures instead of throwing",async()=>{const insert=vi.fn().mockRejectedValue(Error("postgresql://user:secret@host/db"));expect(await insertScanJob(parsed(),consent,{anonymousSessionId:"session-1"},{},{insert})).toEqual({ok:false,error:Error("scan_persistence_unavailable")});});
 it("refuses an event the engine would reject before touching the repository",async()=>{const insert=vi.fn();expect(await insertScanJob({...parsed(),market:"hk" as never},consent,{anonymousSessionId:"session-1"},{},{insert})).toEqual({ok:false,error:Error("scan_event_invalid")});expect(insert).not.toHaveBeenCalled();});
```

- [ ] **Step 8: Run everything touched**

Run: `corepack pnpm exec vitest run app/api/scan/start/route.test.ts lib/scan/start-job.test.ts lib/analytics/scan-events.test.ts`
Expected: PASS.

Run: `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-scan-start.integration.test.ts`
Expected: PASS, including the three new tests.

Run: `corepack pnpm typecheck`
Expected: errors **only** in `lib/workspace/rescan.ts` (it calls `jobsRepository.insert` with two arguments). That is Task 4. Any other error must be fixed here.

- [ ] **Step 9: Mutation-check the atomicity test**

Temporarily move the `insertScanEvent(...)` call in `jobsRepository.insert` to *after* `withTransaction` returns (write it on `getPool()` instead of `client`). Re-run the integration file: `"does not create the job when its scan_started cannot be written"` must FAIL. Restore, confirm green, and record what you observed.

- [ ] **Step 10: Commit**

```bash
git add lib/repositories/jobs.ts lib/scan/start-job.ts app/api/scan/start/route.ts app/api/scan/start/route.test.ts lib/scan/start-job.test.ts test/integration/neon-scan-start.integration.test.ts
git commit -F <msgfile>   # "fix(P3.4): write scan_started inside the job's own transaction"
```

---

### Task 4: scan_started for rescans

**Files:**
- Modify: `lib/workspace/rescan.ts` (`EnqueueRescanInput`, `enqueueRescan`)
- Modify: `app/api/workspaces/[workspaceId]/rescan/route.ts` (line 75)
- Test: `lib/workspace/rescan.test.ts`, `test/integration/neon-rescan.integration.test.ts`

- [ ] **Step 1: Write the failing integration assertion**

In `test/integration/neon-rescan.integration.test.ts`, in the test `'enqueues actual TW jobs and server-attributed audit, then monthly schedule once'`, change the `enqueueRescan(repo,{…})` call to add `anonymousSessionId:'rescan-session'` to the input object, and directly after `if(!result.ok)throw new Error('enqueue failed');` add:

```ts
expect((await runtime.query('SELECT event_name,properties,dedupe_key FROM scan_events WHERE job_id=$1',[result.jobId])).rows).toEqual([{event_name:'scan_started',properties:{market:'TW',locale:'zh-TW'},dedupe_key:'started'}]);
```

- [ ] **Step 2: Run to verify it fails**

Run: `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-rescan.integration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `lib/workspace/rescan.ts`, add to the imports:

```ts
import { scanStartedEvent } from "@/lib/analytics/scan-events";
```

Add to `EnqueueRescanInput`, after `actorId: string;`:

```ts
  /**
   * The caller's analytics session. scan_started is written with the job, so a
   * rescan needs one too -- otherwise every rescan would show in the
   * reconciliation as a lost event that was never going to exist.
   */
  anonymousSessionId: string;
```

In `enqueueRescan`, replace the insert statement:

```ts
  let created: { id: string };
  try { created = await jobsRepository.insert(row, buildScanConsentInsert(input.consent)); }
```

with:

```ts
  let created: { id: string };
  try {
    created = await jobsRepository.insert(row, buildScanConsentInsert(input.consent), {
      anonymousSessionId: input.anonymousSessionId,
      event: scanStartedEvent(scanInput.market, scanInput.locale),
    });
  }
```

(The existing `catch` block after it is unchanged. `scanStartedEvent` throwing on an invalid market is caught by it and returns `insert_failed`, which is correct: nothing was written.)

In `app/api/workspaces/[workspaceId]/rescan/route.ts`, add to the imports:

```ts
import { resolveAnalyticsSession } from "@/lib/analytics/record-event";
```

and in the `enqueueRescan(repo, {…})` call on line 75, add `anonymousSessionId: resolveAnalyticsSession(req).id` to the input object. Rescans send nothing to PostHog and set no cookie — they never did.

- [ ] **Step 4: Update the unit test**

In `lib/workspace/rescan.test.ts`, add `anonymousSessionId: "session-1"` to the input object of all five `enqueueRescan(client(), { … })` calls (lines 110, 150, 156, 161, 167). Then change the `jobsRepository` mock on line 11 so the fake records what it received:

```ts
vi.mock("@/lib/repositories/jobs", () => ({ jobsRepository: { insert: vi.fn(async (row, consent, started) => { if(state.jobInsertError) throw state.jobInsertError; const saved={id: `job-${state.inserted.audit_jobs.length+1}`, ...row}; state.inserted.audit_jobs.push(saved); state.inserted.consent_records.push({ job_id: saved.id, ...consent }); state.inserted.scan_events.push({ job_id: saved.id, ...started }); return {id:saved.id}; }) } }));
```

Add `scan_events: [] as Row[]` to both `inserted` initialisers (line 22 and line 73). In the test `"inserts a queued job attributed to the workspace and location…"`, add after the `consent_records` assertion:

```ts
    // The event's market and locale come from the SOURCE JOB's snapshot
    // (SNAPSHOT: market "HK", locale "zh-HK"), not from the request's "en",
    // which only labels the consent and the audit row.
    expect(state.inserted.scan_events).toEqual([
      { job_id: "job-1", anonymousSessionId: "session-1", event: { name: "scan_started", properties: { market: "HK", locale: "zh-HK" } } },
    ]);
```

- [ ] **Step 5: Run everything touched**

Run: `corepack pnpm exec vitest run lib/workspace/rescan.test.ts "app/api/workspaces/[workspaceId]/rescan/route.test.ts"`
Expected: PASS. (The route test's `enqueueRescan` assertions use `expect.objectContaining`, so the added field does not break them.)

Run: `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-rescan.integration.test.ts`
Expected: PASS.

Run: `corepack pnpm typecheck` — expected clean.

- [ ] **Step 6: Commit**

```bash
git add lib/workspace/rescan.ts "app/api/workspaces/[workspaceId]/rescan/route.ts" lib/workspace/rescan.test.ts test/integration/neon-rescan.integration.test.ts
git commit -F <msgfile>   # "fix(P3.4): write scan_started for rescans so reconciliation is exact"
```

---

### Task 5: scan_completed inside the terminal write; recordTerminal forwards only

**Files:**
- Modify: `lib/scan/execution-store.ts` (imports; `persist`, `fail`, `recordTerminal`)
- Test: `lib/scan/execution-store.test.ts`, `test/integration/neon-execution.integration.test.ts`

- [ ] **Step 1: Write the failing integration tests**

In `test/integration/neon-execution.integration.test.ts`, **delete** the test `"records terminal events through the real event repository"` (it asserts that `recordTerminal` writes the row, which is exactly what moves). Add in its place:

```ts
    const persisted = (jobId: string, status: ScanPersistence["status"]): ScanPersistence => ({
      jobId,
      status,
      overall: status === "failed" ? null : 70,
      coverage: 0.5,
      scoringVersion: "2026-08-16",
      moduleResults: {} as ScanPersistence["moduleResults"],
      findings: [],
    });
    const completedRows = async (id: string) =>
      (await runtime.query("SELECT anonymous_session_id,event_name,properties,dedupe_key FROM scan_events WHERE job_id=$1", [id])).rows;

    // persist() carries failed too: a scan that measured nothing is scored
    // "failed" and persisted normally (processor.ts). fail() is only for scans
    // that threw.
    it.each(["done", "partial", "failed"] as const)("persist writes exactly one scan_completed for %s inside its transaction", async (status) => {
      const id = await job("persisting");
      const session = randomUUID();
      const storage = createScanExecutionStore(session, { pool: runtime });
      await storage.persist(persisted(id, status));
      expect(await completedRows(id)).toEqual([
        { anonymous_session_id: session, event_name: "scan_completed", properties: { outcome: status, coverage: 0.5 }, dedupe_key: "terminal" },
      ]);
    });

    it("a retried persist leaves one scan_completed, because the dedupe key now conflicts", async () => {
      const id = await job("persisting");
      const storage = createScanExecutionStore(randomUUID(), { pool: runtime });
      await storage.persist(persisted(id, "done"));
      await storage.persist(persisted(id, "done"));
      expect(await completedRows(id)).toHaveLength(1);
    });

    // The trap: with the row already written in-transaction, routing
    // recordTerminal through recordEvent would insert, hit the conflict, and
    // return before forwarding -- PostHog would silently stop receiving it.
    it("recordTerminal still reaches PostHog and never writes a second row", async () => {
      const id = await job("persisting");
      const capture = vi.fn(async () => {});
      const storage = createScanExecutionStore(randomUUID(), {
        pool: runtime,
        analytics: {
          insert: async () => { throw new Error("recordTerminal must not insert"); },
          capturePostHog: capture,
          reportError: () => {},
        },
      });
      await storage.persist(persisted(id, "done"));
      await storage.recordTerminal({ jobId: id, status: "done", coverage: 0.5 });
      expect(capture).toHaveBeenCalledTimes(1);
      expect(await completedRows(id)).toHaveLength(1);
    });

    it("the terminal status and its event commit together", async () => {
      const id = await job("persisting");
      await owner.query('REVOKE INSERT ON TABLE public."scan_events" FROM sme_app_runtime');
      try {
        await expect(createScanExecutionStore(randomUUID(), { pool: runtime }).persist(persisted(id, "done"))).rejects.toThrow();
      } finally {
        await owner.query('GRANT INSERT ON TABLE public."scan_events" TO sme_app_runtime');
      }
      expect((await runtime.query("SELECT status FROM audit_jobs WHERE id=$1", [id])).rows[0].status).toBe("persisting");
    });

    it("fail() writes one failed scan_completed only when its status guard matched", async () => {
      const session = randomUUID();
      const storage = createScanExecutionStore(session, { pool: runtime });
      const running = await job("collecting");
      expect(await storage.fail({ jobId: running, category: "PROCESSOR_FAILED", correlationId: randomUUID() })).toBe(true);
      expect(await completedRows(running)).toEqual([
        { anonymous_session_id: session, event_name: "scan_completed", properties: { outcome: "failed", coverage: 0 }, dedupe_key: "terminal" },
      ]);
      const finished = await job("done");
      expect(await storage.fail({ jobId: finished, category: "PROCESSOR_FAILED", correlationId: randomUUID() })).toBe(false);
      expect(await completedRows(finished)).toEqual([]);
    });

    it("fail() leaves the job running when its event cannot be written", async () => {
      const id = await job("collecting");
      await owner.query('REVOKE INSERT ON TABLE public."scan_events" FROM sme_app_runtime');
      try {
        await expect(createScanExecutionStore(randomUUID(), { pool: runtime }).fail({ jobId: id, category: "PROCESSOR_FAILED", correlationId: randomUUID() })).rejects.toThrow();
      } finally {
        await owner.query('GRANT INSERT ON TABLE public."scan_events" TO sme_app_runtime');
      }
      expect((await runtime.query("SELECT status FROM audit_jobs WHERE id=$1", [id])).rows[0].status).toBe("collecting");
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-execution.integration.test.ts`
Expected: FAIL — no `scan_completed` rows are written by `persist()`/`fail()`.

- [ ] **Step 3: Implement**

In `lib/scan/execution-store.ts`, change the engine import from `recordEvent` to `forwardEventToPostHog`:

```ts
import {
  asClaimedJob,
  mergeFindingKeysIntoModuleResults,
  forwardEventToPostHog,
  type ScanExecutionStore,
  type AnalyticsDependencies,
  type PersistDiffDeps,
  type PersistAeoSnapshotsDeps,
} from "@sme-scanner/scan-engine";
```

and add:

```ts
import { insertScanEvent, scanCompletedEvent, SCAN_TERMINAL_DEDUPE_KEY } from "../analytics/scan-events";
```

Above the `analytics` default, add this comment (the default keeps `insert` only because `AnalyticsDependencies` requires it; this store never calls it):

```ts
  // The store never calls analytics.insert: scan_completed is written inside
  // persist()/fail(). insert remains only because AnalyticsDependencies
  // requires it and forwardEventToPostHog takes that type.
```

At the start of `persist(result)`, before `await withTransaction(`, add:

```ts
      // Validated before the transaction opens; see lib/analytics/scan-events.ts.
      const completed = scanCompletedEvent(result.status, result.coverage);
```

Inside the transaction, after the `audit_jobs` UPDATE's `try { … } catch { throw new Error("persist_job_failed"); }` block and before the closing `}, pool());`, add:

```ts
        try {
          await insertScanEvent(client, {
            jobId: result.jobId,
            anonymousSessionId,
            event: completed,
            dedupeKey: SCAN_TERMINAL_DEDUPE_KEY,
          });
        } catch {
          throw new Error("persist_event_failed");
        }
```

Replace `fail(failure)` with:

```ts
    async fail(failure) {
      const completed = scanCompletedEvent("failed", 0);
      try {
        // One statement, so one implicit transaction: the event row exists
        // only if the guarded UPDATE matched, because it selects from the
        // UPDATE's RETURNING. A job that was already terminal gets no second
        // event.
        const result = await pool().query(
          `WITH failed AS (
             UPDATE audit_jobs SET status='failed',processing_stage='failed',failure_category=$2,failure_correlation_id=$3,completed_at=now()
             WHERE id=$1 AND status IN ('collecting','scoring','persisting') RETURNING id
           ), terminal_event AS (
             INSERT INTO scan_events(job_id,anonymous_session_id,event_name,properties,dedupe_key)
             SELECT id,$4,$5,$6::jsonb,$7 FROM failed
             ON CONFLICT(job_id,anonymous_session_id,event_name,dedupe_key) DO NOTHING
           )
           SELECT id FROM failed`,
          [
            failure.jobId,
            failure.category,
            failure.correlationId,
            anonymousSessionId,
            completed.name,
            JSON.stringify(completed.properties),
            SCAN_TERMINAL_DEDUPE_KEY,
          ],
        );
        return result.rows.length > 0;
      } catch {
        throw new Error("failure_persistence_failed");
      }
    },
```

Replace `recordTerminal(transition)` with:

```ts
    async recordTerminal(transition) {
      const waitUntil = options.waitUntil ?? analytics.waitUntil;
      // The durable row was written inside persist()/fail(). Only transport is
      // left. It must not go through recordEvent: that inserts first, hits the
      // dedupe conflict, and returns before forwarding, so PostHog would
      // silently stop receiving scan_completed.
      const pending = forwardEventToPostHog(
        scanCompletedEvent(transition.status, transition.coverage),
        anonymousSessionId,
        analytics,
      );
      try {
        waitUntil?.(
          pending.then(
            () => {},
            () => {},
          ),
        );
      } catch {
        /* Closed host lifetime cannot fail a report. */
      }
      await pending;
    },
```

- [ ] **Step 4: Rewrite the two unit tests that asserted the old shape**

In `lib/scan/execution-store.test.ts`, replace the whole of `"tracks the whole pending insertion and the later PostHog tail on a failed scan"` with:

```ts
  it("tracks the PostHog tail on a failed scan and never inserts from recordTerminal", async () => {
    let captureDone!: () => void;
    const capture = new Promise<void>((resolve) => {
      captureDone = resolve;
    });
    const insert = vi.fn(async () => ({ inserted: true }));
    const waited: Promise<unknown>[] = [];
    const store = createScanExecutionStore("session", {
      analytics: {
        insert,
        capturePostHog: () => capture,
        reportError: vi.fn(),
      },
      waitUntil: (p) => {
        waited.push(p);
      },
    });
    store.claimJob = async () =>
      asClaimedJob({ id: "job", business_name: "fixture" });
    store.setStage = async () => {};
    store.persist = async () => {};
    const unavailable = {
      status: "unavailable",
      limitationCode: "NOT_MEASURED",
    } as const;
    expect(
      await createScanExecution({
        store,
        collect: async () => ({
          ig: unavailable,
          gbp: unavailable,
          aeo: unavailable,
        }),
        persistEvidence: async () => {},
      })("job"),
    ).toEqual({ status: "failed", failurePersistence: "persisted" });
    // One registration now: the database write moved into persist(), so only
    // the PostHog transport remains.
    expect(waited).toHaveLength(1);
    let settled = false;
    void waited[0].then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    captureDone();
    await waited[0];
    expect(insert).not.toHaveBeenCalled();
  });
```

Replace `"keeps registered lifetime promises resolved on database failure"` with:

```ts
  it("keeps the registered lifetime promise resolved when PostHog fails", async () => {
    const waited: Promise<unknown>[] = [];
    const report = vi.fn();
    const insert = vi.fn();
    const store = createScanExecutionStore("session", {
      analytics: {
        insert,
        capturePostHog: async () => {
          throw new Error("down");
        },
        reportError: report,
      },
      waitUntil: (p) => {
        waited.push(p);
      },
    });
    await store.recordTerminal({ jobId: "job", status: "failed", coverage: 0 });
    await expect(waited[0]).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith("provider_unavailable");
    expect(insert).not.toHaveBeenCalled();
  });
```

- [ ] **Step 5: Run everything touched**

Run: `corepack pnpm exec vitest run lib/scan/execution-store.test.ts`
Expected: PASS.

Run: `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-execution.integration.test.ts`
Expected: PASS, including 8 new cases (3 from `it.each`).

Run: `corepack pnpm typecheck` — expected clean.

- [ ] **Step 6: Mutation-check three guards**

Each must make a named test FAIL; restore after each and confirm green. Record observations.

1. Remove the `dedupe_key` argument (pass `null`) in `insertScanEvent` → `"a retried persist leaves one scan_completed…"` fails.
2. Change `recordTerminal` back to calling the engine's `recordEvent` → `"recordTerminal still reaches PostHog and never writes a second row"` fails.
3. Replace `SELECT id,$4,… FROM failed` in `fail()` with `SELECT $1::uuid,$4,…` (not derived from the UPDATE) → `"fail() writes one failed scan_completed only when its status guard matched"` fails on the already-`done` job.

- [ ] **Step 7: Commit**

```bash
git add lib/scan/execution-store.ts lib/scan/execution-store.test.ts test/integration/neon-execution.integration.test.ts
git commit -F <msgfile>   # "fix(P3.4): write scan_completed with the terminal status, forward PostHog after"
```

---

### Task 6: Extract the database-target check

**Files:**
- Create: `scripts/neon/target.ts`
- Modify: `scripts/neon/readiness.ts` (lines 28, 45–65, 90–102)
- Test: existing `tests/neon-readiness.test.ts` (must stay green unchanged)

- [ ] **Step 1: Run the existing readiness tests as the baseline**

Run: `corepack pnpm exec vitest run tests/neon-readiness.test.ts`
Expected: PASS. Record the count; it must be identical after the refactor.

- [ ] **Step 2: Create the shared module**

`scripts/neon/target.ts`:

```ts
/**
 * Database-target checks shared by every script that connects to a real
 * database (neon:readiness, report:value). One copy, because two copies of a
 * safety check drift apart. Errors carry only a fixed category -- never a URL,
 * which would include the password.
 */
export const safeName = (value: string) => /^[a-zA-Z0-9_.-]+$/.test(value);

/** A pooled Neon endpoint differs from the direct one only by -pooler. */
export const canonicalHost = (host: string) => host.replace(/-pooler(?=\.)/, "");

/** Throws "configuration" unless `db` is a credentialed postgres URL with only accepted TLS parameters. */
export function assertDatabaseUrl(db: URL): void {
  if (
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    !db.username ||
    !db.password ||
    !db.hostname ||
    !db.pathname.slice(1) ||
    db.hash
  )
    throw new Error("configuration");
  for (const [name, value] of db.searchParams) {
    if (name === "sslmode" && ["require", "verify-ca", "verify-full"].includes(value)) continue;
    if (name === "channel_binding" && ["require", "prefer"].includes(value)) continue;
    throw new Error("configuration");
  }
}

/**
 * Throws "configuration" for an unsafe host/database name, and "target" unless
 * every URL points at that host and database on one shared port.
 */
export function assertTarget(urls: URL[], host: string, database: string): void {
  if (!safeName(host) || !safeName(database)) throw new Error("configuration");
  const port = (url: URL) => url.port || "5432";
  const first = urls[0];
  if (
    !first ||
    urls.some(
      (url) =>
        port(url) !== port(first) ||
        canonicalHost(url.hostname) !== canonicalHost(host) ||
        decodeURIComponent(url.pathname.slice(1)) !== database,
    )
  )
    throw new Error("target");
}
```

- [ ] **Step 3: Use it in readiness.ts**

In `scripts/neon/readiness.ts`:

Add the import:

```ts
import { assertDatabaseUrl, assertTarget } from "./target";
```

Delete line 28 (`const safeName = …`).

Replace the two `for (const db of [app, direct])` loops (lines 45–65) with:

```ts
  for (const db of [app, direct]) assertDatabaseUrl(db);
```

Replace lines 90–102 (from `const host = env.NEON_READINESS_HOST!,` through the `throw new Error("target");`) with:

```ts
  const host = env.NEON_READINESS_HOST!,
    database = env.NEON_READINESS_DATABASE!;
  assertTarget([app, direct], host, database);
```

- [ ] **Step 4: Verify readiness behaviour is unchanged**

Run: `corepack pnpm exec vitest run tests/neon-readiness.test.ts`
Expected: PASS with the identical count from Step 1.

Run: `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-readiness.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/neon/target.ts scripts/neon/readiness.ts
git commit -F <msgfile>   # "refactor(P3.4): share the database-target check between scripts"
```

---

### Task 7: Reporting weeks

**Files:**
- Create: `scripts/report/week.ts`
- Test: `tests/value-report-week.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/value-report-week.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lastCompleteWeek, parseIsoWeek, weekContaining } from "../scripts/report/week";

const iso = (w: { start: Date; end: Date }) => ({ start: w.start.toISOString(), end: w.end.toISOString() });

describe("reporting weeks (Asia/Hong_Kong, half-open)", () => {
  it("maps an ISO week to Monday 00:00 HKT expressed in UTC", () => {
    expect(parseIsoWeek("2026-W38")).toMatchObject({ label: "2026-W38" });
    expect(iso(parseIsoWeek("2026-W38"))).toEqual({ start: "2026-09-13T16:00:00.000Z", end: "2026-09-20T16:00:00.000Z" });
  });

  it("puts an instant at exactly Monday midnight HKT in the new week only", () => {
    expect(weekContaining(new Date("2026-09-20T16:00:00.000Z")).label).toBe("2026-W39");
    expect(weekContaining(new Date("2026-09-20T15:59:59.999Z")).label).toBe("2026-W38");
  });

  it("defaults to the last complete week, never the current partial one", () => {
    // Thursday 24 Sep 2026, noon HKT, is inside W39.
    expect(lastCompleteWeek(new Date("2026-09-24T04:00:00.000Z")).label).toBe("2026-W38");
  });

  it("assigns early January to the previous ISO year when the week began in December", () => {
    // 1 Jan 2027 is a Friday: its week's Thursday is 31 Dec 2026.
    expect(weekContaining(new Date("2027-01-01T04:00:00.000Z")).label).toBe("2026-W53");
  });

  it("accepts week 53 only in years that have one", () => {
    expect(parseIsoWeek("2026-W53").label).toBe("2026-W53"); // 2026 begins on a Thursday
    expect(() => parseIsoWeek("2025-W53")).toThrow("configuration");
  });

  it.each(["2026-38", "2026-W00", "2026-W5", "W38", ""])("rejects malformed %j", (value) => {
    expect(() => parseIsoWeek(value)).toThrow("configuration");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm exec vitest run tests/value-report-week.test.ts`
Expected: FAIL — cannot resolve `../scripts/report/week`.

- [ ] **Step 3: Implement**

`scripts/report/week.ts`:

```ts
/**
 * Reporting weeks: ISO weeks as the half-open interval
 * [Monday 00:00, next Monday 00:00) in Asia/Hong_Kong. Hong Kong has observed
 * no daylight saving since 1979, so the zone is a fixed UTC+8 and the
 * boundaries are plain arithmetic. Taiwan is also UTC+8, so one boundary serves
 * both markets. Half-open, so an event at exactly midnight belongs to one week.
 */
export const REPORT_TIMEZONE = "Asia/Hong_Kong";
const OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export interface ReportWeek {
  label: string;
  /** Inclusive, UTC instant of Monday 00:00 HKT. */
  start: Date;
  /** Exclusive, UTC instant of the following Monday 00:00 HKT. */
  end: Date;
}

/** 1 = Monday … 7 = Sunday, for a "local time stored as UTC" instant. */
function isoDay(localMs: number): number {
  const day = new Date(localMs).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday of ISO week 1 (the week containing 4 January), as local-as-UTC ms. */
function week1Monday(year: number): number {
  const jan4 = Date.UTC(year, 0, 4);
  return jan4 - (isoDay(jan4) - 1) * DAY_MS;
}

/** 28 December always falls in its year's last ISO week. */
function weeksInYear(year: number): number {
  return Math.floor((Date.UTC(year, 11, 28) - week1Monday(year)) / WEEK_MS) + 1;
}

function build(year: number, week: number): ReportWeek {
  const localStart = week1Monday(year) + (week - 1) * WEEK_MS;
  return {
    label: `${year}-W${String(week).padStart(2, "0")}`,
    start: new Date(localStart - OFFSET_MS),
    end: new Date(localStart + WEEK_MS - OFFSET_MS),
  };
}

export function parseIsoWeek(value: string): ReportWeek {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) throw new Error("configuration");
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > weeksInYear(year)) throw new Error("configuration");
  return build(year, week);
}

/** The ISO week containing `instant`, judged in Hong Kong time. */
export function weekContaining(instant: Date): ReportWeek {
  const local = instant.getTime() + OFFSET_MS;
  const localMidnight = Math.floor(local / DAY_MS) * DAY_MS;
  const monday = localMidnight - (isoDay(localMidnight) - 1) * DAY_MS;
  // The ISO year is the calendar year of that week's Thursday.
  const year = new Date(monday + 3 * DAY_MS).getUTCFullYear();
  return build(year, Math.round((monday - week1Monday(year)) / WEEK_MS) + 1);
}

/** The default: the last complete week. A partial week reads as a drop that is not real. */
export function lastCompleteWeek(now: Date): ReportWeek {
  return weekContaining(new Date(weekContaining(now).start.getTime() - DAY_MS));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `corepack pnpm exec vitest run tests/value-report-week.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/report/week.ts tests/value-report-week.test.ts
git commit -F <msgfile>   # "feat(P3.4): ISO reporting weeks in Hong Kong time, half-open"
```

---

### Task 8: The report queries

**Files:**
- Create: `scripts/report/value-queries.ts`
- Test: `test/integration/neon-value-report.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

`test/integration/neon-value-report.integration.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { collectValueReport } from "../../scripts/report/value-queries";
import { parseIsoWeek } from "../../scripts/report/week";

// W38 = [2026-09-13T16:00Z, 2026-09-20T16:00Z). A past week, so no row any
// other test writes with now() can fall inside it.
const IN = "2026-09-16T04:00:00Z";
const BEFORE = "2026-09-09T04:00:00Z"; // W37
const WEEK = parseIsoWeek("2026-W38");

describe.runIf(process.env.NEON_INTEGRATION === "1")("value report", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;

  const one = async <T = Record<string, unknown>>(sql: string, values: unknown[] = []) =>
    (await runtime.query(sql, values)).rows[0] as T;
  const workspace = async (flags: { demo?: boolean; internal?: boolean } = {}) =>
    (await one<{ id: string }>("INSERT INTO workspaces(slug,market,is_demo,is_internal) VALUES($1,'hk',$2,$3) RETURNING id", [`ws-${randomUUID()}`, flags.demo ?? false, flags.internal ?? false])).id;
  const location = async (ws: string) =>
    (await one<{ id: string }>("INSERT INTO locations(workspace_id,slug,name) VALUES($1,$2,'L') RETURNING id", [ws, `l-${randomUUID()}`])).id;
  const action = async (ws: string, loc: string | null, state = "in_progress") =>
    (await one<{ id: string }>(
      `INSERT INTO actions(workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,action_state)
       VALUES($1,$2,'review-response','{}','{}','{}','low',1,'[]',5,'Live',gen_random_uuid()::text,$3) RETURNING id`, [ws, loc, state])).id;
  const version = async (ws: string, act: string, no: number, at: string) =>
    (await one<{ id: string }>("INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type,approval_state,created_at) VALUES($1,$2,$3,'Fixture','user','approved',$4) RETURNING id", [ws, act, no, at])).id;
  const delivery = async (ws: string, ver: string, counted: boolean, at: string) =>
    runtime.query("INSERT INTO deliveries(workspace_id,version_id,mode,state,counted,idempotency_key,created_at) VALUES($1,$2,'export','exported',$3,gen_random_uuid()::text,$4)", [ws, ver, counted, at]);
  const exported = async (ws: string, loc: string | null, at: string, counted = true) => {
    const act = await action(ws, loc);
    await delivery(ws, await version(ws, act, 1, at), counted, at);
  };
  const scan = async (status: string, at: string, ws: string | null = null) =>
    (await one<{ id: string }>("INSERT INTO audit_jobs(business_name,status,created_at,workspace_id) VALUES('Fixture',$1,$2,$3) RETURNING id", [status, at, ws])).id;
  const event = async (job: string, name: "scan_started" | "scan_completed") =>
    runtime.query("INSERT INTO scan_events(job_id,anonymous_session_id,event_name,properties,dedupe_key) VALUES($1,$2,$3,'{}',$4)", [job, randomUUID(), name, name === "scan_started" ? "started" : "terminal"]);

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href });

    // Two external workspaces, one demo, one internal.
    const e1 = await workspace();
    const e2 = await workspace();
    const demo = await workspace({ demo: true });
    const internal = await workspace({ internal: true });
    const l1 = await location(e1);
    const l2 = await location(e1);
    const l3 = await location(e2);

    await exported(e1, l1, IN);                 // first-ever export in W38
    await exported(e1, l2, BEFORE);             // L2 exported in W37 ...
    await exported(e1, l2, IN);                 // ... and again in W38: a repeat
    await exported(e2, l3, IN, false);          // uncounted: not a delivery
    await exported(e2, null, IN);               // workspace-wide action: no location
    await exported(demo, await location(demo), IN);
    await exported(internal, await location(internal), IN);

    await action(e1, l1, "needs_input");

    const run = await action(e2, l3);
    await runtime.query("INSERT INTO action_runs(workspace_id,action_id,agent_key,state,created_at) VALUES($1,$2,'review_reply','failed',$3),($1,$2,'review_reply','succeeded',$3)", [e2, run, IN]);

    // Scans started in W38: done+both events, partial+started only,
    // failed+none, queued+started. Plus one attached to the internal workspace
    // and one outside the week.
    const done = await scan("done", IN);
    await event(done, "scan_started");
    await event(done, "scan_completed");
    await event(await scan("partial", IN), "scan_started");
    await scan("failed", IN);
    await event(await scan("queued", IN), "scan_started");
    await scan("done", IN, internal);
    await scan("done", BEFORE);

    const user = (await one<{ id: string }>("INSERT INTO app_users(email,created_at) VALUES('a@example.test',$1) RETURNING id", [IN])).id;
    await runtime.query("INSERT INTO app_users(email,created_at) VALUES('b@example.test',$1),('c@example.test',$2)", [IN, BEFORE]);
    await runtime.query("INSERT INTO workspace_claim_events(workspace_id,matched_location_id,claimed_by_user_id,created_at) VALUES($1,'locations/1',$2,$3)", [e1, user, IN]);
    await runtime.query("INSERT INTO audit_events(workspace_id,actor_type,event,created_at) VALUES($1,'user','workspace.assigned',$2),($3,'user','workspace.assigned',$2)", [e2, IN, internal]);
  });

  afterAll(async () => {
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  const report = async () => {
    const client: PoolClient = await runtime.connect();
    try {
      await client.query("BEGIN TRANSACTION READ ONLY");
      return await collectValueReport(client, WEEK);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  };

  it("counts distinct locations with a counted delivery, excluding demo and internal", async () => {
    expect((await report()).primary).toEqual({
      locations: 2,              // L1, L2 -- not uncounted L3, demo or internal
      eligibleLocations: 3,      // L1, L2, L3
      workspaces: 2,             // E1, and E2 through its location-less delivery
      eligibleWorkspaces: 2,
      deliveriesWithoutLocation: 1,
    });
  });

  it("states how many workspaces were excluded", async () => {
    expect((await report()).exclusions).toEqual({ demoWorkspaces: 1, internalWorkspaces: 1 });
  });

  it("separates first, repeat and draft steps per location", async () => {
    expect((await report()).deliveryFunnel).toEqual({
      firstDraft: 2,             // L1, L3 -- L2's first version was in W37
      firstApprovedExport: 1,    // L1
      repeatWeeklyExport: 1,     // L2
    });
  });

  it("reads scans from audit_jobs, excluding scans claimed by an internal workspace", async () => {
    expect((await report()).scans).toEqual({ started: 4, completedFull: 1, completedPartial: 1, failed: 1, inProgress: 1 });
  });

  it("reconciles every job against scan_events, internal included", async () => {
    expect((await report()).reconciliation).toEqual({ jobsStarted: 5, startedEvents: 3, jobsTerminal: 4, completedEvents: 1 });
  });

  it("splits supported and assisted claims and excludes internal ones", async () => {
    expect((await report()).claims).toEqual({ supported: 1, assisted: 1 });
  });

  it("counts first sign-ins, task failures and current missing input", async () => {
    const result = await report();
    expect(result.signIns).toEqual({ first: 2 });
    expect(result.tasks).toEqual({ runs: 2, failed: 1, missingInputNow: 1 });
  });

  it("never reports paid conversion as a number", async () => {
    expect((await report()).paidConversion).toEqual({ measurable: false, reason: "billing unavailable (DEC-09)" });
  });

  it("runs under a read-only transaction that Postgres enforces", async () => {
    const client = await runtime.connect();
    try {
      await client.query("BEGIN TRANSACTION READ ONLY");
      await expect(client.query("INSERT INTO app_users(email) VALUES('x@example.test')")).rejects.toMatchObject({ code: "25006" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-value-report.integration.test.ts`
Expected: FAIL — cannot resolve `../../scripts/report/value-queries`.

- [ ] **Step 3: Implement**

`scripts/report/value-queries.ts`:

```ts
import type { PoolClient } from "pg";
import { REPORT_TIMEZONE, type ReportWeek } from "./week";

/**
 * Every number comes from an authoritative business table. scan_events is read
 * only for reconciliation, never for a count the business tables can supply.
 * $1 is the week start (inclusive) and $2 the end (exclusive).
 */
export const LIMITATIONS = [
  "Sign-in and claim started are not durably recorded; only assisted claims have a request timestamp.",
  "Public-funnel scans cannot be classified internal until claimed, so staff test scans count in the scan totals.",
  "First sign-ins read app_users, which is not workspace-scoped: staff sign-ins are included.",
  "Missing input is a snapshot at report time, not a count for the week.",
  "Reconciliation covers every job, internal included: it checks the pipeline, not the customers.",
] as const;

export interface ValueReport {
  week: { label: string; start: string; end: string; timezone: typeof REPORT_TIMEZONE };
  exclusions: { demoWorkspaces: number; internalWorkspaces: number };
  primary: { locations: number; eligibleLocations: number; workspaces: number; eligibleWorkspaces: number; deliveriesWithoutLocation: number };
  scans: { started: number; completedFull: number; completedPartial: number; failed: number; inProgress: number };
  signIns: { first: number };
  claims: { supported: number; assisted: number };
  deliveryFunnel: { firstDraft: number; firstApprovedExport: number; repeatWeeklyExport: number };
  tasks: { runs: number; failed: number; missingInputNow: number };
  paidConversion: { measurable: false; reason: string };
  reconciliation: { jobsStarted: number; startedEvents: number; jobsTerminal: number; completedEvents: number };
  limitations: readonly string[];
}

type Row = Record<string, number>;
type Client = Pick<PoolClient, "query">;

/** Workspace eligibility, for a join aliased `w`. */
const ELIGIBLE = "NOT w.is_demo AND NOT w.is_internal";

/** deliveries → output_versions → actions, tenant-matched at every hop. */
const DELIVERY_JOIN = `
  FROM deliveries d
  JOIN output_versions v ON v.id = d.version_id AND v.workspace_id = d.workspace_id
  JOIN actions a ON a.id = v.action_id AND a.workspace_id = v.workspace_id
  JOIN workspaces w ON w.id = d.workspace_id`;

async function row(client: Client, sql: string, values: unknown[] = []): Promise<Row> {
  return ((await client.query(sql, values)).rows[0] ?? {}) as Row;
}

export async function collectValueReport(client: Client, week: ReportWeek): Promise<ValueReport> {
  const window = [week.start.toISOString(), week.end.toISOString()];

  const exclusions = await row(client, `
    SELECT count(*) FILTER (WHERE is_demo)::int AS demo,
           count(*) FILTER (WHERE is_internal AND NOT is_demo)::int AS internal
    FROM workspaces`);

  // count(DISTINCT location_id) ignores NULLs, so a location-less delivery is
  // excluded from the location count and still counted for its workspace.
  const primary = await row(client, `
    SELECT count(DISTINCT a.location_id)::int AS locations,
           count(DISTINCT d.workspace_id)::int AS workspaces,
           count(*) FILTER (WHERE a.location_id IS NULL)::int AS without_location
    ${DELIVERY_JOIN}
    WHERE d.counted AND d.created_at >= $1 AND d.created_at < $2 AND ${ELIGIBLE}`, window);

  const eligible = await row(client, `
    SELECT (SELECT count(*)::int FROM workspaces w WHERE ${ELIGIBLE}) AS workspaces,
           (SELECT count(*)::int FROM locations l JOIN workspaces w ON w.id = l.workspace_id WHERE ${ELIGIBLE}) AS locations`);

  // A cohort: scans started this week, with their status as of report time.
  const scans = await row(client, `
    SELECT count(*)::int AS started,
           count(*) FILTER (WHERE j.status = 'done')::int AS full,
           count(*) FILTER (WHERE j.status = 'partial')::int AS partial,
           count(*) FILTER (WHERE j.status = 'failed')::int AS failed,
           count(*) FILTER (WHERE j.status NOT IN ('done','partial','failed'))::int AS in_progress
    FROM audit_jobs j
    LEFT JOIN workspaces w ON w.id = j.workspace_id
    WHERE j.created_at >= $1 AND j.created_at < $2
      AND NOT coalesce(w.is_demo OR w.is_internal, false)`, window);

  const signIns = await row(client,
    "SELECT count(*)::int AS first FROM app_users WHERE created_at >= $1 AND created_at < $2", window);

  const claims = await row(client, `
    SELECT (SELECT count(DISTINCT e.workspace_id)::int FROM workspace_claim_events e
              JOIN workspaces w ON w.id = e.workspace_id
             WHERE e.created_at >= $1 AND e.created_at < $2 AND ${ELIGIBLE}) AS supported,
           (SELECT count(DISTINCT e.workspace_id)::int FROM audit_events e
              JOIN workspaces w ON w.id = e.workspace_id
             WHERE e.event = 'workspace.assigned' AND e.created_at >= $1 AND e.created_at < $2 AND ${ELIGIBLE}) AS assisted`, window);

  const funnel = await row(client, `
    SELECT
      (SELECT count(*)::int FROM (
         SELECT min(v.created_at) AS first_at
         FROM output_versions v
         JOIN actions a ON a.id = v.action_id AND a.workspace_id = v.workspace_id
         JOIN workspaces w ON w.id = v.workspace_id
         WHERE a.location_id IS NOT NULL AND ${ELIGIBLE}
         GROUP BY a.location_id) f
       WHERE f.first_at >= $1 AND f.first_at < $2) AS first_draft,
      (SELECT count(*)::int FROM (
         SELECT min(d.created_at) AS first_at
         ${DELIVERY_JOIN}
         WHERE d.counted AND a.location_id IS NOT NULL AND ${ELIGIBLE}
         GROUP BY a.location_id) f
       WHERE f.first_at >= $1 AND f.first_at < $2) AS first_export,
      (SELECT count(DISTINCT a.location_id)::int
         ${DELIVERY_JOIN}
         WHERE d.counted AND d.created_at >= $1 AND d.created_at < $2
           AND a.location_id IS NOT NULL AND ${ELIGIBLE}
           AND EXISTS (
             SELECT 1 FROM deliveries d2
             JOIN output_versions v2 ON v2.id = d2.version_id AND v2.workspace_id = d2.workspace_id
             JOIN actions a2 ON a2.id = v2.action_id AND a2.workspace_id = v2.workspace_id
             WHERE d2.counted AND a2.location_id = a.location_id AND d2.created_at < $1)) AS repeat_export`, window);

  const tasks = await row(client, `
    SELECT
      (SELECT count(*)::int FROM action_runs r JOIN workspaces w ON w.id = r.workspace_id
        WHERE r.created_at >= $1 AND r.created_at < $2 AND ${ELIGIBLE}) AS runs,
      (SELECT count(*)::int FROM action_runs r JOIN workspaces w ON w.id = r.workspace_id
        WHERE r.state IN ('failed','timed_out') AND r.created_at >= $1 AND r.created_at < $2 AND ${ELIGIBLE}) AS failed,
      (SELECT count(*)::int FROM actions a JOIN workspaces w ON w.id = a.workspace_id
        WHERE a.action_state = 'needs_input' AND ${ELIGIBLE}) AS missing_input`, window);

  // Keyed by job creation week so both sides describe the same cohort, and
  // counted by DISTINCT job so a duplicate event cannot hide a missing one.
  const reconciliation = await row(client, `
    SELECT
      (SELECT count(*)::int FROM audit_jobs WHERE created_at >= $1 AND created_at < $2) AS jobs_started,
      (SELECT count(DISTINCT e.job_id)::int FROM scan_events e JOIN audit_jobs j ON j.id = e.job_id
        WHERE e.event_name = 'scan_started' AND j.created_at >= $1 AND j.created_at < $2) AS started_events,
      (SELECT count(*)::int FROM audit_jobs
        WHERE created_at >= $1 AND created_at < $2 AND status IN ('done','partial','failed')) AS jobs_terminal,
      (SELECT count(DISTINCT e.job_id)::int FROM scan_events e JOIN audit_jobs j ON j.id = e.job_id
        WHERE e.event_name = 'scan_completed' AND j.created_at >= $1 AND j.created_at < $2) AS completed_events`, window);

  return {
    week: { label: week.label, start: window[0]!, end: window[1]!, timezone: REPORT_TIMEZONE },
    exclusions: { demoWorkspaces: exclusions.demo ?? 0, internalWorkspaces: exclusions.internal ?? 0 },
    primary: {
      locations: primary.locations ?? 0,
      eligibleLocations: eligible.locations ?? 0,
      workspaces: primary.workspaces ?? 0,
      eligibleWorkspaces: eligible.workspaces ?? 0,
      deliveriesWithoutLocation: primary.without_location ?? 0,
    },
    scans: {
      started: scans.started ?? 0,
      completedFull: scans.full ?? 0,
      completedPartial: scans.partial ?? 0,
      failed: scans.failed ?? 0,
      inProgress: scans.in_progress ?? 0,
    },
    signIns: { first: signIns.first ?? 0 },
    claims: { supported: claims.supported ?? 0, assisted: claims.assisted ?? 0 },
    deliveryFunnel: {
      firstDraft: funnel.first_draft ?? 0,
      firstApprovedExport: funnel.first_export ?? 0,
      repeatWeeklyExport: funnel.repeat_export ?? 0,
    },
    tasks: { runs: tasks.runs ?? 0, failed: tasks.failed ?? 0, missingInputNow: tasks.missing_input ?? 0 },
    paidConversion: { measurable: false, reason: "billing unavailable (DEC-09)" },
    reconciliation: {
      jobsStarted: reconciliation.jobs_started ?? 0,
      startedEvents: reconciliation.started_events ?? 0,
      jobsTerminal: reconciliation.jobs_terminal ?? 0,
      completedEvents: reconciliation.completed_events ?? 0,
    },
    limitations: LIMITATIONS,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-value-report.integration.test.ts`
Expected: PASS, 9 tests. If an expected number is off, re-derive it from the seed comments before changing either side — the comments are the specification of each number.

- [ ] **Step 5: Mutation-check every exclusion**

Each must make a named test FAIL. Restore after each, confirm green, record observations:

1. Change `ELIGIBLE` to `"NOT w.is_demo"` (drop internal) → `"counts distinct locations…"` fails.
2. Change `ELIGIBLE` to `"NOT w.is_internal"` (drop demo) → the same test fails.
3. Remove `d.counted AND` from the primary query → it fails (uncounted L3 appears).
4. Remove `AND a.location_id IS NOT NULL` from the `first_export` subquery → `"separates first, repeat and draft steps"` fails.
5. Replace `count(DISTINCT e.job_id)` with `count(*)` in `started_events`, and in the seed add a second `scan_started` row for the `done` job → `"reconciles every job…"` fails. (Remove the extra seed row when restoring.)

- [ ] **Step 6: Commit**

```bash
git add scripts/report/value-queries.ts test/integration/neon-value-report.integration.test.ts
git commit -F <msgfile>   # "feat(P3.4): compute the value metric and funnel from authoritative tables"
```

---

### Task 9: Formatting, the CLI and the script entry

**Files:**
- Create: `scripts/report/format.ts`, `scripts/report/value.ts`
- Modify: `package.json` (scripts block)
- Test: `tests/value-report-cli.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/value-report-cli.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { configure, ReportError } from "../scripts/report/value";
import { formatText } from "../scripts/report/format";
import type { ValueReport } from "../scripts/report/value-queries";

const URL_ = "postgresql://app:pw@ep-cool-name-pooler.ap-southeast-1.aws.neon.tech/smeassistant?sslmode=require";
const env = { DATABASE_URL: URL_, VALUE_REPORT_HOST: "ep-cool-name.ap-southeast-1.aws.neon.tech", VALUE_REPORT_DATABASE: "smeassistant" };
const NOW = new Date("2026-09-24T04:00:00.000Z");

const category = (run: () => unknown) => {
  try { run(); } catch (error) { return error instanceof ReportError ? error.category : "not a ReportError"; }
  return "did not throw";
};

describe("configure", () => {
  it("accepts a matching target across the -pooler suffix and defaults to the last complete week", () => {
    const config = configure(env, [], NOW);
    expect(config.week.label).toBe("2026-W38");
    expect(config.json).toBe(false);
  });

  it("refuses to run without an explicit target", () => {
    expect(category(() => configure({ DATABASE_URL: URL_ }, [], NOW))).toBe("configuration");
  });

  it("refuses a DATABASE_URL pointing somewhere other than the named target", () => {
    expect(category(() => configure({ ...env, VALUE_REPORT_HOST: "ep-other.aws.neon.tech" }, [], NOW))).toBe("target");
    expect(category(() => configure({ ...env, VALUE_REPORT_DATABASE: "other" }, [], NOW))).toBe("target");
  });

  it("never attaches the unparseable URL as a cause, because it would carry the password", () => {
    try {
      configure({ ...env, DATABASE_URL: "not a url pw=hunter2" }, [], NOW);
    } catch (error) {
      expect(error).toBeInstanceOf(ReportError);
      expect((error as ReportError).cause).toBeUndefined();
      return;
    }
    throw new Error("expected refusal");
  });

  it("parses --week and --json, and ignores the -- pnpm may pass through", () => {
    const config = configure(env, ["--", "--week", "2026-W30", "--json"], NOW);
    expect(config.week.label).toBe("2026-W30");
    expect(config.json).toBe(true);
  });

  it.each([["--week"], ["--week", "2026-30"], ["--unknown"]])("refuses %j", (...argv) => {
    expect(category(() => configure(env, argv, NOW))).toBe("configuration");
  });
});

const REPORT: ValueReport = {
  week: { label: "2026-W38", start: "2026-09-13T16:00:00.000Z", end: "2026-09-20T16:00:00.000Z", timezone: "Asia/Hong_Kong" },
  exclusions: { demoWorkspaces: 1, internalWorkspaces: 1 },
  primary: { locations: 2, eligibleLocations: 3, workspaces: 2, eligibleWorkspaces: 2, deliveriesWithoutLocation: 1 },
  scans: { started: 4, completedFull: 1, completedPartial: 1, failed: 1, inProgress: 1 },
  signIns: { first: 2 },
  claims: { supported: 1, assisted: 1 },
  deliveryFunnel: { firstDraft: 2, firstApprovedExport: 1, repeatWeeklyExport: 1 },
  tasks: { runs: 2, failed: 1, missingInputNow: 1 },
  paidConversion: { measurable: false, reason: "billing unavailable (DEC-09)" },
  reconciliation: { jobsStarted: 5, startedEvents: 3, jobsTerminal: 4, completedEvents: 1 },
  limitations: ["Example limitation."],
};

describe("formatText", () => {
  const text = formatText(REPORT);

  it("leads with the primary metric and its denominator", () => {
    expect(text).toContain("2026-W38");
    expect(text).toMatch(/Locations\s+2 of 3 eligible/);
    expect(text).toMatch(/Workspaces\s+2 of 2 eligible/);
  });

  it("shows the week in Hong Kong time with an exclusive end", () => {
    expect(text).toContain("2026-09-14 00:00 → 2026-09-21 00:00 HKT (end exclusive)");
  });

  it("prints reconciliation gaps as numbers", () => {
    expect(text).toMatch(/scan_started\s+3 of 5 jobs \(gap 2\)/);
    expect(text).toMatch(/scan_completed\s+1 of 4 terminal jobs \(gap 3\)/);
  });

  it("says paid conversion is not measurable instead of printing zero", () => {
    expect(text).toContain("not measurable — billing unavailable (DEC-09)");
  });

  it("prints every limitation", () => {
    expect(text).toContain("Example limitation.");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm exec vitest run tests/value-report-cli.test.ts`
Expected: FAIL — cannot resolve `../scripts/report/value`.

- [ ] **Step 3: Implement the formatter**

`scripts/report/format.ts`:

```ts
import type { ValueReport } from "./value-queries";

/** Counts only: no emails, business names or workspace slugs, by construction. */
const OFFSET_MS = 8 * 60 * 60 * 1000;
const hkt = (iso: string) => new Date(Date.parse(iso) + OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
const line = (label: string, value: string, note = "") => `  ${label.padEnd(26)}${value.padEnd(28)}${note}`.trimEnd();
const gap = (have: number, of: number) => `(gap ${of - have})`;

export function formatText(r: ValueReport): string {
  return [
    `Weekly value report · ${r.week.label} · ${r.week.timezone}`,
    `Window: ${hkt(r.week.start)} → ${hkt(r.week.end)} HKT (end exclusive)`,
    `Excluded: ${r.exclusions.demoWorkspaces} demo, ${r.exclusions.internalWorkspaces} internal workspace(s)`,
    "",
    "PRIMARY — businesses completing a useful approved delivery",
    line("Locations", `${r.primary.locations} of ${r.primary.eligibleLocations} eligible`, "deliveries.counted: first export of an approved version"),
    line("Workspaces", `${r.primary.workspaces} of ${r.primary.eligibleWorkspaces} eligible`, "account metric, reported separately"),
    line("Deliveries with no location", `${r.primary.deliveriesWithoutLocation}`, "workspace-wide actions; in the workspace count only"),
    "",
    "SCANS — cohort started this week, status as of now (audit_jobs)",
    line("Started", `${r.scans.started}`),
    line("Completed, full", `${r.scans.completedFull} of ${r.scans.started}`),
    line("Completed, partial", `${r.scans.completedPartial} of ${r.scans.started}`),
    line("Failed", `${r.scans.failed} of ${r.scans.started}`),
    line("Still in progress", `${r.scans.inProgress} of ${r.scans.started}`),
    "",
    "OWNERS",
    line("First sign-ins", `${r.signIns.first}`, "app_users"),
    line("Claims, supported", `${r.claims.supported}`, "workspace_claim_events (Google-verified)"),
    line("Claims, assisted", `${r.claims.assisted}`, "audit_events workspace.assigned"),
    "",
    "WORK — per location",
    line("First real draft", `${r.deliveryFunnel.firstDraft}`, "earliest output_versions row falls in the week"),
    line("First approved export", `${r.deliveryFunnel.firstApprovedExport}`, "earliest counted delivery falls in the week"),
    line("Repeat weekly export", `${r.deliveryFunnel.repeatWeeklyExport}`, "counted this week and in an earlier week"),
    line("Task runs failed", `${r.tasks.failed} of ${r.tasks.runs}`, "action_runs failed or timed out"),
    line("Missing input (now)", `${r.tasks.missingInputNow}`, "snapshot at report time"),
    line("Paid conversion", `not measurable — ${r.paidConversion.reason}`),
    "",
    "RECONCILIATION — every job created this week, internal included",
    line("scan_started", `${r.reconciliation.startedEvents} of ${r.reconciliation.jobsStarted} jobs ${gap(r.reconciliation.startedEvents, r.reconciliation.jobsStarted)}`),
    line("scan_completed", `${r.reconciliation.completedEvents} of ${r.reconciliation.jobsTerminal} terminal jobs ${gap(r.reconciliation.completedEvents, r.reconciliation.jobsTerminal)}`),
    "",
    "LIMITATIONS",
    ...r.limitations.map((text) => `  - ${text}`),
    "",
    "No targets: there is no measured baseline yet.",
  ].join("\n");
}
```

- [ ] **Step 4: Implement the CLI**

`scripts/report/value.ts`:

```ts
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { assertDatabaseUrl, assertTarget } from "../neon/target";
import { lastCompleteWeek, parseIsoWeek, type ReportWeek } from "./week";
import { collectValueReport, type ValueReport } from "./value-queries";
import { formatText } from "./format";

type Env = Record<string, string | undefined>;
export type ReportFailure = "configuration" | "target" | "query_failed";

/**
 * Fixed categories, no connection strings or SQL in the message. The cause is
 * kept for the operator's terminal -- this is a CLI they run themselves -- except
 * where the cause could itself contain the URL and therefore the password.
 */
export class ReportError extends Error {
  readonly category: ReportFailure;
  constructor(category: ReportFailure, options?: { cause?: unknown }) {
    super(category, options);
    this.name = "ReportError";
    this.category = category;
  }
}

export interface ReportConfig {
  url: string;
  target: { host: string; database: string };
  week: ReportWeek;
  json: boolean;
}

export function configure(env: Env, argv: string[], now: Date = new Date()): ReportConfig {
  const raw = env.DATABASE_URL?.trim();
  const host = env.VALUE_REPORT_HOST?.trim();
  const database = env.VALUE_REPORT_DATABASE?.trim();
  if (!raw || !host || !database) throw new ReportError("configuration");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // No cause: Node attaches the unparseable input to the error, and that
    // input is the connection string.
    throw new ReportError("configuration");
  }
  try {
    assertDatabaseUrl(url);
    assertTarget([url], host, database);
  } catch (cause) {
    throw new ReportError(cause instanceof Error && cause.message === "target" ? "target" : "configuration", { cause });
  }

  let week = lastCompleteWeek(now);
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--week") {
      const value = argv[++i];
      if (!value) throw new ReportError("configuration");
      try {
        week = parseIsoWeek(value);
      } catch (cause) {
        throw new ReportError("configuration", { cause });
      }
      continue;
    }
    throw new ReportError("configuration");
  }
  return { url: raw, target: { host, database }, week, json };
}

export async function runReport(
  config: ReportConfig,
  connect: (url: string) => Pick<Pool, "connect" | "end"> = (url) =>
    new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000, query_timeout: 30_000 }),
): Promise<ValueReport> {
  const pool = connect(config.url);
  try {
    const client = await pool.connect();
    try {
      // Enforced by Postgres: any write inside this transaction is rejected.
      await client.query("BEGIN TRANSACTION READ ONLY");
      // A URL can parse correctly and still land elsewhere; neon:readiness
      // makes the same check after connecting.
      const identity = (await client.query<{ database: string }>("SELECT current_database() AS database")).rows[0];
      if (identity?.database !== config.target.database) throw new ReportError("target");
      return await collectValueReport(client, config.week);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  } catch (cause) {
    if (cause instanceof ReportError) throw cause;
    throw new ReportError("query_failed", { cause });
  } finally {
    await pool.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = configure(process.env, process.argv.slice(2));
    const report = await runReport(config);
    console.log(config.json ? JSON.stringify(report, null, 2) : formatText(report));
  } catch (error) {
    console.error(`report:value failed: ${error instanceof ReportError ? error.category : "query_failed"}`);
    if (error instanceof Error && error.cause) console.error(error.cause);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 5: Add the script**

In `package.json` `"scripts"`, directly after `"neon:readiness": "tsx scripts/neon/readiness.ts",`:

```json
    "report:value": "tsx scripts/report/value.ts",
```

- [ ] **Step 6: Run to verify it passes**

Run: `corepack pnpm exec vitest run tests/value-report-cli.test.ts tests/value-report-week.test.ts`
Expected: PASS.

Run the refusal path end to end without any database: `corepack pnpm report:value`
Expected: exit code 1 and exactly `report:value failed: configuration` on stderr (no `DATABASE_URL` is set in this worktree).

- [ ] **Step 7: Lint, typecheck, commit**

Run: `corepack pnpm lint` — expected 30 warnings / 0 errors, unchanged. Any new warning is this task's and must be fixed.
Run: `corepack pnpm typecheck` — expected clean.

```bash
git add scripts/report/format.ts scripts/report/value.ts tests/value-report-cli.test.ts package.json
git commit -F <msgfile>   # "feat(P3.4): report:value CLI, read-only and target-checked"
```

---

### Task 10: Full verification and the phase record

**Files:**
- Modify: `docs/implementation/owner-platform-v1/PHASE-3-REPORT.md`, `docs/implementation/owner-platform-v1/PHASE-3-TEST-RESULTS.md`

- [ ] **Step 1: Run every gate sequentially, recording exact output and exit codes**

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm test:integration
corepack pnpm db:verify
```

Expected: typecheck 0; lint 0 with 30 warnings / 0 errors; `test` and `test:integration` 0 with counts above the pre-P3.4 baselines of **319 files / 3,311 tests** and **29 files / 301 tests** (record the observed deltas and explain each); db:verify 0 with `columns: 418`.

`build` is expected to **fail** on this Windows machine with the standing Turbopack/`radix-ui` module-resolution cascade. Record it as **blocked**, not failed, and do not substitute `--webpack` into the gate. Run `npx next build --webpack` separately as a labelled diagnostic.

If a unit run shows unrelated flaky failures (version-RPC tests have failed under load before), re-run once and record both results; never rerun until green silently.

- [ ] **Step 2: Append a "P3.4 — reliable events and the value metric" section to both documents**

Match the structure and precision of the existing P3.1/P3.2/verifier sections: baseline commit, what changed with file citations, exact commands with exits and counts, mutation checks performed and their observed results. Use **passed / failed / blocked / not run** accurately and keep *implemented*, *locally verified* and *hosted verified* distinct.

Include a **runbook** subsection with exactly this, in order:

1. Apply `neon/migrations/0008_workspace_internal.sql` to the target database (DEC-11 — owner action). Until then `report:value` fails with *column does not exist*.
2. Mark staff and test workspaces: `UPDATE workspaces SET is_internal = true WHERE slug = 'nadagogo';`
3. Deploy the code.
4. Run `VALUE_REPORT_HOST=<host> VALUE_REPORT_DATABASE=<db> corepack pnpm report:value` (optionally `-- --week YYYY-Www`). The reconciliation gaps for weeks **after** the deploy should approach zero; earlier weeks keep showing the historical loss.

Include, stated plainly, what this does **not** prove:

1. Production reliability — needs 0008, a deploy, and a near-zero reconciliation gap observed on real traffic. Until then: locally verified, not hosted verified.
2. Past losses stay lost. Historical `scan_events` remain undercounted; the primary metric is unaffected because it never reads `scan_events`.
3. PostHog delivery remains best-effort.
4. Sign-in and claim *started* remain unmeasured; scan totals include staff test scans; paid conversion is not measurable.
5. Phase 3's hosted acceptance gate — still blocked by the unresolved production `home lookup failed` 500.

- [ ] **Step 3: Commit**

```bash
git add docs/implementation/owner-platform-v1
git commit -F <msgfile>   # "docs(P3.4): record the reliable-events and value-metric phase report"
```

---

## Verification checklist

- [ ] `scan_started` exists exactly when its job does — rollback leaves neither; a failed event write leaves no job
- [ ] `scan_started` is written for rescans as well as the public funnel
- [ ] `scan_completed` is written by `persist()` for **all three** outcomes, and by `fail()` only when its guard matched
- [ ] A retried `persist()` produces one row (dedupe key conflicts)
- [ ] `recordTerminal` reaches PostHog and never inserts
- [ ] `scan/start` forwards to PostHog through `after()`, not a bare promise
- [ ] `packages/scan-engine` is unchanged (`git diff origin/main -- packages/scan-engine` is empty)
- [ ] The primary metric counts distinct locations with a `counted` delivery; demo and internal excluded; workspaces separate; NULL-location deliveries on their own line
- [ ] Every exclusion was mutation-checked and each mutation failed a named test
- [ ] The report runs `READ ONLY`, refuses an unconfirmed or mismatched target, and never prints a connection string
- [ ] `neon:readiness` behaviour is unchanged after the target-check extraction
- [ ] Paid conversion prints as not measurable, never `0`
